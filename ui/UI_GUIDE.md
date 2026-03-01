# UI (Next.js Frontend)

This folder contains the SAKURA frontend app.

## Prerequisites

- Node.js 18+
- npm
- `ui/.env.local` configured (see `../docs/ENVIRONMENT.md`)
- Backend + Mongo running for full-stack flows (see `../docs/QUICK_START.md`)

## Scripts

- `npm run assets:check`: validate canonical asset layout and the `public/assets` serving alias
- `npm run dev`: start Next.js dev server (`http://localhost:3000`)
- `npm run build`: production build
- `npm run start`: serve production build
- `npm run lint`: run ESLint
- `npm run test`: run frontend tests

## Local Workflow

1. From repo root, ensure backend + Mongo are running.
2. In this folder, run:

```bash
npm install
npm run dev
```

3. Open:
- `http://localhost:3000`
- `http://localhost:3000/lobby`
- `http://localhost:3000/choose-profile`
- `http://localhost:3000/design/swatches` (resource palette preview)

## PWA / iPhone Install

- The frontend ships a web app manifest at `ui/public/manifest.json` plus Apple mobile web app metadata in `ui/pages/_app.tsx`.
- For LAN testing on iPhone, run the Next dev server with `npm run dev -- -H 0.0.0.0 -p 3000`, then open `http://<YOUR_LAN_IP>:3000` in Safari.
- To launch without Safari chrome, use Safari's `Share -> Add to Home Screen`, then start SAKURA from the Home Screen.
- `viewport-fit=cover` and safe-area padding are enabled globally in `ui/styles/globals.css` so installed sessions can use the full screen without clipping behind the notch or home indicator.

## Asset Notes

- Canonical runtime assets live under `ui/assets/runtime`.
- `ui/public/assets` is a symlink to `ui/assets/runtime` so existing `/assets/...` URLs continue to work in Next.js.
- `ui/assets/source` mirrors runtime paths when editable source art exists; source files are optional, runtime files are required for anything the app uses.
- Run `npm run assets:check` after asset moves to verify the runtime tree, serving symlink, and code imports still match this convention.
- Base structure pieces (roads, settlements, cities) are sourced from SVG files under `ui/assets/source/base/pieces/*`.
- The runtime resolves those SVGs via URL-backed asset descriptors in `ui/src/assets.ts`, so structure art can stay vector without maintaining rasterized PNG copies.
- Ship pieces live under `ui/assets/source/seafarers/pieces/ship` and `ui/assets/runtime/seafarers/pieces/ship`.
- Board tile textures for `desert`, `wood`, `brick`, `wool`, `wheat`, `ore`, `gold`, `sea`, and `fog` live under `ui/assets/source/base/board/textures/` and `ui/assets/runtime/base/board/textures/`, and the app imports the runtime copies.
- Cities and Knights editable source currently lives under `ui/assets/source/cities-knights/city-improvements`, `ui/assets/source/cities-knights/pieces/knight`, and `ui/assets/source/cities-knights/pieces/merchant`.
- Base number tokens live only under `ui/assets/runtime/base/tokens/number-tokens`.
- Active base resource and development deck art now lives under `ui/assets/runtime/base/cards/decks` as SVG files for `wood`, `brick`, `wool`, `wheat`, `ore`, `knight`, `victory-point-card`, `road-building`, `year-of-plenty`, `monopoly`, and `development-card-back`.
- Active Cities and Knights commodity deck art now lives under `ui/assets/runtime/cities-knights/cards/decks` as SVG files for `commodity-paper`, `commodity-cloth`, and `commodity-coin`.
- Shared HUD icons live under `ui/assets/runtime/shared/icons`; `road.svg` and `knight.svg` are the normal longest-road and largest-army icons, while `road-highlight.svg` and `knight-highlight.svg` are their highlighted variants used by the player panel.
- Colonist-inspired HUD reference icons used by the configurable trade/bottom-HUD styling live under `ui/assets/runtime/shared/ui-kit`.
- Profile avatars live under `ui/assets/runtime/shared/profile-icons`; editable source art can live under the mirrored `ui/assets/source/shared/profile-icons`, and the active runtime set now uses square `webp` exports for consistent circular framing in the UI.
- Ports live under `ui/assets/source/base/ports` and `ui/assets/runtime/base/ports`; the active base port art now uses SVG sign files mapped by `ui/src/assets.ts` as `1=wood`, `2=brick`, `3=wool`, `4=wheat`, `5=ore`, and `6=any`, plus `pier.svg` as the dock connector rendered behind each sign.
- Seafarers runtime textures are currently limited to the files still referenced by the app, such as `beach.png`, `island-l.png`, and `island-r.png`, while the sea board image now lives under `ui/assets/runtime/base/board/sea.jpg`.
- `ui/src/assets.ts` declares tile render modes and a reference illustrated tile size so imported tile art can be normalized by asset dimensions, while `ui/src/board.ts` applies the final snug spacing and scale adjustments.

## UI Configuration

- Shared canvas size, HUD geometry, top-left control placement, and Pixi window chrome now live under `ui/src/uiConfig/`.
- `ui/src/uiConfig/index.ts` is the public entrypoint; section defaults live in `ui/src/uiConfig/sections/*`, selectors live in `ui/src/uiConfig/selectors/*`, and preset/runtime composition lives in `ui/src/uiConfig/presets.ts` plus `ui/src/uiConfig/runtime.ts`.
- `ui/src/hud/layoutEngine.ts` is now the authoritative HUD geometry engine. It computes named frames for Pixi widgets and DOM overlays from the resolved UI config plus viewport/runtime context.
- `ui/src/hud/widgetRegistry.ts` documents the current HUD widget inventory and intended region ownership; keep new HUD elements registered there so the layout surface stays discoverable.
- `ui/src/hudRelayout.ts` now performs a single HUD layout pass on resize/runtime refresh, then distributes the computed frames to modules like `chat`, `gameLog`, `resourceBank`, `buttons`, `hand`, `dice`, and `state`.
- `ui/src/gameStatus.ts` renders the live game-phase panel and consumes a dedicated `gameStatus` frame from the shared HUD layout result.
- `ui/src/hudLayout.ts` remains as a compatibility helper layer for modules that still consume legacy `compute*Position` helpers, but it now delegates to the shared layout engine instead of owning a separate preset.
- Player panel sizing/scaling, hand height, action-bar button geometry, trade/editor windows, setup-choice overlays, settings details, game-over layout, shared yes/no dialogs, tooltips, and error modals all resolve through `ui/src/uiConfig/` selectors now.
- `ui/src/uiConfig/` exposes named presets via `initializeUIConfig({ preset, overrides })` for `default`, `compact`, and `mobileLandscape`.
- Shared dock/panel primitives now live in `ui/src/uiDock.ts`; use those before introducing new custom Pixi chrome for the hand, trade rows, action dock, timer, dice, or right-rail panels.
- When adjusting HUD spacing or panel sizes, prefer editing `ui/src/uiConfig/sections/*`, `ui/src/uiConfig/presets.ts`, or `ui/src/hud/layoutEngine.ts` first and only change module code when behavior or rendering needs to change.
- The default hand rail width is capped by `hud.bottomRail.handMaxWidth` (currently `760`) to keep more space available for nearby action clusters.
- Timer/dice/status placement is config-driven from `ui/src/uiConfig/sections/hud.ts` and currently anchors to the End Turn slot (`timerAboveEndTurnGap`, `diceAboveTimerGap`, `endTurnSlotIndex`, `timerWidth`, `timerHeight`, `statusWidth`, `statusHeight`, `timerRightNudge`), with the status panel positioned to the timer's left.
- Seafarers ship-action rail placement is now aligned to the left of the status panel and can use the space above the hand rail when needed to avoid collisions with the compact timer/status cluster.
- The compact timer is now text-only (no mode badge/sub-label), and the dice render without the old dock tray background so the lower-right control cluster can stay tighter.
- HUD collision guards now keep Seafarers extra actions above the main action bar and keep dice frames left of the player panel.
- `ui/src/windows.ts` reads the shared window chrome config, so visual restyling of common panels can happen in one place.
- Put reusable styling primitives in `ui/src/uiConfig/tokens.ts`, semantic section defaults in `ui/src/uiConfig/sections/*`, and shared read accessors in `ui/src/uiConfig/selectors/*`.
- Feature modules should prefer selectors/helpers over deep object traversal so the config shape can evolve without widespread callsite churn.

## API Routes in This App

API routes live under `ui/pages/api/*` and include:
- `api/servers`
- `api/games/*`
- `api/maps/*`
- `api/auth/[...nextauth]`
- `api/users/*`

## Related Docs

- Root setup: `../docs/QUICK_START.md`
- Ubuntu setup: `../docs/LOCAL_SETUP_UBUNTU.md`
- Env vars: `../docs/ENVIRONMENT.md`
- Troubleshooting: `../docs/TROUBLESHOOTING.md`
- Asset layout/source art: `./assets/source`
- Canonical runtime assets: `./assets/runtime`
- Runtime serving alias: `./public/assets`
- Runtime asset registry: `./src/assets.ts`
