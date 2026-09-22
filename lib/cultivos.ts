import { supabase } from '@/lib/supabase';
import type { Cultivo, CultivoInput, CultivoResumo } from '@/lib/tipos';

// Versão web: fala direto com o Supabase. O celular usa cultivos.native.ts,
// que lê e grava no SQLite do aparelho — as duas expõem a mesma interface.
export { aguardandoInicio, HA_POR_ALQUEIRE, progressoCultivo } from '@/lib/tipos';
export type { Cultivo, CultivoInput, CultivoResumo } from '@/lib/tipos';

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
//
// O filtro por fazenda é do app, não da segurança: a RLS já esconde o que é de
// outra fazenda, mas quem participa de duas veria as duas misturadas.
export async function listCultivosResumo(fazendaId: string): Promise<CultivoResumo[]> {
  const { data, error } = await supabase
    .from('cultivos_resumo')
    .select('*')
    .eq('fazenda_id', fazendaId)
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
  // fazenda_id fica de fora: editar um cultivo não o muda de fazenda.
  const { fazenda_id: _, ...campos } = input;
  const { data, error } = await supabase.from('cultivos').update(campos).eq('id', id).select().single();
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
