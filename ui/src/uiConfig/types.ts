export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type UIConfig = {
    canvas: {
        width: number;
        height: number;
        resolution: number;
        backgroundColor: number;
    };
    controls: {
        fullscreenButton: {
            x: number;
            y: number;
            size: number;
        };
        settingsButton: {
            x: number;
            y: number;
            iconX: number;
            iconY: number;
            iconScale: number;
        };
        pauseToggle: {
            x: number;
            y: number;
            size: number;
        };
    };
    hud: {
        padding: number;
        gap: number;
        playerPanel: {
            width: number;
            rowHeight: number;
            headerOffset: number;
            scaleDefault: number;
            scaleCrowded: number;
            crowdedThreshold: number;
            highlightRowHeight: number;
        };
        rightRail: {
            width: number;
            bottomInset: number;
            topInset: number;
        };
        gameLog: {
            width: number;
            height: number;
            visibleRows: number;
        };
        chat: {
            laneWidth: number;
            laneHeight: number;
            windowWidth: number;
            windowHeight: number;
            minWindowBottom: number;
            popupRightInset: number;
            popupTailInset: number;
            inputInsetRight: number;
            inputInsetBottom: number;
            inputHeight: number;
            inputBorderWidth: number;
            inputHorizontalPadding: number;
        };
        resourceBank: {
            width: number;
            height: number;
        };
        bottomRail: {
            leftInset: number;
            bottomInset: number;
            gap: number;
            handHeight: number;
            handMinWidth: number;
            handMaxWidth: number;
        };
        actionBar: {
            innerOffset: number;
            buttonSpacing: number;
            buttonCount: number;
            height: number;
            buttonWidth: number;
            buttonInset: number;
            countWidth: number;
            countHeight: number;
            countFontSize: number;
            stackGap: number;
        };
        dice: {
            rightRailGap: number;
            aboveActionBarGap: number;
            minTopInset: number;
        };
        misc: {
            bankSize: number;
            bankTopMin: number;
            devConfirmationOffsetY: number;
            specialBuildOffsetX: number;
            specialBuildOffsetY: number;
            spectatorsX: number;
            spectatorsY: number;
            endTurnSlotIndex: number;
            timerAboveEndTurnGap: number;
            diceAboveTimerGap: number;
            statusAboveDiceGap: number;
            statusWidth: number;
            statusHeight: number;
            timerWidth: number;
            timerHeight: number;
            statusLeftOfTimerGap: number;
            shipAboveStatusGap: number;
            timerRightNudge: number;
        };
    };
    windows: {
        borderColor: number;
        borderWidth: number;
        fillColor: number;
        fillAlpha: number;
        cornerRadius: number;
        yesNo: {
            width: number;
            height: number;
            buttonSize: number;
            inset: number;
            gap: number;
        };
        tooltip: {
            fontSize: number;
            wordWrapWidth: number;
            maxWidth: number;
            padding: number;
            cardWidth: number;
            cardGap: number;
            viewportInset: number;
            offsetX: number;
            offsetY: number;
        };
        errorModal: {
            width: number;
            height: number;
            titleFontSize: number;
            bodyFontSize: number;
            bodyWidth: number;
            closeButtonSize: number;
        };
    };
    bottomDock: {
        panel: {
            fill: number;
            border: number;
            borderWidth: number;
            radius: number;
            glossFill: number;
            glossAlpha: number;
            headerFill: number;
            headerBorder: number;
            titleText: number;
            bodyText: number;
            inset: number;
            fontFamily: string;
            titleFontSize: number;
            bodyFontSize: number;
            captionFontSize: number;
        };
        shell: {
            fill: number;
            border: number;
            borderWidth: number;
            radius: number;
            glossFill: number;
            glossAlpha: number;
        };
        slot: {
            fill: number;
            border: number;
            borderWidth: number;
            radius: number;
            glossFill: number;
            glossAlpha: number;
            activeFill: number;
            activeBorder: number;
        };
        rail: {
            fill: number;
            radius: number;
            dividerFill: number;
        };
        chip: {
            fill: number;
            border: number;
            text: number;
            radius: number;
        };
        timer: {
            fill: number;
            border: number;
            stripFill: number;
            text: number;
            subtext: number;
        };
    };
    overlays: {
        pendingAction: {
            x: number;
            y: number;
            width: number;
            height: number;
            closeButtonSize: number;
            textX: number;
            textY: number;
            fontSize: number;
        };
        setupPreview: {
            buttonSize: number;
            singleWidth: number;
            dualWidth: number;
            height: number;
            offsetY: number;
            padding: number;
            secondaryButtonX: number;
        };
        chooseDice: {
            dieWidth: number;
            gap: number;
            padding: number;
            rowGap: number;
            anchorX: number;
            bottomOffset: number;
        };
        chooseBuildable: {
            singleWidth: number;
            dualWidth: number;
            height: number;
            defaultX: number;
            bottomOffset: number;
            margin: number;
            topOffset: number;
            bottomPlacementOffset: number;
            buttonSize: number;
            buttonY: number;
            singleButtonX: number;
            dualLeftX: number;
            dualRightX: number;
        };
        gameOver: {
            width: number;
            playerRowHeight: number;
            extraHeight: number;
            titleFontSize: number;
            titleY: number;
            pivotYDivisor: number;
        };
    };
    trade: {
        editor: {
            offerWidth: number;
            windowHeight: number;
            cardWidth: number;
            leftX: number;
            panelGap: number;
            rowGap: number;
            bottomOffset: number;
            askExtraOffset: number;
            compactAskBaseWidth: number;
            ckAskBaseWidth: number;
            ckPossibleAskWidth: number;
            basePossibleAskWidth: number;
            contentInsetLeft: number;
            railWidth: number;
            railRadius: number;
            iconSize: number;
            surfaceFill: number;
            surfaceBorder: number;
            surfaceBorderWidth: number;
            railFill: number;
            actionRailGap: number;
            actionRailWidth: number;
        };
        offers: {
            laneRightOffset: number;
            laneTop: number;
            laneGap: number;
            scale: number;
            cardWindowWidth: number;
            cardWindowHeight: number;
            cardWidth: number;
            panelGap: number;
            markerPlusX: number;
            markerPlusY: number;
            markerMinusX: number;
            markerMinusY: number;
            acceptAvatarStep: number;
            acceptPanelPadding: number;
            acceptPanelHeight: number;
            counterButtonWindowSize: number;
            offererPanelWidth: number;
            offererPanelHeight: number;
            offererOffsetX: number;
            enterAnimationOffsetX: number;
        };
    };
    settingsPanel: {
        detailsWidth: number;
        detailsHeight: number;
        detailsX: number;
        detailsY: number;
        titleX: number;
        rowStartY: number;
        rowStep: number;
        fontSize: number;
    };
    hand: {
        devConfirmationCardWidth: number;
        devConfirmationButtonGap: number;
        devConfirmationButtonHeight: number;
    };
};

export type UIPresetName = "default" | "compact" | "mobileLandscape";

export type UITokens = {
    spacing: {
        xs: number;
        sm: number;
        md: number;
        lg: number;
    };
    radius: {
        sm: number;
        md: number;
        lg: number;
    };
    chrome: {
        panelBorder: number;
        panelFill: number;
        panelFillAlpha: number;
    };
    dock: {
        shellFill: number;
        shellBorder: number;
        shellGloss: number;
        slotFill: number;
        slotBorder: number;
        slotActiveFill: number;
        slotActiveBorder: number;
        railFill: number;
        railDivider: number;
        chipFill: number;
        chipBorder: number;
        chipText: number;
        timerFill: number;
        timerBorder: number;
        timerStrip: number;
        timerText: number;
        timerSubtext: number;
    };
};

export type SakuraUIConfig = UIConfig;
export type SakuraUIPresetName = UIPresetName;
