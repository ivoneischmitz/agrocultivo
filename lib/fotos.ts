import { extensao, lerBytes } from '@/lib/arquivos';
import { supabase } from '@/lib/supabase';

// Fotos do cultivo no bucket público `fotos-cultivo`, em {user_id}/arquivo —
// o mesmo lugar onde o app antigo já as guardava.

const BUCKET = 'fotos-cultivo';

export type Foto = {
  id: string;
  cultivo_id: string;
  storage_path: string;
  url: string;
  comentario: string | null;
  data: string;
};

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

export async function enviarFoto(cultivoId: string, uri: string, mimeType?: string | null): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Sessão expirada. Entre novamente.');

  // Na web a uri é blob:, sem extensão; o mimeType diz o formato.
  const ext = mimeType?.startsWith('image/') ? mimeType.slice(6).replace('jpeg', 'jpg') : extensao(uri);
  const caminho = `${u.user.id}/${cultivoId}_${Date.now()}.${ext}`;
  const bytes = await lerBytes(uri);

  const { error: erroUpload } = await supabase.storage.from(BUCKET).upload(caminho, bytes, {
    contentType: mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  });
  if (erroUpload) throw erroUpload;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
  const { error } = await supabase.from('fotos_cultivo').insert({
    cultivo_id: cultivoId,
    storage_path: caminho,
    url: pub.publicUrl,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([caminho]);
    throw error;
  }
}

export async function deleteFoto(foto: Foto): Promise<void> {
  const { error } = await supabase
    .from('fotos_cultivo')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', foto.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([foto.storage_path]);
}
