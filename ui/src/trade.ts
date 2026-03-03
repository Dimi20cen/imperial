import * as hand from "./hand";
import * as PIXI from "pixi.js";
import * as canvas from "./canvas";
import * as actions from "./actions";
import * as state from "./state";
import * as anim from "./animation";
import * as buttons from "./buttons";
import * as tsg from "../tsg";
import { sound } from "@pixi/sound";
import * as assets from "./assets";
import { CardType } from "./entities";
import { getThisPlayerOrder, getCommandHub, isSpectator } from "./ws";
import * as windows from "./windows";
import {
    getBottomRailConfig,
    getTradeConfig,
} from "./uiConfig";
import {
    addIconSprite,
} from "./uiDock";
import {
    clampSpanWithinBounds,
    computeActionBarPosition,
    computeHandPosition,
} from "./hudLayout";

type OfferObject = tsg.TradeOffer & {
    container: PIXI.Container & anim.Translatable;
    layoutHeight?: number;
};

type TradeSubmitMode = "auto" | "bank" | "player";

type TradeActionButton = {
    container: PIXI.Container;
    setEnabled: (enabled: boolean) => void;
};

type TradeActionRail = {
    container: PIXI.Container;
    width: number;
    height: number;
    bank: TradeActionButton;
    player: TradeActionButton;
    cancel: TradeActionButton;
};

const DEFAULT_TRADE_RATIOS = [0, 4, 4, 4, 4, 4, 4, 4, 4];

function createTradePanelBackground(width: number, height: number) {
    const panel = new PIXI.Container();
    const base = new PIXI.Graphics();
    base.lineStyle({ color: 0x0f79c8, width: 2 });
    base.beginFill(0xf2f0ea, 0.98);
    base.drawRoundedRect(0, 0, width, height, 10);
    base.endFill();
    panel.addChild(base);

    const gloss = new PIXI.Graphics();
    gloss.beginFill(0xffffff, 0.22);
    gloss.drawRoundedRect(4, 4, width - 8, Math.max(14, Math.floor(height * 0.26)), 8);
    gloss.endFill();
    panel.addChild(gloss);
    return panel;
}

function drawOfferStatusSymbol(
    status: number,
    size: number,
    color: number,
): PIXI.Graphics {
    const symbol = new PIXI.Graphics();
    symbol.lineStyle({
        color,
        width: Math.max(2, Math.round(size * 0.12)),
    });

    if (status > 0) {
        symbol.moveTo(size * 0.2, size * 0.55);
        symbol.lineTo(size * 0.43, size * 0.78);
        symbol.lineTo(size * 0.8, size * 0.24);
        return symbol;
    }

    if (status < 0) {
        symbol.moveTo(size * 0.22, size * 0.22);
        symbol.lineTo(size * 0.78, size * 0.78);
        symbol.moveTo(size * 0.78, size * 0.22);
        symbol.lineTo(size * 0.22, size * 0.78);
        return symbol;
    }

    // Pending response (hourglass).
    const w = size * 0.56;
    const x = (size - w) / 2;
    symbol.drawRoundedRect(x, size * 0.12, w, size * 0.14, 2);
    symbol.drawRoundedRect(x, size * 0.74, w, size * 0.14, 2);
    symbol.moveTo(x, size * 0.26);
    symbol.lineTo(x + w, size * 0.26);
    symbol.lineTo(size * 0.5, size * 0.5);
    symbol.lineTo(x, size * 0.74);
    symbol.lineTo(x + w, size * 0.74);
    return symbol;
}

function createOfferStatusChip(playerOrder: number, status: number) {
    const chip = new PIXI.Container();
    const size = 30;
    const playerColor = state.lastKnownStates?.[playerOrder]?.Color || "#6d7f8b";
    const fillColor = (() => {
        try {
            return PIXI.utils.string2hex(playerColor);
        } catch {
            return 0x6d7f8b;
        }
    })();

    const bg = new PIXI.Graphics();
    bg.lineStyle({ color: 0x0f79c8, width: 2 });
    bg.beginFill(fillColor, 0.35);
    bg.drawRoundedRect(0, 0, size, size, 7);
    bg.endFill();
    chip.addChild(bg);

    if (status === 0) {
        const icon = addIconSprite(chip, {
            asset: assets.uiKit.hourglass,
            width: 18,
            height: 18,
            x: 6,
            y: 6,
        });
        icon.alpha = 0.9;
    } else {
        const symbolColor = status > 0 ? 0xffffff : 0x7a1d27;
        const symbol = drawOfferStatusSymbol(status, 18, symbolColor);
        symbol.x = 6;
        symbol.y = 6;
        chip.addChild(symbol);
    }

    return chip;
}

function decorateLiveOfferWindow(window: hand.HandWindow) {
    const defaultBg = window.container.children[0];
    if (defaultBg) {
        defaultBg.visible = false;
    }
    window.contentInsetLeft = 10;

    window.container.children
        .filter((child) => child.name === "live-offer-chrome")
        .forEach((child) => window.container.removeChild(child));

    const chrome = createTradePanelBackground(
        window.container.width,
        window.container.height,
    );
    chrome.name = "live-offer-chrome";
    window.container.addChildAt(chrome, 0);
}

function relayoutEditorWindows() {
    if (
        !offerWindow?.container ||
        !askWindow?.container ||
        !possibleAskWindow?.container ||
        !tradeActionRail?.container
    ) {
        return;
    }
    if (
        offerWindow.container.destroyed ||
        askWindow.container.destroyed ||
        possibleAskWindow.container.destroyed ||
        tradeActionRail.container.destroyed
    ) {
        return;
    }

    const tradeEditor = getTradeConfig().editor;
    const handHeight = getBottomRailConfig().handHeight;
    const handPos = computeHandPosition({
        canvasHeight: canvas.getHeight(),
        handHeight,
    });
    const actionBarPos = computeActionBarPosition({
        canvasWidth: canvas.getWidth(),
        canvasHeight: canvas.getHeight(),
    });
    const laneWidth = Math.max(
        offerWindow.container.width,
        askWindow.container.width,
        possibleAskWindow.container.width,
    );
    const editorX = handPos.x;
    const actionRailWidth = tradeActionRail.width;
    const resolvedX = clampSpanWithinBounds({
        preferredX: editorX,
        minX: handPos.x,
        maxX: actionBarPos.x,
        spanWidth: laneWidth + tradeEditor.actionRailGap + actionRailWidth,
    });
    const offerY = handPos.y - tradeEditor.windowHeight - tradeEditor.rowGap;

    offerWindow.container.x = resolvedX;
    offerWindow.container.y = offerY;

    askWindow.container.x = resolvedX;
    askWindow.container.y =
        offerY - tradeEditor.windowHeight - tradeEditor.rowGap;

    possibleAskWindow.container.x = resolvedX;
    possibleAskWindow.container.y =
        askWindow.container.y - tradeEditor.windowHeight - tradeEditor.rowGap;

    tradeActionRail.container.x = resolvedX + laneWidth + tradeEditor.actionRailGap;
    tradeActionRail.container.y = possibleAskWindow.container.y;
}

function decorateTradeEditorWindow(
    tradeWindow: hand.HandWindow,
    options?: {
        icon?: assets.AssetImage;
        secondaryIcon?: assets.AssetImage;
        iconTint?: number;
        iconRotation?: number;
        secondaryRotation?: number;
    },
) {
    const editor = getTradeConfig().editor;
    const hasRailIcon = Boolean(options?.icon);
    tradeWindow.contentInsetLeft = hasRailIcon ? editor.contentInsetLeft : 12;

    const defaultBg = tradeWindow.container.children[0];
    if (defaultBg) {
        defaultBg.visible = false;
    }

    tradeWindow.container.children
        .filter((child) => child.name === "trade-editor-chrome")
        .forEach((child) => tradeWindow.container.removeChild(child));

    const chrome = new PIXI.Container();
    chrome.name = "trade-editor-chrome";
    const panel = new PIXI.Graphics();
    panel.lineStyle({
        color: editor.surfaceBorder,
        width: editor.surfaceBorderWidth,
    });
    panel.beginFill(editor.surfaceFill, 0.98);
    panel.drawRoundedRect(
        0,
        0,
        tradeWindow.container.width,
        editor.windowHeight,
        8,
    );
    panel.endFill();
    chrome.addChild(panel);

    if (hasRailIcon && options?.secondaryIcon) {
        const guide = new PIXI.Graphics();
        guide.beginFill(editor.railFill, 0.22);
        guide.drawRoundedRect(8, 8, editor.railWidth - 16, editor.windowHeight - 16, 8);
        guide.endFill();
        chrome.addChild(guide);
    }

    const addIcon = (
        asset: assets.AssetImage,
        x: number,
        y: number,
        rotation = 0,
        tint?: number,
    ) => {
        const iconSprite = addIconSprite(chrome, {
            asset,
            width: editor.iconSize,
            height: editor.iconSize,
            x,
            y,
        });
        iconSprite.anchor.set(0.5);
        iconSprite.x += editor.iconSize / 2;
        iconSprite.y += editor.iconSize / 2;
        iconSprite.rotation = rotation;
        if (tint !== undefined) {
            iconSprite.tint = tint;
        }
    };

    if (options?.icon && options.secondaryIcon) {
        const markerY = Math.round((editor.windowHeight - editor.iconSize) / 2);
        const iconX = 16;
        const arrowX = iconX + editor.iconSize + 12;
        addIcon(
            options.icon,
            iconX,
            markerY,
            0,
            options.iconTint,
        );
        addIcon(
            options.secondaryIcon,
            arrowX,
            markerY,
            options.secondaryRotation ?? 0,
        );
    } else if (options?.icon) {
        const markerY = Math.round((editor.windowHeight - editor.iconSize) / 2);
        addIcon(
            options.icon,
            20,
            markerY,
            options.iconRotation ?? 0,
            options.iconTint,
        );
    }

    tradeWindow.container.addChildAt(chrome, 0);
}

function makeTradeActionButton(options: {
    icon: assets.AssetImage;
    x: number;
    y: number;
    fill: number;
    border: number;
    showCheck?: boolean;
    onPress: () => void;
}) {
    const button = new PIXI.Container();
    button.x = options.x;
    button.y = options.y;
    button.interactive = true;
    button.cursor = "pointer";

    const chip = new PIXI.Graphics();
    chip.lineStyle({ color: options.border, width: 2 });
    chip.beginFill(options.fill, 0.98);
    chip.drawRoundedRect(0, 0, 48, 48, 12);
    chip.endFill();
    button.addChild(chip);

    addIconSprite(button, {
        asset: options.icon,
        width: 26,
        height: 26,
        x: 11,
        y: 11,
    });

    if (options.showCheck) {
        const badge = new PIXI.Graphics();
        badge.beginFill(0x22c55e);
        badge.drawCircle(39, 9, 7);
        badge.endFill();
        button.addChild(badge);

        const check = new PIXI.Graphics();
        check.lineStyle({ color: 0xffffff, width: 2.2 });
        check.moveTo(36, 9);
        check.lineTo(38.5, 11.5);
        check.lineTo(42.5, 7.5);
        button.addChild(check);
    }

    let enabled = true;
    button.on("pointerdown", () => {
        if (!enabled) {
            return;
        }
        options.onPress();
    });

    return {
        container: button,
        setEnabled(next: boolean) {
            enabled = next;
            button.alpha = next ? 1 : 0.42;
            button.interactive = next;
            button.cursor = next ? "pointer" : "default";
        },
    } satisfies TradeActionButton;
}

function createTradeActionRail() {
    const editor = getTradeConfig().editor;
    const slotSize = 48;
    const railHeight = slotSize * 3 + editor.rowGap * 2 + 12;
    const railWidth = editor.actionRailWidth;
    const buttonX = Math.max(6, Math.round((railWidth - slotSize) / 2));
    const rail = new PIXI.Container();
    rail.zIndex = 1400;
    const shell = new PIXI.Graphics();
    shell.lineStyle({ color: 0x0f79c8, width: 2 });
    shell.beginFill(0xe8f6ff, 0.96);
    shell.drawRoundedRect(0, 0, railWidth, railHeight, 16);
    shell.endFill();
    rail.addChild(shell);
    const bank = makeTradeActionButton({
        icon: assets.uiKit.bank,
        x: buttonX,
        y: 6,
        fill: 0xb6ebff,
        border: 0x6fb7dc,
        showCheck: true,
        onPress: () => makeOffer("bank"),
    });
    const player = makeTradeActionButton({
        icon: assets.uiKit.players,
        x: buttonX,
        y: 6 + slotSize + editor.rowGap,
        fill: 0xb6ebff,
        border: 0x6fb7dc,
        showCheck: true,
        onPress: () => makeOffer("player"),
    });
    const cancel = makeTradeActionButton({
        icon: assets.uiKit.x,
        x: buttonX,
        y: 6 + 2 * (slotSize + editor.rowGap),
        fill: 0x2dc4df,
        border: 0x1a93ac,
        onPress: clearOfferEditor,
    });

    rail.addChild(bank.container);
    rail.addChild(player.container);
    rail.addChild(cancel.container);

    return {
        container: rail,
        width: railWidth,
        height: railHeight,
        bank,
        player,
        cancel,
    } satisfies TradeActionRail;
}

/** Currently available trade offers */
let currentOffers: OfferObject[] = [];

function relayoutTradeOfferContainers(animate: boolean) {
    const tradeOffers = getTradeConfig().offers;
    let nextY = tradeOffers.laneTop;

    const liveContainers: (PIXI.Container & anim.Translatable)[] = [];
    for (const offer of currentOffers) {
        const container = offer.container;
        if (!container || container.destroyed) {
            continue;
        }
        liveContainers.push(container);
        container.targetY = nextY;
        if (!animate) {
            container.y = nextY;
        }

        const offerHeight = offer.layoutHeight ?? container.height;
        const scaledHeight = offerHeight * tradeOffers.scale;
        const step = Math.max(tradeOffers.laneGap, scaledHeight + 14);
        nextY += step;
    }

    if (animate && liveContainers.length > 0) {
        anim.requestTranslationAnimation(liveContainers);
    }
}

/** Allow player to create new offers */
let tradeAllowed = false;
let countering = false;
let currentTradeRatios: number[] = [...DEFAULT_TRADE_RATIOS];

/** Window to show which cards the player wants to give */
let offerWindow: hand.HandWindow;
/** Window to show which cards have been asked */
let askWindow: hand.HandWindow;
/** Window to select cards to ask */
let possibleAskWindow: hand.HandWindow;

let tradeActionRail: TradeActionRail;

export let handlingSelectCardsAction:
    | (tsg.PlayerActionSelectCards & { updateCount?: () => void })
    | undefined;

/**
 * Enable or disable actively trading from the hand window
 * @param val Whether to allow trading
 */
export function setTradeAllowed(val: boolean) {
    tradeAllowed = val;
    render();
}

/**
 * Clear all selections
 */
export function clearOfferEditor() {
    for (const i in offerWindow.cards) {
        offerWindow.cards[i] = 0;
        askWindow.cards[i] = 0;
    }
    countering = false;
    offerWindow.render();
    askWindow.render();
    render();

    hand.resetWindow();
}

/**
 * Initialize the trade windows
 */
export function initialize() {
    const isCK = state.settings.Mode == state.GameMode.CitiesAndKnights;
    const isCK_1 = isCK ? 1 : 0;
    const tradeEditor = getTradeConfig().editor;
    const cardWidth = tradeEditor.cardWidth;

    offerWindow = new hand.HandWindow(
        canvas.app.stage,
        tradeEditor.offerWidth,
        tradeEditor.windowHeight,
    );
    askWindow = new hand.HandWindow(
        canvas.app.stage,
        isCK ? tradeEditor.ckAskBaseWidth : tradeEditor.compactAskBaseWidth,
        tradeEditor.windowHeight,
    );
    possibleAskWindow = new hand.HandWindow(
        canvas.app.stage,
        isCK
            ? tradeEditor.ckPossibleAskWidth
            : tradeEditor.basePossibleAskWidth,
        tradeEditor.windowHeight,
        false,
        false,
    );

    decorateTradeEditorWindow(possibleAskWindow);
    decorateTradeEditorWindow(askWindow, {
        icon: assets.uiKit.tradeArrowGreen,
        iconRotation: -Math.PI / 2,
    });
    decorateTradeEditorWindow(offerWindow, {
        icon: assets.uiKit.tradeArrowRed,
        iconRotation: -Math.PI / 2,
    });

    offerWindow.container.visible = false;
    offerWindow.clickCallback = removeFromCurrentOffer;
    offerWindow.interactive = true;
    offerWindow.showRatios();

    askWindow.container.visible = false;
    askWindow.container.zIndex = 1400;
    askWindow.clickCallback = removeFromCurrentAsk;
    askWindow.interactive = true;

    possibleAskWindow.container.zIndex = 100;
    possibleAskWindow.container.visible = false;
    possibleAskWindow.clickCallback = addToCurrentAsk;
    possibleAskWindow.setCards([0, 1, 1, 1, 1, 1, isCK_1, isCK_1, isCK_1]);
    possibleAskWindow.hideRatios();
    possibleAskWindow.noRatioStride = true;
    possibleAskWindow.interactive = true;

    if (tradeActionRail?.container && !tradeActionRail.container.destroyed) {
        tradeActionRail.container.destroy({ children: true });
    }
    tradeActionRail = createTradeActionRail();
    tradeActionRail.container.visible = false;
    canvas.app.stage.addChild(tradeActionRail.container);
    relayoutEditorWindows();
}

export function relayout() {
    relayoutEditorWindows();
    canvas.app.markDirty();
}

/**
 * Send a new offer to the server
 */
export function makeOffer(mode: TradeSubmitMode = "auto") {
    canvas.app.markDirty();

    if (handlingSelectCardsAction) {
        const w = handlingSelectCardsAction.NotSelfHand
            ? askWindow
            : offerWindow;
        actions.respondSelectCards(
            handlingSelectCardsAction.IsDevHand ? w.developmentCards : w.cards,
        );
        return;
    }

    getCommandHub().createTradeOffer(offerWindow.cards, askWindow.cards, mode);
}

function hasAnyCards(cards: number[]) {
    return cards.some((q) => Number(q || 0) > 0);
}

function isDraftValidForBankTrade() {
    const give = offerWindow.cards;
    const ask = askWindow.cards;

    let givesAny = false;
    let asksAny = false;
    let possibleBankCards = 0;
    let requestedCards = 0;

    for (let i = 1; i < Math.max(give.length, ask.length); i++) {
        const giveQty = Number(give[i] || 0);
        const askQty = Number(ask[i] || 0);
        if (giveQty > 0) {
            givesAny = true;
        }
        if (askQty > 0) {
            asksAny = true;
        }

        if (giveQty > 0 && askQty > 0) {
            return false;
        }

        if (giveQty > 0) {
            const ratio = Number(currentTradeRatios[i] || 0);
            if (ratio <= 0 || giveQty % ratio !== 0) {
                return false;
            }
            possibleBankCards += giveQty / ratio;
        }

        if (askQty > 0) {
            requestedCards += askQty;
        }
    }

    if (!givesAny || !asksAny) {
        return false;
    }

    return possibleBankCards === requestedCards;
}

/**
 * Check if player can add cards to the offer window
 */
export function canAddToCurrentOffer(): boolean {
    if (handlingSelectCardsAction) {
        if (handlingSelectCardsAction.NotSelfHand) {
            return false;
        }
        if (handlingSelectCardsAction.Quantity <= offerWindow.cardCount()) {
            return false;
        }
    } else {
        if (!tradeAllowed && !countering && offerWindow.cardCount() == 0) {
            return false;
        }
    }

    return true;
}

/**
 * Add a card to the current offer
 * @param cardType type of card to add
 */
export function addToCurrentOffer(cardType: CardType) {
    if (!canAddToCurrentOffer()) {
        return;
    }

    offerWindow.updateCards(cardType, 1);

    if (!handlingSelectCardsAction?.NotSelfHand) {
        hand.handWindow?.updateCards(cardType, -1);
    }

    render();
}

/**
 * Add a card to the current ask
 * @param cardType type of card to add
 */
export function addToCurrentAsk(cardType: CardType) {
    if (
        handlingSelectCardsAction?.Quantity ==
        askWindow.cardCount() + askWindow.devCardCount()
    ) {
        return;
    }

    if (handlingSelectCardsAction?.Hand) {
        possibleAskWindow.updateCards(cardType, -1);
    }

    askWindow.updateCards(cardType, 1);
    render();
}

/**
 * Remove a card from the current offer
 * @param cardType type of card to remove
 */
export function removeFromCurrentOffer(cardType: CardType) {
    offerWindow.updateCards(cardType, -1);

    if (!handlingSelectCardsAction?.NotSelfHand) {
        hand.handWindow?.updateCards(cardType, 1);
    }

    render();
}

/**
 * Remove a card from the current ask
 * @param cardType type of card to remove
 */
export function removeFromCurrentAsk(cardType: CardType) {
    askWindow.updateCards(cardType, -1);

    if (handlingSelectCardsAction?.Hand) {
        possibleAskWindow.updateCards(cardType, 1);
    }

    render();
}

/**
 * At least one card is selected in the offer window
 */
export function hasOffer() {
    for (const c of offerWindow.cards) {
        if (c > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Render the trade windows
 */
function render() {
    canvas.app.markDirty();

    if (
        !offerWindow?.container ||
        !askWindow?.container ||
        !possibleAskWindow?.container ||
        !tradeActionRail?.container
    ) {
        return;
    }

    if (hand.handWindow) {
        hand.handWindow.interactive = canAddToCurrentOffer();
    }

    if (handlingSelectCardsAction) {
        const nsh = handlingSelectCardsAction.NotSelfHand;
        offerWindow.container.visible = !nsh;
        askWindow.container.visible =
            nsh || Boolean(handlingSelectCardsAction?.Getting);
        possibleAskWindow.container.visible = nsh;

        tradeActionRail.container.visible = true;
        tradeActionRail.bank.setEnabled(false);
        tradeActionRail.cancel.setEnabled(false);

        handlingSelectCardsAction?.updateCount?.();

        const w = handlingSelectCardsAction.NotSelfHand
            ? askWindow
            : offerWindow;
        const playerEnabled =
            w.cardCount() + w.devCardCount() ==
            handlingSelectCardsAction.Quantity;
        tradeActionRail.player.setEnabled(playerEnabled);
        return;
    }

    if (!hasOffer() && !countering) {
        offerWindow.container.visible = false;
        askWindow.container.visible = false;
        possibleAskWindow.container.visible = false;
        tradeActionRail.container.visible = false;
        return;
    }

    offerWindow.container.visible = true;
    askWindow.container.visible = true;
    possibleAskWindow.container.visible = true;
    tradeActionRail.container.visible = true;
    const hasAsk = hasAnyCards(askWindow.cards);
    const hasGive = hasAnyCards(offerWindow.cards);
    const isPlayerTradeValid = hasAsk && hasGive;
    tradeActionRail.bank.setEnabled(isPlayerTradeValid && isDraftValidForBankTrade());
    tradeActionRail.player.setEnabled(isPlayerTradeValid);
    tradeActionRail.cancel.setEnabled(true);
}

/**
 * Render a trade offer from an offer message
 * @param offer offer to display
 */
export function showTradeOffer(offer: tsg.TradeOffer) {
    // Show the offer
    canvas.app.markDirty();

    // Get current container or make new and push to current list
    let offerContainer!: PIXI.Container;
    let offerObject!: OfferObject;
    let isNewOffer = true;
    for (const c of currentOffers) {
        if (c.Id == offer.Id) {
            offerObject = c;
            offerContainer = c.container;
            isNewOffer = false;
        }
    }

    if (!offerContainer || !offerObject) {
        offerContainer = new PIXI.Container();
        const createdOffer = offer as OfferObject;
        createdOffer.container = offerContainer;
        offerObject = createdOffer;
        currentOffers.push(createdOffer);
    }

    const index = currentOffers.indexOf(offerObject);
    const tradeOffers = getTradeConfig().offers;

    // Refresh container
    offerContainer.destroy({ children: true });

    // Check if the offer is destroyed
    if (offer.Destroyed) {
        currentOffers.splice(index, 1);
        relayoutTradeOfferContainers(true);
        return;
    }

    offerContainer = new PIXI.Container();
    offerObject.container = offerContainer;
    canvas.app.stage.addChild(offerContainer);

    const myOrder = getThisPlayerOrder();
    const iAmCreator = myOrder === offer.CreatedBy;
    const iAmCurrent = myOrder === offer.CurrentPlayer;
    const isIncomingOffer = !iAmCreator && !iAmCurrent;
    const isOutgoingOffer = iAmCreator;
    const isCurrentPlayerCounterOffer = iAmCurrent && !iAmCreator;
    const markerColumnWidth = 56;
    const markerIconSize = 24;
    const rowHeight = tradeOffers.cardWindowHeight;
    const rowGap = 8;
    const countVisibleStacks = (cards: number[]) =>
        cards.reduce((count, quantity, cardType) => {
            if (cardType === 0) {
                return count;
            }
            return quantity > 0 ? count + 1 : count;
        }, 0);
    const maxStacks = Math.max(
        1,
        countVisibleStacks(offer.Details.Ask),
        countVisibleStacks(offer.Details.Give),
    );
    const laneCardGap = 4;
    const rowWidth = Math.min(
        tradeOffers.cardWindowWidth,
        Math.max(130, 24 + maxStacks * (tradeOffers.cardWidth + laneCardGap)),
    );
    const panelPadding = 10;
    const nonCurrentPlayerCount = offer.Acceptances.filter(
        (_, p) => p !== offer.CurrentPlayer,
    ).length;
    const outgoingStatusChipCount = Math.max(1, nonCurrentPlayerCount);
    const actionButtonCount = isIncomingOffer
        ? 3
        : isOutgoingOffer
          ? outgoingStatusChipCount + 1
          : isCurrentPlayerCounterOffer
            ? 1
            : 0;
    const actionsWidth = Math.max(106, actionButtonCount * 48 + 8);
    const contentX = panelPadding + markerColumnWidth + 6;
    const topRowY = panelPadding;
    const bottomRowY = topRowY + rowHeight + rowGap;
    const panelWidth =
        panelPadding + markerColumnWidth + 6 + rowWidth + 6 + actionsWidth + panelPadding;
    const panelHeight = bottomRowY + rowHeight + panelPadding;

    offerContainer.addChild(createTradePanelBackground(panelWidth, panelHeight));

    const drawMarkerRow = (top: number, askRow: boolean) => {
        const markerY = top + Math.round((rowHeight - markerIconSize) / 2);
        if (askRow) {
            const topMarker = isOutgoingOffer
                ? addIconSprite(offerContainer, {
                      asset: assets.uiKit.players,
                      width: markerIconSize,
                      height: markerIconSize,
                      x: panelPadding + 6,
                      y: markerY,
                  })
                : (() => {
                      const requester = state.getPlayerAvatarSprite(offer.CreatedBy);
                      requester.x = panelPadding + 6;
                      requester.y = markerY;
                      requester.scale.set(markerIconSize / 52);
                      offerContainer.addChild(requester);
                      return requester;
                  })();
            new windows.TooltipHandler(
                topMarker,
                isOutgoingOffer
                    ? "Cards requested from other players"
                    : "Cards requested by the offering player",
            );
            const arrow = addIconSprite(offerContainer, {
                asset: assets.uiKit.tradeArrowGreen,
                width: markerIconSize,
                height: markerIconSize,
                x: panelPadding + 30,
                y: markerY,
            });
            arrow.anchor.set(0.5);
            arrow.x += markerIconSize / 2;
            arrow.y += markerIconSize / 2;
            arrow.rotation = -Math.PI / 2;
            new windows.TooltipHandler(arrow, "Cards moving to the current player");
            return;
        }

        const avatar = state.getPlayerAvatarSprite(offer.CurrentPlayer);
        avatar.x = panelPadding + 6;
        avatar.y = markerY;
        avatar.scale.set(markerIconSize / 52);
        offerContainer.addChild(avatar);
        new windows.TooltipHandler(avatar, "Cards offered by the current player");
        const arrow = addIconSprite(offerContainer, {
            asset: assets.uiKit.tradeArrowRed,
            width: markerIconSize,
            height: markerIconSize,
            x: panelPadding + 30,
            y: markerY,
        });
        arrow.anchor.set(0.5);
        arrow.x += markerIconSize / 2;
        arrow.y += markerIconSize / 2;
        arrow.rotation = -Math.PI / 2;
        new windows.TooltipHandler(arrow, "Cards leaving the current player");
    };

    drawMarkerRow(topRowY, true);
    drawMarkerRow(bottomRowY, false);

    const liveAskWindow = new hand.HandWindow(
        offerContainer,
        rowWidth,
        rowHeight,
        true,
        false,
    );
    const liveGiveWindow = new hand.HandWindow(
        offerContainer,
        rowWidth,
        rowHeight,
        true,
        false,
    );
    liveAskWindow.cardWidth = tradeOffers.cardWidth;
    liveGiveWindow.cardWidth = tradeOffers.cardWidth;
    decorateLiveOfferWindow(liveAskWindow);
    decorateLiveOfferWindow(liveGiveWindow);
    liveAskWindow.container.x = contentX;
    liveAskWindow.container.y = topRowY;
    liveGiveWindow.container.x = contentX;
    liveGiveWindow.container.y = bottomRowY;
    liveAskWindow.setCards(offer.Details.Ask);
    liveGiveWindow.setCards(offer.Details.Give);

    const actionsX = contentX + rowWidth + 6;
    const presenceWidth = actionsWidth - 12;
    if (!isOutgoingOffer) {
        const presencePanel = createTradePanelBackground(presenceWidth, 50);
        presencePanel.x = actionsX;
        presencePanel.y = topRowY + 2;
        offerContainer.addChild(presencePanel);

        const closeOfferButton = (
            playerOrder: number,
            i: number,
        ): PIXI.Sprite => {
            const button = state.getPlayerAvatarSprite(playerOrder);
            button.x = 8 + i * 28;
            button.y = 10;
            button.scale.set(28 / 52);
            button.tint = 0x666666;
            const status = offer.Acceptances[playerOrder];

            if (status === 1) {
                button.tint = 0xffffff;
                if (offer.CurrentPlayer == getThisPlayerOrder()) {
                    button.interactive = true;
                    button.cursor = "pointer";
                    button.on("pointerdown", () =>
                        getCommandHub().closeTradeOffer(offer.Id, playerOrder),
                    );
                }
            } else if (status === -1) {
                button.alpha = 0.5;
            }

            return button;
        };

        let count = 0;
        for (let p = 0; p < offer.Acceptances.length; p++) {
            if (p == offer.CurrentPlayer) {
                continue;
            }

            const button = closeOfferButton(p, count++);
            presencePanel.addChild(button);
        }
    }

    const haveEnoughCardsToAccept = () =>
        offer.Details.Ask.every(
            (q, ct) =>
                hand.handWindow!.cards[ct] +
                    (offerWindow.container.visible ? offerWindow.cards[ct] : 0) >=
                q,
        );

    const actionBaseY = bottomRowY + rowHeight - 44;
    const addActionButton = (
        type: buttons.ButtonType,
        x: number,
        enabled: boolean,
        onClick?: () => void,
        tooltip?: string,
        iconAsset?: assets.AssetImage,
    ) => {
        const frame = createTradePanelBackground(44, 44);
        frame.x = x;
        frame.y = actionBaseY;
        if (iconAsset) {
            const iconBg = new PIXI.Graphics();
            iconBg.beginFill(enabled ? 0xb9e8ff : 0xcfd8dc, enabled ? 0.95 : 0.75);
            iconBg.drawRoundedRect(5, 5, 34, 34, 8);
            iconBg.endFill();
            frame.addChild(iconBg);

            const icon = addIconSprite(frame, {
                asset: iconAsset,
                width: 22,
                height: 22,
                x: 11,
                y: 11,
            });
            icon.alpha = enabled ? 1 : 0.55;

            frame.interactive = enabled && Boolean(onClick);
            frame.cursor = enabled && onClick ? "pointer" : "default";
            if (enabled && onClick) {
                frame.on("pointerdown", onClick);
            }
        } else {
            const btn = buttons.getButtonSprite(type, 34, 34);
            btn.x = 5;
            btn.y = 5;
            btn.setEnabled(enabled);
            if (onClick) {
                btn.on("pointerdown", onClick);
            }
            frame.addChild(btn);
        }
        offerContainer.addChild(frame);
        if (tooltip) {
            new windows.TooltipHandler(frame, tooltip);
        }
    };

    if (!isSpectator() && isIncomingOffer) {
        const editX = actionsX + 2;
        const rejectX = actionsX + 50;
        const acceptX = actionsX + 98;
        addActionButton(
            buttons.ButtonType.Edit,
            editX,
            true,
            () => {
                const ask =
                    myOrder == offer.CurrentPlayer
                        ? offer.Details.Ask
                        : offer.Details.Give;
                const give =
                    myOrder == offer.CurrentPlayer
                        ? offer.Details.Give
                        : offer.Details.Ask;

                clearOfferEditor();

                for (let i = 1; i < offer.Details.Ask.length; i++) {
                    const giveI = Math.min(give[i], hand.handWindow!.cards[i]);
                    offerWindow.updateCards(i, giveI);
                    hand.handWindow!.updateCards(i, -giveI);
                    askWindow.setCards(ask);
                }
                countering = true;
                render();
            },
            "Prepare a counter-offer",
            assets.uiKit.pencil,
        );
        addActionButton(
            buttons.ButtonType.No,
            rejectX,
            true,
            () => getCommandHub().rejectTradeOffer(offer.Id),
            "Decline this offer",
        );
        addActionButton(
            buttons.ButtonType.Yes,
            acceptX,
            haveEnoughCardsToAccept(),
            () => getCommandHub().acceptTradeOffer(offer.Id),
            "Accept this offer",
        );
    } else if (!isSpectator() && isOutgoingOffer) {
        const statusPlayers: number[] = [];
        for (let p = 0; p < offer.Acceptances.length; p++) {
            if (p === offer.CurrentPlayer) {
                continue;
            }
            statusPlayers.push(p);
        }
        statusPlayers.forEach((playerOrder, idx) => {
            const status = offer.Acceptances[playerOrder];
            const chip = createOfferStatusChip(playerOrder, status);
            chip.x = actionsX + 2 + idx * 48;
            chip.y = actionBaseY + 7;
            const name = state.lastKnownStates?.[playerOrder]?.Username || `Player ${playerOrder + 1}`;
            const statusText =
                status > 0 ? "accepted" : status < 0 ? "declined" : "pending";
            new windows.TooltipHandler(chip, `${name}: ${statusText}`);
            offerContainer.addChild(chip);
        });
        addActionButton(
            buttons.ButtonType.No,
            actionsX + 2 + statusPlayers.length * 48,
            true,
            () => getCommandHub().rejectTradeOffer(offer.Id),
            "Cancel this offer",
        );
    } else if (!isSpectator() && isCurrentPlayerCounterOffer) {
        addActionButton(
            buttons.ButtonType.No,
            actionsX + 2,
            true,
            () => getCommandHub().rejectTradeOffer(offer.Id),
            "Decline this counter-offer",
        );
    }

    // Get position of container before putting in respond window
    offerContainer.x = canvas.getWidth() - tradeOffers.laneRightOffset;
    offerContainer.zIndex = 1500;
    offerContainer.scale.set(tradeOffers.scale);
    offerContainer.pivot.x = offerContainer.width + 100;
    offerObject.layoutHeight = panelHeight;
    relayoutTradeOfferContainers(false);

    // Request animation
    if (isNewOffer) {
        offerObject.container.targetX = offerContainer.x;
        offerContainer.x += tradeOffers.enterAnimationOffsetX;
        anim.requestTranslationAnimation(currentOffers.map((c) => c.container));
        sound.play("soundTrade");
    }

    // Make sure everything is okay for handwindow
    render();
}

/**
 * Clears the offers and reset everything
 */
export function closeTradeOffer() {
    const isCK = state.settings.Mode == state.GameMode.CitiesAndKnights;
    const isCK_1 = isCK ? 1 : 0;

    state.showPendingAction();
    handlingSelectCardsAction = undefined;
    hand.handWindow?.setClickableCardTypes();
    possibleAskWindow?.setClickableCardTypes();
    possibleAskWindow?.setCards([0, 1, 1, 1, 1, 1, isCK_1, isCK_1, isCK_1]);
    possibleAskWindow?.setDevelopmentCards(new Array(31).fill(0));
    possibleAskWindow?.hideRatios();
    possibleAskWindow?.render();

    askWindow?.setDevelopmentCards(new Array(31).fill(0));
    askWindow?.setCards(new Array(9).fill(0));

    offerWindow?.showRatios();

    countering = false;

    currentOffers.forEach((c) => c.container.destroy({ children: true }));
    currentOffers = [];
    clearOfferEditor();
}

/**
 * Ask the player to select cards in response to an action
 * @param action Action to handle
 */
export function handleSelectCardsAction(action: tsg.PlayerAction) {
    clearOfferEditor();
    handlingSelectCardsAction = action.Data;
    offerWindow?.hideRatios();

    if (handlingSelectCardsAction?.NotSelfHand) {
        possibleAskWindow.setClickableCardTypes(
            handlingSelectCardsAction.AllowedTypes,
        );

        // Taking from another hand
        if (handlingSelectCardsAction.Hand) {
            if (handlingSelectCardsAction.IsDevHand) {
                possibleAskWindow.setDevelopmentCards(
                    handlingSelectCardsAction.Hand,
                );
                possibleAskWindow.setCards(new Array(9).fill(0));
            } else {
                possibleAskWindow.setCards(handlingSelectCardsAction.Hand);
            }
            possibleAskWindow.hideRatios();
        }

        possibleAskWindow.render();
    } else if (handlingSelectCardsAction?.Getting) {
        askWindow.setCards(handlingSelectCardsAction.Getting);
    }

    render();

    hand.handWindow?.setClickableCardTypes(
        handlingSelectCardsAction!.AllowedTypes,
    );

    handlingSelectCardsAction!.updateCount = () => {
        const w = handlingSelectCardsAction!.NotSelfHand
            ? askWindow
            : offerWindow;

        state.showPendingAction({
            Message: `${action.Message} (${w.cardCount() + w.devCardCount()}/${
                handlingSelectCardsAction!.Quantity
            })`,
        });
    };
    handlingSelectCardsAction!.updateCount();
}

export function updateTradeRatios(ratios: number[]) {
    currentTradeRatios = [...DEFAULT_TRADE_RATIOS];
    ratios?.forEach((value, index) => {
        if (index >= 0 && index < currentTradeRatios.length) {
            currentTradeRatios[index] = Number(value || 0);
        }
    });
    possibleAskWindow?.setRatios(ratios);
    offerWindow?.setRatios(ratios);
    render();
}
