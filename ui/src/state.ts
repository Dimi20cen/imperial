import * as PIXI from "pixi.js";
import * as assets from "./assets";
import * as canvas from "./canvas";
import * as chat from "./chat";
import * as gameLog from "./gameLog";
import * as resourceBank from "./resourceBank";
import * as buttons from "./buttons";
import * as board from "./board";
import * as hand from "./hand";
import * as anim from "./animation";
import * as actions from "./actions";
import * as windows from "./windows";
import * as trade from "./trade";
import * as settingsMenu from "./settings";
import { buildHUDLayout } from "./hud/layoutEngine";
import type { HUDLayoutResult } from "./hud/types";
import {
    computeBankPosition,
    computePlayerPanelPosition,
    computeSpectatorsPosition,
} from "./hudLayout";
import { sound } from "@pixi/sound";
import { cancelPendingAction } from "./actions";
import { getThisPlayerOrder } from "./ws";
import {
    CardMoveInfo,
    GameSettings,
    GameState,
    PlayerAction,
    PlayerState,
} from "../tsg";
import { CardType } from "./entities";
import CommandHub from "./commands";
import { syncTurnTimerSnapshot } from "./store/turnTimerRuntime";
import {
    getPendingActionOverlayConfig,
    getPlayerPanelConfig,
} from "./uiConfig";
import {
    createPanelBodyTextStyle,
    createPanelTitleTextStyle,
} from "./uiDock";

type InitializableSprite = PIXI.Sprite & { initialized?: boolean };

// Players
let container: PIXI.Container;
type IconText = {
    img: PIXI.Sprite;
    text: PIXI.Text;
    icon: assets.ICON;
};
export let players: {
    bg: PIXI.Graphics;

    avatar: InitializableSprite & { dirty?: boolean };
    vpRibbon: PIXI.Sprite;
    name: PIXI.Text;
    victoryPoint: IconText;
    road: IconText;
    cards: IconText;
    dcard: IconText;
    knights: IconText;
    bot: PIXI.Sprite;
    improvements: { [key: number]: PIXI.Sprite[] };
}[];

// Bank
export let bankContainer: PIXI.Container;

// Barbarian
let barbarianContainer: PIXI.Container;
let barbarianSprite: PIXI.Container & anim.Translatable;
let barbarianStrength: PIXI.Sprite;
let barbarianKnights: PIXI.Sprite;

// Pending action
let pendingActionContainer: PIXI.Container;
let pendingActionText: PIXI.Text;
let pendingActionCancel: buttons.ButtonSprite;
let currentPendingAction: Partial<PlayerAction> | undefined;
let pauseOverlay: PIXI.Graphics | null = null;

// Persistent state
export let lastKnownStates: PlayerState[] | null = null;
export let lastKnownGameState: GameState | null = null;
let lastKnownSecretVictoryPoints: number = 0;

function getPlayerPanelWidth() {
    return getPlayerPanelConfig().width;
}

function getPlayerPanelScale(playerCount: number) {
    const config = getPlayerPanelConfig();
    return playerCount > config.crowdedThreshold
        ? config.scaleCrowded
        : config.scaleDefault;
}

function getPlayerPanelHeight(playerCount: number) {
    const config = getPlayerPanelConfig();
    return playerCount * config.rowHeight + config.headerOffset;
}

function getPlayerRowOffset(order: number) {
    return order * getPlayerPanelConfig().rowHeight;
}

function getDisplayOrders(states: PlayerState[]) {
    const uniqueOrders = Array.from(
        new Set(states.map((s) => Number(s.Order))),
    ).sort((a, b) => a - b);
    const thisOrder = getThisPlayerOrder();
    const meIndex = uniqueOrders.indexOf(thisOrder);
    if (meIndex >= 0) {
        uniqueOrders.splice(meIndex, 1);
        uniqueOrders.push(thisOrder);
    }
    return uniqueOrders;
}

function getPlayerRowOffsetByDisplayOrder(
    rowIndexByOrder: Map<number, number>,
    order: number,
) {
    const rowIndex = rowIndexByOrder.get(order);
    if (rowIndex === undefined) {
        return getPlayerRowOffset(order);
    }
    return rowIndex * getPlayerPanelConfig().rowHeight;
}

type PlayerRowLayout = {
    avatarX: number;
    avatarScale: number;
    avatarY: number;
    vpRibbonWidth: number;
    vpRibbonHeight: number;
    cardSlotWidth: number;
    cardSlotHeight: number;
    cardImageWidth: number;
    cardImageHeight: number;
    cardChipX: number;
    cardChipY: number;
    cardChipWidth: number;
    cardChipHeight: number;
    cardChipRadius: number;
    cardChipBorderWidth: number;
    cardTextX: number;
    cardTextY: number;
    cardTextFontSize: number;
    iconSlotWidth: number;
    iconSlotHeight: number;
    iconImageWidth: number;
    iconImageHeight: number;
    iconTextX: number;
    iconTextY: number;
    iconTextFontSize: number;
    cardsX: number;
    dcardX: number;
    roadX: number;
    knightX: number;
    cardY: number;
    iconY: number;
    nameFontSize: number;
    nameY: number;
    nameLeftX: number;
    botGapDefault: number;
};

function getPlayerRowLayout(): PlayerRowLayout {
    const panelWidth = getPlayerPanelWidth();
    const rowHeight = getPlayerPanelConfig().rowHeight;
    const isCompact = panelWidth <= 240 || rowHeight <= 74;

    const cardSlotWidth = isCompact ? 34 : 40;
    const cardSlotHeight = isCompact ? 48 : 54;
    const iconSlotWidth = isCompact ? 24 : 30;
    const iconSlotHeight = isCompact ? 36 : 42;
    const cardGap = isCompact ? 2 : 4;
    const groupGap = isCompact ? 8 : 22;
    const iconGap = 2;
    const rightInset = isCompact ? 4 : 6;
    const statsWidth =
        cardSlotWidth * 2 +
        cardGap +
        groupGap +
        iconSlotWidth * 2 +
        iconGap;
    const cardsX = panelWidth - rightInset - statsWidth;
    const dcardX = cardsX + cardSlotWidth + cardGap;
    const roadX = dcardX + cardSlotWidth + groupGap;
    const knightX = roadX + iconSlotWidth + iconGap;

    const avatarScale = isCompact ? 0.88 : 1;

    return {
        avatarX: isCompact ? 14 : 18,
        avatarScale,
        avatarY: isCompact ? 12 : 16,
        vpRibbonWidth: isCompact ? 40 : 44,
        vpRibbonHeight: isCompact ? 16 : 18,
        cardSlotWidth,
        cardSlotHeight,
        cardImageWidth: isCompact ? 32 : 38,
        cardImageHeight: isCompact ? 44 : 50,
        cardChipX: isCompact ? 16 : 19,
        cardChipY: 2,
        cardChipWidth: isCompact ? 16 : 18,
        cardChipHeight: isCompact ? 16 : 18,
        cardChipRadius: 5,
        cardChipBorderWidth: 2,
        cardTextX: isCompact ? 24 : 28,
        cardTextY: isCompact ? 9 : 11,
        cardTextFontSize: isCompact ? 14 : 16,
        iconSlotWidth,
        iconSlotHeight,
        iconImageWidth: isCompact ? 22 : 28,
        iconImageHeight: isCompact ? 18 : 22,
        iconTextX: isCompact ? 11 : 14,
        iconTextY: isCompact ? 20 : 24,
        iconTextFontSize: isCompact ? 15 : 17,
        cardsX,
        dcardX,
        roadX,
        knightX,
        cardY: isCompact ? 18 : 24,
        iconY: isCompact ? 22 : 28,
        nameFontSize: isCompact ? 11 : 12,
        nameY: 6,
        nameLeftX: isCompact ? 24 : 30,
        botGapDefault: 6,
    };
}

function drawPlayerRowBackground(
    graphic: PIXI.Graphics,
    y: number,
    isCurrent: boolean,
) {
    const width = getPlayerPanelWidth();
    const height = getPlayerPanelConfig().highlightRowHeight;
    const fill = isCurrent ? 0xf0f7f4 : 0xf7f6f2;
    const border = isCurrent ? 0x2f7d69 : 0x9c978a;
    graphic.clear();

    graphic.lineStyle({ color: border, width: isCurrent ? 3 : 1.5 });
    graphic.beginFill(fill, 1);
    graphic.drawRoundedRect(0, y, width - 1, height - 1, 6);
    graphic.endFill();
}

export enum GameMode {
    Base = 1,
    CitiesAndKnights = 2,
    Seafarers = 3,
}

// Game settings
export let settings: GameSettings;

export function setSettings(s: GameSettings) {
    settings = s;
}

export function getPlayerPanelBounds() {
    if (!container || container.destroyed) {
        return null;
    }
    return container.getBounds();
}

export function getHUDLayoutContext() {
    if (!lastKnownStates?.length) {
        return {};
    }

    return {
        playerCount: lastKnownStates.length,
        playerPanelWidth: getPlayerPanelWidth(),
        playerPanelHeight: getPlayerPanelHeight(lastKnownStates.length),
        playerPanelScale: getPlayerPanelScale(lastKnownStates.length),
    };
}

export function relayout() {
    if (!container || container.destroyed || !lastKnownStates) {
        return;
    }

    applyHUDLayout(
        buildHUDLayout({
            canvasWidth: canvas.getWidth(),
            canvasHeight: canvas.getHeight(),
            playerCount: lastKnownStates.length,
            playerPanelWidth: getPlayerPanelWidth(),
            playerPanelHeight: getPlayerPanelHeight(lastKnownStates.length),
            playerPanelScale: getPlayerPanelScale(lastKnownStates.length),
        }),
    );
    updatePauseOverlay(Boolean(lastKnownGameState?.Paused));

    canvas.app.markDirty();
}

export function applyHUDLayout(layout: HUDLayoutResult) {
    const playerPanelFrame = layout.widgets.playerPanel;
    const bankFrame = layout.widgets.bank;
    const spectatorsFrame = layout.widgets.spectators;
    if (container && !container.destroyed && playerPanelFrame) {
        container.x = playerPanelFrame.x;
        container.y = playerPanelFrame.y;
    }
    if (bankContainer && !bankContainer.destroyed && bankFrame) {
        bankContainer.x = bankFrame.x;
        bankContainer.y = bankFrame.y;
    }
    if (
        spectators &&
        !spectators.container.destroyed &&
        spectatorsFrame
    ) {
        spectators.container.x = spectatorsFrame.x;
        spectators.container.y = spectatorsFrame.y;
    }
}

function updatePauseOverlay(paused: boolean) {
    if (!pauseOverlay || pauseOverlay.destroyed) {
        return;
    }
    pauseOverlay.clear();
    pauseOverlay.visible = paused;
    if (!paused) {
        return;
    }
    pauseOverlay.beginFill(0x000000, 0.35);
    pauseOverlay.drawRect(0, 0, canvas.getWidth(), canvas.getHeight());
    pauseOverlay.endFill();
}

/**
 * Initialize the players list UI
 * @param commandHub Command hub
 */
function intialize(commandHub: CommandHub) {
    // State window
    const playerCount = lastKnownStates!.length;
    const windowHeight = getPlayerPanelHeight(playerCount);
    const windowScale = getPlayerPanelScale(playerCount);

    players = new Array(6);

    container = new PIXI.Container();
    const playerPanelPos = computePlayerPanelPosition({
        canvasWidth: canvas.getWidth(),
        canvasHeight: canvas.getHeight(),
        panelWidth: getPlayerPanelWidth(),
        panelHeight: windowHeight,
        panelScale: windowScale,
    });
    container.x = playerPanelPos.x;
    container.y = playerPanelPos.y;
    container.cacheAsBitmapResolution = 2;
    container.cacheAsBitmapMultisample = PIXI.MSAA_QUALITY.HIGH;
    canvas.app.stage.addChild(container);
    container.scale.set(windowScale);

    // Pending action window
    const pendingActionConfig = getPendingActionOverlayConfig();
    pendingActionContainer = new PIXI.Container();
    pendingActionContainer.x = pendingActionConfig.x;
    pendingActionContainer.y = pendingActionConfig.y;
    pendingActionContainer.zIndex = 1300;
    pendingActionContainer.visible = false;

    pendingActionText = new PIXI.Text(
        "",
        createPanelTitleTextStyle({
            fontSize: pendingActionConfig.fontSize,
            align: "left",
        }),
    );
    pendingActionText.x = pendingActionConfig.textX;
    pendingActionText.y = pendingActionConfig.textY;
    pendingActionText.anchor.y = 0.5;

    pendingActionContainer.addChild(
        windows.getWindowSprite(
            pendingActionConfig.width,
            pendingActionConfig.height,
        ),
    );
    pendingActionContainer.addChild(pendingActionText);

    pendingActionCancel = buttons.getButtonSprite(
        buttons.ButtonType.No,
        pendingActionConfig.closeButtonSize,
    );
    pendingActionCancel.x =
        pendingActionContainer.width - pendingActionConfig.closeButtonSize - 2;
    pendingActionCancel.y = 1;
    pendingActionCancel.anchor.x = 0;
    pendingActionCancel.interactive = true;
    pendingActionCancel.cursor = "pointer";
    pendingActionCancel.setEnabled(true);
    pendingActionCancel.on("pointerdown", cancelPendingAction);
    pendingActionContainer.addChild(pendingActionCancel);

    pauseOverlay = new PIXI.Graphics();
    pauseOverlay.zIndex = 1250;
    pauseOverlay.visible = false;
    pauseOverlay.interactive = false;
    canvas.app.stage.addChild(pauseOverlay);

    // Render buttons here so we know the player's color
    buttons.render(commandHub);
    chat.initialize();
    gameLog.initialize();
    resourceBank.initialize();
    trade.initialize();

    bankContainer = new PIXI.Container();
    const bankPos = computeBankPosition({
        canvasWidth: canvas.getWidth(),
        playerPanelY: container.y,
    });
    bankContainer.x = bankPos.x;
    bankContainer.y = bankPos.y;
    bankContainer.zIndex = 900;
    bankContainer.visible = false;
    canvas.app.stage.addChild(bankContainer);

    canvas.app.slowTicker.add(() => {
        if (!lastKnownStates || !container) return;

        for (const state of lastKnownStates) {
            const avatar = players[state.Order]?.avatar;

            if (!state.HasPendingAction || avatar.alpha < 0.9) {
                if (avatar.dirty) {
                    avatar.dirty = false;
                    canvas.app.markClean(avatar);
                }
                continue;
            }

            (<number>avatar.tint) -= 0x111111;
            if (<number>avatar.tint < 0x444444) {
                avatar.tint = 0xffffff;
            }

            canvas.app.renderRecursive(avatar);

            if (!avatar.dirty) {
                avatar.dirty = true;
                canvas.app.markDirty(avatar);
            }
        }
    });
}

/**
 * Invalidate the cache of player list
 */
function rerender() {
    canvas.app.invalidateBitmapCache(container);
}

/**
 * Render the player list and game state
 * @param gs Game state
 * @param commandHub Command hub
 */
export function renderGameState(gs: GameState, commandHub: CommandHub) {
    const states = gs.PlayerStates;
    lastKnownStates = states;
    const rowLayout = getPlayerRowLayout();
    const displayOrders = getDisplayOrders(states);
    const rowIndexByOrder = new Map<number, number>(
        displayOrders.map((order, index) => [order, index]),
    );

    if (lastKnownGameState) {
        // Chime cause its your turn
        if (
            gs.CurrentPlayerOrder == getThisPlayerOrder() &&
            lastKnownGameState.CurrentPlayerOrder != getThisPlayerOrder()
        ) {
            sound.play("soundRing");
        }

        // Close boxes if its no longer your turn
        if (
            gs.CurrentPlayerOrder != getThisPlayerOrder() &&
            lastKnownGameState.CurrentPlayerOrder == getThisPlayerOrder()
        ) {
            if (buttons.buttons.improveBox) {
                buttons.buttons.improveBox.container.visible = false;
            }
            if (buttons.buttons.knightBox) {
                buttons.buttons.knightBox.container.visible = false;
            }
        }
    }
    lastKnownGameState = gs;

    if (!container || container.destroyed) {
        intialize(commandHub);
    }
    syncTurnTimerSnapshot(gs, states);
    buttons.updatePauseToggle(Boolean(gs.Paused));
    settingsMenu.setPaused(Boolean(gs.Paused));
    updatePauseOverlay(Boolean(gs.Paused));

    states.forEach((state) => {
        // Clear pending action if not found
        if (state.Order === getThisPlayerOrder()) {
            if (!state.HasPendingAction) {
                actions.resetPendingAction();
            }
        }

        // Initialize state sprite
        if (!players[state.Order]) {
            players[state.Order] = {} as any;
            const spriteset = players[state.Order];

            const offset = getPlayerRowOffsetByDisplayOrder(
                rowIndexByOrder,
                state.Order,
            );

            {
                const g = new PIXI.Graphics();
                container.addChild(g);
                spriteset.bg = g;
                drawPlayerRowBackground(g, offset, false);
                g.visible = true;
            }

            spriteset.avatar = getPlayerAvatarSprite(state.Order, rerender);
            spriteset.avatar.x = 17;
            spriteset.avatar.y = 17 + offset;
            spriteset.avatar.on("pointerdown", (e) =>
                playerClickEvent?.(e, state.Order),
            );
            container.addChild(spriteset.avatar);

            spriteset.vpRibbon = new PIXI.Sprite();
            assets.assignTexture(spriteset.vpRibbon, assets.playerListRibbon);
            spriteset.vpRibbon.x = spriteset.avatar.x + 4;
            spriteset.vpRibbon.y = spriteset.avatar.y + 41;
            spriteset.vpRibbon.width = 44;
            spriteset.vpRibbon.height = 18;
            container.addChild(spriteset.vpRibbon);
            new windows.TooltipHandler(
                spriteset.vpRibbon,
                "Current number of victory points of the player",
            );

            const createCardCounter = (
                x: number,
                y: number,
                icon: assets.ICON,
                title: string,
            ) => {
                const imgc = new PIXI.Container();
                imgc.interactive = true;
                imgc.hitArea = new PIXI.RoundedRectangle(
                    0,
                    0,
                    rowLayout.cardSlotWidth,
                    rowLayout.cardSlotHeight,
                    6,
                );
                imgc.x = x;
                imgc.y = y + offset;
                new windows.TooltipHandler(imgc, title);
                container.addChild(imgc);

                const img = new PIXI.Sprite();
                assets.assignTexture(img, assets.icons[icon]);
                img.width = rowLayout.cardImageWidth;
                img.height = rowLayout.cardImageHeight;
                img.x = 1;
                img.y = Math.round((rowLayout.cardSlotHeight - img.height) / 2);
                imgc.addChild(img);

                const cardBg = new PIXI.Graphics();
                cardBg.lineStyle({ color: 0x94a3b8, width: 1.5 });
                cardBg.beginFill(0xe2e8f0, 1);
                cardBg.drawRoundedRect(
                    0,
                    0,
                    rowLayout.cardSlotWidth,
                    rowLayout.cardSlotHeight,
                    6,
                );
                cardBg.endFill();
                imgc.addChildAt(cardBg, 0);

                const text = new PIXI.Text(
                    ``,
                    createPanelBodyTextStyle({
                        fontSize: rowLayout.cardTextFontSize,
                        fill: 0xf8fafc,
                        align: "center",
                    }),
                );
                const chip = new PIXI.Graphics();
                chip.lineStyle({
                    color: 0x0f172a,
                    width: 1.2,
                });
                chip.beginFill(0x1f2937);
                chip.drawRoundedRect(
                    rowLayout.cardChipX,
                    rowLayout.cardChipY,
                    rowLayout.cardChipWidth,
                    rowLayout.cardChipHeight,
                    4,
                );
                chip.endFill();
                imgc.addChild(chip);
                text.anchor.set(0.5);
                text.x = rowLayout.cardTextX;
                text.y = rowLayout.cardTextY;
                imgc.addChild(text);
                return { img, text, icon };
            };

            const createIconCounter = (
                x: number,
                y: number,
                icon: assets.ICON,
                title: string,
            ) => {
                const imgc = new PIXI.Container();
                imgc.interactive = true;
                imgc.hitArea = new PIXI.RoundedRectangle(
                    0,
                    0,
                    rowLayout.iconSlotWidth,
                    rowLayout.iconSlotHeight,
                    6,
                );
                imgc.x = x;
                imgc.y = y + offset;
                new windows.TooltipHandler(imgc, title);
                container.addChild(imgc);

                const img = new PIXI.Sprite();
                assets.assignTexture(img, assets.icons[icon]);
                const iconAsset = assets.icons[icon];
                const scale = Math.min(
                    rowLayout.iconImageWidth / iconAsset.width,
                    rowLayout.iconImageHeight / iconAsset.height,
                );
                img.scale.set(scale);
                img.x = Math.round(
                    (rowLayout.iconImageWidth - iconAsset.width * scale) / 2,
                );
                img.y = 2;
                imgc.addChild(img);

                const iconBg = new PIXI.Graphics();
                iconBg.lineStyle({ color: 0x94a3b8, width: 1.25 });
                iconBg.beginFill(0xe2e8f0, 1);
                iconBg.drawRoundedRect(
                    0,
                    0,
                    rowLayout.iconSlotWidth,
                    rowLayout.iconSlotHeight,
                    6,
                );
                iconBg.endFill();
                imgc.addChildAt(iconBg, 0);

                const text = new PIXI.Text(
                    ``,
                    createPanelBodyTextStyle({
                        fontSize: rowLayout.iconTextFontSize,
                        align: "center",
                        fill: 0x334155,
                    }),
                );
                text.anchor.set(0.5, 0);
                text.x = rowLayout.iconTextX;
                text.y = rowLayout.iconTextY;
                imgc.addChild(text);
                return { img, text, icon };
            };

            // User name
            spriteset.name = new PIXI.Text(
                state.Username,
                createPanelTitleTextStyle({
                    fontSize: rowLayout.nameFontSize,
                    align: "center",
                }),
            );
            spriteset.name.anchor.x = 0.5;
            spriteset.name.x = Math.round(getPlayerPanelWidth() / 2);
            spriteset.name.y = rowLayout.nameY + offset;
            container.addChild(spriteset.name);

            // Bot identifier
            spriteset.bot = new PIXI.Sprite();
            assets.assignTexture(spriteset.bot, assets.bot);
            spriteset.bot.scale.set(0.11);
            spriteset.bot.anchor.y = 0.5;
            spriteset.bot.x = spriteset.name.x + spriteset.name.width / 2 + 6;
            spriteset.bot.y = spriteset.name.y + spriteset.name.height / 2;
            spriteset.bot.visible = false;
            container.addChild(spriteset.bot);

            const vpText = new PIXI.Text(
                "",
                createPanelTitleTextStyle({
                    fontSize: 12,
                    align: "center",
                    fill: 0x2c2b29,
                }),
            );
            vpText.anchor.set(0.5);
            vpText.x = spriteset.vpRibbon.x + spriteset.vpRibbon.width / 2;
            vpText.y = spriteset.vpRibbon.y + spriteset.vpRibbon.height / 2 + 1;
            container.addChild(vpText);
            spriteset.victoryPoint = {
                img: spriteset.vpRibbon,
                text: vpText,
                icon: assets.ICON.VP,
            };

            spriteset.cards = createCardCounter(
                rowLayout.cardsX,
                rowLayout.cardY,
                assets.ICON.CARDS,
                "Number of resource cards this player currently holds",
            );
            spriteset.dcard = createCardCounter(
                rowLayout.dcardX,
                rowLayout.cardY,
                assets.ICON.DCARD,
                "Number of action cards this player currently holds",
            );
            spriteset.road = createIconCounter(
                rowLayout.roadX,
                rowLayout.iconY,
                assets.ICON.ROAD,
                "Length of the longest road of this player",
            );
            const knightTooltip =
                settings.Mode == GameMode.CitiesAndKnights
                    ? "Active number of Warriors with allegiance to this player"
                    : "Number of played Knight cards (Largest Army progress)";
            spriteset.knights = createIconCounter(
                rowLayout.knightX,
                rowLayout.iconY,
                assets.ICON.KNIGHT,
                knightTooltip,
            );
            const showKnightStat = settings.Mode != GameMode.CitiesAndKnights;
            spriteset.knights.img.visible = showKnightStat;
            spriteset.knights.text.visible = showKnightStat;

            // City improvements
            if (settings.Mode == GameMode.CitiesAndKnights) {
                const p = players[state.Order];
                p.improvements = {};
                const improvementsBaseX = rowLayout.roadX - 4;

                let j = 0;
                for (const t of [
                    [CardType.Paper, 0x00aa00],
                    [CardType.Cloth, 0xf7c12a],
                    [CardType.Coin, 0x0000aa],
                ]) {
                    p.improvements[t[0]] = [];

                    for (let i = 0; i < 5; i++) {
                        const g = new PIXI.Graphics()
                            .beginFill(t[1])
                            .drawRoundedRect(0, 0, 6, 6, 1)
                            .endFill();
                        const tex = canvas.app.generateRenderTexture(g);

                        const s = new PIXI.Sprite(tex);
                        s.x = improvementsBaseX + 8 * i;
                        s.y = 8 * j + 56 + offset;
                        container.addChild(s);
                        s.alpha = 0.15;

                        p.improvements[t[0]].push(s);
                    }

                    j++;
                }
            }
        }

        const vp =
            getThisPlayerOrder() == state.Order
                ? Math.max(lastKnownSecretVictoryPoints, state.VictoryPoints)
                : state.VictoryPoints;
        const p = players[state.Order];
        const offset = getPlayerRowOffsetByDisplayOrder(
            rowIndexByOrder,
            state.Order,
        );
        const isCurrent = Boolean(state.Current);
        drawPlayerRowBackground(p.bg, offset, isCurrent);
        p.bg.visible = true;

        p.avatar.scale.set(rowLayout.avatarScale);
        p.avatar.x = rowLayout.avatarX;
        p.avatar.y = offset + rowLayout.avatarY;
        p.vpRibbon.x = p.avatar.x + 4;
        p.vpRibbon.y = p.avatar.y + (52 * rowLayout.avatarScale - 10);
        p.vpRibbon.width = rowLayout.vpRibbonWidth;
        p.vpRibbon.height = rowLayout.vpRibbonHeight;
        p.victoryPoint.text.x = p.vpRibbon.x + p.vpRibbon.width / 2;
        p.victoryPoint.text.y = p.vpRibbon.y + p.vpRibbon.height / 2 + 1;

        const cardsContainer = p.cards.img.parent as PIXI.Container;
        const dcardContainer = p.dcard.img.parent as PIXI.Container;
        const roadContainer = p.road.img.parent as PIXI.Container;
        const knightContainer = p.knights.img.parent as PIXI.Container;
        cardsContainer.x = rowLayout.cardsX;
        cardsContainer.y = offset + rowLayout.cardY;
        dcardContainer.x = rowLayout.dcardX;
        dcardContainer.y = cardsContainer.y;
        roadContainer.x = rowLayout.roadX;
        roadContainer.y = offset + rowLayout.iconY;
        knightContainer.x = rowLayout.knightX;
        knightContainer.y = roadContainer.y;

        p.name.style = createPanelTitleTextStyle({
            fontSize: rowLayout.nameFontSize,
            align: "left",
            fill: 0x1f2937,
        });
        p.name.scale.set(1);
        p.name.anchor.x = 0;
        p.name.x = rowLayout.nameLeftX;
        p.name.y = offset + rowLayout.nameY;
        const maxNameWidth = Math.max(40, rowLayout.cardsX - p.name.x - 10);
        if (p.name.width > maxNameWidth) {
            const scale = maxNameWidth / p.name.width;
            p.name.scale.set(scale);
        }
        p.bot.x = p.name.x + p.name.width + rowLayout.botGapDefault;
        p.bot.y = p.name.y + p.name.height / 2;

        const knightCount = Math.max(0, Number(state.Knights ?? 0));
        const resourceCardCount = Math.max(0, Number(state.NumCards ?? 0));
        const developmentCardCount = Math.max(
            0,
            Number(state.NumDevelopmentCards ?? 0),
        );
        p.victoryPoint.text.text = `${vp}`;
        p.road.text.text = `${state.LongestRoad}`;
        if (settings.Mode == GameMode.CitiesAndKnights) {
            p.knights.text.text = "";
            p.knights.img.visible = false;
            p.knights.text.visible = false;
        } else {
            p.knights.text.text = `${knightCount}`;
            p.knights.img.visible = true;
            p.knights.text.visible = true;
        }
        p.cards.text.text = `${resourceCardCount}`;
        p.dcard.text.text = `${developmentCardCount}`;
        p.bot.visible = !!state.IsBot;

        // Highlight extra points
        if (state.HasLongestRoad) {
            assets.assignTexture(
                p.road.img,
                assets.highlightedIcons[p.road.icon] ?? assets.icons[p.road.icon],
            );
            p.road.img.tint = 0xffffff;
            p.road.text.style.fill = 0xb45309;
            p.road.img.alpha = 1;
        } else {
            assets.assignTexture(p.road.img, assets.icons[p.road.icon]);
            p.road.img.tint = 0x64748b;
            p.road.text.style.fill = 0x475569;
            p.road.img.alpha = 0.95;
        }

        // Highlight extra points / most active knights
        if (state.HasLargestArmy) {
            assets.assignTexture(
                p.knights.img,
                assets.highlightedIcons[p.knights.icon] ??
                    assets.icons[p.knights.icon],
            );
            p.knights.img.tint = 0xffffff;
            p.knights.text.style.fill = 0xb45309;
            p.knights.img.alpha = 1;
        } else {
            assets.assignTexture(p.knights.img, assets.icons[p.knights.icon]);
            p.knights.img.tint = 0x64748b;
            p.knights.text.style.fill = 0x475569;
            p.knights.img.alpha = 0.95;
        }

        // Highlight too many cards
        if (resourceCardCount > state.DiscardLimit) {
            p.cards.img.tint = 0xffffff;
            p.cards.text.style.fill = 0xdd0000;
        } else {
            p.cards.img.tint = 0xffffff;
            p.cards.text.style.fill = 0xf8fafc;
        }

        if (settings.Mode == GameMode.CitiesAndKnights) {
            Object.keys(state.Improvements).forEach((k) => {
                if (p.improvements[Number(k)]) {
                    for (let i = 0; i < state.Improvements[Number(k)]!; i++) {
                        p.improvements[Number(k)][i].alpha = 1;
                    }
                }

                if (state.Order == getThisPlayerOrder()) {
                    const ib = buttons.buttons.improveBox!;
                    let key: keyof typeof ib;
                    switch (Number(k)) {
                        case CardType.Paper:
                            key = "paper";
                            break;
                        case CardType.Cloth:
                            key = "cloth";
                            break;
                        case CardType.Coin:
                            key = "coin";
                            break;
                        default:
                            key = "paper";
                    }
                    const buttonSprite = <buttons.ButtonSprite>(
                        buttons.buttons.improveBox![key]
                    );
                    buttonSprite.tooltip!.setCards(
                        new Array(
                            (state.Improvements[Number(k)] ?? 0) + 1,
                        ).fill(Number(k)),
                    );
                }
            });
        }

        if (!state.HasPendingAction) {
            players[state.Order].avatar.tint = 0xffffff;
        }
    });

    renderTimers(); // implicitly calls rerender
    renderBarbarian(gs);
}

/**
 * Show a pending action for this player
 * @param action Action to render
 */
export function showPendingAction(action?: Partial<PlayerAction>) {
    canvas.app.markDirty();

    if (
        action &&
        !currentPendingAction &&
        lastKnownStates &&
        !lastKnownStates[getThisPlayerOrder()]?.Current
    ) {
        sound.play("soundRing");
    }

    currentPendingAction = action;
}

type BuildToggleTarget =
    | "s"
    | "c"
    | "r"
    | "sh"
    | "ms"
    | "w"
    | "k"
    | "ka"
    | "kr"
    | "km";

/**
 * Cancel current pending map-placement action if it matches the same build intent.
 * @returns true when a cancel was sent.
 */
export function togglePendingBuildPlacement(target: BuildToggleTarget): boolean {
    const matches = isPendingBuildPlacement(target);

    if (!matches) {
        return false;
    }

    cancelPendingAction();
    return true;
}

/**
 * Returns true when this build target currently has a pending cancelable placement action.
 */
export function isPendingBuildPlacement(target: BuildToggleTarget): boolean {
    const actionType = String(currentPendingAction?.Type || "");
    const message = String(currentPendingAction?.Message || "").toLowerCase();
    const canCancel = Boolean(currentPendingAction?.CanCancel);
    if (!canCancel) {
        return false;
    }

    switch (target) {
        case "r":
            return actionType === "ce" && message.includes("road");
        case "sh":
            return actionType === "ce" && message.includes("location for ship");
        case "ms":
            return (
                actionType === "ce" &&
                (message.includes("ship to move") ||
                    message.includes("destination for ship"))
            );
        case "s":
            return actionType === "cv" && message.includes("settlement");
        case "c":
            return actionType === "cv" && message.includes("city");
        case "w":
            return actionType === "cv" && message.includes("fence");
        case "k":
            return actionType === "cv" && message.includes("location for warrior");
        case "ka":
            return actionType === "cv" && message.includes("warrior to activate");
        case "kr":
            return (
                actionType === "cv" &&
                message.includes("warrior to chase away the robber")
            );
        case "km":
            return actionType === "cv" && message.includes("warrior to move");
        default:
            return false;
    }
}

/**
 * Returns true when there is any cancelable build placement action active.
 */
export function hasPendingBuildPlacement(): boolean {
    const actionType = String(currentPendingAction?.Type || "");
    const canCancel = Boolean(currentPendingAction?.CanCancel);
    return canCancel && (actionType === "ce" || actionType === "cv");
}

type PlayerClickEvent = (event: any, order: number) => void;
let playerClickEvent: PlayerClickEvent | null = null;

/**
 * Set the event handler for when a player avatar is clicked
 * @param e Click event
 */
export function setPlayerClickEvent(e: PlayerClickEvent | null) {
    playerClickEvent = e;
}

/**
 * Highlight players to click on
 * @param boolmatrix boolean matrix of player clickability
 */
export function highlightPlayers(boolmatrix?: boolean[]) {
    canvas.app.markDirty();
    for (let i = 0; i < (boolmatrix?.length ?? players.length); i++) {
        if (!players[i]?.avatar) {
            continue;
        }

        players[i].avatar.alpha = boolmatrix?.[i] ?? true ? 1 : 0.5;
        players[i].avatar.tint = boolmatrix?.[i] ?? true ? 0xffffff : 0x333333;
        players[i].avatar.cursor = Boolean(boolmatrix?.[i])
            ? "pointer"
            : "default";
        players[i].avatar.interactive = Boolean(boolmatrix?.[i]);
    }
    rerender();
}

/**
 * Get the avatar image for a player
 * @param order player order
 * @param rendered callback after image is rendered
 */
export function getPlayerAvatarSprite(order: number, rendered?: () => void) {
    const button: InitializableSprite = new PIXI.Sprite();
    const state = lastKnownStates ? lastKnownStates[order] : undefined;
    const avatarSize = 52;
    const avatarRadius = 24;
    const avatarCenter = avatarSize / 2;
    const fillColor = (() => {
        try {
            return PIXI.utils.string2hex(state?.Color || "#44515c");
        } catch {
            return 0x44515c;
        }
    })();

    const bg = new PIXI.Graphics();
    bg.beginFill(fillColor);
    bg.drawCircle(avatarCenter, avatarCenter, avatarRadius);
    bg.endFill();
    button.texture = canvas.app.generateRenderTexture(bg, {
        width: avatarSize,
        height: avatarSize,
    });
    bg.destroy();
    button.width = avatarSize;
    button.height = avatarSize;

    const border = new PIXI.Graphics();
    border.lineStyle({ color: 0x223948, width: 2 });
    border.beginFill(0, 0);
    border.drawCircle(avatarCenter, avatarCenter, avatarRadius);
    border.endFill();
    button.addChild(border);

    PIXI.Texture.fromURL(assets.playerAvatarIcon.src)
        .then((t) => {
            if (button.destroyed) return;
            const iconSprite = new PIXI.Sprite(t);
            iconSprite.anchor.set(0.5);
            iconSprite.x = avatarCenter;
            iconSprite.y = avatarCenter;
            iconSprite.width = 40;
            iconSprite.height = 40;
            button.addChild(iconSprite);

            button.initialized = true;
            canvas.app.markDirty();
            rendered?.();
        })
        .catch(() => {
            if (button.destroyed) return;
            // Keep colored background if icon load fails.
            button.initialized = true;
            canvas.app.markDirty();
            rendered?.();
        });
    return button;
}

/** Animation from tiles to hand */
let pendingCardMoves: CardMoveInfo[] = [];

/**
 * Add pending animation moves for cards
 * @param moves list of move infos
 */
export function addPendingCardMoves(moves: CardMoveInfo[]) {
    if (!moves) return;

    const gainSprites: anim.TranslatableSprite[] = [];

    for (const m of moves) {
        if (!m || m.CardType < 0) continue;

        if (m.GainerOrder === getThisPlayerOrder()) {
            pendingCardMoves.push(m);
            continue;
        }

        for (let i = 0; i < m.Quantity; i++) {
            const gainSprite: anim.TranslatableSprite = new PIXI.Sprite();
            gainSprites.push(gainSprite);

            hand.getCardTexture(m.CardType, gainSprite);

            let avatar: PIXI.Container;
            if (m.GainerOrder >= 0) {
                avatar = players[m.GainerOrder].avatar;
            } else {
                avatar = bankContainer;
            }

            if (avatar) {
                const pos = avatar.getGlobalPosition();
                gainSprite.targetX = pos.x;
                gainSprite.targetY = pos.y;
            }

            let source: PIXI.Container | undefined;

            if (m.Tile) {
                source =
                    board.getBoard().tiles[board.coordStr(m.Tile.Center)]
                        .sprite!;
            } else if (m.GiverOrder == getThisPlayerOrder()) {
                const card = hand.handWindow!.cardSprites[m.CardType][0];
                source = card!;
            } else if (m.GiverOrder >= 0) {
                const player = players[m.GiverOrder]?.avatar;
                if (player) {
                    source = player;
                }
            } else {
                source = bankContainer;
            }

            if (source) {
                const sourcePos = source.getGlobalPosition();
                gainSprite.x = sourcePos.x;
                gainSprite.y = sourcePos.y;
            }

            // Trickery to capture context inside for loop
            gainSprite.pauseAnim = true;
            setTimerForCardAnim(
                source,
                ((gs: any) => () => {
                    gs.pauseAnim = false;
                })(gainSprite),
            );

            canvas.app.stage.addChild(gainSprite);
        }
    }

    anim.requestTranslationAnimation(gainSprites, 6, (sprite) => {
        sprite?.destroy({ children: true });
        canvas.app.markDirty();
    });
}

/**
 * Get the pending card moves
 */
export function getPendingCardMoves() {
    return pendingCardMoves;
}

/**
 * Decrement the pending card moves for this type by one.
 * If there are no more moves, remove the card from the pending moves.
 * @param g card move info
 */
export function deductPendingCardMoves(g: CardMoveInfo) {
    g.Quantity--;
    if (g.Quantity <= 0) {
        pendingCardMoves.splice(pendingCardMoves.indexOf(g), 1);
    }
}

/**
 * Set a timer increasing for a source to separate cards
 * @param source Source of the card
 * @param callback Set pause anim to false in the callback
 * @returns void
 */
export function setTimerForCardAnim(source: any, callback: () => void) {
    if (!source) return callback();

    const s = <{ sourceAnimCount: number }>source;

    if (s.sourceAnimCount === undefined) {
        s.sourceAnimCount = 0;
    }

    s.sourceAnimCount++;

    window.setTimeout(() => {
        s.sourceAnimCount--;
        callback();
    }, s.sourceAnimCount * 75);
}

// If something doesn't go right, clear every 2 seconds
window.setInterval(() => {
    pendingCardMoves = [];
}, 2000);

// Timer values
let timerOverlays: PIXI.Container[] = [];

/**
 * Legacy timer overlay for avatars.
 * Timers are now rendered by the standalone HUD timer widget.
 */
export function renderTimers() {
    if (!container || container.destroyed) return;

    // Ensure old overlays are removed if they were previously created.
    timerOverlays.forEach((s) => (s && !s.destroyed ? s.destroy() : undefined));
    timerOverlays = [];
    canvas.app.markDirty();
}

/**
 * Store the victory points of the current player.
 * These may be hidden from other players in basic complexity.
 * @param vp Victory points
 */
export function setLastKnownSecretVictoryPoints(vp: number) {
    lastKnownSecretVictoryPoints = vp;
}

/**
 * Render the barbarian sprites
 * @param gs Game state
 */
function renderBarbarian(gs: GameState) {
    if (gs.BarbarianPosition === -1) {
        return;
    }

    if (!barbarianContainer || barbarianContainer.destroyed) {
        barbarianContainer = new PIXI.Container();
        canvas.app.stage.addChild(barbarianContainer);

        const trackSprite = new PIXI.Sprite();
        assets.assignTexture(trackSprite, assets.barbarianTrack);
        barbarianContainer.x = 20;
        barbarianContainer.y = 60;
        barbarianContainer.addChild(trackSprite);
        trackSprite.scale.set(60 / trackSprite.width);

        barbarianSprite = new PIXI.Container();
        const shipSprite = new PIXI.Sprite();
        assets.assignTexture(shipSprite, assets.barbarianShip);
        shipSprite.scale.set(0.25);
        barbarianSprite.addChild(shipSprite);
        barbarianSprite.x = 30;
        barbarianSprite.pivot.x = shipSprite.width / 2;
        barbarianSprite.pivot.y = shipSprite.height * 0.8;
        barbarianContainer.addChild(barbarianSprite);
    }

    barbarianSprite.targetY = (1030 - 70 - gs.BarbarianPosition * 126) * 0.33;
    anim.requestTranslationAnimation([barbarianSprite]);

    if (barbarianStrength && !barbarianStrength.destroyed) {
        barbarianStrength?.destroy({ children: true });
        barbarianKnights?.destroy({ children: true });
    }

    {
        const style = new PIXI.TextStyle({
            fontSize: 13,
            fill: 0xffffff,
            align: "center",
        });

        {
            // Barbarian strength
            barbarianStrength = new PIXI.Sprite();
            barbarianStrength.x = 35;

            const text = new PIXI.Text(`${gs.BarbarianStrength}`, style);
            barbarianStrength.addChild(text);
            text.x = 10;
            text.y = 10;
            text.anchor.x = 0.5;
            text.anchor.y = 0.5;

            const g = new PIXI.Graphics()
                .beginFill(0x444444)
                .drawRoundedRect(0, 0, 20, 20, 4)
                .endFill();
            barbarianStrength.texture = canvas.app.generateRenderTexture(g);
            barbarianSprite.addChild(barbarianStrength);
        }

        {
            // Barbarian knights
            barbarianKnights = new PIXI.Sprite();
            barbarianKnights.x = 58;

            const text = new PIXI.Text(`${gs.BarbarianKnights}`, style);
            barbarianKnights.addChild(text);
            text.x = 10;
            text.y = 10;
            text.anchor.x = 0.5;
            text.anchor.y = 0.5;

            const g = new PIXI.Graphics()
                .beginFill(
                    gs.BarbarianKnights < gs.BarbarianStrength
                        ? 0xaa0000
                        : 0x00aa00,
                )
                .drawRoundedRect(0, 0, 20, 20, 4)
                .endFill();
            barbarianKnights.texture = canvas.app.generateRenderTexture(g);
            barbarianSprite.addChild(barbarianKnights);
        }
    }
}

/**
 * Spectator sprite set
 */
let spectators: {
    container: PIXI.Container;
    icon: PIXI.Sprite;
    text: PIXI.Text;
    tooltip: windows.TooltipHandler;
};

/**
 * Render the spectators icon and tooltip
 * @param list List of spectator usernames
 */
export function renderSpectators(list: string[]) {
    if (!spectators || spectators.icon.destroyed) {
        const container = new PIXI.Container();
        spectators = {
            container: container,
            icon: new PIXI.Sprite(),
            text: new PIXI.Text(
                "",
                new PIXI.TextStyle({
                    fontSize: 20,
                }),
            ),
            tooltip: new windows.TooltipHandler(container, ""),
        };

        assets.assignTexture(spectators.icon, assets.spectate);
        spectators.icon.scale.set(0.3);
        spectators.icon.y = 6;
        spectators.text.x = 35;

        container.addChild(spectators.icon);
        container.addChild(spectators.text);
        const pos = computeSpectatorsPosition({
            canvasHeight: canvas.getHeight(),
        });
        container.x = pos.x;
        container.y = pos.y;
        container.zIndex = 1;
        container.interactive = true;
        canvas.app.stage.addChild(container);
    }

    spectators.container.visible = list.length > 0;
    spectators.text.text = String(list.length);
    spectators.tooltip.message = `${list.join(", ")} ${
        list.length > 1 ? "are" : "is"
    } spectating`;
    spectators.tooltip.hide();
    canvas.app.markDirty();
}
