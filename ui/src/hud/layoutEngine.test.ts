import test from "node:test";
import assert from "node:assert/strict";

import {
    resetUIConfig,
    initializeUIConfig,
    getHudConfig,
} from "../uiConfig/index.ts";
import { buildHUDLayout, computeHandWidthForViewport } from "./layoutEngine.ts";

test("layout engine stacks right rail widgets in order", () => {
    resetUIConfig();
    const hud = getHudConfig();

    const layout = buildHUDLayout({
        canvasWidth: 1600,
        canvasHeight: 900,
        playerCount: 4,
    });

    assert.equal(layout.widgets.gameLog!.y, hud.rightRail.topInset);
    assert.equal(
        layout.widgets.chatLane!.y,
        layout.widgets.gameLog!.y + layout.widgets.gameLog!.height + hud.gap,
    );
    assert.equal(
        layout.widgets.resourceBank!.y,
        layout.widgets.chatLane!.y + layout.widgets.chatLane!.height + hud.gap,
    );
});

test("layout engine places action bar after the hand", () => {
    resetUIConfig();

    const layout = buildHUDLayout({
        canvasWidth: 1600,
        canvasHeight: 900,
        playerCount: 4,
    });

    assert.equal(
        layout.widgets.actionBar!.x,
        layout.widgets.hand!.x + layout.widgets.hand!.width + 8,
    );
});

test("layout engine hand width matches configured viewport clamp", () => {
    resetUIConfig();

    const layout = buildHUDLayout({
        canvasWidth: 1280,
        canvasHeight: 720,
    });

    assert.equal(layout.widgets.hand!.width, computeHandWidthForViewport(1280));
});

test("layout engine aligns chat input inside the chat window", () => {
    resetUIConfig();

    const layout = buildHUDLayout({
        canvasWidth: 1600,
        canvasHeight: 900,
    });

    assert.ok(layout.widgets.chatInput!.x >= layout.widgets.chatWindow!.x);
    assert.ok(layout.widgets.chatInput!.y >= layout.widgets.chatWindow!.y);
    assert.ok(
        layout.widgets.chatInput!.x + layout.widgets.chatInput!.width <=
            layout.widgets.chatWindow!.x + layout.widgets.chatWindow!.width,
    );
    assert.ok(
        layout.widgets.chatInput!.y + layout.widgets.chatInput!.height <=
            layout.widgets.chatWindow!.y + layout.widgets.chatWindow!.height,
    );
});

test("layout engine respects compact preset widths", () => {
    initializeUIConfig({ preset: "compact" });

    const layout = buildHUDLayout({
        canvasWidth: 1600,
        canvasHeight: 900,
    });

    assert.equal(layout.widgets.gameLog!.width, 252);
    assert.equal(layout.widgets.resourceBank!.width, 252);
    assert.equal(layout.widgets.chatWindow!.width, 236);
});

test("layout engine places timer above end-turn slot and dice above timer", () => {
    resetUIConfig();

    const layout = buildHUDLayout({
        canvasWidth: 1600,
        canvasHeight: 900,
    });
    const hud = getHudConfig();
    const actionBar = layout.widgets.actionBar!;
    const timer = layout.widgets.turnTimer!;
    const dice = layout.widgets.dice!;
    const playerPanel = layout.widgets.playerPanel!;

    const expectedEndTurnCenterX =
        actionBar.x +
        hud.actionBar.buttonInset +
        hud.actionBar.buttonSpacing * hud.misc.endTurnSlotIndex +
        hud.actionBar.buttonWidth / 2;
    const timerCenterX = timer.x + timer.width / 2;

    assert.ok(
        Math.abs(timerCenterX - (expectedEndTurnCenterX + hud.misc.timerRightNudge)) <=
            1,
        `expected timer center ${timerCenterX} to align with nudged end-turn center ${expectedEndTurnCenterX + hud.misc.timerRightNudge}`,
    );
    assert.ok(
        timer.y + timer.height <= actionBar.y,
        `expected timer bottom ${timer.y + timer.height} above action bar y ${actionBar.y}`,
    );
    assert.ok(
        dice.y + dice.height <= timer.y,
        `expected dice bottom ${dice.y + dice.height} above timer y ${timer.y}`,
    );
    assert.ok(
        dice.x + dice.width <= playerPanel.x,
        `expected dice right edge ${dice.x + dice.width} left of player panel x ${playerPanel.x}`,
    );
});

test("layout engine includes game status panel left of timer", () => {
    resetUIConfig();

    const layout = buildHUDLayout({
        canvasWidth: 1600,
        canvasHeight: 900,
    });
    const gameStatus = layout.widgets.gameStatus;
    const timer = layout.widgets.turnTimer!;

    assert.ok(gameStatus, "expected game status widget frame");
    assert.ok(
        gameStatus!.x + gameStatus!.width <= timer.x,
        `expected game status right edge ${gameStatus!.x + gameStatus!.width} left of timer x ${timer.x}`,
    );
    assert.ok(
        Math.abs(
            gameStatus!.y + gameStatus!.height / 2 - (timer.y + timer.height / 2),
        ) <= 1,
        `expected game status center Y ${gameStatus!.y + gameStatus!.height / 2} to align with timer center Y ${timer.y + timer.height / 2}`,
    );
});

test("layout engine keeps ship action rail clear of main action bar and can use hand-side space", () => {
    resetUIConfig();

    const layout = buildHUDLayout({
        canvasWidth: 1600,
        canvasHeight: 900,
    });
    const ships = layout.widgets.actionBarShips!;
    const hand = layout.widgets.hand!;
    const actionBar = layout.widgets.actionBar!;

    assert.ok(
        ships.y + ships.height <= actionBar.y,
        `expected ship rail bottom ${ships.y + ships.height} above action bar y ${actionBar.y}`,
    );
    assert.ok(
        ships.x >= hand.x,
        `expected ship rail x ${ships.x} to stay at/after hand x ${hand.x}`,
    );
});
