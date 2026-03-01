import * as buttons from "./buttons";
import * as canvas from "./canvas";
import * as chat from "./chat";
import * as dice from "./dice";
import * as gameLog from "./gameLog";
import * as gameStatus from "./gameStatus";
import * as hand from "./hand";
import * as resourceBank from "./resourceBank";
import * as state from "./state";
import * as trade from "./trade";
import { buildHUDLayout } from "./hud/layoutEngine";

let installed = false;

export function relayoutHUD() {
    if (!canvas.app) {
        return;
    }
    const layout = buildHUDLayout({
        canvasWidth: canvas.getWidth(),
        canvasHeight: canvas.getHeight(),
        ...state.getHUDLayoutContext(),
        ...dice.getDiceLayoutMetrics(),
    });
    state.relayout();
    buttons.relayout();
    hand.relayout();
    resourceBank.setFrame(layout.widgets.resourceBank!);
    trade.relayout();
    chat.applyHUDLayout(layout);
    gameStatus.setFrame(layout.widgets.gameStatus!);
    gameLog.setFrame(layout.widgets.gameLog!);
    dice.setFrame(layout.widgets.dice!);
    canvas.app.markDirty();
}

export function ensureHUDRelayoutHooks() {
    if (installed || typeof window === "undefined") {
        return;
    }

    const onResize = () => {
        window.requestAnimationFrame(() => relayoutHUD());
    };

    window.addEventListener("resize", onResize);
    installed = true;
}
