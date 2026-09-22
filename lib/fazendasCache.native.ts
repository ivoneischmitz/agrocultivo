import { db } from '@/lib/dbLocal.native';
import type { Fazenda } from '@/lib/fazendas';

// Cache das fazendas no celular.
//
// Sem isto, abrir o app sem sinal travaria antes de qualquer tela: o contexto
// da fazenda pergunta ao Supabase em que fazenda o app está, e a resposta não
// viria. Com a cópia local, ele abre na última fazenda conhecida e sincroniza
// quando a internet voltar.

export function guardarFazendas(lista: Fazenda[]): void {
  for (const f of lista) {
    db.runSync(
      `insert or replace into fazendas (id, nome, nome_sitio, proprietario, uf, municipio, dono_id, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [f.id, f.nome, f.nome_sitio, f.proprietario, f.uf, f.municipio, f.dono_id, new Date().toISOString()],
    );
  }
}

export function fazendasGuardadas(): Fazenda[] | null {
  const linhas = db.getAllSync<Fazenda>(
    'select id, nome, nome_sitio, proprietario, uf, municipio, dono_id from fazendas where deleted_at is null order by nome',
  );
  return linhas.length > 0 ? linhas : null;
}
