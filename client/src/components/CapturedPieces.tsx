import { useMemo } from "react";

interface CapturedPiecesProps {
  fen: string;
}

export function CapturedPieces({ fen }: CapturedPiecesProps) {
  const captured = useMemo(() => {
    const pieces = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0 }
    };
    
    // Initial piece counts
    const initial = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    
    // Current piece counts from FEN
    const current = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0 }
    };
    
    const boardPart = fen.split(' ')[0];
    for (const char of boardPart) {
      if (char === '/') continue;
      if (!isNaN(parseInt(char))) continue;
      
      const color = char === char.toUpperCase() ? 'w' : 'b';
      const type = char.toLowerCase() as keyof typeof initial;
      if (current[color][type] !== undefined) {
        current[color][type]++;
      }
    }
    
    // Calculate captured
    const whiteCaptured: string[] = [];
    const blackCaptured: string[] = [];
    
    (Object.keys(initial) as (keyof typeof initial)[]).forEach(type => {
      for (let i = 0; i < initial[type] - current.w[type]; i++) whiteCaptured.push(`w${type.toUpperCase()}`);
      for (let i = 0; i < initial[type] - current.b[type]; i++) blackCaptured.push(`b${type.toUpperCase()}`);
    });
    
    return { whiteCaptured, blackCaptured };
  }, [fen]);

  const renderPieces = (pieces: string[]) => (
    <div className="flex flex-wrap gap-0.5 min-h-[24px]">
      {pieces.map((p, i) => (
        <img 
          key={i}
          src={`https://images.chesscomfiles.com/chess-themes/pieces/neo/150/${p.toLowerCase()}.png`}
          alt={p}
          className="w-5 h-5 md:w-6 md:h-6 object-contain opacity-80"
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex justify-between items-center bg-white/5 rounded-lg p-2 border border-white/10">
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Captured by Black</span>
        {renderPieces(captured.whiteCaptured)}
      </div>
      <div className="flex justify-between items-center bg-white/5 rounded-lg p-2 border border-white/10">
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Captured by White</span>
        {renderPieces(captured.blackCaptured)}
      </div>
    </div>
  );
}
