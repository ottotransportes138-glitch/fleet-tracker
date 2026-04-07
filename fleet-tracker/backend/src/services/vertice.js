const axios = require("axios");
const https = require("https");
const db = require("../models/db");

const VERTICE_URL = "https://monittora.vertticegr.com.br:1515";
const VERTICE_LOGIN = "70534428100";
const VERTICE_SENHA = "1031go";
const agent = new https.Agent({ rejectUnauthorized: false });

let cookieJar = {};

function getCookieString() {
  return Object.entries(cookieJar).map(([k,v]) => k + "=" + v).join("; ");
}

function parseCookies(setCookieHeaders) {
  if (!setCookieHeaders) return;
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  headers.forEach(function(cookie) {
    const part = cookie.split(";")[0];
    const idx = part.indexOf("=");
    if (idx > 0) {
      const key = part.substring(0, idx).trim();
      const val = part.substring(idx + 1).trim();
      cookieJar[key] = val;
    }
  });
}

async function loginVertice() {
  try {
    cookieJar = {};

    // Passo 1: GET na pagina de login para pegar cookies e token CSRF
    const loginPage = await axios.get(VERTICE_URL + "/Login", {
      httpsAgent: agent,
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    parseCookies(loginPage.headers["set-cookie"]);

    // Extrai token CSRF
    const tokenMatch = loginPage.data.match(/name="__RequestVerificationToken"[^>]+value="([^"]+)"/);
    const token = tokenMatch ? tokenMatch[1] : "";
    console.log("[VERTICE] Token CSRF:", token ? "OK" : "NAO ENCONTRADO");

    // Passo 2: POST com credenciais
    const params = new URLSearchParams();
    params.append("UserName", VERTICE_LOGIN);
    params.append("UserPassword", VERTICE_SENHA);
    params.append("__RequestVerificationToken", token);

    const postRes = await axios.post(VERTICE_URL + "/Login", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": getCookieString(),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": VERTICE_URL + "/Login",
        "Origin": VERTICE_URL
      },
      httpsAgent: agent,
      maxRedirects: 10,
      validateStatus: s => s < 500,
      timeout: 15000
    });

    parseCookies(postRes.headers["set-cookie"]);
    global._verticeCookie = getCookieString();

    const loggedIn = postRes.data && !postRes.data.includes("Informe suas credenciais") && !postRes.data.includes("Bem Vindo (a)");
    console.log("[VERTICE] Login:", loggedIn ? "OK" : "FALHOU");
    console.log("[VERTICE] Cookies:", Object.keys(cookieJar).join(", "));
    return loggedIn;
  } catch(e) {
    console.error("[VERTICE] Erro login:", e.message);
    return false;
  }
}

async function buscarSMs() {
  try {
    if (!getCookieString().includes("AspNetCore.Session")) {
      const ok = await loginVertice();
      if (!ok) return [];
    }

    const res = await axios.get(VERTICE_URL + "/Viagem/Index", {
      headers: {
        "Cookie": getCookieString(),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      httpsAgent: agent,
      timeout: 15000,
      maxRedirects: 5
    });

    parseCookies(res.headers["set-cookie"]);

    if (res.data.includes("Informe suas credenciais") || res.data.includes("Bem Vindo (a)")) {
      console.log("[VERTICE] Sessao expirada, refazendo login...");
      cookieJar = {};
      const ok = await loginVertice();
      if (!ok) return [];
      return buscarSMs();
    }

    const html = res.data;
    const sms = [];
    const stripHtml = s => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      if (!rowHtml.includes("<td")) continue;
      const cells = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(stripHtml(cellMatch[1]));
      }
      if (cells.length >= 4 && cells[0] && cells[0].match(/\d+/)) {
        sms.push({
          id: cells[0] || "",
          veiculo: cells[1] || "",
          motorista: cells[2] || "",
          origem: cells[3] || "",
          destino: cells[4] || "",
          status: cells[5] || ""
        });
      }
    }

    console.log("[VERTICE] SMs encontradas:", sms.length);
    return sms;
  } catch(e) {
    console.error("[VERTICE] Erro buscarSMs:", e.message);
    return [];
  }
}

async function importarSMsVertice() {
  console.log("[VERTICE] Iniciando importacao...");
  const sms = await buscarSMs();
  let importadas = 0;

  for (const sm of sms) {
    try {
      if (!sm.veiculo) continue;
      const placaMatch = sm.veiculo.match(/([A-Z]{3}\d[A-Z0-9]\d{2}|[A-Z]{3}\d{4})/);
      if (!placaMatch) continue;
      const placa = placaMatch[1];

      const { rows } = await db.query("SELECT id FROM vehicles WHERE plate = $1", [placa]);
      const vehicleId = rows.length > 0 ? rows[0].id : null;

      const { rows: exist } = await db.query(
        "SELECT id FROM viagens WHERE placa = $1 AND status = 'ativa'", [placa]
      );
      if (exist.length > 0) continue;

      const motorista = sm.motorista.replace(/^\d+\s*-\s*/, "").trim();
      const origem = sm.origem.replace(/^\d+\s*-\s*/, "").trim();
      const destino = sm.destino.replace(/^\d+\s*-\s*/, "").trim();

      await db.query(
        "INSERT INTO viagens (vehicle_id, placa, motorista, origem, destino, status_carga, status, criado_em) VALUES ($1,$2,$3,$4,$5,'Em Trânsito','ativa',NOW())",
        [vehicleId, placa, motorista, origem, destino]
      );
      importadas++;
      console.log("[VERTICE] Importada:", placa, origem, "->", destino);
    } catch(e) {
      console.error("[VERTICE] Erro SM:", e.message);
    }
  }
  console.log("[VERTICE] Concluido:", importadas, "viagens");
  return { total: sms.length, importadas };
}

module.exports = { importarSMsVertice, buscarSMs, loginVertice };