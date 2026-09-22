import { agora, db, novoId } from '@/lib/dbLocal.native';
import { agendarSync, marcarPendente } from '@/lib/sync.native';
import type { Anexo, Movimentacao, MovimentacaoInput, MovimentacaoItem, TipoMovimentacao } from '@/lib/tipos';

// Movimentações no celular, a partir do SQLite local. Mesma interface de
// lib/movimentacoes.ts (a versão da web).
export { CATEGORIAS, iconeCategoria, siglaUnidade, UNIDADES } from '@/lib/tipos';
export type {
  Anexo,
  ItemInput,
  Movimentacao,
  MovimentacaoInput,
  MovimentacaoItem,
  TipoMovimentacao,
} from '@/lib/tipos';

type LinhaMov = {
  id: string;
  cultivo_id: string;
  fazenda_id: string;
  tipo: TipoMovimentacao;
  descricao: string;
  data: string;
  categoria: string | null;
};

function montar(m: LinhaMov): Movimentacao {
  const itens = db.getAllSync<MovimentacaoItem>(
    'select id, descricao, unidade, quantidade, valor from movimentacao_itens where movimentacao_id = ? and deleted_at is null order by id',
    m.id,
  );
  const anexos = db.getAllSync<Anexo>(
    'select id, storage_path, nome_arquivo, tipo_arquivo from movimentacao_anexos where movimentacao_id = ? and deleted_at is null',
    m.id,
  );
  return {
    id: m.id,
    cultivo_id: m.cultivo_id,
    tipo: m.tipo,
    descricao: m.descricao,
    data: m.data,
    categoria: m.categoria,
    itens,
    anexos,
    total: itens.reduce((s, i) => s + i.quantidade * i.valor, 0),
  };
}

export async function listMovimentacoes(cultivoId: string, tipo?: TipoMovimentacao): Promise<Movimentacao[]> {
  const linhas = db.getAllSync<LinhaMov>(
    `select * from movimentacoes
      where cultivo_id = ? and deleted_at is null ${tipo ? 'and tipo = ?' : ''}
      order by data desc, id desc`,
    tipo ? [cultivoId, tipo] : [cultivoId],
  );
  return linhas.map(montar);
}

export async function getMovimentacao(id: string): Promise<Movimentacao> {
  const linha = db.getFirstSync<LinhaMov>('select * from movimentacoes where id = ? and deleted_at is null', id);
  if (!linha) throw new Error('Movimentação não encontrada neste aparelho.');
  return montar(linha);
}

// Cabeçalho e itens de uma vez, como a função salvar_movimentacao faz no
// servidor: editar troca todos os itens. A fazenda vem do cultivo, o mesmo que
// o gatilho herdar_fazenda faz lá.
export async function salvarMovimentacao(id: string | null, input: MovimentacaoInput): Promise<string> {
  const cultivo = db.getFirstSync<{ fazenda_id: string }>(
    'select fazenda_id from cultivos where id = ?',
    input.cultivo_id,
  );
  if (!cultivo) throw new Error('Cultivo não encontrado neste aparelho.');

  const movId = id ?? novoId();
  const quando = agora();

  if (id) {
    db.runSync(
      'update movimentacoes set descricao = ?, data = ?, categoria = ?, deleted_at = null, updated_at = ?, pendente = 1 where id = ?',
      input.descricao,
      input.data,
      input.categoria,
      quando,
      id,
    );
  } else {
    db.runSync(
      `insert into movimentacoes (id, fazenda_id, cultivo_id, tipo, descricao, data, categoria,
                                  created_at, updated_at, pendente)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [movId, cultivo.fazenda_id, input.cultivo_id, input.tipo, input.descricao, input.data, input.categoria, quando, quando],
    );
  }

  db.runSync('delete from movimentacao_itens where movimentacao_id = ?', movId);
  for (const item of input.itens) {
    if (!item.descricao.trim()) continue;
    db.runSync(
      `insert into movimentacao_itens (id, fazenda_id, movimentacao_id, descricao, unidade, quantidade, valor, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.id ?? novoId(), cultivo.fazenda_id, movId, item.descricao.trim(), item.unidade, item.quantidade, item.valor, quando],
    );
  }

  agendarSync(cultivo.fazenda_id);
  return movId;
}

export async function deleteMovimentacao(mov: Movimentacao): Promise<void> {
  const quando = agora();
  const linha = db.getFirstSync<{ fazenda_id: string }>('select fazenda_id from movimentacoes where id = ?', mov.id);
  db.runSync('update movimentacoes set deleted_at = ?, updated_at = ?, pendente = 1 where id = ?', quando, quando, mov.id);
  db.runSync('update movimentacao_itens set deleted_at = ? where movimentacao_id = ?', quando, mov.id);
  db.runSync('update movimentacao_anexos set deleted_at = ? where movimentacao_id = ?', quando, mov.id);
  agendarSync(linha?.fazenda_id ?? null);
}

export async function despesasPorCategoria(cultivoIds: string[]) {
  if (cultivoIds.length === 0) return [];
  const marcas = cultivoIds.map(() => '?').join(',');
  const linhas = db.getAllSync<{ categoria: string; total: number }>(
    `select coalesce(nullif(trim(m.categoria), ''), 'Sem Categoria') as categoria,
            sum(i.quantidade * i.valor) as total
       from movimentacoes m
       join movimentacao_itens i on i.movimentacao_id = m.id
      where m.cultivo_id in (${marcas}) and m.tipo = 'DESPESA'
        and m.deleted_at is null and i.deleted_at is null
      group by 1
      order by total desc`,
    cultivoIds,
  );
  return linhas.map((l) => ({ categoria: l.categoria, total: Number(l.total) || 0 }));
}
