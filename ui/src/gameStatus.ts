import * as PIXI from "pixi.js";
import * as canvas from "./canvas";
import type { GameState, PlayerAction } from "../tsg";
import type { HUDFrame } from "./hud/types";
import {
    createDockPanel,
    createPanelBodyTextStyle,
} from "./uiDock";
import { getHudMiscConfig } from "./uiConfig";
import { getThisPlayerOrder } from "./ws";

let container: PIXI.Container | null = null;
let statusText: PIXI.Text | null = null;
let lastGameState: GameState | null = null;
let pendingActionMessage = "";

function ensureUI() {
    if (!canvas.app) {
        return;
    }
    if (container && !container.destroyed) {
        return;
    }

    container = new PIXI.Container();
    container.zIndex = 1650;
    const misc = getHudMiscConfig();
    const width = misc.statusWidth;
    const height = misc.statusHeight;

    container.addChild(
        createDockPanel({
            width,
            height,
        }),
    );

    statusText = new PIXI.Text(
        "Waiting for game state...",
        createPanelBodyTextStyle({
            fontSize: 13,
            wordWrap: true,
            wordWrapWidth: width - 20,
        }),
    );
    statusText.anchor.y = 0.5;
    statusText.x = 10;
    statusText.y = height / 2;
    container.addChild(statusText);

    canvas.app.stage.addChild(container);
}

function getCurrentPlayerName(gs: GameState) {
    const order = Number(gs.CurrentPlayerOrder ?? -1);
    const found = gs.PlayerStates?.find((p) => Number(p?.Order) === order);
    return found?.Username || (order >= 0 ? `Player ${order + 1}` : "Player");
}

function buildStatusText() {
    if (!lastGameState) {
        return "Waiting for game state...";
    }

    const gs = lastGameState;
    const currentName = getCurrentPlayerName(gs);
    const currentState = gs.PlayerStates?.find(
        (p) => Number(p?.Order) === Number(gs.CurrentPlayerOrder),
    );

    if (gs.Paused) {
        return "Game is paused";
    }
    if (pendingActionMessage && currentState?.HasPendingAction) {
        return `${currentName}: ${pendingActionMessage}`;
    }
    if (gs.NeedDice) {
        return `${currentName} is rolling dice`;
    }
    if (currentState?.HasPendingAction) {
        return `${currentName} is choosing an action`;
    }
    if (Number(gs.CurrentPlayerOrder) === getThisPlayerOrder()) {
        return "Your turn";
    }
    return `Waiting for ${currentName}`;
}

function rerender() {
    if (!statusText || statusText.destroyed) {
        return;
    }
    statusText.text = buildStatusText();
    canvas.app.markDirty();
}

function sanitizeMessage(input: string) {
    return String(input || "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.!?]+$/, "");
}

export function setGameState(gs: GameState) {
    lastGameState = gs;
    const currentState = gs.PlayerStates?.find(
        (p) => Number(p?.Order) === Number(gs.CurrentPlayerOrder),
    );
    if (!currentState?.HasPendingAction) {
        pendingActionMessage = "";
    }
    ensureUI();
    rerender();
}

export function setPendingAction(action: PlayerAction | null | undefined) {
    pendingActionMessage = sanitizeMessage(action?.Message || "");
    ensureUI();
    rerender();
}

export function setFrame(frame: HUDFrame) {
    ensureUI();
    if (!container || container.destroyed) {
        return;
    }
    container.x = frame.x;
    container.y = frame.y;
}
