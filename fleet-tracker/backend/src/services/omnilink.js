const axios = require("axios");
const db = require("../models/db");

const WSTT_URL = "https://wstt.omnilink.com.br/iasws/iasws.asmx";
const USER = process.env.OMNILINK_USER;
const PASS = process.env.OMNILINK_PASSWORD;

function decodeHtml(str) {
  return str.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function converterCoordenada(coord) {
  if (!coord) return null;
  const partes = coord.trim().split("_");
  if (partes.length < 5) return null;
  const graus = parseFloat(partes[0]);
  const min = parseFloat(partes[1]);
  const seg = parseFloat(partes[2] + "." + partes[3]);
  const dir = partes[4];
  let decimal = graus + min / 60 + seg / 3600;
  if (dir === "S" || dir === "W") decimal = -decimal;
  return decimal;
}

function converterData(dataHora) {
  if (!dataHora) return new Date();
  const [data, hora] = dataHora.trim().split(" ");
  const [dia, mes, ano] = data.split("/");
  return new Date(`${ano}-${mes}-${dia}T${hora}Z`);
}

async function buscarUltimoId() {
  const soap = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="http://microsoft.com/webservices/">
   <soapenv:Header/>
   <soapenv:Body>
      <web:BuscarUltimoIdPost>
         <Usuario>${USER}</Usuario>
         <Senha>${PASS}</Senha>
      </web:BuscarUltimoIdPost>
   </soapenv:Body>
</soapenv:Envelope>`;

  const { data } = await axios.post(WSTT_URL, soap, {
    headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "http://microsoft.com/webservices/BuscarUltimoIdPost" },
    timeout: 15000,
  });

  const decoded = decodeHtml(data);
  const idctrl = decoded.match(/<idctrl>\s*(.*?)\s*<\/idctrl>/)?.[1]?.trim() || "0";
  const idAnterior = (BigInt(idctrl) - BigInt(50000)).toString();
  return idAnterior;
}

async function syncOmnilink() {
  const { rows: vehicles } = await db.query(
    "SELECT id, plate, name, omnilink_id, speed_limit FROM vehicles WHERE active = TRUE"
  );
  if (vehicles.length === 0) return [];

  const positions = [];
  const ultimasPosicoesMap = {};

  try {
    const ultimoId = await buscarUltimoId();

    const soap = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wst="http://microsoft.com/webservices/">
   <soapenv:Header/>
   <soapenv:Body>
      <wst:ObtemEventosCtrl>
         <Usuario>${USER}</Usuario>
         <Senha>${PASS}</Senha>
         <UltimoSequencialCtrl>${ultimoId}</UltimoSequencialCtrl>
      </wst:ObtemEventosCtrl>
   </soapenv:Body>
</soapenv:Envelope>`;

    const { data } = await axios.post(WSTT_URL, soap, {
      headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "http://microsoft.com/webservices/ObtemEventosCtrl" },
      timeout: 15000,
    });

    const decoded = decodeHtml(data);
    const eventos = [...decoded.matchAll(/<IdTerminal>(.*?)<\/IdTerminal>[\s\S]*?<Velocidade>(.*?)<\/Velocidade>[\s\S]*?<Latitude>(.*?)<\/Latitude>[\s\S]*?<Longitude>(.*?)<\/Longitude>[\s\S]*?<DataHoraEvento>(.*?)<\/DataHoraEvento>/g)];

    // Pega apenas o evento mais recente de cada terminal
    for (const evento of eventos) {
      const idTerminal = evento[1].trim();
      const vehicle = vehicles.find(v => v.omnilink_id && v.omnilink_id.toUpperCase() === idTerminal.toUpperCase());
      if (!vehicle) continue;

      const recordedAt = converterData(evento[5].trim());
      const existing = ultimasPosicoesMap[vehicle.id];
      if (!existing || recordedAt > existing.recordedAt) {
        ultimasPosicoesMap[vehicle.id] = {
          vehicle,
          speed: parseInt(evento[2].trim()) || 0,
          latStr: evento[3].trim(),
          lngStr: evento[4].trim(),
          recordedAt,
          dataHora: evento[5].trim()
        };
      }
    }

    // Salva apenas a posição mais recente de cada veículo
    for (const item of Object.values(ultimasPosicoesMap)) {
      const lat = converterCoordenada(item.latStr);
      const lng = converterCoordenada(item.lngStr);
      if (!lat || !lng) continue;

      await db.query(
        "INSERT INTO positions (vehicle_id, lat, lng, speed, heading, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [item.vehicle.id, lat, lng, item.speed, 0, item.recordedAt]
      );

      positions.push({ vehicleId: item.vehicle.id, plate: item.vehicle.plate, lat, lng, speed: item.speed });
      console.log("[OMNILINK] Posicao salva:", item.vehicle.plate, lat, lng, item.speed, item.dataHora);
    }

  } catch (err) {
    console.error("[OMNILINK] Erro:", err.message);
  }

  return positions;
}

module.exports = { syncOmnilink };

