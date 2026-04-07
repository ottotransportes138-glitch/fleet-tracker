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

// Debug - retorna HTML bruto
router.get("/debug-html", async (req, res) => {
  try {
    const { loginVertice } = require("../services/vertice");
    const axios = require("axios");
    await loginVertice();
    
    // Importa o cookie da sessao
    const verticeModule = require("../services/vertice");
    const sms = await verticeModule.buscarSMs();
    
    // Faz request manual para ver HTML
    const https = require("https");
    const cookieRes = await axios.get("https://monittora.vertticegr.com.br:1515/Viagem/Index", {
      headers: { "Cookie": global._verticeCookie || "" },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 15000
    });
    
    res.send("<pre>" + cookieRes.data.substring(0, 5000) + "</pre>");
  } catch(e) {
    res.status(500).send("Erro: " + e.message);
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