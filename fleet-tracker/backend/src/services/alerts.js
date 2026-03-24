const { getDistance, isPointWithinRadius, getPathLength } = require('geolib');
const db = require('../models/db');

/**
 * Verifica alertas de velocidade e desvio de rota para
 * cada posição recebida. Salva alertas novos no banco.
 */
async function checkAlerts(positions) {
  const alerts = [];

  for (const pos of positions) {
    // ── Alerta de velocidade ─────────────────────────────────
    if (pos.speed > pos.speedLimit) {
      const alert = await saveAlert({
        vehicleId: pos.vehicleId,
        type:      'speed',
        message:   `${pos.name} (${pos.plate}) a ${pos.speed} km/h — limite ${pos.speedLimit} km/h`,
        lat:       pos.lat,
        lng:       pos.lng,
        speed:     pos.speed,
      });
      alerts.push(alert);
    }

    // ── Alerta de desvio de rota ─────────────────────────────
    const { rows: [vr] } = await db.query(
      `SELECT r.waypoints, r.tolerance_m, r.name AS route_name
       FROM vehicle_routes vr
       JOIN routes r ON r.id = vr.route_id
       WHERE vr.vehicle_id = $1 AND vr.active = TRUE
       LIMIT 1`,
      [pos.vehicleId]
    );

    if (vr) {
      const onRoute = isOnRoute(
        { latitude: pos.lat, longitude: pos.lng },
        vr.waypoints,
        vr.tolerance_m
      );

      if (!onRoute) {
        const alert = await saveAlert({
          vehicleId: pos.vehicleId,
          type:      'deviation',
          message:   `${pos.name} (${pos.plate}) desviou da rota "${vr.route_name}"`,
          lat:       pos.lat,
          lng:       pos.lng,
          speed:     pos.speed,
        });
        alerts.push(alert);
      }
    }
  }

  return alerts;
}

/**
 * Verifica se um ponto está dentro da tolerância de algum
 * segmento da rota (waypoints).
 */
function isOnRoute(point, waypoints, toleranceMeters) {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const segmentStart = { latitude: waypoints[i].lat,     longitude: waypoints[i].lng };
    const segmentEnd   = { latitude: waypoints[i+1].lat,   longitude: waypoints[i+1].lng };

    // Distância do ponto ao segmento (aproximação: distância ao ponto mais próximo no segmento)
    const distToStart  = getDistance(point, segmentStart);
    const distToEnd    = getDistance(point, segmentEnd);
    const segLen       = getDistance(segmentStart, segmentEnd);

    // Se está perto do início ou fim do segmento, considera na rota
    if (distToStart <= toleranceMeters || distToEnd <= toleranceMeters) return true;

    // Projeção ortogonal simples
    if (segLen > 0) {
      const t = Math.max(0, Math.min(1,
        ((point.latitude  - segmentStart.latitude)  * (segmentEnd.latitude  - segmentStart.latitude) +
         (point.longitude - segmentStart.longitude) * (segmentEnd.longitude - segmentStart.longitude)) /
        (segLen * segLen)
      ));
      const closest = {
        latitude:  segmentStart.latitude  + t * (segmentEnd.latitude  - segmentStart.latitude),
        longitude: segmentStart.longitude + t * (segmentEnd.longitude - segmentStart.longitude),
      };
      if (getDistance(point, closest) <= toleranceMeters) return true;
    }
  }
  return false;
}

async function saveAlert({ vehicleId, type, message, lat, lng, speed }) {
  const { rows: [alert] } = await db.query(
    `INSERT INTO alerts (vehicle_id, type, message, lat, lng, speed)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [vehicleId, type, message, lat, lng, speed]
  );
  return alert;
}

module.exports = { checkAlerts };
