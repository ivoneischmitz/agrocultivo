// Date helpers for the forms. Dates are typed and shown as DD/MM/AAAA and
// stored as ISO (YYYY-MM-DD, a Postgres `date`).
//
// Plain TextInputs rather than a date picker: every picker for react-native is
// a native dependency, and this project stays dependency-light on purpose (the
// same call that kept material-top-tabs and a checkbox library out).

// '2026-09-09' -> '09/09/2026'. Returns '' for empty/invalid input.
export function formatDataBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  if (!ano || !mes || !dia) return '';
  return `${dia}/${mes}/${ano}`;
}

// '09/09/2026' -> '2026-09-09'. Returns null when the text isn't a real date,
// which is how the filters tell "not filled in" from "typed wrong".
export function parseDataBR(value: string): string | null {
  const trimmed = value.trim();
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;

  const dia = Number(match[1]);
  const mes = Number(match[2]);
  const ano = Number(match[3]);

  // Round-trip through Date to reject things like 31/02/2026, which would
  // otherwise roll over into March and silently save the wrong day.
  const date = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    date.getUTCFullYear() !== ano ||
    date.getUTCMonth() !== mes - 1 ||
    date.getUTCDate() !== dia
  ) {
    return null;
  }

  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// Hard-coded rather than derived from Intl: the app is pt-BR only, and this
// keeps the calendar header identical on every engine.
export const NOMES_MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

// Starting on Sunday, matching getUTCDay().
export const INICIAIS_DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function partesDaData(iso: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return { ano, mes, dia };
}

export function isoDe(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function diasNoMes(ano: number, mes: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

// 0 = domingo, matching INICIAIS_DIAS_SEMANA.
export function diaDaSemana(iso: string): number {
  const { ano, mes, dia } = partesDaData(iso);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

export function primeiroDiaDoMes(iso: string): string {
  const { ano, mes } = partesDaData(iso);
  return isoDe(ano, mes, 1);
}

// Moves whole months, clamping the day so 31/01 + 1 mês lands on 28/02 rather
// than rolling over into March.
export function somarMeses(iso: string, meses: number): string {
  const { ano, mes, dia } = partesDaData(iso);
  const total = (ano * 12 + (mes - 1)) + meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  return isoDe(novoAno, novoMes, Math.min(dia, diasNoMes(novoAno, novoMes)));
}

// Adds whole days to an ISO date, staying in ISO. Done in UTC so a daylight
// saving change can't shift the result by a day.
export function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(ano, mes - 1, dia));
  date.setUTCDate(date.getUTCDate() + dias);
  return date.toISOString().slice(0, 10);
}

// Today as ISO, in the device's own timezone — `new Date().toISOString()`
// would hand back the UTC day, which is the wrong one for part of the evening
// in Brazil.
export function hojeISO(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(
    agora.getDate(),
  ).padStart(2, '0')}`;
}
