const express = require('express');
const db = require('../models/db');

// ── ROTAS ────────────────────────────────────────────────────
const routesRouter = express.Router();

routesRouter.get('/', async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM routes WHERE active=TRUE ORDER BY name`);
  res.json(rows);
});

routesRouter.post('/', async (req, res) => {
  const { name, description, waypoints, tolerance_m } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO routes (name, description, waypoints, tolerance_m)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description, JSON.stringify(waypoints), tolerance_m ?? 500]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

routesRouter.put('/:id', async (req, res) => {
  const { name, description, waypoints, tolerance_m } = req.body;
  const { rows } = await db.query(
    `UPDATE routes SET name=$1, description=$2, waypoints=$3, tolerance_m=$4
     WHERE id=$5 RETURNING *`,
    [name, description, JSON.stringify(waypoints), tolerance_m, req.params.id]
  );
  res.json(rows[0]);
});

routesRouter.delete('/:id', async (req, res) => {
  await db.query(`UPDATE routes SET active=FALSE WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// Vincular veículo a rota
routesRouter.post('/:id/assign', async (req, res) => {
  const { vehicle_id } = req.body;
  // Desativa vínculos anteriores
  await db.query(`UPDATE vehicle_routes SET active=FALSE WHERE vehicle_id=$1`, [vehicle_id]);
  const { rows } = await db.query(
    `INSERT INTO vehicle_routes (vehicle_id, route_id) VALUES ($1, $2) RETURNING *`,
    [vehicle_id, req.params.id]
  );
  res.status(201).json(rows[0]);
});

// ── ALERTAS ──────────────────────────────────────────────────
const alertsRouter = express.Router();

alertsRouter.get('/', async (req, res) => {
  const { acknowledged, limit = 50 } = req.query;
  let sql = `SELECT a.*, v.plate, v.name FROM alerts a
             JOIN vehicles v ON v.id = a.vehicle_id`;
  const params = [];
  if (acknowledged !== undefined) {
    params.push(acknowledged === 'true');
    sql += ` WHERE a.acknowledged = $1`;
  }
  sql += ` ORDER BY a.created_at DESC LIMIT ${parseInt(limit)}`;
  const { rows } = await db.query(sql, params);
  res.json(rows);
});

alertsRouter.patch('/:id/acknowledge', async (req, res) => {
  await db.query(`UPDATE alerts SET acknowledged=TRUE WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// ── POSIÇÕES ─────────────────────────────────────────────────
const positionsRouter = express.Router();

positionsRouter.get('/:vehicleId', async (req, res) => {
  const { from, to } = req.query;
  const { rows } = await db.query(
    `SELECT * FROM positions
     WHERE vehicle_id=$1
       AND recorded_at BETWEEN $2 AND $3
     ORDER BY recorded_at ASC`,
    [req.params.vehicleId, from || 'now()-interval\'8 hours\'', to || 'now()']
  );
  res.json(rows);
});

module.exports = { routesRouter, alertsRouter, positionsRouter };
