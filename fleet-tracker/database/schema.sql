-- ============================================================
-- Fleet Tracker — Schema PostgreSQL
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Caminhões / veículos da frota
CREATE TABLE vehicles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plate         VARCHAR(10) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  omnilink_id   VARCHAR(100) NOT NULL UNIQUE,  -- ID do veículo na Omnilink
  speed_limit   INTEGER NOT NULL DEFAULT 80,   -- km/h
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rotas cadastradas
CREATE TABLE routes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(200) NOT NULL,
  description   TEXT,
  waypoints     JSONB NOT NULL,               -- Array de {lat, lng}
  tolerance_m   INTEGER NOT NULL DEFAULT 500, -- Tolerância em metros
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vinculação veículo ↔ rota (qual caminhão deve seguir qual rota)
CREATE TABLE vehicle_routes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  route_id      UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  active        BOOLEAN NOT NULL DEFAULT TRUE
);

-- Histórico de posições (recebidas da Omnilink)
CREATE TABLE positions (
  id            BIGSERIAL PRIMARY KEY,
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  speed         INTEGER NOT NULL DEFAULT 0,   -- km/h
  heading       INTEGER NOT NULL DEFAULT 0,   -- graus
  recorded_at   TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para buscas por veículo e data
CREATE INDEX idx_positions_vehicle_time ON positions(vehicle_id, recorded_at DESC);

-- Alertas gerados pelo sistema
CREATE TABLE alerts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vehicle_id    UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  type          VARCHAR(30) NOT NULL CHECK (type IN ('speed', 'deviation', 'offline')),
  message       TEXT NOT NULL,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  speed         INTEGER,                      -- km/h no momento do alerta
  acknowledged  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alerts_vehicle ON alerts(vehicle_id, created_at DESC);
CREATE INDEX idx_alerts_unacknowledged ON alerts(acknowledged) WHERE acknowledged = FALSE;

-- Última posição conhecida de cada veículo (view materializada para o mapa)
CREATE VIEW vehicle_last_position AS
  SELECT DISTINCT ON (v.id)
    v.id           AS vehicle_id,
    v.plate,
    v.name,
    v.omnilink_id,
    v.speed_limit,
    p.lat,
    p.lng,
    p.speed,
    p.heading,
    p.recorded_at,
    r.id           AS route_id,
    r.name         AS route_name,
    r.waypoints    AS route_waypoints,
    r.tolerance_m
  FROM vehicles v
  LEFT JOIN positions p ON p.vehicle_id = v.id
  LEFT JOIN vehicle_routes vr ON vr.vehicle_id = v.id AND vr.active = TRUE
  LEFT JOIN routes r ON r.id = vr.route_id
  WHERE v.active = TRUE
  ORDER BY v.id, p.recorded_at DESC;
