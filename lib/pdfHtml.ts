// Página que extrai o texto de um PDF com o pdf.js.
//
// Roda dentro de uma WebView no celular (components/LeitorPdf.tsx) e de um
// iframe na web (LeitorPdf.web.tsx) — mesma técnica do mapa Leaflet. É o jeito
// de usar o pdf.js sem empacotá-lo no app: a biblioteca vem da CDN, o que
// significa que ler PDF exige internet, diferente do resto do aplicativo.
//
// O texto sai agrupado por linha: cada pedaço traz a coordenada de onde foi
// desenhado, e o que estava na mesma altura vira uma linha só, da esquerda
// para a direita. Sem isso, a tabela de produtos da DANFE chega embaralhada.

export const PDFJS_VERSAO = '4.10.38';

export function pdfHtml(): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script type="module">
  import * as pdfjs from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSAO}/build/pdf.min.mjs';
  pdfjs.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSAO}/build/pdf.worker.min.mjs';

  function responder(msg) {
    var texto = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(texto);
    else if (window.parent !== window) window.parent.postMessage(texto, '*');
  }

  async function extrair(base64) {
    var bruto = atob(base64);
    var bytes = new Uint8Array(bruto.length);
    for (var i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);

    var doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
    var saida = '';
    for (var p = 1; p <= doc.numPages; p++) {
      var conteudo = await (await doc.getPage(p)).getTextContent();
      var linhas = new Map();
      for (var item of conteudo.items) {
        if (typeof item.str !== 'string') continue;
        var y = Math.round(item.transform[5]);
        if (!linhas.has(y)) linhas.set(y, []);
        linhas.get(y).push({ x: item.transform[4], s: item.str });
      }
      var alturas = Array.from(linhas.keys()).sort(function (a, b) { return b - a; });
      for (var y2 of alturas) {
        var pedacos = linhas.get(y2).sort(function (a, b) { return a.x - b.x; });
        saida += pedacos.map(function (t) { return t.s; }).join(' ').replace(/\\s+/g, ' ').trim() + '\\n';
      }
    }
    return saida;
  }

  window.addEventListener('message', async function (e) {
    var dados;
    try { dados = JSON.parse(typeof e.data === 'string' ? e.data : '{}'); } catch (_) { return; }
    if (!dados || dados.tipo !== 'pdf') return;
    try {
      responder({ tipo: 'texto', texto: await extrair(dados.base64) });
    } catch (err) {
      responder({ tipo: 'erro', mensagem: String((err && err.message) || err) });
    }
  });

  // No Android a WebView entrega as mensagens em document, não em window.
  document.addEventListener('message', function (e) { window.dispatchEvent(new MessageEvent('message', { data: e.data })); });

  responder({ tipo: 'pronto' });
</script>
</body>
</html>`;
}
