const express = require("express");
const db = require("../models/db");
const router = express.Router();

// GET /api/positions?vehicle_id=X&start=...&end=...
router.get("/", async (req, res) => {
  try {
    const { vehicle_id, start, end } = req.query;
    if (!vehicle_id) return res.status(400).json({ error: "vehicle_id obrigatorio" });

    const dataStart = start ? new Date(start) : new Date(Date.now() - 8*3600000);
    const dataEnd = end ? new Date(end) : new Date();

    const { rows } = await db.query(
      `SELECT lat, lng, speed, heading, recorded_at
       FROM positions
       WHERE vehicle_id = $1
         AND recorded_at BETWEEN $2 AND $3
       ORDER BY recorded_at ASC`,
      [vehicle_id, dataStart, dataEnd]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/positions/:vehicleId (compatibilidade)
router.get("/:vehicleId", async (req, res) => {
  try {
    const { from, to } = req.query;
    const { rows } = await db.query(
      `SELECT lat, lng, speed, heading, recorded_at
       FROM positions
       WHERE vehicle_id = $1
         AND recorded_at BETWEEN $2 AND $3
       ORDER BY recorded_at ASC`,
      [req.params.vehicleId, from || new Date(Date.now() - 8*3600000), to || new Date()]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;