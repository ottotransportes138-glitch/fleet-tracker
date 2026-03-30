const express = require("express");
const db = require("../models/db");
const router = express.Router();

router.get("/dashboard", async (req, res) => {
  try {
    const { start, end } = req.query;
    const dataStart = start ? new Date(start) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const dataEnd = end ? new Date(end) : new Date();

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
        AND p.recorded_at BETWEEN $1 AND $2
      WHERE v.active = TRUE
      GROUP BY v.id, v.plate, v.name, v.speed_limit
      ORDER BY excessos DESC, v.plate ASC
    `, [dataStart, dataEnd]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;