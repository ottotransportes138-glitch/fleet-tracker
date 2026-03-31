const express = require("express");
const db = require("../models/db");
const axios = require("axios");
const router = express.Router();
console.log("[VIAGENS] Rota carregada!");

// Geocodifica uma cidade usando Nominatim (gratuito)
async function geocodificar(cidade) {
  if (!cidade) return null;
  try {
    const res = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q: cidade + ", Brasil", format: "json", limit: 1 },
      headers: { "User-Agent": "OttoGR-FleetTracker/1.0" },
      timeout: 5000
    });
    if (res.data && res.data.length > 0) {
      return { lat: parseFloat(res.data[0].lat), lng: parseFloat(res.data[0].lon) };
    }
  } catch(e) { console.error("[GEO] Erro:", e.message); }
  return null;
}

// Calcula distância em km entre dois pontos GPS (Haversine)
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Calcula km percorrido desde o início da viagem
async function calcularKmPercorrido(vehicleId, criadoEm) {
  if (!vehicleId) return 0;
  try {
    const { rows } = await db.query(`
      SELECT lat, lng FROM positions
      WHERE vehicle_id = $1 AND recorded_at >= $2
      ORDER BY recorded_at ASC
    `, [vehicleId, criadoEm]);
    if (rows.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < rows.length; i++) {
      total += distanciaKm(
        parseFloat(rows[i-1].lat), parseFloat(rows[i-1].lng),
        parseFloat(rows[i].lat), parseFloat(rows[i].lng)
      );
    }
    return Math.round(total * 10) / 10;
  } catch(e) { return 0; }
}

// Lista viagens ativas com progresso
router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT v.*,
        p.lat as lat_atual, p.lng as lng_atual, p.speed as velocidade_atual
      FROM viagens v
      LEFT JOIN LATERAL (
        SELECT lat, lng, speed FROM positions
        WHERE vehicle_id = v.vehicle_id
        ORDER BY recorded_at DESC LIMIT 1
      ) p ON true
      WHERE v.status = 'ativa'
      ORDER BY v.criado_em DESC
    `);

    // Calcula km percorrido para cada viagem
    const result = await Promise.all(rows.map(async (v) => {
      const km = await calcularKmPercorrido(v.vehicle_id, v.criado_em);
      const pct = v.km_total_calculado > 0 ? Math.min(Math.round(km / v.km_total_calculado * 100), 100) : 0;
      return { ...v, km_percorrido: km, progresso_pct: pct };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload de viagens via Excel
router.post("/upload", async (req, res) => {
  try {
    const viagens = req.body;
    if (!Array.isArray(viagens)) return res.status(400).json({ error: "Envie um array" });
    let importadas = 0;
    let erros = [];
    await db.query("UPDATE viagens SET status='cancelada' WHERE status='ativa'");
    for (const v of viagens) {
      try {
        const placa = (v.Placa || v.placa || '').toString().trim().toUpperCase();
        if (!placa) continue;
        const motorista = v.Motorista || v.motorista || '';
        const status = v.Status || v.status || '';
        const destino = v.Destino || v.destino || '';
        const cliente = v.Cliente || v.cliente || '';
        const regiao = v['Regiao'] || v['Região'] || v.regiao || '';
        const grupo = v.Grupo || v.grupo || '';
        const ref = v['Ref.'] || v.ref || '';
        const { rows } = await db.query("SELECT id FROM vehicles WHERE plate = $1 LIMIT 1", [placa]);
        const vehicleId = rows.length > 0 ? rows[0].id : null;

        // Geocodifica origem e destino
        let latOrigem = null, lngOrigem = null, latDestino = null, lngDestino = null, kmTotal = 0;
        if (regiao) {
          const geoOrigem = await geocodificar(regiao);
          if (geoOrigem) { latOrigem = geoOrigem.lat; lngOrigem = geoOrigem.lng; }
        }
        if (destino && destino.length > 2) {
          const geoDestino = await geocodificar(destino);
          if (geoDestino) {
            latDestino = geoDestino.lat; lngDestino = geoDestino.lng;
            if (latOrigem && lngOrigem) {
              kmTotal = Math.round(distanciaKm(latOrigem, lngOrigem, latDestino, lngDestino) * 1.3); // fator de rota
            }
          }
        }

        await db.query(`
          INSERT INTO viagens (vehicle_id, placa, motorista, origem, destino, cliente, status_carga, grupo, ref_data,
            km_total, km_total_calculado, lat_origem, lng_origem, lat_destino, lng_destino)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14)
        `, [vehicleId, placa, motorista, regiao, destino, cliente, status, grupo, ref, kmTotal,
            latOrigem, lngOrigem, latDestino, lngDestino]);
        importadas++;
      } catch (e) {
        erros.push(placa + ": " + e.message);
      }
    }
    res.json({ importadas, erros });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/concluir", async (req, res) => {
  try {
    await db.query("UPDATE viagens SET status='concluida', concluido_em=NOW() WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/:id/km", async (req, res) => {
  try {
    const { km } = req.body;
    await db.query("UPDATE viagens SET km_percorrido=$1 WHERE id=$2", [km, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;