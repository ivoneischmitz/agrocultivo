import { supabase } from '@/lib/supabase';

export type Cultivo = {
  id: string;
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

// Linha da view cultivos_resumo: o cultivo já com os totais somados no banco.
export type CultivoResumo = Cultivo & {
  total_despesas: number;
  total_receitas: number;
  total_chuva: number;
};

export type CultivoInput = {
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

// O Postgres devolve numeric como string pelo PostgREST; converte uma vez aqui
// para as telas não precisarem lembrar.
function normalizar<T extends Cultivo>(c: T): T {
  return {
    ...c,
    area_hectares: Number(c.area_hectares) || 0,
    numero_sacas: Number(c.numero_sacas) || 0,
    valor_gerado: Number(c.valor_gerado) || 0,
  };
}

// Ordem do app antigo: pela data de plantio, sem data por último.
export async function listCultivosResumo(): Promise<CultivoResumo[]> {
  const { data, error } = await supabase
    .from('cultivos_resumo')
    .select('*')
    .order('data_plantio', { ascending: true, nullsFirst: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    ...normalizar(c as CultivoResumo),
    total_despesas: Number(c.total_despesas) || 0,
    total_receitas: Number(c.total_receitas) || 0,
    total_chuva: Number(c.total_chuva) || 0,
  }));
}

export async function getCultivo(id: string): Promise<Cultivo> {
  const { data, error } = await supabase
    .from('cultivos')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();
  if (error) throw error;
  return normalizar(data as Cultivo);
}

export async function createCultivo(input: CultivoInput): Promise<Cultivo> {
  const { data, error } = await supabase.from('cultivos').insert(input).select().single();
  if (error) throw error;
  return normalizar(data as Cultivo);
}

export async function updateCultivo(id: string, input: CultivoInput): Promise<Cultivo> {
  const { data, error } = await supabase.from('cultivos').update(input).eq('id', id).select().single();
  if (error) throw error;
  return normalizar(data as Cultivo);
}

// Exclusão é marcada em deleted_at, não apagada: linha que some do Postgres é
// invisível para um aparelho offline e voltaria na próxima subida (ver
// schema.sql). Um gatilho marca movimentações, itens, chuvas e fotos junto.
// Os arquivos no Storage ficam onde estão.
export async function deleteCultivo(id: string): Promise<void> {
  const { error } = await supabase
    .from('cultivos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

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
