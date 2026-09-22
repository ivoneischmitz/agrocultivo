import { pdfHtml } from '@/lib/pdfHtml';
import { createElement, forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { LeitorPdfRef } from './LeitorPdf';

// Web: mesma página do pdf.js (lib/pdfHtml.ts) num iframe escondido.

export const LeitorPdf = forwardRef<LeitorPdfRef>(function LeitorPdf(_props, ref) {
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const pendente = useRef<{ ok: (t: string) => void; falha: (e: Error) => void } | null>(null);
  const html = useMemo(() => pdfHtml(), []);

  useImperativeHandle(ref, () => ({
    extrairTexto(base64) {
      return new Promise<string>((ok, falha) => {
        pendente.current = { ok, falha };
        iframe.current?.contentWindow?.postMessage(JSON.stringify({ tipo: 'pdf', base64 }), '*');
        setTimeout(() => {
          if (pendente.current) {
            pendente.current.falha(new Error('A leitura do PDF demorou demais. Tente de novo.'));
            pendente.current = null;
          }
        }, 45_000);
      });
    },
  }));

  useEffect(() => {
    function aoReceber(e: MessageEvent) {
      if (e.source !== iframe.current?.contentWindow) return;
      let msg: { tipo?: string; texto?: string; mensagem?: string };
      try {
        msg = JSON.parse(String(e.data));
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
    }
    window.addEventListener('message', aoReceber);
    return () => window.removeEventListener('message', aoReceber);
  }, []);

  return createElement('iframe', {
    ref: iframe,
    srcDoc: html,
    title: 'Leitor de PDF',
    style: { width: 0, height: 0, border: 0, position: 'absolute', visibility: 'hidden' },
  });
});
