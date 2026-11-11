// Abre um backup cifrado. Sem --saida, só mostra o que tem dentro (contagens), e
// nada é gravado em disco: é a forma de conferir um backup sem deixar dados
// soltos na máquina.
//
//   node scripts/backup/abrir.mjs agrocultivo-backup-2026-11-11-0843.bin --chave C:\Users\voce\agrocultivo-backup\chave-privada.pem
//   node scripts/backup/abrir.mjs <backup.bin> --chave <privada.pem> --saida backup-aberto
//
// Com --saida, grava dados.json e a pasta arquivos/ EM TEXTO ABERTO. Apague
// quando terminar, e não deixe dentro de uma pasta sincronizada (OneDrive,
// Drive). backup-aberto/ está no .gitignore.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { argumentos, decifrar, desempacotar, orfaos, rodar } from './lib.mjs';

// Mesmas contas do exportar.mjs, para o que se vê aqui ser o que foi guardado.
export function resumir(cabecalho) {
  const linhas = [
    `projeto:   ${cabecalho.projeto}`,
    `criado em: ${cabecalho.criado_em}`,
    '',
    ...Object.entries(cabecalho.tabelas).map(([n, l]) => `${n.padEnd(22)} ${String(l.length).padStart(6)}`),
    `${'usuários (auth)'.padEnd(22)} ${String(cabecalho.auth_usuarios.length).padStart(6)}`,
    `${'arquivos'.padEnd(22)} ${String(cabecalho.arquivos.length).padStart(6)}`,
  ];
  for (const a of cabecalho.avisos ?? []) linhas.push(`\naviso na hora do backup: ${a}`);
  for (const o of orfaos(cabecalho.tabelas, cabecalho.auth_usuarios)) linhas.push(`\nreferência sem pai: ${o}`);
  return linhas.join('\n');
}

export function abrirBackup(caminho, caminhoChave) {
  const dados = decifrar(readFileSync(caminho), readFileSync(caminhoChave, 'utf8'));
  return desempacotar(dados);
}

// Só roda como programa, não quando outro script importa resumir/abrirBackup.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  rodar(async () => {
    const { posicionais, opcoes } = argumentos();
    const [arquivo] = posicionais;
    if (!arquivo || !opcoes.chave) {
      throw new Error('Uso: node scripts/backup/abrir.mjs <backup.bin> --chave <chave-privada.pem> [--saida pasta]');
    }
    const { cabecalho, blobs } = abrirBackup(arquivo, opcoes.chave);
    console.log(resumir(cabecalho));

    if (typeof opcoes.saida === 'string') {
      const raiz = resolve(opcoes.saida);
      mkdirSync(raiz, { recursive: true });
      const { arquivos, ...resto } = cabecalho;
      writeFileSync(join(raiz, 'dados.json'), JSON.stringify({ ...resto, arquivos }, null, 2));
      cabecalho.arquivos.forEach((a, i) => {
        const destino = resolve(raiz, 'arquivos', a.bucket, a.caminho);
        // O caminho vem de dentro do backup: não pode escapar da pasta de saída.
        if (!destino.startsWith(join(raiz, 'arquivos') + sep)) {
          throw new Error(`Caminho de arquivo suspeito no backup: ${a.caminho}`);
        }
        mkdirSync(dirname(destino), { recursive: true });
        writeFileSync(destino, blobs[i]);
      });
      console.log(`\nGravado em ${raiz} (texto aberto: apague quando terminar).`);
    }
  });
}
