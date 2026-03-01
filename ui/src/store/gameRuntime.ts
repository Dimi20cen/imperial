import * as board from "../board";
import * as dice from "../dice";
import * as state from "../state";
import * as hand from "../hand";
import * as trade from "../trade";
import * as actions from "../actions";
import * as buttons from "../buttons";
import * as notif from "../notif";
import * as gameLog from "../gameLog";
import * as gameStatus from "../gameStatus";
import * as resourceBank from "../resourceBank";
import { chatMessage } from "../chat";
import * as tsg from "../../tsg";
import { initialize as initializeSettings } from "../settings";
import { relayoutHUD } from "../hudRelayout";
import { handleGameOver } from "../game-over";
import {
    getCommandHub,
    getThisPlayerOrder,
    isGameWsReceiving,
    setGameWsReceiving,
} from "../ws";
import { MSG_RES_TYPE, WsResponse } from "../sock";

let lastKnownMyDevCardsTotal = 0;
let lastAppliedGameStateSeq = 0;

export function isHandledByGameRuntime(msg: WsResponse): boolean {
    switch (msg.t) {
        case MSG_RES_TYPE.INIT_SETTINGS:
        case MSG_RES_TYPE.INIT_MAPPING:
        case MSG_RES_TYPE.INIT_TILE:
        case MSG_RES_TYPE.INIT_VERTEX:
        case MSG_RES_TYPE.INIT_EDGE:
        case MSG_RES_TYPE.INIT_PORT:
        case MSG_RES_TYPE.INIT_COMPLETE:
        case MSG_RES_TYPE.GAME_STATE:
        case MSG_RES_TYPE.SECRET_STATE:
        case MSG_RES_TYPE.TRADE_OFFER:
        case MSG_RES_TYPE.ACTION_EXPECTED:
        case MSG_RES_TYPE.TRADE_CLOSE_OFFER:
        case MSG_RES_TYPE.CHAT:
        case MSG_RES_TYPE.VERTEX_PLACEMENT:
        case MSG_RES_TYPE.VERTEX_PLACEMENT_REM:
        case MSG_RES_TYPE.EDGE_PLACEMENT:
        case MSG_RES_TYPE.EDGE_PLACEMENT_REM:
        case MSG_RES_TYPE.DICE:
        case MSG_RES_TYPE.CARD_MOVE:
        case MSG_RES_TYPE.DEV_CARD_USE:
        case MSG_RES_TYPE.GAME_OVER:
        case MSG_RES_TYPE.TILE_FOG:
        case MSG_RES_TYPE.SPECTATOR_LIST:
            return true;
        default:
            return false;
    }
}

export function handleGameRuntimeMessage(msg: WsResponse) {
    if (msg.t !== MSG_RES_TYPE.INIT_SETTINGS && !isGameWsReceiving()) {
        return;
    }

    switch (msg.t) {
        case MSG_RES_TYPE.INIT_SETTINGS: {
            setGameWsReceiving(true);
            board.setInitComplete(false);
            lastAppliedGameStateSeq = 0;
            const settings = new tsg.GameSettings(msg.data);
            state.setSettings(settings);
            initializeSettings(settings);
            resourceBank.setMode(settings.Mode);
            return;
        }

        case MSG_RES_TYPE.INIT_MAPPING:
            board.setDispMapping(msg.data);
            return;

        case MSG_RES_TYPE.INIT_TILE: {
            const tile = new tsg.Tile(msg.data);
            board.renderTile(tile);
            return;
        }

        case MSG_RES_TYPE.INIT_VERTEX: {
            const vertex = new tsg.Vertex(msg.data);
            board.getBoard().vertices[board.coordStr(vertex.C)] = vertex;
            return;
        }

        case MSG_RES_TYPE.INIT_EDGE: {
            const edge = new tsg.Edge(msg.data);
            board.getBoard().edges[board.edgeCoordStr(edge.C)] = edge;
            return;
        }

        case MSG_RES_TYPE.INIT_PORT: {
            const port = new tsg.Port(msg.data);
            board.renderPort(port);
            return;
        }

        case MSG_RES_TYPE.INIT_COMPLETE:
            board.renderClickHighlights();
            board.setInitComplete(true);
            return;

        case MSG_RES_TYPE.GAME_STATE: {
            const gs = new tsg.GameState(msg.data);
            const stateSeq = Number(gs.StateSeq || 0);
            if (stateSeq > 0) {
                if (stateSeq <= lastAppliedGameStateSeq) {
                    return;
                }
                lastAppliedGameStateSeq = stateSeq;
            }
            dice.setFlashing(
                gs.NeedDice && gs.CurrentPlayerOrder == getThisPlayerOrder(),
            );
            state.renderGameState(gs, getCommandHub());
            gameStatus.setGameState(gs);
            relayoutHUD();
            board.setRobberTile(gs.Robber?.Tile);
            board.setPirateTile(gs.Pirate?.Tile);
            board.setMerchantTile(gs.Merchant);
            resourceBank.syncFromGameState(gs);
            return;
        }

        case MSG_RES_TYPE.SECRET_STATE: {
            const data = new tsg.PlayerSecretState(msg.data);
            hand.renderPlayerHand(data);
            state.setLastKnownSecretVictoryPoints(data.VictoryPoints);
            buttons.updateButtonsSecretState(data);
            trade.updateTradeRatios(data.TradeRatios);

            const currentTotal = (data.DevelopmentCards || []).reduce(
                (sum, q) => sum + Number(q || 0),
                0,
            );
            if (currentTotal > lastKnownMyDevCardsTotal) {
                gameLog.logDevCardDraw(getThisPlayerOrder());
            }
            lastKnownMyDevCardsTotal = currentTotal;
            return;
        }

        case MSG_RES_TYPE.TRADE_OFFER:
            trade.showTradeOffer(new tsg.TradeOffer(msg.data));
            return;

        case MSG_RES_TYPE.ACTION_EXPECTED:
            const action = new tsg.PlayerAction(msg.data);
            actions.handle(action);
            gameStatus.setPendingAction(action);
            return;

        case MSG_RES_TYPE.TRADE_CLOSE_OFFER:
            trade.closeTradeOffer();
            gameStatus.setPendingAction(null);
            return;

        case MSG_RES_TYPE.CHAT:
            chatMessage(msg.data);
            return;

        case MSG_RES_TYPE.VERTEX_PLACEMENT:
            board.renderVertexPlacement(new tsg.VertexPlacement(msg.data));
            return;

        case MSG_RES_TYPE.VERTEX_PLACEMENT_REM:
            board.renderVertexPlacement(
                new tsg.VertexPlacement(msg.data),
                true,
            );
            return;

        case MSG_RES_TYPE.EDGE_PLACEMENT:
            board.renderEdgePlacement(new tsg.Road(msg.data));
            return;

        case MSG_RES_TYPE.EDGE_PLACEMENT_REM:
            board.renderEdgePlacement(new tsg.Road(msg.data), true);
            return;

        case MSG_RES_TYPE.DICE:
            const diceState = new tsg.DieRollState(msg.data);
            gameLog.logDiceRoll(diceState);
            dice.handleMessage(diceState);
            return;

        case MSG_RES_TYPE.CARD_MOVE:
            const move = new tsg.CardMoveInfo(msg?.data);
            gameLog.logCardMove(move);
            resourceBank.applyCardMove(move);
            state.addPendingCardMoves([move]);
            return;

        case MSG_RES_TYPE.DEV_CARD_USE:
            const info = new tsg.DevCardUseInfo(msg?.data);
            gameLog.logDevCardUse(info);
            notif.showDevCardUse(info);
            return;

        case MSG_RES_TYPE.GAME_OVER:
            handleGameOver(new tsg.GameOverMessage(msg.data));
            return;

        case MSG_RES_TYPE.TILE_FOG: {
            const fogTile = new tsg.Tile(msg.data);
            board.renderTile(fogTile);
            return;
        }

        case MSG_RES_TYPE.SPECTATOR_LIST:
            state.renderSpectators(msg.data);
            return;

        default:
            return;
    }
}
