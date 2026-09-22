// Ponte para o sincronizador — versão do CELULAR.
//
// Liga o app à cópia local (lib/dbLocal.native.ts) e ao sincronizador
// (lib/sync.native.ts). Na web o mesmo nome resolve para syncPonte.ts, que não
// faz nada.

import { limparTudo } from '@/lib/dbLocal.native';

export type { EstadoSync } from '@/lib/sync.native';
export { ouvirSync, sincronizar } from '@/lib/sync.native';

export const TEM_COPIA_LOCAL = true;

// Ao sair da conta: o que está no aparelho é dos dados de quem estava logado.
export function limparCopiaLocal(): void {
  limparTudo();
}
