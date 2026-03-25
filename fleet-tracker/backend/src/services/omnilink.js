const axios = require("axios");
const crypto = require("crypto");
const db = require("../models/db");

const WSTT_URL = "http://wstt.omnilink.com.br/iasws/iasws.asmx";
const USER = process.env.OMNILINK_USER;
const PASS = crypto.createHash("md5").update(process.env.OMNILINK_PASSWORD || "").digest("hex");

async function syncOmnilink() {
  const { rows: vehicles } = await db.query(
    "SELECT id, plate, name, omnilink_id, speed_limit FROM vehicles WHERE active = TRUE"
  );
  if (vehicles.length === 0) return [];

  const positions = [];

  for (const vehicle of vehicles) {
    try {
      const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="http://microsoft.com/webservices/">
  <soap:Body>
    <web:ObtemPosicaoAtual>
      <web:Usuario>${USER}</web:Usuario>
      <web:Senha>${PASS}</web:Senha>
      <web:Serial>${vehicle.omnilink_id}</web:Serial>
    </web:ObtemPosicaoAtual>
  </soap:Body>
</soap:Envelope>`;

      const { data } = await axios.post(WSTT_URL, soap, {
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": "http://microsoft.com/webservices/ObtemPosicaoAtual"
        },
        timeout: 15000,
      });

      const lat = parseFloat(data.match(/<Latitude>(.*?)<\/Latitude>/)?.[1] || "0");
      const lng = parseFloat(data.match(/<Longitude>(.*?)<\/Longitude>/)?.[1] || "0");
      const speed = parseInt(data.match(/<VEL>(.*?)<\/VEL>/)?.[1] || "0");
      const heading = parseInt(data.match(/<DIR>(.*?)<\/DIR>/)?.[1] || "0");
      const recordedAt = data.match(/<DATA>(.*?)<\/DATA>/)?.[1] || new Date().toISOString();

      if (lat === 0 && lng === 0) continue;

      await db.query(
        "INSERT INTO positions (vehicle_id, lat, lng, speed, heading, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [vehicle.id, lat, lng, speed, heading, new Date(recordedAt)]
      );

      positions.push({
        vehicleId: vehicle.id,
        plate: vehicle.plate,
        name: vehicle.name,
        speedLimit: vehicle.speed_limit,
        lat, lng, speed, heading,
        recordedAt,
      });

    } catch (err) {
      console.error("[OMNILINK] Erro " + vehicle.plate + ":", err.message);
      console.error("[OMNILINK] Resposta:", err.response?.data?.substring(0, 300));
    }
  }

  return positions;
}

module.exports = { syncOmnilink };
