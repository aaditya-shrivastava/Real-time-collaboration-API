# ⚡ Real-time Collaboration API

A full-stack real-time collaborative document editing system — built with Node.js, Socket.IO, PostgreSQL, and Redis.

## ✨ Features

| Feature | Details |
|---|---|
| **Real-time sync** | WebSocket (Socket.IO) — edits broadcast instantly to all collaborators |
| **Document editing** | Operational Transformation (OT) — conflict-free concurrent edits |
| **Active user tracking** | Live presence via Redis — see who's editing with colored avatars |
| **Version history & rollback** | Every edit versioned in PostgreSQL — restore any previous state |
| **Auth** | JWT-based — HTTP + WebSocket both authenticated |

## 🗂 Tech Stack

```
Backend   →  Node.js · Express · Socket.IO
Database  →  PostgreSQL (documents, users, versions)
Cache     →  Redis (presence, pub/sub)
Auth      →  JWT (jsonwebtoken + bcryptjs)
Frontend  →  Vanilla HTML · CSS · JavaScript
DevOps    →  Docker · docker-compose
```

---

## 🚀 Quick Start (Docker — Recommended)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### Steps

```bash
# 1. Clone / unzip the project
cd realtime-collab-api

# 2. Start everything with one command
docker-compose up --build
```

That's it. Visit **http://localhost:4000** in your browser.

Docker spins up:
- PostgreSQL on port `5432`
- Redis on port `6379`
- Node.js backend on port `4000` (also serves the frontend)

---

## 🛠 Manual Setup (Without Docker)

### Prerequisites
- Node.js v18+
- PostgreSQL v14+ running locally
- Redis v6+ running locally

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

Edit `backend/.env`:

```env
PORT=4000
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASS@localhost:5432/collab_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret_key_here
JWT_EXPIRES_IN=7d
CLIENT_ORIGIN=http://localhost:4000
```

### 3. Create the database

```bash
# In psql
CREATE DATABASE collab_db;
```
The schema (tables) is created automatically on first run.

### 4. Start the server

```bash
cd backend
npm run dev
```

Visit **http://localhost:4000**

---

## 📡 API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/users/register` | Register new user |
| POST | `/api/users/login` | Login, returns JWT |
| GET | `/api/users/me` | Get current user (auth required) |

### Documents
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/documents` | List all my documents |
| POST | `/api/documents` | Create new document |
| GET | `/api/documents/:id` | Get document by ID |
| PUT | `/api/documents/:id` | Update title or content |
| DELETE | `/api/documents/:id` | Delete document |

### Versions
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/documents/:docId/versions` | Get version history |
| POST | `/api/documents/:docId/versions/rollback/:versionNumber` | Rollback to version |

### Health
```
GET /api/health  →  { status: "ok", timestamp: "..." }
```

---

## 🔌 WebSocket Events

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `doc:join` | `{ docId }` | Join a document room |
| `doc:operation` | `{ docId, operation, clientVersion }` | Send an OT operation |
| `cursor:update` | `{ docId, cursor }` | Broadcast cursor position |
| `doc:title` | `{ docId, title }` | Broadcast title change |
| `doc:leave` | `{ docId }` | Leave a document room |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `doc:init` | `{ content, version, activeUsers }` | Initial document state on join |
| `doc:operation` | `{ operation, version, userId }` | Remote operation to apply |
| `doc:ack` | `{ operation, version }` | Confirms your operation was accepted |
| `presence:joined` | `{ user, activeUsers }` | User joined the document |
| `presence:left` | `{ user, activeUsers }` | User left the document |
| `cursor:update` | `{ userId, username, cursor }` | Remote cursor moved |

---

## 🏗 Project Structure

```
realtime-collab-api/
├── backend/
│   ├── config/
│   │   ├── db.js            # PostgreSQL pool + schema init
│   │   └── redis.js         # Redis client
│   ├── socket/
│   │   └── socketHandler.js # Socket.IO events + OT engine
│   ├── src/
│   │   ├── controllers/     # Business logic
│   │   ├── middleware/       # Auth (HTTP + WS), error handler
│   │   ├── models/          # DB queries (users, documents, versions)
│   │   ├── routes/          # Express route definitions
│   │   ├── services/        # OT, presence, version services
│   │   └── server.js        # Entry point
│   ├── .env
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── css/
│   │   ├── main.css         # Global styles + design tokens
│   │   └── editor.css       # Editor layout + components
│   ├── js/
│   │   ├── app.js           # Auth + dashboard logic
│   │   ├── socket.js        # Socket.IO client wrapper
│   │   ├── presence.js      # Active user rendering
│   │   └── editor.js        # OT + real-time editor logic
│   └── pages/
│       ├── index.html       # Login / Register / Dashboard
│       └── editor.html      # Collaborative editor
├── docker-compose.yml
├── package.json
└── README.md
```

---

## 🧠 Architecture Notes (for interviews)

**Why Node.js for WebSockets?**
Node's event loop handles thousands of concurrent I/O connections without threading overhead — architecturally correct for WebSocket-heavy workloads.

**What is Operational Transformation (OT)?**
When two users edit simultaneously, their operations can conflict. OT transforms conflicting operations so they converge to the same document state regardless of arrival order.

**Why Redis for presence?**
Active user state is ephemeral and must be read/written on every cursor move. Redis in-memory store handles this at sub-millisecond latency and supports pub/sub for multi-server scaling.

**Why debounce DB writes?**
Every keystroke would flood PostgreSQL. A 2-second debounce batches rapid edits into single DB writes while broadcasting live over WebSocket — best of both worlds.

---

## 🌐 Deployment.

Deployment is done on [Render](https://render.com)
Live Link:- [RealTimeCollabAPI](https://realtime-collab-api-0dni.onrender.com)
