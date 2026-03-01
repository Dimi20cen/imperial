package server

import (
	"errors"
	"sakura/entities"

	"github.com/mitchellh/mapstructure"
)

func (ws *WsClient) handleGame(msg map[string]interface{}) {
	defer ws.Hub.Game.Unlock()
	if !ws.Hub.Game.Lock() {
		return
	}

	ws.dispatchGameCommand(msg)
}

func (ws *WsClient) dispatchGameCommand(msg map[string]interface{}) {
	if ws.Hub.Game.Paused {
		switch msg["t"] {
		case "i", "r", "pg":
		default:
			ws.Hub.Game.SendError(errors.New("game is paused"), ws.Player)
			return
		}
	}

	switch msg["t"] {
	case "i": // Init
		ws.sendInitMessage()

	case "b": // Build or Buy
		if err := ws.Hub.Game.EnsureCurrentPlayer(ws.Player); err != nil {
			return
		}
		ws.handleBuildOrBuyCommand(msg)

	case "d": // Dice
		ws.Hub.Game.SendError(ws.Hub.Game.RollDice(ws.Player, 0, 0), ws.Player)

	case "et": // End turn
		ws.Hub.Game.SendError(ws.Hub.Game.EndTurn(ws.Player), ws.Player)

	case "sb": // Special Build Request
		if !ws.Hub.Game.Settings.SpecialBuild || ws.Player == ws.Hub.Game.CurrentPlayer {
			return
		}
		if ws.Player.SpecialBuild {
			ws.Hub.Game.SendError(errors.New("build phase already requested"), ws.Player)
			return
		}
		ws.Hub.Game.SetPlayerSpecialBuild(ws.Player, true)
		ws.Hub.Game.SendPlayerSecret(ws.Player)

	case "tr": // Trade
		ws.handleTradeCommand(msg)

	case "ar": // Action Response
		ws.Player.SendExpect(msg["ar_data"])

	case "r": // Informational Request
		ws.handleInfoRequestCommand(msg)

	case "pg": // Pause/Resume
		ws.Hub.Game.SendError(ws.Hub.Game.TogglePause(ws.Player), ws.Player)
	}
}

func (ws *WsClient) handleTradeCommand(msg map[string]interface{}) {
	switch msg["tt"] { // Trade type
	case "co": // Create offer
		var offerDetails entities.TradeOfferDetails
		err := mapstructure.Decode(msg["offer"], &offerDetails)
		if err != nil {
			ws.Hub.Game.SendError(errors.New("failed to decode offer details"), ws.Player)
			return
		}
		tradeMode := "auto"
		if rawMode, ok := msg["trm"]; ok {
			var decodedMode string
			if decodeErr := mapstructure.Decode(rawMode, &decodedMode); decodeErr == nil {
				switch decodedMode {
				case "auto", "bank", "player":
					tradeMode = decodedMode
				}
			}
		}

		if len(offerDetails.Ask) != 9 || len(offerDetails.Give) != 9 {
			ws.Hub.Game.SendError(errors.New("wrong length of offer"), ws.Player)
			return
		}

		_, err = ws.Hub.Game.CreateOffer(ws.Player, &offerDetails, tradeMode)
		if err != nil {
			ws.Hub.Game.SendError(err, ws.Player)
			return
		}

	case "ao": // Accept offer
		var offerId int
		err := mapstructure.Decode(msg["oid"], &offerId)
		if err != nil {
			ws.Hub.Game.SendError(err, ws.Player)
			return
		}

		err = ws.Hub.Game.AcceptOffer(offerId, ws.Player)
		if err != nil {
			// Don't show error to player.
			// This error shows up too often because AI retracts offers.
			return
		}

	case "ro": // Reject offer
		var offerId int
		err := mapstructure.Decode(msg["oid"], &offerId)
		if err != nil {
			ws.Hub.Game.SendError(err, ws.Player)
			return
		}

		_, err = ws.Hub.Game.RejectOffer(offerId, ws.Player)
		if err != nil {
			// Don't send the error to the player.
			// Similar to the above.
			return
		}

	case "close": // Close offer
		var acceptingPlayerOrder uint16
		err := mapstructure.Decode(msg["acceptingPlayer"], &acceptingPlayerOrder)
		if err != nil {
			ws.Hub.Game.SendError(err, ws.Player)
			return
		}

		var offerId int
		err = mapstructure.Decode(msg["oid"], &offerId)
		if err != nil {
			ws.Hub.Game.SendError(err, ws.Player)
			return
		}

		err = ws.Hub.Game.CloseOffer(offerId, ws.Player, acceptingPlayerOrder)
		if err != nil {
			ws.Hub.Game.SendError(err, ws.Player)
			return
		}
	}
}

func (ws *WsClient) handleInfoRequestCommand(msg map[string]interface{}) {
	switch msg["rt"] { // Request Type
	case "gs": // Player states
		ws.Player.SendMessage(ws.getGameStateMessage())
	case "ph": // Player Hand
		ws.Player.SendMessage(ws.getPlayerSecretStateMessage())
	}
}

func (ws *WsClient) sendInitMessage() {
	// Game settings
	// This MUST be the first message sent to the client
	ws.Player.SendMessage(&entities.Message{
		Type: "i-st",
		Data: ws.Hub.Game.Settings,
	})

	// Mapping
	keys := make([]entities.Coordinate, 0)
	vals := make([]entities.FloatCoordinate, 0)

	for c, fc := range ws.Hub.Game.DispCoordMap {
		keys = append(keys, c)
		vals = append(vals, fc)
	}

	resp := make(map[string]interface{})
	resp["keys"] = keys
	resp["values"] = vals

	ws.Player.SendMessage(&entities.Message{
		Type: "i-m",
		Data: resp,
	})

	// Tiles
	for _, t := range ws.Hub.Game.Tiles {
		if t.Fog {
			t = &entities.Tile{
				Center: t.Center,
				Fog:    t.Fog,
			}
		}

		ws.Player.SendMessage(&entities.Message{
			Type: "i-t",
			Data: t,
		})
	}

	// Vertices
	for _, v := range ws.Hub.Game.Vertices {
		ws.Player.SendMessage(&entities.Message{
			Type: "i-v",
			Data: v,
		})
	}

	// Edges
	for _, e := range ws.Hub.Game.Edges {
		ws.Player.SendMessage(&entities.Message{
			Type: "i-e",
			Data: e,
		})
	}

	// Ports
	for _, p := range ws.Hub.Game.Ports {
		ws.Player.SendMessage(&entities.Message{
			Type: "i-p",
			Data: p,
		})
	}

	// Placements
	for _, p := range ws.Hub.Game.Players {
		for _, vp := range p.VertexPlacements {
			ws.Player.SendMessage(&entities.Message{
				Type: entities.MessageTypeVertexPlacement,
				Data: vp,
			})
		}

		for _, ep := range p.EdgePlacements {
			ws.Player.SendMessage(&entities.Message{
				Type: entities.MessageTypeEdgePlacement,
				Data: ep,
			})
		}
	}

	// Complete
	ws.Player.SendMessage(&entities.Message{
		Type: "i-c",
		Data: nil,
	})

	// Last Dice Roll
	ws.Player.SendMessage(&entities.Message{
		Type: "d",
		Data: entities.DieRollState{
			RedRoll:   ws.Hub.Game.LastRollRed,
			WhiteRoll: ws.Hub.Game.LastRollWhite,
			EventRoll: ws.Hub.Game.LastRollEvent,
			IsInit:    true,
		},
	})

	// Player states
	ws.Player.SendMessage(ws.getGameStateMessage())
	ws.Player.SendMessage(ws.getPlayerSecretStateMessage())
	ws.Player.SendMessage(ws.Hub.Game.GetSpectatorListMessage())
	ws.Hub.Game.CheckForVictory()

	// Trade offers
	for _, offer := range ws.Hub.Game.CurrentOffers {
		ws.Player.SendMessage(ws.Hub.Game.GetTradeOfferMessage(offer))
	}

	// Check any pending actions for this player
	if ws.Player.PendingAction != nil {
		ws.Player.SendAction(ws.Player.PendingAction)
	}
}

func (ws *WsClient) getPlayerSecretStateMessage() *entities.Message {
	return &entities.Message{
		Type: entities.MessageTypePlayerSecretState,
		Data: ws.Hub.Game.GetPlayerSecretState(ws.Player),
	}
}

func (ws *WsClient) getGameStateMessage() *entities.Message {
	return &entities.Message{
		Type: entities.MessageTypeGameState,
		Data: ws.Hub.Game.GetGameState(),
	}
}
