# 🚛 Fleet Tracker — Monitoramento de Frota Omnilink

Sistema de rastreamento de caminhões em tempo real integrado com a **API REST da Omnilink**. Inclui mapa ao vivo, cadastro de rotas, alertas de velocidade e desvio de rota.

---

## 📁 Estrutura do Projeto

```
fleet-tracker/
├── backend/                  # Servidor Node.js (deploy no Railway)
│   ├── src/
│   │   ├── routes/           # Rotas da API REST
│   │   ├── controllers/      # Lógica dos endpoints
│   │   ├── services/         # Integração Omnilink, alertas
│   │   ├── middlewares/      # Auth, rate limit, logs
│   │   └── models/           # Modelos do banco (Prisma)
│   ├── config/               # Variáveis de ambiente e configurações
│   ├── package.json
│   └── server.js
│
├── frontend/                 # Interface Web (deploy no GitHub Pages)
│   ├── pages/                # Páginas HTML
│   ├── css/                  # Estilos
│   ├── js/                   # Scripts (mapa, alertas, cadastro)
│   └── assets/               # Ícones, imagens
│
├── database/
│   └── schema.sql            # Schema inicial do PostgreSQL
│
├── .github/
│   └── workflows/
│       └── deploy.yml        # CI/CD automático para Railway
│
└── README.md
```

---

## 🚀 Stack Tecnológico

| Camada | Tecnologia | Hospedagem |
|--------|-----------|------------|
| Frontend | HTML + JavaScript + Leaflet.js | GitHub Pages |
| Backend | Node.js + Express | Railway |
| Banco de dados | PostgreSQL | Railway |
| Rastreamento | Omnilink REST API | — |
| CI/CD | GitHub Actions | — |

---

## ⚙️ Configuração

### 1. Clone o repositório
```bash
git clone https://github.com/SEU_USUARIO/fleet-tracker.git
cd fleet-tracker
```

### 2. Configure o backend
```bash
cd backend
cp config/.env.example config/.env
# Edite o .env com suas credenciais
npm install
npm run dev
```

### 3. Variáveis de ambiente necessárias
```env
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/fleetdb
OMNILINK_API_URL=https://app.omnilink.com.br/api
OMNILINK_TOKEN=seu_token_aqui
JWT_SECRET=sua_chave_secreta
ALERT_SPEED_LIMIT=80        # km/h padrão
ALERT_DEVIATION_METERS=500  # metros fora da rota
```

### 4. Configure o banco
```bash
psql $DATABASE_URL < database/schema.sql
```

---

## 🗺️ Funcionalidades

- **Mapa ao vivo** — posição de todos os caminhões em tempo real (atualiza a cada 15s)
- **Cadastro de rotas** — defina rotas com waypoints no mapa
- **Alerta de velocidade** — notificação quando caminhão ultrapassa limite configurado
- **Alerta de desvio** — notificação quando caminhão sai da rota cadastrada
- **Histórico** — relatório de trajetos e ocorrências por período

---

## 📡 Integração Omnilink

A integração usa a **API REST** do portal Gestor da Omnilink. É necessário solicitar as credenciais de acesso à Omnilink para sua conta.

O backend consulta a API a cada **15 segundos** e:
1. Salva as posições no banco
2. Verifica alertas de velocidade e desvio
3. Envia eventos em tempo real para o frontend via WebSocket

---

## 🛠️ Deploy

### Railway (Backend + Banco)
1. Crie um projeto no [Railway](https://railway.app)
2. Conecte ao repositório GitHub
3. Adicione um serviço PostgreSQL
4. Configure as variáveis de ambiente
5. O deploy acontece automaticamente a cada push na branch `main`

### GitHub Pages (Frontend)
1. Vá em **Settings → Pages**
2. Selecione a branch `main` e pasta `/frontend`
3. O site ficará disponível em `https://SEU_USUARIO.github.io/fleet-tracker`
