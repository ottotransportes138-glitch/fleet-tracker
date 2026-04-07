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

    const loginPage = await axios.get(VERTICE_URL + "/Login", {
      httpsAgent: agent, timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
    });
    parseCookies(loginPage.headers["set-cookie"]);

    const tokenMatch = loginPage.data.match(/name="__RequestVerificationToken"[^>]+value="([^"]+)"/);
    const token = tokenMatch ? tokenMatch[1] : "";

    const params = new URLSearchParams();
    params.append("UserName", VERTICE_LOGIN);
    params.append("UserPassword", VERTICE_SENHA);
    params.append("__RequestVerificationToken", token);

    // POST sem seguir redirect para capturar cookies
    const postRes = await axios.post(VERTICE_URL + "/Login", params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": getCookieString(),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": VERTICE_URL + "/Login",
        "Origin": VERTICE_URL
      },
      httpsAgent: agent,
      maxRedirects: 0,
      validateStatus: s => s < 400,
      timeout: 15000
    });

    parseCookies(postRes.headers["set-cookie"]);
    console.log("[VERTICE] POST status:", postRes.status);
    console.log("[VERTICE] Location:", postRes.headers.location);
    console.log("[VERTICE] Set-Cookie:", postRes.headers["set-cookie"]);

    // Se redirecionou com sucesso, pega cookies do redirect
    if (postRes.status === 302 && postRes.headers.location) {
      const redirectRes = await axios.get(VERTICE_URL + postRes.headers.location, {
        headers: {
          "Cookie": getCookieString(),
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        httpsAgent: agent,
        maxRedirects: 0,
        validateStatus: s => s < 400,
        timeout: 15000
      });
      parseCookies(redirectRes.headers["set-cookie"]);
      console.log("[VERTICE] Redirect cookies:", redirectRes.headers["set-cookie"]);
    }
    global._verticeCookie = getCookieString();

    const loggedIn = !postRes.data.includes("Informe suas credenciais") && !postRes.data.includes("Bem Vindo (a)");
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
    console.log("[VERTICE] buscarSMs - cookie atual:", getCookieString().substring(0, 100));
    if (!getCookieString().includes("Session")) {
      const ok = await loginVertice();
      if (!ok) return [];
    }

    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    const formatDate = d => d.toLocaleDateString("pt-BR") + " 00:00:00";
    const formatDateFim = d => d.toLocaleDateString("pt-BR") + " 23:59:59";

    const params = new URLSearchParams({
      sEcho: "1",
      iColumns: "13",
      sColumns: ",,,,,,,,,,,,",
      iDisplayStart: "0",
      iDisplayLength: "500",
      mDataProp_0: "CD_REGISTRO_VIAGENS",
      sSearch_0: "", bRegex_0: "false", bSearchable_0: "true",
      mDataProp_1: "CD_REGISTRO_VIAGENS",
      sSearch_1: "", bRegex_1: "false", bSearchable_1: "true",
      mDataProp_2: "DS_PLACA",
      sSearch_2: "", bRegex_2: "false", bSearchable_2: "true",
      mDataProp_3: "DS_NOME",
      sSearch_3: "", bRegex_3: "false", bSearchable_3: "true",
      mDataProp_4: "VL_TOTAL_PRODUTOS",
      sSearch_4: "", bRegex_4: "false", bSearchable_4: "true",
      mDataProp_5: "DS_PGR",
      sSearch_5: "", bRegex_5: "false", bSearchable_5: "true",
      mDataProp_6: "DT_INICIO_REAL",
      sSearch_6: "", bRegex_6: "false", bSearchable_6: "true",
      mDataProp_7: "DT_FIM_REAL",
      sSearch_7: "", bRegex_7: "false", bSearchable_7: "true",
      mDataProp_8: "VL_SITUACAO",
      sSearch_8: "", bRegex_8: "false", bSearchable_8: "true",
      mDataProp_9: "NM_RAZAO_SOCIAL",
      sSearch_9: "", bRegex_9: "false", bSearchable_9: "true",
      mDataProp_10: "DS_CIDADE_ORIGEM",
      sSearch_10: "", bRegex_10: "false", bSearchable_10: "true",
      mDataProp_11: "DS_CIDADE_DESTINO",
      sSearch_11: "", bRegex_11: "false", bSearchable_11: "true",
      mDataProp_12: "NM_USUARIO_CRIOU",
      sSearch_12: "", bRegex_12: "false", bSearchable_12: "true",
      sSearch: "", bRegex: "false",
      CODIGO_VIAGEM: "",
      DS_PLACA_FILTRO: "",
      DS_NOME: "",
      DS_PGR: "",
      DT_CRIOU_INI: formatDate(ontem),
      DT_CRIOU_FIM: formatDateFim(hoje),
      "_": Date.now().toString()
    });

    console.log("[VERTICE] Chamando CarregarGridViagem...");
    const res = await axios.get(VERTICE_URL + "/Viagem/CarregarGridViagem?" + params.toString(), {
      headers: {
        "Cookie": getCookieString(),
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": VERTICE_URL + "/Viagem/Index"
      },
      httpsAgent: agent,
      timeout: 15000
    });

    parseCookies(res.headers["set-cookie"]);

    if (!res.data || !res.data.aaData) {
      console.log("[VERTICE] Sem dados ou sessao expirada");
      cookieJar = {};
      return [];
    }

    const sms = res.data.aaData.map(function(row) {
      return {
        id: row.CD_REGISTRO_VIAGENS || "",
        veiculo: row.DS_PLACA || "",
        motorista: row.DS_NOME || "",
        origem: row.DS_CIDADE_ORIGEM || "",
        destino: row.DS_CIDADE_DESTINO || "",
        pgr: row.DS_PGR || "",
        valor: row.VL_TOTAL_PRODUTOS || "",
        status: row.VL_SITUACAO || "",
        transportador: row.NM_RAZAO_SOCIAL || "",
        inicio: row.DT_INICIO_REAL || "",
        fim: row.DT_FIM_REAL || ""
      };
    });

    console.log("[VERTICE] SMs encontradas:", sms.length);
    return sms;
  } catch(e) {
    console.error("[VERTICE] Erro buscarSMs:", e.message);
    cookieJar = {};
    return [];
  }
}

async function importarSMsVertice() {
  console.log("[VERTICE] Iniciando importacao...");
  const sms = await buscarSMs();
  let importadas = 0;
  let ignoradas = 0;

  for (const sm of sms) {
    try {
      if (!sm.veiculo) continue;
      const placa = sm.veiculo.trim().toUpperCase();

      const { rows } = await db.query("SELECT id FROM vehicles WHERE plate = $1", [placa]);
      const vehicleId = rows.length > 0 ? rows[0].id : null;

      const { rows: exist } = await db.query(
        "SELECT id FROM viagens WHERE placa = $1 AND status = 'ativa'", [placa]
      );
      if (exist.length > 0) { ignoradas++; continue; }

      await db.query(
        "INSERT INTO viagens (vehicle_id, placa, motorista, origem, destino, cliente, status_carga, status, criado_em) VALUES ($1,$2,$3,$4,$5,$6,'Em Trânsito','ativa',NOW())",
        [vehicleId, placa, sm.motorista, sm.origem, sm.destino, sm.transportador]
      );
      importadas++;
      console.log("[VERTICE] Importada:", placa, sm.origem, "->", sm.destino);
    } catch(e) {
      console.error("[VERTICE] Erro SM:", e.message);
    }
  }
  console.log("[VERTICE] Concluido:", importadas, "importadas,", ignoradas, "ignoradas");
  return { total: sms.length, importadas, ignoradas };
}

module.exports = { importarSMsVertice, buscarSMs, loginVertice };