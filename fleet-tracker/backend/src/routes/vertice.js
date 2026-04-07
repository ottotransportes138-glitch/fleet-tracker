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

// Debug - inspeciona formulario de login
router.get("/debug-login", async (req, res) => {
  try {
    const axios = require("axios");
    const https = require("https");
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Testa varias URLs de login
    const urls = [
      "https://monittora.vertticegr.com.br:1515/",
      "https://monittora.vertticegr.com.br:1515/Login",
      "https://monittora.vertticegr.com.br:1515/Account/Login",
      "https://monittora.vertticegr.com.br:1515/Home/Index",
    ];
    
    const results = {};
    for (const url of urls) {
      try {
        const r = await axios.get(url, { httpsAgent: agent, timeout: 10000, maxRedirects: 5, validateStatus: s => s < 500 });
        results[url] = { status: r.status, length: r.data.length, redirected: r.request.res.responseUrl };
      } catch(e) {
        results[url] = { error: e.message };
      }
    }
    res.json(results);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Debug - inspeciona formulario de login ANTIGO
router.get("/debug-login-old", async (req, res) => {
  try {
    const axios = require("axios");
    const https = require("https");
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Pega pagina de login para ver campos e token
    const loginPage = await axios.get("https://monittora.vertticegr.com.br:1515/Account/Login", {
      httpsAgent: agent, timeout: 15000
    });

    // Extrai campos do formulario
    const html = loginPage.data;
    const inputs = [];
    const inputRegex = /<input[^>]+>/gi;
    let m;
    while ((m = inputRegex.exec(html)) !== null) {
      inputs.push(m[0]);
    }

    // Pega cookies da pagina de login
    const cookies = loginPage.headers["set-cookie"] || [];

    res.json({ 
      inputs, 
      cookies: cookies.map(c => c.split(";")[0]),
      formAction: html.match(/action="([^"]+)"/)?.[1]
    });
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