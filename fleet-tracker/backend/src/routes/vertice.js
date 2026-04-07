const express = require("express");
const { importarSMsVertice, buscarSMs } = require("../services/vertice");
const router = express.Router();

// Testa conexao e lista SMs
router.get("/testar", async (req, res) => {
  try {
    const sms = await buscarSMs();
    res.json({ ok: true, total: sms.length, sms: sms.slice(0, 5) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Importa SMs da Vertice
router.post("/importar", async (req, res) => {
  try {
    const result = await importarSMsVertice();
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;