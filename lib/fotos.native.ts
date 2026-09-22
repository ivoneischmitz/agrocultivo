import { db } from '@/lib/dbLocal.native';
import { apagarFotoRemota, enviarFotoRemota, type Foto } from '@/lib/fotosRemoto';

// Fotos no celular.
//
// A lista sai da cópia local, então o histórico continua aparecendo sem sinal —
// as imagens em si vêm da internet, e sem rede aparecem em branco. Enviar e
// excluir exigem conexão: são arquivos, e não cabem na fila de sincronização
// como um lançamento cabe.
export type { Foto } from '@/lib/fotosRemoto';

export async function listFotos(cultivoId: string): Promise<Foto[]> {
  return db.getAllSync<Foto>(
    `select id, cultivo_id, storage_path, url, comentario, data
       from fotos_cultivo
      where cultivo_id = ? and deleted_at is null
      order by data desc`,
    cultivoId,
  );
}

export async function enviarFoto(
  fazendaId: string,
  cultivoId: string,
  uri: string,
  mimeType?: string | null,
): Promise<void> {
  const foto = await enviarFotoRemota(fazendaId, cultivoId, uri, mimeType);
  // Guarda na cópia local para a foto aparecer na hora, sem esperar a próxima
  // sincronização.
  db.runSync(
    `insert or replace into fotos_cultivo (id, fazenda_id, cultivo_id, storage_path, url, comentario, data, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [foto.id, fazendaId, cultivoId, foto.storage_path, foto.url, null, foto.data, foto.data],
  );
}

export async function deleteFoto(foto: Foto): Promise<void> {
  await apagarFotoRemota(foto);
  db.runSync('update fotos_cultivo set deleted_at = ? where id = ?', new Date().toISOString(), foto.id);
}
