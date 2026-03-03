# Quick Start

This is the shortest path to run SAKURA locally.

## Prerequisites

- Docker and Docker Compose plugin
- Go (1.17+)
- Node.js (18+)
- npm

## 1. Clone and enter repo

```bash
git clone <your-fork-or-repo-url> sakura
cd sakura
```

## 2. Start MongoDB

Create a root `.env` file first (used by Docker Compose for Mongo init values):

```env
MONGO_USER=root
MONGO_PASSWORD=root
```

Then run:

```bash
docker compose up -d mongodb
```

## 3. Configure backend env

Create `/path/to/sakura/.env`:

```env
ENVIRONMENT=local
MONGO_URL=mongodb://root:root@localhost:27017/sakura?authSource=admin
HMAC_SECRET=replace-with-a-long-random-secret
FRONTEND_URL=http://localhost:3000
HOST=0.0.0.0
PORT=8090
SERVER_URL=http://localhost:8090
AWS_REGION=us-east-1
MONGO_USER=root
MONGO_PASSWORD=root
```

## 4. Configure frontend env

Create `/path/to/sakura/ui/.env.local`:

```env
MONGO_URL=mongodb://root:root@localhost:27017/sakura?authSource=admin
NEXTAUTH_SECRET=replace-with-a-second-long-random-secret
NEXT_PUBLIC_ENVIRONMENT=local
GOOGLE_ID=
GOOGLE_SECRET=
```

Notes:

- Google OAuth is optional for local play (anonymous auth works without it).
- Leave `GOOGLE_ID` and `GOOGLE_SECRET` empty unless you are testing Google sign-in.

## 5. Install frontend dependencies

```bash
cd ui
npm install
cd ..
```

## 6. Run backend

In terminal 1:

```bash
go run cmd/server/main.go
```

You should see logs including:

- `Connected to MongoDB!`
- `Starting the SAKURA backend on 0.0.0.0:8090`

## 7. Run frontend

In terminal 2:

```bash
cd ui
npm run dev
```

For LAN testing:

```bash
npm run dev -- -H 0.0.0.0 -p 3000
```

## 8. Open game

- App: `http://localhost:3000`
- Lobby: `http://localhost:3000/lobby`
- Profile picker: `http://localhost:3000/choose-profile`

The UI will:

1. Read active game servers from MongoDB via `ui/pages/api/servers.ts`
2. Ask you to choose one of the default local profiles if no profile is selected
3. Use anonymous auth token for that selected profile
4. Connect to backend websocket endpoint at `/socket`

## Current local UI simplifications

- Top navigation only shows: `Lobby`, `Map Editor`, `Profile`
- Lobby actions are intentionally simplified to:
  - `Join Game`
  - `Host Game`
- Spectate controls are removed from lobby UI

## Development Loop

- Backend changes: restart `go run cmd/server/main.go` (or use `nodemon` from root)
- Frontend changes: auto-reloaded by Next.js dev server

## Mobile and LAN Check

1. Find your host LAN IP:

```bash
hostname -I | awk '{print $1}'
```

2. Set backend `.env`:

```env
HOST=0.0.0.0
PORT=8090
SERVER_URL=http://<YOUR_LAN_IP>:8090
FRONTEND_URL=http://<YOUR_LAN_IP>:3000
```

3. Start backend and frontend, then open from phone on same Wi-Fi:

- `http://<YOUR_LAN_IP>:3000`

4. For the iPhone fullscreen-like install flow, open that URL in Safari and choose `Share -> Add to Home Screen`.

Notes:

- SAKURA includes a web app manifest and Apple standalone app metadata, so launching from the Home Screen removes normal Safari browser chrome.
- Safe-area insets are handled in the frontend so installed sessions respect the notch and home indicator.

Optional backend watcher:

```bash
nodemon --signal SIGINT -e go --exec "go run --race cmd/server/main.go"
```

## One-command Mode Scripts

From repo root:

```bash
./scripts/dev.sh
```

Starts MongoDB + backend (`go run`) + frontend (`next dev`) for development.

```bash
./scripts/prod.sh
```

Starts MongoDB + backend + production frontend (`next build` then `next start`).

Optional: skip UI rebuild when you already built it:

```bash
SKIP_BUILD=1 ./scripts/prod.sh
```

Optional: stop MongoDB on script exit too:

```bash
STOP_DB_ON_EXIT=1 ./scripts/dev.sh
STOP_DB_ON_EXIT=1 ./scripts/prod.sh
```

Notes:

- Press `Ctrl+C` stops backend + UI.
- By default MongoDB stays running in Docker; use `STOP_DB_ON_EXIT=1` to stop it too.
- MongoDB can be stopped separately with `docker compose down`.
