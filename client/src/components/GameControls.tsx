import { Button } from "@/components/ui/button";
import { RefreshCw, Flag, MessageSquare, RotateCcw } from "lucide-react";

interface GameControlsProps {
  onFlip: () => void;
  onResign: () => void;
  onDraw?: () => void;
  onReset?: () => void;
  gameMode: "online" | "ai" | "offline";
  disabled?: boolean;
}

export function GameControls({ onFlip, onResign, onDraw, onReset, gameMode, disabled = false }: GameControlsProps) {
  return (
    <div className="flex flex-wrap gap-3 justify-center md:justify-start">
      <Button 
        variant="secondary" 
        size="icon" 
        onClick={onFlip} 
        className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10"
        title="Flip Board"
      >
        <RefreshCw className="w-5 h-5" />
      </Button>

      {gameMode === "ai" && (
         <Button 
            variant="secondary" 
            onClick={onReset}
            className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20"
        >
            <RotateCcw className="w-4 h-4 mr-2" />
            Ván mới
        </Button>
      )}

      {gameMode === "online" && (
        <>
            <Button 
                variant="destructive" 
                onClick={onResign}
                disabled={disabled}
                className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20"
            >
                <Flag className="w-4 h-4 mr-2" />
                Xin thua
            </Button>
            
            <Button 
                variant="secondary" 
                onClick={onDraw}
                disabled={disabled}
                className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20"
            >
                <MessageSquare className="w-4 h-4 mr-2" />
                Xin hòa
            </Button>
        </>
      )}
    </div>
  );
}
