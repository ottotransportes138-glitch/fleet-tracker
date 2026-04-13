const express = require("express");
const db = require("../models/db");
const router = express.Router();

router.get("/viagens", async (req, res) => {
  try {
    const { inicio, fim, placa, status } = req.query;
    let query = "SELECT placa, motorista, origem, destino, cliente, status, km_total_calculado, criado_em FROM viagens WHERE 1=1";
    const params = [];

    if (inicio) { params.push(inicio); query += " AND criado_em >= $" + params.length + "::date"; }
    if (fim) { params.push(fim); query += " AND criado_em < ($" + params.length + "::date + interval '1 day')"; }
    if (placa) { params.push(placa); query += " AND placa = $" + params.length; }
    if (status === "nao-cancelada") { query += " AND status != 'cancelada'"; }
    else if (status) { params.push(status); query += " AND status = $" + params.length; }
    else { query += " AND status != 'cancelada'"; }

    query += " ORDER BY criado_em DESC LIMIT 1000";
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;