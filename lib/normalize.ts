// Case- and accent-insensitive normalization, e.g. "joao" matches "João".
// Shared by the search boxes (clientes, produtos) and the categoria dropdown.
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
