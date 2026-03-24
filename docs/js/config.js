// Configuração global — edite com a URL do seu backend no Railway
const CONFIG = {
  API_URL: 'https://fleet-tracker-backend.up.railway.app',
  WS_URL:  'wss://fleet-tracker-backend.up.railway.app',
};

// Em desenvolvimento, use localhost
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  CONFIG.API_URL = 'http://localhost:3000';
  CONFIG.WS_URL  = 'ws://localhost:3000';
}
