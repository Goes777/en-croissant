// Stockfish is a local, optional commentator. It never writes exercise answers.
export class LocalEngine {
    private worker: Worker | null = null;
    private generation = 0;
    start(fen: string, onLine: (line: string) => void) {
        this.stop();
        const generation = ++this.generation;
        const worker = new Worker(
            new URL(import.meta.env.BASE_URL + "engine/stockfish-19-lite-single.js", location.href),
        );
        this.worker = worker;
        worker.onmessage = (event) => {
            if (generation !== this.generation) return;
            const line = String(event.data);
            if (line === "uciok") worker.postMessage("isready");
            else if (line === "readyok") {
                worker.postMessage("position fen " + fen);
                worker.postMessage("go depth 10");
            } else if (line.startsWith("info depth") || line.startsWith("bestmove")) onLine(line);
        };
        worker.onerror = () =>
            onLine(
                "Não foi possível iniciar o motor local. O treino e o gabarito continuam disponíveis.",
            );
        worker.postMessage("uci");
    }
    stop() {
        this.generation++;
        this.worker?.postMessage("stop");
        this.worker?.terminate();
        this.worker = null;
    }
}
