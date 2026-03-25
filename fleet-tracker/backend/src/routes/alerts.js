const express = require("express");
const db = require("../models/db");
const router = express.Router();
router.get("/", async (req, res) => {
  try {
    const { acknowledged, limit = 50 } = req.query;
    let sql = "SELECT a.*, v.plate, v.name FROM alerts a JOIN vehicles v ON v.id = a.vehicle_id";
    const params = [];
    if (acknowledged !== undefined) { params.push(acknowledged === "true"); sql += " WHERE a.acknowledged = $1"; }
    sql += " ORDER BY a.created_at DESC LIMIT " + parseInt(limit);
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
router.patch("/:id/acknowledge", async (req, res) => {
  try {
    await db.query("UPDATE alerts SET acknowledged=TRUE WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
module.exports = router;
