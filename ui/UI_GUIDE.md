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
- Page-level scrolling is locked only while the in-game Pixi surface is mounted (`ui/components/pixi.tsx`), so pre-start lobby/settings on `/:gameId` keep normal page scroll while active gameplay keeps wheel/touch gestures scoped to the game surface and HUD.

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
- Base dice faces now use flat SVG assets under `ui/assets/runtime/shared/dice` (`dice-1.svg` through `dice-6.svg`), and both in-game dice sprites resolve through that shared d6 set.
- Player-list-specific Colonist-style assets now live under `ui/assets/runtime/shared/player-list` (`card-resource-back.svg`, `card-devcard-back.svg`, `icon-longest-road*.svg`, `icon-largest-army*.svg`, `ribbon-small.svg`) and are wired via `ui/src/assets.ts` for the in-game player panel.
- Colonist-inspired HUD reference icons used by the configurable trade/bottom-HUD styling live under `ui/assets/runtime/shared/ui-kit`, including the live-trade `icon-hourglass.svg` and `icon-pencil.svg` controls.
- Top-left control icons now use Colonist-style SVG runtime assets for fullscreen (`ui/assets/runtime/shared/buttons/icon-fullscreen-expand.svg`) and settings (`ui/assets/runtime/shared/ui/icon-settings.svg`); pause/resume and mute/unmute are exposed in the settings menu options.
- Profile avatar assets live under `ui/assets/runtime/shared/profile-icons`; editable source art can live under the mirrored `ui/assets/source/shared/profile-icons`. In-game player panel avatars currently use the shared `player-overview.svg` glyph with per-player colored circular backgrounds.
- Ports live under `ui/assets/source/base/ports` and `ui/assets/runtime/base/ports`; the active base port art now uses SVG sign files mapped by `ui/src/assets.ts` as `1=wood`, `2=brick`, `3=wool`, `4=wheat`, `5=ore`, and `6=any`, plus `pier.svg` as the dock connector rendered behind each sign.
- Seafarers runtime textures are currently limited to the files still referenced by the app, such as `beach.png`, `island-l.png`, and `island-r.png`; the base ocean background is now config-driven from `ui/src/uiConfig/sections/canvas.ts` (`canvas.backgroundColor`) instead of a `sea.jpg` asset.
- `ui/src/assets.ts` declares tile render modes and a reference illustrated tile size so imported tile art can be normalized by asset dimensions, while `ui/src/board.ts` applies the final snug spacing and scale adjustments.

## UI Configuration

- Shared canvas size, HUD geometry, top-left control placement, and Pixi window chrome now live under `ui/src/uiConfig/`.
- `ui/src/uiConfig/index.ts` is the public entrypoint; section defaults live in `ui/src/uiConfig/sections/*`, selectors live in `ui/src/uiConfig/selectors/*`, and preset/runtime composition lives in `ui/src/uiConfig/presets.ts` plus `ui/src/uiConfig/runtime.ts`.
- `ui/src/hud/layoutEngine.ts` is now the authoritative HUD geometry engine. It computes named frames for Pixi widgets and DOM overlays from the resolved UI config plus viewport/runtime context.
- `ui/src/hud/widgetRegistry.ts` documents the current HUD widget inventory and intended region ownership; keep new HUD elements registered there so the layout surface stays discoverable.
- `ui/src/hudRelayout.ts` now performs a single HUD layout pass on resize/runtime refresh, then distributes the computed frames to modules like `chat`, `gameLog`, `resourceBank`, `buttons`, `hand`, `dice`, and `state`.
- `ui/src/gameStatus.ts` renders the live game-phase panel and consumes a dedicated `gameStatus` frame from the shared HUD layout result.
- `ui/src/hudLayout.ts` remains as a compatibility helper layer for modules that still consume legacy `compute*Position` helpers, but it now delegates to the shared layout engine instead of owning a separate preset.
- The in-game player panel stat cluster (resource/dev cards, longest road, largest army) in `ui/src/state.ts` is now width-aware and derives horizontal offsets/icon sizes from the resolved player-panel width, so compact/mobile presets keep the row contents inside bounds.
- Player panel sizing/scaling, hand height, action-bar button geometry, trade/editor windows, setup-choice overlays, settings details, game-over layout, shared yes/no dialogs, tooltips, and error modals all resolve through `ui/src/uiConfig/` selectors now.
- Trade editor controls now use a dedicated 3-button action rail in `ui/src/trade.ts`: top submits a bank trade, middle submits a co-player trade offer, and bottom clears/cancels the current draft. The bank button is disabled unless the current draft satisfies bank-trade ratio/exchange validity.
- Trade editor lanes use semantic left markers: top lane has no marker, middle lane shows only a green down arrow, and bottom lane shows only a red up arrow.
- Trade editor lane surfaces and action rail use a light board-style treatment (pale lane fill + blue borders) configured through `ui/src/uiConfig/sections/trade.ts` (`surfaceFill`, `surfaceBorder`, `surfaceBorderWidth`, `railFill`, `actionRailWidth`).
- Live trade-offer cards in `ui/src/trade.ts` also use the same light board-style chrome as a single stacked card (top ask row, bottom give row, shared left markers, compact right-side actions) so in-flight offers match the editor language.
- Live trade-offer right-side actions are role-specific in `ui/src/trade.ts`: incoming offers to non-creator recipients show `edit + reject + accept`, outgoing offers created by the local player show per-player response status chips (`accepted`, `declined`, `pending`) plus `cancel`, and current-player counter-offer views show `reject`.
- Live trade-offer left markers are role-aware for clarity: outgoing offers show the group icon on the ask row, while incoming/third-party offers show the requester avatar there; the give row continues to show the current-player avatar. Hover tooltips on markers/actions explain transfer direction and button intent.
- `ui/src/uiConfig/` exposes named presets via `initializeUIConfig({ preset, overrides })` for `default`, `compact`, and `mobileLandscape`.
- Shared dock/panel primitives now live in `ui/src/uiDock.ts`; use those before introducing new custom Pixi chrome for the hand, trade rows, action dock, timer, dice, or right-rail panels.
- Main action-bar structure controls (settlement/city/road/ship) in `ui/src/buttons.ts` now resolve from player-color piece assets via `getButtonSprite(..., bgColor)` so local-player structure actions visually match the active player color.
- HUD surface/text theming should flow through `ui/src/uiConfig/sections/bottomDock.ts` plus `ui/src/uiDock.ts`; timer, dice borders, chat input, and chat popup now consume these shared dock tokens instead of local hardcoded colors.
- The default HUD chrome now uses a flatter neutral rail style (parchment + slate accents) configured in `ui/src/uiConfig/sections/bottomDock.ts`; prefer tuning those tokens before per-widget styling overrides when matching right-rail/bottom-strip references.
- When adjusting HUD spacing or panel sizes, prefer editing `ui/src/uiConfig/sections/*`, `ui/src/uiConfig/presets.ts`, or `ui/src/hud/layoutEngine.ts` first and only change module code when behavior or rendering needs to change.
- The default hand rail width is capped by `hud.bottomRail.handMaxWidth` (currently `760`) to keep more space available for nearby action clusters.
- Timer/dice/status placement is config-driven from `ui/src/uiConfig/sections/hud.ts` and currently anchors to the End Turn slot (`timerAboveEndTurnGap`, `diceAboveTimerGap`, `endTurnSlotIndex`, `timerWidth`, `timerHeight`, `statusWidth`, `statusHeight`, `timerRightNudge`), with the status panel positioned to the timer's left.
- Dice interaction/animation flow is state-driven in `ui/src/dice.ts` (`idle`, `awaiting-roll`, `rolling`, `revealed`) so roll affordance and post-roll feedback stay centralized in one module.
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
