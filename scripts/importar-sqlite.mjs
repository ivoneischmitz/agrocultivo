// Importa o banco SQLite do app antigo (cultivos.db, tirado do celular ou
// emulador) para UMA conta do projeto Supabase novo.
//
// É o caminho para quem nunca gerou backup na nuvem (no 1.x o envio automático
// era só para Pro). Para quem tem backup, use importar-backups.mjs.
//
// Como tirar o cultivos.db de um Android (sem root), com o app antigo
// instalado:
//
//   adb backup -f migracao-local/appcultivo.ab -noapk com.agronegocio.appcultivo
//   (confirmar na tela do aparelho, sem senha)
//
// O .ab é um cabeçalho de 4 linhas + tar comprimido com zlib; o banco fica em
// apps/com.agronegocio.appcultivo/f/SQLite/cultivos.db. Este script aceita
// tanto o .ab quanto o .db já extraído.
//
// Uso (PowerShell, na pasta do projeto):
//
//   $env:NOVO_URL="https://efpghgwlvmrnnsmwhohy.supabase.co"
//   $env:NOVO_SERVICE_KEY="secret key do projeto novo"
//   node scripts/importar-sqlite.mjs migracao-local/appcultivo.ab conta@email.com            # simulação
//   node scripts/importar-sqlite.mjs migracao-local/appcultivo.ab conta@email.com --gravar
//
// A conta precisa já existir (cadastrada pelo app). Se ela já tiver cultivos,
// o script para, para não duplicar.

import { createClient } from '@supabase/supabase-js';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { inflateSync } from 'node:zlib';

const [arquivo, email] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const GRAVAR = process.argv.includes('--gravar');

if (!arquivo || !email) {
  console.error('Uso: node scripts/importar-sqlite.mjs <cultivos.db|backup.ab> <email da conta> [--gravar]');
  process.exit(1);
}
for (const v of ['NOVO_URL', 'NOVO_SERVICE_KEY']) {
  if (!process.env[v]) {
    console.error(`Falta a variável de ambiente ${v}.`);
    process.exit(1);
  }
}

const novo = createClient(process.env.NOVO_URL, process.env.NOVO_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Abrir o banco (.db direto ou de dentro do .ab) ───────────────────────────

function extrairDoBackup(caminho) {
  const bruto = readFileSync(caminho);
  let pos = 0;
  const linhas = [];
  for (let i = 0; i < 4; i++) {
    const fim = bruto.indexOf(0x0a, pos);
    linhas.push(bruto.subarray(pos, fim).toString());
    pos = fim + 1;
  }
  if (linhas[0] !== 'ANDROID BACKUP') throw new Error('Arquivo .ab inválido.');
  if (linhas[3] !== 'none') throw new Error('Backup criptografado: gere de novo sem senha.');
  const tar = linhas[2] === '1' ? inflateSync(bruto.subarray(pos)) : bruto.subarray(pos);

  // tar: cabeçalhos de 512 bytes, nome nos 100 primeiros, tamanho em octal em 124.
  for (let off = 0; off + 512 <= tar.length; ) {
    const nome = tar.subarray(off, off + 100).toString().replace(/\0.*$/s, '');
    if (!nome) break;
    const tamanho = parseInt(tar.subarray(off + 124, off + 136).toString().replace(/\0.*$/s, '').trim(), 8) || 0;
    if (nome.endsWith('/SQLite/cultivos.db')) {
      const destino = join(mkdtempSync(join(tmpdir(), 'agro-')), 'cultivos.db');
      writeFileSync(destino, tar.subarray(off + 512, off + 512 + tamanho));
      return destino;
    }
    off += 512 + Math.ceil(tamanho / 512) * 512;
  }
  throw new Error('cultivos.db não encontrado dentro do backup.');
}

const caminhoDb = arquivo.endsWith('.ab') ? extrairDoBackup(arquivo) : arquivo;
const db = new DatabaseSync(caminhoDb, { readOnly: true });

function tabelaExiste(nome) {
  return !!db.prepare("select 1 from sqlite_master where type='table' and name=?").get(nome);
}
function todas(sql, ...p) {
  return db.prepare(sql).all(...p);
}

// ── Conversões (o SQLite do 1.x guardava texto livre) ────────────────────────

const data = (v) => {
  const s = v == null ? '' : String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
};
const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const texto = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? null : s;
};

async function inserir(tabela, linha) {
  const { data: r, error } = await novo.from(tabela).insert(linha).select('id').single();
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return r.id;
}
async function inserirVarios(tabela, linhas) {
  if (linhas.length === 0) return;
  const { error } = await novo.from(tabela).insert(linhas);
  if (error) throw new Error(`${tabela}: ${error.message}`);
}

// ── Principal ────────────────────────────────────────────────────────────────

async function acharConta(emailProcurado) {
  for (let page = 1; ; page++) {
    const { data: r, error } = await novo.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const u = r.users.find((x) => x.email?.toLowerCase() === emailProcurado.toLowerCase());
    if (u) return u.id;
    if (r.users.length < 1000) return null;
  }
}

async function main() {
  const cultivos = todas('select * from cultivos order by id');
  const movs = todas('select * from movimentacoes order by id');
  const itens = todas('select * from produtos_movimentacao order by id');
  const chuvas = tabelaExiste('pluviometria') ? todas('select * from pluviometria order by id') : [];
  const perfil = tabelaExiste('perfil') ? db.prepare('select * from perfil where id = 1').get() : null;
  const fotos = tabelaExiste('fotos_cultivo') ? todas('select * from fotos_cultivo') : [];

  console.log(GRAVAR ? '== GRAVANDO ==' : '== SIMULAÇÃO (use --gravar para gravar) ==');
  console.log(`${cultivos.length} cultivo(s), ${movs.length} movimentação(ões), ${itens.length} item(ns), ${chuvas.length} chuva(s)`);
  for (const c of cultivos) console.log(`  - ${c.nome_cultura} (${c.ano}) · ${c.localidade} · ${c.quantidade_alqueire} ha`);
  const fotosNaNuvem = fotos.filter((f) => f.supabase_url).length;
  if (fotos.length) console.log(`  ${fotos.length} foto(s) no aparelho, ${fotosNaNuvem} com cópia na nuvem antiga (não importadas por este script)`);

  const userId = await acharConta(email);
  if (!userId) {
    console.error(`\nA conta ${email} não existe no projeto novo. Cadastre-se pelo app primeiro.`);
    process.exit(1);
  }
  const { count } = await novo.from('cultivos').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  if (count) {
    console.error(`\nA conta ${email} já tem ${count} cultivo(s). Nada foi gravado, para não duplicar.`);
    process.exit(1);
  }
  console.log(`\nConta de destino: ${email}`);
  if (!GRAVAR) return;

  try {
    if (perfil && (perfil.nome || perfil.nome_sitio || perfil.proprietario || perfil.uf || perfil.municipio)) {
      const { error } = await novo.from('perfis').upsert(
        {
          user_id: userId,
          nome: texto(perfil.nome),
          nome_sitio: texto(perfil.nome_sitio),
          proprietario: texto(perfil.proprietario),
          uf: texto(perfil.uf),
          municipio: texto(perfil.municipio),
        },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );
      if (error) throw new Error(`perfis: ${error.message}`);
    }

    const idCultivo = new Map();
    for (const c of cultivos) {
      idCultivo.set(
        c.id,
        await inserir('cultivos', {
          user_id: userId,
          nome_cultura: texto(c.nome_cultura) ?? 'Sem nome',
          ano: texto(c.ano) ?? '',
          localidade: texto(c.localidade) ?? '',
          area_hectares: num(c.quantidade_alqueire),
          numero_sacas: num(c.numero_sacas),
          valor_gerado: num(c.valor_gerado),
          finalizado: num(c.finalizado) === 1,
          latitude: c.latitude == null ? null : num(c.latitude),
          longitude: c.longitude == null ? null : num(c.longitude),
          data_plantio: data(c.data_plantio),
          ciclo_dias: Math.round(num(c.ciclo_dias)) || 120,
          ...(data(c.criado_em) ? { created_at: data(c.criado_em) } : {}),
        }),
      );
    }

    const idMov = new Map();
    for (const m of movs) {
      const cultivoId = idCultivo.get(m.cultivo_id);
      if (!cultivoId) continue; // movimentação órfã (cultivo apagado)
      idMov.set(
        m.id,
        await inserir('movimentacoes', {
          user_id: userId,
          cultivo_id: cultivoId,
          tipo: m.tipo === 'RECEITA' ? 'RECEITA' : 'DESPESA',
          descricao: texto(m.descricao) ?? 'Sem descrição',
          data: data(m.data) ?? data(m.criado_em) ?? new Date().toISOString().slice(0, 10),
          categoria: texto(m.categoria),
        }),
      );
    }

    await inserirVarios(
      'movimentacao_itens',
      itens
        .filter((i) => idMov.has(i.movimentacao_id))
        .map((i) => ({
          user_id: userId,
          movimentacao_id: idMov.get(i.movimentacao_id),
          descricao: texto(i.descricao) ?? 'Item',
          unidade: texto(i.unidade) ?? 'UN - Unidade',
          quantidade: num(i.quantidade),
          valor: num(i.valor),
        })),
    );

    const linhasChuva = chuvas
      .filter((p) => idCultivo.has(p.cultivo_id) && data(p.data))
      .map((p) => ({
        user_id: userId,
        cultivo_id: idCultivo.get(p.cultivo_id),
        data: data(p.data),
        milimetros: num(p.milimetros),
        observacao: texto(p.observacao),
      }));
    await inserirVarios('pluviometria', linhasChuva);

    console.log(
      `✅ Gravado: ${idCultivo.size} cultivo(s), ${idMov.size} movimentação(ões), ` +
        `${itens.filter((i) => idMov.has(i.movimentacao_id)).length} item(ns), ${linhasChuva.length} chuva(s).`,
    );
  } catch (e) {
    // Desfaz o que entrou pela metade (a cascata leva o resto).
    await novo.from('cultivos').delete().eq('user_id', userId);
    throw e;
  }
}

main().catch((e) => {
  console.error('ERRO:', e instanceof Error ? e.message : e);
  process.exit(1);
});
