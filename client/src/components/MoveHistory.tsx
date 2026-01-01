import { ScrollArea } from "@/components/ui/scroll-area";
import { useRef, useEffect } from "react";

interface MoveHistoryProps {
  history: string[];
}

export function MoveHistory({ history }: MoveHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when history updates
  useEffect(() => {
    if (scrollRef.current) {
        const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    }
  }, [history]);

  // Group moves into pairs (White, Black)
  const movePairs = [];
  for (let i = 0; i < history.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: history[i],
      black: history[i + 1] || "",
    });
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden flex flex-col h-full shadow-lg">
      <div className="px-4 py-3 bg-white/5 border-b border-white/5 flex justify-between items-center">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Move History</h3>
        <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-mono">
            {history.length} moves
        </span>
      </div>
      
      <ScrollArea className="flex-1 p-4 h-[200px]" ref={scrollRef}>
        <div className="grid grid-cols-[30px_1fr_1fr] gap-y-1 gap-x-2 text-sm font-medium">
          {movePairs.map((move, index) => (
            <div key={index} className="contents group">
              <div className="text-slate-600 font-mono py-1 text-right pr-1 group-hover:text-slate-400 transition-colors">
                {move.number}.
              </div>
              <div className="bg-indigo-500/5 text-indigo-200 py-1 px-2 rounded hover:bg-indigo-500/10 transition-colors cursor-default text-center">
                {move.white}
              </div>
              <div className={`py-1 px-2 rounded transition-colors text-center cursor-default ${move.black ? 'bg-indigo-500/5 text-indigo-200 hover:bg-indigo-500/10' : ''}`}>
                {move.black}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
