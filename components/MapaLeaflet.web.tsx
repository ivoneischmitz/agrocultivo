import { mapaHtml, type OpcoesMapa } from '@/lib/mapaHtml';
import { createElement, forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { MapaLeafletRef } from './MapaLeaflet';

// Web: a mesma página Leaflet (lib/mapaHtml.ts) num iframe. srcdoc herda a
// origem da página, então dá para chamar window.focar do iframe direto.

type Props = OpcoesMapa & {
  style?: StyleProp<ViewStyle>;
  onClique?: (latitude: number, longitude: number) => void;
};

type JanelaMapa = Window & { focar?: (lat: number, lng: number, zoom?: number) => void };

export const MapaLeaflet = forwardRef<MapaLeafletRef, Props>(function MapaLeaflet(
  { style, onClique, centro, zoom, marcadores, selecao },
  ref,
) {
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const onCliqueRef = useRef(onClique);

  useEffect(() => {
    onCliqueRef.current = onClique;
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => mapaHtml({ centro, zoom, marcadores, selecao }), [marcadores]);

  useImperativeHandle(ref, () => ({
    focar(latitude, longitude, z = 16) {
      (iframe.current?.contentWindow as JanelaMapa | null)?.focar?.(latitude, longitude, z);
    },
  }));

  useEffect(() => {
    function aoReceber(e: MessageEvent) {
      if (e.source !== iframe.current?.contentWindow) return;
      try {
        const msg = JSON.parse(String(e.data));
        if (msg.tipo === 'clique') onCliqueRef.current?.(msg.lat, msg.lng);
      } catch {
        // mensagem que não é nossa
      }
    }
    window.addEventListener('message', aoReceber);
    return () => window.removeEventListener('message', aoReceber);
  }, []);

  return (
    <View style={style}>
      {createElement('iframe', {
        ref: iframe,
        srcDoc: html,
        title: 'Mapa',
        style: { border: 0, width: '100%', height: '100%' },
      })}
    </View>
  );
});
