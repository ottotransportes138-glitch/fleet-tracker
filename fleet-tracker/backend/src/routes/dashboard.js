const express = require("express");
const db = require("../models/db");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const start = req.query.start || "2026-03-26";
    const end = req.query.end || new Date().toISOString().slice(0,10);

    const { rows } = await db.query(`
      SELECT
        v.id,
        v.plate,
        v.name,
        v.speed_limit,
        COUNT(p.id) as total_posicoes,
        COUNT(CASE WHEN p.speed > v.speed_limit THEN 1 END) as excessos,
        COUNT(CASE WHEN p.speed > 5 THEN 1 END) as minutos_movendo,
        COUNT(CASE WHEN p.speed <= 5 THEN 1 END) as minutos_parado,
        MAX(p.speed) as vel_max,
        (SELECT speed FROM positions WHERE vehicle_id = v.id ORDER BY recorded_at DESC LIMIT 1) as ultima_vel,
        (SELECT lat FROM positions WHERE vehicle_id = v.id ORDER BY recorded_at DESC LIMIT 1) as ultima_lat,
        (SELECT lng FROM positions WHERE vehicle_id = v.id ORDER BY recorded_at DESC LIMIT 1) as ultima_lng
      FROM vehicles v
      LEFT JOIN positions p ON p.vehicle_id = v.id
        AND DATE(p.recorded_at AT TIME ZONE 'America/Sao_Paulo') >= $1::date
        AND DATE(p.recorded_at AT TIME ZONE 'America/Sao_Paulo') <= $2::date
      WHERE v.active = TRUE
      GROUP BY v.id, v.plate, v.name, v.speed_limit
      ORDER BY excessos DESC, vel_max DESC NULLS LAST, v.plate ASC
    `, [start, end]);

    res.json(rows);
  } catch (err) {
    console.error("[DASHBOARD] Erro:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;