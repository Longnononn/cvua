import { Chessboard } from "react-chessboard";
import { useEffect, useState, memo, useRef } from "react";
import { Chess, Move, Square } from "chess.js";
import { Trophy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChessBoardProps {
  game: Chess;
  onMove: (from: string, to: string, promotion?: string) => boolean;
  orientation?: "white" | "black";
  isThinking?: boolean;
  disabled?: boolean;
  lastMove?: { from: string; to: string } | null;
  onReset?: () => void;
}

export const ChessBoard = memo(function ChessBoard({ 
  game, 
  onMove, 
  orientation = "white", 
  isThinking = false, 
  disabled = false,
  lastMove,
  onReset 
}: ChessBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(320);
  const [moveFrom, setMoveFrom] = useState<Square | null>(null);
  const [optionSquares, setOptionSquares] = useState<Record<string, { background: string; borderRadius?: string }>>({});
  const [checkSquare, setCheckSquare] = useState<Record<string, { background: string; boxShadow?: string }>>({});
  const [promotionMove, setPromotionMove] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const width = Math.min(containerRef.current.clientWidth, 600);
        setBoardWidth(width);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    handleResize();
    return () => resizeObserver.disconnect();
  }, []);

  // Highlight King when in check
  useEffect(() => {
    if (game.inCheck()) {
      const board = game.board();
      let kingSquare: Square | "" = "";
      const files = "abcdefgh";

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const piece = board[r][c];
          if (piece && piece.type === "k" && piece.color === game.turn()) {
            const file = files[c];
            const rank = 8 - r;
            kingSquare = `${file}${rank}` as Square;
            break;
          }
        }
        if (kingSquare) break;
      }

      if (kingSquare) {
        setCheckSquare({
          [kingSquare]: {
            background: "radial-gradient(circle, rgba(255,0,0,0.8) 0%, transparent 80%)",
            boxShadow: "inset 0 0 10px 2px rgba(255,0,0,0.8)",
          },
        });
        return;
      }
    }
    setCheckSquare({});
  }, [game]);

  function getMoveOptions(square: Square) {
    const moves = game.moves({
      square: square,
      verbose: true,
    }) as Move[];
    
    if (moves.length === 0) {
      return;
    }

    const newSquares: Record<string, { background: string; borderRadius?: string }> = {};
    moves.forEach((move) => {
      const targetPiece = game.get(move.to as Square);
      const originPiece = game.get(square);

      newSquares[move.to] = {
        background:
          targetPiece && originPiece && targetPiece.color !== originPiece.color
            ? "radial-gradient(circle, rgba(255, 215, 0, 0.6) 40%, transparent 40%)"
            : "radial-gradient(circle, rgba(255, 215, 0, 0.3) 25%, transparent 25%)",
        borderRadius: "50%",
      };
    });
    newSquares[square] = {
      background: "rgba(255, 215, 0, 0.4)",
    };
    setOptionSquares(newSquares);
  }

  function handlePromotionSelect(piece?: string) {
    if (!promotionMove) return;
    if (disabled) return;

    if (piece) {
      const promotionType = piece[1]?.toLowerCase();
      if (!promotionType || !"qrbn".includes(promotionType)) return;

      const moved = onMove(promotionMove.from, promotionMove.to, promotionType);
      if (!moved) {
        return;
      }
    }

    setPromotionMove(null);
    setMoveFrom(null);
    setOptionSquares({});
  }

  function onSquareClick(square: Square) {
    if (disabled || isThinking || game.isGameOver()) return;

    if (moveFrom) {
      if (moveFrom === square) {
        setMoveFrom(null);
        setOptionSquares({});
        return;
      }

      const piece = game.get(moveFrom);
      const isPromotion = 
        (piece?.type === 'p' && 
         ((piece.color === 'w' && square[1] === '8') || 
          (piece.color === 'b' && square[1] === '1')));

      if (isPromotion) {
         const moves = game.moves({ square: moveFrom, verbose: true });
         const validMove = moves.find(m => m.to === square);
         if (validMove) {
             setPromotionMove({ from: moveFrom, to: square });
             return;
         }
      }

      const moveResult = onMove(moveFrom, square);
      
      if (moveResult) {
        setMoveFrom(null);
        setOptionSquares({});
        return;
      }

      const clickedPiece = game.get(square);
      if (clickedPiece && clickedPiece.color === game.turn()) {
         setMoveFrom(square);
         getMoveOptions(square);
         return;
      }

      setMoveFrom(null);
      setOptionSquares({});
    } else {
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setMoveFrom(square);
        getMoveOptions(square);
      }
    }
  }

  const customSquareStyles = {
    ...(lastMove ? {
        [lastMove.from]: { background: "rgba(255, 215, 0, 0.3)" },
        [lastMove.to]: { background: "rgba(255, 215, 0, 0.3)" }
    } : {}),
    ...optionSquares,
    ...checkSquare
  };

  const isGameOver = game.isGameOver();
  const result = isGameOver
    ? (game.isCheckmate()
        ? (game.turn() === 'w' ? "Đen thắng" : "Trắng thắng")
        : "Hòa")
    : "";

  return (
    <div 
      ref={containerRef}
      className={`
        w-full aspect-square max-w-[600px] mx-auto 
        bg-slate-900 rounded-lg shadow-2xl overflow-hidden 
        border-[6px] border-slate-800
        transition-all duration-300
        ${isThinking ? 'ring-4 ring-indigo-500/30' : ''}
        relative
      `}
    >
      <Chessboard
        position={game.fen()}
        onPieceDrop={(sourceSquare, targetSquare, piece) => {
          if (disabled || isThinking || game.isGameOver()) return false;
          
          const isPromotion = 
            (piece[1] === 'P' && sourceSquare[1] === '7' && targetSquare[1] === '8') ||
            (piece[1] === 'p' && sourceSquare[1] === '2' && targetSquare[1] === '1');
            
          if (isPromotion) {
            if (!disabled) {
              setPromotionMove({ from: sourceSquare, to: targetSquare });
            }
            return false;
          }

          const result = onMove(sourceSquare, targetSquare);
          if (result) {
             setMoveFrom(null);
             setOptionSquares({});
          }
          return result;
        }}
        onSquareClick={onSquareClick}
        customSquareStyles={customSquareStyles}
        boardOrientation={orientation}
        boardWidth={boardWidth}
        customDarkSquareStyle={{ backgroundColor: "#312e81" }} // Indigo-900
        customLightSquareStyle={{ backgroundColor: "#e2e8f0" }} // Slate-200
        customDropSquareStyle={{ boxShadow: "inset 0 0 1px 6px rgba(255,255,255,0.2)" }}
        animationDuration={300}
      />
      
      {/* Promotion Dialog Overlay */}
      {promotionMove && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-lg">
             <div className="bg-slate-800 p-4 rounded-2xl flex flex-col gap-4 shadow-2xl border border-white/10 animate-in zoom-in-95">
                <div className="text-white text-sm font-bold text-center uppercase tracking-widest opacity-50">Select Promotion</div>
                <div className="flex gap-3">
                    {['q', 'r', 'b', 'n'].map((p) => (
                        <div 
                            key={p} 
                            className="w-16 h-16 cursor-pointer bg-slate-700 hover:bg-indigo-600 rounded-xl p-2 transition-all hover:scale-110 active:scale-95"
                            onClick={() => handlePromotionSelect(`${game.turn()}${p.toUpperCase()}`)}
                        >
                            <img src={`https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${game.turn()}${p}.png`} 
                                 alt={p} 
                                 className="w-full h-full object-contain" 
                            />
                        </div>
                    ))}
                </div>
                <Button 
                    variant="ghost" 
                    className="text-slate-400 hover:text-white hover:bg-white/5"
                    onClick={() => handlePromotionSelect(undefined)}
                >
                    Cancel
                </Button>
             </div>
        </div>
      )}

      {/* Game Over Overlay */}
      {isGameOver && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-500">
              <div className="text-center p-8">
                  <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-indigo-500/50 animate-bounce">
                      <Trophy className="w-10 h-10 text-white" />
                  </div>
                  <h2 className="text-4xl font-black italic text-white mb-2 tracking-tighter">
                      GAME OVER
                  </h2>
                  <div className="text-xl font-bold text-indigo-400 uppercase tracking-[0.2em] mb-8">
                      {result}
                  </div>
                  <div className="flex gap-4 justify-center">
                    <Button 
                        onClick={onReset}
                        className="bg-white text-black hover:bg-slate-200 font-bold px-8 h-12 rounded-xl"
                    >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Play Again
                    </Button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
});
