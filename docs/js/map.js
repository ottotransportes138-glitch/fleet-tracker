const map = L.map('map', { zoomControl: true }).setView([-15.77, -47.92], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap', maxZoom: 19,
}).addTo(map);

function truckIcon(color = '#3b82f6', speed = 0) {
  const moving = speed > 0;
  return L.divIcon({
    className: '',
    html: `<div style="background:${color};border:2px solid #fff;border-radius:50%;width:${moving?16:14}px;height:${moving?16:14}px;box-shadow:0 0 8px ${color}aa;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:bold;">${moving?'▶':'■'}</div>`,
    iconSize: [16,16], iconAnchor: [8,8],
  });
}

const markers = {};
let viagensMap = {};
let allVehicles = [];
let tabAtual = 'todos';

async function loadViagens() {
  try {
    const res = await fetch(`${CONFIG.API_URL}/api/viagens`);
    const viagens = await res.json();
    viagensMap = {};
    viagens.forEach(v => { if (v.placa) viagensMap[v.placa] = v; });
  } catch(e) { console.error('Erro viagens:', e); }
}

async function loadVehicles() {
  await loadViagens();
  const res = await fetch(`${CONFIG.API_URL}/api/vehicles`);
  const data = await res.json();
  data.forEach(updateVehicle);
  allVehicles = data;
  updateSidebarList(allVehicles);
}

function updateVehicle(v) {
  if (!v.lat || !v.lng) return;
  const over = v.speed > (v.speed_limit || 90);
  const moving = v.speed > 0;
  const color = over ? '#ef4444' : moving ? '#10b981' : '#6b7280';
  const id = v.vehicle_id || v.vehicleId;
  if (markers[id]) {
    markers[id].setLatLng([v.lat, v.lng]);
    markers[id].setIcon(truckIcon(color, v.speed));
  } else {
    markers[id] = L.marker([v.lat, v.lng], { icon: truckIcon(color, v.speed) })
      .addTo(map)
      .bindPopup(() => popupContent(v), { maxWidth: 260 });
  }
  markers[id]._vehicleData = v;
  if (markers[id].isPopupOpen()) markers[id].setPopupContent(popupContent(v));
}

function statusCargaBadge(sc) {
  const m = {
    'Em Trânsito':{ bg:'#dbeafe', color:'#1d4ed8' },
    'Carregar':   { bg:'#fef3c7', color:'#92400e' },
    'Carregado':  { bg:'#ede9fe', color:'#5b21b6' },
    'Ag. Descarga':{ bg:'#d1fae5', color:'#065f46' },
    'Vazio':      { bg:'#f3f4f6', color:'#374151' },
    'Manutenção': { bg:'#fee2e2', color:'#991b1b' },
  };
  const s = m[sc] || { bg:'#f3f4f6', color:'#374151' };
  return `<span style="background:${s.bg};color:${s.color};padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700">${sc||'—'}</span>`;
}

function popupContent(v) {
  const speed = v.speed ?? 0;
  const limit = v.speed_limit || 90;
  const over = speed > limit;
  const moving = speed > 0;
  const status = over ? '🔴 Acima do limite' : moving ? '🟢 Em movimento' : '⚪ Parado';
  const updated = v.recorded_at ? new Date(v.recorded_at).toLocaleString('pt-BR') : '—';
  const viagem = viagensMap[v.plate] || {};
  const km = parseFloat(viagem.km_percorrido) || 0;
  const kmTotal = parseFloat(viagem.km_total_calculado) || 0;
  const pct = kmTotal > 0 ? Math.min(Math.round(km/kmTotal*100), 100) : 0;

  const viagemHtml = viagem.destino ? `
    <tr><td colspan="2" style="padding-top:8px;border-top:1px solid #eee;font-weight:700;color:#d4a017">📦 Viagem</td></tr>
    <tr><td style="color:#888">Status</td><td>${statusCargaBadge(viagem.status_carga)}</td></tr>
    <tr><td style="color:#888">Origem</td><td><b>${viagem.origem||'—'}</b></td></tr>
    <tr><td style="color:#888">Destino</td><td><b>${viagem.destino||'—'}</b></td></tr>
    <tr><td style="color:#888">Cliente</td><td>${viagem.cliente||'—'}</td></tr>
    <tr><td style="color:#888">Motorista</td><td style="font-size:11px">${viagem.motorista||'—'}</td></tr>
    ${kmTotal > 0 ? `<tr><td colspan="2">
      <div style="margin-top:4px">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#888;margin-bottom:3px">
          <span>${km} km</span><span>${pct}% de ${kmTotal} km</span>
        </div>
        <div style="height:6px;background:#e5e7eb;border-radius:3px">
          <div style="height:100%;width:${pct}%;background:#d4a017;border-radius:3px"></div>
        </div>
      </div>
    </td></tr>` : ''}
  ` : '';

  return `
    <div style="font-family:sans-serif;font-size:13px;min-width:220px;line-height:1.6">
      <div style="font-size:16px;font-weight:bold;margin-bottom:4px">🚛 ${v.plate}</div>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="color:#888">Status</td><td><b>${status}</b></td></tr>
        <tr><td style="color:#888">Velocidade</td><td><b>${speed} km/h</b> <span style="color:#aaa">(lim: ${limit})</span></td></tr>
        <tr><td style="color:#888">Atualizado</td><td style="font-size:11px">${updated}</td></tr>
        ${viagemHtml}
      </table>
      <div style="margin-top:8px;text-align:center">
        <a href="https://www.google.com/maps?q=${v.lat},${v.lng}" target="_blank" style="font-size:12px;color:#3b82f6;text-decoration:none">📍 Ver no Google Maps</a>
      </div>
    </div>`;
}

function setTab(tab) {
  tabAtual = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  updateSidebarList(allVehicles);
}

window.setTab = setTab;

function getTipoFrota(plate) {
  const v = viagensMap[plate];
  if (!v) return '';
  // Detecta pelo grupo ou nome — RODOTREM tem grupos 1-JEAN, LS tem outros
  // Usamos o campo que veio do Excel
  return v.tipo_frota || '';
}

function updateSidebarList(vehicles) {
  const el = document.getElementById('vehicle-list');
  if (!vehicles || vehicles.length === 0) {
    el.innerHTML = '<p style="padding:12px;color:#666;font-size:12px">Nenhum veículo ativo</p>';
    return;
  }

  let lista = vehicles.filter(v => v.lat && v.lng);

  // Filtra por tipo se aba selecionada
  if (tabAtual !== 'todos') {
    lista = lista.filter(v => {
      const viagem = viagensMap[v.plate] || {};
      const tipo = (viagem.tipo_frota || '').toUpperCase();
      return tipo === tabAtual;
    });
  }

  // Atualiza contador
  const total = vehicles.filter(v => v.lat && v.lng).length;
  const el2 = document.getElementById('count-total');
  if (el2) el2.textContent = total;

  lista = lista.sort((a, b) => (b.speed||0) - (a.speed||0));

  el.innerHTML = lista.map(v => {
    const speed = v.speed ?? 0;
    const over = speed > (v.speed_limit || 90);
    const moving = speed > 0;
    const color = over ? '#ef4444' : moving ? '#10b981' : '#6b7280';
    const id = v.vehicle_id || v.vehicleId;
    const viagem = viagensMap[v.plate] || {};
    const km = parseFloat(viagem.km_percorrido) || 0;
    const kmTotal = parseFloat(viagem.km_total_calculado) || 0;
    const pct = kmTotal > 0 ? Math.min(Math.round(km/kmTotal*100), 100) : 0;
    const tipo = viagem.tipo_frota ? `<span style="font-size:9px;color:#555;background:#222;padding:1px 5px;border-radius:4px;margin-left:4px">${viagem.tipo_frota}</span>` : '';

    const statusColors = {
      'Em Trânsito':'#3b82f6','Carregar':'#f59e0b','Carregado':'#8b5cf6',
      'Ag. Descarga':'#10b981','Vazio':'#6b7280','Manutenção':'#ef4444'
    };
    const scColor = statusColors[viagem.status_carga] || '#6b7280';

    const viagemHtml = viagem.destino ? `
      <div style="margin-top:4px;font-size:11px;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        📍 ${viagem.origem||'?'} → <b style="color:#d4a017">${viagem.destino||'?'}</b>
      </div>
      <div style="margin-top:3px">
        <span style="background:${scColor}22;color:${scColor};padding:1px 6px;border-radius:8px;font-size:10px;font-weight:700">${viagem.status_carga||''}</span>
      </div>
      ${kmTotal > 0 ? `
      <div style="margin-top:5px">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#555;margin-bottom:2px">
          <span>${km} km</span><span>${pct}% de ${kmTotal}km</span>
        </div>
        <div style="height:4px;background:#222;border-radius:2px">
          <div style="height:100%;width:${pct}%;background:#d4a017;border-radius:2px"></div>
        </div>
      </div>` : ''}
    ` : '';

    return `<div onclick="focusVehicle('${id}')" style="cursor:pointer;padding:8px 10px;border-bottom:1px solid #1a1a1a;display:flex;align-items:flex-start;gap:8px">
      <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;margin-top:3px"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center">
          <span style="font-weight:700;font-size:13px;color:#fff">${v.plate}</span>
          ${tipo}
        </div>
        <div style="font-size:11px;color:#888">${speed} km/h ${over?'⚠️':''}</div>
        ${viagemHtml}
      </div>
    </div>`;
  }).join('');
}

let rotaLayer = null;

function focusVehicle(id) {
  const m = markers[id];
  if (!m) return;
  map.setView(m.getLatLng(), 13);
  m.openPopup();

  // Remove rota anterior
  if (rotaLayer) { map.removeLayer(rotaLayer); rotaLayer = null; }

  // Busca viagem do veiculo
  const v = m._vehicleData;
  if (!v) return;
  const viagem = viagensMap[v.plate];
  if (!viagem || !viagem.id) return;

  // Traça rota OSRM
  fetch(CONFIG.API_URL + "/api/rotas/rota/" + viagem.id)
    .then(r => r.json())
    .then(data => {
      if (!data.geometry) return;
      const coords = data.geometry.coordinates.map(c => [c[1], c[0]]);
      rotaLayer = L.polyline(coords, {
        color: "#d4a017",
        weight: 4,
        opacity: 0.8,
        dashArray: "8,4"
      }).addTo(map);

      // Marcador de destino
      if (coords.length > 0) {
        const dest = coords[coords.length - 1];
        L.marker(dest, {
          icon: L.divIcon({
            html: `<div style="background:#d4a017;color:#111;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap">🏁 ${data.destino||"Destino"}</div>`,
            className: "",
            iconAnchor: [40, 10]
          })
        }).addTo(map);
      }

      // Ajusta zoom para ver rota inteira
      map.fitBounds(rotaLayer.getBounds(), { padding: [40, 40] });
    })
    .catch(e => console.error("Erro rota:", e));
}

window.onPositionsUpdate = function(positions) {
  positions.forEach(updateVehicle);
  allVehicles = Object.values(markers).map(m => m._vehicleData).filter(Boolean);
  updateSidebarList(allVehicles);
  document.getElementById('last-update').textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
};

setInterval(loadViagens, 60000);
loadVehicles();