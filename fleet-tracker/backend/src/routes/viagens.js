const express = require("express");
const db = require("../models/db");
const router = express.Router();

// Lista viagens ativas
router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT v.*, 
        p.lat as lat_atual, p.lng as lng_atual
      FROM viagens v
      LEFT JOIN vehicles vh ON vh.id = v.vehicle_id
      LEFT JOIN LATERAL (
        SELECT lat, lng FROM positions 
        WHERE vehicle_id = v.vehicle_id 
        ORDER BY recorded_at DESC LIMIT 1
      ) p ON true
      WHERE v.status = 'ativa'
      ORDER BY v.criado_em DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload de viagens via JSON (vindo do Excel)
router.post("/upload", async (req, res) => {
  try {
    const viagens = req.body;
    if (!Array.isArray(viagens)) return res.status(400).json({ error: "Envie um array de viagens" });

    let importadas = 0;
    let erros = [];

    for (const v of viagens) {
      try {
        const { rows } = await db.query(
          "SELECT id FROM vehicles WHERE plate = $1 LIMIT 1",
          [v.placa?.toUpperCase()]
        );
        if (rows.length === 0) {
          erros.push(`Placa não encontrada: ${v.placa}`);
          continue;
        }
        const vehicleId = rows[0].id;

        // Cancela viagem ativa anterior
        await db.query(
          "UPDATE viagens SET status='cancelada' WHERE vehicle_id=$1 AND status='ativa'",
          [vehicleId]
        );

        // Cria nova viagem
        await db.query(`
          INSERT INTO viagens (vehicle_id, placa, origem, destino, km_total)
          VALUES ($1, $2, $3, $4, $5)
        `, [vehicleId, v.placa?.toUpperCase(), v.origem, v.destino, parseFloat(v.km_total) || 0]);

        importadas++;
      } catch (e) {
        erros.push(`Erro na placa ${v.placa}: ${e.message}`);
      }
    }

    res.json({ importadas, erros });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Marcar como concluída
router.patch("/:id/concluir", async (req, res) => {
  try {
    await db.query(
      "UPDATE viagens SET status='concluida', concluido_em=NOW() WHERE id=$1",
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualiza km percorrido
router.patch("/:id/km", async (req, res) => {
  try {
    const { km } = req.body;
    await db.query(
      "UPDATE viagens SET km_percorrido=$1 WHERE id=$2",
      [km, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;