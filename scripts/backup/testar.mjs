// Teste do backup contra um Supabase SIMULADO, na própria máquina: sem rede, sem
// chave de verdade, sem tocar no banco real.
//
//   node scripts/backup/testar.mjs
//
// O que o servidor simulado imita do Supabase, porque são os pontos em que o
// backup costuma falhar em silêncio:
//   - devolve no máximo 500 linhas por consulta (o real devolve 1.000);
//   - pagina os usuários em 50 (o real tem seu próprio limite);
//   - responde 409 com código 23503 quando falta o pai (chave estrangeira);
//   - recusa chave que não seja a esperada.
//
// Não prova que o Supabase de verdade se comporta igual. Prova que a lógica do
// backup está certa onde ela depende disso, e que a criptografia e a restauração
// fecham o círculo: o que sai é o que entra.

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REFERENCIAS, TABELAS, cifrar, decifrar, desempacotar, empacotar } from './lib.mjs';
import { abrirBackup } from './abrir.mjs';
import { restaurar } from './restaurar.mjs';

const aqui = fileURLToPath(new URL('.', import.meta.url));
const CHAVE = 'sb_secret_teste';

// ── Servidor simulado ────────────────────────────────────────────────────────

function criarServidor({ tabelas, usuarios, storage, extras = [] }) {
  const estado = { tabelas, usuarios, storage };
  const resposta = (res, status, corpo, cabecalhos = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...cabecalhos });
    res.end(JSON.stringify(corpo));
  };
  const ler = (req) =>
    new Promise((ok) => {
      const partes = [];
      req.on('data', (p) => partes.push(p));
      req.on('end', () => ok(Buffer.concat(partes)));
    });

  const servidor = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.headers.authorization !== `Bearer ${CHAVE}` || req.headers.apikey !== CHAVE) {
      return resposta(res, 401, { message: 'chave inválida' });
    }
    const corpo = await ler(req);

    if (u.pathname === '/rest/v1/' && req.method === 'GET') {
      const nomes = [...Object.keys(estado.tabelas), 'cultivos_resumo', ...extras];
      return resposta(res, 200, { definitions: Object.fromEntries(nomes.map((n) => [n, {}])) });
    }

    const rest = /^\/rest\/v1\/([a-z_]+)$/.exec(u.pathname);
    if (rest) {
      const nome = rest[1];
      if (!(nome in estado.tabelas)) return resposta(res, 404, { code: '42P01' });

      if (req.method === 'GET') {
        const ordem = (u.searchParams.get('order') ?? '').split(',').filter(Boolean);
        const limite = Math.min(Number(u.searchParams.get('limit') ?? 500), 500);
        const de = Number(u.searchParams.get('offset') ?? 0);
        const todas = [...estado.tabelas[nome]].sort((a, b) => {
          for (const c of ordem) {
            if (a[c] < b[c]) return -1;
            if (a[c] > b[c]) return 1;
          }
          return 0;
        });
        const fatia = todas.slice(de, de + limite);
        const cab = {};
        if ((req.headers.prefer ?? '').includes('count=exact')) {
          cab['Content-Range'] = fatia.length ? `${de}-${de + fatia.length - 1}/${todas.length}` : `*/${todas.length}`;
        }
        return resposta(res, 200, fatia, cab);
      }

      if (req.method === 'POST') {
        const linhas = JSON.parse(corpo.toString());
        const pais = (tabela, col) =>
          new Set(tabela === 'auth' ? estado.usuarios.map((x) => x[col]) : (estado.tabelas[tabela] ?? []).map((x) => x[col]));
        for (const [filho, col, pai, colPai] of REFERENCIAS) {
          if (filho !== nome) continue;
          const validos = pais(pai, colPai);
          if (linhas.some((l) => l[col] != null && !validos.has(l[col]))) {
            return resposta(res, 409, { code: '23503', message: `violates foreign key ${col}` });
          }
        }
        const pk = TABELAS[nome] ?? ['id'];
        const chaveDe = (l) => pk.map((c) => l[c]).join('|');
        for (const l of linhas) {
          const i = estado.tabelas[nome].findIndex((x) => chaveDe(x) === chaveDe(l));
          if (i >= 0) estado.tabelas[nome][i] = l;
          else estado.tabelas[nome].push(l);
        }
        res.writeHead(201);
        return res.end();
      }
    }

    if (u.pathname === '/auth/v1/admin/users') {
      if (req.method === 'GET') {
        const pagina = Number(u.searchParams.get('page') ?? 1);
        const por = Math.min(Number(u.searchParams.get('per_page') ?? 50), 50);
        return resposta(res, 200, { users: estado.usuarios.slice((pagina - 1) * por, pagina * por) });
      }
      if (req.method === 'POST') {
        const novo = JSON.parse(corpo.toString());
        if (estado.usuarios.some((x) => x.id === novo.id)) return resposta(res, 422, { error_code: 'email_exists' });
        estado.usuarios.push(novo);
        return resposta(res, 200, novo);
      }
    }

    const arq = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(u.pathname);
    if (arq) {
      const id = `${arq[1]}/${decodeURIComponent(arq[2])}`;
      if (req.method === 'GET') {
        const f = estado.storage.get(id);
        if (!f) return resposta(res, 400, { statusCode: '404', error: 'not_found' });
        res.writeHead(200, { 'Content-Type': f.tipo });
        return res.end(f.dados);
      }
      if (req.method === 'POST') {
        if (!['anexos', 'fotos-cultivo'].includes(arq[1])) return resposta(res, 404, { error: 'Bucket not found' });
        estado.storage.set(id, { dados: corpo, tipo: req.headers['content-type'] });
        return resposta(res, 200, {});
      }
    }
    resposta(res, 404, { message: 'rota desconhecida' });
  });

  return new Promise((ok) => {
    servidor.listen(0, '127.0.0.1', () => ok({ estado, url: `http://127.0.0.1:${servidor.address().port}`, fechar: () => servidor.close() }));
  });
}

// ── Dados de teste ───────────────────────────────────────────────────────────

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function dadosDeTeste({ chuvas = 2300, usuarios = 120 } = {}) {
  const tabelas = {
    perfis: [1, 2, 3].map((i) => ({ user_id: uuid(i), nome: `Pessoa ${i}` })),
    fazendas: [{ id: uuid(1000), dono_id: uuid(1), nome: 'Fazenda' }],
    fazenda_membros: [
      { fazenda_id: uuid(1000), user_id: uuid(1), papel: 'dono' },
      { fazenda_id: uuid(1000), user_id: uuid(2), papel: 'membro' },
    ],
    convites: [{ token: 'abc123', fazenda_id: uuid(1000) }],
    cultivos: [0, 1, 2].map((i) => ({ id: uuid(2000 + i), fazenda_id: uuid(1000), nome_cultura: `Soja ${i}`, area_hectares: 12.5 })),
    movimentacoes: [0, 1, 2, 3, 4].map((i) => ({ id: uuid(3000 + i), cultivo_id: uuid(2000), descricao: `Despesa ${i}` })),
    movimentacao_itens: Array.from({ length: 12 }, (_, i) => ({ id: uuid(4000 + i), movimentacao_id: uuid(3000 + (i % 5)), quantidade: 3.5, valor: 99.99 })),
    movimentacao_anexos: [0, 1, 2].map((i) => ({
      id: uuid(5000 + i),
      movimentacao_id: uuid(3000),
      storage_path: `f/${i}.pdf`,
      // O terceiro foi excluído: o arquivo já não existe, e isso é o esperado.
      deleted_at: i === 2 ? '2026-01-01T00:00:00Z' : null,
    })),
    fotos_cultivo: [{ id: uuid(6000), cultivo_id: uuid(2000), storage_path: 'f/foto.jpg', url: 'x', deleted_at: null }],
    pluviometria: Array.from({ length: chuvas }, (_, i) => ({ id: uuid(10000 + i), cultivo_id: uuid(2000 + (i % 3)), data: '2026-01-01', milimetros: i % 50 })),
  };
  const lista = Array.from({ length: usuarios }, (_, i) => ({ id: uuid(i + 1), email: `u${i + 1}@teste.com`, user_metadata: { n: i } }));
  const storage = new Map([
    ['anexos/f/0.pdf', { dados: randomBytes(1000), tipo: 'application/pdf' }],
    ['anexos/f/1.pdf', { dados: randomBytes(2500), tipo: 'application/pdf' }],
    ['fotos-cultivo/f/foto.jpg', { dados: randomBytes(5000), tipo: 'image/jpeg' }],
  ]);
  return { tabelas, usuarios: lista, storage };
}

const vazio = () => ({
  tabelas: Object.fromEntries(Object.keys(TABELAS).map((n) => [n, []])),
  usuarios: [],
  storage: new Map(),
});

// ── Utilidades ───────────────────────────────────────────────────────────────

function script(nome, args, env = {}) {
  return new Promise((ok) => {
    const p = spawn(process.execPath, [join(aqui, nome), ...args], { env: { ...process.env, GITHUB_ACTIONS: '', ...env } });
    let saida = '';
    p.stdout.on('data', (d) => (saida += d));
    p.stderr.on('data', (d) => (saida += d));
    p.on('close', (codigo) => ok({ codigo, saida }));
  });
}

const ordenar = (linhas, nome) => {
  const pk = TABELAS[nome] ?? ['id'];
  return [...linhas].sort((a, b) => pk.map((c) => a[c]).join('|').localeCompare(pk.map((c) => b[c]).join('|')));
};

// ── Testes ───────────────────────────────────────────────────────────────────

const pasta = mkdtempSync(join(tmpdir(), 'teste-backup-'));
const par = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const outroPar = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const publica = join(pasta, 'publica.pub');
const privada = join(pasta, 'privada.pem');
const privadaErrada = join(pasta, 'errada.pem');
writeFileSync(publica, par.publicKey);
writeFileSync(privada, par.privateKey);
writeFileSync(privadaErrada, outroPar.privateKey);

const resultados = [];
async function teste(nome, fn) {
  try {
    await fn();
    resultados.push([true, nome]);
    console.log(`  ok   ${nome}`);
  } catch (e) {
    resultados.push([false, nome]);
    console.log(`  FALHOU  ${nome}\n         ${(e.message ?? e).toString().split('\n').join('\n         ')}`);
  }
}

const origem = dadosDeTeste();
const extras = ['tabela_nova'];
const srvOrigem = await criarServidor({ ...origem, extras });
// A tabela nova que o backup não conhecia.
srvOrigem.estado.tabelas.tabela_nova = [{ id: uuid(9), x: 1 }];

const envExportar = (url) => ({ SUPABASE_URL: url, SUPABASE_SECRET_KEY: CHAVE });
let arquivoBackup;

console.log('\nExportar');
await teste('exporta com paginação forçada (2300 chuvas, máx. 500 por consulta) e cifra', async () => {
  const saida = join(pasta, 'saida1');
  const r = await script('exportar.mjs', ['--chave-publica', publica, '--saida', saida], envExportar(srvOrigem.url));
  assert.equal(r.codigo, 0, r.saida);
  const arquivos = readdirSync(saida);
  assert.equal(arquivos.length, 1);
  arquivoBackup = join(saida, arquivos[0]);
  assert.match(r.saida, /pluviometria\s+2300/);
  assert.match(r.saida, /usuários \(auth\)\s+120/);
});

await teste('avisa de tabela nova que o backup não conhecia e a guarda', async () => {
  const r = await script('exportar.mjs', ['--chave-publica', publica, '--saida', join(pasta, 'saida2')], envExportar(srvOrigem.url));
  assert.match(r.saida, /tabela nova.*tabela_nova/);
});

await teste('não escreve o conteúdo do banco no registro', async () => {
  const r = await script('exportar.mjs', ['--chave-publica', publica, '--saida', join(pasta, 'saida3')], envExportar(srvOrigem.url));
  for (const segredo of ['u1@teste.com', 'Soja 0', 'abc123', 'Despesa 0']) {
    assert.ok(!r.saida.includes(segredo), `vazou "${segredo}" no registro`);
  }
});

console.log('\nCriptografia');
await teste('o arquivo não contém nada legível', async () => {
  const bruto = readFileSync(arquivoBackup).toString('latin1');
  for (const segredo of ['u1@teste.com', 'Soja 0', 'Fazenda', 'pluviometria', 'cultivos']) {
    assert.ok(!bruto.includes(segredo), `achei "${segredo}" em texto aberto`);
  }
});
await teste('a chave privada certa abre e o conteúdo é idêntico ao do servidor', async () => {
  const { cabecalho, blobs } = abrirBackup(arquivoBackup, privada);
  for (const nome of Object.keys(TABELAS)) {
    assert.deepEqual(ordenar(cabecalho.tabelas[nome], nome), ordenar(origem.tabelas[nome], nome), `tabela ${nome}`);
  }
  assert.deepEqual(cabecalho.auth_usuarios, origem.usuarios);
  assert.equal(cabecalho.arquivos.length, 3, 'o excluído não deve entrar');
  cabecalho.arquivos.forEach((a, i) => {
    const f = origem.storage.get(`${a.bucket}/${a.caminho}`);
    assert.ok(f, `arquivo ${a.caminho} inesperado`);
    assert.ok(blobs[i].equals(f.dados), `bytes de ${a.caminho} diferentes`);
    assert.equal(a.tipo, f.tipo);
  });
  assert.equal(cabecalho.tabelas.tabela_nova.length, 1);
});
await teste('chave privada errada não abre', async () => {
  assert.throws(() => abrirBackup(arquivoBackup, privadaErrada), /não abre este backup/);
});
await teste('arquivo adulterado é rejeitado', async () => {
  const dados = Buffer.from(readFileSync(arquivoBackup));
  dados[dados.length - 40] ^= 0xff;
  const adulterado = join(pasta, 'adulterado.bin');
  writeFileSync(adulterado, dados);
  assert.throws(() => abrirBackup(adulterado, privada), /corrompido ou foi alterado/);
});
await teste('arquivo cortado é rejeitado', async () => {
  const cortado = join(pasta, 'cortado.bin');
  writeFileSync(cortado, readFileSync(arquivoBackup).subarray(0, 3000));
  assert.throws(() => abrirBackup(cortado, privada));
});
await teste('cada backup usa uma chave AES nova (dois backups iguais saem diferentes)', async () => {
  const a = cifrar(Buffer.from('x'), par.publicKey);
  const b = cifrar(Buffer.from('x'), par.publicKey);
  assert.ok(!a.equals(b));
  assert.deepEqual(decifrar(a, par.privateKey), Buffer.from('x'));
});
await teste('empacotar e desempacotar preservam binário', async () => {
  const blobs = [randomBytes(777), randomBytes(1)];
  const { cabecalho, blobs: volta } = desempacotar(empacotar({ arquivos: blobs.map((b) => ({ tamanho: b.length })) }, blobs));
  assert.equal(cabecalho.arquivos.length, 2);
  assert.ok(volta[0].equals(blobs[0]) && volta[1].equals(blobs[1]));
});

console.log('\nProteções contra backup que parece certo e está errado');
await teste('recusa a chave PUBLICÁVEL (sairia vazio)', async () => {
  const r = await script('exportar.mjs', ['--chave-publica', publica, '--saida', join(pasta, 's')], {
    SUPABASE_URL: srvOrigem.url,
    SUPABASE_SECRET_KEY: 'sb_publishable_abc',
  });
  assert.notEqual(r.codigo, 0);
  assert.match(r.saida, /PUBLICÁVEL/);
});
await teste('recusa um backup sem nenhuma linha', async () => {
  const s = await criarServidor({ ...vazio(), usuarios: [{ id: uuid(1), email: 'a@b.c' }] });
  const r = await script('exportar.mjs', ['--chave-publica', publica, '--saida', join(pasta, 's')], envExportar(s.url));
  s.fechar();
  assert.notEqual(r.codigo, 0);
  assert.match(r.saida, /nenhuma linha/);
});
await teste('recusa quando a lista de usuários vem vazia', async () => {
  const d = dadosDeTeste({ chuvas: 3 });
  const s = await criarServidor({ ...d, usuarios: [] });
  const r = await script('exportar.mjs', ['--chave-publica', publica, '--saida', join(pasta, 's')], envExportar(s.url));
  s.fechar();
  assert.notEqual(r.codigo, 0);
  assert.match(r.saida, /usuários veio vazia/);
});
await teste('falha com chave rejeitada pelo servidor', async () => {
  const r = await script('exportar.mjs', ['--chave-publica', publica, '--saida', join(pasta, 's')], {
    SUPABASE_URL: srvOrigem.url,
    SUPABASE_SECRET_KEY: 'sb_secret_outra',
  });
  assert.notEqual(r.codigo, 0);
  assert.match(r.saida, /401/);
});
await teste('passou do teto de arquivos: avisa e deixa os arquivos de fora, tabelas completas', async () => {
  const d = dadosDeTeste({ chuvas: 3 });
  d.storage.clear();
  d.storage.set('anexos/f/0.pdf', { dados: Buffer.alloc(130 * 1024 * 1024, 7), tipo: 'application/pdf' });
  d.storage.set('anexos/f/1.pdf', { dados: Buffer.alloc(130 * 1024 * 1024, 9), tipo: 'application/pdf' });
  const s = await criarServidor(d);
  const saida = join(pasta, 'saida-teto');
  const r = await script('exportar.mjs', ['--chave-publica', publica, '--saida', saida], envExportar(s.url));
  s.fechar();
  assert.equal(r.codigo, 0, r.saida);
  assert.match(r.saida, /1 arquivo\(s\) ficaram FORA/);
  const { cabecalho } = abrirBackup(join(saida, readdirSync(saida)[0]), privada);
  assert.equal(cabecalho.arquivos.length, 1);
  assert.equal(cabecalho.tabelas.movimentacoes.length, 5);
});

console.log('\nRestaurar');
// Os testes de restauração partem de um backup SEM a tabela de teste, que o
// destino (um projeto com o schema normal) não teria. O caso em que o destino
// não a tem é testado à parte, logo abaixo.
const { cabecalho: cabComExtra, blobs: blobsComExtra } = abrirBackup(arquivoBackup, privada);
delete srvOrigem.estado.tabelas.tabela_nova;
extras.length = 0;
const saidaLimpa = join(pasta, 'saida-limpa');
const rLimpa = await script('exportar.mjs', ['--chave-publica', publica, '--saida', saidaLimpa], envExportar(srvOrigem.url));
assert.equal(rLimpa.codigo, 0, rLimpa.saida);
const arquivoLimpo = join(saidaLimpa, readdirSync(saidaLimpa)[0]);
const { cabecalho: cab, blobs: blobsBackup } = abrirBackup(arquivoLimpo, privada);

await teste('destino sem uma tabela do backup: erro claro e NADA é gravado (nem usuários)', async () => {
  const destino = await criarServidor(vazio());
  assert.ok('tabela_nova' in cabComExtra.tabelas);
  await assert.rejects(
    restaurar(cabComExtra, blobsComExtra, destino.url, CHAVE, () => {}),
    /não tem a\(s\) tabela\(s\): tabela_nova.*Nada foi gravado/,
  );
  assert.equal(destino.estado.usuarios.length, 0, 'criou usuários antes de conferir o schema');
  assert.equal(destino.estado.tabelas.cultivos.length, 0);
  destino.fechar();
});

await teste('restaura num projeto vazio e o resultado é idêntico à origem', async () => {
  const destino = await criarServidor(vazio());
  await restaurar(cab, blobsBackup, destino.url, CHAVE, () => {});
  for (const nome of Object.keys(TABELAS)) {
    assert.deepEqual(ordenar(destino.estado.tabelas[nome], nome), ordenar(origem.tabelas[nome], nome), `tabela ${nome}`);
  }
  assert.deepEqual(destino.estado.usuarios.map((u) => u.id).sort(), origem.usuarios.map((u) => u.id).sort());
  assert.equal(destino.estado.usuarios[0].email, origem.usuarios[0].email);
  assert.equal(destino.estado.storage.size, 3);
  for (const [id, f] of destino.estado.storage) {
    assert.ok(f.dados.equals(origem.storage.get(id).dados), `bytes de ${id}`);
    assert.equal(f.tipo, origem.storage.get(id).tipo);
  }
  destino.fechar();
});
await teste('restaura mesmo com as tabelas em ordem errada (filhos antes dos pais)', async () => {
  const destino = await criarServidor(vazio());
  const invertido = { ...cab, tabelas: Object.fromEntries(Object.entries(cab.tabelas).reverse()) };
  await restaurar(invertido, blobsBackup, destino.url, CHAVE, () => {});
  assert.equal(destino.estado.tabelas.pluviometria.length, 2300);
  assert.equal(destino.estado.tabelas.cultivos.length, 3);
  destino.fechar();
});
await teste('restaurar duas vezes não duplica nada', async () => {
  const destino = await criarServidor(vazio());
  await restaurar(cab, blobsBackup, destino.url, CHAVE, () => {});
  // A segunda esbarra na proteção de destino vazio, de propósito: mexe nos dados.
  await assert.rejects(restaurar(cab, blobsBackup, destino.url, CHAVE, () => {}), /já tem dados/);
  assert.equal(destino.estado.tabelas.pluviometria.length, 2300);
  destino.fechar();
});
await teste('recusa um destino que já tem dados', async () => {
  const cheio = dadosDeTeste({ chuvas: 3 });
  const destino = await criarServidor(cheio);
  await assert.rejects(restaurar(cab, blobsBackup, destino.url, CHAVE, () => {}), /já tem dados/);
  destino.fechar();
});
await teste('avisa quando o destino não tem o schema', async () => {
  const destino = await criarServidor({ tabelas: {}, usuarios: [], storage: new Map() });
  await assert.rejects(restaurar(cab, blobsBackup, destino.url, CHAVE, () => {}), /não tem a\(s\) tabela\(s\)/);
  destino.fechar();
});
await teste('simulação (sem --gravar) não grava nada e mostra o resumo', async () => {
  const destino = await criarServidor(vazio());
  const r = await script('restaurar.mjs', [arquivoLimpo, '--chave', privada], { DESTINO_URL: destino.url, DESTINO_SECRET_KEY: CHAVE });
  assert.equal(r.codigo, 0, r.saida);
  assert.match(r.saida, /Simulação: nada foi gravado/);
  assert.equal(destino.estado.tabelas.cultivos.length, 0);
  destino.fechar();
});
await teste('recusa restaurar no mesmo projeto de onde o backup saiu', async () => {
  const destino = await criarServidor(vazio());
  // Os dois servidores simulados são 127.0.0.1, ou seja, "o mesmo projeto".
  const r = await script('restaurar.mjs', [arquivoLimpo, '--chave', privada, '--gravar'], { DESTINO_URL: destino.url, DESTINO_SECRET_KEY: CHAVE });
  assert.notEqual(r.codigo, 0);
  assert.match(r.saida, /mesmo projeto/);
  assert.equal(destino.estado.tabelas.cultivos.length, 0);
  destino.fechar();
});
await teste('pela linha de comando, com --mesmo-projeto, restaura e confere', async () => {
  const destino = await criarServidor(vazio());
  const r = await script('restaurar.mjs', [arquivoLimpo, '--chave', privada, '--gravar', '--mesmo-projeto'], { DESTINO_URL: destino.url, DESTINO_SECRET_KEY: CHAVE });
  assert.equal(r.codigo, 0, r.saida);
  assert.match(r.saida, /Restaurado e conferido/);
  assert.equal(destino.estado.tabelas.pluviometria.length, 2300);
  destino.fechar();
});

srvOrigem.fechar();
rmSync(pasta, { recursive: true, force: true });
const falhas = resultados.filter(([ok]) => !ok).length;
console.log(`\n${resultados.length - falhas} de ${resultados.length} passaram${falhas ? `, ${falhas} FALHARAM` : ''}.`);
process.exit(falhas ? 1 : 0);
