import { supabase } from '@/lib/supabase';

export type TipoMovimentacao = 'DESPESA' | 'RECEITA';

export type MovimentacaoItem = {
  id: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  valor: number;
};

export type Anexo = {
  id: string;
  storage_path: string;
  nome_arquivo: string;
  tipo_arquivo: string | null;
};

export type Movimentacao = {
  id: string;
  cultivo_id: string;
  tipo: TipoMovimentacao;
  descricao: string;
  data: string;
  categoria: string | null;
  itens: MovimentacaoItem[];
  anexos: Anexo[];
  total: number;
};

export type ItemInput = {
  // Quem cria gera o id: no celular o item precisa existir antes de haver rede.
  id?: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  valor: number;
};

export type MovimentacaoInput = {
  cultivo_id: string;
  tipo: TipoMovimentacao;
  descricao: string;
  data: string; // ISO
  categoria: string | null;
  itens: ItemInput[];
};

export const UNIDADES = [
  'UN - Unidade',
  'LT - Litro',
  'GL - Galão',
  'BL - Balde',
  'SC - Sacas',
  'KG - Kilo',
  'TN - Tonelada',
];

export const CATEGORIAS: Record<TipoMovimentacao, string[]> = {
  DESPESA: ['Sementes', 'Fertilizantes', 'Defensivos', 'Combustível', 'Mão de Obra', 'Manutenção', 'Outros'],
  RECEITA: ['Venda de Grãos', 'Seguro', 'Bonificação', 'Outros'],
};

const ICONES_CATEGORIA: Record<string, string> = {
  Sementes: '🌱',
  Fertilizantes: '🧪',
  Defensivos: '💧',
  Combustível: '⛽',
  'Mão de Obra': '👷',
  Manutenção: '🔧',
  Outros: '📋',
  'Venda de Grãos': '💰',
  Seguro: '🛡️',
  Bonificação: '🎁',
};

export function iconeCategoria(categoria: string | null | undefined): string {
  return (categoria && ICONES_CATEGORIA[categoria]) || '📋';
}

// "KG - Kilo" -> "KG". Itens de NF-e importada trazem só a sigla.
export function siglaUnidade(unidade: string | null | undefined): string {
  return unidade?.split(' - ')[0] || 'UN';
}

type Linha = Omit<Movimentacao, 'itens' | 'anexos' | 'total'> & {
  movimentacao_itens: MovimentacaoItem[];
  movimentacao_anexos: Anexo[];
};

function montar(m: Linha): Movimentacao {
  const itens = (m.movimentacao_itens ?? [])
    .map((i) => ({ ...i, quantidade: Number(i.quantidade) || 0, valor: Number(i.valor) || 0 }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    id: m.id,
    cultivo_id: m.cultivo_id,
    tipo: m.tipo,
    descricao: m.descricao,
    data: m.data,
    categoria: m.categoria,
    itens,
    anexos: m.movimentacao_anexos ?? [],
    total: itens.reduce((s, i) => s + i.quantidade * i.valor, 0),
  };
}

const SELECT = 'id, cultivo_id, tipo, descricao, data, categoria, movimentacao_itens(*), movimentacao_anexos(*)';

// Itens e anexos vêm na mesma consulta (embed do PostgREST) — o app antigo
// fazia três consultas por movimentação.
export async function listMovimentacoes(
  cultivoId: string,
  tipo?: TipoMovimentacao,
): Promise<Movimentacao[]> {
  let q = supabase
    .from('movimentacoes')
    .select(SELECT)
    .eq('cultivo_id', cultivoId)
    .is('deleted_at', null);
  if (tipo) q = q.eq('tipo', tipo);
  const { data, error } = await q.order('data', { ascending: false }).order('id', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as Linha[]).map(montar);
}

export async function getMovimentacao(id: string): Promise<Movimentacao> {
  const { data, error } = await supabase
    .from('movimentacoes')
    .select(SELECT)
    .eq('id', id)
    .is('deleted_at', null)
    .single();
  if (error) throw error;
  return montar(data as unknown as Linha);
}

// Cabeçalho e itens numa transação só (função salvar_movimentacao no banco).
export async function salvarMovimentacao(id: string | null, input: MovimentacaoInput): Promise<string> {
  const { data, error } = await supabase.rpc('salvar_movimentacao', {
    p_id: id,
    p_cultivo_id: input.cultivo_id,
    p_tipo: input.tipo,
    p_descricao: input.descricao,
    p_data: input.data,
    p_categoria: input.categoria,
    p_itens: input.itens,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteMovimentacao(mov: Movimentacao): Promise<void> {
  const { error } = await supabase
    .from('movimentacoes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', mov.id);
  if (error) throw error;
  if (mov.anexos.length > 0) {
    // Melhor esforço: se o arquivo não sair, sobra só lixo no bucket privado.
    await supabase.storage.from('anexos').remove(mov.anexos.map((a) => a.storage_path));
  }
}

// Despesas agrupadas por categoria de vários cultivos (painel de lucro).
export async function despesasPorCategoria(cultivoIds: string[]) {
  if (cultivoIds.length === 0) return [];
  const { data, error } = await supabase
    .from('movimentacoes')
    .select('categoria, movimentacao_itens(quantidade, valor)')
    .in('cultivo_id', cultivoIds)
    .eq('tipo', 'DESPESA')
    .is('deleted_at', null);
  if (error) throw error;

  const mapa = new Map<string, number>();
  for (const m of (data ?? []) as unknown as {
    categoria: string | null;
    movimentacao_itens: { quantidade: number; valor: number }[];
  }[]) {
    const cat = m.categoria?.trim() || 'Sem Categoria';
    const total = m.movimentacao_itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor), 0);
    mapa.set(cat, (mapa.get(cat) ?? 0) + total);
  }
  return [...mapa.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);
}
