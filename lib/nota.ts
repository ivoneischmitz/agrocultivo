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
