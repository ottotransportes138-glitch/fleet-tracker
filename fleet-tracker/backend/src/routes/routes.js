const express = require("express");
const db = require("../models/db");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM routes WHERE active=TRUE ORDER BY name");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/", async (req, res) => {
  const { name, description, waypoints, tolerance_m } = req.body;
  try {
    const { rows } = await db.query(
      "INSERT INTO routes (name, description, waypoints, tolerance_m) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, description, JSON.stringify(waypoints), tolerance_m || 500]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete("/:id", async (req, res) => {
  await db.query("UPDATE routes SET active=FALSE WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

router.post("/:id/assign", async (req, res) => {
  const { vehicle_id } = req.body;
  await db.query("UPDATE vehicle_routes SET active=FALSE WHERE vehicle_id=$1", [vehicle_id]);
  const { rows } = await db.query(
    "INSERT INTO vehicle_routes (vehicle_id, route_id) VALUES ($1, $2) RETURNING *",
    [vehicle_id, req.params.id]
  );
  res.status(201).json(rows[0]);
});

module.exports = router;
