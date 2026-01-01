
import { useEffect, useState } from "react";

interface EvaluationBarProps {
  evaluation: string; // e.g. "+1.5", "-0.3", "M3", "-M4"
  orientation: "white" | "black";
}

export function EvaluationBar({ evaluation, orientation }: EvaluationBarProps) {
  const [whiteHeight, setWhiteHeight] = useState(50);

  useEffect(() => {
    let score = 0;
    
    // Parse evaluation
    if (evaluation.startsWith('M') || evaluation.startsWith('-M')) {
        // Mate in X
        // Remove 'M' or '-M'
        const isWhiteMate = !evaluation.startsWith('-');
        score = isWhiteMate ? 100 : -100;
    } else {
        // CP score
        const val = parseFloat(evaluation);
        if (!isNaN(val)) {
            // Sigmoid-like scaling for visual bar
            // 0 -> 50%
            // +1 -> ~60%
            // +5 -> ~90%
            // -5 -> ~10%
            // Formula: 50 + (val * 10) clamped 5-95%
            score = val;
        }
    }

    // Convert score to percentage height for White
    // Using a simple clamping method suitable for chess bars
    // Max advantage visually at around +10/-10
    let percent = 50 + (score * 5); 
    
    // Handle mate specifically to push to full limits
    if (evaluation.includes('M')) {
        if (evaluation.startsWith('-')) percent = 0; // Black mates
        else percent = 100; // White mates
    }

    // Clamp
    percent = Math.max(2, Math.min(98, percent));

    setWhiteHeight(percent);
  }, [evaluation]);

  const isWhiteView = orientation === 'white';

  return (
    <div className="w-6 h-[400px] md:h-[500px] bg-slate-700 rounded-sm overflow-hidden flex flex-col relative border border-slate-600 shadow-inner">
      {/* Black Bar (Background is technically dark, so we just render White bar on top or bottom) */}
      <div className="absolute inset-0 bg-[#403d39] w-full h-full" />
      
      {/* White Bar */}
      <div 
        className="absolute w-full bg-white transition-all duration-700 ease-in-out"
        style={{
            height: `${whiteHeight}%`,
            [isWhiteView ? 'bottom' : 'top']: 0, 
        }}
      />

      {/* Score Text */}
      <div className={`absolute w-full text-center text-[10px] font-bold z-10 
          ${isWhiteView 
             ? (whiteHeight > 50 ? 'bottom-1 text-slate-800' : 'top-1 text-white')
             : (whiteHeight > 50 ? 'top-1 text-slate-800' : 'bottom-1 text-white')
          }
      `}>
        {evaluation}
      </div>
    </div>
  );
}
