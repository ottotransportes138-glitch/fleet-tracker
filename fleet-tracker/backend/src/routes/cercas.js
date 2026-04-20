const express = require("express");
const db = require("../models/db");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM cercas WHERE ativo=true ORDER BY criado_em DESC");
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/", async (req, res) => {
  try {
    const { nome, lat, lng, raio_metros, status_carga } = req.body;
    const { rows } = await db.query(
      "INSERT INTO cercas (nome, lat, lng, raio_metros, status_carga) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [nome, lat, lng, raio_metros||500, status_carga||"Manutencao"]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete("/:id", async (req, res) => {
  try {
    await db.query("UPDATE cercas SET ativo=false WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;