import { lerBytes, nomeParaStorage } from '@/lib/arquivos';
import type { Anexo } from '@/lib/movimentacoes';
import { supabase } from '@/lib/supabase';

// Anexos (notas fiscais, documentos) de uma movimentação.
//
// No app antigo eram só um caminho de arquivo no celular: não iam para o
// backup e se perdiam ao trocar de aparelho. Agora o arquivo sobe para o
// bucket privado `anexos`, em {fazenda_id}/..., e a tabela guarda o caminho.

export type AnexoPendente = {
  uri: string;
  nome_arquivo: string;
  tipo_arquivo: string | null;
};

export async function enviarAnexo(
  fazendaId: string,
  movimentacaoId: string,
  anexo: AnexoPendente,
): Promise<void> {
  const caminho = `${fazendaId}/${movimentacaoId}/${nomeParaStorage(anexo.nome_arquivo)}`;
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
  const { error } = await supabase
    .from('movimentacao_anexos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', anexo.id);
  if (error) throw error;
  await supabase.storage.from('anexos').remove([anexo.storage_path]);
}

// O bucket é privado: para abrir, gera um link que vale 10 minutos.
export async function linkDoAnexo(anexo: Anexo): Promise<string> {
  const { data, error } = await supabase.storage.from('anexos').createSignedUrl(anexo.storage_path, 600);
  if (error) throw error;
  return data.signedUrl;
}

// Abrir o anexo numa aba nova.
//
// A aba é aberta em branco na primeira linha, antes de qualquer espera, e só
// depois recebe o endereço. O motivo é o Safari: ele só permite abrir aba
// durante o próprio toque, e o link do bucket privado exige uma ida ao
// servidor. Pedindo a aba depois desse `await`, o Safari bloqueava sem avisar
// nada — tocar no anexo simplesmente não fazia efeito. O Chrome é mais
// tolerante, e por isso o defeito aparecia só no iPhone.
export async function abrirAnexo(anexo: Anexo): Promise<void> {
  const aba = window.open('', '_blank');
  try {
    const url = await linkDoAnexo(anexo);
    if (aba) {
      aba.location.href = url;
      return;
    }
    // O navegador recusou a aba. Tenta uma vez com o endereço pronto e, se
    // também recusar, avisa o que fazer. De propósito não se abre o arquivo na
    // aba atual: funcionaria, mas levaria embora a despesa que estiver sendo
    // digitada na tela de trás.
    if (!window.open(url, '_blank')) {
      throw new Error('O navegador bloqueou a abertura. Libere pop-ups para este site e toque de novo.');
    }
  } catch (e) {
    aba?.close();
    throw e;
  }
}
