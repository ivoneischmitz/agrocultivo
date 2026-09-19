import { lerBytes, nomeParaStorage } from '@/lib/arquivos';
import type { Anexo } from '@/lib/movimentacoes';
import { supabase } from '@/lib/supabase';

// Anexos (notas fiscais, documentos) de uma movimentação.
//
// No app antigo eram só um caminho de arquivo no celular: não iam para o
// backup e se perdiam ao trocar de aparelho. Agora o arquivo sobe para o
// bucket privado `anexos`, em {user_id}/..., e a tabela guarda o caminho.

export type AnexoPendente = {
  uri: string;
  nome_arquivo: string;
  tipo_arquivo: string | null;
};

export async function enviarAnexo(movimentacaoId: number, anexo: AnexoPendente): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Sessão expirada. Entre novamente.');

  const caminho = `${u.user.id}/${movimentacaoId}/${nomeParaStorage(anexo.nome_arquivo)}`;
  const bytes = await lerBytes(anexo.uri);
  const { error: erroUpload } = await supabase.storage.from('anexos').upload(caminho, bytes, {
    contentType: anexo.tipo_arquivo ?? 'application/octet-stream',
  });
  if (erroUpload) throw erroUpload;

  const { error } = await supabase.from('movimentacao_anexos').insert({
    movimentacao_id: movimentacaoId,
    storage_path: caminho,
    nome_arquivo: anexo.nome_arquivo,
    tipo_arquivo: anexo.tipo_arquivo,
  });
  if (error) {
    await supabase.storage.from('anexos').remove([caminho]);
    throw error;
  }
}

export async function removerAnexo(anexo: Anexo): Promise<void> {
  const { error } = await supabase.from('movimentacao_anexos').delete().eq('id', anexo.id);
  if (error) throw error;
  await supabase.storage.from('anexos').remove([anexo.storage_path]);
}

// O bucket é privado: para abrir, gera um link que vale 10 minutos.
export async function linkDoAnexo(anexo: Anexo): Promise<string> {
  const { data, error } = await supabase.storage.from('anexos').createSignedUrl(anexo.storage_path, 600);
  if (error) throw error;
  return data.signedUrl;
}
