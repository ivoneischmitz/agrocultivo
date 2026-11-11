// Peças comuns do backup do banco: o que se guarda, como se criptografa e como
// se fala com o Supabase. Só usa o que já vem no Node, sem instalar nada: o
// fluxo do GitHub roda isto sem `npm install`.
//
// Por que criptografar: o repositório é público, e o arquivo do backup fica
// guardado no GitHub. Quem estiver logado lá consegue baixá-lo. O conteúdo são
// despesas, e-mails e fotos de notas, então sai cifrado com uma chave pública
// que está no repositório; só a chave privada, que fica com o dono, abre.

import { Buffer } from 'node:buffer';
import {
  constants,
  createCipheriv,
  createDecipheriv,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
} from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

// ── O que entra no backup ────────────────────────────────────────────────────

// Tabelas do schema public e a chave primária de cada uma. A chave serve para
// paginar com ordem estável: ordenar por outra coisa faria uma linha mudar de
// lugar no meio da leitura e a seguinte seria pulada.
//
// Está escrita aqui, e não descoberta no servidor, de propósito: uma lista
// revisável é mais segura do que uma que muda sozinha. Para não esquecer
// tabela nova, o exportar.mjs compara com o que o servidor expõe e avisa.
export const TABELAS = {
  perfis: ['user_id'],
  fazendas: ['id'],
  fazenda_membros: ['fazenda_id', 'user_id'],
  convites: ['token'],
  cultivos: ['id'],
  movimentacoes: ['id'],
  movimentacao_itens: ['id'],
  movimentacao_anexos: ['id'],
  pluviometria: ['id'],
  fotos_cultivo: ['id'],
};

// Vistas: derivam das tabelas e não se gravam.
export const VISTAS = ['cultivos_resumo'];

// Tabelas que apontam para arquivos no Storage, e o bucket de cada uma.
export const ARQUIVOS = {
  movimentacao_anexos: 'anexos',
  fotos_cultivo: 'fotos-cultivo',
};

// [tabela, coluna, tabela do pai, coluna do pai]. "auth" é a lista de usuários.
// Serve para conferir se o backup saiu inteiro: um filho sem pai quer dizer que
// alguma tabela foi lida pela metade.
export const REFERENCIAS = [
  ['fazendas', 'dono_id', 'auth', 'id'],
  ['perfis', 'user_id', 'auth', 'id'],
  ['fazenda_membros', 'fazenda_id', 'fazendas', 'id'],
  ['fazenda_membros', 'user_id', 'auth', 'id'],
  ['convites', 'fazenda_id', 'fazendas', 'id'],
  ['cultivos', 'fazenda_id', 'fazendas', 'id'],
  ['movimentacoes', 'cultivo_id', 'cultivos', 'id'],
  ['movimentacao_itens', 'movimentacao_id', 'movimentacoes', 'id'],
  ['movimentacao_anexos', 'movimentacao_id', 'movimentacoes', 'id'],
  ['pluviometria', 'cultivo_id', 'cultivos', 'id'],
  ['fotos_cultivo', 'cultivo_id', 'cultivos', 'id'],
];

// Filhos sem pai no conteúdo do backup.
export function orfaos(tabelas, usuarios) {
  const achados = [];
  const ids = (nome, col) =>
    new Set(
      nome === 'auth' ? usuarios.map((u) => u[col]) : (tabelas[nome] ?? []).map((l) => l[col]),
    );
  for (const [filho, col, pai, colPai] of REFERENCIAS) {
    const validos = ids(pai, colPai);
    const sem = (tabelas[filho] ?? []).filter((l) => l[col] != null && !validos.has(l[col])).length;
    if (sem > 0) achados.push(`${filho}.${col} sem ${pai}: ${sem} linha(s)`);
  }
  return achados;
}

// ── Mensagens ────────────────────────────────────────────────────────────────

// No GitHub, ::warning:: e ::error:: viram anotações visíveis na execução.
// Nunca se imprime conteúdo do banco: os registros do fluxo são públicos.
export function aviso(texto) {
  console.log(process.env.GITHUB_ACTIONS ? `::warning::${texto}` : `AVISO: ${texto}`);
}

export async function rodar(principal) {
  try {
    await principal();
  } catch (e) {
    const texto = e instanceof Error ? e.message : String(e);
    console.error(process.env.GITHUB_ACTIONS ? `::error::${texto}` : `ERRO: ${texto}`);
    // process.exitCode, e não process.exit(): derrubar o processo com conexões
    // de rede ainda abertas faz o Node no Windows terminar com uma asserção
    // interna (código 3221226505) em vez de um 1 limpo.
    process.exitCode = 1;
  }
}

export function argumentos(lista = process.argv.slice(2)) {
  const posicionais = [];
  const opcoes = {};
  for (let i = 0; i < lista.length; i++) {
    const a = lista[i];
    if (!a.startsWith('--')) {
      posicionais.push(a);
      continue;
    }
    const proximo = lista[i + 1];
    if (proximo && !proximo.startsWith('--')) {
      opcoes[a.slice(2)] = proximo;
      i++;
    } else {
      opcoes[a.slice(2)] = true;
    }
  }
  return { posicionais, opcoes };
}

// ── Supabase ─────────────────────────────────────────────────────────────────

// Sem esta conferência, a chave publicável (a que vai no app) daria um backup
// "bem-sucedido" e vazio: ela passa pela RLS, que devolve lista vazia a quem
// não é membro de nada. É o pior defeito de um backup, o que parece certo.
export function conferirChaveSecreta(chave, rotulo = 'SUPABASE_SECRET_KEY') {
  if (!chave) throw new Error(`Falta a chave secreta (${rotulo}).`);
  if (chave.startsWith('sb_secret_')) return;
  if (chave.startsWith('sb_publishable_')) {
    throw new Error(
      `${rotulo} está com a chave PUBLICÁVEL, a mesma que vai no app. Ela só enxerga o que a RLS libera e o backup sairia vazio. Use uma chave secreta (sb_secret_...).`,
    );
  }
  let papel = null;
  try {
    papel = JSON.parse(Buffer.from(chave.split('.')[1], 'base64url').toString()).role ?? null;
  } catch {
    // não é JWT
  }
  if (papel === 'service_role') return;
  throw new Error(
    papel
      ? `${rotulo} tem o papel "${papel}", e o backup precisa de uma chave secreta (service_role).`
      : `${rotulo} não tem o formato de uma chave secreta do Supabase (sb_secret_...).`,
  );
}

export function cliente(base, chave) {
  const raiz = base.replace(/\/+$/, '');
  const cabecalhoBase = { apikey: chave, Authorization: `Bearer ${chave}` };

  // Repete em falha de rede, 429 e 5xx: num fluxo semanal sem ninguém olhando,
  // um tropeço passageiro não deve custar o backup da semana. Erro 4xx é nosso
  // e repetir não adianta.
  async function pedir(caminho, { metodo = 'GET', cabecalhos = {}, corpo, aceitar = [] } = {}) {
    let ultimo = new Error('sem resposta');
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      try {
        const r = await fetch(raiz + caminho, {
          method: metodo,
          headers: { ...cabecalhoBase, ...cabecalhos },
          body: corpo,
        });
        if (r.ok || aceitar.includes(r.status)) return r;
        // Poucos caracteres: o erro de uma gravação pode citar a linha.
        const detalhe = (await r.text()).slice(0, process.env.GITHUB_ACTIONS ? 80 : 300);
        const e = new Error(`HTTP ${r.status} em ${metodo} ${caminho.split('?')[0]}: ${detalhe}`);
        e.status = r.status;
        e.detalhe = detalhe;
        if (r.status < 500 && r.status !== 429) throw e;
        ultimo = e;
      } catch (e) {
        if (e && typeof e === 'object' && 'status' in e && e.status < 500 && e.status !== 429) throw e;
        ultimo = e;
      }
      await new Promise((f) => setTimeout(f, 1000 * 2 ** tentativa));
    }
    throw ultimo;
  }

  return { pedir, raiz };
}

export function caminhoDoArquivo(caminho) {
  return caminho.split('/').map(encodeURIComponent).join('/');
}

// ── Empacotar e criptografar ─────────────────────────────────────────────────

// Dentro do arquivo, antes de cifrar:
//   [4 bytes: tamanho do cabeçalho][cabeçalho em JSON][arquivos, um atrás do outro]
// O cabeçalho traz as tabelas, os usuários e a lista de arquivos com o tamanho
// de cada um, que é como se sabe onde cada arquivo começa. Binário puro em vez
// de base64: foto não incha um terço e não estoura o limite de texto do Node.
export function empacotar(cabecalho, blobs) {
  const json = Buffer.from(JSON.stringify(cabecalho), 'utf8');
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(json.length);
  return gzipSync(Buffer.concat([tam, json, ...blobs]));
}

export function desempacotar(dados) {
  const bruto = gunzipSync(dados);
  const tamCabecalho = bruto.readUInt32BE(0);
  const cabecalho = JSON.parse(bruto.subarray(4, 4 + tamCabecalho).toString('utf8'));
  let posicao = 4 + tamCabecalho;
  const blobs = [];
  for (const a of cabecalho.arquivos ?? []) {
    blobs.push(bruto.subarray(posicao, posicao + a.tamanho));
    posicao += a.tamanho;
  }
  if (posicao !== bruto.length) throw new Error('O conteúdo do backup não bate com o cabeçalho (arquivo cortado?).');
  return { cabecalho, blobs };
}

// Criptografia híbrida: uma chave AES-256 nova a cada backup cifra os dados
// (AES-GCM, que também detecta adulteração), e essa chave AES vai embrulhada na
// chave pública RSA. RSA sozinho não cifra arquivo grande.
//
// Formato: 'ACBK' + versão(1) + tamanho da chave embrulhada(2) + chave
// embrulhada + iv(12) + tag(16) + dados cifrados.
const MAGICO = Buffer.from('ACBK');
const VERSAO = 1;

export function cifrar(dados, chavePublicaPem) {
  const chave = randomBytes(32);
  const iv = randomBytes(12);
  const cabeca = Buffer.concat([MAGICO, Buffer.from([VERSAO])]);
  const embrulhada = publicEncrypt(
    { key: chavePublicaPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    chave,
  );
  const c = createCipheriv('aes-256-gcm', chave, iv);
  c.setAAD(cabeca);
  const cifrado = Buffer.concat([c.update(dados), c.final()]);
  const tam = Buffer.alloc(2);
  tam.writeUInt16BE(embrulhada.length);
  return Buffer.concat([cabeca, tam, embrulhada, iv, c.getAuthTag(), cifrado]);
}

export function decifrar(arquivo, chavePrivadaPem) {
  const cabeca = arquivo.subarray(0, 5);
  if (!cabeca.subarray(0, 4).equals(MAGICO)) throw new Error('Isto não é um backup do Agro Cultivo.');
  if (cabeca[4] !== VERSAO) throw new Error(`Versão de backup ${cabeca[4]} não suportada por este script.`);
  const tam = arquivo.readUInt16BE(5);
  const embrulhada = arquivo.subarray(7, 7 + tam);
  const iv = arquivo.subarray(7 + tam, 19 + tam);
  const tag = arquivo.subarray(19 + tam, 35 + tam);
  const cifrado = arquivo.subarray(35 + tam);

  let chave;
  try {
    chave = privateDecrypt(
      { key: chavePrivadaPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      embrulhada,
    );
  } catch {
    throw new Error('A chave privada não abre este backup. É a mesma cuja chave pública estava no repositório quando ele foi feito?');
  }
  const d = createDecipheriv('aes-256-gcm', chave, iv);
  d.setAAD(cabeca);
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(cifrado), d.final()]);
  } catch {
    throw new Error('O backup está corrompido ou foi alterado: a verificação de integridade falhou.');
  }
}
