// Lê os produtos de uma foto de documento (nota, contrato, pedido).
//
// Mora aqui, e não no aplicativo, por um motivo só: a chave do serviço de
// leitura. Uma chave dentro do app instalado é uma chave pública — qualquer
// pessoa a extrai do pacote e passa a gastar na sua conta. Aqui ela fica como
// segredo do projeto e nunca sai do servidor.
//
// Quem chama precisa estar logado. O Supabase confere o token antes de a
// função rodar, desde que ela não seja publicada com --no-verify-jwt.
//
// Publicar:
//   supabase secrets set GEMINI_API_KEY=...      (uma vez)
//   supabase functions deploy ler-documento

const CHAVE = Deno.env.get('GEMINI_API_KEY');
// Dá para trocar sem mexer no código quando sair um modelo melhor.
const MODELO = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash';

const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
// Uma foto de celular passa longe disso; o limite existe para um arquivo
// grande demais não virar uma conta grande demais.
const MAX_BYTES = 12 * 1024 * 1024;

const INSTRUCAO = `Você lê documentos de compra de insumos agrícolas no Brasil: notas fiscais,
contratos de compra e venda, pedidos e orçamentos. A foto costuma estar torta, amassada ou com
sombra.

Extraia a tabela de produtos. Para cada linha devolva:
- descricao: o nome do produto como está escrito, sem abreviar nem corrigir
- unidade: a unidade/embalagem da linha (SACAS, KG, LT, 5 LTS, UN...), vazio se não houver
- quantidade: a quantidade
- valor: o preço unitário
- total: o valor total da linha como está impresso

Regras:
- Números em JSON usam ponto decimal: o que no papel é 1.234,56 vira 1234.56.
- Copie o total impresso; não o recalcule. Ele é usado para conferir a leitura.
- Confira cada linha olhando a coluna, não a altura na foto: em papel torto o nome do produto
  pode parecer alinhado com o número da linha de cima.
- Se o documento tiver um total geral, a soma dos totais das linhas deve bater com ele. Se não
  bater, releia antes de responder.
- Não invente linhas nem complete o que não estiver legível. Linha ilegível fica de fora.
- emitente: o nome da empresa vendedora. data: a data do documento em AAAA-MM-DD, ou vazio.
- Se a imagem não for um documento de compra com tabela de produtos, devolva itens vazio.`;

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    emitente: { type: 'STRING' },
    data: { type: 'STRING' },
    itens: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          descricao: { type: 'STRING' },
          unidade: { type: 'STRING' },
          quantidade: { type: 'NUMBER' },
          valor: { type: 'NUMBER' },
          total: { type: 'NUMBER' },
        },
        required: ['descricao', 'quantidade', 'valor', 'total'],
      },
    },
  },
  required: ['itens'],
};

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta({ erro: 'Método não suportado.' }, 405);
  if (!CHAVE) {
    return resposta(
      { erro: 'A leitura de imagem ainda não foi configurada no servidor (falta GEMINI_API_KEY).' },
      503,
    );
  }

  let imagem: string;
  let mimeType: string;
  try {
    const corpo = await req.json();
    imagem = String(corpo?.imagem ?? '');
    mimeType = String(corpo?.mimeType ?? 'image/jpeg').toLowerCase();
  } catch {
    return resposta({ erro: 'Pedido inválido.' }, 400);
  }

  if (!imagem) return resposta({ erro: 'Nenhuma imagem recebida.' }, 400);
  if (!TIPOS_ACEITOS.includes(mimeType)) {
    return resposta({ erro: 'Formato de imagem não aceito. Use JPG ou PNG.' }, 400);
  }
  // base64 cresce um terço sobre o arquivo original.
  if (imagem.length * 0.75 > MAX_BYTES) {
    return resposta({ erro: 'Imagem grande demais. Tire a foto com menos resolução.' }, 413);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;
  let r: Response;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': CHAVE },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Leia os produtos deste documento.' },
              { inline_data: { mime_type: mimeType, data: imagem } },
            ],
          },
        ],
        systemInstruction: { parts: [{ text: INSTRUCAO }] },
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: ESQUEMA,
        },
      }),
    });
  } catch {
    return resposta({ erro: 'Não foi possível falar com o serviço de leitura.' }, 502);
  }

  if (!r.ok) {
    // O texto do Google costuma dizer o que houve (cota, chave inválida); vai
    // para o log da função, não para a tela de quem está lançando a despesa.
    console.error('gemini', r.status, await r.text());
    const erro =
      r.status === 429
        ? 'O limite de leituras do serviço foi atingido. Tente de novo mais tarde.'
        : 'O serviço de leitura recusou o pedido.';
    return resposta({ erro }, 502);
  }

  const json = await r.json();
  const texto = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof texto !== 'string') {
    console.error('gemini sem texto', JSON.stringify(json).slice(0, 2000));
    return resposta({ erro: 'A leitura voltou vazia. Tente outra foto, mais reta e com mais luz.' }, 502);
  }

  try {
    return resposta(JSON.parse(texto));
  } catch {
    return resposta({ erro: 'Não entendi a resposta do serviço de leitura.' }, 502);
  }
});
