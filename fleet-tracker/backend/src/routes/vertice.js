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
      "https://monittora.vertticegr.com.br:1515/Login",
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
    const loginPage = await axios.get("https://monittora.vertticegr.com.br:1515/Login", {
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

// Debug CarregarGridViagem
router.get("/debug-grid", async (req, res) => {
  try {
    const axios = require("axios");
    const https = require("https");
    const agent = new https.Agent({ rejectUnauthorized: false });
    
    const cookie = "_ga=GA1.1.691159619.1775585728; .AspNetCore.Antiforgery.pJiKq-HQ3Kg=CfDJ8OUVtuHuOOJAq9TxHtEnGB4FQrdi-8K1V--UkgzHFq1ppn6lbvVaxz1mWBEHgzcEv36O_B3_aUHm7aS5sIMv1us3ZsI2YNum3GvbGPKE_nwXTCETLm_DeoHJzqa-buf9VTGTueJEozqMbvS-0c5nYUc; .AspNetCore.Session=CfDJ8OUVtuHuOOJAq9TxHtEnGB4vkNvBfxCTh4QBJk5T39UQU7ThyC3BMFwLoYd2gI80cIg663UFodryPcDHLwuKsxzM4TMDxSPe%2FdM0w7xpP6ufPRiODzmDdR4uV2mwQMkDP54NWkYc0cgC2QRTYI8N4aClyMyoLQrW%2BArHlU0%2BVzxj; kt_aside_menu_wrapperst=0";

    const hoje = new Date();
    const inicio = "01/04/2026 00:00:00";
    const fim = hoje.toLocaleDateString("pt-BR") + " 23:59:59";

    const params = new URLSearchParams({
      sEcho: "1",
      iColumns: "13",
      sColumns: "",
      iDisplayStart: "0",
      iDisplayLength: "100",
      sSearch: "",
      bRegex: "false",
      INICIO: inicio,
      FIM: fim
    });

    const r = await axios.get("https://monittora.vertticegr.com.br:1515/Viagem/CarregarGridViagem?" + params.toString(), {
      headers: { 
        "Cookie": cookie, 
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest"
      },
      httpsAgent: agent,
      timeout: 15000
    });
    
    res.json(r.data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Debug tabela viagens
router.get("/debug-tabela", async (req, res) => {
  try {
    const axios = require("axios");
    const https = require("https");
    const agent = new https.Agent({ rejectUnauthorized: false });
    
    const cookie = "_ga=GA1.1.691159619.1775585728; .AspNetCore.Antiforgery.pJiKq-HQ3Kg=CfDJ8OUVtuHuOOJAq9TxHtEnGB4FQrdi-8K1V--UkgzHFq1ppn6lbvVaxz1mWBEHgzcEv36O_B3_aUHm7aS5sIMv1us3ZsI2YNum3GvbGPKE_nwXTCETLm_DeoHJzqa-buf9VTGTueJEozqMbvS-0c5nYUc; .AspNetCore.Session=CfDJ8OUVtuHuOOJAq9TxHtEnGB4vkNvBfxCTh4QBJk5T39UQU7ThyC3BMFwLoYd2gI80cIg663UFodryPcDHLwuKsxzM4TMDxSPe%2FdM0w7xpP6ufPRiODzmDdR4uV2mwQMkDP54NWkYc0cgC2QRTYI8N4aClyMyoLQrW%2BArHlU0%2BVzxj; kt_aside_menu_wrapperst=0";
    
    const r = await axios.get("https://monittora.vertticegr.com.br:1515/Viagem/Index", {
      headers: { "Cookie": cookie, "User-Agent": "Mozilla/5.0" },
      httpsAgent: agent, timeout: 15000
    });
    
    const html = r.data;
    // Extrai apenas a parte da tabela
    const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
    const tableHtml = tableMatch ? tableMatch[0] : "NAO ENCONTROU TABELA";
    
    // Tenta buscar via API JSON
    const r2 = await axios.get("https://monittora.vertticegr.com.br:1515/Viagem/GetViagens", {
      headers: { "Cookie": cookie, "User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest" },
      httpsAgent: agent, timeout: 15000, validateStatus: s => s < 500
    });
    
    res.json({
      htmlLength: html.length,
      temTabela: !!tableMatch,
      tabelaHtml: tableHtml.substring(0, 3000),
      apiStatus: r2.status,
      apiData: typeof r2.data === "string" ? r2.data.substring(0, 500) : r2.data
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Debug com cookie manual
router.get("/debug-cookie", async (req, res) => {
  try {
    const axios = require("axios");
    const https = require("https");
    const agent = new https.Agent({ rejectUnauthorized: false });
    
    const cookie = "_ga=GA1.1.691159619.1775585728; .AspNetCore.Antiforgery.pJiKq-HQ3Kg=CfDJ8OUVtuHuOOJAq9TxHtEnGB4FQrdi-8K1V--UkgzHFq1ppn6lbvVaxz1mWBEHgzcEv36O_B3_aUHm7aS5sIMv1us3ZsI2YNum3GvbGPKE_nwXTCETLm_DeoHJzqa-buf9VTGTueJEozqMbvS-0c5nYUc; .AspNetCore.Session=CfDJ8OUVtuHuOOJAq9TxHtEnGB4vkNvBfxCTh4QBJk5T39UQU7ThyC3BMFwLoYd2gI80cIg663UFodryPcDHLwuKsxzM4TMDxSPe%2FdM0w7xpP6ufPRiODzmDdR4uV2mwQMkDP54NWkYc0cgC2QRTYI8N4aClyMyoLQrW%2BArHlU0%2BVzxj; kt_aside_menu_wrapperst=0";
    
    const r = await axios.get("https://monittora.vertticegr.com.br:1515/Viagem/Index", {
      headers: { 
        "Cookie": cookie,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      httpsAgent: agent,
      timeout: 15000
    });
    
    const logado = !r.data.includes("Informe suas credenciais");
    res.send("<p>Logado: " + logado + " | Tamanho: " + r.data.length + "</p><pre>" + r.data.substring(0, 10000).replace(/</g,"&lt;") + "</pre>");
  } catch(e) {
    res.status(500).send("Erro: " + e.message);
  }
});

// Debug - retorna HTML da pagina de viagens
router.get("/debug-viagens", async (req, res) => {
  try {
    const { loginVertice } = require("../services/vertice");
    const axios = require("axios");
    const https = require("https");
    const agent = new https.Agent({ rejectUnauthorized: false });
    
    await loginVertice();
    const cookie = global._verticeCookie || "";
    
    const res2 = await axios.get("https://monittora.vertticegr.com.br:1515/Viagem/Index", {
      headers: { "Cookie": cookie },
      httpsAgent: agent,
      timeout: 15000
    });
    
    // Mostra primeiros 8000 chars do HTML
    const html = res2.data;
    const logado = !html.includes("Informe suas credenciais");
    res.send("<p>Logado: " + logado + "</p><p>Tamanho HTML: " + html.length + "</p><pre>" + html.substring(0, 8000).replace(/</g,"&lt;") + "</pre>");
  } catch(e) {
    res.status(500).send("Erro: " + e.message);
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