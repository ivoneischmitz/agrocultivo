import { supabase } from '@/lib/supabase';

export type RegistroChuva = {
  id: number;
  cultivo_id: number;
  data: string;
  milimetros: number;
  observacao: string | null;
};

export async function listChuvas(cultivoId: number): Promise<RegistroChuva[]> {
  const { data, error } = await supabase
    .from('pluviometria')
    .select('*')
    .eq('cultivo_id', cultivoId)
    .order('data', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, milimetros: Number(r.milimetros) || 0 }));
}

export async function createChuvas(
  linhas: { cultivo_id: number; data: string; milimetros: number; observacao: string | null }[],
): Promise<void> {
  if (linhas.length === 0) return;
  const { error } = await supabase.from('pluviometria').insert(linhas);
  if (error) throw error;
}

export async function deleteChuva(id: number): Promise<void> {
  const { error } = await supabase.from('pluviometria').delete().eq('id', id);
  if (error) throw error;
}

export async function limparChuvas(cultivoId: number): Promise<void> {
  const { error } = await supabase.from('pluviometria').delete().eq('cultivo_id', cultivoId);
  if (error) throw error;
}

// Open-Meteo (gratuito, sem chave): chuva diária de um período, em mm.
export async function chuvaDoPeriodo(
  latitude: number,
  longitude: number,
  inicio: string,
  fim: string,
): Promise<{ data: string; milimetros: number }[]> {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}` +
    `&start_date=${inicio}&end_date=${fim}&daily=precipitation_sum&timezone=auto`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Falha ao consultar o Open-Meteo.');
  const json = await resp.json();
  const dias: string[] = json?.daily?.time ?? [];
  const mm: (number | null)[] = json?.daily?.precipitation_sum ?? [];
  return dias.map((d, i) => ({ data: d, milimetros: mm[i] ?? 0 }));
}
