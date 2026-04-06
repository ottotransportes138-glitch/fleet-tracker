const axios = require("axios");
const crypto = require("crypto");
const db = require("../models/db");

const WSTT_URL = "https://wstt.omnilink.com.br/iasws/iasws.asmx";
const USER = process.env.OMNILINK_USER;
const PASS = process.env.OMNILINK_PASSWORD;

// Cache da última posição de cada veículo
const lastPosition = {};

async function syncOmnilink() {
  const { rows: vehicles } = await db.query(
    "SELECT id, plate, name, omnilink_id, speed_limit FROM vehicles WHERE active = TRUE"
  );
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
      const lat = parseFloat(decoded.match(/<Latitude>(.*?)<\/Latitude>/)?.[1] || "0");
      const lng = parseFloat(decoded.match(/<Longitude>(.*?)<\/Longitude>/)?.[1] || "0");
      const speed = parseInt(decoded.match(/<VEL>(.*?)<\/VEL>/)?.[1] || "0");
      const heading = parseInt(decoded.match(/<DIR>(.*?)<\/DIR>/)?.[1] || "0");
      const recordedAt = decoded.match(/<DATA>(.*?)<\/DATA>/)?.[1]?.trim() || new Date().toISOString();
      const odometer = parseInt(decoded.match(/<ODOMETER>(.*?)<\/ODOMETER>/)?.[1] || '0');

      if (!lat || !lng) continue;

      // Verifica se a posição mudou desde a última vez
      const last = lastPosition[vehicle.id];
      const posicaoIgual = last &&
        last.lat === lat &&
        last.lng === lng &&
        last.recordedAt === recordedAt;

      if (posicaoIgual) continue;

      // Atualiza cache
      lastPosition[vehicle.id] = { lat, lng, recordedAt };

      // Salva no banco
      await db.query(
        "INSERT INTO positions (vehicle_id, lat, lng, speed, heading, recorded_at, odometer) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
        [vehicle.id, lat, lng, speed, heading, new Date(recordedAt), odometer]
      );

      positions.push({
        vehicleId: vehicle.id,
        plate: vehicle.plate,
        name: vehicle.name,
        speedLimit: vehicle.speed_limit,
        lat, lng, speed, heading,
        recordedAt,
      });

      console.log("[OMNILINK]", vehicle.plate, lat, lng, speed + "km/h");

    } catch (err) {
      console.error("[OMNILINK] Erro:", vehicle.plate, err.message);
    }
  }

  return positions;
}

module.exports = { syncOmnilink };
