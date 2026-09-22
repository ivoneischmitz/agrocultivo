import { supabase } from '@/lib/supabase';
import type { ChuvaInput, RegistroChuva } from '@/lib/tipos';

// Versão web (ver o comentário em lib/cultivos.ts).
export type { ChuvaInput, RegistroChuva } from '@/lib/tipos';
export { chuvaDoPeriodo } from '@/lib/clima';

export async function listChuvas(cultivoId: string): Promise<RegistroChuva[]> {
  const { data, error } = await supabase
    .from('pluviometria')
    .select('*')
    .eq('cultivo_id', cultivoId)
    .is('deleted_at', null)
    .order('data', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, milimetros: Number(r.milimetros) || 0 }));
}

export async function createChuvas(linhas: ChuvaInput[]): Promise<void> {
  if (linhas.length === 0) return;
  const { error } = await supabase.from('pluviometria').insert(linhas);
  if (error) throw error;
}

export async function deleteChuva(id: string): Promise<void> {
  const { error } = await supabase
    .from('pluviometria')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function limparChuvas(cultivoId: string): Promise<void> {
  const { error } = await supabase
    .from('pluviometria')
    .update({ deleted_at: new Date().toISOString() })
    .eq('cultivo_id', cultivoId)
    .is('deleted_at', null);
  if (error) throw error;
}
