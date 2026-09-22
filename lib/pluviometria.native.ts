import { agora, db, novoId } from '@/lib/dbLocal.native';
import { agendarSync } from '@/lib/sync.native';
import type { ChuvaInput, RegistroChuva } from '@/lib/tipos';

// Chuvas no celular, a partir do SQLite local. Mesma interface de
// lib/pluviometria.ts (a versão da web).
//
// chuvaDoPeriodo continua vindo do Open-Meteo: puxar chuva do satélite exige
// internet em qualquer cenário, e a tela avisa quando não há.
export { chuvaDoPeriodo } from '@/lib/clima';
export type { ChuvaInput, RegistroChuva } from '@/lib/tipos';

export async function listChuvas(cultivoId: string): Promise<RegistroChuva[]> {
  return db.getAllSync<RegistroChuva>(
    `select id, cultivo_id, data, milimetros, observacao
       from pluviometria
      where cultivo_id = ? and deleted_at is null
      order by data desc`,
    cultivoId,
  );
}

export async function createChuvas(linhas: ChuvaInput[]): Promise<void> {
  if (linhas.length === 0) return;
  const quando = agora();
  let fazendaId: string | null = null;

  for (const l of linhas) {
    const cultivo = db.getFirstSync<{ fazenda_id: string }>(
      'select fazenda_id from cultivos where id = ?',
      l.cultivo_id,
    );
    if (!cultivo) throw new Error('Cultivo não encontrado neste aparelho.');
    fazendaId = cultivo.fazenda_id;

    db.runSync(
      `insert into pluviometria (id, fazenda_id, cultivo_id, data, milimetros, observacao, updated_at, pendente)
       values (?, ?, ?, ?, ?, ?, ?, 1)`,
      [novoId(), cultivo.fazenda_id, l.cultivo_id, l.data, l.milimetros, l.observacao, quando],
    );
  }
  agendarSync(fazendaId);
}

export async function deleteChuva(id: string): Promise<void> {
  const quando = agora();
  const linha = db.getFirstSync<{ fazenda_id: string }>('select fazenda_id from pluviometria where id = ?', id);
  db.runSync(
    'update pluviometria set deleted_at = ?, updated_at = ?, pendente = 1 where id = ?',
    quando,
    quando,
    id,
  );
  agendarSync(linha?.fazenda_id ?? null);
}

export async function limparChuvas(cultivoId: string): Promise<void> {
  const quando = agora();
  const cultivo = db.getFirstSync<{ fazenda_id: string }>('select fazenda_id from cultivos where id = ?', cultivoId);
  db.runSync(
    'update pluviometria set deleted_at = ?, updated_at = ?, pendente = 1 where cultivo_id = ? and deleted_at is null',
    quando,
    quando,
    cultivoId,
  );
  agendarSync(cultivo?.fazenda_id ?? null);
}
