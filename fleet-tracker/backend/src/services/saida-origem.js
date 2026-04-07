const db = require("../models/db");

function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function verificarSaidaOrigem() {
  try {
    const { rows: viagens } = await db.query(
      "SELECT id, placa, vehicle_id, lat_origem, lng_origem, odometro_inicio " +
      "FROM viagens WHERE status = 'ativa' AND vehicle_id IS NOT NULL " +
      "AND lat_origem IS NOT NULL AND lng_origem IS NOT NULL " +
      "AND (odometro_inicio IS NULL OR odometro_inicio = 0)"
    );

    for (const viagem of viagens) {
      try {
        const { rows: pos } = await db.query(
          "SELECT lat, lng, odometer FROM positions WHERE vehicle_id = $1 AND odometer > 0 ORDER BY recorded_at DESC LIMIT 1",
          [viagem.vehicle_id]
        );
        if (!pos.length || !pos[0].odometer) continue;

        const dist = distanciaKm(
          parseFloat(viagem.lat_origem), parseFloat(viagem.lng_origem),
          parseFloat(pos[0].lat), parseFloat(pos[0].lng)
        );

        if (dist > 3) {
          await db.query(
            "UPDATE viagens SET odometro_inicio = $1 WHERE id = $2",
            [pos[0].odometer, viagem.id]
          );
          console.log("[SAIDA-ORIGEM]", viagem.placa, "dist:", dist.toFixed(1), "km - odo:", pos[0].odometer);
        }
      } catch(e) {
        console.error("[SAIDA-ORIGEM] Erro", viagem.placa, e.message);
      }
    }
  } catch(e) {
    console.error("[SAIDA-ORIGEM] Erro geral:", e.message);
  }
}

module.exports = { verificarSaidaOrigem };