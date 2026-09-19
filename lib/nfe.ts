import { XMLParser } from 'fast-xml-parser';

// Lê o XML de uma NF-e e devolve o que vira movimentação: emitente como
// descrição, data de emissão e os produtos como itens.

export type NotaImportada = {
  emitente: string;
  data: string | null; // ISO
  itens: { descricao: string; unidade: string; quantidade: number; valor: number }[];
};

type Det = { prod?: { xProd?: string; uCom?: string; qCom?: string | number; vUnCom?: string | number } };

export function lerNfe(xml: string): NotaImportada {
  const json = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' }).parse(xml);
  const inf = json?.nfeProc?.NFe?.infNFe ?? json?.NFe?.infNFe;
  if (!inf) throw new Error('O arquivo não parece ser um XML de NF-e válido.');

  const emissao: string = String(inf.ide?.dhEmi ?? inf.ide?.dEmi ?? '');
  const data = /^\d{4}-\d{2}-\d{2}/.test(emissao) ? emissao.slice(0, 10) : null;

  const dets: Det[] = inf.det ? (Array.isArray(inf.det) ? inf.det : [inf.det]) : [];
  return {
    emitente: String(inf.emit?.xNome ?? ''),
    data,
    itens: dets.map((d) => ({
      descricao: String(d.prod?.xProd ?? ''),
      unidade: String(d.prod?.uCom ?? 'UN'),
      // Na NF-e o decimal é sempre ponto ("12.5000").
      quantidade: Number(d.prod?.qCom ?? 0) || 0,
      valor: Number(d.prod?.vUnCom ?? 0) || 0,
    })),
  };
}
