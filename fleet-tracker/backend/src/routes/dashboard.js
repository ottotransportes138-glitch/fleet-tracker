const express = require("express");
const db = require("../models/db");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { start, end } = req.query;
    const dataStart = start ? start : "2026-03-26";
    const dataEnd = end ? end + " 23:59:59" : new Date().toISOString();

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
        AND p.recorded_at >= $1::timestamptz
        AND p.recorded_at <= $2::timestamptz
      WHERE v.active = TRUE
      GROUP BY v.id, v.plate, v.name, v.speed_limit
      ORDER BY excessos DESC, vel_max DESC NULLS LAST, v.plate ASC
    `, [dataStart, dataEnd]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;