import type { Fazenda } from '@/lib/fazendas';

// Cache das fazendas — versão da WEB, que não guarda nada: sem internet o site
// não funciona mesmo. No celular vale fazendasCache.native.ts, que lê a cópia
// local para o app abrir offline sabendo em que fazenda está.

export function guardarFazendas(_lista: Fazenda[]): void {}

export function fazendasGuardadas(): Fazenda[] | null {
  return null;
}
