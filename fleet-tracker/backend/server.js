require("dotenv").config({ path: "./config/.env" });
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const http = require("http");
const cron = require("node-cron");
const vehiclesRouter = require("./src/routes/vehicles");
const routesRouter = require("./src/routes/routes");
const alertsRouter = require("./src/routes/alerts");
const { verificarSaidaOrigem } = require("./src/services/saida-origem");
const verticeRouter = require("./src/routes/vertice");
const rotasRouter = require("./src/routes/rotas");
const omnilinkKmRouter = require("./src/routes/omnilink-km");
const geocodeRouter = require("./src/routes/geocode");
const viagensRouter = require("./src/routes/viagens");
const dashboardRouter = require("./src/routes/dashboard");
const positionsRouter = require("./src/routes/positions");
const { syncOmnilink } = require("./src/services/omnilink");
const { checkAlerts } = require("./src/services/alerts");
const { broadcast, setWss } = require("./src/services/websocket");
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
setWss(wss);
app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());
app.use("/api/vehicles", vehiclesRouter);
app.use("/api/routes", routesRouter);
app.use("/api/alerts", alertsRouter);
app.use("/api/vertice", verticeRouter);
app.use("/api/rotas", rotasRouter);
app.use("/api/omnilink-km", omnilinkKmRouter);
app.use("/api/geo", geocodeRouter);
app.use("/api/viagens", viagensRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/positions", positionsRouter);
app.get("/health", (_, res) => res.json({ status: "ok" }));
wss.on("connection", (ws) => { ws.isAlive = true; ws.on("pong", () => { ws.isAlive = true; }); });
setInterval(() => { wss.clients.forEach((ws) => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }); }, 30000);
cron.schedule("*/15 * * * * *", async () => { try { const positions = await syncOmnilink(); const alerts = await checkAlerts(positions); broadcast({ type: "positions", data: positions }); if (alerts.length > 0) broadcast({ type: "alerts", data: alerts }); } catch (err) { console.error("[CRON] Erro:", err.message); } });
// Verifica saida da origem a cada 2 minutos
setInterval(verificarSaidaOrigem, 2 * 60 * 1000);
verificarSaidaOrigem();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log("Fleet Tracker rodando na porta " + PORT); });








