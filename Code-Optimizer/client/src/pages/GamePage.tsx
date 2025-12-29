import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { Chess } from "chess.js";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useStockfish } from "@/hooks/use-stockfish";
import { ChessBoard } from "@/components/ChessBoard";
import { GameControls } from "@/components/GameControls";
import { MoveHistory } from "@/components/MoveHistory";
import { ChatBox } from "@/components/ChatBox";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, Zap, Crown, Home, Copy, Clock, 
  Wifi, WifiOff
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GamePage() {
  const { mode, id } = useParams<{ mode: string; id: string }>();
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [history, setHistory] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [playerColor, setPlayerColor] = useState<"w" | "b" | null>(null); // null = spectator or local
  const [messages, setMessages] = useState<Array<{sender: string, text: string, isMe: boolean}>>([]);
  
  // Hooks based on mode
  const { isConnected, lastMessage, send } = useSocket(
    mode === "online" ? id : null, 
    user?.username
  );

  const { bestMove, evaluation, isThinking, search } = useStockfish(fen);

  // Initialize Game
  useEffect(() => {
    if (!user && mode === 'online') {
      setLocation('/auth');
      return;
    }

    if (mode === 'ai') {
        setPlayerColor('w');
    }
  }, [mode, user, setLocation]);

  // Handle Socket Messages (Online Mode)
  useEffect(() => {
    if (!lastMessage || mode !== 'online') return;

    switch (lastMessage.type) {
      case 'move':
        safeMove(lastMessage.from, lastMessage.to, lastMessage.promotion);
        break;
      case 'chat':
        setMessages(prev => [...prev, {
            sender: lastMessage.sender,
            text: lastMessage.text,
            isMe: lastMessage.sender === user?.username
        }]);
        break;
      case 'start_game':
        setPlayerColor(lastMessage.color);
        setOrientation(lastMessage.color === 'w' ? 'white' : 'black');
        setGame(new Chess());
        setFen(new Chess().fen());
        setHistory([]);
        toast({
            title: "Game Started!",
            description: `You are playing as ${lastMessage.color === 'w' ? 'White' : 'Black'}`,
        });
        break;
       case 'game_over':
         toast({
            title: "Game Over",
            description: `Result: ${lastMessage.result}`,
            variant: "default"
         });
         break;
    }
  }, [lastMessage, mode, user]);

  // AI Logic
  useEffect(() => {
    if (mode === 'ai' && game.turn() === 'b' && !game.isGameOver()) {
       search(game.fen());
    }
  }, [fen, mode, game, search]);

  useEffect(() => {
    if (mode === 'ai' && bestMove && game.turn() === 'b') {
        safeMove(bestMove.from, bestMove.to, 'q'); // Auto promote to queen for AI
    }
  }, [bestMove, mode, game]);


  const safeMove = useCallback((from: string, to: string, promotion: string = 'q') => {
    try {
      const gameCopy = new Chess(game.fen());
      const result = gameCopy.move({ from, to, promotion });
      
      if (result) {
        setGame(gameCopy);
        setFen(gameCopy.fen());
        setHistory(gameCopy.history());
        return true;
      }
    } catch (e) {
      console.error("Invalid move", e);
    }
    return false;
  }, [game]);

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    // 1. Check turns/permissions
    if (game.isGameOver()) return false;
    
    // Online checks
    if (mode === 'online') {
        if (!playerColor) return false; // Spectator
        if (game.turn() !== playerColor) return false; // Not my turn
    }
    
    // AI checks
    if (mode === 'ai' && game.turn() === 'b') return false; // AI's turn

    // 2. Attempt move locally
    const moveResult = safeMove(sourceSquare, targetSquare);
    if (!moveResult) return false;

    // 3. Broadcast if online
    if (mode === 'online' && isConnected) {
        send({
            type: 'move',
            from: sourceSquare,
            to: targetSquare,
            promotion: 'q'
        });
    }

    return true;
  };

  const handleSendMessage = (text: string) => {
    if (mode === 'online') {
        send({ type: 'chat', text, sender: user?.username });
    } else {
        // Local echo for offline/AI
        setMessages(prev => [...prev, { sender: 'Me', text, isMe: true }]);
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(id || "");
    toast({ title: "Copied!", description: "Room ID copied to clipboard." });
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-4 md:p-6 lg:p-8 relative">
       <div className="bg-glow-layer" />

       {/* Header */}
       <header className="max-w-7xl mx-auto mb-6 flex items-center justify-between glass-card p-4 rounded-2xl">
         <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="hover:bg-white/10 rounded-xl">
                <Home className="w-5 h-5 text-slate-400" />
            </Button>
            <div>
                <h1 className="text-xl font-black italic tracking-tighter text-white">
                    Chess<span className="text-indigo-500">Pro</span>
                </h1>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    {mode === 'online' ? (
                        <>
                            <span className="text-emerald-500 flex items-center gap-1">
                                {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3 text-red-500" />}
                                {isConnected ? "Online" : "Connecting..."}
                            </span>
                            <span className="text-slate-700 mx-1">•</span>
                            <span>Room: {id}</span>
                            <button onClick={copyRoomId} className="hover:text-white transition-colors">
                                <Copy className="w-3 h-3 ml-1" />
                            </button>
                        </>
                    ) : (
                        <span>{mode === 'ai' ? 'Vs Stockfish 15' : 'Local Multiplayer'}</span>
                    )}
                </div>
            </div>
         </div>

         <div className="flex items-center gap-4">
            {mode === 'ai' && (
                <div className="hidden md:flex flex-col items-end">
                     <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Evaluation</span>
                     <span className={`text-sm font-mono font-bold ${evaluation.includes('-') ? 'text-red-400' : 'text-emerald-400'}`}>
                        {evaluation}
                     </span>
                </div>
            )}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Crown className="w-5 h-5 text-white" />
            </div>
         </div>
       </header>

       {/* Main Grid */}
       <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6 items-start">
         
         {/* Left Column: Board & Controls */}
         <div className="flex flex-col gap-6">
            <div className="glass-card p-4 md:p-8 rounded-3xl flex justify-center items-center relative min-h-[400px]">
                 {isThinking && (
                     <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/40 px-3 py-1 rounded-full border border-white/10 z-10 animate-pulse">
                         <Zap className="w-3 h-3 text-yellow-400" />
                         <span className="text-xs font-bold text-yellow-100 uppercase tracking-wider">AI Thinking</span>
                     </div>
                 )}
                <ChessBoard 
                    fen={fen} 
                    onMove={onDrop} 
                    orientation={orientation} 
                    isThinking={isThinking}
                />
            </div>

            <div className="glass-card p-4 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center border border-white/5">
                        <Clock className="w-6 h-6 text-slate-500" />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Turn</div>
                        <div className="text-xl font-black italic text-indigo-400">
                            {game.turn() === 'w' ? 'WHITE' : 'BLACK'} TO MOVE
                        </div>
                    </div>
                </div>

                <GameControls 
                    onFlip={() => setOrientation(o => o === 'white' ? 'black' : 'white')}
                    onResign={() => {
                        toast({ title: "Resigned", description: "You have resigned the game." });
                        setLocation("/");
                    }}
                    onReset={() => {
                        setGame(new Chess());
                        setFen(new Chess().fen());
                        setHistory([]);
                    }}
                    gameMode={mode as any}
                />
            </div>
         </div>

         {/* Right Column: History & Chat */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6 h-full">
            <MoveHistory history={history} />
            <ChatBox 
                messages={messages} 
                onSendMessage={handleSendMessage} 
                disabled={mode === 'ai'} 
            />
         </div>

       </main>
    </div>
  );
}
