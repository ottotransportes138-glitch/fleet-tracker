const soap = require("soap");
const db = require("../models/db");

const WSDL = "https://wstt.omnilink.com.br/iasws/iasws.asmx?wsdl";
const USER = process.env.OMNILINK_USER;
const PASS = process.env.OMNILINK_PASSWORD;

async function syncOmnilink() {
  const { rows: vehicles } = await db.query(
    "SELECT id, plate, name, omnilink_id, speed_limit FROM vehicles WHERE active = TRUE"
  );
  console.log("[OMNILINK] Veiculos:", vehicles.length);
  if (vehicles.length === 0) return [];

  const positions = [];
  const client = await soap.createClientAsync(WSDL);

  for (const vehicle of vehicles) {
    try {
      console.log("[OMNILINK] Buscando:", vehicle.plate, vehicle.omnilink_id);

      const result = await client.ObtemPosicaoAtualAsync({
        Usuario: USER,
        Senha: PASS,
        Serial: vehicle.omnilink_id
      });

      const xml = result[0]?.return || "";
      console.log("[OMNILINK] Resposta:", xml.substring(0, 400));

      const lat = parseFloat(xml.match(/<Latitude>(.*?)<\/Latitude>/)?.[1] || "0");
      const lng = parseFloat(xml.match(/<Longitude>(.*?)<\/Longitude>/)?.[1] || "0");
      const speed = parseInt(xml.match(/<VEL>(.*?)<\/VEL>/)?.[1] || "0");
      const heading = parseInt(xml.match(/<DIR>(.*?)<\/DIR>/)?.[1] || "0");
      const recordedAt = xml.match(/<DATA>(.*?)<\/DATA>/)?.[1]?.trim() || new Date().toISOString();

      console.log("[OMNILINK]", vehicle.plate, "lat:", lat, "lng:", lng, "vel:", speed);

      if (!lat || !lng) continue;

      await db.query(
        "INSERT INTO positions (vehicle_id, lat, lng, speed, heading, recorded_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [vehicle.id, lat, lng, speed, heading, new Date(recordedAt)]
      );

      positions.push({ vehicleId: vehicle.id, plate: vehicle.plate, name: vehicle.name, lat, lng, speed, heading, recordedAt });
      console.log("[OMNILINK] Posicao salva:", vehicle.plate, lat, lng);

    } catch (err) {
      console.error("[OMNILINK] Erro:", vehicle.plate, err.message);
    }
  }

  return positions;
}

module.exports = { syncOmnilink };
