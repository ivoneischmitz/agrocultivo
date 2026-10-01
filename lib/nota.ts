// O que o app entende por "nota lida", venha ela de onde vier.
//
// São três origens, da mais confiável para a menos: o XML da NF-e (dado
// estruturado, sai exato), o PDF da DANFE (página desenhada, reconhecida por
// regra) e a foto do papel (lida por um serviço de fora, ver lib/imagemNota).
// As duas últimas são palpite educado, e é por isso que cada item carrega o
// resultado de uma conferência.

export type ItemLido = {
  descricao: string;
  unidade: string;
  quantidade: number;
  valor: number;
  // true quando quantidade × valor não fechou com o total impresso na linha.
  conferir: boolean;
};

export type NotaLida = {
  emitente: string;
  data: string | null; // ISO
  itens: ItemLido[];
  // Quantos itens não fecharam a conta.
  paraConferir: number;
};

// A conferência que dá confiança ao resultado: se quantidade × valor não bate
// com o total impresso, alguma coluna foi lida errado.
//
// A folga não é fixa porque o próprio documento arredonda. Um contrato que
// mostra 3,49 pode estar cobrando 3,4864 — com 3.800 sacas, isso dá treze
// reais de diferença legítima. Daí o termo proporcional à quantidade: meio
// centavo por unidade é o máximo que esconder duas casas decimais consegue
// produzir.
export function precisaConferir(quantidade: number, valor: number, total: number): boolean {
  if (!(total > 0)) return true;
  const folga = Math.max(0.02, quantidade * 0.005, total * 0.001);
  return Math.abs(quantidade * valor - total) > folga;
}

export function montarNota(emitente: string, data: string | null, itens: ItemLido[]): NotaLida {
  return { emitente, data, itens, paraConferir: itens.filter((i) => i.conferir).length };
}

// A embalagem impressa no documento, traduzida para a lista de unidades do app
// (UNIDADES em lib/tipos.ts).
//
// O papel escreve o que o fornecedor usa — "5 LTS", "SACAS (40 KG)", "LT" — e
// nada disso é uma das opções do formulário. Sem traduzir, o item chegava com
// uma unidade que o campo de escolha não reconhece.
//
// A regra de volume vale na prática da lavoura: o defensivo que vem em cinco
// litros vem em galão, o de vinte vem em balde. Outro tamanho qualquer
// continua sendo litro, que é o que de fato se comprou.
export function unidadeDoDocumento(texto: string | null | undefined): string {
  const t = (texto ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Z0-9,.]+/g, ' ')
    .trim();
  if (!t) return 'UN - Unidade';

  // Saca antes de quilo: "SACAS (40 KG)" tem os dois, e o que se compra é a
  // saca.
  if (/\b(SC|SACO|SACOS|SACA|SACAS)\b/.test(t)) return 'SC - Sacas';
  if (/\b(TN|TON|TONELADA|TONELADAS)\b/.test(t)) return 'TN - Tonelada';
  if (/\b(BL|BALDE|BALDES)\b/.test(t)) return 'BL - Balde';
  if (/\b(GL|GALAO|GALOES)\b/.test(t)) return 'GL - Galão';

  // Volume com tamanho: é o tamanho que diz qual é a embalagem.
  const litros = /\b(\d+(?:[.,]\d+)?)\s*(L|LT|LTS|LITRO|LITROS)\b/.exec(t);
  if (litros) {
    const n = Number(litros[1].replace(',', '.'));
    if (n === 5) return 'GL - Galão';
    if (n === 20) return 'BL - Balde';
    return 'LT - Litro';
  }
  if (/\b(L|LT|LTS|LITRO|LITROS)\b/.test(t)) return 'LT - Litro';
  if (/\b(KG|KGS|QUILO|QUILOS|KILO|KILOS)\b/.test(t)) return 'KG - Kilo';
  return 'UN - Unidade';
}
