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
  if (vehicles.length === 0) return [];

  const positions = [];

  for (const vehicle of vehicles) {
    try {
      console.log("[OMNILINK] Buscando:", vehicle.plate, "serial:", vehicle.omnilink_id);

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

      const { data } = await axios.post(WSTT_URL, soap, {
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": "http://microsoft.com/webservices/ObtemPosicaoAtual"
        },
        timeout: 15000,
      });

      console.log("[OMNILINK] Resposta:", data.substring(0, 600));

    } catch (err) {
      console.error("[OMNILINK] Erro:", vehicle.plate, err.message);
    }
  }

  return positions;
}

module.exports = { syncOmnilink };
