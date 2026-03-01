import test from "node:test";
import assert from "node:assert/strict";

import {
    DEFAULT_UI_CONFIG,
    getActionBarConfig,
    getAvailableUIPresets,
    getChatConfig,
    getHandConfig,
    getHudConfig,
    getOverlayConfig,
    getPlayerPanelConfig,
    getSettingsPanelConfig,
    getTradeEditorConfig,
    getTradeOffersConfig,
    getUIConfig,
    getWindowsConfig,
    getYesNoWindowConfig,
    initializeUIConfig,
    resetUIConfig,
} from "../uiConfig.ts";

function computeDefaultHandWidth() {
    const config = getUIConfig();
    const rightRailX =
        config.canvas.width - config.hud.padding - config.hud.rightRail.width;
    const actionBarWidth =
        config.hud.actionBar.innerOffset +
        config.hud.actionBar.buttonSpacing * config.hud.actionBar.buttonCount;
    const width =
        rightRailX -
        config.hud.bottomRail.leftInset -
        config.hud.bottomRail.gap -
        actionBarWidth;

    return Math.max(
        config.hud.bottomRail.handMinWidth,
        Math.min(config.hud.bottomRail.handMaxWidth, Math.floor(width)),
    );
}

function computeHandWidthForConfig() {
    return computeDefaultHandWidth();
}

function computeChatWindowPositionForConfig() {
    const config = getUIConfig();
    const chatBottom =
        config.hud.rightRail.topInset +
        config.hud.gameLog.height +
        config.hud.gap +
        config.hud.chat.laneHeight;

    return {
        x: config.canvas.width - config.hud.padding,
        y: Math.max(config.hud.chat.minWindowBottom, chatBottom + 2),
    };
}

function computeEvenlySpacedRowXPositions(
    containerWidth: number,
    itemWidth: number,
    itemCount: number,
    preferredGap = 6,
    minInset = 4,
) {
    if (itemCount <= 0) {
        return [];
    }

    if (itemCount === 1) {
        return [Math.max(minInset, Math.floor((containerWidth - itemWidth) / 2))];
    }

    const availableGapWidth = Math.max(
        0,
        containerWidth - minInset * 2 - itemWidth * itemCount,
    );
    const gap = Math.min(preferredGap, availableGapWidth / (itemCount - 1));
    const usedWidth = itemWidth * itemCount + gap * (itemCount - 1);
    const inset = Math.max(minInset, (containerWidth - usedWidth) / 2);

    return Array.from({ length: itemCount }, (_, index) =>
        Math.round(inset + index * (itemWidth + gap)),
    );
}

test("initializeUIConfig merges nested overrides without discarding sibling defaults", () => {
    initializeUIConfig({
        overrides: {
            hud: {
                chat: {
                    windowWidth: 320,
                },
                gameLog: {
                    height: 280,
                },
            },
            windows: {
                fillAlpha: 0.75,
            },
        },
    });

    const config = getUIConfig();

    assert.equal(config.hud.chat.windowWidth, 320);
    assert.equal(
        config.hud.chat.windowHeight,
        DEFAULT_UI_CONFIG.hud.chat.windowHeight,
    );
    assert.equal(config.hud.gameLog.height, 280);
    assert.equal(config.hud.gameLog.width, DEFAULT_UI_CONFIG.hud.gameLog.width);
    assert.equal(config.windows.fillAlpha, 0.75);
    assert.equal(
        config.controls.fullscreenButton.x,
        DEFAULT_UI_CONFIG.controls.fullscreenButton.x,
    );
});

test("initializeUIConfig applies preset defaults before layered overrides", () => {
    initializeUIConfig({
        preset: "compact",
        overrides: {
            windows: {
                fillAlpha: 0.75,
            },
        },
    });

    const config = getUIConfig();

    assert.equal(config.windows.fillAlpha, 0.75);
    assert.equal(config.hud.gameLog.height, 260);
    assert.equal(config.hud.chat.windowWidth, 236);
    assert.equal(config.hud.actionBar.buttonWidth, 60);
});

test("resetUIConfig restores defaults after bootstrap overrides", () => {
    initializeUIConfig({
        overrides: {
            canvas: {
                width: 1440,
            },
        },
    });

    const reset = resetUIConfig();

    assert.deepEqual(reset, DEFAULT_UI_CONFIG);
    assert.deepEqual(getUIConfig(), DEFAULT_UI_CONFIG);
});

test("initializeUIConfig applies preset defaults and optional overrides", () => {
    initializeUIConfig({
        preset: "compact",
        overrides: {
            hud: {
                actionBar: {
                    buttonWidth: 58,
                },
            },
        },
    });

    const config = getUIConfig();

    assert.equal(config.hud.gameLog.height, 260);
    assert.equal(config.hud.actionBar.buttonWidth, 58);
    assert.equal(config.hud.chat.windowWidth, 236);
});

test("getAvailableUIPresets exposes supported preset names", () => {
    assert.deepEqual(getAvailableUIPresets(), [
        "default",
        "compact",
        "mobileLandscape",
    ]);
});

test("default trade editor fits before the action bar", () => {
    resetUIConfig();

    const config = getUIConfig();
    const handLeft = config.hud.bottomRail.leftInset;
    const actionBarX =
        handLeft + computeDefaultHandWidth() + config.hud.bottomRail.gap;
    const actionRailWidth = config.trade.editor.actionRailWidth;
    const editorRightEdge =
        handLeft +
        config.trade.editor.offerWidth +
        config.trade.editor.actionRailGap +
        actionRailWidth;

    assert.ok(
        editorRightEdge <= actionBarX,
        `expected trade editor right edge ${editorRightEdge} to fit before action bar at ${actionBarX}`,
    );
});

test("resource bank chip positions stay inside the narrowest preset width", () => {
    const config = initializeUIConfig({
        preset: "mobileLandscape",
    });
    const positions = computeEvenlySpacedRowXPositions(
        config.hud.resourceBank.width,
        34,
        6,
        6,
        4,
    );

    assert.equal(positions.length, 6);
    assert.ok(positions[0] >= 4);
    assert.ok(positions[5] + 34 <= config.hud.resourceBank.width);
});

test("initializeUIConfig preserves sibling defaults inside preset overrides", () => {
    initializeUIConfig({
        preset: "compact",
        overrides: {
            windows: {
                fillAlpha: 0.75,
            },
        },
    });

    const config = getUIConfig();

    assert.equal(config.windows.fillAlpha, 0.75);
    assert.equal(config.hud.gameLog.height, 260);
    assert.equal(config.hud.chat.windowWidth, 236);
    assert.equal(config.hud.actionBar.buttonWidth, 60);
});

test("selectors expose the resolved active config sections", () => {
    initializeUIConfig({
        preset: "compact",
        overrides: {
            hud: {
                playerPanel: {
                    width: 244,
                },
            },
            trade: {
                editor: {
                    offerWidth: 360,
                },
            },
        },
    });

    const config = getUIConfig();

    assert.deepEqual(getHudConfig(), config.hud);
    assert.deepEqual(getPlayerPanelConfig(), config.hud.playerPanel);
    assert.deepEqual(getActionBarConfig(), config.hud.actionBar);
    assert.deepEqual(getChatConfig(), config.hud.chat);
    assert.deepEqual(getWindowsConfig(), config.windows);
    assert.deepEqual(getYesNoWindowConfig(), config.windows.yesNo);
    assert.deepEqual(getOverlayConfig(), config.overlays);
    assert.deepEqual(getTradeEditorConfig(), config.trade.editor);
    assert.deepEqual(getTradeOffersConfig(), config.trade.offers);
    assert.deepEqual(getSettingsPanelConfig(), config.settingsPanel);
    assert.deepEqual(getHandConfig(), config.hand);
});

test("reinitializing with a different preset updates selectors to the new active config", () => {
    initializeUIConfig({ preset: "compact" });
    assert.equal(getChatConfig().windowWidth, 236);
    assert.equal(getActionBarConfig().buttonWidth, 60);

    initializeUIConfig({ preset: "mobileLandscape" });
    assert.equal(getChatConfig().windowWidth, 220);
    assert.equal(getActionBarConfig().buttonWidth, 52);
    assert.equal(getPlayerPanelConfig().width, 230);
});

test("trade editor fits before the action bar for every supported preset", () => {
    getAvailableUIPresets().forEach((preset) => {
        const config = initializeUIConfig({ preset });
        const handLeft = config.hud.bottomRail.leftInset;
        const actionBarX =
            handLeft + computeHandWidthForConfig() + config.hud.bottomRail.gap;
        const actionRailWidth = getTradeEditorConfig().actionRailWidth;
        const editorRightEdge =
            handLeft +
            getTradeEditorConfig().offerWidth +
            getTradeEditorConfig().actionRailGap +
            actionRailWidth;

        assert.ok(
            editorRightEdge <= actionBarX,
            `expected trade editor to fit before action bar for preset ${preset}; right edge ${editorRightEdge}, action bar x ${actionBarX}`,
        );
    });
});

test("chat window anchor stays within the configured viewport bottom bounds for each preset", () => {
    getAvailableUIPresets().forEach((preset) => {
        const config = initializeUIConfig({ preset });
        const pos = computeChatWindowPositionForConfig();

        assert.ok(
            pos.x <= config.canvas.width,
            `expected chat window x ${pos.x} to stay within canvas width ${config.canvas.width} for preset ${preset}`,
        );
        assert.ok(
            pos.y >= getChatConfig().minWindowBottom,
            `expected chat window y ${pos.y} to respect min bottom ${getChatConfig().minWindowBottom} for preset ${preset}`,
        );
    });
});
