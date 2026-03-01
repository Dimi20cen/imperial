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
import { getWindowSprite, YesNoWindow } from "./windows";
import { CardType } from "./entities";
import { getThisPlayerOrder, getCommandHub, isSpectator } from "./ws";
import {
    getBottomRailConfig,
    getTradeConfig,
} from "./uiConfig";
import {
    addIconSprite,
    createDockRail,
    createDockSideRail,
} from "./uiDock";
import {
    clampSpanWithinBounds,
    computeActionBarPosition,
    computeHandPosition,
    computeHandWidth,
} from "./hudLayout";

type OfferObject = tsg.TradeOffer & {
    container: PIXI.Container & anim.Translatable;
};

function relayoutEditorWindows() {
    if (
        !offerWindow?.container ||
        !askWindow?.container ||
        !possibleAskWindow?.container ||
        !offerYesNoWindow?.container
    ) {
        return;
    }
    if (
        offerWindow.container.destroyed ||
        askWindow.container.destroyed ||
        possibleAskWindow.container.destroyed ||
        offerYesNoWindow.container.destroyed
    ) {
        return;
    }

    const tradeEditor = getTradeConfig().editor;
    const handHeight = getBottomRailConfig().handHeight;
    const handPos = computeHandPosition({
        canvasHeight: canvas.getHeight(),
        handHeight,
    });
    const handWidth = computeHandWidth(canvas.getWidth());
    const actionBarPos = computeActionBarPosition({
        canvasWidth: canvas.getWidth(),
        canvasHeight: canvas.getHeight(),
    });
    const editorX = handPos.x;
    const actionRailWidth = 48;
    const resolvedX = clampSpanWithinBounds({
        preferredX: editorX,
        minX: handPos.x,
        maxX: actionBarPos.x,
        spanWidth:
            tradeEditor.offerWidth +
            tradeEditor.actionRailGap +
            actionRailWidth,
    });
    const offerY =
        handPos.y -
        tradeEditor.windowHeight -
        tradeEditor.rowGap;

    offerWindow.container.x = resolvedX;
    offerWindow.container.y = offerY;

    askWindow.container.x = resolvedX;
    askWindow.container.y =
        offerY - tradeEditor.windowHeight - tradeEditor.rowGap;

    possibleAskWindow.container.x = resolvedX;
    possibleAskWindow.container.y =
        askWindow.container.y - tradeEditor.windowHeight - tradeEditor.rowGap;

    offerYesNoWindow.container.x =
        resolvedX + tradeEditor.offerWidth + tradeEditor.actionRailGap;
    offerYesNoWindow.container.y = askWindow.container.y;
}

function decorateTradeEditorWindow(
    tradeWindow: hand.HandWindow,
    icon: assets.AssetImage,
    secondaryIcon?: assets.AssetImage,
) {
    const editor = getTradeConfig().editor;
    tradeWindow.contentInsetLeft = editor.contentInsetLeft;

    const defaultBg = tradeWindow.container.children[0];
    if (defaultBg) {
        defaultBg.visible = false;
    }

    tradeWindow.container.children
        .filter((child) => child.name === "trade-editor-chrome")
        .forEach((child) => tradeWindow.container.removeChild(child));

    const chrome = new PIXI.Container();
    chrome.name = "trade-editor-chrome";
    chrome.addChild(
        createDockRail({
            width: tradeWindow.container.width,
            height: editor.windowHeight,
        }),
    );
    chrome.addChild(
        createDockSideRail({
            width: editor.railWidth,
            height: editor.windowHeight,
        }),
    );

    const addIcon = (asset: assets.AssetImage, centerY: number) => {
        addIconSprite(chrome, {
            asset,
            width: editor.iconSize,
            height: editor.iconSize,
            x: (editor.railWidth - editor.iconSize) / 2,
            y: centerY - editor.iconSize / 2,
        });
    };

    if (secondaryIcon) {
        addIcon(icon, editor.windowHeight / 2 - editor.iconSize * 0.45);
        addIcon(
            secondaryIcon,
            editor.windowHeight / 2 + editor.iconSize * 0.55,
        );
    } else {
        addIcon(icon, editor.windowHeight / 2);
    }

    tradeWindow.container.addChildAt(chrome, 0);
}

function decorateTradeActionRail(window: YesNoWindow) {
    const editor = getTradeConfig().editor;
    const defaultBg = window.container.children[0];
    if (defaultBg) {
        defaultBg.visible = false;
    }

    window.container.children
        .filter((child) => child.name === "trade-editor-action-rail")
        .forEach((child) => window.container.removeChild(child));

    window._yesButton!.alpha = 0.001;
    window._noButton!.alpha = 0.001;

    const chrome = new PIXI.Container();
    chrome.name = "trade-editor-action-rail";
    chrome.addChild(
        createDockRail({
            width: 48,
            height: editor.windowHeight,
        }),
    );

    const makeActionChip = (
        asset: assets.AssetImage,
        centerY: number,
        fill: number,
    ) => {
        const chip = new PIXI.Graphics();
        chip.beginFill(fill);
        chip.drawRoundedRect(6, centerY - 19, 36, 36, 12);
        chip.endFill();
        chrome.addChild(chip);

        addIconSprite(chrome, {
            asset,
            width: 22,
            height: 22,
            x: 13,
            y: centerY - 11,
        });
    };

    makeActionChip(assets.uiKit.tradeArrowGreen, 24, 0x5ad469);
    makeActionChip(assets.uiKit.x, 66, 0x17b6cf);

    window.container.addChildAt(chrome, 0);
}

/** Currently available trade offers */
let currentOffers: OfferObject[] = [];

/** Allow player to create new offers */
let tradeAllowed = false;
let countering = false;

/** Window to show which cards the player wants to give */
let offerWindow: hand.HandWindow;
/** Window to show which cards have been asked */
let askWindow: hand.HandWindow;
/** Window to select cards to ask */
let possibleAskWindow: hand.HandWindow;

/** Window to yes/no to current offer */
let offerYesNoWindow: YesNoWindow;

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

    decorateTradeEditorWindow(
        possibleAskWindow,
        assets.uiKit.players,
        assets.uiKit.tradeArrowGreen,
    );
    decorateTradeEditorWindow(
        askWindow,
        assets.uiKit.bank,
        assets.uiKit.tradeArrowRed,
    );
    decorateTradeEditorWindow(offerWindow, assets.uiKit.bank);

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
    possibleAskWindow.showRatios();
    possibleAskWindow.noRatioStride = true;
    possibleAskWindow.interactive = true;

    offerYesNoWindow = new YesNoWindow(
        0,
        0,
    )
        .onYes(makeOffer)
        .onNo(clearOfferEditor)
        .render();
    decorateTradeActionRail(offerYesNoWindow);
    offerYesNoWindow.container.visible = false;
    offerYesNoWindow.container.zIndex = 1400;
    offerYesNoWindow._yesButton!.reactDisable = true;
    canvas.app.stage.addChild(offerYesNoWindow.container);
    relayoutEditorWindows();
}

export function relayout() {
    relayoutEditorWindows();
    canvas.app.markDirty();
}

/**
 * Send a new offer to the server
 */
export function makeOffer() {
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

    getCommandHub().createTradeOffer(offerWindow.cards, askWindow.cards);
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
        !offerYesNoWindow?.container
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

        offerYesNoWindow.container.visible = true;
        offerYesNoWindow.noEnabled = false;

        handlingSelectCardsAction?.updateCount?.();

        const w = handlingSelectCardsAction.NotSelfHand
            ? askWindow
            : offerWindow;
        offerYesNoWindow.yesEnabled =
            w.cardCount() + w.devCardCount() ==
            handlingSelectCardsAction.Quantity;
        return;
    }

    if (!hasOffer() && !countering) {
        offerWindow.container.visible = false;
        askWindow.container.visible = false;
        possibleAskWindow.container.visible = false;
        offerYesNoWindow.container.visible = false;
        return;
    }

    offerWindow.container.visible = true;
    askWindow.container.visible = true;
    possibleAskWindow.container.visible = true;
    offerYesNoWindow.container.visible = true;
    offerYesNoWindow.yesEnabled = askWindow.cardCount() > 0;
}

/**
 * Render a trade offer from an offer message
 * @param offer offer to display
 */
export function showTradeOffer(offer: tsg.TradeOffer) {
    // Show the offer
    canvas.app.markDirty();

    // Get current container or make new and push to current list
    let offerContainer!: PIXI.Container | undefined;
    let offerObject!: OfferObject;
    let isNewOffer = true;
    for (const c of currentOffers) {
        if (c.Id == offer.Id) {
            offerObject = c;
            offerContainer = c.container;
            isNewOffer = false;
        }
    }

    if (!offerContainer) {
        offerContainer = new PIXI.Container();
        offerObject = offer as any;
        offerObject.container = offerContainer;
        currentOffers.push(offerObject);
    }

    const index = currentOffers.indexOf(offerObject);
    const tradeOffers = getTradeConfig().offers;

    const getY = (i: number) =>
        tradeOffers.laneTop + i * tradeOffers.laneGap;

    // Refresh container
    offerContainer.destroy({ children: true });

    // Check if the offer is destroyed
    if (offer.Destroyed) {
        currentOffers.splice(index, 1);
        for (let i = 0; i < currentOffers.length; i++) {
            currentOffers[i].container.targetY = getY(i);
        }
        anim.requestTranslationAnimation(currentOffers.map((c) => c.container));
        return;
    }

    offerContainer = new PIXI.Container();
    offerObject.container = offerContainer;
    canvas.app.stage.addChild(offerContainer);

    const tradeOfferWindow = new hand.HandWindow(
        offerContainer,
        tradeOffers.cardWindowWidth,
        tradeOffers.cardWindowHeight,
        true,
        false,
    );
    const tradeAskWindow = new hand.HandWindow(
        offerContainer,
        tradeOffers.cardWindowWidth,
        tradeOffers.cardWindowHeight,
        true,
        false,
    );
    tradeOfferWindow.cardWidth = tradeOffers.cardWidth;
    tradeAskWindow.cardWidth = tradeOffers.cardWidth;

    const isCurrent = offer.CurrentPlayer == getThisPlayerOrder();
    tradeOfferWindow.container.x = isCurrent
        ? 0
        : tradeOffers.cardWindowWidth + tradeOffers.panelGap;
    tradeOfferWindow.container.y = 0;
    tradeAskWindow.container.x = isCurrent
        ? tradeOffers.cardWindowWidth + tradeOffers.panelGap
        : 0;
    tradeAskWindow.container.y = 0;

    {
        const plus = new PIXI.Text("+", {
            fontSize: 40,
            fontWeight: "bold",
            fill: 0x00aa00,
        });
        plus.x = tradeOffers.markerPlusX;
        plus.y = tradeOffers.markerPlusY;
        plus.pivot.x = 40;

        const minus = new PIXI.Text("-", {
            fontSize: 50,
            fontWeight: "bold",
            fill: 0xaa0000,
        });
        minus.x = tradeOffers.markerMinusX;
        minus.y = tradeOffers.markerMinusY;
        minus.pivot.x = 40;

        tradeOfferWindow.container.addChild(isCurrent ? minus : plus);
        tradeAskWindow.container.addChild(isCurrent ? plus : minus);
    }

    tradeOfferWindow.setCards(offer.Details.Give);
    tradeAskWindow.setCards(offer.Details.Ask);

    const closeOfferContainer = new PIXI.Container();
    {
        // Draw accepting players
        const closeOfferButton = (
            playerOrder: number,
            i: number,
        ): PIXI.Sprite => {
            const button = state.getPlayerAvatarSprite(playerOrder);
            button.x =
                tradeOffers.acceptPanelPadding + i * tradeOffers.acceptAvatarStep;
            button.y = 10;
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

        const lastWindow = isCurrent ? tradeAskWindow : tradeOfferWindow;
        closeOfferContainer.x =
            lastWindow.container.x + lastWindow.container.width + 10;
        closeOfferContainer.y = tradeAskWindow.container.y;
        closeOfferContainer.addChild(
            getWindowSprite(
                (offer.Acceptances.length - 1) *
                    tradeOffers.acceptAvatarStep +
                    tradeOffers.acceptPanelPadding,
                tradeOffers.acceptPanelHeight,
            ),
        );
        offerContainer.addChild(closeOfferContainer);

        let count = 0;
        for (let p = 0; p < offer.Acceptances.length; p++) {
            if (p == offer.CurrentPlayer) {
                continue;
            }

            const button = closeOfferButton(p, count++);
            closeOfferContainer.addChild(button);
        }
    }

    // Get position of container before putting in respond window
    // This ensures that the offers are lined up
    offerContainer.x = canvas.getWidth() - tradeOffers.laneRightOffset;
    offerContainer.y = getY(index);
    offerContainer.zIndex = 1500;
    offerContainer.scale.set(tradeOffers.scale);
    offerContainer.pivot.x = offerContainer.width + 100;

    // Respond window
    const respondWindow = new YesNoWindow(
        closeOfferContainer.x + closeOfferContainer.width + 10,
        tradeAskWindow.container.y,
    ).onNo(() => getCommandHub().rejectTradeOffer(offer.Id));
    respondWindow.container.visible = !isSpectator();

    const haveEnoughCardsToAccept = () =>
        offer.Details.Ask.every(
            (q, ct) =>
                hand.handWindow!.cards[ct] +
                    (askWindow.container.visible ? askWindow.cards[ct] : 0) >=
                q,
        );

    if (
        getThisPlayerOrder() != offer.CreatedBy &&
        getThisPlayerOrder() != offer.CurrentPlayer &&
        haveEnoughCardsToAccept()
    ) {
        respondWindow.onYes(() => getCommandHub().acceptTradeOffer(offer.Id));
    }
    respondWindow.render();

    offerContainer.addChild(respondWindow.container);

    // Counter offer button
    if (offer.CreatedBy != getThisPlayerOrder() && !isSpectator()) {
        const counterWindow = getWindowSprite(
            tradeOffers.counterButtonWindowSize,
            tradeOffers.counterButtonWindowSize,
        );
        counterWindow.x =
            respondWindow.container.x + respondWindow.container.width + 5;
        counterWindow.y = 20;
        const counterButton = buttons.getButtonSprite(
            buttons.ButtonType.Edit,
            32,
            32,
        );
        counterButton.setEnabled(true);
        counterButton.x = 5;
        counterButton.y = 5;
        counterButton.interactive = true;
        counterButton.cursor = "pointer";
        counterButton.on("pointerdown", () => {
            const ask =
                getThisPlayerOrder() == offer.CurrentPlayer
                    ? offer.Details.Ask
                    : offer.Details.Give;
            const give =
                getThisPlayerOrder() == offer.CurrentPlayer
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
        });
        counterWindow.addChild(counterButton);
        offerContainer.addChild(counterWindow);
    }

    {
        // Offerer window
        const offererWindow = getWindowSprite(
            tradeOffers.offererPanelWidth,
            tradeOffers.offererPanelHeight,
        );
        offererWindow.x = tradeOffers.offererOffsetX;
        const offererAvatar = state.getPlayerAvatarSprite(offer.CurrentPlayer);
        offererAvatar.x = 10;
        offererAvatar.y = 10;
        offererAvatar.tint =
            offer.Acceptances[offer.CurrentPlayer] == 1 ? 0xffffff : 0x666666;
        offererWindow.addChild(offererAvatar);
        offerContainer.addChild(offererWindow);
    }

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
    possibleAskWindow?.showRatios();
    possibleAskWindow?.render();

    askWindow?.setDevelopmentCards(new Array(31).fill(0));
    askWindow?.setCards(new Array(9).fill(0));

    offerWindow?.showRatios();

    if (offerYesNoWindow) {
        offerYesNoWindow.noEnabled = true;
        countering = false;
    }

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
    possibleAskWindow?.setRatios(ratios);
    offerWindow?.setRatios(ratios);
}
