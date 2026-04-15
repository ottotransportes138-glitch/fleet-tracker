const express = require("express");
const db = require("../models/db");
const axios = require("axios");
const router = express.Router();
console.log("[VIAGENS] Rota carregada!");

async function geocodificar(cidade) {
  if (!cidade || cidade.length < 3) return null;
  try {
    const res = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q: cidade + ", Brasil", format: "json", limit: 1 },
      headers: { "User-Agent": "OttoGR-FleetTracker/1.0" },
      timeout: 5000
    });
    if (res.data && res.data.length > 0)
      return { lat: parseFloat(res.data[0].lat), lng: parseFloat(res.data[0].lon) };
  } catch(e) { console.error("[GEO]", e.message); }
  return null;
}

function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function calcularKmPercorrido(vehicleId, criadoEm, odometroInicio) {
  if (!vehicleId) return 0;
  try {
    // Usa hodometro se disponivel
    if (odometroInicio && odometroInicio > 0) {
      const { rows } = await db.query(
        "SELECT odometer FROM positions WHERE vehicle_id=$1 AND odometer > 0 ORDER BY recorded_at DESC LIMIT 1",
        [vehicleId]
      );
      if (rows.length > 0 && rows[0].odometer > 0) {
        const km = Math.round((rows[0].odometer - odometroInicio) / 1000 * 10) / 10;
        return km > 0 ? km : 0;
      }
    }
    // Fallback GPS
    const { rows } = await db.query(
      "SELECT lat, lng FROM positions WHERE vehicle_id=$1 AND recorded_at>=$2 ORDER BY recorded_at ASC",
      [vehicleId, criadoEm]
    );
    if (rows.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < rows.length; i++)
      total += distanciaKm(parseFloat(rows[i-1].lat), parseFloat(rows[i-1].lng), parseFloat(rows[i].lat), parseFloat(rows[i].lng));
    return Math.round(total * 10) / 10;
  } catch(e) { return 0; }
}

router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT v.*, p.lat as lat_atual, p.lng as lng_atual, p.speed as velocidade_atual
      FROM viagens v
      LEFT JOIN LATERAL (
        SELECT lat, lng, speed FROM positions
        WHERE vehicle_id = v.vehicle_id
        ORDER BY recorded_at DESC LIMIT 1
      ) p ON true
      WHERE v.status = 'ativa'
      ORDER BY v.criado_em DESC
    `);
    const result = await Promise.all(rows.map(async (v) => {
      const km = await calcularKmPercorrido(v.vehicle_id, v.criado_em, v.odometro_inicio);
      // Calcula km pelo hodometro atual
      let kmHodometro = 0;
      if (v.odometro_inicio && v.odometro_inicio > 0) {
        const { rows: posAtual } = await db.query(
          'SELECT odometer FROM positions WHERE vehicle_id=\ AND odometer > 0 ORDER BY recorded_at DESC LIMIT 1',
          [v.vehicle_id]
        );
        if (posAtual.length > 0 && posAtual[0].odometer > v.odometro_inicio) {
          kmHodometro = Math.round((posAtual[0].odometer - v.odometro_inicio) / 1000 * 10) / 10;
        }
      }
      const pct = v.km_total_calculado > 0 ? Math.min(Math.round(km/v.km_total_calculado*100), 100) : 0;
      return { ...v, km_percorrido: kmHodometro > 0 ? kmHodometro : km, progresso_pct: pct };
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cadastro manual de viagem
router.post("/manual", async (req, res) => {
  try {
    const { placa, motorista, origem, destino, cliente, valor_carga, status_carga, tipo_frota, cte, data_carregamento } = req.body;
    if (!placa || !origem || !destino) return res.status(400).json({ error: "Placa, origem e destino obrigatorios" });

    const { rows } = await db.query("SELECT id FROM vehicles WHERE plate = $1", [placa]);
    const vehicleId = rows.length > 0 ? rows[0].id : null;

    // Geocodifica origem e destino
    const geoOrigem = await geocodificar(origem);
    const geoDestino = await geocodificar(destino);

    // Conclui viagem anterior da mesma placa se existir
    await db.query("UPDATE viagens SET status = 'concluida', concluido_em = NOW() WHERE placa = $1 AND status = 'ativa'", [placa]);

    const result = await db.query(
      "INSERT INTO viagens (vehicle_id, placa, motorista, origem, destino, origem_excel, cliente, status_carga, tipo_frota, status, lat_origem, lng_origem, lat_destino, lng_destino, data_carregamento, criado_em) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ativa',$10,$11,$12,$13,$14,NOW()) RETURNING id",
      [vehicleId, placa, motorista||null, origem, destino, origem, cliente||null, status_carga||'Em Trânsito', tipo_frota||'RODOTREM', geoOrigem?.lat||null, geoOrigem?.lng||null, geoDestino?.lat||null, geoDestino?.lng||null, data_carregamento||null]
    );

    res.json({ ok: true, id: result.rows[0].id });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/upload", async (req, res) => {
  try {
    const viagens = req.body;
    if (!Array.isArray(viagens)) return res.status(400).json({ error: "Envie um array" });
    let importadas = 0;
    let erros = [];
    await db.query("UPDATE viagens SET status='cancelada' WHERE status='ativa'");

    for (const v of viagens) {
      try {
        const placa = (v.Placa || v.placa || '').toString().trim().toUpperCase();
        if (!placa) continue;
        const motorista = v.Motorista || v.motorista || '';
        const status = v.Status || v.status || '';
        const destino = v.Destino || v.destino || '';
        const cliente = v.Cliente || v.cliente || '';
        const regiao = v['Regiao'] || v['Região'] || v.regiao || '';
        const origemExcel = v['Origem'] || v['origem'] || '';
        const grupo = v.Grupo || v.grupo || '';
        const tipoFrota = v['Tipo Frota'] || v.tipo_frota || '';
        const ref = v['Ref.'] || v.ref || '';

        const { rows } = await db.query("SELECT id FROM vehicles WHERE plate=$1 LIMIT 1", [placa]);
        const vehicleId = rows.length > 0 ? rows[0].id : null;

        // Geocodifica com delay
        let latOrigem=null, lngOrigem=null, latDestino=null, lngDestino=null, kmTotal=0;
        if (regiao && regiao.length > 2) {
          const geo = await geocodificar(regiao);
          if (geo) { latOrigem=geo.lat; lngOrigem=geo.lng; }
          await new Promise(r => setTimeout(r, 1100));
        }
        if (destino && destino.length > 2) {
          const geo = await geocodificar(destino);
          if (geo) {
            latDestino=geo.lat; lngDestino=geo.lng;
            if (latOrigem && lngOrigem)
              kmTotal = Math.round(distanciaKm(latOrigem, lngOrigem, latDestino, lngDestino) * 1.3);
          }
          await new Promise(r => setTimeout(r, 1100));
        }

        // $1  $2     $3        $4      $5       $6       $7            $8     $9       $10         $11      $12           $13        $14        $15       $16
        await db.query(`
          INSERT INTO viagens
            (vehicle_id, placa, motorista, origem, destino, cliente, status_carga, grupo, ref_data, tipo_frota, km_total, km_total_calculado, lat_origem, lng_origem, lat_destino, lng_destino, origem_excel)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12,$13,$14,$15,$16)
        `, [vehicleId, placa, motorista, regiao, destino, cliente, status, grupo, ref, tipoFrota, kmTotal, latOrigem, lngOrigem, latDestino, lngDestino, origemExcel]);

        importadas++;
        console.log("[IMPORT]", placa, tipoFrota, destino);
      } catch (e) {
        const placa = (v.Placa || v.placa || '?').toString();
        erros.push(placa + ": " + e.message);
        console.error("[IMPORT] Erro", placa, e.message);
      }
    }
    res.json({ importadas, erros });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/concluir", async (req, res) => {
  try {
    await db.query("UPDATE viagens SET status='concluida', concluido_em=NOW() WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/:id/km", async (req, res) => {
  try {
    const { km } = req.body;
    await db.query("UPDATE viagens SET km_percorrido=$1 WHERE id=$2", [km, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;