const express = require("express");
const db = require("../models/db");
const router = express.Router();

// Lista viagens ativas
router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT v.*
      FROM viagens v
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
    if (!Array.isArray(viagens)) return res.status(400).json({ error: "Envie um array" });

    let importadas = 0;
    let erros = [];

    // Cancela todas viagens ativas antes de importar
    await db.query("UPDATE viagens SET status='cancelada' WHERE status='ativa'");

    for (const v of viagens) {
      try {
        const placa = (v.Placa || v.placa || '').toString().trim().toUpperCase();
        if (!placa) continue;

        const motorista = v.Motorista || v.motorista || '';
        const status = v.Status || v.status || '';
        const destino = v.Destino || v.destino || '';
        const cliente = v.Cliente || v.cliente || '';
        const regiao = v['Regiao'] || v['Região'] || v.regiao || '';
        const grupo = v.Grupo || v.grupo || '';
        const ref = v['Ref.'] || v.ref || '';

        // Busca vehicle_id pelo plate
        const { rows } = await db.query(
          "SELECT id FROM vehicles WHERE plate = $1 LIMIT 1",
          [placa]
        );

        const vehicleId = rows.length > 0 ? rows[0].id : null;

        await db.query(`
          INSERT INTO viagens (vehicle_id, placa, motorista, origem, destino, cliente, status_carga, grupo, ref_data, km_total)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0)
          ON CONFLICT DO NOTHING
        `, [vehicleId, placa, motorista, regiao, destino, cliente, status, grupo, ref]);

        importadas++;
      } catch (e) {
        erros.push(`${v.Placa}: ${e.message}`);
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