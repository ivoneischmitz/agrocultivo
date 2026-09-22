import type { NotaImportada } from '@/lib/nfe';

// Leitura do PDF da DANFE.
//
// Diferente do XML, que é dado estruturado, aqui se lê uma página desenhada: o
// texto vem do pdf.js (components/LeitorPdf) já agrupado por linha, e o que
// era coluna vira espaço. Cada emissor desenha do seu jeito, então isto é um
// palpite educado — por isso todo item passa por uma conferência, e a tela
// avisa quando algo não fecha.
//
// A linha de produto da DANFE tem esta ordem:
//
//   CÓDIGO  DESCRIÇÃO  NCM(8)  CST  CFOP(4)  UN  QTD  VL.UNIT  VL.TOTAL  ...
//
// O NCM de oito dígitos seguido de CST e CFOP é a âncora: é o que distingue
// uma linha de produto de qualquer outra linha da página.
const LINHA_PRODUTO =
  /^(\S+)\s+(.+?)\s+(\d{8})\s+(\d{2,4})\s+(\d{4})\s+(\S{1,8})\s+(.*)$/;

// Números no padrão brasileiro: 1.234,56 — e o valor unitário costuma ter
// quatro casas.
const NUMERO = /\d{1,3}(?:\.\d{3})*,\d{2,6}|\d+,\d{2,6}/g;

// Às vezes quantidade e valor saem grudados ("2,00391,5760"): a quantidade tem
// duas casas e o valor unitário, quatro.
const GRUDADO = /^(\d{1,3}(?:\.\d{3})*,\d{2})(\d{1,3}(?:\.\d{3})*,\d{4})$/;

export type ItemDanfe = NotaImportada['itens'][number] & {
  // true quando quantidade × valor não fechou com o total impresso na linha.
  conferir: boolean;
};

export type DanfeImportada = Omit<NotaImportada, 'itens'> & {
  itens: ItemDanfe[];
  // Quantos itens não fecharam a conta.
  paraConferir: number;
};

function numero(texto: string): number {
  return Number(texto.replace(/\./g, '').replace(',', '.'));
}

// Separa a parte numérica da linha em quantidade, valor unitário e total,
// aceitando os casos em que dois números vieram colados.
function numeros(resto: string): number[] {
  const partes: number[] = [];
  for (const bruto of resto.split(/\s+/)) {
    const colado = GRUDADO.exec(bruto);
    if (colado) {
      partes.push(numero(colado[1]), numero(colado[2]));
      continue;
    }
    const achados = bruto.match(NUMERO);
    if (achados) for (const a of achados) partes.push(numero(a));
  }
  return partes;
}

function emitenteDe(linhas: string[]): string {
  const recebemos = linhas.find((l) => /RECEBEMOS D[AEO]/i.test(l));
  const nome = recebemos?.match(/RECEBEMOS D[AEO]\s+(.+?)\s+OS PRODUTOS/i)?.[1];
  if (nome) return nome.trim();
  // Sem a frase de canhoto, o nome do emitente costuma ser a primeira linha
  // longa em maiúsculas.
  return linhas.find((l) => l.length > 12 && l === l.toUpperCase() && /[A-Z]{4}/.test(l))?.trim() ?? '';
}

function dataDe(linhas: string[]): string | null {
  const rotulo = linhas.findIndex((l) => /DATA DE EMISS[AÃ]O/i.test(l));
  // O valor pode estar na mesma linha do rótulo ou na de baixo, conforme o
  // desenho da página.
  const candidatas = [linhas[rotulo] ?? '', linhas[rotulo + 1] ?? '', ...linhas];
  for (const linha of candidatas) {
    const achado = linha.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (achado) return `${achado[3]}-${achado[2]}-${achado[1]}`;
  }
  return null;
}

export function lerDanfe(texto: string): DanfeImportada {
  const linhas = texto
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const itens: ItemDanfe[] = [];

  linhas.forEach((linha, i) => {
    const m = LINHA_PRODUTO.exec(linha);
    if (!m) return;

    const [, , descricao, , , , unidade, resto] = m;
    const n = numeros(resto);
    if (n.length < 3) return;

    const [quantidade, valor, total] = n;
    if (!(quantidade > 0) || !(valor > 0)) return;

    // A conferência que dá confiança ao resultado: se o produto não bate com o
    // total impresso, alguma coluna foi lida errado. Um centavo de diferença é
    // arredondamento da própria nota.
    const calculado = quantidade * valor;
    const conferir = !(total > 0) || Math.abs(calculado - total) > Math.max(0.02, total * 0.001);

    // Descrição em duas linhas: a de baixo entra junto quando é curta e não
    // tem cara de nova linha de produto nem de valor.
    const seguinte = linhas[i + 1] ?? '';
    const continua =
      seguinte.length > 0 &&
      seguinte.length <= 40 &&
      !LINHA_PRODUTO.test(seguinte) &&
      !/,\d{2}\b/.test(seguinte) &&
      !/^(DADOS|CALCULO|INFORMACOES|RESERVADO|VALOR|BASE|TOTAL)/i.test(seguinte);

    itens.push({
      descricao: continua ? `${descricao} ${seguinte}`.trim() : descricao.trim(),
      unidade: unidade.toUpperCase(),
      quantidade,
      valor,
      conferir,
    });
  });

  return {
    emitente: emitenteDe(linhas),
    data: dataDe(linhas),
    itens,
    paraConferir: itens.filter((i) => i.conferir).length,
  };
}
