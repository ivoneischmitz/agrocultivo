import {
  agora,
  anotarBusca,
  contagens,
  db,
  esquecerBuscas,
  guardarDoServidor,
  marcarEnviado,
  totalPendente,
  ultimaBusca,
  type LinhaSync,
} from '@/lib/dbLocal.native';
import { supabase } from '@/lib/supabase';

// Sincronização entre a cópia local (lib/dbLocal.native.ts) e o Supabase.
//
// Duas metades:
//
//   subir   — manda o que foi criado ou alterado sem rede. Vai primeiro, para
//             uma alteração feita aqui não ser sobrescrita pelo que vem de lá.
//   baixar  — traz o que mudou desde a última vez, por updated_at, incluindo o
//             que foi excluído (deleted_at), que de outro jeito o aparelho
//             nunca saberia que sumiu.
//
// Conflito: vence a última gravação. Duas pessoas raramente mexem na mesma
// despesa no mesmo minuto, e o preço de errar aqui é um valor desatualizado,
// não um dado perdido — o que foi lançado continua no servidor.

export type EstadoSync = 'parado' | 'sincronizando' | 'erro';

type Ouvinte = (estado: EstadoSync, pendentes: number) => void;

const ouvintes = new Set<Ouvinte>();
let estado: EstadoSync = 'parado';
let rodando: Promise<void> | null = null;

export function ouvirSync(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  fn(estado, totalPendente());
  return () => ouvintes.delete(fn);
}

function avisar(novo: EstadoSync) {
  estado = novo;
  const pendentes = totalPendente();
  for (const fn of ouvintes) fn(novo, pendentes);
}

// ── Subir ────────────────────────────────────────────────────────────────────

async function subirCultivos(): Promise<void> {
  const linhas = db.getAllSync<Record<string, unknown>>('select * from cultivos where pendente = 1');
  for (const c of linhas) {
    const { error } = await supabase.from('cultivos').upsert({
      id: c.id,
      fazenda_id: c.fazenda_id,
      nome_cultura: c.nome_cultura,
      ano: c.ano,
      localidade: c.localidade,
      area_hectares: c.area_hectares,
      numero_sacas: c.numero_sacas,
      valor_gerado: c.valor_gerado,
      finalizado: c.finalizado === 1,
      latitude: c.latitude,
      longitude: c.longitude,
      data_plantio: c.data_plantio,
      ciclo_dias: c.ciclo_dias,
      deleted_at: c.deleted_at,
    });
    if (error) throw error;
    marcarEnviado('cultivos', c.id as string);
  }
}

async function subirMovimentacoes(): Promise<void> {
  const linhas = db.getAllSync<Record<string, unknown>>('select * from movimentacoes where pendente = 1');
  for (const m of linhas) {
    if (m.deleted_at) {
      const { error } = await supabase
        .from('movimentacoes')
        .update({ deleted_at: m.deleted_at })
        .eq('id', m.id as string);
      if (error) throw error;
    } else {
      // A mesma função que a web usa: grava cabeçalho e itens numa transação
      // só, e aceita o id vindo daqui (insert ... on conflict).
      const itens = db.getAllSync<Record<string, unknown>>(
        'select * from movimentacao_itens where movimentacao_id = ? and deleted_at is null',
        m.id as string,
      );
      const { error } = await supabase.rpc('salvar_movimentacao', {
        p_id: m.id,
        p_cultivo_id: m.cultivo_id,
        p_tipo: m.tipo,
        p_descricao: m.descricao,
        p_data: m.data,
        p_categoria: m.categoria,
        p_itens: itens.map((i) => ({
          id: i.id,
          descricao: i.descricao,
          unidade: i.unidade,
          quantidade: i.quantidade,
          valor: i.valor,
        })),
      });
      if (error) throw error;
    }
    marcarEnviado('movimentacoes', m.id as string);
  }
}

async function subirChuvas(): Promise<void> {
  const linhas = db.getAllSync<Record<string, unknown>>('select * from pluviometria where pendente = 1');
  for (const p of linhas) {
    const { error } = await supabase.from('pluviometria').upsert({
      id: p.id,
      fazenda_id: p.fazenda_id,
      cultivo_id: p.cultivo_id,
      data: p.data,
      milimetros: p.milimetros,
      observacao: p.observacao,
      deleted_at: p.deleted_at,
    });
    if (error) throw error;
    marcarEnviado('pluviometria', p.id as string);
  }
}

// ── Baixar ───────────────────────────────────────────────────────────────────

// Tabelas trazidas do servidor. `pendente` diz quais podem ter alteração local
// esperando para subir — nessas, o que veio de lá não passa por cima.
const TABELAS: { nome: string; colunas: string; pendente: boolean }[] = [
  { nome: 'fazendas', colunas: 'id, nome, nome_sitio, proprietario, uf, municipio, dono_id, updated_at, deleted_at', pendente: false },
  { nome: 'cultivos', colunas: '*', pendente: true },
  { nome: 'movimentacoes', colunas: '*', pendente: true },
  { nome: 'movimentacao_itens', colunas: '*', pendente: false },
  { nome: 'movimentacao_anexos', colunas: '*', pendente: false },
  { nome: 'pluviometria', colunas: '*', pendente: true },
  { nome: 'fotos_cultivo', colunas: '*', pendente: false },
];

// Colunas que só existem de um lado; o resto atravessa igual.
const SO_LOCAL = new Set(['pendente']);

function paraLocal(tabela: string, linha: Record<string, unknown>): LinhaSync {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(linha)) {
    if (SO_LOCAL.has(k)) continue;
    saida[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  return saida as LinhaSync;
}

async function baixar(fazendaId: string): Promise<void> {
  for (const t of TABELAS) {
    const desde = ultimaBusca(t.nome);
    // Uma folga de um minuto cobre a diferença de relógio entre o servidor e o
    // aparelho: é melhor rebaixar uma linha do que perdê-la.
    const inicio = new Date(Date.now() - 60_000).toISOString();

    let q = supabase.from(t.nome).select(t.colunas);
    q = t.nome === 'fazendas' ? q.eq('id', fazendaId) : q.eq('fazenda_id', fazendaId);
    if (desde) q = q.gt('updated_at', desde);

    const { data, error } = await q;
    if (error) throw error;

    for (const linha of (data ?? []) as unknown as Record<string, unknown>[]) {
      guardarDoServidor(t.nome, paraLocal(t.nome, linha), t.pendente);
    }
    // Aparece no log do aparelho (adb logcat). Sem isso, uma sincronização que
    // não traz nada é indistinguível de uma que não rodou.
    console.log(`sync baixou ${(data ?? []).length} de ${t.nome} (desde ${desde ?? 'sempre'})`);
    anotarBusca(t.nome, inicio);
  }
}

// ── Principal ────────────────────────────────────────────────────────────────

// Uma sincronização por vez: chamadas durante a corrida aguardam a mesma.
export function sincronizar(fazendaId: string | null): Promise<void> {
  if (!fazendaId) return Promise.resolve();
  if (rodando) return rodando;

  rodando = (async () => {
    avisar('sincronizando');
    try {
      await subirCultivos();
      await subirMovimentacoes();
      await subirChuvas();
      await baixar(fazendaId);
      console.log('sync terminou. cópia local:', contagens());
      avisar('parado');
    } catch (e) {
      // Sem rede é o caso comum, e não é erro: o pendente continua no aparelho
      // e sobe na próxima. Só marca erro quando o servidor recusou.
      const msg = e instanceof Error ? e.message : String(e);
      // Só "sem rede" mesmo: um texto qualquer que contivesse "fetch" estava
      // sendo tratado como falta de sinal e sumia sem deixar rastro.
      const semRede = /Network request failed|Failed to fetch|Load failed|network/i.test(msg);
      avisar(semRede ? 'parado' : 'erro');
      console.log(semRede ? 'sync adiado (sem rede):' : 'sync falhou:', msg);
    } finally {
      rodando = null;
    }
  })();

  return rodando;
}

// Baixa tudo de novo, do zero. O marcador de "até onde já busquei" avança por
// tabela; se uma delas ficar para trás por qualquer motivo, a sincronização
// normal nunca mais a traz, porque só pede o que mudou desde então.
export async function ressincronizarTudo(fazendaId: string | null): Promise<void> {
  esquecerBuscas();
  await sincronizar(fazendaId);
}

// Chamada depois de cada gravação local. Não espera terminar: a tela já tem o
// dado, o envio acontece por trás.
let agendado: ReturnType<typeof setTimeout> | null = null;
export function agendarSync(fazendaId: string | null): void {
  if (agendado) clearTimeout(agendado);
  agendado = setTimeout(() => {
    agendado = null;
    void sincronizar(fazendaId);
  }, 1500);
}

export function marcarPendente(tabela: string, id: string): void {
  db.runSync(`update ${tabela} set pendente = 1, updated_at = ? where id = ?`, agora(), id);
  avisar(estado);
}
