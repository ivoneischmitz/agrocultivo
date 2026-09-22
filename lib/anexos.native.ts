import { apagarArquivo, guardarArquivo } from '@/lib/arquivosLocais.native';
import { agora, db, novoId } from '@/lib/dbLocal.native';
import type { Anexo } from '@/lib/tipos';
import { agendarSync } from '@/lib/sync.native';
import { supabase } from '@/lib/supabase';

// Anexos no celular: mesma ideia das fotos. O documento escolhido sem sinal
// fica guardado no aparelho e sobe depois (ver lib/sync.native.ts).
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
  const id = novoId();
  const local = guardarArquivo(anexo.uri, anexo.nome_arquivo);

  db.runSync(
    `insert into movimentacao_anexos
       (id, fazenda_id, movimentacao_id, storage_path, nome_arquivo, tipo_arquivo, updated_at, uri_local, pendente)
     values (?, ?, ?, '', ?, ?, ?, ?, 1)`,
    [id, fazendaId, movimentacaoId, anexo.nome_arquivo, anexo.tipo_arquivo, agora(), local],
  );
  agendarSync(fazendaId);
}

export async function removerAnexo(anexo: Anexo): Promise<void> {
  const linha = db.getFirstSync<{ uri_local: string | null; pendente: number; storage_path: string }>(
    'select uri_local, pendente, storage_path from movimentacao_anexos where id = ?',
    anexo.id,
  );

  if (linha?.pendente === 1) {
    apagarArquivo(linha.uri_local);
    db.runSync('delete from movimentacao_anexos where id = ?', anexo.id);
    return;
  }

  const { error } = await supabase
    .from('movimentacao_anexos')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', anexo.id);
  if (error) throw error;
  await supabase.storage.from('anexos').remove([anexo.storage_path]);
  db.runSync('update movimentacao_anexos set deleted_at = ? where id = ?', agora(), anexo.id);
}

// Abrir um anexo que ainda não subiu é abrir o arquivo do próprio aparelho;
// o que já está na nuvem precisa de um link temporário, e portanto de rede.
export async function linkDoAnexo(anexo: Anexo): Promise<string> {
  const linha = db.getFirstSync<{ uri_local: string | null; pendente: number }>(
    'select uri_local, pendente from movimentacao_anexos where id = ?',
    anexo.id,
  );
  if (linha?.pendente === 1 && linha.uri_local) return linha.uri_local;

  const { data, error } = await supabase.storage.from('anexos').createSignedUrl(anexo.storage_path, 600);
  if (error) throw error;
  return data.signedUrl;
}
