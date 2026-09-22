// Tipos e funções puras compartilhados pelas duas versões da camada de dados.
//
// A web fala direto com o Supabase (lib/cultivos.ts e companhia); o celular lê
// e grava no SQLite local (lib/cultivos.native.ts e companhia). As telas não
// sabem qual está em uso, e para isso as duas precisam expor exatamente os
// mesmos tipos — que moram aqui para não existirem em duas cópias.

export type Cultivo = {
  id: string;
  fazenda_id: string;
  nome_cultura: string;
  ano: string;
  localidade: string;
  area_hectares: number;
  numero_sacas: number;
  valor_gerado: number;
  finalizado: boolean;
  latitude: number | null;
  longitude: number | null;
  data_plantio: string | null;
  ciclo_dias: number;
  created_at: string;
};

// O cultivo com os totais somados: despesas, receitas e chuva acumulada.
export type CultivoResumo = Cultivo & {
  total_despesas: number;
  total_receitas: number;
  total_chuva: number;
};

export type CultivoInput = {
  // A fazenda dona do cultivo. Os filhos (despesas, chuvas, fotos) herdam a
  // dela, então só aqui o app precisa informar.
  fazenda_id: string;
  nome_cultura: string;
  ano: string;
  localidade: string;
  area_hectares: number;
  numero_sacas: number;
  finalizado: boolean;
  latitude: number | null;
  longitude: number | null;
  data_plantio: string | null;
  ciclo_dias: number;
};

// 1 alqueire paulista = 2,42 ha. A área é gravada em hectares; alqueires é só
// exibição/entrada.
export const HA_POR_ALQUEIRE = 2.42;

// Dia do ciclo e % decorrido, para a barra de progresso. null quando não se
// aplica (sem data de plantio ou já finalizado).
export function progressoCultivo(c: Pick<Cultivo, 'data_plantio' | 'finalizado' | 'ciclo_dias'>) {
  if (!c.data_plantio || c.finalizado) return null;
  const [ano, mes, dia] = c.data_plantio.split('-').map(Number);
  const plantio = new Date(ano, mes - 1, dia);
  const dias = Math.max(0, Math.floor((Date.now() - plantio.getTime()) / 86_400_000));
  const ciclo = c.ciclo_dias || 120;
  return { dias, ciclo, percentual: Math.min(100, (dias / ciclo) * 100) };
}

// ── Movimentações ────────────────────────────────────────────────────────────

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

// ── Pluviometria ─────────────────────────────────────────────────────────────

export type RegistroChuva = {
  id: string;
  cultivo_id: string;
  data: string;
  milimetros: number;
  observacao: string | null;
};

export type ChuvaInput = {
  cultivo_id: string;
  data: string;
  milimetros: number;
  observacao: string | null;
};
