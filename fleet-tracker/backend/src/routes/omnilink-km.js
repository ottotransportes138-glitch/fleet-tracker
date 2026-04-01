const express = require("express");
const db = require("../models/db");
const router = express.Router();

// Calcula km percorrido pelo histórico GPS do nosso banco
router.get("/km/:plate", async (req, res) => {
  try {
    const { plate } = req.params;
    const { start, end } = req.query;

    const startDate = start || new Date(new Date().setDate(1)).toISOString().slice(0,10);
    const endDate = end || new Date().toISOString().slice(0,10);

    // Busca posições ordenadas por tempo
    const result = await db.query(`
      SELECT p.latitude, p.longitude, p.recorded_at
      FROM positions p
      JOIN vehicles v ON v.id = p.vehicle_id
      WHERE v.plate = $1
        AND p.recorded_at >= $2::date
        AND p.recorded_at < ($3::date + interval '1 day')
      ORDER BY p.recorded_at ASC
    `, [plate, startDate, endDate]);

    const positions = result.rows;
    if (positions.length < 2) {
      return res.json({ plate, km: 0, pontos: positions.length });
    }

    // Haversine
    function haversine(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    let totalKm = 0;
    for (let i = 1; i < positions.length; i++) {
      const d = haversine(
        parseFloat(positions[i-1].latitude), parseFloat(positions[i-1].longitude),
        parseFloat(positions[i].latitude), parseFloat(positions[i].longitude)
      );
      // Ignora saltos absurdos (> 50km entre pontos = erro GPS)
      if (d < 50) totalKm += d;
    }

    res.json({
      plate,
      km: Math.round(totalKm * 10) / 10,
      pontos: positions.length,
      periodo: { start: startDate, end: endDate }
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Km de todos os veículos no período
router.get("/km-todos", async (req, res) => {
  try {
    const { start, end } = req.query;
    const startDate = start || new Date(new Date().setDate(1)).toISOString().slice(0,10);
    const endDate = end || new Date().toISOString().slice(0,10);

    const vehicles = await db.query("SELECT id, plate FROM vehicles WHERE active = true ORDER BY plate");

    const results = [];
    for (const v of vehicles.rows) {
      const result = await db.query(`
        SELECT latitude, longitude FROM positions
        WHERE vehicle_id = $1
          AND recorded_at >= $2::date
          AND recorded_at < ($3::date + interval '1 day')
        ORDER BY recorded_at ASC
      `, [v.id, startDate, endDate]);

      const pts = result.rows;
      let km = 0;
      for (let i = 1; i < pts.length; i++) {
        const R = 6371;
        const dLat = (parseFloat(pts[i].latitude) - parseFloat(pts[i-1].latitude)) * Math.PI / 180;
        const dLon = (parseFloat(pts[i].longitude) - parseFloat(pts[i-1].longitude)) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(parseFloat(pts[i-1].latitude)*Math.PI/180) * Math.cos(parseFloat(pts[i].latitude)*Math.PI/180) * Math.sin(dLon/2)**2;
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        if (d < 50) km += d;
      }
      results.push({ plate: v.plate, km: Math.round(km * 10) / 10, pontos: pts.length });
    }

    res.json(results);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;