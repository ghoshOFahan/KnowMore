# KnowMore — AI-Backed Semantic Profiling Platform

> **Live:** [knowmore.ahanghosh.site](https://knowmore.ahanghosh.site)

KnowMore is a cloud-native, real-time multiplayer platform that uses semantic word-chain gameplay to build deep user interest profiles. Unlike traditional games, every word you play is analyzed for its **semantic gravity** — its conceptual distance from your established interest anchors — to continuously calibrate a personal knowledge map.

The platform is deployed as a split-domain architecture: a Next.js frontend on Vercel and a fully containerized Node.js backend on Azure Container Apps, bridged by a custom BFF proxy layer.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js (App Router), TypeScript, Tailwind CSS v4, Framer Motion |
| **Backend** | Node.js, Express, Socket.io |
| **Database** | Azure Database for PostgreSQL, Drizzle ORM |
| **Cache & Queues** | Azure Cache for Redis, BullMQ |
| **AI / ML** | Gemini Embedding API (cosine similarity), Gemini LLM (commentary) |
| **Infrastructure** | Docker, Azure Container Apps, GitHub Actions |

---

## Architecture

### Split-Domain Deployment

```
Browser
  │
  ├─── knowmore.ahanghosh.site (Vercel)
  │         Next.js App + BFF Proxy Layer
  │                   │
  │                   └──► knowmore-backend.azurecontainerapps.io
  │                              Express + Socket.io
  │                                      │
  │                          ┌───────────┴───────────┐
  │                     PostgreSQL               Redis
  │                    (Azure Managed)        (Azure Managed)
  │
  └─── Socket.io (WebSocket)
            Direct persistent connection to Azure backend
```

### BFF Proxy Layer (Next.js)

The frontend doubles as a **Backend-For-Frontend reverse proxy** via Next.js API routes. All auth traffic is routed through `/api/auth/*` on the frontend domain before being forwarded to Azure.

This solves a fundamental cross-domain OAuth problem: browsers enforce `SameSite` cookie policies that block third-party cookies across different domains. Without the proxy, the `state` cookie set by Better-Auth before the Google OAuth redirect gets dropped, causing a `state_mismatch` security failure on return.

The proxy ensures:
- Session cookies are treated as **first-party** throughout the OAuth flow
- The Azure backend URL is never exposed directly to the browser
- CORS configuration on the backend remains strict and clean

### Async Job Pipeline

Heavy AI workloads are fully decoupled from the live game loop:

```
Game ends
    │
    └──► BullMQ Job queued in Redis
                │
                └──► Worker picks up job
                          │
                          ├── Gemini Embedding API
                          │   vectorizes word chain
                          │
                          └── Cosine similarity computed
                              against user's topic anchors
                                        │
                                        └──► topicAnchors scores
                                             updated in PostgreSQL
```

This ensures real-time gameplay remains sub-100ms responsive while complex profile calibration runs in the background.

### Database Schema (Drizzle ORM)

```
users & sessions     ──── Better-Auth managed auth tables
topicAnchors         ──── userId + topicId + currentScore (vector similarity)
topics               ──── name + 768-dimensional pgvector embedding
games                ──── roomId + wordChain[] + winnerId + playedAt
gamePlayers          ──── gameId + userId + rank + wordsContributed
```

---

## Key Features

**Semantic Word-Chain Engine**
Word validity is determined by AI-powered embedding analysis rather than dictionary lookups. Each word is evaluated for semantic coherence with the previous word using cosine similarity on Gemini-generated vector embeddings.

**Real-Time Multiplayer**
Socket.io-powered game rooms with dynamic creation, live lobby states, turn management, and robust session recovery on page refresh or reconnection via `clientId` persistence.

**AI Commentator**
A Gemini LLM generates post-game commentary — contextually aware, slightly snarky summaries of the word chain — without blocking the live game loop via async processing.

**Semantic Profile Calibration**
Players select 5 topic anchors during onboarding. Every game updates their profile scores based on how semantically close their played words were to each anchor, building a continuously evolving interest map.

**CI/CD Pipeline**
GitHub Actions builds Docker images on every push to `main`, tags them with the commit SHA, pushes to Docker Hub, and triggers a rolling deployment to Azure Container Apps — zero manual steps from commit to production.

---

## Local Development

**Prerequisites:** Node.js 20+, Docker, Redis

```bash
# Clone the repo
git clone https://github.com/aintlucifer/knowmore
cd knowmore

# Backend
cd backend
cp .env.example .env   # fill in your values
npm install
npm run dev

# Frontend
cd ../frontend
cp .env.example .env.local   # fill in your values
npm install
npm run dev
```

**Frontend env vars:**
```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
# Auth and API calls are handled automatically by the BFF proxy
```

**Backend env vars:**
```env
PORT=3001
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GEMINI_API_KEY=...
```

---

## Deployment

The production stack runs entirely on Azure + Vercel:

- **Frontend** — Vercel (auto-deploys on push to `main`)
- **Backend** — Azure Container Apps (deployed via GitHub Actions + Docker)
- **Database** — Azure Database for PostgreSQL (Flexible Server)
- **Cache** — Azure Cache for Redis

---

## Author

**Ahan Ghosh**
