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
  const now = new Date();
  const dataFim = now.toISOString().slice(0,19);
  const dataInicio = new Date(now - 30*60000).toISOString().slice(0,19);

  try {
    const soap = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wst="http://microsoft.com/webservices/">
   <soapenv:Header/>
   <soapenv:Body>
      <wst:ObtemEventosCtrl>
         <Usuario>${USER}</Usuario>
         <Senha>${PASS}</Senha>
         <UltimoSequencialCtrl>0</UltimoSequencialCtrl>
         <dataInicio>${dataInicio}</dataInicio>
         <dataFim>${dataFim}</dataFim>
      </wst:ObtemEventosCtrl>
   </soapenv:Body>
</soapenv:Envelope>`;

    console.log("[OMNILINK] Enviando:", soap.substring(0, 500));

    const { data } = await axios.post(WSTT_URL, soap, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://microsoft.com/webservices/ObtemEventosCtrl"
      },
      timeout: 15000,
    });

    console.log("[OMNILINK] Resposta:", data.substring(0, 1000));

  } catch (err) {
    console.error("[OMNILINK] Erro:", err.message);
    console.error("[OMNILINK] Resposta erro:", err.response?.data?.substring(0, 500));
  }

  return positions;
}

module.exports = { syncOmnilink };
