import * as PIXI from "pixi.js";
import * as assets from "./assets";
import * as canvas from "./canvas";
import * as state from "./state";
import * as tsg from "../tsg";
import { CardType } from "./entities";
import { buildHUDLayout } from "./hud/layoutEngine";
import type { HUDFrame } from "./hud/types";
import { getGameLogConfig } from "./uiConfig";
import {
    createDockPanel,
    createPanelBodyTextStyle,
    createPanelTitleTextStyle,
} from "./uiDock";

type LogEntry = {
    id: number;
    text: string;
    icons?: number[];
};

const WIDTH = () => getGameLogConfig().width;
const HEIGHT = () => getGameLogConfig().height;
const MAX_ENTRIES = 80;
const VISIBLE_ROWS = () => getGameLogConfig().visibleRows;

let container: PIXI.Container | null = null;
let content: PIXI.Container | null = null;
let entries: LogEntry[] = [];
let entryId = 0;

function getPlayerName(order: number) {
    if (order < 0) {
        return "Bank";
    }

    const states = state.lastKnownStates || [];
    const found = states.find((p) => p.Order === order);
    return found?.Username || `Player ${order + 1}`;
}

function ensureUI() {
    if (!canvas.app) return;

    if (container && !container.destroyed) {
        return;
    }

    container = new PIXI.Container();
    container.zIndex = 1600;

    const bg = createDockPanel({
        width: WIDTH(),
        height: HEIGHT(),
        headerHeight: 30,
    });
    container.addChild(bg);

    const title = new PIXI.Text("Game Log", createPanelTitleTextStyle());
    title.x = 10;
    title.y = 8;
    container.addChild(title);

    content = new PIXI.Container();
    content.y = 34;

    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRect(8, 34, WIDTH() - 16, HEIGHT() - 42);
    mask.endFill();
    container.addChild(mask);

    content.mask = mask;
    container.addChild(content);

    canvas.app.stage.addChild(container);
    relayout();
    rerender();
}

function rerender() {
    if (!content || content.destroyed) return;
    const feed = content;

    feed.removeChildren();

    const start = Math.max(0, entries.length - VISIBLE_ROWS());
    const visible = entries.slice(start);

    visible.forEach((entry, idx) => {
        const row = new PIXI.Container();
        row.y = idx * 22;

        const text = new PIXI.Text(entry.text, createPanelBodyTextStyle());
        text.x = 8;
        row.addChild(text);

        if (entry.icons?.length) {
            let iconX = WIDTH() - 16 - Math.min(entry.icons.length, 6) * 16;
            entry.icons.slice(0, 6).forEach((ct) => {
                const icon = new PIXI.Sprite();
                icon.x = iconX;
                icon.y = 1;
                icon.width = 14;
                icon.height = 14;
                assets.assignTexture(icon, assets.cards[ct]);
                row.addChild(icon);
                iconX += 16;
            });
        }

        const divider = new PIXI.Graphics();
        divider.beginFill(0x8f877a, 0.45);
        divider.drawRect(8, 19, WIDTH() - 24, 1);
        divider.endFill();
        row.addChild(divider);

        feed.addChild(row);
    });

    canvas.app.markDirty();
}

export function initialize() {
    ensureUI();
    entries = [];
    entryId = 0;
    rerender();
}

export function relayout() {
    if (!container || container.destroyed) {
        return;
    }

    setFrame(
        buildHUDLayout({
            canvasWidth: canvas.getWidth(),
            canvasHeight: canvas.getHeight(),
        }).widgets.gameLog!,
    );
    canvas.app.markDirty();
}

export function setFrame(frame: HUDFrame) {
    if (!container || container.destroyed) {
        return;
    }
    container.x = frame.x;
    container.y = frame.y;
}

export function pushEntry(text: string, icons?: number[]) {
    ensureUI();

    entries.push({
        id: entryId++,
        text,
        icons,
    });

    if (entries.length > MAX_ENTRIES) {
        entries = entries.slice(entries.length - MAX_ENTRIES);
    }

    rerender();
}

function summarizeGain(moves: tsg.CardMoveInfo[]) {
    const byPlayer: Record<number, { icons: number[]; total: number }> = {};

    for (const move of moves) {
        const ct = move.CardType;
        if (ct < CardType.Wood || ct > CardType.Coin) {
            continue;
        }

        if (!byPlayer[move.GainerOrder]) {
            byPlayer[move.GainerOrder] = { icons: [], total: 0 };
        }

        for (let i = 0; i < move.Quantity; i++) {
            byPlayer[move.GainerOrder].icons.push(ct);
        }
        byPlayer[move.GainerOrder].total += move.Quantity;
    }

    Object.keys(byPlayer).forEach((rawOrder) => {
        const order = Number(rawOrder);
        const data = byPlayer[order];
        if (!data.total) return;

        const playerName = getPlayerName(order);
        pushEntry(`${playerName} got`, data.icons);
    });
}

export function logDiceRoll(d: tsg.DieRollState) {
    if (d.IsInit) {
        return;
    }

    const roller =
        state.lastKnownGameState?.CurrentPlayerOrder !== undefined
            ? getPlayerName(state.lastKnownGameState.CurrentPlayerOrder)
            : "A player";

    pushEntry(
        `${roller} rolled ${d.RedRoll + d.WhiteRoll} (${d.RedRoll}+${d.WhiteRoll})`,
    );

    if (d.GainInfo?.length) {
        summarizeGain(d.GainInfo);
    }
}

export function logCardMove(move: tsg.CardMoveInfo) {
    summarizeGain([move]);
}

export function logDevCardUse(info: tsg.DevCardUseInfo) {
    // Server often sends a hide/removal follow-up message; log only visible event.
    if (!info.CardType || info.Time !== 0) {
        return;
    }

    const actor =
        state.lastKnownGameState?.CurrentPlayerOrder !== undefined
            ? getPlayerName(state.lastKnownGameState.CurrentPlayerOrder)
            : "A player";

    pushEntry(`${actor} played a development card`);
}

export function logDevCardDraw(playerOrder: number) {
    pushEntry(`${getPlayerName(playerOrder)} drew a development card`);
}

export function logNotice(text: string) {
    pushEntry(text);
}
