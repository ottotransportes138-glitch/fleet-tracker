const axios = require("axios");
const db = require("../models/db");

const WSTT_URL = "https://wstt.omnilink.com.br/iasws/iasws.asmx";
const USER = process.env.OMNILINK_USER;
const PASS = process.env.OMNILINK_PASSWORD;

async function syncOmnilink() {
  const { rows: vehicles } = await db.query(
    "SELECT id, plate, name, omnilink_id, speed_limit FROM vehicles WHERE active = TRUE"
  );
  console.log("[OMNILINK] Veiculos:", vehicles.length);
  console.log("[OMNILINK] USER:", USER);
  console.log("[OMNILINK] PASS length:", PASS ? PASS.length : 0);
  if (vehicles.length === 0) return [];

  const positions = [];
  for (const vehicle of vehicles) {
    try {
      const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ObtemPosicaoAtual xmlns="http://microsoft.com/webservices/">
      <Usuario>${USER}</Usuario>
      <Senha>${PASS}</Senha>
      <Serial>${vehicle.omnilink_id}</Serial>
    </ObtemPosicaoAtual>
  </soap:Body>
</soap:Envelope>`;

      console.log("[OMNILINK] SOAP enviado:", soap.substring(0, 400));

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

      if (lat === 0 && lng === 0) continue;

      await db.query(
        "INSERT INTO positions (vehicle_id, lat, lng, speed, heading, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [vehicle.id, lat, lng, speed, heading, new Date(recordedAt)]
      );

      positions.push({ vehicleId: vehicle.id, plate: vehicle.plate, name: vehicle.name, speedLimit: vehicle.speed_limit, lat, lng, speed, heading, recordedAt });
      console.log("[OMNILINK] Posicao salva:", vehicle.plate, lat, lng);

    } catch (err) {
      console.error("[OMNILINK] Erro:", err.message);
      console.error("[OMNILINK] Resposta erro:", err.response?.data?.substring(0, 500));
    }
  }
  return positions;
}

module.exports = { syncOmnilink };

