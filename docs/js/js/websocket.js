// ── WebSocket — recebe posições e alertas em tempo real ──────

let ws, reconnectTimer;

function connect() {
  ws = new WebSocket(CONFIG.WS_URL);

  ws.onopen = () => {
    document.getElementById('ws-status').className = 'status-dot online';
    document.getElementById('ws-label').textContent = 'Conectado';
    clearTimeout(reconnectTimer);
  };

  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);

    if (msg.type === 'positions' && window.onPositionsUpdate) {
      window.onPositionsUpdate(msg.data);
    }

    if (msg.type === 'alerts') {
      msg.data.forEach(showAlertToast);
      const badge = document.getElementById('alert-count');
      if (badge) badge.textContent = parseInt(badge.textContent || 0) + msg.data.length;
    }
  };

  ws.onclose = () => {
    document.getElementById('ws-status').className = 'status-dot offline';
    document.getElementById('ws-label').textContent = 'Reconectando...';
    reconnectTimer = setTimeout(connect, 3000);
  };

  ws.onerror = () => ws.close();
}

function showAlertToast(alert) {
  const toast = document.getElementById('alert-toast');
  if (!toast) return;

  toast.textContent = alert.message;
  toast.className = `alert-toast ${alert.type === 'speed' ? 'warn' : ''}`;
  setTimeout(() => { toast.className = 'alert-toast hidden'; }, 6000);
}

connect();
