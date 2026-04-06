const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const router = express.Router();

const WSTT_URL = "https://wstt.omnilink.com.br/iasws/iasws.asmx";
const USER = process.env.OMNILINK_USER;
const PASS = process.env.OMNILINK_PASSWORD;

async function soapRequest(action, body) {
  const msgId = "urn:uuid:" + crypto.randomUUID();
  const soap = '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<soap-env:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">' +
    '<wsa:Action>http://microsoft.com/webservices/IASWSSoap/' + action + 'Request</wsa:Action>' +
    '<wsa:MessageID>' + msgId + '</wsa:MessageID>' +
    '<wsa:To>' + WSTT_URL + '</wsa:To>' +
    '</soap-env:Header>' +
    '<soap-env:Body>' +
    '<ns0:' + action + ' xmlns:ns0="http://microsoft.com/webservices/">' +
    '<Usuario>' + USER + '</Usuario>' +
    '<Senha>' + PASS + '</Senha>' +
    body +
    '</ns0:' + action + '>' +
    '</soap-env:Body>' +
    '</soap-env:Envelope>';

  const { data } = await axios.post(WSTT_URL, soap, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": "http://microsoft.com/webservices/IASWSSoap/" + action + "Request"
    },
    timeout: 15000
  });
  return data;
}

// Km por HODOMETRO real da Omnilink
router.get("/hodometro-km/:plate", async (req, res) => {
  try {
    const db = require("../models/db");
    const { plate } = req.params;
    const { start, end } = req.query;
    const startDate = start || new Date(new Date().setDate(1)).toISOString().slice(0,10);
    const endDate = end || new Date().toISOString().slice(0,10);

    const result = await db.query(
      "SELECT p.odometer, p.recorded_at FROM positions p " +
      "JOIN vehicles v ON v.id = p.vehicle_id " +
      "WHERE v.plate = $1 AND p.odometer > 0 " +
      "AND p.recorded_at >= $2::date " +
      "AND p.recorded_at < ($3::date + interval '1 day') " +
      "ORDER BY p.recorded_at ASC",
      [plate, startDate, endDate]
    );

    if (result.rows.length < 2) {
      return res.json({ plate, km: 0, pontos: result.rows.length, metodo: "hodometro" });
    }

    const primeiro = result.rows[0];
    const ultimo = result.rows[result.rows.length - 1];
    const kmPercorrido = Math.round((ultimo.odometer - primeiro.odometer) / 1000 * 10) / 10;

    res.json({
      plate,
      km: kmPercorrido > 0 ? kmPercorrido : 0,
      odometro_inicio: Math.round(primeiro.odometer / 1000),
      odometro_fim: Math.round(ultimo.odometer / 1000),
      pontos: result.rows.length,
      periodo: { start: startDate, end: endDate },
      metodo: "hodometro"
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Km hodometro todos os veiculos
router.get("/hodometro-km-todos", async (req, res) => {
  try {
    const db = require("../models/db");
    const { start, end } = req.query;
    const startDate = start || new Date(new Date().setDate(1)).toISOString().slice(0,10);
    const endDate = end || new Date().toISOString().slice(0,10);

    const result = await db.query(
      "SELECT v.plate, " +
      "MIN(p.odometer) FILTER (WHERE p.odometer > 0) as odo_inicio, " +
      "MAX(p.odometer) FILTER (WHERE p.odometer > 0) as odo_fim, " +
      "COUNT(*) as pontos " +
      "FROM positions p JOIN vehicles v ON v.id = p.vehicle_id " +
      "WHERE p.odometer > 0 " +
      "AND p.recorded_at >= $1::date " +
      "AND p.recorded_at < ($2::date + interval '1 day') " +
      "GROUP BY v.plate ORDER BY v.plate",
      [startDate, endDate]
    );

    const dados = result.rows.map(function(r) {
      return {
        plate: r.plate,
        km: r.odo_fim && r.odo_inicio ? Math.round((r.odo_fim - r.odo_inicio) / 1000 * 10) / 10 : 0,
        pontos: parseInt(r.pontos)
      };
    }).filter(function(r) { return r.km >= 0; });

    res.json(dados);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Km por GPS do banco
router.get("/km/:plate", async (req, res) => {
  try {
    const db = require("../models/db");
    const { plate } = req.params;
    const { start, end } = req.query;
    const startDate = start || new Date(new Date().setDate(1)).toISOString().slice(0,10);
    const endDate = end || new Date().toISOString().slice(0,10);

    const result = await db.query(
      "SELECT p.lat, p.lng FROM positions p " +
      "JOIN vehicles v ON v.id = p.vehicle_id " +
      "WHERE v.plate = $1 " +
      "AND p.recorded_at >= $2::date " +
      "AND p.recorded_at < ($3::date + interval '1 day') " +
      "ORDER BY p.recorded_at ASC",
      [plate, startDate, endDate]
    );

    const pts = result.rows;
    let km = 0;
    for (let i = 1; i < pts.length; i++) {
      const R = 6371;
      const dLat = (parseFloat(pts[i].lat) - parseFloat(pts[i-1].lat)) * Math.PI / 180;
      const dLon = (parseFloat(pts[i].lng) - parseFloat(pts[i-1].lng)) * Math.PI / 180;
      const a = Math.sin(dLat/2)**2 + Math.cos(parseFloat(pts[i-1].lat)*Math.PI/180) * Math.cos(parseFloat(pts[i].lat)*Math.PI/180) * Math.sin(dLon/2)**2;
      const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      if (d < 50) km += d;
    }
    res.json({ plate, km: Math.round(km*10)/10, pontos: pts.length, periodo: { start: startDate, end: endDate } });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Km GPS todos os veiculos
router.get("/km-todos", async (req, res) => {
  try {
    const db = require("../models/db");
    const { start, end } = req.query;
    const startDate = start || new Date(new Date().setDate(1)).toISOString().slice(0,10);
    const endDate = end || new Date().toISOString().slice(0,10);

    const vehicles = await db.query("SELECT id, plate FROM vehicles WHERE active = true ORDER BY plate");
    const results = [];
    for (const v of vehicles.rows) {
      const result = await db.query(
        "SELECT lat, lng FROM positions WHERE vehicle_id = $1 " +
        "AND recorded_at >= $2::date " +
        "AND recorded_at < ($3::date + interval '1 day') " +
        "ORDER BY recorded_at ASC",
        [v.id, startDate, endDate]
      );
      const pts = result.rows;
      let km = 0;
      for (let i = 1; i < pts.length; i++) {
        const R = 6371;
        const dLat = (parseFloat(pts[i].lat) - parseFloat(pts[i-1].lat)) * Math.PI / 180;
        const dLon = (parseFloat(pts[i].lng) - parseFloat(pts[i-1].lng)) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(parseFloat(pts[i-1].lat)*Math.PI/180) * Math.cos(parseFloat(pts[i].lat)*Math.PI/180) * Math.sin(dLon/2)**2;
        const d = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        if (d < 50) km += d;
      }
      results.push({ plate: v.plate, km: Math.round(km*10)/10, pontos: pts.length });
    }
    res.json(results);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Testa hodometro via Omnilink
router.get("/hodometro/:serial", async (req, res) => {
  try {
    const { serial } = req.params;
    const xml = await soapRequest("ObtemPosicaoAtual", "<Serial>" + serial + "</Serial>");
    res.type("xml").send(xml);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;