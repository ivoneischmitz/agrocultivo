import { agora, db, novoId } from '@/lib/dbLocal.native';
import { agendarSync, marcarPendente } from '@/lib/sync.native';
import type { Cultivo, CultivoInput, CultivoResumo } from '@/lib/tipos';

// Cultivos no celular: tudo sai do SQLite local, e o envio para o Supabase
// acontece por trás (lib/sync.native.ts). Mesma interface de lib/cultivos.ts,
// que é a versão da web — as telas não sabem em qual estão.
export { aguardandoInicio, HA_POR_ALQUEIRE, progressoCultivo } from '@/lib/tipos';
export type { Cultivo, CultivoInput, CultivoResumo } from '@/lib/tipos';

type LinhaCultivo = Omit<Cultivo, 'finalizado'> & { finalizado: number };

function montar<T extends LinhaCultivo>(l: T): T & { finalizado: boolean } {
  return { ...l, finalizado: l.finalizado === 1 };
}

// Os totais, que na web vêm da view cultivos_resumo, aqui são somados na hora.
// São dezenas de linhas por cultivo, não milhares.
export async function listCultivosResumo(fazendaId: string): Promise<CultivoResumo[]> {
  const linhas = db.getAllSync<
    LinhaCultivo & {
      total_despesas: number;
      total_receitas: number;
      total_chuva: number;
      primeira_despesa: string | null;
    }
  >(
    `select c.*,
            coalesce((select sum(i.quantidade * i.valor)
                        from movimentacoes m
                        join movimentacao_itens i on i.movimentacao_id = m.id
                       where m.cultivo_id = c.id and m.tipo = 'DESPESA'
                         and m.deleted_at is null and i.deleted_at is null), 0) as total_despesas,
            coalesce((select sum(i.quantidade * i.valor)
                        from movimentacoes m
                        join movimentacao_itens i on i.movimentacao_id = m.id
                       where m.cultivo_id = c.id and m.tipo = 'RECEITA'
                         and m.deleted_at is null and i.deleted_at is null), 0) as total_receitas,
            coalesce((select sum(p.milimetros) from pluviometria p
                       where p.cultivo_id = c.id and p.deleted_at is null), 0) as total_chuva,
            (select min(m.data) from movimentacoes m
              where m.cultivo_id = c.id and m.tipo = 'DESPESA' and m.deleted_at is null) as primeira_despesa
       from cultivos c
      where c.fazenda_id = ? and c.deleted_at is null
      order by case when c.data_plantio is null then 1 else 0 end, c.data_plantio, c.created_at desc`,
    fazendaId,
  );
  return linhas.map(montar) as CultivoResumo[];
}

export async function getCultivo(id: string): Promise<Cultivo> {
  const linha = db.getFirstSync<LinhaCultivo>(
    'select * from cultivos where id = ? and deleted_at is null',
    id,
  );
  if (!linha) throw new Error('Cultivo não encontrado neste aparelho.');
  return montar(linha) as Cultivo;
}

export async function createCultivo(input: CultivoInput): Promise<Cultivo> {
  const id = novoId();
  const quando = agora();
  db.runSync(
    `insert into cultivos (id, fazenda_id, nome_cultura, ano, localidade, area_hectares,
                           numero_sacas, valor_gerado, finalizado, latitude, longitude,
                           data_plantio, ciclo_dias, created_at, updated_at, pendente)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      id,
      input.fazenda_id,
      input.nome_cultura,
      input.ano,
      input.localidade,
      input.area_hectares,
      input.numero_sacas,
      0,
      input.finalizado ? 1 : 0,
      input.latitude,
      input.longitude,
      input.data_plantio,
      input.ciclo_dias,
      quando,
      quando,
    ],
  );
  agendarSync(input.fazenda_id);
  return getCultivo(id);
}

export async function updateCultivo(id: string, input: CultivoInput): Promise<Cultivo> {
  db.runSync(
    `update cultivos
        set nome_cultura = ?, ano = ?, localidade = ?, area_hectares = ?, numero_sacas = ?,
            finalizado = ?, latitude = ?, longitude = ?, data_plantio = ?, ciclo_dias = ?
      where id = ?`,
    [
      input.nome_cultura,
      input.ano,
      input.localidade,
      input.area_hectares,
      input.numero_sacas,
      input.finalizado ? 1 : 0,
      input.latitude,
      input.longitude,
      input.data_plantio,
      input.ciclo_dias,
      id,
    ],
  );
  marcarPendente('cultivos', id);
  agendarSync(input.fazenda_id);
  return getCultivo(id);
}

// Exclusão marcada, como no servidor. Os filhos são marcados junto — aqui na
// mão, já que o gatilho que faz isso vive no Postgres.
export async function deleteCultivo(id: string): Promise<void> {
  const quando = agora();
  const cultivo = db.getFirstSync<{ fazenda_id: string }>('select fazenda_id from cultivos where id = ?', id);

  db.runSync('update cultivos set deleted_at = ?, updated_at = ?, pendente = 1 where id = ?', quando, quando, id);
  db.runSync(
    'update movimentacoes set deleted_at = ?, updated_at = ?, pendente = 1 where cultivo_id = ? and deleted_at is null',
    quando,
    quando,
    id,
  );
  db.runSync(
    'update pluviometria set deleted_at = ?, updated_at = ?, pendente = 1 where cultivo_id = ? and deleted_at is null',
    quando,
    quando,
    id,
  );
  db.runSync(
    'update fotos_cultivo set deleted_at = ? where cultivo_id = ? and deleted_at is null',
    quando,
    id,
  );
  agendarSync(cultivo?.fazenda_id ?? null);
}
