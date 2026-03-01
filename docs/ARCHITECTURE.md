# Architecture Overview

This document explains how SAKURA components communicate in local development.

## High-Level Components

- Backend (Go): game/session logic, JWT auth, websocket server
- Frontend (Next.js): UI, local API routes, auth/session integration
- Database (MongoDB): users, games, game states, maps, active servers

## Directory Map

- `cmd/server/main.go`: backend entrypoint
- `server/`: HTTP routes, websocket hub, JWT middleware
- `mango/`: MongoDB config and registry operations
- `game/`: game engine and rule logic
- `entities/`: domain models
- `ui/pages/`: Next.js pages + API routes
- `ui/hooks/`: auth + session orchestration hooks (`lobbySession`, `gameSession`)
- `ui/src/net/`: websocket transport lifecycle
- `ui/src/protocol/`: wire-message adaptation to domain events
- `ui/src/commands/`: outbound command builders
- `ui/src/store/`: Redux Toolkit slices + runtime handlers
- `ui/src/hud/layoutEngine.ts`: authoritative HUD frame builder for Pixi and DOM HUD elements
- `ui/src/hud/widgetRegistry.ts`: typed inventory of HUD widgets/regions
- `ui/src/hudLayout.ts`: compatibility wrapper layer for legacy HUD position helpers
- `ui/src/uiConfig/`: modular UI configuration system for canvas sizing, HUD geometry, presets, selectors, and shared window chrome
- `ui/src/gameStatus.ts`: game-phase status panel renderer (current turn/roll/action waiting cues)
- `ui/src/uiDock.ts`: shared bottom-dock drawing primitives used by hand/trade/action/timer/dice surfaces
- `ui/src/`: Pixi/runtime rendering modules
- `ui/utils/mango.ts`: Mongo access from Next.js API routes

## Runtime Flow

## 1. Backend startup

1. `cmd/server/main.go` calls `server.RunServer()`
2. Server initializes Mongo-backed registry
3. Server registers its own URL (`SERVER_URL`) into `servers` collection
4. Heartbeat updates run every 10 seconds
5. HTTP server starts on `HOST:PORT`

Key routes in `server/server.go`:

- `GET /heartbeat`
- `POST /games`
- `GET|POST /anon`
- `GET /verify`
- `POST /register`
- `GET /socket` (websocket upgrade)

## 2. Frontend startup

1. Next.js starts on port `3000`
2. UI pages call Next.js API routes (`/api/*`) for server and game discovery
3. If no profile is selected, user is redirected to `/choose-profile`
4. Browser gets/keeps profile-based anonymous token in local storage (`auth`)
5. UI creates/joins game and opens websocket connection

## 3. Server discovery pattern

The frontend does not hardcode backend server URLs. Instead it:

1. Calls `GET /api/servers` (`ui/pages/api/servers.ts`)
2. Route queries Mongo `servers` collection via `ui/utils/mango.ts`
3. Chooses one available server URL
4. Sends create/join requests to that backend URL

For local single-server dev, this is typically `http://localhost:8090`.

## 4. Auth model

### Backend JWT (game/backend auth)

- Issued by backend `/anon` for anonymous users
- Signed with `HMAC_SECRET`
- Verified in `server/jwt.go`
- Required on most backend routes (except `/anon`, `/heartbeat`)
- In this local profile flow, `/anon` uses selected username to attach fixed local profile IDs

### NextAuth JWT (OAuth/session)

- Used in Next.js auth route (`ui/pages/api/auth/[...nextauth].ts`)
- Signed with `NEXTAUTH_SECRET`
- Optional for local play if using anonymous auth only

## 5. Websocket model

Connection is created by session hooks:

- `ui/hooks/lobbySession.ts` (lobby lifecycle)
- `ui/hooks/gameSession.ts` (in-game lifecycle)

Both use transport in `ui/src/net/transport.ts` and protocol adaptation in `ui/src/protocol/adapter.ts`.

Socket URL format:

`ws(s)://<backend>/socket?id=<gameId>&token=<jwt>`

Backend `JWTMiddleware` supports reading token from query when upgrading websocket.

Messages are msgpack-encoded and parsed by `ui/src/sock.ts` types + adapter layer.
Game command `pg` toggles manual pause/resume (server-authoritative).
Trade create-offer messages can optionally include a trade mode hint (`trm`): `auto` (legacy behavior), `bank` (force bank validation/execution), or `player` (force co-player offer flow).

Inbound game messages are handled by `ui/src/store/gameRuntime.ts` (with Pixi rendering side-effects). `ui/src/ws.ts` is now a compatibility module for command hub/player context ownership.

## 6. Frontend state ownership

- Redux Toolkit store is configured in `ui/src/store/index.ts`.
- App root wires provider in `ui/pages/_app.tsx`.
- Lobby state: `ui/src/store/lobbySlice.ts` + `ui/src/store/connectionSlice.ts`.
- Game runtime state: `ui/src/store/gameSlice.ts`.

## 7. HUD layout ownership

- In-game HUD placement now has a single geometry source of truth in `ui/src/hud/layoutEngine.ts`.
- The layout engine builds named frames for the right rail, bottom rail, floating HUD widgets, and DOM overlays such as the chat input.
- `ui/src/hud/widgetRegistry.ts` keeps the active HUD widget list discoverable in one place even though rendering remains code-owned by each feature module.
- `ui/src/hudRelayout.ts` performs one shared relayout pass, computes a `HUDLayoutResult`, and pushes frames into the major HUD modules instead of letting each module recompute its own viewport math.
- `ui/src/hudLayout.ts` is still present for compatibility, but it now delegates to the layout engine rather than maintaining its own hardcoded preset.
- Layout defaults still come from `ui/src/uiConfig/`, which remains the first place to change shared UI geometry or chrome values.
- Right-side stack (`Game Log`, `Chat`, `Resource Bank`, `Players`) and bottom controls (`player hand`, `action/options`) now derive from the same shared frame computation.
- The action stack is now anchored off the End Turn slot: timer sits above End Turn, dice sits above timer, and a compact game-status panel sits to the left of the timer.
- Seafarers ship-action rail placement now sits to the left of the game-status panel so the lower-right cluster remains readable when extra ship controls are visible.
- Player panel scale thresholds, hand sizing, and action-bar button/count geometry continue to flow through `ui/src/uiConfig/sections/*` and selector helpers instead of being owned by individual Pixi modules.
- Shared Pixi window styling and fixed top-left controls (for example fullscreen/pause) also read from `ui/src/uiConfig/selectors/*`, so theme/layout adjustments do not require touching each HUD module.
- Trade editors, setup-selection overlays, settings details, game-over windows, shared dialogs, and tooltip/error window sizing now also source their layout from the same `ui/src/uiConfig/` runtime.
- `ui/src/uiConfig/runtime.ts` supports named presets (`default`, `compact`, `mobileLandscape`) via `initializeUIConfig({ preset, overrides })`, while `ui/src/uiConfig/selectors/*` provides the stable read API that feature modules import.
- Bottom-HUD chrome is no longer ad hoc per module: `ui/src/uiDock.ts` provides the shared dock rail/slot/side-rail primitives used by `hand`, `trade`, `buttons`, and `dice`.

## 8. Authoritative Timer Protocol

The turn timer is now server-authoritative.

### Wire fields

`entities.GameState` includes:

- `sq` (`StateSeq`): monotonically increasing game-state snapshot sequence id.
- `tp` (`TimerPhaseId`): monotonically increasing phase/version id.
- `te` (`TimerEndsAtMs`): server-calculated wall-clock end time in Unix milliseconds.
- `ts` (`ServerNowMs`): server wall-clock snapshot in Unix milliseconds for skew correction.

These are populated in:

- `game/state.go` (`GetGameState`)

and consumed in:

- `ui/src/timer/turnTimer.ts` (timer state machine + countdown computation)
- `ui/src/store/turnTimerRuntime.ts` (timer runtime state ownership + snapshot sync)
- `ui/src/buttons.ts` (HUD timer widget renderer)

### Server behavior

- Whenever the active timer is reset (new turn/dice phase/special build/action timeout), the server increments `TimerPhaseId`.
- The server continues sending per-player `TimeLeft` for compatibility, but HUD countdown is derived from `TimerEndsAtMs`.
- Engine tick processing is serialized in the watcher loop (no per-tick goroutine fan-out), which prevents goroutine buildup during lock contention or slow actions.
- Snapshot broadcasts are sequence-stamped; clients drop stale/out-of-order `gs` payloads using `StateSeq`.
- When `TickerPause` is active and the current player has no pending timed action, the server sets `TimerEndsAtMs = 0` so the HUD freezes.
- If `TickerPause` is active but the current player is in a pending timed action (for example robber placement), `TimerEndsAtMs` is still provided so the HUD countdown continues.
- When manual game pause is active (`GameState.Paused = true`), `TimerEndsAtMs` is always `0` until resumed.
- The game ticker now starts only after initialization succeeds (or after journal replay setup), so failed initialization does not leave background ticker goroutines running.

Timer phase bumps happen through helper methods in:

- `game/comm.go`:
  - `bumpTimerPhase`
  - `setPlayerTimeLeft`
  - `setCurrentPlayerTimeLeft`

### Client behavior

- Timer state transitions are centralized in `ui/src/timer/turnTimer.ts`.
- Timer runtime ownership (latest snapshot + mutable timer state across ticks) lives in `ui/src/store/turnTimerRuntime.ts`.
- `ui/src/buttons.ts` only renders the computed output (`displaySeconds`, mode).
- If `TimerPhaseId` changes: client adopts the new `TimerEndsAtMs`.
- If `TimerPhaseId` is unchanged: client only accepts a lower `TimerEndsAtMs` (tightening), which prevents visual timer restarts from stale/out-of-order snapshots.
- If `StateSeq` is present: client ignores snapshots with `StateSeq <= lastAppliedStateSeq`.
- Client estimates server time with `estimatedServerNow = clientNow + (ts - clientNowAtReceipt)`.
- Display value is computed as `ceil((TimerEndsAtMs - estimatedServerNow) / 1000)` and clamped at `0`.
- Server offset is only recalculated when `ServerNowMs` changes, preventing countdown freezes from repeated snapshots.
- Compatibility fallback mode is used only when timer metadata is absent; this keeps older payloads functional.

## Game Modes and Maps

- Supported game modes:
  - `1` = Base
  - `2` = Cities and Knights
  - `3` = Seafarers
- Built-in official maps are resolved in `maps/main.go`.
- At runtime, map resolution order is:
  1. DB map (`store.GetMap(name)`)
  2. Built-in map fallback (`maps.GetMapByName(name)`)
  3. Fallback to `Base`

## Data Model (MongoDB collections)

Created/used through `mango/creator.go`, `mango/registry.go`, and `ui/utils/mango.ts`:

- `servers`: active backend servers + heartbeat timestamps
- `users`: player identities and profile-ish metadata
- `games`: game metadata and discovery data
- `game_states`: serialized game state snapshots
- `maps`: saved/custom maps

## Local Port Defaults

- Frontend: `3000`
- Backend: `8090`
- MongoDB: `27017`

## Local Customizations In This Repo

- Default local profiles: `Jethro7194`, `KopsTiKlapsa`, `staxtoPUTA`, `Giorgaros`
- Forced color mapping for those usernames:
  - `Jethro7194 -> blue`
  - `KopsTiKlapsa -> orange`
  - `staxtoPUTA -> white`
  - `Giorgaros -> red`
- Lobby UI is simplified to join/host flow (spectate removed from lobby controls)

## Production-ish Notes

- `deploy/` contains nginx snippets used by production infrastructure.
- Root and UI Dockerfiles build backend/frontend images for deployment.
- `docker-compose.yml` in root is only MongoDB by default (not full app stack).
