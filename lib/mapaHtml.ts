// Página Leaflet usada pelo mapa nas três plataformas: no celular dentro de
// uma WebView (components/MapaLeaflet.tsx), na web dentro de um iframe
// (components/MapaLeaflet.web.tsx).
//
// Substitui o react-native-maps do app antigo, que não roda na web e no
// Android exige chave do Google Maps. Leaflet + imagem de satélite da Esri
// não pedem chave nenhuma.
//
// A página expõe duas funções, chamadas de fora:
//   focar(lat, lng, zoom)  — centraliza o mapa
//   marcar(lat, lng)       — move o alfinete do modo seleção
// e, no modo seleção, avisa cada toque com {tipo: 'clique', lat, lng}.

export type Marcador = {
  id: number | string;
  latitude: number;
  longitude: number;
  titulo: string;
  subtitulo?: string;
};

export type OpcoesMapa = {
  centro: { latitude: number; longitude: number };
  zoom: number;
  marcadores: Marcador[];
  // Modo seleção: mostra um alfinete e avisa os toques no mapa.
  selecao?: { latitude: number; longitude: number } | null;
};

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mapaHtml({ centro, zoom, marcadores, selecao }: OpcoesMapa): string {
  const pontos = marcadores.map((m) => ({
    lat: m.latitude,
    lng: m.longitude,
    popup: `<b>${escapar(m.titulo)}</b>${m.subtitulo ? `<br>${escapar(m.subtitulo)}` : ''}`,
  }));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    .pino { background:#ff9800; border:2px solid #fff; border-radius:50%; width:32px; height:32px;
            display:flex; align-items:center; justify-content:center; font-size:16px;
            box-shadow:0 2px 6px rgba(0,0,0,0.5); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    function avisar(msg) {
      var texto = JSON.stringify(msg);
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(texto);
      else if (window.parent !== window) window.parent.postMessage(texto, '*');
    }

    var map = L.map('map').setView([${centro.latitude}, ${centro.longitude}], ${zoom});
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri', maxZoom: 20
    }).addTo(map);

    var icone = L.divIcon({ html: '<div class="pino">🌱</div>', iconSize: [32, 32], iconAnchor: [16, 16], className: '' });
    ${JSON.stringify(pontos)}.forEach(function (p) {
      L.marker([p.lat, p.lng], { icon: icone }).addTo(map).bindPopup(p.popup);
    });

    window.focar = function (lat, lng, zoom) { map.setView([lat, lng], zoom || 16); };

    var alfinete = null;
    window.marcar = function (lat, lng) {
      if (!alfinete) alfinete = L.marker([lat, lng]).addTo(map);
      else alfinete.setLatLng([lat, lng]);
    };

    ${
      selecao
        ? `window.marcar(${selecao.latitude}, ${selecao.longitude});
    map.on('click', function (e) {
      window.marcar(e.latlng.lat, e.latlng.lng);
      avisar({ tipo: 'clique', lat: e.latlng.lat, lng: e.latlng.lng });
    });`
        : ''
    }
  </script>
</body>
</html>`;
}
