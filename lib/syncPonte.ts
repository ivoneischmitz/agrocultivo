// Ponte para o sincronizador — versão da WEB, que não faz nada.
//
// Na web o app fala direto com o Supabase: não existe cópia local para
// sincronizar. As telas e os contextos chamam estas funções sem perguntar em
// que plataforma estão; no celular vale syncPonte.native.ts, que liga de
// verdade em lib/sync.native.ts.

export type EstadoSync = 'parado' | 'sincronizando' | 'erro';

export const TEM_COPIA_LOCAL = false;

export async function sincronizar(_fazendaId: string | null): Promise<void> {}

export async function ressincronizarTudo(_fazendaId: string | null): Promise<void> {}

export function ouvirSync(fn: (estado: EstadoSync, pendentes: number) => void): () => void {
  fn('parado', 0);
  return () => {};
}

export function limparCopiaLocal(): void {}
