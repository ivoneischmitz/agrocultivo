import { supabase } from '@/lib/supabase';
import { montarNota, precisaConferir, type ItemLido, type NotaLida } from '@/lib/nota';

// Leitura da foto de um documento de compra.
//
// Diferente do XML e do PDF, aqui não há texto nenhum no arquivo — só pixels
// de um papel fotografado, quase sempre torto e amassado. Reconhecer a tabela
// nisso é trabalho de um serviço de fora, e a chave dele não pode morar no
// aplicativo: qualquer pessoa a extrairia do pacote instalado. Por isso a
// leitura acontece numa função do Supabase (supabase/functions/ler-documento),
// que só responde a quem está logado e é a única que conhece a chave.
//
// Vale para nota fiscal, contrato de insumos, pedido — qualquer papel com uma
// tabela de produtos. É a diferença para lib/danfe.ts, que só sabe ler o
// desenho de uma DANFE.

// O que a função devolve, antes da conferência.
type ItemBruto = {
  descricao?: string;
  unidade?: string;
  quantidade?: number | string;
  valor?: number | string;
  total?: number | string;
};

type Resposta = {
  emitente?: string;
  data?: string | null;
  itens?: ItemBruto[];
  erro?: string;
};

// A resposta vem de um modelo de linguagem: pode trazer número como texto,
// vírgula no lugar do ponto ou o campo faltando. Nada disso deve derrubar a
// tela — item que não vira número é item descartado.
function numero(v: number | string | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;
  const limpo = v.trim().replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(limpo.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export async function lerImagem(base64: string, mimeType: string): Promise<NotaLida> {
  const { data, error } = await supabase.functions.invoke<Resposta>('ler-documento', {
    body: { imagem: base64, mimeType },
  });

  // Erro vindo da função (sem chave configurada, serviço fora do ar, imagem
  // recusada): a mensagem dela é mais útil do que "falhou".
  if (error) {
    const detalhe = await mensagemDoErro(error);
    throw new Error(detalhe ?? 'Não foi possível ler a imagem agora.');
  }
  if (!data || data.erro) throw new Error(data?.erro ?? 'Não foi possível ler a imagem agora.');

  const itens: ItemLido[] = [];
  for (const b of data.itens ?? []) {
    const descricao = (b.descricao ?? '').trim();
    const quantidade = numero(b.quantidade);
    const valor = numero(b.valor);
    if (!descricao || !(quantidade > 0) || !(valor > 0)) continue;
    itens.push({
      descricao,
      unidade: (b.unidade ?? '').trim().toUpperCase() || 'UN',
      quantidade,
      valor,
      conferir: precisaConferir(quantidade, valor, numero(b.total)),
    });
  }

  const data_ = typeof data.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.data) ? data.data : null;
  return montarNota((data.emitente ?? '').trim(), data_, itens);
}

// O supabase-js embrulha a falha e deixa o corpo da resposta dentro do objeto
// de contexto; sem isto, o motivo real se perderia num "Edge Function returned
// a non-2xx status code".
//
// E quando a função nem existe, a mensagem que chega é "Failed to send a
// request to the Edge Function" — em inglês e sem dizer o que fazer. Quem
// está lançando uma despesa no meio da lavoura merece coisa melhor.
async function mensagemDoErro(error: unknown): Promise<string | null> {
  const contexto = (error as { context?: unknown })?.context;
  if (contexto instanceof Response) {
    if (contexto.status === 404) return NAO_PUBLICADA;
    try {
      const corpo = (await contexto.json()) as { erro?: string };
      if (corpo?.erro) return corpo.erro;
    } catch {
      // resposta sem JSON: fica a mensagem genérica
    }
  }
  const bruto = error instanceof Error ? error.message : '';
  if (/failed to send a request|failed to fetch|network/i.test(bruto)) {
    return `${NAO_PUBLICADA} Se ela já foi, confira a internet e tente de novo.`;
  }
  return bruto || null;
}

const NAO_PUBLICADA =
  'A leitura de imagem ainda não está no ar: falta publicar a função ler-documento no Supabase (veja o README).';
