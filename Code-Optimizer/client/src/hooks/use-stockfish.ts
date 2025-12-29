import { useEffect, useRef, useState, useCallback } from "react";

const STOCKFISH_URL = "https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.0/stockfish.js";

export function useStockfish(fen: string, difficulty: number = 10) {
  const [bestMove, setBestMove] = useState<{ from: string; to: string } | null>(null);
  const [evaluation, setEvaluation] = useState<string>("0.0");
  const [isThinking, setIsThinking] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Create worker from blob to avoid CORS issues if loading cross-origin script directly in some envs
    // However, for CDN scripts, we often just create a worker that imports the script.
    // Simpler approach for React:
    
    // We fetch the script content first to create a local blob URL
    fetch(STOCKFISH_URL)
      .then(r => r.text())
      .then(scriptContent => {
        const blob = new Blob([scriptContent], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        
        worker.onmessage = (e) => {
            const msg = e.data;
            if (typeof msg !== 'string') return;

            if (msg.startsWith('bestmove')) {
                const move = msg.split(' ')[1];
                if (move) {
                    setBestMove({ from: move.substring(0, 2), to: move.substring(2, 4) });
                    setIsThinking(false);
                }
            } else if (msg.includes('score cp')) {
                 const score = msg.match(/score cp (-?\d+)/);
                 if (score) {
                     setEvaluation((parseInt(score[1]) / 100).toFixed(2));
                 }
            } else if (msg.includes('score mate')) {
                const mate = msg.match(/score mate (-?\d+)/);
                if (mate) {
                    setEvaluation(`#${mate[1]}`);
                }
            }
        };

        worker.postMessage('uci');
        workerRef.current = worker;
      })
      .catch(err => console.error("Failed to load Stockfish", err));

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const search = useCallback((currentFen: string) => {
    if (!workerRef.current) return;
    setIsThinking(true);
    setBestMove(null);
    workerRef.current.postMessage(`position fen ${currentFen}`);
    workerRef.current.postMessage(`go depth ${difficulty}`);
  }, [difficulty]);

  return { bestMove, evaluation, isThinking, search };
}
