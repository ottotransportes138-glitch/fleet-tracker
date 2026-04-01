const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const db = require("../models/db");
const router = express.Router();

const WSTT_URL = "https://wstt.omnilink.com.br/iasws/iasws.asmx";
const USER = process.env.OMNILINK_USER;
const PASS = process.env.OMNILINK_PASSWORD;

async function soapRequest(action, body) {
  const msgId = "urn:uuid:" + crypto.randomUUID();
  const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/">
  <soap-env:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:Action>http://microsoft.com/webservices/IASWSSoap/${action}Request</wsa:Action>
    <wsa:MessageID>${msgId}</wsa:MessageID>
    <wsa:To>${WSTT_URL}</wsa:To>
  </soap-env:Header>
  <soap-env:Body>
    <ns0:${action} xmlns:ns0="http://microsoft.com/webservices/">
      <Usuario>${USER}</Usuario>
      <Senha>${PASS}</Senha>
      ${body}
    </ns0:${action}>
  </soap-env:Body>
</soap-env:Envelope>`;

  const { data } = await axios.post(WSTT_URL, soap, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": `http://microsoft.com/webservices/IASWSSoap/${action}Request`
    },
    timeout: 15000
  });
  return data;
}

// Busca km percorrido via Omnilink para um serial
router.get("/km/:serial", async (req, res) => {
  try {
    const { serial } = req.params;
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const dtInicio = inicio.toISOString().split('T')[0] + 'T00:00:00';
    const dtFim = hoje.toISOString().split('T')[0] + 'T23:59:59';

    const xml = await soapRequest("ObtemHistoricoViagem",
      `<Serial>${serial}</Serial>
       <DataInicio>${dtInicio}</DataInicio>
       <DataFim>${dtFim}</DataFim>`
    );

    res.send(xml);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;