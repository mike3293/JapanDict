# JapanDict

A Japanese kanji learning application powered by Azure AI. Send any Japanese text directly from other apps via the share menu, get AI-powered explanations and breakdowns, and build a personal searchable dictionary of every kanji you've ever looked up.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Project Structure](#project-structure)
- [Backend (.NET)](#backend-net)
- [Mobile App (React Native)](#mobile-app-react-native)
- [Infrastructure (Pulumi + Azure)](#infrastructure-pulumi--azure)
- [Authentication](#authentication)
- [CI/CD (GitHub Actions)](#cicd-github-actions)
- [Getting Started](#getting-started)
- [Environment Variables & Secrets](#environment-variables--secrets)
- [Roadmap](#roadmap)

---

## Overview

JapanDict is built around a simple workflow:

1. You encounter Japanese text anywhere on your phone.
2. You share it to JapanDict (or paste it manually into the chat).
3. The app sends it to a .NET backend, which queries an Azure AI model for a full kanji/vocabulary breakdown, readings, meanings, and example sentences.
4. The result is displayed as a chat message and saved to your personal history.
5. A built-in dictionary tab lets you search everything you have ever looked up, powered by your Cosmos DB history.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Native App                         │
│  ┌───────────────────────────┐  ┌──────────────────────────┐ │
│  │  AI Chat (primary)        │  │  Kanji Encyclopedia       │ │
│  │  • Multi-turn conversation│  │  • All kanji ever seen    │ │
│  │  • Streaming responses    │  │  • Reading, meaning, JLPT │ │
│  │  • Share intent auto-send │  │  • Tap to re-query AI     │ │
│  └────────────┬──────────────┘  └─────────────┬────────────┘ │
└───────────────┼─────────────────────────────── ┼─────────────┘
          │  HTTPS + API Key│                   │
          ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                  .NET Backend (Azure App Service)            │
│                                                             │
│  ┌──────────────────┐    ┌──────────────────────────────┐  │
│  │  Auth Middleware │    │  Chat Controller             │  │
│  │  (API Key table) │    │  - /chat/sessions            │  │
│  └──────────────────┘    │  - /chat/sessions/{id}/msgs  │  │
│                          └──────────────┬───────────────┘  │
│  ┌──────────────────┐                   │                   │
│  │  Kanji Controller│    ┌──────────────▼───────────────┐  │
│  │  - /kanji        │    │  Azure AI Service (OpenAI)   │  │
│  │  - /kanji/search │    │  GPT-4o · streaming SSE      │  │
│  └──────────────────┘    └──────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Azure Cosmos DB (Free Tier)             │   │
│  │  Collections:                                        │   │
│  │   • access_keys   { key, isActive, label }           │   │
│  │   • chat_sessions { keyId, messages[] }              │   │
│  │   • kanji_index   { keyId, character, readings }     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────▼──────────────────┐
         │     Azure Infrastructure (Pulumi)   │
         │  - Resource Group                   │
         │  - App Service Plan (Free/B1)        │
         │  - App Service (Backend)             │
         │  - Cosmos DB Account (Free Tier)     │
         │  - Azure AI / OpenAI Service         │
         └────────────────────────────────────┘
```

---

## Features

### Mobile App
- **AI Agent Chat** — a standard multi-turn chat UI (think ChatGPT): conversation bubbles, streaming responses, and persistent session history. The AI acts as a Japanese language tutor — you send any text and it explains kanji, grammar, readings, and usage in context.
- **Share Intent** — share text from any app (browser, e-reader, messaging) directly into JapanDict. The shared text is dropped into the chat input and auto-submitted, just like typing it yourself.
- **Kanji Encyclopedia tab** — a secondary screen that aggregates every unique kanji encountered across all your chat sessions. Each entry shows character, on/kun readings, meanings, JLPT level (if known), and a count of how many times it appeared in your searches. Tap any entry to open a new chat pre-loaded with that kanji for deeper exploration.
- **Session History** — previous chat sessions are listed chronologically so you can resume or review any past conversation.

### Backend
- **AI Integration** — proxies requests to Azure OpenAI with a structured system prompt tailored for kanji/vocabulary analysis.
- **Access Key Auth** — every request must include a valid API key (`X-Api-Key` header). Keys are stored in Cosmos DB with an `isActive` flag managed manually by the administrator.
- **Per-Key History** — all chat messages and dictionary entries are scoped to an access key, keeping data isolated per user/device.
- **REST API** — clean versioned REST endpoints consumed by the mobile app.

---

## Project Structure

```
JapanDict/
├── backend/
│   └── JapanDict.Api/           # .NET Web API
│       ├── ...
├── mobile/
│   └── JapanDictApp/            # React Native (Expo or bare)
│       ├── ...
├── infrastructure/
│   ├── index.ts                 # Pulumi program (TypeScript)
│   ├── package.json
│   └── Pulumi.prod.yaml
└── .github/
    └── workflows/
        └── push.yml             # CI/CD pipeline
```

---

## Backend (.NET)

**Stack:** ASP.NET Core 10 · MongoDB Driver (Cosmos DB Mongo API) · Azure.AI.OpenAI SDK

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat/sessions` | Start a new chat session |
| `POST` | `/api/chat/sessions/{id}/messages` | Send a message in a session (returns streaming SSE) |
| `GET` | `/api/chat/sessions` | List all sessions for the current key |
| `GET` | `/api/chat/sessions/{id}` | Get full message thread for a session |
| `GET` | `/api/kanji` | List all kanji encountered by the current key |
| `GET` | `/api/kanji/search?q=` | Search kanji by character, reading, or meaning |

### Auth Flow

Every request must include the header:
```
X-Api-Key: <your-access-key>
```

The `ApiKeyMiddleware` looks up the key in the `access_keys` Cosmos DB collection. If it does not exist or `isActive` is `false`, the request is rejected with `401 Unauthorized`.

Access keys are **created manually** by the administrator directly in Cosmos DB (or via a seeding script). There is no self-registration endpoint.

### Cosmos DB Collections

**`access_keys`**
```json
{
  "_id": "key_abc123",
  "label": "My iPhone",
  "isActive": true,
  "createdAt": "2026-02-22T00:00:00Z"
}
```

**`chat_sessions`**
```json
{
  "_id": "session_xyz",
  "keyId": "key_abc123",
  "createdAt": "2026-02-22T10:00:00Z",
  "messages": [
    { "role": "user",      "content": "東京に行きたい",  "timestamp": "..." },
    { "role": "assistant", "content": "東 (ひがし/とう)...", "timestamp": "..." }
  ]
}
```

**`kanji_index`**
```json
{
  "_id": "...",
  "keyId": "key_abc123",
  "character": "東",
  "readings": ["ひがし", "とう"],
  "meanings": ["east"],
  "jlptLevel": "N5",
  "occurrenceCount": 7,
  "firstSeenAt": "2026-02-22T10:00:00Z"
}
```

---

## Mobile App (React Native)

**Stack:** React Native · TypeScript · Expo (recommended) · `expo-share-intent` or `react-native-receive-sharing-intent`

### Chat UX

The primary screen is a full AI agent chat interface:

- **Multi-turn conversations** — each session maintains a message thread sent to the backend, which forwards the full history to Azure OpenAI so the model has context across turns.
- **Streaming** — responses are streamed token-by-token over SSE/chunked HTTP so the user sees text appearing in real time, identical to ChatGPT.
- **Input modes** — free-type, paste, or receive via share intent. A toolbar button lets the user start a new session while keeping the old one in history.
- **Session persistence** — sessions are stored in Cosmos DB and loaded on demand from the Session History screen.

### Kanji Encyclopedia

A dedicated tab aggregates every unique kanji the AI has mentioned or explained across all chat sessions for the current access key:

- Populated automatically by the backend whenever an AI response is saved — a lightweight extraction pass identifies CJK characters and upserts them into the `kanji_index` collection.
- Displays: character, primary reading(s), meaning(s), JLPT level, first-seen date, and occurrence count.
- Tapping a kanji opens the chat screen pre-filled with a prompt like _「東」について教えてください_ for instant deeper exploration.
- Supports full-text search and filter by JLPT level (N5–N1 + unknown).

### Share Intent

When another app shares text to JapanDict, the app catches the incoming intent, drops the text into the current chat session, and auto-submits it:

- **Android** — intent filter for `ACTION_SEND` with `text/plain` MIME type in `AndroidManifest.xml`.
- **iOS** — Share Extension targeting `public.plain-text` UTType in `Info.plist`.

### API Key Storage

The access key is stored in the device's secure storage (`expo-secure-store` or `react-native-keychain`) and attached to every request as the `X-Api-Key` header.

---

## Infrastructure (Pulumi + Azure)

**Stack:** Pulumi TypeScript · `@pulumi/azure-native`

### Resources Provisioned

| Resource | Details |
|----------|---------|
| Resource Group | `japandict-rg` |
| Azure Cosmos DB Account | Mongo API, Free Tier enabled |
| Cosmos DB Database | `japandict-db` |
| Cosmos DB Collections | `access_keys`, `chat_sessions`, `kanji_index` |
| Azure OpenAI Service | `S0` tier, GPT-4o deployment |
| App Service Plan | Linux, `F1` Free (or `B1` Basic) |
| App Service | Backend Docker container |

### Deployment

```bash
cd infrastructure
yarn install
pulumi stack select prod
pulumi up
```

---

## CI/CD (GitHub Actions)

The pipeline (`.github/workflows/push.yml`) triggers on every push to `main` and runs two jobs:

### 1. `build-backend`
- Detects changes under `backend/`.
- Builds and pushes the Docker image to Docker Hub:
  `docker.io/username/japandict-api:<git-sha>` and `:latest`.

### 2. `deploy`
- Depends on `build-backend`.
- Logs in to Azure via service principal.
- Runs `pulumi up --yes --stack prod` to create/update all Azure resources.
- Passes the new image tag to Pulumi via environment variables so the App Service is updated in-place.

> **Note:** The React Native mobile app is **not** built in CI at this stage. It will be added in a future iteration.

### Required Secrets & Variables

| Name | Type | Description |
|------|------|-------------|
| `DOCKER_USERNAME` | Secret | Docker Hub username |
| `DOCKER_PASSWORD` | Secret | Docker Hub password / token |
| `PULUMI_ACCESS_TOKEN` | Secret | Pulumi Cloud token |
| `AZURE_CLIENT_ID` | Secret | Service principal client ID |
| `AZURE_CLIENT_SECRET` | Secret | Service principal client secret |
| `AZURE_TENANT_ID` | Secret | Azure tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Secret | Azure subscription ID |
| `AZURE_OPENAI_ENDPOINT` | Secret | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_KEY` | Secret | Azure OpenAI API key |

---

## Getting Started

### Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/) + Yarn
- [Docker](https://www.docker.com/)
- [Pulumi CLI](https://www.pulumi.com/docs/install/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (for mobile)

### Local Backend

```bash
cd backend/JapanDict.Api
# Copy and fill in local settings
cp appsettings.json appsettings.Development.json
dotnet run
# API available at https://localhost:5001
```

### Local Infrastructure (preview only)

```bash
cd infrastructure
yarn install
pulumi preview --stack prod
```

### Mobile App

```bash
cd mobile/JapanDictApp
yarn install
npx expo start
```

---

## Environment Variables & Secrets

### Backend (`appsettings.json` / environment)

```json
{
  "CosmosDb": {
    "ConnectionString": "<cosmos-mongo-connection-string>",
    "DatabaseName": "japandict-db"
  },
  "AzureOpenAI": {
    "Endpoint": "https://<resource>.openai.azure.com/",
    "ApiKey": "<key>",
    "DeploymentName": "gpt-4o"
  }
}
```

---

## Roadmap

- [x] Project design & README
- [x] .NET backend scaffold (API key auth, multi-turn chat sessions, streaming SSE, kanji extraction)
- [x] Pulumi infrastructure (Cosmos DB, Azure OpenAI, App Service)
- [x] GitHub Actions CI/CD (backend Docker build + Pulumi deploy)
- [x] React Native app — AI agent chat screen (multi-turn, streaming)
- [x] React Native app — Kanji Encyclopedia tab
- [x] React Native app — Session History screen
- [x] Share intent integration (Android + iOS)
- [ ] Offline kanji cache on device
- [ ] CI/CD for mobile app (EAS Build)
