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
// Dá para trocar sem mexer no código quando sair um modelo melhor — e é bom
// que dê: o Google aposenta modelo. Quando acontecer, a função devolve 404
// dizendo qual é o substituto, e basta um `supabase secrets set GEMINI_MODEL`.
const MODELO = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.8-flash';

// A camada gratuita conta a cota POR MODELO: 20 leituras por dia em cada um.
// Esgotado o principal, os reservas seguem de pé. Não entra o gemini-3.5-flash:
// testado, estourava o limite de tempo do servidor mesmo sem deliberação.
const RESERVAS = (Deno.env.get('GEMINI_MODELOS_RESERVA') ?? 'gemini-3.7-flash,gemini-3.6-flash,gemini-3.1-flash-lite')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

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

// O app na web roda noutro endereço (agrocultivo.vercel.app) e o navegador
// exige estes cabeçalhos antes de deixar a chamada sair — inclusive uma
// resposta ao OPTIONS que ele manda na frente. Sem isso o pedido nem chega
// aqui, e o erro que aparece na tela é o genérico de rede.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Expose-Headers': 'x-status-real',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Recusa esperada (cota, sobrecarga, imagem grande demais) sai com HTTP 200 e o
// motivo em `erro`, e não com 4xx/5xx.
//
// Qualquer status fora de 2xx faz o supabase-js lançar "Edge Function returned
// a non-2xx status code" e esconder o corpo da resposta — e no celular o app
// nem consegue pegá-lo de volta. Quem estava com a nota na mão via essa frase
// em inglês e não sabia se faltava luz, internet ou cota. O status verdadeiro
// segue no cabeçalho x-status-real e no log, para quem for investigar.
function resposta(corpo: unknown, status = 200): Response {
  const falha = typeof corpo === 'object' && corpo !== null && 'erro' in corpo;
  if (falha) console.error('recusa', status, JSON.stringify(corpo));
  return new Response(JSON.stringify(corpo), {
    status: falha ? 200 : status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      ...(falha ? { 'x-status-real': String(status) } : {}),
    },
  });
}

// Duas recusas do Google são passageiras e não deveriam chegar até quem está
// com a nota na mão:
//
//   503  o modelo está cheio. Passa em segundos.
//   429  a camada gratuita permite vinte leituras por minuto. Estourado o
//        teto, ele mesmo responde "tente de novo em 971ms" — e esperar isso
//        é mais sensato do que mandar a pessoa tentar mais tarde.
//
// Em ambos, espera e tenta de novo aqui mesmo.
async function pedirComPaciencia(url: string, corpo: string): Promise<Response> {
  const esperas = [1000, 3000, 6000];
  for (let i = 0; ; i++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': CHAVE! },
      body: corpo,
    });
    if ((r.status !== 503 && r.status !== 429) || i >= esperas.length) return r;

    // No 429 o Google manda quanto esperar; vale mais que o nosso palpite,
    // desde que seja uma espera de gente — não a de quem gastou a cota do dia.
    let espera = esperas[i];
    if (r.status === 429) {
      const sugerido = segundosSugeridos(await r.clone().text());
      if (sugerido === null || sugerido > 15) return r;
      espera = Math.max(1000, Math.ceil(sugerido * 1000) + 300);
    }
    console.log(`gemini ${r.status}, tentando de novo em ${espera}ms`);
    await new Promise((f) => setTimeout(f, espera));
  }
}

// "Please retry in 971.604942ms" ou o RetryInfo de "1s" que vem nos detalhes.
function segundosSugeridos(bruto: string): number | null {
  const ms = /retry in ([\d.]+)ms/i.exec(bruto);
  if (ms) return Number(ms[1]) / 1000;
  const s = /"retryDelay"\s*:\s*"([\d.]+)s"/i.exec(bruto);
  if (s) return Number(s[1]);
  const seg = /retry in ([\d.]+)s/i.exec(bruto);
  return seg ? Number(seg[1]) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Método não suportado.' }, 405);
  if (!CHAVE) {
    return resposta(
      { erro: 'A leitura de imagem ainda não foi configurada no servidor (falta GEMINI_API_KEY).' },
      503,
    );
  }

  // Diagnóstico: quais modelos esta chave pode usar. O Google aposenta modelo
  // sem avisar, e sem isto descobrir o substituto exige abrir o painel dele.
  if (new URL(req.url).searchParams.has('modelos')) {
    const m = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': CHAVE },
    });
    const j = await m.json();
    return resposta({
      modelos: (j?.models ?? [])
        .filter((x: { supportedGenerationMethods?: string[] }) =>
          x.supportedGenerationMethods?.includes('generateContent'),
        )
        .map((x: { name?: string }) => x.name),
      erroDoGoogle: j?.error?.message,
    });
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

  const pedido = JSON.stringify({
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
          // Sem deliberação antes de responder. Ler uma tabela é transcrever o
          // que se vê, e pensar sobre isso só gastava tempo: com deliberação a
          // chamada passava de oitenta segundos e chegou a estourar o limite
          // do servidor. Quem garante a qualidade aqui é a conferência de
          // quantidade × valor, não o esforço do modelo.
          thinkingConfig: { thinkingBudget: 0 },
        },
  });

  let r!: Response;
  try {
    for (const modelo of [MODELO, ...RESERVAS]) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
      r = await pedirComPaciencia(url, pedido);
      // Só a cota do dia justifica trocar de modelo: ela é por modelo, e o
      // próximo tem a sua. Qualquer outra recusa vale para todos.
      if (r.status === 429 && /PerDay/i.test(await r.clone().text())) {
        console.log(`cota do dia esgotada em ${modelo}, tentando o próximo`);
        continue;
      }
      console.log(`lido com ${modelo}`);
      break;
    }
  } catch {
    return resposta({ erro: 'Não foi possível falar com o serviço de leitura.' }, 502);
  }

  if (!r.ok) {
    const bruto = await r.text();
    console.error('gemini', r.status, bruto);
    if (r.status === 429) {
      // Chegou aqui depois das esperas de pedirComPaciencia. O teto da camada
      // gratuita é por minuto, e vem escrito no recado em inglês; o número
      // ajuda a entender, o resto do texto não.
      const limite = /limit:\s*(\d+)/.exec(bruto)?.[1];
      // O identificador da cota diz a janela: ...PerDay... ou ...PerMinute....
      const idCota = /"quotaId"\s*:\s*"([^"]+)"/.exec(bruto)?.[1] ?? '';
      console.error('cota', limite, idCota);
      const porDia = /PerDay/i.test(idCota);
      return resposta(
        {
          erro: porDia
            ? `O limite diário de leituras foi atingido (${limite ?? '?'} por dia). Volta amanhã.`
            : `O limite de leituras por minuto foi atingido. Espere um minuto e tente de novo.`,
          cota: idCota || undefined,
        },
        502,
      );
    }
    // Chegou aqui depois das tentativas de pedirComPaciencia: a sobrecarga não
    // passou em quinze segundos.
    if (r.status === 503) {
      return resposta(
        { erro: 'O serviço de leitura está sobrecarregado agora. Tente de novo em um minuto.' },
        502,
      );
    }
    // O motivo do Google vai junto. Ele diz o que houve — chave inválida,
    // modelo inexistente, API não habilitada — e sem ele o único caminho para
    // descobrir é abrir o painel. Nada aí é segredo: a chave viaja em
    // cabeçalho, nunca no endereço.
    let motivo = '';
    try {
      motivo = String(JSON.parse(bruto)?.error?.message ?? '').slice(0, 900);
    } catch {
      motivo = bruto.slice(0, 200);
    }
    return resposta(
      { erro: `O serviço de leitura recusou o pedido (${r.status})${motivo ? ': ' + motivo : ''}` },
      502,
    );
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
