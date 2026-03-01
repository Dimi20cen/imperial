package game

import (
	"errors"
	"math/rand"
	"reflect"
	"sakura/entities"
	"strconv"

	"github.com/mitchellh/mapstructure"
)

func (g *Game) IsCreativeMode() bool {
	return g.Settings.CreativeMode
}

func (g *Game) ensureCanBuild(player *entities.Player, t entities.BuildableType) error {
	if !g.IsCreativeMode() {
		return player.CanBuild(t)
	}

	left, ok := player.BuildablesLeft[t]
	if !ok || left <= 0 {
		return errors.New("not enough pieces left to build")
	}
	return nil
}

// Checks if the player is current and no other players have pending actions
func (g *Game) EnsureCurrentPlayer(player *entities.Player) error {
	if player != g.CurrentPlayer {
		return errors.New("not the current player")
	}
	if g.HasPlayerPendingAction() {
		return errors.New("still waiting on someone to act")
	}
	return nil
}

func (g *Game) ensureDiceRolled() error {
	if !g.IsInitPhase() && g.DiceState == 0 {
		return errors.New("dice not rolled")
	}
	return nil
}

func (g *Game) ensureNotSpecialBuildPhase() error {
	if g.Settings.SpecialBuild && g.SpecialBuildPhase {
		return errors.New("cannot perform this action during special build phase")
	}
	return nil
}

func (g *Game) applyCurrentPlayerTimerBonus(player *entities.Player, seconds int) {
	if seconds <= 0 || player == nil || g.CurrentPlayer == nil {
		return
	}
	if g.CurrentPlayer != player || g.IsInitPhase() {
		return
	}
	current := g.CurrentPlayer.TimeLeft
	if current < 0 {
		current = 0
	}
	g.setCurrentPlayerTimeLeft(current + seconds)
}

func (g *Game) BuildSettlement(player *entities.Player, coordinates entities.Coordinate) error {
	init := g.IsInitPhase()

	if err := g.EnsureCurrentPlayer(player); err != nil && !init {
		return err
	}

	if err := g.ensureDiceRolled(); err != nil {
		return err
	}

	if err := g.ensureCanBuild(player, entities.BTSettlement); !init && err != nil {
		return err
	}

	canBuild := func() bool {
		for _, v := range player.GetBuildLocationsSettlement(g.Graph, init, false) {
			if v.C == coordinates {
				return true
			}
		}
		return false
	}

	if !canBuild() {
		return errors.New("cannot build settlement here")
	}

	if !init && !g.IsCreativeMode() {
		g.MoveCards(int(player.Order), -1, entities.CardTypeWood, 1, false, false)
		g.MoveCards(int(player.Order), -1, entities.CardTypeBrick, 1, false, false)
		g.MoveCards(int(player.Order), -1, entities.CardTypeWool, 1, false, false)
		g.MoveCards(int(player.Order), -1, entities.CardTypeWheat, 1, false, false)
	}

	vertex, _ := g.Graph.GetVertex(coordinates)
	err := player.BuildAtVertex(vertex, entities.BTSettlement)
	if err != nil {
		return err
	}

	player.BuildablesLeft[entities.BTSettlement]--
	g.onScenarioSettlementBuilt(player, vertex)

	g.SetExtraVictoryPoints()
	g.SendPlayerSecret(player)
	g.BroadcastState()

	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeVertexPlacement,
		Data: vertex.Placement,
	})

	g.j.WVertexBuild(vertex, false)
	g.applyCurrentPlayerTimerBonus(player, g.TimerVals.ActionBonusPlaceSettlement)

	g.CheckForVictory()

	return nil
}

func (g *Game) BuildCity(player *entities.Player, coordinates entities.Coordinate) error {
	init := g.IsInitPhase()

	if err := g.EnsureCurrentPlayer(player); err != nil && !init {
		return err
	}

	if err := g.ensureDiceRolled(); err != nil {
		return err
	}

	if err := g.ensureCanBuild(player, entities.BTCity); !init && err != nil {
		return err
	}

	canBuild := func() bool {
		locations := player.GetBuildLocationsCity(g.Graph)

		// For C&K it is equivalent to check where we can place settlement
		// for initialization phase
		if init {
			locations = player.GetBuildLocationsSettlement(g.Graph, init, false)
		}

		for _, v := range locations {
			if v.C == coordinates {
				return true
			}
		}
		return false
	}

	if !canBuild() {
		return errors.New("cannot build city here")
	}

	if !init && !g.IsCreativeMode() {
		g.MoveCards(int(player.Order), -1, entities.CardTypeOre, 3, false, false)
		g.MoveCards(int(player.Order), -1, entities.CardTypeWheat, 2, false, false)
	}

	vertex, _ := g.Graph.GetVertex(coordinates)
	vertex.RemovePlacement()
	err := player.BuildAtVertex(vertex, entities.BTCity)
	if err != nil {
		return err
	}

	player.BuildablesLeft[entities.BTCity]--

	if !init {
		player.BuildablesLeft[entities.BTSettlement]++
	}

	g.SetExtraVictoryPoints()
	g.SendPlayerSecret(player)
	g.BroadcastState()

	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeVertexPlacement,
		Data: vertex.Placement,
	})

	g.j.WVertexBuild(vertex, false)
	g.applyCurrentPlayerTimerBonus(player, g.TimerVals.ActionBonusPlaceCity)

	g.CheckForVictory()

	return nil
}

func (g *Game) BuildRoad(player *entities.Player, c entities.EdgeCoordinate) error {
	init := g.IsInitPhase()

	if err := g.EnsureCurrentPlayer(player); err != nil && !init {
		return err
	}

	if err := g.ensureDiceRolled(); err != nil {
		return err
	}

	if err := g.ensureCanBuild(player, entities.BTRoad); !init && err != nil {
		return err
	}

	canBuild := func() bool {
		for _, e := range player.GetBuildLocationsRoad(g.Graph, init) {
			if (e.C.C1 == c.C1 && e.C.C2 == c.C2) || (e.C.C1 == c.C2 && e.C.C2 == c.C1) {
				return true
			}
		}
		return false
	}

	if !canBuild() {
		return errors.New("cannot build road here")
	}

	if !init && !g.IsCreativeMode() {
		g.MoveCards(int(player.Order), -1, entities.CardTypeWood, 1, false, false)
		g.MoveCards(int(player.Order), -1, entities.CardTypeBrick, 1, false, false)
	}

	e, err := g.Graph.GetEdge(c)
	if err != nil {
		return err
	}
	if !e.IsLandEdge() {
		return errors.New("roads can only be built on land edges")
	}

	err = player.BuildAtEdge(e, entities.BTRoad)
	if err != nil {
		return err
	}

	player.BuildablesLeft[entities.BTRoad]--
	g.RevealFogAdjacentToEdge(player, e)

	g.SetExtraVictoryPoints()

	g.SendPlayerSecret(player)
	g.BroadcastState()
	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeEdgePlacement,
		Data: e.Placement,
	})

	g.j.WEdgeBuild(e)
	g.applyCurrentPlayerTimerBonus(player, g.TimerVals.ActionBonusPlaceRoad)

	g.CheckForVictory()

	return nil
}

func (g *Game) chooseDiscoveryGoldCardType(player *entities.Player) entities.CardType {
	available := make([]entities.CardType, 0, 5)
	for i := 1; i <= 5; i++ {
		ct := entities.CardType(i)
		if g.Bank.Hand.GetCardDeck(ct).Quantity > 0 {
			available = append(available, ct)
		}
	}
	if len(available) == 0 {
		return 0
	}

	// BlockForAction expects the game mutex to be held by caller context.
	// In non-interactive paths (e.g. tests/tooling) fall back to random.
	canPrompt := true
	if g.mutex.TryLock() {
		g.mutex.Unlock()
		canPrompt = false
	}
	if player == nil || player.GetIsBot() || !canPrompt {
		return available[rand.Intn(len(available))]
	}

	exp, err := g.BlockForAction(player, g.TimerVals.DevCardSelect1ResourceForMonopoly, &entities.PlayerAction{
		Type:    entities.PlayerActionTypeSelectCards,
		Message: "Choose a resource for discovered gold",
		Data: entities.PlayerActionSelectCards{
			AllowedTypes: []int{1, 2, 3, 4, 5},
			Quantity:     1,
			NotSelfHand:  true,
		},
	})
	if err == nil {
		var resp []float64
		if mapstructure.Decode(exp, &resp) == nil && len(resp) == 9 {
			for i := 1; i <= 5; i++ {
				ct := entities.CardType(i)
				if resp[i] > 0 && g.Bank.Hand.GetCardDeck(ct).Quantity > 0 {
					return ct
				}
			}
		}
	}

	return available[rand.Intn(len(available))]
}

func (g *Game) giveDiscoveryRewardForTile(player *entities.Player, tile *entities.Tile) {
	if tile == nil {
		return
	}

	if tile.Type >= entities.TileTypeWood && tile.Type <= entities.TileTypeOre {
		ct := entities.CardType(tile.Type)
		if g.Bank.Hand.GetCardDeck(ct).Quantity > 0 {
			g.MoveCards(-1, int(player.Order), ct, 1, false, false)
		}
		return
	}

	if tile.Type == entities.TileTypeGold {
		ct := g.chooseDiscoveryGoldCardType(player)
		if ct != 0 && g.Bank.Hand.GetCardDeck(ct).Quantity > 0 {
			g.MoveCards(-1, int(player.Order), ct, 1, false, false)
		}
	}
}

func (g *Game) RevealFogAdjacentToEdge(player *entities.Player, edge *entities.Edge) {
	if edge == nil {
		return
	}

	v1, err := g.Graph.GetVertex(edge.C.C1)
	if err != nil {
		return
	}
	v2, err := g.Graph.GetVertex(edge.C.C2)
	if err != nil {
		return
	}

	seen := make(map[*entities.Tile]bool)
	adjacentTiles := append(v1.AdjacentTiles, v2.AdjacentTiles...)
	for _, t := range adjacentTiles {
		if t == nil || seen[t] {
			continue
		}
		seen[t] = true
		if !t.Fog {
			continue
		}

		if g.Settings.MapDefn != nil &&
			g.Settings.MapDefn.Scenario != nil &&
			g.Settings.MapDefn.Scenario.Key == "seafarers_fog_islands" {
			discoveredType, ok := g.drawFogDiscoveryTile()
			if ok {
				t.Type = discoveredType
				if discoveredType != entities.TileTypeSea {
					t.Number = g.drawFogDiscoveryNumber()
				} else {
					t.Number = 0
				}
			}
		}
		t.Fog = false
		g.giveDiscoveryRewardForTile(player, t)
		if g.j.g != nil {
			g.j.WSetTileType(t)
		}
		g.BroadcastMessage(&entities.Message{
			Type: entities.MessageTypeTileFog,
			Data: t,
		})
	}
}

func (g *Game) IsSeaRobberBlockingEdge(e *entities.Edge) bool {
	if g.Mode != entities.Seafarers || g.Pirate == nil || g.Pirate.Tile == nil || g.Pirate.Tile.Type != entities.TileTypeSea {
		return false
	}
	for _, t := range e.AdjacentTiles {
		if t == g.Pirate.Tile {
			return true
		}
	}
	return false
}

func (g *Game) BuildShip(player *entities.Player, c entities.EdgeCoordinate) error {
	if g.Mode != entities.Seafarers {
		return errors.New("ships are only available in Seafarers")
	}
	init := g.IsInitPhase()

	if err := g.EnsureCurrentPlayer(player); err != nil && !init {
		return err
	}

	if err := g.ensureDiceRolled(); err != nil {
		return err
	}

	if err := g.ensureCanBuild(player, entities.BTShip); !init && err != nil {
		return err
	}

	canBuild := func() bool {
		for _, e := range player.GetBuildLocationsShip(g.Graph) {
			if (e.C.C1 == c.C1 && e.C.C2 == c.C2) || (e.C.C1 == c.C2 && e.C.C2 == c.C1) {
				return true
			}
		}
		return false
	}

	if !canBuild() {
		return errors.New("cannot build ship here")
	}

	e, err := g.Graph.GetEdge(c)
	if err != nil {
		return err
	}
	if !e.IsWaterEdge() {
		return errors.New("ships can only be built on water edges")
	}
	if g.IsSeaRobberBlockingEdge(e) {
		return errors.New("pirate blocks this edge")
	}

	if !g.IsCreativeMode() {
		g.MoveCards(int(player.Order), -1, entities.CardTypeWood, 1, false, false)
		g.MoveCards(int(player.Order), -1, entities.CardTypeWool, 1, false, false)
	}

	err = player.BuildAtEdge(e, entities.BTShip)
	if err != nil {
		return err
	}
	player.BuildablesLeft[entities.BTShip]--
	if player.ShipsBuiltThisTurn == nil {
		player.ShipsBuiltThisTurn = make(map[*entities.Edge]bool)
	}
	player.ShipsBuiltThisTurn[e] = true
	g.RevealFogAdjacentToEdge(player, e)

	g.SetExtraVictoryPoints()
	g.SendPlayerSecret(player)
	g.BroadcastState()
	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeEdgePlacement,
		Data: e.Placement,
	})
	g.j.WEdgeBuild(e)
	g.applyCurrentPlayerTimerBonus(player, g.TimerVals.ActionBonusPlaceRoad)
	g.CheckForVictory()

	return nil
}

func (g *Game) GetMovableShips(player *entities.Player) []*entities.Edge {
	movable := make([]*entities.Edge, 0)

	shipDegreeAtVertex := func(v *entities.Vertex, exclude *entities.Edge) int {
		deg := 0
		for _, adjE := range g.Graph.GetAdjacentVertexEdges(v) {
			if adjE == exclude || adjE.Placement == nil || adjE.Placement.GetOwner() != player || adjE.Placement.GetType() != entities.BTShip {
				continue
			}
			deg++
		}
		return deg
	}

	hasOwnBuildingAtVertex := func(v *entities.Vertex) bool {
		if v == nil || v.Placement == nil || v.Placement.GetOwner() != player {
			return false
		}
		t := v.Placement.GetType()
		return t == entities.BTSettlement || t == entities.BTCity
	}

	for _, ep := range player.EdgePlacements {
		if ep.GetType() != entities.BTShip {
			continue
		}
		e := ep.GetLocation()
		if player.ShipsBuiltThisTurn[e] {
			continue
		}
		if g.IsSeaRobberBlockingEdge(e) {
			continue
		}

		v1, _ := g.Graph.GetVertex(e.C.C1)
		v2, _ := g.Graph.GetVertex(e.C.C2)
		if v1 == nil || v2 == nil {
			continue
		}

		isEndpoint := func(v *entities.Vertex) bool {
			if hasOwnBuildingAtVertex(v) {
				return false
			}
			return shipDegreeAtVertex(v, e) == 0
		}

		if isEndpoint(v1) || isEndpoint(v2) {
			movable = append(movable, e)
		}
	}

	return movable
}

func (g *Game) MoveShip(player *entities.Player, fromC, toC entities.EdgeCoordinate) error {
	if g.Mode != entities.Seafarers {
		return errors.New("ships are only available in Seafarers")
	}
	if err := g.EnsureCurrentPlayer(player); err != nil {
		return err
	}
	if g.DiceState != 0 {
		return errors.New("ship movement is only allowed before rolling dice")
	}
	if player.ShipMoved {
		return errors.New("already moved a ship this turn")
	}

	allowed := g.GetMovableShips(player)
	isAllowedFrom := false
	for _, e := range allowed {
		if (e.C.C1 == fromC.C1 && e.C.C2 == fromC.C2) || (e.C.C1 == fromC.C2 && e.C.C2 == fromC.C1) {
			isAllowedFrom = true
			break
		}
	}
	if !isAllowedFrom {
		return errors.New("this ship cannot be moved")
	}

	from, err := g.Graph.GetEdge(fromC)
	if err != nil || from.Placement == nil || from.Placement.GetOwner() != player || from.Placement.GetType() != entities.BTShip {
		return errors.New("invalid source ship")
	}

	if err := from.RemovePlacement(); err != nil {
		return err
	}
	g.j.WEdgeBuild(from)
	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeEdgePlacementRem,
		Data: &entities.Road{Owner: player, Location: from, Type: entities.BTShip},
	})

	defer func() {
		// If placement failed, we should have restored before returning with error.
		g.BroadcastState()
	}()

	canBuild := false
	for _, e := range player.GetBuildLocationsShip(g.Graph) {
		if (e.C.C1 == toC.C1 && e.C.C2 == toC.C2) || (e.C.C1 == toC.C2 && e.C.C2 == toC.C1) {
			canBuild = true
			break
		}
	}
	if !canBuild {
		player.BuildAtEdge(from, entities.BTShip)
		g.j.WEdgeBuild(from)
		return errors.New("invalid destination for moved ship")
	}

	to, err := g.Graph.GetEdge(toC)
	if err != nil || !to.IsWaterEdge() || g.IsSeaRobberBlockingEdge(to) {
		player.BuildAtEdge(from, entities.BTShip)
		g.j.WEdgeBuild(from)
		return errors.New("destination edge is blocked")
	}

	if err := player.BuildAtEdge(to, entities.BTShip); err != nil {
		player.BuildAtEdge(from, entities.BTShip)
		g.j.WEdgeBuild(from)
		return err
	}
	g.j.WEdgeBuild(to)
	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeEdgePlacement,
		Data: to.Placement,
	})
	player.ShipMoved = true
	g.SetExtraVictoryPoints()
	g.SendPlayerSecret(player)
	g.CheckForVictory()
	return nil
}

func (g *Game) MoveShipInteractive(player *entities.Player) error {
	if g.Mode != entities.Seafarers {
		return errors.New("ships are only available in Seafarers")
	}
	if err := g.EnsureCurrentPlayer(player); err != nil {
		return err
	}
	if g.DiceState != 0 {
		return errors.New("ship movement is only allowed before rolling dice")
	}
	if player.ShipMoved {
		return errors.New("already moved a ship this turn")
	}

	movable := g.GetMovableShips(player)
	if len(movable) == 0 {
		return errors.New("no movable ships")
	}

	resFrom, err := g.BlockForAction(player, 0, &entities.PlayerAction{
		Type:      entities.PlayerActionTypeChooseEdge,
		Message:   "Choose ship to move",
		CanCancel: true,
		Data: entities.PlayerActionChooseEdge{
			Allowed: movable,
		},
	})
	if err != nil || resFrom == nil {
		return err
	}

	var fromC entities.EdgeCoordinate
	if err := mapstructure.Decode(resFrom, &fromC); err != nil {
		return err
	}
	from, err := g.Graph.GetEdge(fromC)
	if err != nil || from.Placement == nil || from.Placement.GetOwner() != player || from.Placement.GetType() != entities.BTShip {
		return errors.New("invalid ship selection")
	}

	// Temporarily remove selected ship to calculate destination edges.
	if err := from.RemovePlacement(); err != nil {
		return err
	}
	restore := true
	defer func() {
		if restore && from.Placement == nil {
			_ = player.BuildAtEdge(from, entities.BTShip)
		}
	}()

	destinations := make([]*entities.Edge, 0)
	for _, e := range player.GetBuildLocationsShip(g.Graph) {
		if e == from || g.IsSeaRobberBlockingEdge(e) {
			continue
		}
		destinations = append(destinations, e)
	}
	if len(destinations) == 0 {
		return errors.New("no valid destination for selected ship")
	}

	resTo, err := g.BlockForAction(player, 0, &entities.PlayerAction{
		Type:      entities.PlayerActionTypeChooseEdge,
		Message:   "Choose destination for ship",
		CanCancel: true,
		Data: entities.PlayerActionChooseEdge{
			Allowed: destinations,
		},
	})
	if err != nil || resTo == nil {
		return err
	}
	restore = true
	_ = player.BuildAtEdge(from, entities.BTShip)

	var toC entities.EdgeCoordinate
	if err := mapstructure.Decode(resTo, &toC); err != nil {
		return err
	}

	restore = false
	return g.MoveShip(player, fromC, toC)
}

func (g *Game) BuyDevelopmentCard(player *entities.Player) error {
	if err := g.EnsureCurrentPlayer(player); err != nil {
		return err
	}

	if err := g.ensureDiceRolled(); err != nil {
		return err
	}

	if (!g.IsCreativeMode() && !player.CanBuyDevelopmentCard()) || g.Bank.DevelopmentCardCursor >= len(g.Bank.DevelopmentCardOrder[0]) {
		return errors.New("cannot buy development card")
	}

	if !g.IsCreativeMode() {
		g.MoveCards(int(player.Order), -1, entities.CardTypeWool, 1, true, false)
		g.MoveCards(int(player.Order), -1, entities.CardTypeWheat, 1, true, false)
		g.MoveCards(int(player.Order), -1, entities.CardTypeOre, 1, true, false)
	}

	developmentCardType := g.Bank.DevelopmentCardOrder[0][g.Bank.DevelopmentCardCursor]
	g.Bank.DevelopmentCardCursor++
	g.j.WDevelopmentCardCursor(g.Bank.DevelopmentCardCursor)

	developmentCardDeck := player.CurrentHand.GetDevelopmentCardDeck(developmentCardType)
	developmentCardDeck.Quantity += 1
	g.MoveDevelopmentCard(-1, int(player.Order), developmentCardType, true)
	g.j.WUpdateDevelopmentCard(player, developmentCardType, developmentCardDeck.Quantity, developmentCardDeck.NumUsed, developmentCardDeck.CanUse)

	g.SendPlayerSecret(player)
	g.BroadcastState()
	if g.SpecialBuildPhase {
		g.applyCurrentPlayerTimerBonus(
			player,
			g.TimerVals.ActionBonusNonTurnStateBoughtDevelopmentCard,
		)
	}

	g.CheckForVictory()

	return nil
}

func (g *Game) BuildKnight(player *entities.Player, coordinates entities.Coordinate) error {
	if err := g.EnsureCurrentPlayer(player); err != nil {
		return err
	}

	if err := g.ensureDiceRolled(); err != nil {
		return err
	}

	vertex, _ := g.Graph.GetVertex(coordinates)
	if vertex == nil {
		return errors.New("no such vertex")
	}

	knightType := entities.BTKnight1
	if vertex.Placement != nil {
		if vertex.Placement.GetType() == entities.BTKnight1 {
			knightType = entities.BTKnight2
		} else if vertex.Placement.GetType() == entities.BTKnight2 {
			// No need to check for politics bonus here
			// That check is done in locations
			knightType = entities.BTKnight3
		}
	}

	if err := g.ensureCanBuild(player, knightType); err != nil {
		return err
	}

	canBuild := func() bool {
		for _, v := range player.GetBuildLocationsKnight(g.Graph, true) {
			if v.C == coordinates {
				return true
			}
		}
		return false
	}

	if !canBuild() {
		return errors.New("cannot build warrior here")
	}

	if !g.IsCreativeMode() {
		g.MoveCards(int(player.Order), -1, entities.CardTypeWool, 1, false, false)
		g.MoveCards(int(player.Order), -1, entities.CardTypeOre, 1, false, false)
	}

	isActivated := false
	if vertex.Placement != nil {
		player.BuildablesLeft[vertex.Placement.GetType()]++
		isActivated = vertex.Placement.(*entities.Knight).Activated
		vertex.RemovePlacement()
	}

	err := player.BuildAtVertex(vertex, knightType)
	if err != nil {
		return err
	}

	vertex.Placement.(*entities.Knight).Activated = isActivated
	vertex.Placement.(*entities.Knight).CanUse = isActivated
	player.BuildablesLeft[knightType]--

	g.SetExtraVictoryPoints()

	g.SendPlayerSecret(player)
	g.BroadcastState()

	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeVertexPlacement,
		Data: vertex.Placement,
	})

	g.j.WVertexBuild(vertex, false)

	g.CheckForVictory()

	return nil
}

func (g *Game) ActivateKnight(player *entities.Player, coordinates entities.Coordinate) error {
	if err := g.EnsureCurrentPlayer(player); err != nil {
		return err
	}

	if err := g.ensureDiceRolled(); err != nil {
		return err
	}

	vertex, _ := g.Graph.GetVertex(coordinates)
	if vertex == nil {
		return errors.New("no such vertex")
	}

	// Also makes sure if there is a knight at this position
	// that is not activated
	canActivate := func() bool {
		for _, v := range player.GetActivateLocationsKnight(g.Graph) {
			if v.C == coordinates {
				return true
			}
		}
		return false
	}

	if !canActivate() {
		return errors.New("cannot activate warrior here")
	}

	if !g.IsCreativeMode() && !player.CurrentHand.HasResources(0, 0, 0, 1, 0) {
		return errors.New("not enough resources")
	}

	if !g.IsCreativeMode() {
		g.MoveCards(int(player.Order), -1, entities.CardTypeWheat, 1, true, false)
	}

	g.setKnightActive(vertex, true, false)
	g.SendPlayerSecret(player)
	g.BroadcastState()

	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeVertexPlacement,
		Data: vertex.Placement,
	})

	return nil
}

func (g *Game) setKnightActive(vertex *entities.Vertex, active bool, canuse bool) {
	if vertex.Placement != nil &&
		vertex.Placement.GetType() >= entities.BTKnight1 &&
		vertex.Placement.GetType() <= entities.BTKnight3 {

		k := vertex.Placement.(*entities.Knight)
		k.Activated = active
		k.CanUse = canuse
		g.j.WSetKnightActive(k)
	}
}

func (g *Game) BuildWall(player *entities.Player, coordinates entities.Coordinate) error {
	if err := g.EnsureCurrentPlayer(player); err != nil {
		return err
	}

	if err := g.ensureDiceRolled(); err != nil {
		return err
	}

	if err := g.ensureCanBuild(player, entities.BTWall); err != nil {
		return err
	}

	vertex, _ := g.Graph.GetVertex(coordinates)
	if vertex == nil {
		return errors.New("no such vertex")
	}

	canBuild := func() bool {
		for _, v := range player.GetBuildLocationsWall(g.Graph) {
			if v.C == coordinates {
				return true
			}
		}
		return false
	}

	if !canBuild() {
		return errors.New("cannot build fence here")
	}

	if !g.IsCreativeMode() {
		g.MoveCards(int(player.Order), -1, entities.CardTypeBrick, 2, false, false)
	}
	player.BuildablesLeft[entities.BTWall]--
	vertex.Placement.(*entities.City).Wall = true
	g.j.WBuildWall(player, vertex)

	g.SendPlayerSecret(player)
	g.BroadcastState()

	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeVertexPlacement,
		Data: vertex.Placement,
	})

	return nil
}

func (g *Game) KnightChaseRobber(player *entities.Player, dry bool) error {
	if err := g.EnsureCurrentPlayer(player); err != nil {
		return err
	}

	if err := g.ensureDiceRolled(); err != nil {
		return err
	}

	if err := g.ensureNotSpecialBuildPhase(); err != nil {
		return err
	}

	if g.Robber.Tile == nil {
		return errors.New("no robber tile")
	}

	vertices := make([]*entities.Vertex, 0)
	for _, vp := range g.Graph.GetTilePlacements(g.Robber.Tile) {
		if vp.GetOwner() == player && vp.GetType() >= entities.BTKnight1 && vp.GetType() <= entities.BTKnight3 {
			k := vp.(*entities.Knight)
			if k.CanUse && k.Activated {
				vertices = append(vertices, k.GetLocation())
			}
		}
	}

	if len(vertices) == 0 {
		return errors.New("no adjacent activated knight to robber")
	}

	if dry {
		return nil
	}

	exp, err := g.BlockForAction(player, 0, &entities.PlayerAction{
		Type:      entities.PlayerActionTypeChooseVertex,
		Message:   "Choose warrior to chase away the robber",
		Data:      entities.PlayerActionChooseVertex{Allowed: vertices},
		CanCancel: true,
	})
	if err != nil {
		return err
	}

	var loc entities.Coordinate
	mapstructure.Decode(exp, &loc)
	v, _ := g.Graph.GetVertex(loc)

	if player.GetIsBot() {
		v = vertices[rand.Intn(len(vertices))]
	}

	found := false
	for _, ov := range vertices {
		if ov == v {
			found = true
			break
		}
	}
	if !found {
		return nil
	}

	g.setKnightActive(v, false, false)
	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeVertexPlacement,
		Data: v.Placement,
	})

	g.MoveRobberInteractive(g.TimerVals.PlaceRobber)
	g.StealCardWithRobber()

	return nil
}

func (g *Game) KnightMove(player *entities.Player, dry bool) error {
	if err := g.EnsureCurrentPlayer(player); err != nil {
		return err
	}

	if err := g.ensureDiceRolled(); err != nil {
		return err
	}

	if err := g.ensureNotSpecialBuildPhase(); err != nil {
		return err
	}

	vertices := make([]*entities.Vertex, 0)
	for _, vp := range player.VertexPlacements {
		if vp.GetType() >= entities.BTKnight1 && vp.GetType() <= entities.BTKnight3 {
			k := vp.(*entities.Knight)
			if k.CanUse && k.Activated {
				vertices = append(vertices, k.GetLocation())
			}
		}
	}

	if len(vertices) == 0 {
		return errors.New("no warrior to move")
	}

	if dry {
		return nil
	}

	exp, err := g.BlockForAction(player, 0, &entities.PlayerAction{
		Type:      entities.PlayerActionTypeChooseVertex,
		Message:   "Choose warrior to move",
		Data:      entities.PlayerActionChooseVertex{Allowed: vertices},
		CanCancel: true,
	})
	if err != nil {
		return err
	}

	var loc entities.Coordinate
	mapstructure.Decode(exp, &loc)
	v, _ := g.Graph.GetVertex(loc)
	found := false
	for _, ov := range vertices {
		if ov == v {
			found = true
			break
		}
	}
	if !found {
		return nil
	}

	vmap := player.KnightDFS(g.Graph, v, nil)
	destVertices := make([]*entities.Vertex, 0)
	for dv, _ := range vmap {
		if dv.Placement == nil ||
			(dv.Placement.GetOwner() != player &&
				dv.Placement.GetType() >= entities.BTKnight1 &&
				dv.Placement.GetType() < v.Placement.GetType()) {
			destVertices = append(destVertices, dv)
		}
	}

	if len(destVertices) == 0 {
		return errors.New("no place to move")
	}

	exp, err = g.BlockForAction(player, 0, &entities.PlayerAction{
		Type:      entities.PlayerActionTypeChooseVertex,
		Message:   "Choose location for warrior",
		Data:      entities.PlayerActionChooseVertex{Allowed: destVertices},
		CanCancel: true,
	})
	if err != nil {
		return err
	}

	var destLoc entities.Coordinate
	mapstructure.Decode(exp, &destLoc)
	destV, _ := g.Graph.GetVertex(destLoc)
	found = false
	for _, ov := range destVertices {
		if ov == destV {
			found = true
			break
		}
	}
	if !found {
		return nil
	}

	if v == destV {
		return nil
	}

	// move knight
	if destV.Placement != nil {
		g.DisplaceKnightInteractive(destV.Placement.(*entities.Knight))
	}

	// Move knight
	g.setKnightActive(v, false, false)
	g.MovePlacement(v, destV)

	g.SetExtraVictoryPoints()
	g.CheckForVictory()

	g.SendPlayerSecret(player)
	g.BroadcastState()

	return nil
}

func (g *Game) DisplaceKnightInteractive(k *entities.Knight) {
	// The vertex of k will not be included (location)
	// The placement at vertex should not be reassigned already
	if g.j.playing || k == nil {
		return
	}

	vmap := k.GetOwner().KnightDFS(g.Graph, k.GetLocation(), nil)
	vertices := make([]*entities.Vertex, 0)
	for v := range vmap {
		if v != k.Location && v.Placement == nil { // no re-displacement
			vertices = append(vertices, v)
		}
	}

	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeVertexPlacementRem,
		Data: k,
	})

	if len(vertices) == 0 {
		// gone with the wind
		k.GetLocation().RemovePlacement()
		k.GetOwner().BuildablesLeft[k.GetType()]++
		g.j.WVertexBuild(k.GetLocation(), true)
		return
	}

	exp, err := g.BlockForAction(k.GetOwner(), g.TimerVals.SelectCardsToDiscard, &entities.PlayerAction{
		Type:      entities.PlayerActionTypeChooseVertex,
		Message:   "Choose location for warrior",
		Data:      entities.PlayerActionChooseVertex{Allowed: vertices},
		CanCancel: true,
	})
	if err != nil {
		return
	}

	var destLoc entities.Coordinate
	mapstructure.Decode(exp, &destLoc)
	destV, _ := g.Graph.GetVertex(destLoc)
	found := false
	for _, ov := range vertices {
		if ov == destV {
			found = true
			break
		}
	}
	if !found {
		destV = vertices[0]
	}

	g.MovePlacement(k.GetLocation(), destV)
	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeVertexPlacement,
		Data: destV.Placement,
	})

	g.SetExtraVictoryPoints()
	g.CheckForVictory()

	g.SendPlayerSecret(k.GetOwner())
	g.BroadcastState()
}

func (g *Game) MovePlacement(from *entities.Vertex, to *entities.Vertex) {
	// to (dest) SHOULD be empty
	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeVertexPlacementRem,
		Data: from.Placement,
	})

	from.Placement.SetLocation(to)
	to.Placement = from.Placement
	from.Placement = nil
	g.j.WMovePlacement(from, to)

	g.BroadcastMessage(&entities.Message{
		Type: entities.MessageTypeVertexPlacement,
		Data: to.Placement,
	})
}

func (g *Game) CanEndTurn() error {
	if g.HasPlayerPendingAction() {
		return errors.New("waiting for someone")
	}

	if g.DiceState == 0 {
		return errors.New("not rolled dice this turn")
	}

	return nil
}

func (g *Game) EndTurn(player *entities.Player) error {
	if err := g.EnsureCurrentPlayer(player); err != nil {
		return err
	}

	if err := g.CanEndTurn(); err != nil {
		return err
	}

	g.j.WEndTurn(player)

	g.CurrentOffers = make([]*entities.TradeOffer, 0)
	g.resetTimeLeft()

	if g.Settings.SpecialBuild {
		if g.SpecialBuildStarter == nil {
			g.SpecialBuildStarter = player
		}

		nextPlayer := -1
		for i := 1; i <= len(g.Players); i++ {
			p := g.Players[(int(player.Order)+i)%len(g.Players)]
			if p == g.SpecialBuildStarter {
				break
			}
			if p.SpecialBuild {
				nextPlayer = int(p.Order)
				g.SetPlayerSpecialBuild(g.Players[nextPlayer], false)
				break
			}
		}

		if nextPlayer == -1 {
			g.CurrentPlayer = g.Players[int(g.SpecialBuildStarter.Order+1)%len(g.Players)]
			prevStarter := g.SpecialBuildStarter
			g.SpecialBuildPhase = false
			g.SpecialBuildStarter = nil
			for _, p := range g.Players {
				if p.SpecialBuild {
					g.SetPlayerSpecialBuild(p, false)
				}
			}

			if prevStarter != player {
				g.SendPlayerSecret(prevStarter)
			}
		} else {
			g.CurrentPlayer = g.Players[nextPlayer]
			g.SpecialBuildPhase = true
		}
	} else {
		currentPlayerIndex := int(g.CurrentPlayer.Order+1) % len(g.Players)
		g.CurrentPlayer = g.Players[currentPlayerIndex]
	}

	if !g.SpecialBuildPhase {
		g.DiceState = 0
		g.EndTurnResetDevelopmentCards()
		g.CurrentPlayer.ResetTurnState()
		g.setCurrentPlayerTimeLeft(g.TimerVals.Dice)
		g.onScenarioTurnStart(g.CurrentPlayer)
	} else {
		g.setCurrentPlayerTimeLeft(g.TimerVals.ActionBonusPlaceRoad)
	}

	// Previous player
	if player != g.CurrentPlayer { // Possible in case of build phase
		if g.Mode == entities.CitiesAndKnights {
			if player.CurrentHand.GetDevelopmentCardCount() > 4 {
				g.DiscardProgressCard(player)
			}
		}

		for _, deck := range player.CurrentHand.DevelopmentCardDeckMap {
			deck.CanUse = false
		}
	}

	g.SendPlayerSecret(player)
	g.SendPlayerSecret(g.CurrentPlayer)
	g.BroadcastState()
	g.BroadcastMessage(&entities.Message{Type: entities.MessageTypeTradeCloseOffers})

	g.ai.Reset()

	return nil
}

func (g *Game) EndTurnResetDevelopmentCards() {
	// Make all development cards usable
	if g.Mode == entities.Base || g.Mode == entities.Seafarers {
		for _, deck := range g.CurrentPlayer.CurrentHand.DevelopmentCardDeckMap {
			if deck.Quantity > 0 && deck.Type != entities.DevelopmentCardVictoryPoint {
				deck.CanUse = true
			}
		}
	} else if g.Mode == entities.CitiesAndKnights {
		g.CurrentPlayer.CurrentHand.GetDevelopmentCardDeck(entities.ProgressPaperAlchemist).CanUse = true
		g.MerchantFleets = [9]int{-1, 4, 4, 4, 4, 4, 4, 4, 4}

		for _, vp := range g.CurrentPlayer.VertexPlacements {
			if vp.GetType() >= entities.BTKnight1 && vp.GetType() <= entities.BTKnight3 {
				k := vp.(*entities.Knight)
				k.CanUse = k.Activated
			}
		}
	}
}

func (g *Game) GetRatiosForPlayer(player *entities.Player) [9]int {
	MergeRatios := func(a, b [9]int) [9]int {
		var c [9]int
		for i := 0; i < 9; i++ {
			if a[i] < b[i] {
				c[i] = a[i]
			} else {
				c[i] = b[i]
			}
		}
		return c
	}

	GetRatiosForPortType := func(portType entities.PortType) [9]int {
		switch portType {
		case entities.PortTypeAny:
			return [9]int{-1, 3, 3, 3, 3, 3, 3, 3, 3}
		case entities.PortTypeWood:
			return [9]int{-1, 2, 4, 4, 4, 4, 4, 4, 4}
		case entities.PortTypeBrick:
			return [9]int{-1, 4, 2, 4, 4, 4, 4, 4, 4}
		case entities.PortTypeWool:
			return [9]int{-1, 4, 4, 2, 4, 4, 4, 4, 4}
		case entities.PortTypeWheat:
			return [9]int{-1, 4, 4, 4, 2, 4, 4, 4, 4}
		case entities.PortTypeOre:
			return [9]int{-1, 4, 4, 4, 4, 2, 4, 4, 4}
		default:
			return [9]int{-1, 4, 4, 4, 4, 4, 4, 4, 4}
		}
	}

	GetRatiosForPortVertex := func(vertex *entities.Vertex, portType entities.PortType) [9]int {
		if vertex != nil &&
			vertex.Placement != nil &&
			vertex.Placement.GetOwner().Order == player.Order &&
			(vertex.Placement.GetType() == entities.BTCity ||
				vertex.Placement.GetType() == entities.BTSettlement) {
			return GetRatiosForPortType(portType)
		} else {
			return [9]int{-1, 4, 4, 4, 4, 4, 4, 4, 4}
		}
	}

	defaultRatios := [9]int{-1, 4, 4, 4, 4, 4, 4, 4, 4}
	ratios := defaultRatios
	for _, port := range g.Ports {
		vertex1, vertex2 := port.Vertices[0], port.Vertices[1]
		ratios1 := GetRatiosForPortVertex(vertex1, port.Type)
		ratios = MergeRatios(ratios, ratios1)
		ratios2 := GetRatiosForPortVertex(vertex2, port.Type)
		ratios = MergeRatios(ratios, ratios2)
	}

	if g.Mode == entities.CitiesAndKnights {
		if player.Improvements[int(entities.CardTypeCloth)] >= 3 {
			tradingHouseRatios := [9]int{-1, 4, 4, 4, 4, 4, 2, 2, 2}
			ratios = MergeRatios(ratios, tradingHouseRatios)
		}

		if g.Merchant.Owner == player {
			merchantRatios := [9]int{-1, 4, 4, 4, 4, 4, 4, 4, 4}
			merchantRatios[int(g.Merchant.Tile.Type)] = 2
			ratios = MergeRatios(ratios, merchantRatios)
		}

		ratios = MergeRatios(ratios, g.MerchantFleets)
	}

	return ratios
}

func (g *Game) CanTradeWithBank(player *entities.Player, offerDetails *entities.TradeOfferDetails) error {
	ratios := g.GetRatiosForPlayer(player)
	numCardsPossible, numCardsRequested := 0, 0

	for i, val := range offerDetails.Give {
		if val <= 0 {
			continue
		}

		deck := player.CurrentHand.GetCardDeck(entities.CardType(i))
		if deck == nil {
			return errors.New("no such card type - " + strconv.Itoa(i))
		}
		if deck.Quantity < int16(val) {
			return errors.New("cannot trade with bank, not enough cards in hand")
		}

		if val > 0 && val%ratios[i] != 0 {
			return errors.New("cannot trade with bank, invalid exchange")
		} else {
			numCardsPossible += int(val / ratios[i])
		}
	}

	for i, val := range offerDetails.Ask {
		if val <= 0 {
			continue
		}

		deck := g.Bank.Hand.GetCardDeck(entities.CardType(i))
		if deck == nil {
			return errors.New("no such card type - " + strconv.Itoa(i))
		}

		if val > 0 && deck.Quantity < int16(val) {
			return errors.New("cannot trade with bank, not enough cards in bank")
		}

		numCardsRequested += int(val)
	}

	if numCardsPossible != numCardsRequested {
		return errors.New("cannot trade with bank")
	}

	return nil
}

func (g *Game) CanTradeBetweenPlayers(acceptingPlayer *entities.Player, offerDetails *entities.TradeOfferDetails) error {
	for i, val := range offerDetails.Ask {
		if val <= 0 {
			continue
		}

		acceptingDeck := acceptingPlayer.CurrentHand.GetCardDeck(entities.CardType(i))
		if acceptingDeck == nil {
			return errors.New("no such card type - " + strconv.Itoa(i))
		}

		if val > 0 && acceptingDeck.Quantity < int16(val) {
			return errors.New("cannot trade with player, accepting player does not have enough cards in hand")
		}
	}

	for i, val := range offerDetails.Give {
		if val <= 0 {
			continue
		}

		givingDeck := g.CurrentPlayer.CurrentHand.GetCardDeck(entities.CardType(i))
		if givingDeck == nil {
			return errors.New("no such card type - " + strconv.Itoa(i))
		}

		if val > 0 && givingDeck.Quantity < int16(val) {
			return errors.New("cannot trade with player, current player does not have enough cards in hand")
		}
	}

	return nil
}

func (g *Game) Trade(player *entities.Player, acceptingPlayer *entities.Player, bank *entities.Bank, offerDetails *entities.TradeOfferDetails) error {
	if acceptingPlayer == nil && bank == nil {
		return errors.New("no accepting player or bank provided")
	}

	if acceptingPlayer != nil && bank != nil {
		return errors.New("cannot trade with both accepting player and bank")
	}

	askOrder := -1
	if acceptingPlayer != nil {
		askOrder = int(acceptingPlayer.Order)
	}

	for i, val := range offerDetails.Give {
		if val <= 0 {
			continue
		}
		cardType := entities.CardType(i)
		g.MoveCards(int(player.Order), askOrder, cardType, val, true, false)
	}

	for i, val := range offerDetails.Ask {
		if val <= 0 {
			continue
		}
		cardType := entities.CardType(i)
		g.MoveCards(askOrder, int(player.Order), cardType, val, true, false)
	}

	g.SendPlayerSecret(player)
	if acceptingPlayer != nil {
		g.SendPlayerSecret(acceptingPlayer)
	}
	g.BroadcastState()

	// Clear offers
	g.CurrentOffers = make([]*entities.TradeOffer, 0)
	g.BroadcastMessage(&entities.Message{Type: entities.MessageTypeTradeCloseOffers})

	return nil
}
func (g *Game) TradeWithBank(player *entities.Player, offerDetails *entities.TradeOfferDetails) error {
	return g.Trade(player, nil, g.Bank, offerDetails)
}

func (g *Game) TradeWithPlayer(player *entities.Player, acceptingPlayer *entities.Player, offerDetails *entities.TradeOfferDetails) error {
	return g.Trade(player, acceptingPlayer, nil, offerDetails)
}

func (g *Game) GetTradeOfferMessage(offer *entities.TradeOffer) *entities.Message {
	return &entities.Message{
		Location: entities.WsMsgLocationGame,
		Type:     entities.MessageTypeTradeOffer,
		Data:     offer,
	}
}

func (g *Game) CreateOffer(player *entities.Player, offerDetails *entities.TradeOfferDetails, tradeMode string) (*entities.TradeOffer, error) {
	if g.HasPlayerPendingAction() {
		return nil, errors.New("wait for player to finish action")
	}

	if err := g.ensureDiceRolled(); err != nil {
		return nil, err
	}

	if err := g.ensureNotSpecialBuildPhase(); err != nil {
		return nil, err
	}

	giveSum, askSum := 0, 0
	for i, val := range offerDetails.Give {
		if val <= 0 {
			continue
		}
		giveSum += int(val)

		if offerDetails.Ask[i] > 0 {
			return nil, errors.New("cannot give and take the same resource")
		}

		deck := player.CurrentHand.GetCardDeck(entities.CardType(i))
		if deck == nil {
			return nil, errors.New("no such card type - " + strconv.Itoa(i))
		}

		if deck.Quantity < int16(val) {
			return nil, errors.New("cannot give more than you have")
		}
	}

	for _, val := range offerDetails.Ask {
		if val <= 0 {
			continue
		}
		askSum += int(val)
	}

	if giveSum <= 0 {
		return nil, errors.New("cannot give nothing")
	}

	if askSum <= 0 {
		return nil, errors.New("cannot ask for nothing")
	}

	g.OfferCounter++
	offerId := g.OfferCounter

	if player == g.CurrentPlayer {
		// New offer from current player.
		switch tradeMode {
		case "bank":
			if err := g.CanTradeWithBank(player, offerDetails); err != nil {
				return nil, err
			}
			player.SendAction(&entities.PlayerAction{Type: entities.PlayerActionTypeSelectCardsDone})
			return nil, g.TradeWithBank(player, offerDetails)
		case "auto", "":
			if err := g.CanTradeWithBank(player, offerDetails); err == nil {
				player.SendAction(&entities.PlayerAction{Type: entities.PlayerActionTypeSelectCardsDone})
				return nil, g.TradeWithBank(player, offerDetails)
			}
		}
	} else {
		// Counter offer
		// Make sure at least one offer exists from current player
		if len(g.CurrentOffers) == 0 {
			return nil, errors.New("need an existing offer to make a counter offer")
		}

		// Always store from POV of current player
		give := offerDetails.Give
		ask := offerDetails.Ask
		offerDetails.Give = ask
		offerDetails.Ask = give

		// Assign offer Id as player order
		offerId = int(player.Order)

		// Check if offer already exists and destroy
		offer := g.GetOffer(offerId)
		if offer != nil {
			g.DestroyOffer(offer)
		}
	}

	for _, o := range g.CurrentOffers {
		if reflect.DeepEqual(offerDetails, o.Details) {
			return o, errors.New("offer already exists")
		}
	}

	offer := &entities.TradeOffer{
		Id:            offerId,
		Details:       offerDetails,
		CurrentPlayer: g.CurrentPlayer.Order,
		CreatedBy:     player.Order,
		Acceptances:   make([]int, len(g.Players)),
	}

	offer.Acceptances[player.Order] = 1
	for i, p := range g.Players {
		if p.Embargos[g.CurrentPlayer.Order] {
			offer.Acceptances[i] = -1
		}
	}

	g.CurrentOffers = append(g.CurrentOffers, offer)
	g.BroadcastMessage(g.GetTradeOfferMessage(offer))

	return offer, nil
}

func (g *Game) GetOffer(offerId int) *entities.TradeOffer {
	for _, o := range g.CurrentOffers {
		if o.Id == offerId {
			return o
		}
	}
	return nil
}

func (g *Game) AcceptOffer(offerId int, player *entities.Player) error {
	if err := g.EnsureCurrentPlayer(player); err == nil {
		return errors.New("cannot accept your own offer")
	}

	offer := g.GetOffer(offerId)
	if offer == nil {
		return errors.New("no offer to accept")
	}

	if offer.Acceptances[player.Order] == 1 {
		return nil
	}

	for i, q := range offer.Details.Ask {
		deck := player.CurrentHand.GetCardDeck(entities.CardType(i))
		if q > 0 && (deck == nil || int(deck.Quantity) < q) {
			return errors.New("not enough cards")
		}
	}

	offer.Acceptances[player.Order] = 1

	g.BroadcastMessage(g.GetTradeOfferMessage(offer))
	if g.SpecialBuildPhase {
		g.applyCurrentPlayerTimerBonus(
			player,
			g.TimerVals.ActionBonusNonTurnStateAcceptingTrade,
		)
	}

	return nil
}

func (g *Game) RejectOffer(offerId int, player *entities.Player) (*entities.TradeOffer, error) {
	offer := g.GetOffer(offerId)
	if offer == nil {
		return nil, errors.New("no offer to reject")
	}

	offer.Acceptances[player.Order] = -1

	if offer.CreatedBy == player.Order || offer.CurrentPlayer == player.Order {
		g.DestroyOffer(offer)
	}

	g.BroadcastMessage(g.GetTradeOfferMessage(offer))

	return offer, nil
}

func (g *Game) DestroyOffer(offer *entities.TradeOffer) {
	if offer == nil || offer.Destroyed {
		return
	}

	newOffers := make([]*entities.TradeOffer, len(g.CurrentOffers)-1)
	i := 0
	for _, o := range g.CurrentOffers {
		if o.Id != offer.Id {
			if i < len(newOffers) {
				newOffers[i] = o
				i++
			} else {
				newOffers = append(newOffers, o)
			}
		}
	}
	g.CurrentOffers = newOffers
	offer.Destroyed = true
}

func (g *Game) CloseOffer(offerId int, player *entities.Player, acceptingPlayerOrder uint16) error {
	if err := g.EnsureCurrentPlayer(player); err != nil {
		return err
	}

	offer := g.GetOffer(offerId)
	if offer == nil {
		return errors.New("the other player retracted the offer")
	}

	if offer.Acceptances[acceptingPlayerOrder] != 1 {
		return errors.New("cannot close an offer not accepted by the other party")
	}

	err := g.CanTradeBetweenPlayers(g.Players[acceptingPlayerOrder], offer.Details)
	if err != nil {
		return err
	}

	g.Trade(player, g.Players[acceptingPlayerOrder], nil, offer.Details)
	g.CurrentOffers = make([]*entities.TradeOffer, 0)
	if g.SpecialBuildPhase {
		g.applyCurrentPlayerTimerBonus(
			player,
			g.TimerVals.ActionBonusNonTurnStateAcceptingTrade,
		)
	}
	return nil
}

func (g *Game) SetPlayerSpecialBuild(p *entities.Player, val bool) {
	p.SpecialBuild = val
	g.j.WSpecialBuild(p)
}
