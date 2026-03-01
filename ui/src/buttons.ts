import * as PIXI from "pixi.js";
import * as canvas from "./canvas";
import * as trade from "./trade";
import * as ws from "./ws";
import * as state from "./state";
import * as dice from "./dice";
import * as actions from "./actions";
import * as assets from "./assets";
import * as windows from "./windows";
import {
    computeActionBarPosition,
    computeDicePosition,
    computeSpecialBuildPosition,
} from "./hudLayout";
import { buildHUDLayout } from "./hud/layoutEngine";
import type { HUDLayoutResult } from "./hud/types";
import { BuildableType, CardType } from "./entities";
import CommandHub from "./commands";
import { PlayerSecretState } from "../tsg";
import { hexToUrlString } from "../utils";
import {
    getTurnTimerView,
    resetTurnTimerRuntime,
} from "./store/turnTimerRuntime";
import {
    getActionBarConfig,
    getBottomDockConfig,
    getHudMiscConfig,
} from "./uiConfig";
import {
    createDockRail,
    createDockSlot,
    createPanelBodyTextStyle,
    createPanelTitleTextStyle,
} from "./uiDock";

/** Main button container */
export let container: PIXI.Container;

/** Secondary button container */
let container1: PIXI.Container;
let seafarersShipContainer: PIXI.Container | null = null;
let turnTimerContainer: PIXI.Container | null = null;
let turnTimerText: PIXI.Text | null = null;
let timerTickerStarted = false;

/** Static button sprites */
export let buttons: {
    buildSettlement: ButtonSprite;
    buildRoad: ButtonSprite;
    buildShip?: ButtonSprite;
    moveShip?: ButtonSprite;
    buildCity: ButtonSprite;
    buyDevelopmentCard?: ButtonSprite;
    openKnightBox?: ButtonSprite;
    endTurn: ButtonSprite;

    knightBox?: {
        container: PIXI.Sprite;
        buildKnight: ButtonSprite;
        activateKnight: ButtonSprite;
        robberKnight: ButtonSprite;
        moveKnight: ButtonSprite;
    };
    openImproveBox?: ButtonSprite;
    improveBox?: {
        container: PIXI.Sprite;
        paper: ButtonSprite;
        cloth: ButtonSprite;
        coin: ButtonSprite;
        callback?: (c: CardType) => void;
    };

    buildWall?: ButtonSprite;
    specialBuild?: ButtonSprite;
};

function getButtonWidth() {
    return getActionBarConfig().buttonWidth;
}

function getButtonInset() {
    return getActionBarConfig().buttonInset;
}

function getButtonSpacing() {
    return getActionBarConfig().buttonSpacing;
}

function getCountWidth() {
    return getActionBarConfig().countWidth;
}

function getCountHeight() {
    return getActionBarConfig().countHeight;
}

function getCountFontSize() {
    return getActionBarConfig().countFontSize;
}

function getActionBarHeight() {
    return getActionBarConfig().height;
}

const actionBarWidth = () =>
    getButtonInset() * 2 +
    getButtonSpacing() * 4 +
    getButtonWidth();

function createDockBackground(
    width: number,
    height: number,
    slotIndexes: number[],
    accentSlotIndex?: number,
) {
    const container = createDockRail({ width, height });
    const inset = getButtonInset();
    const buttonWidth = getButtonWidth();

    slotIndexes.forEach((slotIndex) => {
        const slotX = inset + getButtonSpacing() * slotIndex - 4;
        container.addChild(
            createDockSlot({
                x: slotX,
                y: 8,
                width: buttonWidth + 8,
                height: height - 16,
                active: accentSlotIndex === slotIndex,
            }),
        );
    });

    return container;
}

function formatSeconds(seconds: number) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
}

function ensureTurnTimerWidget() {
    if (turnTimerContainer && !turnTimerContainer.destroyed) {
        return;
    }

    const misc = getHudMiscConfig();
    const bottomDock = getBottomDockConfig();
    const timer = bottomDock.timer;
    const timerWidth = misc.timerWidth;
    const timerHeight = misc.timerHeight;

    turnTimerContainer = new PIXI.Container();
    turnTimerContainer.zIndex = 1300;
    const timerBg = new PIXI.Graphics();
    timerBg.lineStyle({ color: timer.border, width: 2 });
    timerBg.beginFill(timer.fill, 0.98);
    timerBg.drawRoundedRect(0, 0, timerWidth, timerHeight, 10);
    timerBg.endFill();
    turnTimerContainer.addChild(timerBg);

    turnTimerText = new PIXI.Text(
        "--:--",
        createPanelTitleTextStyle({
            fontSize: 13,
            fill: timer.text,
        }),
    );
    turnTimerText.anchor.set(0.5);
    turnTimerText.x = Math.round(timerWidth / 2);
    turnTimerText.y = Math.round(timerHeight / 2);
    turnTimerContainer.addChild(turnTimerText);

    canvas.app.stage.addChild(turnTimerContainer);
}

function updateTurnTimerWidget() {
    if (
        !turnTimerContainer ||
        turnTimerContainer.destroyed ||
        !turnTimerText
    ) {
        return;
    }

    const computed = getTurnTimerView(Date.now());

    turnTimerText.text =
        computed.displaySeconds === null
            ? "--:--"
            : formatSeconds(computed.displaySeconds);
    canvas.app.markDirty();
}

function ensurePauseToggleWidget(commandHub: CommandHub) {
    // Pause/resume now lives in the settings menu.
    void commandHub;
}

export function updatePauseToggle(paused: boolean) {
    void paused;
}

export function relayout() {
    if (!container || container.destroyed) {
        return;
    }

    applyHUDLayout(
        buildHUDLayout({
            canvasWidth: canvas.getWidth(),
            canvasHeight: canvas.getHeight(),
            ...state.getHUDLayoutContext(),
            ...dice.getDiceLayoutMetrics(),
        }),
    );
    updateTurnTimerWidget();

    canvas.app.markDirty();
}

export function applyHUDLayout(layout: HUDLayoutResult) {
    const buttonState = buttons;
    const actionBarFrame = layout.widgets.actionBar;
    const secondaryFrame = layout.widgets.actionBarSecondary;
    const shipsFrame = layout.widgets.actionBarShips;
    const boxFrame = layout.widgets.knightBox;
    const specialBuildFrame = layout.widgets.specialBuild;
    const timerFrame = layout.widgets.turnTimer;

    if (container && !container.destroyed && actionBarFrame) {
        container.x = actionBarFrame.x;
        container.y = actionBarFrame.y;
    }
    if (container1 && !container1.destroyed && secondaryFrame) {
        container1.x = secondaryFrame.x;
        container1.y = secondaryFrame.y;
    }
    if (seafarersShipContainer && !seafarersShipContainer.destroyed && shipsFrame) {
        seafarersShipContainer.x = shipsFrame.x;
        seafarersShipContainer.y = shipsFrame.y;
    }
    if (
        buttonState?.knightBox?.container &&
        !buttonState.knightBox.container.destroyed &&
        boxFrame
    ) {
        buttonState.knightBox.container.x = boxFrame.x;
        buttonState.knightBox.container.y = boxFrame.y;
    }
    if (
        buttonState?.improveBox?.container &&
        !buttonState.improveBox.container.destroyed &&
        boxFrame
    ) {
        buttonState.improveBox.container.x = boxFrame.x;
        buttonState.improveBox.container.y = boxFrame.y;
    }
    if (
        buttonState?.specialBuild &&
        !buttonState.specialBuild.destroyed &&
        specialBuildFrame
    ) {
        buttonState.specialBuild.x = specialBuildFrame.x;
        buttonState.specialBuild.y = specialBuildFrame.y;
    }
    if (turnTimerContainer && !turnTimerContainer.destroyed && timerFrame) {
        turnTimerContainer.x = timerFrame.x;
        turnTimerContainer.y = timerFrame.y;
    }
}

export enum ButtonType {
    Yes = "yes",
    No = "no",
    Settlement = "settlement",
    City = "city",
    Road = "road",
    Ship = "ship",
    MoveShip = "move_ship",
    DevelopmentCard = "dcard",
    KnightBox = "knight",
    KnightBuild = "knight_build",
    KnightActivate = "knight_activate",
    KnightRobber = "knight_robber",
    KnightMove = "knight_move",
    CityImprove = "improve",
    CityImprovePaper = "improve_paper",
    CityImproveCloth = "improve_cloth",
    CityImproveCoin = "improve_coin",
    Wall = "w",
    EndTurn = "endturn",
    SpecialBuild = "specialbuild",
    Edit = "edit",
    Fullscreen = "fullscreen",
    Chat = "chat",
}

/** Counts for number of buildables left */
export const buttonCounts: {
    [key in ButtonType]?: { sprite: PIXI.Sprite; text: PIXI.Text };
} = {};

export type ButtonSprite = PIXI.Sprite & {
    setBgColor?: (color: string) => void;
    setEnabled: (enabled: boolean | undefined, tintOnly?: boolean) => void;
    onClick: (callback: ((button: ButtonSprite) => void) | undefined) => void;
    reactDisable?: boolean;
    reEnableTimer?: number;
    tooltip?: windows.TooltipHandler;
};

/** Invalidate cache */
function rerender() {
    // Originally: invalidate bitmap cache
}

function isPlayerPieceButton(type: ButtonType) {
    return (
        type === ButtonType.Settlement ||
        type === ButtonType.City ||
        type === ButtonType.Road ||
        type === ButtonType.Ship
    );
}

function getPlayerPieceButtonAsset(type: ButtonType, bgColor?: string) {
    if (!bgColor || !isPlayerPieceButton(type)) {
        return undefined;
    }

    const cText = hexToUrlString(bgColor);
    switch (type) {
        case ButtonType.Settlement:
            return assets.house[cText];
        case ButtonType.City:
            return assets.city[cText];
        case ButtonType.Road:
            return assets.road[cText];
        case ButtonType.Ship:
            return assets.ship[cText];
        default:
            return undefined;
    }
}

function getPlayerPieceButtonScale(
    type: ButtonType,
    simg: assets.AssetImage,
    width: number,
    height: number,
    iconScaleMultiplier = 1,
) {
    switch (type) {
        case ButtonType.Settlement:
            return (
                Math.min(
                    (width * 0.62) / simg.width,
                    (height * 0.62) / simg.height,
                ) * iconScaleMultiplier
            );
        case ButtonType.City:
            return (
                Math.min(
                    (width * 0.72) / simg.width,
                    (height * 0.72) / simg.height,
                ) * iconScaleMultiplier
            );
        case ButtonType.Road:
            return (
                Math.min(
                    (width * 0.12) / simg.width,
                    (height * 0.48) / simg.height,
                ) * iconScaleMultiplier
            );
        case ButtonType.Ship:
            return (
                Math.min(
                    (width * 0.62) / simg.width,
                    (height * 0.74) / simg.height,
                ) * iconScaleMultiplier
            );
        default:
            return iconScaleMultiplier;
    }
}

/**
 * Create a new button sprite
 * @param type button type
 * @param width width of button
 * @param height height of button
 * @param bgColor background color of button
 * @param done callback when button graphic is initialized
 * @param mask shape of button mask
 * @returns
 */
export function getButtonSprite(
    type: ButtonType,
    width: number,
    height?: number,
    bgColor?: string,
    done?: () => void,
    mask: "circle" | "rounded-rect" = "rounded-rect",
    iconScaleMultiplier = 1,
): ButtonSprite {
    const s = new PIXI.Sprite();
    const outer = <ButtonSprite>s;
    s.interactive = true;
    outer.setEnabled = (enabled: boolean | undefined, tintOnly?: boolean) => {
        if (outer.reEnableTimer) {
            window.clearTimeout(outer.reEnableTimer);
            outer.reEnableTimer = 0;
        }
        setButtonEnabled(outer, Boolean(enabled), tintOnly);
        outer.tooltip?.hide();
    };

    outer.onClick = (callback) => {
        outer.on("pointerdown", (e) => {
            if (outer.cursor !== "pointer") {
                return;
            }

            if (outer.tooltip) {
                outer.tooltip.hide();
            }

            if (outer.cursor === "pointer" && outer.reactDisable) {
                // is enabled
                setButtonEnabled(outer, false);
                outer.reEnableTimer = window.setTimeout(() => {
                    if (!outer.destroyed) {
                        setButtonEnabled(outer, true);
                    }
                }, 2000);
            }

            e.stopPropagation();
            callback?.(outer);
        });
    };

    const playerPieceButtonAsset = getPlayerPieceButtonAsset(type, bgColor);
    const playerPieceButton = Boolean(playerPieceButtonAsset);
    const simg = playerPieceButtonAsset || assets.buttons[type];
    const devCardButton = type === ButtonType.DevelopmentCard;
    const h =
        height ||
        (playerPieceButton || devCardButton
            ? width
            : (width / simg.width) * simg.height);

    const drawShape = (g: PIXI.Graphics) => {
        switch (mask) {
            case "rounded-rect":
                g.drawRoundedRect(
                    0,
                    0,
                    simg.width,
                    simg.height,
                    simg.width / 10,
                );
                break;
            case "circle":
                g.drawCircle(
                    simg.width / 2,
                    simg.width / 2,
                    Math.min(simg.width, simg.width) / 2,
                );
                break;
        }
    };

    const bg = new PIXI.Sprite();
    bg.scale.set(width / simg.width, h / simg.height);
    outer.addChild(bg);

    outer.setBgColor = (color: string) => {
        const cText = hexToUrlString(color);
        assets.assignTexture(bg, assets.buttonsBg[cText], () => {
            const g = new PIXI.Graphics();
            g.beginTextureFill({
                texture: bg.texture,
            });
            drawShape(g);
            g.endFill();
            bg.texture = canvas.app.generateRenderTexture(g);
        });
    };

    if (bgColor) {
        outer.setBgColor(bgColor);
    }

    const image = new PIXI.Sprite();
    outer.addChild(image);
    assets.assignTexture(image, simg, () => {
        if (!playerPieceButton) {
            if (devCardButton) {
                const inset = 6;
                const scale = Math.min(
                    (width - inset * 2) / simg.width,
                    (h - inset * 2) / simg.height,
                );
                image.scale.set(scale);
                image.x = (width - simg.width * scale) / 2;
                image.y = (h - simg.height * scale) / 2;
                return;
            }

            const g = new PIXI.Graphics();
            g.beginTextureFill({ texture: image.texture });
            drawShape(g);
            g.endFill();
            image.texture = canvas.app.generateRenderTexture(g);
            return;
        }

        const scale = getPlayerPieceButtonScale(
            type,
            simg,
            width,
            h,
            iconScaleMultiplier,
        );
        image.scale.set(scale);
        image.x = (width - simg.width * scale) / 2;
        image.y = (h - simg.height * scale) / 2;
    });
    if (!playerPieceButton && !devCardButton) {
        if (type === ButtonType.Road) {
            // Road asset is very tall; keep aspect ratio so it doesn't get stretched wide.
            const displayHeight = height || width;
            const scale = Math.min(
                (width * 0.288) / simg.width,
                (displayHeight * 0.72) / simg.height,
            );
            image.scale.set(scale);
            image.x = (width - simg.width * scale) / 2;
            image.y = (displayHeight - simg.height * scale) / 2;
        } else {
            image.scale.set(width / simg.width, h / simg.height);
        }
    }
    image.zIndex = 1;

    outer.setEnabled(outer.cursor === "pointer");

    if (!bgColor) {
        done?.();
    }

    return outer;
}

/**
 * Create count sprite for button
 * @param width width of count
 * @param height height of count
 * @param fontsize font size of count
 */
export function getCountSprite(
    width: number,
    height: number,
    fontsize: number,
) {
    const bottomDock = getBottomDockConfig();
    const sprite = new PIXI.Sprite();
    const g = new PIXI.Graphics()
        .beginFill(bottomDock.chip.fill)
        .drawRoundedRect(0, 0, width, height, bottomDock.chip.radius)
        .endFill();
    sprite.texture = canvas.app.generateRenderTexture(g);

    const text = new PIXI.Text(
        "0",
        createPanelBodyTextStyle({
            fontSize: fontsize,
            fill: bottomDock.chip.text,
            align: "center",
        }),
    );
    text.y = height / 2;
    text.x = -width / 2;
    text.zIndex = 2;
    text.anchor.x = 0.5;
    text.anchor.y = 0.5;
    sprite.addChild(text);

    return { sprite, text };
}

/**
 * Render all the buttons.
 * Since this depends on game mode, must be called
 * only after state is initialized
 * @param commandHub Command hub
 */
export function render(commandHub: CommandHub) {
    const lks = state.lastKnownStates?.[ws.getThisPlayerOrder()];
    resetTurnTimerRuntime();

    // Initialize sprites
    container = new PIXI.Container();
    buttons = {} as any;
    container.visible = !ws.isSpectator();

    // Get player's color
    const playerColor = lks?.Color || "#ff0000";

    // Container
    canvas.app.stage.addChild(container);
    container.on("removed", () => {
        state.lastKnownStates?.splice(0, state.lastKnownStates.length);
    });

    // Monkey patch to rerender
    const rerenderAnd = (callback: () => void) => () => {
        rerender();
        callback();
    };
    const rerenderBuildToggleAnd =
        (target: Parameters<typeof state.togglePendingBuildPlacement>[0], callback: () => void) =>
        () => {
            rerender();
            if (state.togglePendingBuildPlacement(target)) {
                return;
            }
            if (state.hasPendingBuildPlacement()) {
                // Switch selection: cancel current placement, then request new build.
                actions.cancelPendingAction();
                window.setTimeout(callback, 0);
                return;
            }
            callback();
        };

    container.addChild(
        createDockBackground(actionBarWidth(), getActionBarHeight(), [0, 1, 2, 3, 4], 4),
    );
    const actionBarPos = computeActionBarPosition({
        canvasWidth: canvas.getWidth(),
        canvasHeight: canvas.getHeight(),
    });
    container.x = actionBarPos.x;
    container.y = actionBarPos.y;
    ensureTurnTimerWidget();
    ensurePauseToggleWidget(commandHub);
    if (!timerTickerStarted) {
        timerTickerStarted = true;
        window.setInterval(updateTurnTimerWidget, 1000);
    }

    // Build settlement
    {
        buttons.buildSettlement = getButtonSprite(
            ButtonType.Settlement,
            getButtonWidth(),
            0,
            undefined,
            rerender,
        );
        buttons.buildSettlement.interactive = true;
        buttons.buildSettlement.cursor = "pointer";
        buttons.buildSettlement.reactDisable = false;
        buttons.buildSettlement.x = getButtonInset();
        buttons.buildSettlement.y = getButtonInset();
        buttons.buildSettlement.zIndex = 10;
        buttons.buildSettlement.onClick(
            rerenderBuildToggleAnd("s", commandHub.buildSettlement),
        );
        container.addChild(buttons.buildSettlement);
        const cs = getCountSprite(
            getCountWidth(),
            getCountHeight(),
            getCountFontSize(),
        );
        buttonCounts[ButtonType.Settlement] = cs;
        cs.sprite.anchor.x = 1;
        cs.sprite.x = getButtonWidth();
        cs.sprite.zIndex = 10;
        buttons.buildSettlement.sortableChildren = true;
        buttons.buildSettlement.addChild(cs.sprite);
        buttons.buildSettlement.tooltip = new windows.TooltipHandler(
            buttons.buildSettlement,
            "Build a village",
        ).setCards([1, 2, 3, 4]);
    }

    // Build city
    {
        buttons.buildCity = getButtonSprite(
            ButtonType.City,
            getButtonWidth(),
            0,
            undefined,
            rerender,
        );
        buttons.buildCity.interactive = true;
        buttons.buildCity.cursor = "pointer";
        buttons.buildCity.reactDisable = false;
        buttons.buildCity.x = getButtonInset() + getButtonSpacing() * 1;
        buttons.buildCity.y = getButtonInset();
        buttons.buildCity.zIndex = 10;
        buttons.buildCity.onClick(
            rerenderBuildToggleAnd("c", commandHub.buildCity),
        );
        container.addChild(buttons.buildCity);
        const cs = getCountSprite(
            getCountWidth(),
            getCountHeight(),
            getCountFontSize(),
        );
        buttonCounts[ButtonType.City] = cs;
        cs.sprite.anchor.x = 1;
        cs.sprite.x = getButtonWidth();
        cs.sprite.zIndex = 10;
        buttons.buildCity.sortableChildren = true;
        buttons.buildCity.addChild(cs.sprite);
        buttons.buildCity.tooltip = new windows.TooltipHandler(
            buttons.buildCity,
            "Build a town",
        ).setCards([4, 4, 5, 5, 5]);
    }

    // Build road
    {
        buttons.buildRoad = getButtonSprite(
            ButtonType.Road,
            getButtonWidth(),
            0,
            undefined,
            rerender,
        );
        buttons.buildRoad.interactive = true;
        buttons.buildRoad.cursor = "pointer";
        buttons.buildRoad.reactDisable = false;
        buttons.buildRoad.x = getButtonInset() + getButtonSpacing() * 2;
        buttons.buildRoad.y = getButtonInset();
        buttons.buildRoad.zIndex = 10;
        buttons.buildRoad.onClick(
            rerenderBuildToggleAnd("r", commandHub.buildRoad),
        );
        container.addChild(buttons.buildRoad);
        const cs = getCountSprite(
            getCountWidth(),
            getCountHeight(),
            getCountFontSize(),
        );
        buttonCounts[ButtonType.Road] = cs;
        cs.sprite.anchor.x = 1;
        cs.sprite.x = getButtonWidth();
        cs.sprite.zIndex = 10;
        buttons.buildRoad.sortableChildren = true;
        buttons.buildRoad.addChild(cs.sprite);
        buttons.buildRoad.tooltip = new windows.TooltipHandler(
            buttons.buildRoad,
            "Build a road",
        ).setCards([1, 2]);
    }

    // Buy Development Card
    if (state.settings.Mode == state.GameMode.Base) {
        buttons.buyDevelopmentCard = getButtonSprite(
            ButtonType.DevelopmentCard,
            getButtonWidth(),
            0,
            undefined,
            rerender,
        );
        buttons.buyDevelopmentCard.interactive = true;
        buttons.buyDevelopmentCard.cursor = "pointer";
        buttons.buyDevelopmentCard.reactDisable = true;
        buttons.buyDevelopmentCard.x = getButtonInset() + getButtonSpacing() * 3;
        buttons.buyDevelopmentCard.y = getButtonInset();
        buttons.buyDevelopmentCard.zIndex = 10;
        buttons.buyDevelopmentCard.onClick(
            rerenderAnd(commandHub.buyDevelopmentCard),
        );
        container.addChild(buttons.buyDevelopmentCard);
        buttons.buyDevelopmentCard.tooltip = new windows.TooltipHandler(
            buttons.buyDevelopmentCard,
            "Buy an action card",
        ).setCards([3, 4, 5]);
    }

    if (state.settings.Mode == state.GameMode.Seafarers) {
        buttons.buyDevelopmentCard = getButtonSprite(
            ButtonType.DevelopmentCard,
            getButtonWidth(),
            0,
            undefined,
            rerender,
        );
        buttons.buyDevelopmentCard.interactive = true;
        buttons.buyDevelopmentCard.cursor = "pointer";
        buttons.buyDevelopmentCard.reactDisable = true;
        buttons.buyDevelopmentCard.x = getButtonInset() + getButtonSpacing() * 3;
        buttons.buyDevelopmentCard.y = getButtonInset();
        buttons.buyDevelopmentCard.zIndex = 10;
        buttons.buyDevelopmentCard.onClick(
            rerenderAnd(commandHub.buyDevelopmentCard),
        );
        container.addChild(buttons.buyDevelopmentCard);
        buttons.buyDevelopmentCard.tooltip = new windows.TooltipHandler(
            buttons.buyDevelopmentCard,
            "Buy an action card",
        ).setCards([3, 4, 5]);
    }

    if (state.settings.Mode == state.GameMode.Seafarers) {
        seafarersShipContainer = new PIXI.Container();
        seafarersShipContainer.addChild(
            createDockBackground(
                getButtonSpacing() * 1 + getButtonWidth() + 2 * getButtonInset(),
                getActionBarHeight(),
                [0, 1],
            ),
        );
        seafarersShipContainer.zIndex = 1300;
        seafarersShipContainer.visible = !ws.isSpectator();
        const dicePos = computeDicePosition({
            canvasWidth: canvas.getWidth(),
            canvasHeight: canvas.getHeight(),
            diceWidth: 138,
            diceHeight: 64,
            actionBarTop: container.y,
            playerPanel: state.getPlayerPanelBounds(),
        });
        const gap = 10;
        seafarersShipContainer.x =
            dicePos.x - seafarersShipContainer.width - gap;
        seafarersShipContainer.y =
            container.y - getActionBarHeight() - getActionBarConfig().stackGap;
        canvas.app.stage.addChild(seafarersShipContainer);

        buttons.buildShip = getButtonSprite(
            ButtonType.Ship,
            getButtonWidth(),
            0,
            undefined,
            rerender,
        );
        buttons.buildShip.interactive = true;
        buttons.buildShip.cursor = "pointer";
        buttons.buildShip.reactDisable = false;
        buttons.buildShip.x = getButtonInset();
        buttons.buildShip.y = getButtonInset();
        buttons.buildShip.zIndex = 10;
        buttons.buildShip.onClick(
            rerenderBuildToggleAnd("sh", commandHub.buildShip),
        );
        seafarersShipContainer.addChild(buttons.buildShip);
        const cs = getCountSprite(
            getCountWidth(),
            getCountHeight(),
            getCountFontSize(),
        );
        buttonCounts[ButtonType.Ship] = cs;
        cs.sprite.anchor.x = 1;
        cs.sprite.x = getButtonWidth();
        cs.sprite.zIndex = 10;
        buttons.buildShip.sortableChildren = true;
        buttons.buildShip.addChild(cs.sprite);
        buttons.buildShip.tooltip = new windows.TooltipHandler(
            buttons.buildShip,
            "Build a ship",
        ).setCards([1, 3]);

        buttons.moveShip = getButtonSprite(
            ButtonType.MoveShip,
            getButtonWidth(),
            0,
            undefined,
            rerender,
        );
        buttons.moveShip.interactive = true;
        buttons.moveShip.cursor = "pointer";
        buttons.moveShip.reactDisable = false;
        buttons.moveShip.x = getButtonInset() + getButtonSpacing() * 1;
        buttons.moveShip.y = getButtonInset();
        buttons.moveShip.zIndex = 10;
        buttons.moveShip.onClick(
            rerenderBuildToggleAnd("ms", commandHub.moveShip),
        );
        seafarersShipContainer.addChild(buttons.moveShip);
        buttons.moveShip.tooltip = new windows.TooltipHandler(
            buttons.moveShip,
            "Move one open-ended ship before rolling dice",
        );
    }

    // Build wall
    if (state.settings.Mode == state.GameMode.CitiesAndKnights) {
        buttons.buildWall = getButtonSprite(
            ButtonType.Wall,
            getButtonWidth(),
            0,
            undefined,
            rerender,
        );
        buttons.buildWall.interactive = true;
        buttons.buildWall.cursor = "pointer";
        buttons.buildWall.reactDisable = false;
        buttons.buildWall.x = getButtonInset() + getButtonSpacing() * 3;
        buttons.buildWall.y = getButtonInset();
        buttons.buildWall.zIndex = 10;
        buttons.buildWall.onClick(
            rerenderBuildToggleAnd("w", commandHub.buildWall),
        );
        container.addChild(buttons.buildWall);
        const cs = getCountSprite(
            getCountWidth(),
            getCountHeight(),
            getCountFontSize(),
        );
        buttonCounts[ButtonType.Wall] = cs;
        cs.sprite.anchor.x = 1;
        cs.sprite.x = getButtonWidth();
        cs.sprite.zIndex = 10;
        buttons.buildWall.sortableChildren = true;
        buttons.buildWall.addChild(cs.sprite);
        buttons.buildWall.tooltip = new windows.TooltipHandler(
            buttons.buildWall,
            "Buy a town fence",
        ).setCards([2, 2]);
    }

    // Second container
    if (state.settings.Mode == state.GameMode.CitiesAndKnights) {
        container1 = new PIXI.Container();
        container1.addChild(
            createDockBackground(
                getButtonSpacing() * 1 + getButtonWidth() + 2 * getButtonInset(),
                getActionBarHeight(),
                [0, 1],
            ),
        );

        container1.x = container.x + getButtonSpacing() * 1 - 18;
        container1.y =
            container.y - getActionBarHeight() - getActionBarConfig().stackGap;
        container1.zIndex = 1300;
        container1.visible = !ws.isSpectator();
        canvas.app.stage.addChild(container1);
    }

    // Knight Box
    if (state.settings.Mode == state.GameMode.CitiesAndKnights) {
        buttons.openKnightBox = getButtonSprite(
            ButtonType.KnightBox,
            getButtonWidth(),
            0,
            undefined,
            rerender,
        );
        buttons.openKnightBox.setEnabled(true);
        buttons.openKnightBox.x = getButtonInset();
        buttons.openKnightBox.y = getButtonInset();
        buttons.openKnightBox.zIndex = 10;
        buttons.openKnightBox.onClick(() => {
            if (buttons.knightBox?.container) {
                buttons.knightBox.container.visible =
                    !buttons.knightBox.container.visible;
                if (
                    buttons.knightBox.container.visible &&
                    buttons.improveBox?.container
                ) {
                    buttons.improveBox.container.visible = false;
                }
            }
            canvas.app.markDirty();
        });
        container1.addChild(buttons.openKnightBox);
        buttons.openKnightBox.tooltip = new windows.TooltipHandler(
            buttons.openKnightBox,
            "Build, upgrade, activate and use Warriors",
        );

        // Knight box
        const kbc = createDockBackground(
            getButtonSpacing() * 3 + getButtonInset() * 2 + getButtonWidth(),
            getActionBarHeight(),
            [0, 1, 2, 3],
        );
        kbc.x = container.x;
        kbc.y =
            container1.y - getActionBarHeight() - getActionBarConfig().stackGap;
        kbc.zIndex = 1400;
        kbc.visible = false;
        canvas.app.stage.addChild(kbc);
        buttons.knightBox = {
            container: kbc,
        } as any;

        {
            // Knight build
            const b = getButtonSprite(
                ButtonType.KnightBuild,
                getButtonWidth(),
                0,
                undefined,
                rerender,
            );
            buttons.knightBox!.buildKnight = b;
            b.interactive = true;
            b.cursor = "pointer";
            b.x = getButtonInset();
            b.y = getButtonInset();
            b.zIndex = 10;
            b.onClick(rerenderBuildToggleAnd("k", commandHub.buildKnight));
            kbc.addChild(b);
            b.tooltip = new windows.TooltipHandler(
                b,
                "Build or upgrade a warrior",
            ).setCards([3, 5]);
        }

        {
            // Knight activate
            const b = getButtonSprite(
                ButtonType.KnightActivate,
                getButtonWidth(),
                0,
                undefined,
                rerender,
            );
            buttons.knightBox!.activateKnight = b;
            b.interactive = true;
            b.cursor = "pointer";
            b.reactDisable = false;
            b.x = getButtonInset() + getButtonSpacing() * 1;
            b.y = getButtonInset();
            b.zIndex = 10;
            b.onClick(
                rerenderBuildToggleAnd("ka", commandHub.activateKnight),
            );
            kbc.addChild(b);
            b.tooltip = new windows.TooltipHandler(
                b,
                "Activate a warrior",
            ).setCards([4]);
        }

        {
            // Knight robber
            const b = getButtonSprite(
                ButtonType.KnightRobber,
                getButtonWidth(),
                0,
                undefined,
                rerender,
            );
            buttons.knightBox!.robberKnight = b;
            b.interactive = true;
            b.cursor = "pointer";
            b.reactDisable = false;
            b.x = getButtonInset() + getButtonSpacing() * 2;
            b.y = getButtonInset();
            b.zIndex = 10;
            b.onClick(
                rerenderBuildToggleAnd("kr", commandHub.robberKnight),
            );
            kbc.addChild(b);
            b.tooltip = new windows.TooltipHandler(
                b,
                "Chase away the robber using a warrior",
            );
        }

        {
            // Knight move
            const b = getButtonSprite(
                ButtonType.KnightMove,
                getButtonWidth(),
                0,
                undefined,
                rerender,
            );
            buttons.knightBox!.moveKnight = b;
            b.interactive = true;
            b.cursor = "pointer";
            b.reactDisable = false;
            b.x = getButtonInset() + getButtonSpacing() * 3;
            b.y = getButtonInset();
            b.zIndex = 10;
            b.onClick(rerenderBuildToggleAnd("km", commandHub.moveKnight));
            kbc.addChild(b);
            b.tooltip = new windows.TooltipHandler(
                b,
                "Move a warrior to a different position",
            );
        }
    }

    // City improvement
    if (state.settings.Mode == state.GameMode.CitiesAndKnights) {
        const b = getButtonSprite(
            ButtonType.CityImprove,
            getButtonWidth(),
            0,
            undefined,
            rerender,
        );
        buttons.openImproveBox = b;
        b.setEnabled(true);
        b.x = getButtonInset() + getButtonSpacing();
        b.y = getButtonInset();
        b.zIndex = 10;
        b.onClick(() => {
            if (buttons.improveBox?.container) {
                buttons.improveBox.container.visible =
                    !buttons.improveBox.container.visible;
                if (
                    buttons.improveBox.container.visible &&
                    buttons.knightBox?.container
                ) {
                    buttons.knightBox.container.visible = false;
                }
            }
            canvas.app.markDirty();
        });
        container1.addChild(b);
        b.tooltip = new windows.TooltipHandler(
            b,
            "Build improvements and wonders",
        );

        const ibc = createDockBackground(
            getButtonSpacing() * 2 + getButtonWidth() + 2 * getButtonInset(),
            getActionBarHeight(),
            [0, 1, 2],
        );
        ibc.x = container.x;
        ibc.y =
            container1.y - getActionBarHeight() - getActionBarConfig().stackGap;
        ibc.zIndex = 1400;
        ibc.visible = false;
        canvas.app.stage.addChild(ibc);
        buttons.improveBox = {
            container: ibc,
        } as any;

        const clickImprove = (c: CardType) => {
            if (buttons.improveBox?.callback) {
                buttons.improveBox.callback(c);
            } else {
                commandHub.buildCityImprovement(c);
            }
        };

        {
            // Paper
            const b = getButtonSprite(
                ButtonType.CityImprovePaper,
                getButtonWidth(),
                0,
                undefined,
                rerender,
            );
            buttons.improveBox!.paper = b;
            b.interactive = true;
            b.cursor = "pointer";
            b.reactDisable = false;
            b.x = getButtonInset();
            b.y = getButtonInset();
            b.zIndex = 10;
            b.onClick(rerenderAnd(() => clickImprove(CardType.Paper)));
            ibc.addChild(b);
            b.tooltip = new windows.TooltipHandler(
                b,
                "Build scientific improvements",
            );
        }

        {
            // Cloth
            const b = getButtonSprite(
                ButtonType.CityImproveCloth,
                getButtonWidth(),
                0,
                undefined,
                rerender,
            );
            buttons.improveBox!.cloth = b;
            b.interactive = true;
            b.cursor = "pointer";
            b.reactDisable = true;
            b.x = getButtonInset() + getButtonSpacing();
            b.y = getButtonInset();
            b.zIndex = 10;
            b.onClick(rerenderAnd(() => clickImprove(CardType.Cloth)));
            ibc.addChild(b);
            b.tooltip = new windows.TooltipHandler(
                b,
                "Build mercantile improvements",
            );
        }

        {
            // Coin
            const b = getButtonSprite(
                ButtonType.CityImproveCoin,
                getButtonWidth(),
                0,
                undefined,
                rerender,
            );
            buttons.improveBox!.coin = b;
            b.interactive = true;
            b.cursor = "pointer";
            b.reactDisable = true;
            b.x = getButtonInset() + getButtonSpacing() * 2;
            b.y = getButtonInset();
            b.zIndex = 10;
            b.onClick(rerenderAnd(() => clickImprove(CardType.Coin)));
            ibc.addChild(b);
            b.tooltip = new windows.TooltipHandler(
                b,
                "Build militaristic improvements",
            );
        }
    }

    // End Turn
    {
        const endTurnSlot = 4;
        buttons.endTurn = getButtonSprite(
            ButtonType.EndTurn,
            getButtonWidth(),
            0,
            undefined,
            rerender,
        );
        buttons.endTurn.interactive = true;
        buttons.endTurn.cursor = "pointer";
        buttons.endTurn.reactDisable = true;
        buttons.endTurn.x = getButtonInset() + getButtonSpacing() * endTurnSlot;
        buttons.endTurn.y = getButtonInset();
        buttons.endTurn.zIndex = 10;
        buttons.endTurn.onClick(rerenderAnd(commandHub.endTurn));
        container.addChild(buttons.endTurn);
        buttons.endTurn.tooltip = new windows.TooltipHandler(
            buttons.endTurn,
            "End the current turn",
        );
    }

    // Special Build phase request
    if (state.settings.SpecialBuild) {
        const b = getButtonSprite(
            ButtonType.SpecialBuild,
            128 / 3,
            0,
            playerColor,
            rerender,
        );
        buttons.specialBuild = b;
        b.reactDisable = true;
        b.setEnabled(true);
        const pos = computeSpecialBuildPosition({
            canvasWidth: canvas.getWidth(),
            canvasHeight: canvas.getHeight(),
        });
        b.x = pos.x;
        b.y = pos.y;
        b.zIndex = 1000;
        b.onClick(rerenderAnd(commandHub.specialBuild));
        canvas.app.stage.addChild(b);
        b.tooltip = new windows.TooltipHandler(
            b,
            "Request a special build phase",
        );
    }
}

/**
 * Set the enabled state of the buttons.
 * @param sprite Button sprite
 * @param enabled Whether the button is enabled
 * @param tintOnly Do not change the sprite interactive state
 * @returns
 */
function setButtonEnabled(
    sprite: PIXI.Sprite | undefined,
    enabled: boolean,
    tintOnly = false,
) {
    if (!sprite || sprite.destroyed) {
        return;
    }

    if (!tintOnly) {
        sprite.cursor = enabled ? "pointer" : "default";
    }
    sprite.tint = enabled ? 0xffffff : 0x666666;

    // Recursively set tint to all children
    const setTint = (parent: any) => {
        parent.tint = sprite.tint;
        parent.children.forEach(setTint);
    };
    setTint(sprite);
}

/**
 * Update the enabled state of the buttons from player secret.
 * @param secret Player state
 */
export function updateButtonsSecretState(secret: PlayerSecretState) {
    for (const i in secret.BuildablesLeft) {
        const t = Number(i) as BuildableType;
        const bt = (ButtonType as any)[BuildableType[t]] as ButtonType;

        if (buttonCounts[bt]) {
            buttonCounts[bt]!.text.text = `${secret.BuildablesLeft[t]}`;
        }
    }

    buttons.buildSettlement.setEnabled(
        secret.AllowedActions?.BuildSettlement ||
            state.isPendingBuildPlacement("s"),
    );
    buttons.buildCity.setEnabled(
        secret.AllowedActions?.BuildCity || state.isPendingBuildPlacement("c"),
    );
    buttons.buildRoad.setEnabled(
        secret.AllowedActions?.BuildRoad || state.isPendingBuildPlacement("r"),
    );
    buttons.buildShip?.setEnabled(
        secret.AllowedActions?.BuildShip || state.isPendingBuildPlacement("sh"),
    );
    buttons.moveShip?.setEnabled(
        secret.AllowedActions?.MoveShip || state.isPendingBuildPlacement("ms"),
    );
    buttons.buyDevelopmentCard?.setEnabled(
        secret.AllowedActions?.BuyDevelopmentCard,
    );
    buttons.endTurn.setEnabled(secret.AllowedActions?.EndTurn);

    trade.setTradeAllowed(Boolean(secret.AllowedActions?.Trade));

    // Cities and Knights
    buttons.knightBox?.buildKnight.setEnabled(
        secret.AllowedActions?.BuildKnight || state.isPendingBuildPlacement("k"),
    );
    buttons.knightBox?.activateKnight.setEnabled(
        secret.AllowedActions?.ActivateKnight ||
            state.isPendingBuildPlacement("ka"),
    );
    buttons.knightBox?.robberKnight.setEnabled(
        secret.AllowedActions?.RobberKnight ||
            state.isPendingBuildPlacement("kr"),
    );
    buttons.knightBox?.moveKnight.setEnabled(
        secret.AllowedActions?.MoveKnight || state.isPendingBuildPlacement("km"),
    );

    const anyKnight =
        secret.AllowedActions?.ActivateKnight ||
        secret.AllowedActions?.RobberKnight ||
        secret.AllowedActions?.MoveKnight ||
        secret.AllowedActions?.BuildKnight;
    buttons.openKnightBox?.setEnabled(anyKnight, true);

    buttons.improveBox?.paper.setEnabled(secret.AllowedActions?.ImprovePaper);
    buttons.improveBox?.cloth.setEnabled(secret.AllowedActions?.ImproveCloth);
    buttons.improveBox?.coin.setEnabled(secret.AllowedActions?.ImproveCoin);

    const anyImprove =
        secret.AllowedActions?.ImprovePaper ||
        secret.AllowedActions?.ImproveCloth ||
        secret.AllowedActions?.ImproveCoin;
    buttons.openImproveBox?.setEnabled(anyImprove, true);

    buttons.buildWall?.setEnabled(
        secret.AllowedActions?.BuildWall || state.isPendingBuildPlacement("w"),
    );
    buttons.specialBuild?.setEnabled(
        Boolean(secret.AllowedActions?.SpecialBuild),
    );

    updateTurnTimerWidget();
    rerender();
}
