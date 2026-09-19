import { mapaHtml, type OpcoesMapa } from '@/lib/mapaHtml';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import WebView from 'react-native-webview';

// Android/iOS: a página Leaflet (lib/mapaHtml.ts) numa WebView. A versão web
// é MapaLeaflet.web.tsx — o Metro escolhe o arquivo pela plataforma.

export type MapaLeafletRef = {
  focar: (latitude: number, longitude: number, zoom?: number) => void;
};

type Props = OpcoesMapa & {
  style?: StyleProp<ViewStyle>;
  onClique?: (latitude: number, longitude: number) => void;
};

export const MapaLeaflet = forwardRef<MapaLeafletRef, Props>(function MapaLeaflet(
  { style, onClique, centro, zoom, marcadores, selecao },
  ref,
) {
  const webView = useRef<WebView>(null);

  // O HTML só é montado uma vez por conjunto de marcadores. Mudar a seleção
  // depois (toque no mapa) não recarrega a página: o alfinete já se moveu lá.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => mapaHtml({ centro, zoom, marcadores, selecao }), [marcadores]);

  useImperativeHandle(ref, () => ({
    focar(latitude, longitude, z = 16) {
      webView.current?.injectJavaScript(`window.focar(${latitude}, ${longitude}, ${z}); true;`);
    },
  }));

  return (
    <WebView
      ref={webView}
      style={style}
      source={{ html }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      onMessage={(e) => {
        try {
          const msg = JSON.parse(e.nativeEvent.data);
          if (msg.tipo === 'clique') onClique?.(msg.lat, msg.lng);
        } catch {
          // mensagem que não é nossa
        }
      }}
    />
  );
});
