import { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
  Wifi, WifiOff, Mic, MicOff, Volume2, VolumeX, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { EvaluationBar } from "@/components/EvaluationBar";
import { CapturedPieces } from "@/components/CapturedPieces";

export default function GamePage() {
  const { mode, id } = useParams<{ mode: string; id: string }>();
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState(game.fen());
  const [history, setHistory] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [playerColor, setPlayerColor] = useState<"w" | "b" | null>(null); 
  const [messages, setMessages] = useState<Array<{sender: string, text: string, isMe: boolean}>>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastMove, setLastMove] = useState<{from: string, to: string} | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<string | null>(null);
  const [isWaiting, setIsWaiting] = useState(mode === 'online');
  const [roomCount, setRoomCount] = useState<number | null>(null);
  const [opponent, setOpponent] = useState<{ id: number; username: string } | null>(null);
  const [hasGameStarted, setHasGameStarted] = useState(false);
  const [hasPendingDraw, setHasPendingDraw] = useState(false);
  
  // Timer state
  const [whiteTime, setWhiteTime] = useState(600000); // 10 mins
  const [blackTime, setBlackTime] = useState(600000);
  const [lastTick, setLastTick] = useState<number | null>(null);

  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  const { isConnected, lastMessage, send } = useSocket(
    mode === "online" ? id : null,
    user ?? null
  );

  const { bestMove, evaluation, isThinking, search } = useStockfish(fen);
  const [isFindingMatch, setIsFindingMatch] = useState(mode === "online" && id === "random");
  const [hasSentFindMatch, setHasSentFindMatch] = useState(false);
  const [hasJoinedRoom, setHasJoinedRoom] = useState(false);
  
  const lastSoundTimeRef = useRef(0);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastMoveKeyRef = useRef<string | null>(null);

  // Audio Context Init Helper
  const initAudioContext = useCallback(() => {
    if (audioContext && audioContext.state === 'running') return audioContext;
    
    const AudioCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtor) return null;
    
    const ctx = audioContext || new AudioCtor();
    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }
    setAudioContext(ctx);
    return ctx;
  }, [audioContext]);

  // Unlock audio on first interaction
  useEffect(() => {
    const unlockAudio = () => {
        initAudioContext();
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    return () => {
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
    };
  }, [initAudioContext]);

  const playBeep = useCallback(
    (type: "move" | "capture" | "check" | "start" | "end") => {
      try {
        const ctx = initAudioContext();
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        let freq = 1040;
        let duration = 0.12;
        
        switch (type) {
            case "capture": freq = 720; break;
            case "check": freq = 1280; duration = 0.2; break;
            case "start": freq = 960; duration = 0.3; break;
            case "end": freq = 560; duration = 0.5; break;
            default: freq = 1040;
        }

        osc.frequency.value = freq;
        gain.gain.value = 0.3;
        
        // Smooth envelope to avoid clicking
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration + 0.1);
      } catch (e) {
        console.error("Audio playback failed", e);
      }
    },
    [initAudioContext]
  );

  const playSound = useCallback(
    (type: "move" | "capture" | "check" | "start" | "end", force: boolean = false) => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (!force) {
        if (now - lastSoundTimeRef.current < 80) return;
      }
      lastSoundTimeRef.current = now;

      if (!soundEnabled && !force) return;
      playBeep(type);
    },
    [soundEnabled, playBeep]
  );

  const formatTime = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const resetGame = useCallback(() => {
    const freshGame = new Chess();
    setGame(freshGame);
    setFen(freshGame.fen());
    setHistory([]);
    setLastMove(null);
    setIsGameOver(false);
    setGameResult(null);
    setWhiteTime(600000);
    setBlackTime(600000);
    setLastTick(Date.now()); // Reset tick anchor
    setHasPendingDraw(false);
    lastMoveKeyRef.current = null;
  }, []);

  const safeMove = useCallback((from: string, to: string, promotion: string = 'q') => {
    try {
      const gameCopy = new Chess(game.fen());
      const result = gameCopy.move({ from, to, promotion });
      
      if (result) {
        setGame(gameCopy);
        setFen(gameCopy.fen());
        setHistory(prev => {
          const entry = `${from}-${to}`;
          if (prev[prev.length - 1] === entry) return prev;
          return [...prev, entry];
        });
        setLastMove({ from, to });
        setLastTick(Date.now()); // Sync timer immediately

        if (gameCopy.isGameOver()) {
          setIsGameOver(true);
          let res = "Hòa";
          if (gameCopy.isCheckmate()) res = gameCopy.turn() === 'w' ? "Đen thắng" : "Trắng thắng";
          setGameResult(res);
          playSound('end');
          if (mode === 'online') {
            toast({
              title: "Ván đấu kết thúc",
              description: `${res}. Đang trở về sảnh chính...`,
            });
            setTimeout(() => {
              setLocation("/");
            }, 3500); // Increased delay slightly
          }
        } else if (gameCopy.inCheck()) {
          playSound('check');
        } else if (result.captured) {
          playSound('capture');
        } else {
          playSound('move');
        }

        return true;
      }
    } catch (e) {
      console.error("Invalid move", e);
    }
    return false;
  }, [game, playSound, mode, toast, setLocation]);

  useEffect(() => {
    // General cleanup & initialization when entering route
    setRoomCount(null);
    setOpponent(null);
    setMessages([]);
    setIsGameOver(false);
    setGameResult(null);
    setPlayerColor(mode === 'ai' ? 'w' : null);
    setOrientation(mode === 'ai' ? 'white' : 'white'); // Reset orientation
    setIsWaiting(mode === 'online');
    setIsFindingMatch(mode === "online" && id === "random");
    setHasGameStarted(false);
    setHasPendingDraw(false);
    setWhiteTime(600000);
    setBlackTime(600000);
    setLastTick(null);
    setHasJoinedRoom(false);
    resetGame();
  }, [id, mode, resetGame]);

  // Auth check
  useEffect(() => {
    if (!user && mode === 'online') {
      setLocation('/auth');
    }
  }, [user, mode, setLocation]);

  // Initialize Game Logic
  useEffect(() => {
    if (mode === 'ai') {
        setPlayerColor('w');
        setIsWaiting(false);
        setHasGameStarted(true);
    }

    if (mode === 'online' && id === 'random' && isConnected && !hasSentFindMatch && user) {
      setHasSentFindMatch(true);
      send({ type: 'find_match', userId: user.id });
    }
  }, [mode, id, user, isConnected, hasSentFindMatch, setLocation, send]);

  useEffect(() => {
    if (!isConnected) {
      setHasSentFindMatch(false);
      setHasJoinedRoom(false);
    }
  }, [isConnected]);

  // Join Room
  useEffect(() => {
    if (mode !== 'online') return;
    if (!isConnected || !user || !id) return;
    if (id === 'random') return;
    if (hasJoinedRoom) return;
    
    // Slight delay to ensure socket is ready-ready
    const timer = setTimeout(() => {
        send({ type: 'join', roomId: id, userId: user.id, username: user.username });
        setHasJoinedRoom(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [mode, isConnected, user, id, hasJoinedRoom, send]);

  // Socket Message Handling
  useEffect(() => {
    if (!lastMessage || mode !== 'online') return;

    switch (lastMessage.type) {
      case 'match_found':
        setIsFindingMatch(false);
        if (lastMessage.roomId) {
            setLocation(`/game/online/${lastMessage.roomId}`);
        }
        break;
      case 'move':
        if (lastMessage?.from && lastMessage?.to && lastMessage.fen) {
          const entryKey = `${lastMessage.from}-${lastMessage.to}-${lastMessage.fen}`;
          if (lastMoveKeyRef.current === entryKey) break;
          lastMoveKeyRef.current = entryKey;

          try {
            const syncedGame = new Chess(lastMessage.fen);
            setGame(syncedGame);
            setFen(syncedGame.fen());
            setLastMove({ from: lastMessage.from, to: lastMessage.to });
            setHistory(prev => {
              const entry = `${lastMessage.from}-${lastMessage.to}`;
              if (prev[prev.length - 1] === entry) return prev;
              return [...prev, entry];
            });
            // Update timer tick on move receive
            setLastTick(Date.now());

            if (syncedGame.inCheck()) playSound('check');
            else if (syncedGame.history({ verbose: true }).pop()?.captured) playSound('capture');
            else playSound('move');
          } catch (e) {
            console.error("Failed to apply remote move", e);
          }
        }
        break;
      case 'chat':
        if (!lastMessage.text) break;
        if (lastMessage.sender === user?.username) break;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          // Simple dedup
          if (last && !last.isMe && last.sender === lastMessage.sender && last.text === lastMessage.text) {
             const timeDiff = Date.now() - (last as any)._ts;
             if (timeDiff < 500) return prev; // Ignore duplicate within 500ms
          }
          return [
            ...prev,
            {
              sender: lastMessage.sender,
              text: lastMessage.text,
              isMe: false,
              _ts: Date.now()
            } as any
          ];
        });
        break;
      case 'draw_request':
        if (lastMessage.sender === user?.username) break;
        if (hasPendingDraw) break;
        setHasPendingDraw(true);
        toast({
          title: "Lời mời hòa",
          description: `${lastMessage.sender} muốn xin hòa ván đấu.`,
          action: (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => send({ type: 'draw_respond', roomId: id, accepted: true })}>Đồng ý</Button>
              <Button size="sm" variant="outline" onClick={() => send({ type: 'draw_respond', roomId: id, accepted: false })}>Từ chối</Button>
            </div>
          ),
          duration: 15000,
        });
        break;
      case 'draw_respond':
        if (lastMessage.accepted) {
          setIsGameOver(true);
          setGameResult("Hòa (thỏa thuận)");
          playSound('end');
          toast({
            title: "Ván đấu kết thúc",
            description: "Hai bên đã đồng ý hòa. Đang trở về sảnh chính...",
          });
          setTimeout(() => {
            setLocation("/");
          }, 3500);
        } else {
          toast({ title: "Lời mời bị từ chối", description: "Đối thủ muốn tiếp tục đánh." });
        }
        setHasPendingDraw(false);
        break;
      case 'voice_signal':
        if (lastMessage.senderId === user?.id) break;
        if (lastMessage.signal && lastMessage.signal.type === 'audio') {
          try {
            // Re-use same audio element to prevent memory leaks
            if (!voiceAudioRef.current) {
              voiceAudioRef.current = new Audio();
            }
            // Revoke old URL if possible (though base64 doesn't need revoke)
            voiceAudioRef.current.src = lastMessage.signal.data;
            voiceAudioRef.current.play().catch(e => {
                // Auto-play might block this if user hasn't interacted
                console.warn("Voice play failed", e);
            });
          } catch (e) {
            console.warn("Voice play failed", e);
          }
        }
        break;
      case 'start_game':
        if (hasGameStarted) break;
        setHasGameStarted(true);
        setIsWaiting(false);
        setPlayerColor(lastMessage.color);
        setOrientation(lastMessage.color === 'w' ? 'white' : 'black');
        resetGame();
        playSound('start');
        toast({
            title: "Ván đấu bắt đầu",
            description: `Bạn cầm quân ${lastMessage.color === 'w' ? 'Trắng' : 'Đen'}`,
        });
        break;
      case 'game_over':
        if (isGameOver) break; // Prevent double trigger
        setIsGameOver(true);
        setGameResult(lastMessage.result);
        playSound('end');
        toast({
          title: "Ván đấu kết thúc",
          description: `Kết quả: ${lastMessage.result}. Đang trở về sảnh chính...`,
        });
        setHasPendingDraw(false);
        setTimeout(() => {
          setLocation("/");
        }, 3500);
        break;
      case 'state':
        if (lastMessage.fen) {
          const syncedGame = new Chess(lastMessage.fen);
          setGame(syncedGame);
          setFen(syncedGame.fen());
          setHistory([]); // History sync is hard without full moves list, better clear or fetch full
          setLastMove(null);
          setIsWaiting(false);
          setHasGameStarted(true);
        }
        break;
      case 'role': {
        const role = lastMessage.role;
        if (role === 'w' || role === 'b') {
          setPlayerColor(role);
          // Update logic: Set orientation immediately when role is known
          setOrientation(role === 'w' ? 'white' : 'black');
        } else {
          setPlayerColor(null);
        }
        if (typeof lastMessage.waiting === "boolean") {
          setIsWaiting(lastMessage.waiting);
        } else {
          setIsWaiting(false);
        }
        break;
      }
      case 'stats':
        if (typeof lastMessage.count === "number") {
          setRoomCount(lastMessage.count);
        }
        break;
      case 'opponent_info':
        if (typeof lastMessage.id === "number") {
          setOpponent({ id: lastMessage.id, username: lastMessage.username || "Đối thủ" });
        }
        break;
    }
  }, [id, lastMessage, mode, playSound, resetGame, safeMove, toast, user, send, setLocation, hasGameStarted, hasPendingDraw, isGameOver]);

  // AI Logic
  useEffect(() => {
    if (mode === 'ai' && game.turn() === 'b' && !game.isGameOver()) {
       search(game.fen());
    }
  }, [fen, mode, game, search]);

  useEffect(() => {
    if (mode === 'ai' && bestMove && game.turn() === 'b') {
        safeMove(bestMove.from, bestMove.to, 'q');
    }
  }, [bestMove, game, safeMove]);

  // Voice Chat Effect
  useEffect(() => {
    if (!voiceEnabled || !isConnected || mode !== "online") {
      if (mediaRecorder) {
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        setMediaRecorder(null);
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        setMediaStream(null);
      }
      return;
    }

    let recorder: MediaRecorder;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setVoiceEnabled(false);
      toast({
        title: "Mic không được hỗ trợ",
        description: "Trình duyệt của bạn không hỗ trợ mở mic.",
        variant: "destructive"
      });
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        recorder = new MediaRecorder(stream);
        setMediaStream(stream);
        recorder.ondataavailable = async (event) => {
          if (event.data.size > 0 && isConnected) {
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Audio = reader.result as string;
              send({
                type: 'voice_signal',
                roomId: id,
                senderId: user?.id,
                signal: { type: 'audio', data: base64Audio }
              });
            };
            reader.readAsDataURL(event.data);
          }
        };
        recorder.start(500); // Send chunks every 500ms
        setMediaRecorder(recorder);
      })
      .catch(err => {
        console.error("Mic access error", err);
        setVoiceEnabled(false);
        if (mediaStream) {
          mediaStream.getTracks().forEach(t => t.stop());
          setMediaStream(null);
        }
        toast({
          title: "Lỗi truy cập Mic",
          description: "Vui lòng cho phép truy cập micro để sử dụng tính năng này.",
          variant: "destructive"
        });
      });

    return () => {
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        setMediaStream(null);
      }
    };
  }, [voiceEnabled, isConnected, id, user, send, toast, mode]); 
  // removed mediaStream/mediaRecorder from dependency to prevent loop, handled by cleanup

  // Timer Logic - Refined
  useEffect(() => {
    if (mode !== "online" || isGameOver || isWaiting || !hasGameStarted || !isConnected) {
      setLastTick(null);
      return;
    }
    
    // Initialize tick if null
    if (!lastTick) setLastTick(Date.now());

    const interval = setInterval(() => {
      setLastTick(prev => {
        const now = Date.now();
        const previous = prev ?? now;
        const diff = now - previous;
        
        // Prevent huge jumps if tab was inactive
        const safeDiff = Math.min(diff, 2000); 

        if (safeDiff <= 0) return now;

        if (game.turn() === 'w') {
          setWhiteTime(t => Math.max(0, t - safeDiff));
        } else {
          setBlackTime(t => Math.max(0, t - safeDiff));
        }
        return now;
      });
    }, 100); // Higher frequency for smoother updates (UI only updates on re-render anyway)
    
    return () => clearInterval(interval);
  }, [mode, isGameOver, isWaiting, hasGameStarted, isConnected, game, lastTick]);


  const onDrop = useCallback((sourceSquare: string, targetSquare: string, promotion: string = 'q') => {
    if (game.isGameOver() || isWaiting) return false;

    if (mode === 'online') {
      if (!playerColor) return false;
      if (game.turn() !== playerColor) return false;
      if (!isConnected || !id) {
        toast({ title: "Mất kết nối", description: "Đang cố gắng kết nối lại...", variant: "destructive" });
        return false;
      }

      try {
        const gameCopy = new Chess(game.fen());
        const result = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion });
        if (!result) return false;
        const fenAfter = gameCopy.fen();

        setGame(gameCopy);
        setFen(fenAfter);
        setLastMove({ from: sourceSquare, to: targetSquare });
        setHistory(prev => {
          const entry = `${sourceSquare}-${targetSquare}`;
          if (prev[prev.length - 1] === entry) return prev;
          return [...prev, entry];
        });
        setLastTick(Date.now()); // Sync timer locally immediately
        playSound('move');

        send({
          type: 'move',
          roomId: id,
          move: { from: sourceSquare, to: targetSquare },
          fen: fenAfter,
          promotion
        });

        if (gameCopy.isGameOver()) {
          let result = 'Hòa';
          let winnerColor = undefined;
          if (gameCopy.isCheckmate()) {
            result = gameCopy.turn() === 'w' ? 'Đen thắng' : 'Trắng thắng';
            winnerColor = gameCopy.turn() === 'w' ? 'b' : 'w';
          }
          send({ type: 'game_over', roomId: id, result, winnerColor });
        }

        return true;
      } catch (e) {
        console.error("Invalid online move", e);
        return false;
      }
    }

    if (mode === 'ai' && game.turn() === 'b') return false;

    const moveResult = safeMove(sourceSquare, targetSquare, promotion);
    return moveResult;
  }, [game, mode, playerColor, isConnected, send, safeMove, id, isWaiting, toast, playSound]);

  if (isFindingMatch) {
      return (
          <div className="min-h-screen bg-[#020617] flex items-center justify-center overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.15)_0%,transparent_70%)]" />
              <div className="text-center relative z-10 p-12 glass-card rounded-3xl border border-white/10 animate-in zoom-in-95 duration-500">
                  <div className="w-24 h-24 border-8 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-8 shadow-[0_0_40px_rgba(79,70,229,0.3)]"/>
                  <h2 className="text-4xl font-black italic text-white mb-4 tracking-tighter uppercase">Đang tìm đối thủ</h2>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-sm animate-pulse">Đang ghép trận với kỳ thủ xứng tầm...</p>
                  <Button variant="ghost" className="mt-8 text-slate-500 hover:text-white" onClick={() => setLocation('/')}>Hủy tìm kiếm</Button>
              </div>
          </div>
      )
  }

  const handleSendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (mode === 'online') {
      const senderName = user?.username || "Tôi";

      setMessages(prev => [
        ...prev,
        { sender: senderName, text: trimmed, isMe: true }
      ]);

      send({ type: "chat", roomId: id, text: trimmed, sender: senderName });
    } else {
      setMessages(prev => [
        ...prev,
        { sender: "Tôi", text: trimmed, isMe: true }
      ]);
    }
  }, [mode, send, user, id, setMessages]);

  const copyRoomId = useCallback(() => {
    navigator.clipboard.writeText(id || "");
    toast({ title: "Đã sao chép", description: "Mã phòng đã được sao chép." });
  }, [id, toast]);

  const roleLabel = useMemo(() => {
    if (mode === 'ai') return "Bạn đấu với AI";
    if (mode === 'offline') return "Chơi Offline";
    if (!playerColor) return "Đang xem trận";
    return playerColor === 'w' ? "Bạn cầm quân Trắng" : "Bạn cầm quân Đen";
  }, [mode, playerColor]);

  const isSpectator = mode === 'online' && !playerColor;
  const boardDisabled = mode === 'online' ? (!playerColor || isWaiting) : false;

  const playersInRoom = roomCount !== null ? Math.min(roomCount, 2) : null;
  const spectatorsInRoom = roomCount !== null ? Math.max(roomCount - 2, 0) : null;

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
                
                {mode === 'online' && opponent ? (
                  <div className="mt-1 text-xs text-slate-300">
                    Đối thủ: <span className="font-bold text-white">{opponent.username}</span>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
                    cờ vua của người việt
                  </p>
                )}

                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                    {mode === 'online' ? (
                        <>
                            <span className={`flex items-center gap-1 ${isConnected ? 'text-emerald-500' : 'text-red-500'}`}>
                                {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                                {isConnected ? "Đã kết nối" : "Mất kết nối"}
                            </span>
                            <span className="text-slate-700 mx-1">•</span>
                            <span>Phòng: {id}</span>
                            <button onClick={copyRoomId} className="hover:text-white transition-colors">
                                <Copy className="w-3 h-3 ml-1" />
                            </button>
                            {playersInRoom !== null && (
                              <>
                                <span className="text-slate-700 mx-1">•</span>
                                <span className="text-slate-500 hidden md:inline">
                                  {playersInRoom} chơi
                                  {spectatorsInRoom && spectatorsInRoom > 0 ? ` / ${spectatorsInRoom} xem` : ""}
                                </span>
                              </>
                            )}
                        </>
                    ) : (
                        <span>{mode === 'ai' ? 'Đấu với Stockfish 15' : 'Chơi trên cùng máy'}</span>
                    )}
                </div>
            </div>
         </div>

         <div className="flex items-center gap-4">
            {mode === 'ai' && (
                <div className="hidden md:flex flex-col items-end">
                     <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Đánh giá</span>
                     <span className={`text-sm font-mono font-bold ${evaluation.includes('-') ? 'text-red-400' : 'text-emerald-400'}`}>
                        {evaluation}
                     </span>
                </div>
            )}
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg relative group cursor-help">
                <Crown className="w-5 h-5 text-white" />
                <div className="absolute top-12 right-0 w-max bg-black/80 p-2 rounded text-xs hidden group-hover:block z-50 border border-white/10">
                    Vua cờ
                </div>
            </div>
         </div>
       </header>

       {/* Main Grid */}
       <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6 items-start">
         
         {/* Left Column: Board & Controls */}
         <div className="flex flex-col gap-6">
            <div className="glass-card p-6 md:p-10 rounded-[2.5rem] flex flex-col justify-center items-center relative min-h-[500px] border border-white/5 shadow-2xl">
                 {isThinking && (
                     <div className="absolute top-6 right-6 flex items-center gap-2 bg-black/60 px-4 py-2 rounded-2xl border border-yellow-500/30 z-10 animate-in slide-in-from-right-5 duration-300 shadow-xl backdrop-blur-md">
                         <div className="w-2 h-2 bg-yellow-400 rounded-full animate-ping" />
                         <span className="text-[10px] font-black text-yellow-400 uppercase tracking-[0.2em]">AI đang tính...</span>
                     </div>
                 )}

                 {!isConnected && mode === 'online' && (
                    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm rounded-[2.5rem] flex items-center justify-center">
                         <div className="text-center p-8 glass-card border-red-500/30 rounded-3xl max-w-sm animate-pulse">
                            <WifiOff className="w-12 h-12 text-red-500 mx-auto mb-4" />
                            <h3 className="text-xl font-black italic mb-2 tracking-tight text-red-500">MẤT KẾT NỐI</h3>
                            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Đang thử kết nối lại...</p>
                         </div>
                     </div>
                 )}

                 {isWaiting && mode === 'online' && !isSpectator && isConnected && (
                     <div className="absolute inset-0 z-40 bg-black/40 backdrop-blur-sm rounded-[2.5rem] flex items-center justify-center">
                         <div className="text-center p-8 glass-card border-white/10 rounded-3xl max-w-sm">
                            <Users className="w-12 h-12 text-indigo-400 mx-auto mb-4 animate-pulse" />
                            <h3 className="text-xl font-black italic mb-2 tracking-tight">ĐANG CHỜ ĐỐI THỦ</h3>
                            <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Gửi mã phòng: <span className="text-white select-all">{id}</span></p>
                            <Button variant="outline" size="sm" onClick={copyRoomId} className="mt-4 border-white/10 hover:bg-white/5 rounded-xl font-bold">
                                <Copy className="w-4 h-4 mr-2" /> Sao chép mã
                            </Button>
                         </div>
                     </div>
                 )}
                 
                 <div className="flex gap-8 items-center w-full justify-center">
                    {/* Only show eval bar if not online PvP to avoid cheating, or if spectator */}
                    {(mode === 'ai' || isSpectator) && (
                        <EvaluationBar evaluation={evaluation} orientation={orientation} />
                    )}

                    <div className="flex flex-col gap-6 w-full max-w-[600px]">
                        <ChessBoard 
                           game={game}
                           onMove={onDrop} 
                           orientation={orientation} 
                           isThinking={isThinking}
                           disabled={boardDisabled || !isConnected}
                           lastMove={lastMove}
                           onReset={resetGame}
                        />
                        <CapturedPieces fen={fen} />
                    </div>
                 </div>
            </div>

            <div className="glass-card p-6 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6 border border-white/5 shadow-xl">
                <div className="flex items-center gap-5 w-full md:w-auto">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-500 shrink-0 ${game.turn() === 'w' ? 'bg-white border-white' : 'bg-slate-800 border-white/10'}`}>
                        <div className={`w-8 h-8 rounded-full ${game.turn() === 'w' ? 'bg-slate-900' : 'bg-white'}`} />
                    </div>
                    <div className="flex-1">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">Lượt đi</div>
                        <div className="text-2xl font-black italic text-indigo-400 tracking-tight">
                            {game.turn() === 'w' ? 'Trắng' : 'Đen'} đang đi
                        </div>
                        {mode === 'online' && (
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono w-full max-w-[300px]">
                            <div
                              className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                                game.turn() === 'w'
                                  ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-200'
                                  : 'border-white/5 text-slate-400 bg-white/5'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-white border border-slate-400" />
                                <span className="uppercase tracking-widest text-[9px] font-bold">
                                  {playerColor === 'w' ? 'BẠN' : 'ĐỐI THỦ'}
                                </span>
                              </div>
                              <span className="font-bold">{formatTime(whiteTime)}</span>
                            </div>
                            <div
                              className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                                game.turn() === 'b'
                                  ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-200'
                                  : 'border-white/5 text-slate-400 bg-white/5'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-black border border-slate-600" />
                                <span className="uppercase tracking-widest text-[9px] font-bold">
                                  {playerColor === 'b' ? 'BẠN' : 'ĐỐI THỦ'}
                                </span>
                              </div>
                              <span className="font-bold">{formatTime(blackTime)}</span>
                            </div>
                          </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <GameControls 
                        onFlip={() => setOrientation(o => o === 'white' ? 'black' : 'white')}
                        onResign={() => {
                            if (isSpectator) return;
                            if (window.confirm("Bạn chắc chắn muốn xin thua?")) {
                                send({ type: 'game_over', roomId: id, result: playerColor === 'w' ? 'Đen thắng (Xin thua)' : 'Trắng thắng (Xin thua)' });
                            }
                        }}
                        onDraw={() => {
                          if (isSpectator || isGameOver || !isConnected) return;
                          if (hasPendingDraw) {
                            toast({ title: "Đã gửi lời mời", description: "Đang chờ hồi âm..." });
                            return;
                          }
                          setHasPendingDraw(true);
                          send({ type: 'draw_request', roomId: id, sender: user?.username });
                          toast({ title: "Đã gửi lời mời hòa", description: "Đang chờ đối thủ..." });
                        }}
                        onReset={resetGame}
                        gameMode={mode as any}
                        disabled={isSpectator || !isConnected}
                    />
                    
                    <div className="h-10 w-[1px] bg-white/10 mx-2" />

                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setSoundEnabled(prev => {
                            const next = !prev;
                            if (next) playSound("move", true);
                            return next;
                          });
                        }}
                        className={`w-12 h-12 rounded-2xl transition-all duration-300 ${soundEnabled ? 'bg-slate-800 border-white/10 text-slate-100' : 'bg-slate-900 border-slate-600 text-slate-500'}`}
                        title={soundEnabled ? "Tắt âm thanh" : "Bật âm thanh"}
                    >
                        {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    </Button>

                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                            if (mode !== 'online' || isSpectator || !isConnected) {
                              toast({
                                title: "Không thể bật Mic",
                                description: "Mic chỉ khả dụng khi đang chơi Online.",
                                variant: "destructive"
                              });
                              return;
                            }
                            setVoiceEnabled(prev => !prev);
                        }}
                        className={`w-12 h-12 rounded-2xl transition-all duration-300 ${
                          voiceEnabled
                              ? 'bg-indigo-500 text-white border-transparent shadow-[0_0_15px_rgba(79,70,229,0.5)]'
                              : 'bg-slate-800 border-white/10 text-slate-400'
                        }`}
                        title={voiceEnabled ? "Tắt Mic" : "Bật Mic"}
                    >
                        {voiceEnabled ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
                    </Button>
                </div>
            </div>
         </div>

         {/* Right Column: History & Chat */}
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6 h-full content-start">
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
