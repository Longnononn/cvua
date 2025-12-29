import { Chessboard } from "react-chessboard";
import { useEffect, useState } from "react";

interface ChessBoardProps {
  fen: string;
  onMove: (from: string, to: string) => boolean;
  orientation?: "white" | "black";
  isThinking?: boolean;
}

export function ChessBoard({ fen, onMove, orientation = "white", isThinking = false }: ChessBoardProps) {
  const [boardWidth, setBoardWidth] = useState(320);

  useEffect(() => {
    function handleResize() {
      const container = document.getElementById("board-container");
      if (container) {
        // Constrain max width for desktop but allow responsive shrinking
        const width = Math.min(container.clientWidth, 600);
        setBoardWidth(width);
      }
    }

    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div 
      id="board-container" 
      className={`
        w-full aspect-square max-w-[600px] mx-auto 
        bg-slate-900 rounded-lg shadow-2xl overflow-hidden 
        border-[6px] border-slate-800
        transition-all duration-300
        ${isThinking ? 'ring-4 ring-indigo-500/30' : ''}
      `}
    >
      <Chessboard
        position={fen}
        onPieceDrop={(sourceSquare, targetSquare) => {
          if (isThinking) return false;
          return onMove(sourceSquare, targetSquare);
        }}
        boardOrientation={orientation}
        boardWidth={boardWidth}
        customDarkSquareStyle={{ backgroundColor: "#4f46e5" }} // Indigo-600
        customLightSquareStyle={{ backgroundColor: "#e0e7ff" }} // Indigo-100
        customDropSquareStyle={{ boxShadow: "inset 0 0 1px 6px rgba(0,0,0,0.2)" }}
        animationDuration={200}
      />
    </div>
  );
}
