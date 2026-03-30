const map = L.map('map', { zoomControl: true }).setView([-15.77, -47.92], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 19,
}).addTo(map);

function truckIcon(color = '#3b82f6', speed = 0) {
  const moving = speed > 0;
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${color};
      border:2px solid #fff;
      border-radius:50%;
      width:${moving ? 16 : 14}px;
      height:${moving ? 16 : 14}px;
      box-shadow:0 0 8px ${color}aa;
      display:flex;align-items:center;justify-content:center;
      font-size:9px;color:#fff;font-weight:bold;">
      ${moving ? '▶' : '■'}
    </div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

const markers = {};
const routeLines = {};

async function loadVehicles() {
  const res = await fetch(`${CONFIG.API_URL}/api/vehicles`);
  const data = await res.json();
  data.forEach(updateVehicle);
  updateSidebarList(data);
}

function updateVehicle(v) {
  if (!v.lat || !v.lng) return;

  const over = v.speed > (v.speed_limit || 80);
  const moving = v.speed > 0;
  const color = over ? '#ef4444' : moving ? '#10b981' : '#6b7280';
  const id = v.vehicle_id || v.vehicleId;

  if (markers[id]) {
    markers[id].setLatLng([v.lat, v.lng]);
    markers[id].setIcon(truckIcon(color, v.speed));
  } else {
    markers[id] = L.marker([v.lat, v.lng], { icon: truckIcon(color, v.speed) })
      .addTo(map)
      .bindPopup(() => popupContent(v), { maxWidth: 220 });
  }

  markers[id]._vehicleData = v;

  if (markers[id].isPopupOpen()) {
    markers[id].setPopupContent(popupContent(v));
  }

  if (v.route_waypoints && !routeLines[v.route_id]) {
    const coords = v.route_waypoints.map(wp => [wp.lat, wp.lng]);
    routeLines[v.route_id] = L.polyline(coords, {
      color: '#3b82f6', weight: 2, opacity: .6, dashArray: '6 4',
    }).addTo(map);
  }
}

function popupContent(v) {
  const speed = v.speed ?? 0;
  const limit = v.speed_limit || 80;
  const over = speed > limit;
  const moving = speed > 0;
  const status = over ? '🔴 Acima do limite' : moving ? '🟢 Em movimento' : '⚪ Parado';
  const updated = v.recorded_at ? new Date(v.recorded_at).toLocaleString('pt-BR') : '—';

  return `
    <div style="font-family:sans-serif;font-size:13px;min-width:180px;line-height:1.6">
      <div style="font-size:16px;font-weight:bold;margin-bottom:4px">🚛 ${v.plate}</div>
      <div style="color:#555;margin-bottom:8px">${v.name || v.plate}</div>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="color:#888">Status</td><td><b>${status}</b></td></tr>
        <tr><td style="color:#888">Velocidade</td><td><b>${speed} km/h</b> <span style="color:#aaa">(lim: ${limit})</span></td></tr>
        <tr><td style="color:#888">Rota</td><td>${v.route_name || '—'}</td></tr>
        <tr><td style="color:#888">Lat/Lng</td><td style="font-size:11px">${Number(v.lat).toFixed(5)}, ${Number(v.lng).toFixed(5)}</td></tr>
        <tr><td style="color:#888">Atualizado</td><td style="font-size:11px">${updated}</td></tr>
      </table>
      <div style="margin-top:8px;text-align:center">
        <a href="https://www.google.com/maps?q=${v.lat},${v.lng}" target="_blank"
          style="font-size:12px;color:#3b82f6;text-decoration:none">
          📍 Ver no Google Maps
        </a>
      </div>
    </div>`;
}

function updateSidebarList(vehicles) {
  const el = document.getElementById('vehicle-list');
  if (!vehicles || vehicles.length === 0) {
    el.innerHTML = '<p class="muted">Nenhum veículo ativo</p>';
    return;
  }
  el.innerHTML = vehicles
    .filter(v => v.lat && v.lng)
    .sort((a, b) => (b.speed || 0) - (a.speed || 0))
    .map(v => {
      const speed = v.speed ?? 0;
      const over = speed > (v.speed_limit || 80);
      const moving = speed > 0;
      const color = over ? '#ef4444' : moving ? '#10b981' : '#6b7280';
      const id = v.vehicle_id || v.vehicleId;
      return `
        <div class="vehicle-item" onclick="focusVehicle('${id}')"
          style="cursor:pointer;padding:6px 8px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:8px">
          <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:bold;font-size:13px">${v.plate}</div>
            <div style="font-size:11px;color:#888">${speed} km/h ${over ? '⚠️' : ''}</div>
          </div>
        </div>`;
    }).join('');
}

function focusVehicle(id) {
  const m = markers[id];
  if (m) { map.setView(m.getLatLng(), 15); m.openPopup(); }
}

window.onPositionsUpdate = function(positions) {
  positions.forEach(updateVehicle);
  const allVehicles = Object.values(markers).map(m => m._vehicleData).filter(Boolean);
  updateSidebarList(allVehicles);
  document.getElementById('last-update').textContent =
    'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
};

loadVehicles();