const axios = require('axios');
const db = require('../models/db');

const BASE_URL = process.env.OMNILINK_API_URL;
const TOKEN    = process.env.OMNILINK_TOKEN;

const client = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  timeout: 10_000,
});

/**
 * Busca posições atuais de todos os veículos na Omnilink
 * e salva no banco de dados.
 * Retorna array de posições enriquecidas com dados do veículo.
 */
async function syncOmnilink() {
  // 1. Busca veículos ativos no banco
  const { rows: vehicles } = await db.query(
    `SELECT id, plate, name, omnilink_id, speed_limit FROM vehicles WHERE active = TRUE`
  );

  if (vehicles.length === 0) return [];

  // 2. Busca posições na API Omnilink
  // Adapte o endpoint conforme documentação da sua conta Omnilink
  const ids = vehicles.map(v => v.omnilink_id).join(',');
  const { data } = await client.get('/positions/current', { params: { ids } });

  // 3. Mapeia e salva no banco
  const positions = [];

  for (const item of data) {
    const vehicle = vehicles.find(v => v.omnilink_id === String(item.deviceId));
    if (!vehicle) continue;

    // Salva posição
    await db.query(
      `INSERT INTO positions (vehicle_id, lat, lng, speed, heading, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [vehicle.id, item.latitude, item.longitude, item.speed, item.course, new Date(item.eventTime)]
    );

    positions.push({
      vehicleId:   vehicle.id,
      plate:       vehicle.plate,
      name:        vehicle.name,
      speedLimit:  vehicle.speed_limit,
      lat:         item.latitude,
      lng:         item.longitude,
      speed:       item.speed,
      heading:     item.course,
      recordedAt:  item.eventTime,
    });
  }

  return positions;
}

module.exports = { syncOmnilink };
