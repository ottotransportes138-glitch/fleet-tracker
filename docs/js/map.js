// ── Mapa ao vivo com Leaflet.js ──────────────────────────────

const map = L.map('map', { zoomControl: true }).setView([-15.77, -47.92], 5);

// Tiles OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 19,
}).addTo(map);

// Ícone personalizado para caminhões
function truckIcon(color = '#3b82f6') {
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${color};border:2px solid #fff;
      border-radius:50%;width:14px;height:14px;
      box-shadow:0 0 6px ${color}88;">
    </div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const markers   = {};  // vehicleId → L.marker
const routeLines = {}; // routeId → L.polyline

// ── Carrega veículos iniciais ────────────────────────────────
async function loadVehicles() {
  const res  = await fetch(`${CONFIG.API_URL}/api/vehicles`);
  const data = await res.json();
  data.forEach(updateVehicle);
  updateSidebarList(data);
}

// ── Atualiza ou cria marcador do veículo ─────────────────────
function updateVehicle(v) {
  if (!v.lat || !v.lng) return;

  const over  = v.speed > v.speed_limit;
  const color = over ? '#ef4444' : '#10b981';

  if (markers[v.vehicle_id]) {
    markers[v.vehicle_id].setLatLng([v.lat, v.lng]);
    markers[v.vehicle_id].setIcon(truckIcon(color));
  } else {
    markers[v.vehicle_id] = L.marker([v.lat, v.lng], { icon: truckIcon(color) })
      .addTo(map)
      .bindPopup(() => popupContent(v));
  }

  // Atualiza popup se aberto
  if (markers[v.vehicle_id].isPopupOpen()) {
    markers[v.vehicle_id].setPopupContent(popupContent(v));
  }

  // Desenha rota se ainda não desenhada
  if (v.route_waypoints && !routeLines[v.route_id]) {
    const coords = v.route_waypoints.map(wp => [wp.lat, wp.lng]);
    routeLines[v.route_id] = L.polyline(coords, {
      color: '#3b82f6', weight: 2, opacity: .6, dashArray: '6 4',
    }).addTo(map);
  }
}

function popupContent(v) {
  return `
    <div style="font-family:'IBM Plex Sans',sans-serif;font-size:13px;min-width:160px">
      <b style="font-size:14px">${v.plate}</b><br>
      <span style="color:#6b7191">${v.name}</span><br><br>
      <b>Velocidade:</b> ${v.speed ?? 0} km/h
        ${v.speed > v.speed_limit ? `<span style="color:#ef4444"> ⚠ acima do limite</span>` : ''}<br>
      <b>Rota:</b> ${v.route_name || '—'}<br>
      <b>Atualizado:</b> ${new Date(v.recorded_at).toLocaleTimeString('pt-BR')}
    </div>`;
}

// ── Sidebar com lista de veículos ────────────────────────────
function updateSidebarList(vehicles) {
  const el = document.getElementById('vehicle-list');
  el.innerHTML = vehicles.map(v => `
    <div class="vehicle-item" onclick="focusVehicle('${v.vehicle_id}')">
      <div class="vehicle-dot ${v.speed > v.speed_limit ? 'alert' : ''}"></div>
      <div class="vehicle-info">
        <div class="vehicle-plate">${v.plate}</div>
        <div class="vehicle-speed">${v.speed ?? 0} km/h</div>
      </div>
    </div>
  `).join('');
}

function focusVehicle(id) {
  const m = markers[id];
  if (m) { map.setView(m.getLatLng(), 14); m.openPopup(); }
}

// ── Atualiza posições via WebSocket ──────────────────────────
window.onPositionsUpdate = function(positions) {
  positions.forEach(updateVehicle);
  updateSidebarList(positions);
  document.getElementById('last-update').textContent =
    'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
};

loadVehicles();
