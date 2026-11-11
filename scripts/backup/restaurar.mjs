// Restaura um backup num projeto Supabase NOVO E VAZIO.
//
//   # Simulação: abre o backup, confere e mostra o que seria gravado.
//   node scripts/backup/restaurar.mjs <backup.bin> --chave <chave-privada.pem>
//
//   # Grava de verdade.
//   $env:DESTINO_URL="https://<projeto novo>.supabase.co"
//   $env:DESTINO_SECRET_KEY="chave secreta do projeto novo (sb_secret_...)"
//   node scripts/backup/restaurar.mjs <backup.bin> --chave <chave-privada.pem> --gravar
//
// ANTES, no projeto novo, rode no SQL Editor, nesta ordem: supabase/schema.sql,
// supabase/fazendas.sql e supabase/excluir-conta.sql. Eles criam as tabelas, a
// RLS, as funções e os buckets. O backup traz os DADOS, e as regras já estão no
// Git.
//
// O que o script faz: recria cada usuário com o mesmo id (as tabelas apontam
// para ele), grava as tabelas e sobe os arquivos do Storage.
//
// O que ele NÃO traz: a senha. O Supabase não entrega o hash pela API, então
// cada pessoa entra por "Esqueci minha senha", como na migração do app antigo.
//
// Por segurança recusa um destino que já tenha dados, e recusa o próprio
// projeto de onde o backup saiu (--mesmo-projeto libera).
//
// AINDA NÃO FOI ENSAIADO contra um projeto Supabase real e vazio, só contra um
// servidor simulado (scripts/backup/testar.mjs). Antes de depender dele, ensaie
// uma vez num projeto de teste.

import {
  TABELAS,
  argumentos,
  aviso,
  caminhoDoArquivo,
  cliente,
  conferirChaveSecreta,
  rodar,
} from './lib.mjs';
import { abrirBackup, resumir } from './abrir.mjs';
import { pathToFileURL } from 'node:url';

const LOTE = 500;
const PASSADAS = 5;

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  rodar(async () => {
    const { posicionais, opcoes } = argumentos();
    const [arquivo] = posicionais;
    if (!arquivo || !opcoes.chave) {
      throw new Error('Uso: node scripts/backup/restaurar.mjs <backup.bin> --chave <chave-privada.pem> [--gravar]');
    }

    const { cabecalho, blobs } = abrirBackup(arquivo, opcoes.chave);
    console.log(resumir(cabecalho));

    if (!opcoes.gravar) {
      console.log('\nSimulação: nada foi gravado. Acrescente --gravar para restaurar.');
      return;
    }

    const url = process.env.DESTINO_URL;
    const chave = process.env.DESTINO_SECRET_KEY;
    if (!url) throw new Error('Falta DESTINO_URL (o projeto que vai receber os dados).');
    conferirChaveSecreta(chave, 'DESTINO_SECRET_KEY');

    const projetoDestino = new URL(url).hostname.split('.')[0];
    if (projetoDestino === cabecalho.projeto && !opcoes['mesmo-projeto']) {
      throw new Error('O destino é o mesmo projeto de onde o backup saiu. Restaurar por cima apagaria o que foi lançado depois. Se é isso mesmo que você quer, use --mesmo-projeto.');
    }

    await restaurar(cabecalho, blobs, url, chave);
  });
}

export async function restaurar(cabecalho, blobs, url, chave, log = console.log) {
  const { pedir } = cliente(url, chave);

  // ── O destino precisa ter o schema pronto e estar vazio ────────────────────
  // Tudo é conferido ANTES de gravar qualquer coisa: descobrir no meio que falta
  // uma tabela deixaria o destino pela metade, com os usuários já criados.
  const faltando = [];
  for (const tabela of Object.keys(cabecalho.tabelas)) {
    try {
      const r = await pedir(`/rest/v1/${tabela}?select=*&limit=1`);
      if (['fazendas', 'cultivos', 'movimentacoes'].includes(tabela) && (await r.json()).length > 0) {
        throw new Error(`O destino já tem dados em ${tabela}. Restaure num projeto vazio.`);
      }
    } catch (e) {
      if (e.status === 404) faltando.push(tabela);
      else throw e;
    }
  }
  if (faltando.length > 0) {
    throw new Error(`O destino não tem a(s) tabela(s): ${faltando.join(', ')}. Rode supabase/schema.sql, fazendas.sql e excluir-conta.sql nele antes (e o SQL de qualquer tabela criada depois deles). Nada foi gravado.`);
  }

  // ── Usuários, com o mesmo id ───────────────────────────────────────────────
  let criados = 0;
  let jaExistiam = 0;
  for (const u of cabecalho.auth_usuarios) {
    const r = await pedir('/auth/v1/admin/users', {
      metodo: 'POST',
      cabecalhos: { 'Content-Type': 'application/json' },
      corpo: JSON.stringify({
        id: u.id,
        email: u.email,
        email_confirm: true,
        user_metadata: u.user_metadata ?? {},
      }),
      aceitar: [409, 422],
    });
    if (r.status === 409 || r.status === 422) jaExistiam++;
    else criados++;
  }
  log(`usuários: ${criados} criados, ${jaExistiam} já existiam`);

  // ── Tabelas ────────────────────────────────────────────────────────────────
  // Em várias passadas: uma tabela que falha por chave estrangeira (o pai ainda
  // não entrou) espera a próxima. Isso dispensa descobrir a ordem certa, e a
  // gravação é um upsert, então repetir é seguro.
  let pendentes = Object.keys(cabecalho.tabelas);
  for (let passada = 1; passada <= PASSADAS && pendentes.length > 0; passada++) {
    const ainda = [];
    for (const nome of pendentes) {
      const linhas = cabecalho.tabelas[nome];
      const pk = (TABELAS[nome] ?? ['id']).join(',');
      let falhouPorPai = false;
      for (let i = 0; i < linhas.length && !falhouPorPai; i += LOTE) {
        try {
          await pedir(`/rest/v1/${nome}?on_conflict=${pk}`, {
            metodo: 'POST',
            cabecalhos: {
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            corpo: JSON.stringify(linhas.slice(i, i + LOTE)),
          });
        } catch (e) {
          // 23503 = violação de chave estrangeira.
          if (e.status === 409 && /23503/.test(e.detalhe ?? '')) falhouPorPai = true;
          else throw e;
        }
      }
      if (falhouPorPai) ainda.push(nome);
      else log(`${nome}: ${linhas.length} linha(s)`);
    }
    pendentes = ainda;
  }
  if (pendentes.length > 0) {
    throw new Error(`Não consegui gravar, por falta de registros de que dependem: ${pendentes.join(', ')}.`);
  }

  // ── Arquivos ───────────────────────────────────────────────────────────────
  let subidos = 0;
  for (let i = 0; i < cabecalho.arquivos.length; i++) {
    const a = cabecalho.arquivos[i];
    try {
      await pedir(`/storage/v1/object/${a.bucket}/${caminhoDoArquivo(a.caminho)}`, {
        metodo: 'POST',
        cabecalhos: { 'Content-Type': a.tipo, 'x-upsert': 'true' },
        corpo: blobs[i],
      });
      subidos++;
    } catch (e) {
      if (e.status === 404 || e.status === 400) {
        throw new Error(`O bucket "${a.bucket}" não existe no destino. O supabase/schema.sql o cria; rode-o antes.`);
      }
      throw e;
    }
  }
  log(`arquivos: ${subidos} de ${cabecalho.arquivos.length}`);

  // ── Conferência final: o que entrou tem que bater com o que estava no backup ─
  let divergente = 0;
  for (const [nome, linhas] of Object.entries(cabecalho.tabelas)) {
    const r = await pedir(`/rest/v1/${nome}?select=*&limit=1`, { cabecalhos: { Prefer: 'count=exact' } });
    const total = Number(/\/(\d+)$/.exec(r.headers.get('content-range') ?? '')?.[1] ?? NaN);
    if (total !== linhas.length) {
      divergente++;
      aviso(`${nome}: o backup tinha ${linhas.length} e o destino ficou com ${total}.`);
    }
  }
  if (divergente > 0) throw new Error(`${divergente} tabela(s) não bateram com o backup.`);
  log('\nRestaurado e conferido. Cada pessoa precisa entrar por "Esqueci minha senha".');
}
