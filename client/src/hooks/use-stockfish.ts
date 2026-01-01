import { useEffect, useRef, useState, useCallback } from "react";

const STOCKFISH_URL = "https://cdn.jsdelivr.net/npm/stockfish@15.0.0/src/stockfish.min.js";

export function useStockfish(fen: string, difficulty: number = 10) {
  const [bestMove, setBestMove] = useState<{ from: string; to: string } | null>(null);
  const [evaluation, setEvaluation] = useState<string>("0.0");
  const [isThinking, setIsThinking] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const turnRef = useRef<'w' | 'b'>('w');

  useEffect(() => {
    let terminated = false;

    fetch(STOCKFISH_URL)
      .then(r => r.blob())
      .then(blob => {
        if (terminated) return;
        const blobUrl = URL.createObjectURL(blob);
        const worker = new Worker(blobUrl);

        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        
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
                     let val = parseInt(score[1]) / 100;
                     if (turnRef.current === 'b') {
                         val = -val;
                     }
                     setEvaluation(val.toFixed(2));
                 }
            } else if (msg.includes('score mate')) {
                const mate = msg.match(/score mate (-?\d+)/);
                if (mate) {
                    let mateVal = parseInt(mate[1]);
                    if (turnRef.current === 'b') {
                        mateVal = -mateVal;
                    }
                    setEvaluation(mateVal > 0 ? `M${Math.abs(mateVal)}` : `-M${Math.abs(mateVal)}`);
                }
            }
        };

        const threads = Math.min(4, (navigator as any).hardwareConcurrency || 1);
        worker.postMessage('uci');
        worker.postMessage(`setoption name Threads value ${threads}`);
        worker.postMessage('setoption name Hash value 128');
        worker.postMessage('setoption name MultiPV value 1');
        worker.postMessage('setoption name Skill Level value 20');
        worker.postMessage('setoption name UCI_LimitStrength value false');
        worker.postMessage('setoption name Ponder value false');
        worker.postMessage('isready');

        workerRef.current = worker;
      })
      .catch(err => console.error("Failed to load Stockfish", err));

    return () => {
      terminated = true;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const search = useCallback((currentFen: string) => {
    if (!workerRef.current) return;
    setIsThinking(true);
    setBestMove(null);
    
    // Update turn ref
    const parts = currentFen.split(' ');
    if (parts.length > 1) {
        turnRef.current = parts[1] as 'w' | 'b';
    }

    workerRef.current.postMessage(`position fen ${currentFen}`);
    workerRef.current.postMessage(`go movetime 1500`);
  }, []);

  return { bestMove, evaluation, isThinking, search };
}
