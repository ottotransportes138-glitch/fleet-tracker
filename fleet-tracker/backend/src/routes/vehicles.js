const express = require('express');
const db = require('../models/db');
const router = express.Router();

// GET /api/vehicles — lista todos os veículos com última posição
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM vehicle_last_position ORDER BY name`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vehicles/:id — dados de um veículo
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM vehicles WHERE id = $1`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Veículo não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vehicles — cadastrar veículo
router.post('/', async (req, res) => {
  const { plate, name, omnilink_id, speed_limit } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO vehicles (plate, name, omnilink_id, speed_limit)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [plate, name, omnilink_id, speed_limit ?? 80]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/vehicles/:id — atualizar veículo
router.put('/:id', async (req, res) => {
  const { plate, name, speed_limit, active } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE vehicles SET plate=$1, name=$2, speed_limit=$3, active=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [plate, name, speed_limit, active, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/vehicles/:id — desativar veículo
router.delete('/:id', async (req, res) => {
  try {
    await db.query(`UPDATE vehicles SET active=FALSE WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
