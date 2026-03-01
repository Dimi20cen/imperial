import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useEffect } from "react";

const Game = dynamic(() => import("../components/game"), { ssr: false });

const GamePage = () => {
    const router = useRouter();
    const { gameId } = router.query;

    useEffect(() => {
        const { body, documentElement } = document;
        const prevBodyOverflow = body.style.overflow;
        const prevHtmlOverflow = documentElement.style.overflow;

        body.style.overflow = "hidden";
        documentElement.style.overflow = "hidden";

        return () => {
            body.style.overflow = prevBodyOverflow;
            documentElement.style.overflow = prevHtmlOverflow;
        };
    }, []);

    return (
        <main>
            <Game gameId={gameId as string} />
        </main>
    );
};

export default GamePage;
