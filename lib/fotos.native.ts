import { agora, db, novoId } from '@/lib/dbLocal.native';
import { apagarArquivo, guardarArquivo } from '@/lib/arquivosLocais.native';
import { apagarFotoRemota, type Foto } from '@/lib/fotosRemoto';
import { agendarSync } from '@/lib/sync.native';

// Fotos no celular.
//
// A foto tirada sem sinal fica guardada no aparelho e sobe depois, junto com o
// resto (ver lib/sync.native.ts). Enquanto não sobe, a galeria mostra o
// arquivo local — para quem tirou, não há diferença.
export type { Foto } from '@/lib/fotosRemoto';

// A linha como está no SQLite: pendente é 0/1, e não o booleano que a tela vê.
type LinhaFoto = Omit<Foto, 'pendente'> & { uri_local: string | null; pendente: number };

// Enquanto está pendente, a imagem vem do arquivo no aparelho; depois, da
// nuvem. A tela usa `url` sem saber de qual dos dois se trata.
function montar(l: LinhaFoto): Foto {
  return {
    id: l.id,
    cultivo_id: l.cultivo_id,
    storage_path: l.storage_path,
    url: l.pendente === 1 && l.uri_local ? l.uri_local : l.url,
    comentario: l.comentario,
    data: l.data,
    pendente: l.pendente === 1,
  };
}

export async function listFotos(cultivoId: string): Promise<Foto[]> {
  const linhas = db.getAllSync<LinhaFoto>(
    `select id, cultivo_id, storage_path, url, comentario, data, uri_local, pendente
       from fotos_cultivo
      where cultivo_id = ? and deleted_at is null
      order by data desc`,
    cultivoId,
  );
  return linhas.map(montar);
}

export async function enviarFoto(
  fazendaId: string,
  cultivoId: string,
  uri: string,
  mimeType?: string | null,
): Promise<void> {
  const id = novoId();
  const quando = agora();
  // A câmera e a galeria devolvem um arquivo temporário, que o sistema pode
  // apagar; a cópia é o que garante a foto até ela subir.
  const local = guardarArquivo(uri, `${id}.${mimeType?.includes('png') ? 'png' : 'jpg'}`);

  db.runSync(
    `insert into fotos_cultivo (id, fazenda_id, cultivo_id, storage_path, url, data, updated_at, uri_local, pendente)
     values (?, ?, ?, '', '', ?, ?, ?, 1)`,
    [id, fazendaId, cultivoId, quando, quando, local],
  );
  agendarSync(fazendaId);
}

export async function deleteFoto(foto: Foto): Promise<void> {
  const linha = db.getFirstSync<LinhaFoto>('select * from fotos_cultivo where id = ?', foto.id);

  // Foto que ainda não subiu some por completo: não há nada no servidor para
  // marcar como excluído.
  if (linha?.pendente === 1) {
    apagarArquivo(linha.uri_local);
    db.runSync('delete from fotos_cultivo where id = ?', foto.id);
    return;
  }

  await apagarFotoRemota(foto);
  db.runSync('update fotos_cultivo set deleted_at = ? where id = ?', agora(), foto.id);
}
