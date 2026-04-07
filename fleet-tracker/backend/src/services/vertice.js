const puppeteer = require("puppeteer-core");
const db = require("../models/db");

const VERTICE_URL = "https://monittora.vertticegr.com.br:1515";
const VERTICE_LOGIN = "70534428100";
const VERTICE_SENHA = "1031go";

async function getBrowser() {
  // Tenta encontrar o Chrome instalado
  const executablePath = 
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ||
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
  
  return await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--ignore-certificate-errors",
      "--disable-web-security"
    ]
  });
}

async function loginVertice(page) {
  await page.goto(VERTICE_URL + "/Account/Login", { waitUntil: "networkidle2", timeout: 30000 });
  await page.type('input[name="Login"]', VERTICE_LOGIN);
  await page.type('input[name="Senha"]', VERTICE_SENHA);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 });
  console.log("[VERTICE] Login realizado!");
}

async function buscarSMs() {
  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Login
    await loginVertice(page);

    // Acessa lista de viagens
    await page.goto(VERTICE_URL + "/Viagem/Index", { waitUntil: "networkidle2", timeout: 30000 });

    // Aguarda tabela carregar
    await page.waitForSelector("table", { timeout: 15000 });

    // Extrai dados da tabela
    const sms = await page.evaluate(function() {
      const rows = document.querySelectorAll("table tbody tr");
      const dados = [];
      rows.forEach(function(row) {
        const cols = row.querySelectorAll("td");
        if (cols.length > 3) {
          dados.push({
            id: cols[0] ? cols[0].innerText.trim() : "",
            veiculo: cols[1] ? cols[1].innerText.trim() : "",
            motorista: cols[2] ? cols[2].innerText.trim() : "",
            origem: cols[3] ? cols[3].innerText.trim() : "",
            destino: cols[4] ? cols[4].innerText.trim() : "",
            status: cols[5] ? cols[5].innerText.trim() : ""
          });
        }
      });
      return dados;
    });

    console.log("[VERTICE] SMs encontradas:", sms.length);
    return sms;
  } catch(e) {
    console.error("[VERTICE] Erro:", e.message);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function importarSMsVertice() {
  console.log("[VERTICE] Iniciando importacao de SMs...");
  const sms = await buscarSMs();
  
  let importadas = 0;
  for (const sm of sms) {
    try {
      if (!sm.veiculo) continue;
      
      // Extrai placa do veiculo (formato: "123456 - ABC1D23")
      const placaMatch = sm.veiculo.match(/([A-Z]{3}\d[A-Z0-9]\d{2}|[A-Z]{3}\d{4})/);
      if (!placaMatch) continue;
      const placa = placaMatch[1];

      // Verifica se veiculo existe
      const { rows } = await db.query("SELECT id FROM vehicles WHERE plate = $1", [placa]);
      const vehicleId = rows.length > 0 ? rows[0].id : null;

      // Verifica se SM ja foi importada
      const { rows: exist } = await db.query(
        "SELECT id FROM viagens WHERE placa = $1 AND status = 'ativa'", [placa]
      );
      if (exist.length > 0) continue;

      // Extrai nome do motorista
      const motorista = sm.motorista.replace(/^\d+\s*-\s*/, '').trim();
      const origem = sm.origem.replace(/^\d+\s*-\s*/, '').trim();
      const destino = sm.destino.replace(/^\d+\s*-\s*/, '').trim();

      await db.query(`
        INSERT INTO viagens (vehicle_id, placa, motorista, origem, destino, status_carga, status, criado_em)
        VALUES ($1, $2, $3, $4, $5, 'Em Trânsito', 'ativa', NOW())
      `, [vehicleId, placa, motorista, origem, destino]);

      importadas++;
      console.log("[VERTICE] Importada:", placa, origem, "->", destino);
    } catch(e) {
      console.error("[VERTICE] Erro SM:", sm.veiculo, e.message);
    }
  }
  console.log("[VERTICE] Importacao concluida:", importadas, "viagens");
  return { total: sms.length, importadas };
}

module.exports = { importarSMsVertice, buscarSMs };