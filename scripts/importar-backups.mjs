// Importa os dados do AppCultivo antigo para o projeto Supabase novo.
//
// O app antigo guardava tudo num SQLite do aparelho e subia uma cópia inteira,
// em JSON, para a tabela `backups` do projeto ANTIGO (uma linha por usuário).
// Este script:
//
//   1. lê essas linhas no projeto antigo;
//   2. acha (ou cria) a mesma conta, pelo e-mail, no projeto NOVO — as contas
//      não existem lá, e os ids mudam;
//   3. grava perfil, cultivos, movimentações, itens e chuvas nas tabelas de
//      supabase/schema.sql, no nome dessa conta;
//   4. copia as fotos do bucket antigo para o novo.
//
// Uso (PowerShell, na pasta do projeto):
//
//   $env:ANTIGO_URL="https://xiqrzypbqtjgwgmvueqk.supabase.co"
//   $env:ANTIGO_SERVICE_KEY="service_role do projeto antigo"
//   $env:NOVO_URL="https://efpghgwlvmrnnsmwhohy.supabase.co"
//   $env:NOVO_SERVICE_KEY="service_role do projeto novo"
//   node scripts/importar-backups.mjs                 # simulação: só mostra o que faria
//   node scripts/importar-backups.mjs --gravar        # grava de verdade
//   node scripts/importar-backups.mjs --gravar --senhas senhas.csv
//
// As chaves service_role ficam em Project Settings > API. Elas ignoram a RLS:
// use só aqui, no seu computador, nunca no app nem no git.
//
// --senhas: sem ele, as contas criadas no projeto novo ficam SEM senha e cada
// pessoa precisa usar "Esqueci minha senha" no primeiro acesso. Para levar as
// senhas junto, rode no SQL Editor do projeto ANTIGO:
//
//   select email, encrypted_password from auth.users;
//
// exporte o resultado como CSV e passe o arquivo. O hash (bcrypt) é copiado
// como está — a senha em si nunca passa por aqui.
//
// Seguro rodar mais de uma vez: quem já tem algum cultivo no projeto novo é
// pulado, para não duplicar nem apagar o que já foi lançado no app novo.
//
// O que NÃO vem: anexos de movimentação (no app antigo eram só arquivos no
// celular, nunca iam para o backup) e fotos que não chegaram ao Storage.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const GRAVAR = args.includes('--gravar');
const iSenhas = args.indexOf('--senhas');
const ARQUIVO_SENHAS = iSenhas >= 0 ? args[iSenhas + 1] : null;

function exigir(nome) {
  const valor = process.env[nome];
  if (!valor) {
    console.error(`Falta a variável de ambiente ${nome}. Veja o comentário no topo do script.`);
    process.exit(1);
  }
  return valor;
}

const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
const antigo = createClient(exigir('ANTIGO_URL'), exigir('ANTIGO_SERVICE_KEY'), opcoes);
const novo = createClient(exigir('NOVO_URL'), exigir('NOVO_SERVICE_KEY'), opcoes);

// ── Conversões ───────────────────────────────────────────────────────────────
// O app antigo gravava texto livre no SQLite; o que não for data/número vira
// null/0 em vez de derrubar a importação inteira.

function data(v) {
  if (v == null) return null;
  const s = String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
}

function num(v) {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function texto(v) {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? null : s;
}

// ── Senhas ───────────────────────────────────────────────────────────────────

function lerSenhas(caminho) {
  const mapa = new Map();
  if (!caminho) return mapa;
  const linhas = readFileSync(caminho, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const cabecalho = linhas.shift().split(',').map((c) => c.trim().replace(/"/g, ''));
  const iEmail = cabecalho.indexOf('email');
  const iHash = cabecalho.indexOf('encrypted_password');
  if (iEmail < 0 || iHash < 0) {
    console.error('O CSV de senhas precisa das colunas email e encrypted_password.');
    process.exit(1);
  }
  for (const linha of linhas) {
    const cols = linha.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols[iEmail] && cols[iHash]) mapa.set(cols[iEmail].toLowerCase(), cols[iHash]);
  }
  return mapa;
}

// ── Contas no projeto novo ───────────────────────────────────────────────────

async function usuariosNovos() {
  const mapa = new Map();
  for (let page = 1; ; page++) {
    const { data: r, error } = await novo.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of r.users) if (u.email) mapa.set(u.email.toLowerCase(), u.id);
    if (r.users.length < 1000) break;
  }
  return mapa;
}

async function garantirUsuario(email, existentes, senhas) {
  const chave = email.toLowerCase();
  if (existentes.has(chave)) return { id: existentes.get(chave), criado: false };
  if (!GRAVAR) return { id: null, criado: true };

  const { data: r, error } = await novo.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(senhas.has(chave) ? { password_hash: senhas.get(chave) } : {}),
  });
  if (error) throw error;
  existentes.set(chave, r.user.id);
  return { id: r.user.id, criado: true };
}

// ── Fotos ────────────────────────────────────────────────────────────────────

async function copiarFoto(urlAntiga, userId) {
  const caminhoAntigo = urlAntiga.split('/fotos-cultivo/')[1];
  if (!caminhoAntigo) return null;
  const nome = caminhoAntigo.split('/').pop();
  const caminhoNovo = `${userId}/${nome}`;

  const resp = await fetch(urlAntiga);
  if (!resp.ok) return null;
  const bytes = new Uint8Array(await resp.arrayBuffer());

  const { error } = await novo.storage.from('fotos-cultivo').upload(caminhoNovo, bytes, {
    contentType: resp.headers.get('content-type') ?? 'image/jpeg',
    upsert: true,
  });
  if (error) return null;

  const { data: pub } = novo.storage.from('fotos-cultivo').getPublicUrl(caminhoNovo);
  return { storage_path: caminhoNovo, url: pub.publicUrl };
}

// ── Gravação ─────────────────────────────────────────────────────────────────

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

async function importarUm(userId, dados, total) {
  const perfil = dados.perfil;
  if (perfil && typeof perfil === 'object') {
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

  for (const c of dados.cultivos ?? []) {
    const cultivoId = await inserir('cultivos', {
      user_id: userId,
      nome_cultura: texto(c.nome_cultura) ?? 'Sem nome',
      ano: texto(c.ano) ?? '',
      localidade: texto(c.localidade) ?? '',
      area_hectares: num(c.quantidade_alqueire),
      numero_sacas: num(c.numero_sacas),
      valor_gerado: num(c.valor_gerado),
      finalizado: c.finalizado === 1 || c.finalizado === true || c.finalizado === '1',
      latitude: num(c.latitude) || null,
      longitude: num(c.longitude) || null,
      data_plantio: data(c.data_plantio),
      ciclo_dias: Math.round(num(c.ciclo_dias)) || 120,
      ...(data(c.criado_em) ? { created_at: data(c.criado_em) } : {}),
    });
    total.cultivos++;

    for (const m of c.movimentacoes ?? []) {
      const movId = await inserir('movimentacoes', {
        user_id: userId,
        cultivo_id: cultivoId,
        tipo: m.tipo === 'RECEITA' ? 'RECEITA' : 'DESPESA',
        descricao: texto(m.descricao) ?? 'Sem descrição',
        data: data(m.data) ?? data(m.criado_em) ?? new Date().toISOString().slice(0, 10),
        categoria: texto(m.categoria),
      });
      total.movimentacoes++;

      await inserirVarios(
        'movimentacao_itens',
        (m.produtos ?? []).map((p) => ({
          user_id: userId,
          movimentacao_id: movId,
          descricao: texto(p.descricao) ?? 'Item',
          unidade: texto(p.unidade) ?? 'UN - Unidade',
          quantidade: num(p.quantidade),
          valor: num(p.valor),
        })),
      );
    }

    const chuvas = (c.pluviometria ?? [])
      .filter((p) => data(p.data))
      .map((p) => ({
        user_id: userId,
        cultivo_id: cultivoId,
        data: data(p.data),
        milimetros: num(p.milimetros),
        observacao: texto(p.observacao),
      }));
    await inserirVarios('pluviometria', chuvas);
    total.chuvas += chuvas.length;

    for (const f of c.fotos ?? []) {
      if (!f.supabase_url) continue;
      const copia = await copiarFoto(f.supabase_url, userId);
      if (!copia) {
        total.fotosFalharam++;
        continue;
      }
      await inserir('fotos_cultivo', {
        user_id: userId,
        cultivo_id: cultivoId,
        ...copia,
        comentario: texto(f.comentario),
        ...(data(f.data) ? { data: data(f.data) } : {}),
      });
      total.fotos++;
    }
  }
}

// ── Principal ────────────────────────────────────────────────────────────────

async function main() {
  console.log(GRAVAR ? '== GRAVANDO no projeto novo ==' : '== SIMULAÇÃO (use --gravar para gravar) ==');

  const senhas = lerSenhas(ARQUIVO_SENHAS);
  if (ARQUIVO_SENHAS) console.log(`${senhas.size} senha(s) lida(s) de ${ARQUIVO_SENHAS}`);

  const { data: backups, error } = await antigo.from('backups').select('user_id, user_email, data');
  if (error) throw error;
  console.log(`${backups.length} backup(s) no projeto antigo\n`);

  const existentes = await usuariosNovos();

  for (const b of backups) {
    const email = b.user_email;
    const dados = typeof b.data === 'string' ? JSON.parse(b.data) : b.data ?? {};
    const qtd = (dados.cultivos ?? []).length;

    if (!email) {
      console.log(`- (sem e-mail, user_id ${b.user_id}): ignorado`);
      continue;
    }

    let id = null;
    let importando = false;
    try {
      const conta0 = await garantirUsuario(email, existentes, senhas);
      id = conta0.id;
      const criado = conta0.criado;

      if (id) {
        const { count } = await novo
          .from('cultivos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', id);
        if (count && count > 0) {
          console.log(`- ${email}: já tem ${count} cultivo(s) no app novo, ignorado`);
          continue;
        }
      }

      const conta = criado
        ? `conta nova${senhas.has(email.toLowerCase()) ? ' (com senha)' : ' (sem senha: usar "Esqueci minha senha")'}`
        : 'conta já existia';

      if (!GRAVAR) {
        console.log(`- ${email}: ${qtd} cultivo(s), ${conta}`);
        continue;
      }

      const total = { cultivos: 0, movimentacoes: 0, chuvas: 0, fotos: 0, fotosFalharam: 0 };
      importando = true;
      await importarUm(id, dados, total);
      importando = false;
      console.log(
        `- ${email}: ${conta}; ${total.cultivos} cultivo(s), ${total.movimentacoes} movimentação(ões), ` +
          `${total.chuvas} chuva(s), ${total.fotos} foto(s)` +
          (total.fotosFalharam ? `, ${total.fotosFalharam} foto(s) não copiada(s)` : ''),
      );
    } catch (e) {
      console.log(`- ${email}: ERRO — ${e instanceof Error ? e.message : e}`);
      // Desfaz o que entrou pela metade (a cascata leva o resto junto), senão
      // a próxima rodada veria "já tem cultivos" e pularia esta conta.
      if (importando && id) {
        await novo.from('cultivos').delete().eq('user_id', id);
        console.log(`  (dados parciais de ${email} removidos; rode de novo depois de corrigir)`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
