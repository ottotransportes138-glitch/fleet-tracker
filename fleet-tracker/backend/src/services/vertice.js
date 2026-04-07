const axios = require("axios");
const https = require("https");
const db = require("../models/db");

const VERTICE_URL = "https://monittora.vertticegr.com.br:1515";
const VERTICE_LOGIN = "70534428100";
const VERTICE_SENHA = "1031go";
const agent = new https.Agent({ rejectUnauthorized: false });

let cookieSession = null;

async function loginVertice() {
  try {
    // Pega pagina de login para obter token CSRF e cookie
    const loginPage = await axios.get(VERTICE_URL + "/Login", {
      httpsAgent: agent, timeout: 15000
    });

    // Extrai token CSRF
    const tokenMatch = loginPage.data.match(/name="__RequestVerificationToken"[^>]+value="([^"]+)"/);
    const token = tokenMatch ? tokenMatch[1] : "";

    // Pega cookies da pagina de login
    const loginCookies = (loginPage.headers["set-cookie"] || []).map(c => c.split(";")[0]).join("; ");

    // Faz o login
    const params = new URLSearchParams();
    params.append("UserName", VERTICE_LOGIN);
    params.append("UserPassword", VERTICE_SENHA);
    params.append("__RequestVerificationToken", token);

    const res = await axios.post(VERTICE_URL + "/Login", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": loginCookies,
        "Referer": VERTICE_URL + "/Login"
      },
      httpsAgent: agent,
      maxRedirects: 5,
      validateStatus: s => s < 500,
      timeout: 15000
    });

    // Pega cookies da resposta
    const resCookies = (res.headers["set-cookie"] || []).map(c => c.split(";")[0]);
    const allCookies = [...loginCookies.split("; "), ...resCookies].filter(Boolean);
    cookieSession = allCookies.join("; ");
    global._verticeCookie = cookieSession;

    // Verifica se login foi bem sucedido
    const loggedIn = res.data && !res.data.includes("Informe suas credenciais");
    console.log("[VERTICE] Login:", loggedIn ? "OK" : "FALHOU");
    return loggedIn;
  } catch(e) {
    console.error("[VERTICE] Erro login:", e.message);
    return false;
  }
}

async function buscarSMs() {
  try {
    if (!cookieSession) {
      const ok = await loginVertice();
      if (!ok) return [];
    }

    const res = await axios.get(VERTICE_URL + "/Viagem/Index", {
      headers: { "Cookie": cookieSession },
      httpsAgent: agent,
      timeout: 15000
    });

    // Verifica se ainda esta logado
    if (res.data.includes("Informe suas credenciais")) {
      console.log("[VERTICE] Sessao expirada, refazendo login...");
      cookieSession = null;
      const ok = await loginVertice();
      if (!ok) return [];
      return buscarSMs();
    }

    const html = res.data;
    const sms = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const stripHtml = s => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      const cells = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(stripHtml(cellMatch[1]));
      }
      if (cells.length >= 4 && cells[0] && cells[0] !== "") {
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
    cookieSession = null;
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