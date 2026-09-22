import { pdfHtml } from '@/lib/pdfHtml';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import WebView from 'react-native-webview';

// Android/iOS: extrai o texto de um PDF numa WebView escondida, com o pdf.js
// (ver lib/pdfHtml.ts). A versão web é LeitorPdf.web.tsx.
//
// Fica montado na tela de lançamento, com tamanho zero: a WebView precisa
// existir antes de haver PDF para ler, senão a primeira leitura esperaria o
// carregamento da biblioteca.

export type LeitorPdfRef = {
  extrairTexto: (base64: string) => Promise<string>;
};

export const LeitorPdf = forwardRef<LeitorPdfRef>(function LeitorPdf(_props, ref) {
  const webView = useRef<WebView>(null);
  const pendente = useRef<{ ok: (t: string) => void; falha: (e: Error) => void } | null>(null);
  const html = useMemo(() => pdfHtml(), []);

  useImperativeHandle(ref, () => ({
    extrairTexto(base64) {
      return new Promise<string>((ok, falha) => {
        pendente.current = { ok, falha };
        webView.current?.injectJavaScript(
          `window.dispatchEvent(new MessageEvent('message', { data: ${JSON.stringify(
            JSON.stringify({ tipo: 'pdf', base64 }),
          )} })); true;`,
        );
        // Rede lenta ou PDF grande: melhor avisar do que deixar o botão girando.
        setTimeout(() => {
          if (pendente.current) {
            pendente.current.falha(new Error('A leitura do PDF demorou demais. Tente de novo.'));
            pendente.current = null;
          }
        }, 45_000);
      });
    },
  }));

  return (
    <WebView
      ref={webView}
      source={{ html, baseUrl: 'https://localhost' }}
      originWhitelist={['*']}
      javaScriptEnabled
      style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}
      onMessage={(e) => {
        let msg: { tipo?: string; texto?: string; mensagem?: string };
        try {
          msg = JSON.parse(e.nativeEvent.data);
        } catch {
          return;
        }
        if (msg.tipo === 'texto' && pendente.current) {
          pendente.current.ok(msg.texto ?? '');
          pendente.current = null;
        }
        if (msg.tipo === 'erro' && pendente.current) {
          pendente.current.falha(new Error(msg.mensagem ?? 'Falha ao ler o PDF.'));
          pendente.current = null;
        }
      }}
    />
  );
});
