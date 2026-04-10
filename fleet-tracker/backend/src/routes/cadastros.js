const express = require("express");
const db = require("../models/db");
const router = express.Router();

// MOTORISTAS
router.get("/motoristas", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM motoristas ORDER BY nome");
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/motoristas", async (req, res) => {
  try {
    const { nome, cpf, cnh, telefone } = req.body;
    if (!nome) return res.status(400).json({ error: "Nome obrigatorio" });
    const { rows } = await db.query(
      "INSERT INTO motoristas (nome, cpf, cnh, telefone) VALUES ($1,$2,$3,$4) RETURNING *",
      [nome, cpf||null, cnh||null, telefone||null]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put("/motoristas/:id", async (req, res) => {
  try {
    const { nome, cpf, cnh, telefone } = req.body;
    const { rows } = await db.query(
      "UPDATE motoristas SET nome=$1, cpf=$2, cnh=$3, telefone=$4 WHERE id=$5 RETURNING *",
      [nome, cpf||null, cnh||null, telefone||null, req.params.id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete("/motoristas/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM motoristas WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// CLIENTES
router.get("/clientes", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM clientes ORDER BY nome");
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/clientes", async (req, res) => {
  try {
    const { nome, cnpj, telefone } = req.body;
    if (!nome) return res.status(400).json({ error: "Nome obrigatorio" });
    const { rows } = await db.query(
      "INSERT INTO clientes (nome, cnpj, telefone) VALUES ($1,$2,$3) RETURNING *",
      [nome, cnpj||null, telefone||null]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put("/clientes/:id", async (req, res) => {
  try {
    const { nome, cnpj, telefone } = req.body;
    const { rows } = await db.query(
      "UPDATE clientes SET nome=$1, cnpj=$2, telefone=$3 WHERE id=$4 RETURNING *",
      [nome, cnpj||null, telefone||null, req.params.id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete("/clientes/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM clientes WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;