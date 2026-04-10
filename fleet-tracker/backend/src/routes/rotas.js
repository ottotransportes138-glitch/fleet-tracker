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
    const url = `https://router.project-osrm.org/route/v1/driving/${lng_o},${lat_o};${lng_d},${lat_d}?overview=full&geometries=geojson`;
    const axios = require("axios");
    const r = await axios.get(url, { timeout: 10000 });
    const route = r.data.routes[0];
    res.json({ km: Math.round(route.distance/1000), geometry: route.geometry });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
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