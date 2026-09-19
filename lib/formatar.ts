import { formatDecimal } from '@/lib/numero';

export function moeda(valor: number): string {
  return `R$ ${formatDecimal(valor || 0)}`;
}

// Quantidade sem casas sobrando: 10 -> "10", 2.5 -> "2,5".
export function quantidade(valor: number): string {
  return (valor || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

// Número digitado com ponto ou vírgula como decimal ("12.5" ou "12,5").
//
// Diferente de parseDecimal (lib/numero.ts), que segue o padrão brasileiro à
// risca e lê "12.50" como 1250. Nos campos do cultivo o app antigo sempre
// aceitou ponto como decimal (e é o que o teclado numérico do celular põe),
// então aqui quem tiver só um separador decimal ganha.
export function parseNumeroLivre(texto: string): number {
  const t = texto.trim();
  if (!t) return 0;
  const normalizado = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

// Valor para pôr de volta num campo de texto: 2.5 -> "2,5", 0 -> "".
export function paraCampo(valor: number | null | undefined): string {
  if (!valor) return '';
  return String(valor).replace('.', ',');
}
