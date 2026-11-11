// Gera o par de chaves do backup, uma vez só.
//
//   node scripts/backup/gerar-chaves.mjs
//
// Sai assim:
//   - chave PÚBLICA em scripts/backup/chave-publica.pub. Vai para o Git: é ela
//     que o fluxo do GitHub usa para cifrar. Quem a tem só consegue cifrar,
//     nunca abrir.
//   - chave PRIVADA em ~/agrocultivo-backup/chave-privada.pem, FORA do
//     repositório. É a única que abre os backups.
//
// SEM A CHAVE PRIVADA OS BACKUPS NÃO ABREM, por ninguém, nunca: nem o GitHub,
// nem o Supabase, nem quem escreveu este script. E quem a tiver abre todos.
// Guarde uma cópia num gerenciador de senhas ou num pendrive, longe do
// computador.
//
// O script se recusa a sobrescrever uma chave que já exista: apagar a privada
// por engano deixaria ilegíveis todos os backups já feitos.

import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { argumentos, rodar } from './lib.mjs';

rodar(async () => {
  const { opcoes } = argumentos();
  const privada = resolve(opcoes.privada ?? join(homedir(), 'agrocultivo-backup', 'chave-privada.pem'));
  const publica = resolve(opcoes.publica ?? 'scripts/backup/chave-publica.pub');

  for (const caminho of [privada, publica]) {
    if (existsSync(caminho)) {
      throw new Error(`${caminho} já existe e não será sobrescrito. Se quer mesmo trocar de chave, mova o arquivo antes, mas guarde a privada antiga: ela ainda abre os backups feitos com ela.`);
    }
  }

  // 4096 bits: a chave só embrulha uma chave AES por backup, então o custo é
  // de alguns segundos uma única vez.
  const par = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  mkdirSync(dirname(privada), { recursive: true });
  writeFileSync(privada, par.privateKey, { mode: 0o600 });
  mkdirSync(dirname(publica), { recursive: true });
  writeFileSync(publica, par.publicKey);

  // Nunca se imprime o conteúdo da privada.
  console.log('Chaves geradas.\n');
  console.log(`  pública  (vai para o Git): ${publica}`);
  console.log(`  PRIVADA  (NÃO vai para o Git): ${privada}\n`);
  console.log('Agora, faça uma cópia da chave privada num lugar seguro e separado deste computador.');
  console.log('Sem ela, nenhum backup abre.');
});
