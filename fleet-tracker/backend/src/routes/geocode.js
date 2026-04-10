const express = require("express");
const db = require("../models/db");
const axios = require("axios");
const router = express.Router();

async function geocodificar(cidade) {
  if (!cidade || cidade.length < 3) return null;
  try {
    const res = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q: cidade + ", Brasil", format: "json", limit: 1 },
      headers: { "User-Agent": "OttoGR-FleetTracker/1.0" },
      timeout: 8000
    });
    if (res.data && res.data.length > 0) {
      return { lat: parseFloat(res.data[0].lat), lng: parseFloat(res.data[0].lon) };
    }
  } catch(e) { console.error("[GEO]", cidade, e.message); }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 1.3);
}

// Geocodifica todas as viagens sem coordenadas
router.get("/buscar", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "q obrigatorio" });
  try {
    const axios = require("axios");
    const result = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q, format: "json", limit: 1 },
      headers: { "User-Agent": "OttoGR-FleetTracker/1.0" },
      timeout: 5000
    });
    if (result.data && result.data.length > 0) {
      return res.json({ lat: parseFloat(result.data[0].lat), lng: parseFloat(result.data[0].lon) });
    }
    res.json({ lat: null, lng: null });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/geocodificar", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id, origem, destino FROM viagens WHERE status='ativa' AND lat_origem IS NULL AND destino IS NOT NULL AND destino != '' LIMIT 80"
    );
    res.json({ iniciado: true, total: rows.length });

    // Processa em background
    (async () => {
      for (const v of rows) {
        try {
          let latOrigem = null, lngOrigem = null, latDestino = null, lngDestino = null, kmTotal = 0;

          if (v.origem && v.origem.length > 2) {
            const geo = await geocodificar(v.origem);
            if (geo) { latOrigem = geo.lat; lngOrigem = geo.lng; }
            await sleep(1100);
          }

          if (v.destino && v.destino.length > 2) {
            const geo = await geocodificar(v.destino);
            if (geo) { latDestino = geo.lat; lngDestino = geo.lng; }
            await sleep(1100);
          }

          if (latOrigem && lngOrigem && latDestino && lngDestino) {
            kmTotal = distanciaKm(latOrigem, lngOrigem, latDestino, lngDestino);
          }

          await db.query(
            "UPDATE viagens SET lat_origem=$1, lng_origem=$2, lat_destino=$3, lng_destino=$4, km_total_calculado=$5 WHERE id=$6",
            [latOrigem, lngOrigem, latDestino, lngDestino, kmTotal, v.id]
          );
          console.log("[GEO] OK:", v.destino, kmTotal + "km");
        } catch(e) {
          console.error("[GEO] Erro:", v.id, e.message);
        }
      }
      console.log("[GEO] Geocodificacao concluida!");
    })();
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;