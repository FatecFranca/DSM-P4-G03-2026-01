/**
 * Gera o HTML do mapa Leaflet (OpenStreetMap) renderizado dentro de um WebView.
 * O mapa é centrado em `lat`/`lng` com um marker, e expõe `moveMarker(a,b)` e
 * `centerMap()` para atualizações via `injectJavaScript` sem recarregar o HTML.
 */
export function generateMapHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=yes">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    *{margin:0;padding:0}
    html,body,#map{width:100%;height:100%}
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map=L.map('map',{zoomControl:true}).setView([${lat},${lng}],17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,
      attribution:'&copy; OpenStreetMap'
    }).addTo(map);
    var marker=L.marker([${lat},${lng}]).addTo(map);
    function moveMarker(a,b){marker.setLatLng([a,b])}
    function centerMap(){map.setView(marker.getLatLng(),map.getZoom())}
  </script>
</body>
</html>`;
}
