const express = require("express");
const axios = require("axios");
const db = require("../models/db");
const router = express.Router();

// Calcula distancia real pela estrada via OSRM
async function calcularRotaOSRM(latO, lngO, latD, lngD) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lngO},${latO};${lngD},${latD}?overview=false`;
    const { data } = await axios.get(url, { timeout: 10000 });
    if (data.code === "Ok" && data.routes && data.routes.length > 0) {
      return Math.round(data.routes[0].distance / 1000 * 10) / 10; // metros -> km
    }
    return null;
  } catch(e) {
    return null;
  }
}

// Atualiza km_total_calculado de todas as viagens com coordenadas
// Calcula rota entre dois pontos para o modal
router.get("/calcular", async (req, res) => {
  try {
    const { lat_o, lng_o, lat_d, lng_d } = req.query;
    if (!lat_o || !lng_o || !lat_d || !lng_d) return res.status(400).json({ error: "Coordenadas obrigatorias" });
    const axios = require("axios");
    const ORS_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjJmYmZjM2FhYzExODQyY2Y4M2YxZGMzOWQ4NGIyY2E1IiwiaCI6Im11cm11cjY0In0=";
    try {
      const r = await axios.post("https://api.openrouteservice.org/v2/directions/driving-hgv/geojson", {
        coordinates: [[parseFloat(lng_o), parseFloat(lat_o)], [parseFloat(lng_d), parseFloat(lat_d)]]
      }, {
        headers: { "Authorization": ORS_KEY, "Content-Type": "application/json" },
        timeout: 15000
      });
      const feature = r.data.features[0];
      const km = Math.round(feature.properties.summary.distance / 1000);
      return res.json({ km, geometry: feature.geometry });
    } catch(e2) {
      console.error("[ROTAS] ORS erro:", e2.message);
      const R = 6371;
      const dLat = (parseFloat(lat_d)-parseFloat(lat_o))*Math.PI/180;
      const dLng = (parseFloat(lng_d)-parseFloat(lng_o))*Math.PI/180;
      const a = Math.sin(dLat/2)**2 + Math.cos(parseFloat(lat_o)*Math.PI/180)*Math.cos(parseFloat(lat_d)*Math.PI/180)*Math.sin(dLng/2)**2;
      const km = Math.round(R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))*1.3);
      return res.json({ km, geometry: null });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Recalcula km de todas viagens ativas em background
router.get("/recalcular-ativas", async (req, res) => {
  res.json({ ok: true, msg: "Recalculo iniciado em background" });
  try {
    const axios = require("axios");
    const { rows } = await db.query(
      "SELECT id, lat_origem, lng_origem, lat_destino, lng_destino FROM viagens WHERE status='ativa' AND lat_origem IS NOT NULL AND lat_destino IS NOT NULL AND (km_total_calculado IS NULL OR km_total_calculado = 0)"
    );
    console.log("[ROTAS] Recalculando", rows.length, "viagens...");
    for (const v of rows) {
      try {
        await new Promise(r => setTimeout(r, 500));
        const ORS_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjJmYmZjM2FhYzExODQyY2Y4M2YxZGMzOWQ4NGIyY2E1IiwiaCI6Im11cm11cjY0In0=";
        const r2 = await axios.post("https://api.openrouteservice.org/v2/directions/driving-hgv/geojson", {
          coordinates: [[parseFloat(v.lng_origem), parseFloat(v.lat_origem)], [parseFloat(v.lng_destino), parseFloat(v.lat_destino)]]
        }, { headers: { "Authorization": ORS_KEY, "Content-Type": "application/json" }, timeout: 15000 });
        const km = Math.round(r2.data.features[0].properties.summary.distance / 1000);
        await db.query("UPDATE viagens SET km_total_calculado=$1 WHERE id=$2", [km, v.id]);
        console.log("[ROTAS] Atualizado", v.id, km, "km");
      } catch(e2) { console.error("[ROTAS] Erro viagem", v.id, e2.message); }
    }
    console.log("[ROTAS] Recalculo concluido!");
  } catch(e) { console.error("[ROTAS] Erro:", e.message); }
});

router.post("/calcular-km-rotas", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, placa, origem, destino, lat_origem, lng_origem, lat_destino, lng_destino
      FROM viagens
      WHERE lat_origem IS NOT NULL AND lat_destino IS NOT NULL
        AND lng_origem IS NOT NULL AND lng_destino IS NOT NULL
    `);

    const viagens = result.rows;
    let atualizadas = 0;
    let erros = 0;

    for (const v of viagens) {
      await new Promise(r => setTimeout(r, 500)); // delay para não sobrecarregar OSRM
      const km = await calcularRotaOSRM(
        parseFloat(v.lat_origem), parseFloat(v.lng_origem),
        parseFloat(v.lat_destino), parseFloat(v.lng_destino)
      );
      if (km) {
        await db.query(
          "UPDATE viagens SET km_total_calculado = $1 WHERE id = $2",
          [km, v.id]
        );
        atualizadas++;
      } else {
        erros++;
      }
    }

    res.json({ total: viagens.length, atualizadas, erros });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Retorna rota GeoJSON para exibir no mapa
router.get("/rota/:id", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT placa, origem, destino, lat_origem, lng_origem, lat_destino, lng_destino, km_total_calculado FROM viagens WHERE id = $1",
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Viagem não encontrada" });

    const v = result.rows[0];
    if (!v.lat_origem || !v.lat_destino) return res.status(400).json({ error: "Sem coordenadas" });

    const url = `https://router.project-osrm.org/route/v1/driving/${v.lng_origem},${v.lat_origem};${v.lng_destino},${v.lat_destino}?overview=full&geometries=geojson`;
    const { data } = await axios.get(url, { timeout: 10000 });

    if (data.code !== "Ok") return res.status(500).json({ error: "OSRM erro" });

    res.json({
      placa: v.placa,
      origem: v.origem,
      destino: v.destino,
      km_total: v.km_total_calculado,
      geometry: data.routes[0].geometry
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;