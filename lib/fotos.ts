import { apagarFotoRemota, enviarFotoRemota, type Foto } from '@/lib/fotosRemoto';
import { supabase } from '@/lib/supabase';

// Fotos do cultivo — versão da web, direto no Supabase. O celular usa
// fotos.native.ts, que lista da cópia local para o histórico aparecer sem
// sinal. O envio e a exclusão são os mesmos nos dois (lib/fotosRemoto.ts).
export type { Foto } from '@/lib/fotosRemoto';

export async function listFotos(cultivoId: string): Promise<Foto[]> {
  const { data, error } = await supabase
    .from('fotos_cultivo')
    .select('*')
    .eq('cultivo_id', cultivoId)
    .is('deleted_at', null)
    .order('data', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function enviarFoto(
  fazendaId: string,
  cultivoId: string,
  uri: string,
  mimeType?: string | null,
): Promise<void> {
  await enviarFotoRemota(fazendaId, cultivoId, uri, mimeType);
}

export async function deleteFoto(foto: Foto): Promise<void> {
  await apagarFotoRemota(foto);
}
