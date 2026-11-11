// Exporta o banco do Agro Cultivo para UM arquivo cifrado: as tabelas, a lista
// de usuários e os arquivos do Storage (anexos e fotos).
//
// Roda toda semana no GitHub (.github/workflows/backup-banco.yml) e pode rodar
// à mão. Uso (PowerShell, na pasta do projeto):
//
//   $env:SUPABASE_URL="https://efpghgwlvmrnnsmwhohy.supabase.co"
//   $env:SUPABASE_SECRET_KEY="chave secreta (sb_secret_...)"
//   node scripts/backup/exportar.mjs
//
// A chave secreta ignora a RLS, e por isso é a única que enxerga tudo. Use uma
// chave criada só para o backup, para poder revogá-la sem mexer no resto.
//
// O arquivo sai em backup-saida/ e só abre com a chave privada (abrir.mjs).

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ARQUIVOS,
  TABELAS,
  VISTAS,
  argumentos,
  aviso,
  caminhoDoArquivo,
  cifrar,
  cliente,
  conferirChaveSecreta,
  empacotar,
  orfaos,
  rodar,
} from './lib.mjs';

// O Supabase devolve no máximo 1.000 linhas por consulta e não avisa quando
// corta: vem status 200 com as mil primeiras.
const PAGINA = 1000;

// Teto para os arquivos do Storage dentro de UM backup. Passando disso, os
// arquivos ficam de fora (as tabelas seguem inteiras) e o fluxo avisa. Quando
// as fotos chegarem perto disso o projeto também estará perto do 1 GB do plano
// gratuito, e é o momento de repensar onde elas moram.
const LIMITE_ARQUIVOS = 250 * 1024 * 1024;

rodar(async () => {
  const { opcoes } = argumentos();
  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!url) throw new Error('Falta SUPABASE_URL.');
  conferirChaveSecreta(chave);

  const caminhoChavePublica = opcoes['chave-publica'] ?? 'scripts/backup/chave-publica.pub';
  let chavePublica;
  try {
    chavePublica = readFileSync(caminhoChavePublica, 'utf8');
  } catch {
    throw new Error(`Não achei a chave pública em ${caminhoChavePublica}. Rode scripts/backup/gerar-chaves.mjs uma vez.`);
  }

  const { pedir } = cliente(url, chave);
  const avisos = [];
  const av = (texto) => {
    avisos.push(texto);
    aviso(texto);
  };

  // ── Tabelas ────────────────────────────────────────────────────────────────

  // Tabela criada depois deste script não pode ficar de fora em silêncio, que é
  // como um backup passa anos parecendo completo. Compara com o que o servidor
  // expõe, tenta guardar a nova pela coluna id e avisa.
  const exportar = { ...TABELAS };
  try {
    const r = await pedir('/rest/v1/', { cabecalhos: { Accept: 'application/openapi+json' } });
    const j = await r.json();
    const nomes = Object.keys(j.definitions ?? j.components?.schemas ?? {});
    for (const nome of nomes) {
      if (nome in TABELAS || VISTAS.includes(nome)) continue;
      av(`Há uma tabela nova no banco que o backup não conhecia: "${nome}". Guardada pela coluna id; confira scripts/backup/lib.mjs.`);
      exportar[nome] = ['id'];
    }
  } catch {
    av('Não consegui conferir se há tabelas novas no banco; o backup usou a lista conhecida.');
  }

  async function lerTabela(nome, pk) {
    const ordem = pk.join(',');
    const linhas = [];
    let total = NaN;
    for (;;) {
      const r = await pedir(`/rest/v1/${nome}?select=*&order=${ordem}&limit=${PAGINA}&offset=${linhas.length}`, {
        cabecalhos: { Prefer: 'count=exact' },
      });
      const lote = await r.json();
      total = Number(/\/(\d+)$/.exec(r.headers.get('content-range') ?? '')?.[1] ?? NaN);
      linhas.push(...lote);
      if (lote.length === 0) break;
      // O fim vem do total informado pelo servidor, e não de "veio menos que o
      // pedido": se o limite do projeto for menor que a página, a regra do
      // tamanho pararia cedo demais.
      if (!Number.isNaN(total)) {
        if (linhas.length >= total) break;
      } else if (lote.length < PAGINA) {
        break;
      }
    }
    if (!Number.isNaN(total) && linhas.length < total) {
      throw new Error(`Tabela ${nome}: li ${linhas.length} de ${total} linhas.`);
    }
    return linhas;
  }

  const tabelas = {};
  for (const [nome, pk] of Object.entries(exportar)) {
    try {
      tabelas[nome] = await lerTabela(nome, pk);
    } catch (e) {
      // Só as tabelas conhecidas derrubam o backup; uma nova que não deu para
      // ler (sem coluna id, por exemplo) vira aviso.
      if (nome in TABELAS) throw e;
      av(`Não consegui guardar a tabela nova "${nome}": ${e instanceof Error ? e.message : e}`);
    }
  }

  // ── Usuários ───────────────────────────────────────────────────────────────

  // A API de administração entrega e-mail e metadados, e não o hash da senha.
  // Quem restaurar entra por "Esqueci minha senha", como na migração do app
  // antigo. Percorre até vir uma página vazia, sem confiar no tamanho de página.
  const usuarios = [];
  for (let pagina = 1; ; pagina++) {
    const r = await pedir(`/auth/v1/admin/users?page=${pagina}&per_page=200`);
    const lote = (await r.json()).users ?? [];
    if (lote.length === 0) break;
    usuarios.push(...lote);
  }

  // ── Conferências de sanidade ───────────────────────────────────────────────

  const totalLinhas = Object.values(tabelas).reduce((s, l) => s + l.length, 0);
  if (totalLinhas === 0) {
    throw new Error('O backup saiu sem nenhuma linha. A chave pode não ter acesso, ou o projeto está vazio.');
  }
  if (usuarios.length === 0) {
    throw new Error('Li as tabelas, mas a lista de usuários veio vazia: a chave não tem acesso à administração de contas.');
  }
  for (const o of orfaos(tabelas, usuarios)) {
    // Acontece se alguém lançou algo enquanto as tabelas eram lidas, uma depois
    // da outra. É aviso, e não erro: o dado existe, só chegou num instante
    // diferente do pai.
    av(`Referência sem pai (pode ser uma gravação durante a leitura): ${o}`);
  }

  // ── Arquivos ───────────────────────────────────────────────────────────────

  const arquivos = [];
  const blobs = [];
  const vistos = new Set();
  let usado = 0;
  let omitidos = 0;
  let ausentes = 0;
  for (const [tabela, bucket] of Object.entries(ARQUIVOS)) {
    for (const linha of tabelas[tabela] ?? []) {
      const caminho = linha.storage_path;
      if (!caminho || vistos.has(`${bucket}/${caminho}`)) continue;
      vistos.add(`${bucket}/${caminho}`);
      // 400 e 404: conforme a versão, o Storage responde um ou outro para
      // arquivo que não existe.
      const r = await pedir(`/storage/v1/object/${bucket}/${caminhoDoArquivo(caminho)}`, { aceitar: [400, 404] });
      if (r.status === 400 || r.status === 404) {
        // Registro excluído já teve o arquivo apagado: é o esperado.
        if (!linha.deleted_at) ausentes++;
        continue;
      }
      const dados = Buffer.from(await r.arrayBuffer());
      if (usado + dados.length > LIMITE_ARQUIVOS) {
        omitidos++;
        continue;
      }
      usado += dados.length;
      arquivos.push({
        bucket,
        caminho,
        tamanho: dados.length,
        tipo: r.headers.get('content-type') ?? 'application/octet-stream',
      });
      blobs.push(dados);
    }
  }
  if (ausentes > 0) av(`${ausentes} arquivo(s) de registros ativos não estão no Storage e ficaram fora do backup.`);
  if (omitidos > 0) {
    av(`${omitidos} arquivo(s) ficaram FORA do backup: passaram do teto de ${LIMITE_ARQUIVOS / 1024 / 1024} MB. As tabelas estão completas.`);
  }

  // ── Empacotar, cifrar, gravar ──────────────────────────────────────────────

  const projeto = new URL(url).hostname.split('.')[0];
  const cabecalho = {
    formato: 1,
    criado_em: new Date().toISOString(),
    projeto,
    tabelas,
    auth_usuarios: usuarios,
    arquivos,
    avisos,
  };
  const cifrado = cifrar(empacotar(cabecalho, blobs), chavePublica);

  const saida = opcoes.saida ?? 'backup-saida';
  mkdirSync(saida, { recursive: true });
  const nome = `agrocultivo-backup-${cabecalho.criado_em.slice(0, 16).replace('T', '-').replace(':', '')}.bin`;
  const destino = join(saida, nome);
  writeFileSync(destino, cifrado);
  if (statSync(destino).size !== cifrado.length) throw new Error('O arquivo gravado não tem o tamanho esperado.');

  // Só contagens: os registros do GitHub são públicos.
  const linhasResumo = Object.entries(tabelas).map(([n, l]) => `${n.padEnd(22)} ${String(l.length).padStart(6)}`);
  console.log(linhasResumo.join('\n'));
  console.log(`${'usuários (auth)'.padEnd(22)} ${String(usuarios.length).padStart(6)}`);
  console.log(`${'arquivos'.padEnd(22)} ${String(arquivos.length).padStart(6)}  (${(usado / 1024).toFixed(0)} kB)`);
  console.log(`arquivo: ${destino}  ${(cifrado.length / 1024).toFixed(0)} kB`);
  console.log(`sha256 (do arquivo cifrado): ${createHash('sha256').update(cifrado).digest('hex')}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      '### Backup do banco',
      '',
      '| Tabela | Linhas |',
      '|---|---:|',
      ...Object.entries(tabelas).map(([n, l]) => `| ${n} | ${l.length} |`),
      `| usuários (auth) | ${usuarios.length} |`,
      `| arquivos do Storage | ${arquivos.length} |`,
      '',
      `Arquivo cifrado: \`${nome}\` (${(cifrado.length / 1024).toFixed(0)} kB).`,
      avisos.length ? `\n**Avisos:** ${avisos.length}. Veja as anotações desta execução.` : '',
    ];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
  }
});
