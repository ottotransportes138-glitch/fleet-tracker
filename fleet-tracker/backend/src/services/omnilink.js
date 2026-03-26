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
      const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ObtemEventosCtrl xmlns="http://microsoft.com/webservices/">
      <Usuario>${USER}</Usuario>
      <Senha>${PASS}</Senha>
      <idUltimoPost>0</idUltimoPost>
      <Serial>${vehicle.omnilink_id}</Serial>
    </ObtemEventosCtrl>
  </soap:Body>
</soap:Envelope>`;

      console.log("[OMNILINK] Chamando ObtemEventosCtrl para:", vehicle.omnilink_id);

      const { data } = await axios.post(WSTT_URL, soap, {
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction": ""
        },
        timeout: 15000,
      });

      console.log("[OMNILINK] Resposta:", data.substring(0, 800));

    } catch (err) {
      console.error("[OMNILINK] Erro:", err.message);
      console.error("[OMNILINK] Resposta erro:", err.response?.data?.substring(0, 500));
    }
  }

  return positions;
}

module.exports = { syncOmnilink };
