// Numeric input helpers for the forms. Kept here rather than next to one
// table's CRUD because percentages, counts and prices all need the same
// Brazilian-decimal handling.
//
// Note: lib/produtos.ts still has its own parsePreco/formatPreco, written
// before this file existed. They behave the same — fold them in here if a
// fourth caller shows up rather than adding another copy.

// Brazilian convention, and only that one: the comma is the decimal separator
// and the dot is a thousands separator. "1.500,25" -> 1500.25, "1,5" -> 1.5.
//
// Careful: that means "12.50" parses as 1250, NOT 12.5 — the dot is discarded.
// (lib/produtos.ts's parsePreco does the same thing but its comment claims
// otherwise; the comment is what's wrong there, not the code.) The forms guard
// against the surprise by showing the resulting total as you type.
//
// Returns 0 for empty/invalid input.
export function parseDecimal(value: string): number {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

// O padrao de 2 casas serve para dinheiro; conversoes de medida pedem mais,
// senao 1 m3 de um produto pequeno arredonda para um numero enganoso.
export function formatDecimal(value: number, casas = 2): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

// Whole numbers (parcelas, dias). Returns 0 for empty/invalid input.
export function parseInteiro(value: string): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
