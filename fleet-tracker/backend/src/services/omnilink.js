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
  const partes = coord.split("_");
  if (partes.length < 5) return null;
  const graus = parseFloat(partes[0]);
  const min = parseFloat(partes[1]);
  const seg = parseFloat(partes[2] + "." + partes[3]);
  const dir = partes[4];
  let decimal = graus + min / 60 + seg / 3600;
  if (dir === "S" || dir === "W") decimal = -decimal;
  return decimal;
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
  const idAnterior = (BigInt(idctrl) - BigInt(100000)).toString();
  console.log("[OMNILINK] idctrl:", idctrl, "buscando desde:", idAnterior);
  return idAnterior;
}

async function syncOmnilink() {
  const { rows: vehicles } = await db.query(
    "SELECT id, plate, name, omnilink_id, speed_limit FROM vehicles WHERE active = TRUE"
  );
  if (vehicles.length === 0) return [];

  const positions = [];

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

    console.log("[OMNILINK] Eventos encontrados:", eventos.length);

    for (const evento of eventos) {
      const idTerminal = evento[1].trim();
      const speed = parseInt(evento[2].trim()) || 0;
      const latStr = evento[3].trim();
      const lngStr = evento[4].trim();
      const dataHora = evento[5].trim();

      const lat = converterCoordenada(latStr);
      const lng = converterCoordenada(lngStr);

      if (!lat || !lng) continue;

      const vehicle = vehicles.find(v => v.omnilink_id && idTerminal.toLowerCase().includes(v.omnilink_id.toLowerCase().replace("om","")));

      if (!vehicle) {
        console.log("[OMNILINK] Terminal nao encontrado:", idTerminal);
        continue;
      }

      const [dia, mes, ano, hora] = dataHora.replace(" ", "_").split(/[\/_ :]/);
      const recordedAt = new Date(`${ano}-${mes}-${dia}T${hora}:00`);

      await db.query(
        "INSERT INTO positions (vehicle_id, lat, lng, speed, heading, recorded_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
        [vehicle.id, lat, lng, speed, 0, recordedAt]
      );

      positions.push({ vehicleId: vehicle.id, plate: vehicle.plate, name: vehicle.name, lat, lng, speed });
      console.log("[OMNILINK] Posicao salva:", vehicle.plate, lat, lng, speed);
    }

  } catch (err) {
    console.error("[OMNILINK] Erro:", err.message);
  }

  return positions;
}

module.exports = { syncOmnilink };


