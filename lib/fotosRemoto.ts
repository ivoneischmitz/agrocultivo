import { extensao, lerBytes } from '@/lib/arquivos';
import { supabase } from '@/lib/supabase';

// Envio e exclusão de fotos no Supabase, sem depender da plataforma.
//
// Está separado de lib/fotos.ts porque as duas versões precisam do mesmo
// código: a da web (que também lê daqui) e a do celular (que lê da cópia
// local, mas envia por aqui). Arquivo é grande demais para a fila de
// sincronização, então subir e apagar exigem internet nas duas.

const BUCKET = 'fotos-cultivo';

export type Foto = {
  id: string;
  cultivo_id: string;
  storage_path: string;
  url: string;
  comentario: string | null;
  data: string;
};

export async function enviarFotoRemota(
  fazendaId: string,
  cultivoId: string,
  uri: string,
  mimeType?: string | null,
): Promise<Foto> {
  // Na web a uri é blob:, sem extensão; o mimeType diz o formato.
  const ext = mimeType?.startsWith('image/') ? mimeType.slice(6).replace('jpeg', 'jpg') : extensao(uri);
  const caminho = `${fazendaId}/${cultivoId}_${Date.now()}.${ext}`;
  const bytes = await lerBytes(uri);

  const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, bytes, {
    contentType: mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  });
  if (erroUpload) throw erroUpload;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
  const { data, error } = await supabase
    .from('fotos_cultivo')
    .insert({ cultivo_id: cultivoId, storage_path: caminho, url: pub.publicUrl })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([caminho]);
    throw error;
  }
  return data as Foto;
}

export async function apagarFotoRemota(foto: Foto): Promise<void> {
  const { error } = await supabase
    .from('fotos_cultivo')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', foto.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([foto.storage_path]);
}
