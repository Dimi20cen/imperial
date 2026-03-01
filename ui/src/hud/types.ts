export type HUDFrame = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type HUDPoint = {
    x: number;
    y: number;
};

export type HUDRegionId = "rightRail" | "bottomRail" | "topLeftControls";

export type HUDWidgetId =
    | "playerPanel"
    | "bank"
    | "gameStatus"
    | "actionBar"
    | "actionBarSecondary"
    | "actionBarShips"
    | "knightBox"
    | "improveBox"
    | "turnTimer"
    | "pauseToggle"
    | "dice"
    | "specialBuild"
    | "hand"
    | "devConfirmation"
    | "spectators"
    | "gameLog"
    | "chatLane"
    | "chatWindow"
    | "chatInput"
    | "resourceBank";

export type HUDLayoutContext = {
    canvasWidth: number;
    canvasHeight: number;
    playerCount?: number;
    playerPanelWidth?: number;
    playerPanelHeight?: number;
    playerPanelScale?: number;
    diceWidth?: number;
    diceHeight?: number;
    turnTimerWidth?: number;
    turnTimerHeight?: number;
};

export type HUDLayoutResult = {
    regions: Record<HUDRegionId, HUDFrame>;
    widgets: Partial<Record<HUDWidgetId, HUDFrame>>;
    anchors: {
        chatButtonCenter: HUDPoint;
        chatPopup: HUDPoint;
    };
};

export type HUDWidgetDefinition = {
    id: HUDWidgetId;
    layer: "pixi" | "dom";
    region: HUDRegionId | "floating";
    description: string;
};
