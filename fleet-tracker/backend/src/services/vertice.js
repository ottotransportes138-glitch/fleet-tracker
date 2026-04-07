const axios = require("axios");
const db = require("../models/db");

const VERTICE_URL = "https://monittora.vertticegr.com.br:1515";
const VERTICE_LOGIN = "70534428100";
const VERTICE_SENHA = "1031go";

let cookieSession = null;

async function loginVertice() {
  try {
    const params = new URLSearchParams();
    params.append("Login", VERTICE_LOGIN);
    params.append("Senha", VERTICE_SENHA);

    const res = await axios.post(VERTICE_URL + "/Account/Login", params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      maxRedirects: 0,
      validateStatus: s => s < 400,
      httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }),
      timeout: 15000
    });

    const cookies = res.headers["set-cookie"];
    if (cookies) {
      cookieSession = cookies.map(c => c.split(";")[0]).join("; ");
      global._verticeCookie = cookieSession;
      console.log("[VERTICE] Login OK");
      return true;
    }
    return false;
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
      httpsAgent: new (require("https").Agent)({ rejectUnauthorized: false }),
      timeout: 15000
    });

    // Extrai dados do HTML usando regex
    const html = res.data;
    const sms = [];

    // Busca linhas da tabela
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const stripHtml = s => s.replace(/<[^>]+>/g, "").trim();

    let rowMatch;
    while ((rowMatch = rowRegex.exec(html)) !== null) {
      const rowHtml = rowMatch[1];
      const cells = [];
      let cellMatch;
      const cellRegex2 = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      while ((cellMatch = cellRegex2.exec(rowHtml)) !== null) {
        cells.push(stripHtml(cellMatch[1]));
      }
      if (cells.length >= 4) {
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