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
import { apagarArquivo } from '@/lib/arquivosLocais.native';
import { lerBytes } from '@/lib/arquivos';
import { lerPaginado, type Pagina } from '@/lib/paginar';
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

// versao muda a cada sincronização que traz algo: é o sinal para as telas
// relerem. Sem ele, quem abre o app vê a cópia antiga até trocar de aba.
type Ouvinte = (estado: EstadoSync, pendentes: number, versao: number) => void;

const ouvintes = new Set<Ouvinte>();
let estado: EstadoSync = 'parado';
let versao = 0;
let rodando: Promise<void> | null = null;

export function ouvirSync(fn: Ouvinte): () => void {
  ouvintes.add(fn);
  fn(estado, totalPendente(), versao);
  return () => ouvintes.delete(fn);
}

function avisar(novo: EstadoSync) {
  estado = novo;
  const pendentes = totalPendente();
  for (const fn of ouvintes) fn(novo, pendentes, versao);
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

// Fotos e anexos tirados/escolhidos sem sinal: o arquivo está no aparelho e
// sobe agora. Vão depois das movimentações porque um anexo precisa que a
// despesa dele já exista no servidor.
async function subirArquivos(): Promise<void> {
  const fotos = db.getAllSync<Record<string, unknown>>(
    'select * from fotos_cultivo where pendente = 1 and deleted_at is null',
  );
  for (const f of fotos) {
    const local = f.uri_local as string;
    const ext = local.split('.').pop() || 'jpg';
    const caminho = `${f.fazenda_id}/${f.id}.${ext}`;
    const bytes = await lerBytes(local);

    const { error: erroUpload } = await supabase.storage.from('fotos-cultivo').upload(caminho, bytes, {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: true,
    });
    if (erroUpload) throw erroUpload;

    const { data: pub } = supabase.storage.from('fotos-cultivo').getPublicUrl(caminho);
    const { error } = await supabase.from('fotos_cultivo').upsert({
      id: f.id,
      cultivo_id: f.cultivo_id,
      storage_path: caminho,
      url: pub.publicUrl,
      data: f.data,
    });
    if (error) throw error;

    db.runSync(
      'update fotos_cultivo set storage_path = ?, url = ?, pendente = 0, uri_local = null where id = ?',
      caminho,
      pub.publicUrl,
      f.id as string,
    );
    apagarArquivo(local);
  }

  const anexos = db.getAllSync<Record<string, unknown>>(
    'select * from movimentacao_anexos where pendente = 1 and deleted_at is null',
  );
  for (const a of anexos) {
    const local = a.uri_local as string;
    const nome = String(a.nome_arquivo).replace(/[^a-zA-Z0-9._-]/g, '_');
    const caminho = `${a.fazenda_id}/${a.movimentacao_id}/${a.id}_${nome}`;
    const bytes = await lerBytes(local);

    const { error: erroUpload } = await supabase.storage.from('anexos').upload(caminho, bytes, {
      contentType: (a.tipo_arquivo as string) ?? 'application/octet-stream',
      upsert: true,
    });
    if (erroUpload) throw erroUpload;

    const { error } = await supabase.from('movimentacao_anexos').upsert({
      id: a.id,
      movimentacao_id: a.movimentacao_id,
      storage_path: caminho,
      nome_arquivo: a.nome_arquivo,
      tipo_arquivo: a.tipo_arquivo,
    });
    if (error) throw error;

    db.runSync(
      'update movimentacao_anexos set storage_path = ?, pendente = 0, uri_local = null where id = ?',
      caminho,
      a.id as string,
    );
    apagarArquivo(local);
  }
}

// ── Baixar ───────────────────────────────────────────────────────────────────

// Tabelas trazidas do servidor. `pendente` diz quais podem ter alteração local
// esperando para subir — nessas, o que veio de lá não passa por cima.
const TABELAS: { nome: string; colunas: string; pendente: boolean }[] = [
  { nome: 'fazendas', colunas: 'id, nome, nome_sitio, proprietario, uf, municipio, dono_id, updated_at, deleted_at', pendente: false },
  { nome: 'cultivos', colunas: '*', pendente: true },
  { nome: 'movimentacoes', colunas: '*', pendente: true },
  // movimentacao_itens não entra aqui: ver refazerItens.
  { nome: 'movimentacao_anexos', colunas: '*', pendente: true },
  { nome: 'pluviometria', colunas: '*', pendente: true },
  { nome: 'fotos_cultivo', colunas: '*', pendente: true },
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

// Os itens de uma lista de movimentações, paginados (ver lib/paginar.ts).
async function itensDoServidor(movIds: string[]): Promise<Record<string, unknown>[]> {
  const todos: Record<string, unknown>[] = [];
  await lerPaginado(
    (de, ate) =>
      supabase
        .from('movimentacao_itens')
        .select('*', { count: 'exact' })
        .in('movimentacao_id', movIds)
        .order('id')
        .range(de, ate) as unknown as PromiseLike<Pagina>,
    (linhas) => todos.push(...linhas),
  );
  return todos;
}

// Os itens não são baixados por updated_at como as outras tabelas.
//
// Editar uma despesa apaga de verdade os itens antigos no servidor — é o que
// salvar_movimentacao faz — e uma linha apagada nunca aparece numa busca por
// "o que mudou desde tal data". O aparelho ficava com os itens velhos somados
// aos novos, dobrando o valor da despesa sem dar erro nem aviso.
//
// Então, para cada movimentação que chegou, a lista de itens é refeita
// inteira. Dá para fazer isso porque salvar_movimentacao sempre mexe no
// cabeçalho: se um item mudou, a movimentação veio nesta descida.
async function refazerItens(movIds: string[]): Promise<number> {
  // Despesa alterada aqui e ainda não enviada: o que vale é o do aparelho,
  // como em guardarDoServidor. Normalmente não acontece — subir vem antes de
  // baixar —, mas acontece se a subida falhou no meio.
  const alvos = movIds.filter(
    (id) =>
      db.getFirstSync<{ pendente: number }>('select pendente from movimentacoes where id = ?', id)
        ?.pendente !== 1,
  );

  let total = 0;
  // Em lotes: `in (...)` com uma lista muito longa estoura o limite de
  // parâmetros do SQLite e o tamanho da URL do PostgREST.
  for (let i = 0; i < alvos.length; i += 50) {
    const lote = alvos.slice(i, i + 50);
    const linhas = await itensDoServidor(lote);

    // A limpeza vem depois da busca, de propósito: se a rede caísse no meio,
    // apagar antes deixaria a despesa sem itens nenhum no aparelho.
    const marcas = lote.map(() => '?').join(', ');
    db.runSync(`delete from movimentacao_itens where movimentacao_id in (${marcas})`, lote);
    for (const linha of linhas) {
      guardarDoServidor('movimentacao_itens', paraLocal('movimentacao_itens', linha), false);
    }
    total += linhas.length;
  }
  return total;
}

async function baixar(fazendaId: string): Promise<void> {
  let trouxe = 0;
  // Movimentações que chegaram nesta descida: os itens delas vêm em seguida.
  const movimentacoesBaixadas: string[] = [];
  for (const t of TABELAS) {
    const desde = ultimaBusca(t.nome);
    // Uma folga de um minuto cobre a diferença de relógio entre o servidor e o
    // aparelho: é melhor rebaixar uma linha do que perdê-la.
    const inicio = new Date(Date.now() - 60_000).toISOString();

    // Em páginas: uma consulta só traria no máximo mil linhas e calaria sobre o
    // resto. A ordem é pelo id, que não muda (ver lib/paginar.ts).
    const baixadas = await lerPaginado(
      (de, ate) => {
        let q = supabase.from(t.nome).select(t.colunas, { count: 'exact' });
        q = t.nome === 'fazendas' ? q.eq('id', fazendaId) : q.eq('fazenda_id', fazendaId);
        if (desde) q = q.gt('updated_at', desde);
        return q.order('id').range(de, ate) as unknown as PromiseLike<Pagina>;
      },
      (linhas) => {
        for (const linha of linhas) {
          guardarDoServidor(t.nome, paraLocal(t.nome, linha), t.pendente);
          if (t.nome === 'movimentacoes') movimentacoesBaixadas.push(linha.id as string);
        }
      },
    );
    // Aparece no log do aparelho (adb logcat). Sem isso, uma sincronização que
    // não traz nada é indistinguível de uma que não rodou.
    console.log(`sync baixou ${baixadas} de ${t.nome} (desde ${desde ?? 'sempre'})`);
    trouxe += baixadas;
    anotarBusca(t.nome, inicio);
  }

  if (movimentacoesBaixadas.length > 0) {
    const itens = await refazerItens(movimentacoesBaixadas);
    console.log(`sync refez ${itens} itens de ${movimentacoesBaixadas.length} movimentação(ões)`);
    trouxe += itens;
  }

  if (trouxe > 0) versao++;
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
      await subirArquivos();
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
