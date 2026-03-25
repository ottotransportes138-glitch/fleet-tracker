const express = require("express");
const db = require("../models/db");
const router = express.Router();
router.get("/:vehicleId", async (req, res) => {
  try {
    const { from, to } = req.query;
    const { rows } = await db.query(
      "SELECT * FROM positions WHERE vehicle_id=$1 AND recorded_at BETWEEN $2 AND $3 ORDER BY recorded_at ASC",
      [req.params.vehicleId, from || new Date(Date.now() - 8*3600000), to || new Date()]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;
