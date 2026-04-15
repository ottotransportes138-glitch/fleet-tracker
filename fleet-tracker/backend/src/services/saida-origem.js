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
      "SELECT id, placa, vehicle_id, lat_origem, lng_origem, lat_destino, lng_destino, odometro_inicio, status_carga, km_total_calculado " +
      "FROM viagens WHERE status = 'ativa' AND vehicle_id IS NOT NULL " +
      "AND lat_origem IS NOT NULL AND lng_origem IS NOT NULL"
    );

    for (const viagem of viagens) {
      try {
        const { rows: pos } = await db.query(
          "SELECT lat, lng, odometer FROM positions WHERE vehicle_id = $1 AND odometer > 0 ORDER BY recorded_at DESC LIMIT 1",
          [viagem.vehicle_id]
        );
        if (!pos.length) continue;

        const latAtual = parseFloat(pos[0].lat);
        const lngAtual = parseFloat(pos[0].lng);

        // Distancia da origem
        const distOrigem = distanciaKm(
          parseFloat(viagem.lat_origem), parseFloat(viagem.lng_origem),
          latAtual, lngAtual
        );

        // Saiu da origem - salva odometro e muda para Em Transito
        if (distOrigem > 3 && (!viagem.odometro_inicio || viagem.odometro_inicio == 0)) {
          await db.query(
            "UPDATE viagens SET odometro_inicio = $1, status_carga = 'Em Trânsito' WHERE id = $2",
            [pos[0].odometer, viagem.id]
          );
          console.log("[SAIDA-ORIGEM]", viagem.placa, "saiu da origem - dist:", distOrigem.toFixed(1), "km");
        }

        // Chegou no destino - muda para Ag. Descarga
        if (viagem.lat_destino && viagem.lng_destino && viagem.status_carga === 'Em Trânsito') {
          const distDestino = distanciaKm(
            parseFloat(viagem.lat_destino), parseFloat(viagem.lng_destino),
            latAtual, lngAtual
          );
          if (distDestino < 10) {
            await db.query(
              "UPDATE viagens SET status_carga = 'Ag. Descarga' WHERE id = $1",
              [viagem.id]
            );
            console.log("[CHEGOU-DESTINO]", viagem.placa, "chegou no destino - dist:", distDestino.toFixed(1), "km");
          }
        }

        // Calcula km percorrido pelo hodometro
        if (viagem.odometro_inicio && viagem.odometro_inicio > 0 && pos[0].odometer > viagem.odometro_inicio) {
          const kmPercorrido = Math.round((pos[0].odometer - viagem.odometro_inicio) / 1000 * 10) / 10;
          await db.query(
            "UPDATE viagens SET km_percorrido = $1 WHERE id = $2",
            [kmPercorrido, viagem.id]
          );
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