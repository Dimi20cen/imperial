import type { HUDWidgetDefinition } from "./types.ts";

export const HUD_WIDGET_REGISTRY: HUDWidgetDefinition[] = [
    {
        id: "gameLog",
        layer: "pixi",
        region: "rightRail",
        description: "Top panel in the right-side rail.",
    },
    {
        id: "chatLane",
        layer: "pixi",
        region: "rightRail",
        description: "Inline chat launcher anchored under the game log.",
    },
    {
        id: "resourceBank",
        layer: "pixi",
        region: "rightRail",
        description: "Resource bank panel under chat.",
    },
    {
        id: "playerPanel",
        layer: "pixi",
        region: "rightRail",
        description: "Player standings panel anchored near the lower right edge.",
    },
    {
        id: "bank",
        layer: "pixi",
        region: "rightRail",
        description: "Legacy bank icon positioned off the player panel.",
    },
    {
        id: "gameStatus",
        layer: "pixi",
        region: "floating",
        description: "Live game-phase status panel above the timer and dice stack.",
    },
    {
        id: "hand",
        layer: "pixi",
        region: "bottomRail",
        description: "Primary player hand panel.",
    },
    {
        id: "actionBar",
        layer: "pixi",
        region: "bottomRail",
        description: "Main action bar to the right of the hand.",
    },
    {
        id: "actionBarSecondary",
        layer: "pixi",
        region: "floating",
        description: "Secondary Cities and Knights action shelf.",
    },
    {
        id: "actionBarShips",
        layer: "pixi",
        region: "floating",
        description: "Seafarers ship actions shelf.",
    },
    {
        id: "knightBox",
        layer: "pixi",
        region: "floating",
        description: "Expanded knight actions tray.",
    },
    {
        id: "improveBox",
        layer: "pixi",
        region: "floating",
        description: "Expanded improvement actions tray.",
    },
    {
        id: "turnTimer",
        layer: "pixi",
        region: "floating",
        description: "Timer widget embedded inside the action area.",
    },
    {
        id: "pauseToggle",
        layer: "pixi",
        region: "topLeftControls",
        description: "Top-left pause control.",
    },
    {
        id: "dice",
        layer: "pixi",
        region: "floating",
        description: "Dice tray above the action bar.",
    },
    {
        id: "specialBuild",
        layer: "pixi",
        region: "floating",
        description: "Special build action button.",
    },
    {
        id: "devConfirmation",
        layer: "pixi",
        region: "floating",
        description: "Development card confirmation tray.",
    },
    {
        id: "spectators",
        layer: "pixi",
        region: "topLeftControls",
        description: "Spectator count in the top-left cluster.",
    },
    {
        id: "chatWindow",
        layer: "pixi",
        region: "floating",
        description: "Popup chat window anchored to the right rail.",
    },
    {
        id: "chatInput",
        layer: "dom",
        region: "floating",
        description: "DOM input aligned with the chat window frame.",
    },
];
