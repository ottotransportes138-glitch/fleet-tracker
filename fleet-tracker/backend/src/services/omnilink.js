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

  console.log("[OMNILINK] Veiculos encontrados:", vehicles.length);
  if (vehicles.length === 0) return [];

  const positions = [];

  for (const vehicle of vehicles) {
    try {
      console.log("[OMNILINK] Buscando posicao:", vehicle.omnilink_id);

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

      console.log("[OMNILINK] Resposta:", data.substring(0, 500));

      const lat = parseFloat(data.match(/<Latitude>(.*?)<\/Latitude>/)?.[1] || "0");
      const lng = parseFloat(data.match(/<Longitude>(.*?)<\/Longitude>/)?.[1] || "0");
      const speed = parseInt(data.match(/<VEL>(.*?)<\/VEL>/)?.[1] || "0");
      const heading = parseInt(data.match(/<DIR>(.*?)<\/DIR>/)?.[1] || "0");
      const recordedAt = data.match(/<DATA>(.*?)<\/DATA>/)?.[1] || new Date().toISOString();

      console.log("[OMNILINK] Lat:", lat, "Lng:", lng, "Speed:", speed);

      if (lat === 0 && lng === 0) {
        console.log("[OMNILINK] Posicao zerada, ignorando");
        continue;
      }

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

      console.log("[OMNILINK] Posicao salva:", vehicle.plate, lat, lng);

    } catch (err) {
      console.error("[OMNILINK] Erro " + vehicle.omnilink_id + ":", err.message);
      console.error("[OMNILINK] Resposta:", err.response?.data?.substring(0, 500));
    }
  }

  return positions;
}

module.exports = { syncOmnilink };
