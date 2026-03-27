const axios = require("axios");
const db = require("../models/db");

const WSTT_URL = "https://wstt.omnilink.com.br/iasws/iasws.asmx";
const USER = process.env.OMNILINK_USER;
const PASS = process.env.OMNILINK_PASSWORD;

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
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": "http://microsoft.com/webservices/BuscarUltimoIdPost"
    },
    timeout: 15000,
  });

  console.log("[OMNILINK] BuscarUltimoIdPost resposta:", data.substring(0, 500));
  const idctrl = data.match(/<idctrl>\s*(.*?)\s*<\/idctrl>/)?.[1]?.trim() || "0";
  console.log("[OMNILINK] idctrl:", idctrl);
  return idctrl;
}

async function syncOmnilink() {
  const { rows: vehicles } = await db.query(
    "SELECT id, plate, name, omnilink_id, speed_limit FROM vehicles WHERE active = TRUE"
  );
  console.log("[OMNILINK] Veiculos:", vehicles.length);
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
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://microsoft.com/webservices/ObtemEventosCtrl"
      },
      timeout: 15000,
    });

    console.log("[OMNILINK] ObtemEventosCtrl resposta:", data.substring(0, 1000));

  } catch (err) {
    console.error("[OMNILINK] Erro:", err.message);
    console.error("[OMNILINK] Resposta erro:", err.response?.data?.substring(0, 500));
  }

  return positions;
}

module.exports = { syncOmnilink };

