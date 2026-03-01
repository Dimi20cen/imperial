import { FunctionComponent, MutableRefObject } from "react";
import Image from "next/image";
import { LobbyState } from "../src/store/types";
import { hexToUrlString } from "../utils";
import { classNames, playerColors } from "../utils/styles";
import ReconnectingWebSocket from "reconnecting-websocket";
import { PencilSquareIcon, XCircleIcon } from "@heroicons/react/24/solid";
import { UsernameChangeModal } from "./UsernameChangeModal";
import {
    MSG_LOCATION_TYPE,
    MSG_TYPE,
    sendMessage,
    WsMessage,
} from "../src/sock";
import botImage from "../assets/runtime/shared/ui/bot.png";

const playerRowClass = (self: boolean, ready: boolean) => {
    let base =
        "relative mb-3 rounded-xl border flex text-[color:var(--ui-ivory)] px-4 py-4 transition-colors duration-200";

    if (self) {
        base += " font-bold";
        if (ready) {
            base += " ui-player-row-self-ready";
        } else {
            base += " ui-player-row-self-waiting";
        }
        return base;
    }

    if (ready) {
        base += " ui-player-row-ready";
    } else {
        base += " ui-player-row-waiting";
    }

    return base;
};

const PlayerList: FunctionComponent<{
    lobbyState: LobbyState;
    socket?: MutableRefObject<ReconnectingWebSocket | null>;
}> = ({ lobbyState, socket }) => {
    const usernameModal = UsernameChangeModal(socket);
    const orderedPlayers = [...lobbyState.players].sort((a, b) => {
        const aIsSelf = a.Order === lobbyState.order;
        const bIsSelf = b.Order === lobbyState.order;
        if (aIsSelf && !bIsSelf) return 1;
        if (!aIsSelf && bIsSelf) return -1;
        return a.Order - b.Order;
    });

    const kickUser = (username: string) => {
        if (socket?.current != null) {
            const msg: WsMessage = {
                l: MSG_LOCATION_TYPE.LOBBY,
                t: MSG_TYPE.KICK,
                username: username,
            };
            sendMessage(socket.current, msg);
        }
    };

    return (
        <div className="grid">
            {usernameModal.component}

            {orderedPlayers.map((player) => (
                <div
                    key={player.Order}
                    className={playerRowClass(
                        player.Order === lobbyState.order,
                        player.Ready,
                    )}
                >
                    <div
                        className={classNames(
                            "flex-shrink-0 rounded-full h-8 w-8 m-auto ui-player-chip-ring",
                            playerColors[hexToUrlString(player.Color)],
                        )}
                    >
                        {player.Username.endsWith("*") && (
                            <Image
                                src={botImage.src}
                                alt="Bot player"
                                width={32}
                                height={32}
                            />
                        )}
                    </div>
                    <div className="flex-col pl-4 text-left items-center w-full">
                        <span className="align-middle inline-block mr-2">
                            <p>{player.Username}</p>
                            <p className="font-normal text-xs text-[color:var(--ui-ivory-soft)]">
                                {player.GamesFinished}/{player.GamesStarted}
                            </p>
                        </span>

                        {player.Order === lobbyState.order ? (
                            <div className="align-middle inline-block float-right mx-1 mt-2">
                                <button onClick={usernameModal.openModal}>
                                    <PencilSquareIcon className="w-6 h-6" />
                                </button>
                            </div>
                        ) : (
                            lobbyState.order === 0 && (
                                <div className="align-middle inline-block float-right mx-1 mt-2">
                                    <button
                                        onClick={() =>
                                            kickUser(player.Username)
                                        }
                                    >
                                        <XCircleIcon className="w-6 h-6" />
                                    </button>
                                </div>
                            )
                        )}

                        <p className={classNames("text-sm truncate")}></p>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default PlayerList;
