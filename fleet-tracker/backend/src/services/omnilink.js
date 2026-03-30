const axios = require("axios");
const crypto = require("crypto");
const db = require("../models/db");

const WSTT_URL = "https://wstt.omnilink.com.br/iasws/iasws.asmx";
const USER = process.env.OMNILINK_USER;
const PASS = process.env.OMNILINK_PASSWORD;

async function syncOmnilink() {
  const { rows: vehicles } = await db.query(
    "SELECT id, plate, name, omnilink_id, speed_limit FROM vehicles WHERE active = TRUE"
  );
  console.log("[OMNILINK] Veiculos:", vehicles.length);
  if (vehicles.length === 0) return [];

  const positions = [];

  for (const vehicle of vehicles) {
    try {
      const msgId = "urn:uuid:" + crypto.randomUUID();
      const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/">
  <soap-env:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:Action>http://microsoft.com/webservices/IASWSSoap/ObtemPosicaoAtualRequest</wsa:Action>
    <wsa:MessageID>${msgId}</wsa:MessageID>
    <wsa:To>${WSTT_URL}</wsa:To>
  </soap-env:Header>
  <soap-env:Body>
    <ns0:ObtemPosicaoAtual xmlns:ns0="http://microsoft.com/webservices/">
      <Usuario>${USER}</Usuario>
      <Senha>${PASS}</Senha>
      <Serial>${vehicle.omnilink_id}</Serial>
    </ns0:ObtemPosicaoAtual>
  </soap-env:Body>
</soap-env:Envelope>`;

      const { data } = await axios.post(WSTT_URL, soap, {
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": "http://microsoft.com/webservices/IASWSSoap/ObtemPosicaoAtualRequest"
        },
        timeout: 15000,
      });

      const decoded = data.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      console.log("[OMNILINK] Resposta:", decoded.substring(0, 400));

      const lat = parseFloat(decoded.match(/<Latitude>(.*?)<\/Latitude>/)?.[1] || "0");
      const lng = parseFloat(decoded.match(/<Longitude>(.*?)<\/Longitude>/)?.[1] || "0");
      const speed = parseInt(decoded.match(/<VEL>(.*?)<\/VEL>/)?.[1] || "0");
      const heading = parseInt(decoded.match(/<DIR>(.*?)<\/DIR>/)?.[1] || "0");
      const recordedAt = decoded.match(/<DATA>(.*?)<\/DATA>/)?.[1]?.trim() || new Date().toISOString();

      console.log("[OMNILINK]", vehicle.plate, "lat:", lat, "lng:", lng, "vel:", speed);
      if (!lat || !lng) continue;

      await db.query(
        "INSERT INTO positions (vehicle_id, lat, lng, speed, heading, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [vehicle.id, lat, lng, speed, heading, new Date(recordedAt)]
      );

      positions.push({ vehicleId: vehicle.id, plate: vehicle.plate, name: vehicle.name, lat, lng, speed, heading, recordedAt });
      console.log("[OMNILINK] Posicao salva:", vehicle.plate, lat, lng);

    } catch (err) {
      console.error("[OMNILINK] Erro:", vehicle.plate, err.message);
    }
  }

  return positions;
}

module.exports = { syncOmnilink };
