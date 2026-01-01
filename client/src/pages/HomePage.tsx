import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Crown, Users, Zap, Monitor, ArrowRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { nanoid } from "nanoid";

export default function HomePage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [roomId, setRoomId] = useState("");

  if (!user) {
    // In a real app we might redirect or show a landing page, 
    // but here AuthPage handles unauthenticated state logic if we used a guard.
    // For now, let's just let them see the home page but redirect actions to auth.
    return (
        <div className="min-h-screen flex items-center justify-center">
            <Link href="/auth">
                <Button>Đăng nhập trước</Button>
            </Link>
        </div>
    );
  }

  const createRoom = () => {
    const id = nanoid(6).toUpperCase();
    setLocation(`/game/online/${id}`);
  };

  const joinRoom = () => {
    if (roomId.length > 0) {
        setLocation(`/game/online/${roomId.toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white relative overflow-x-hidden">
      <div className="bg-glow-layer" />

      <div className="max-w-5xl mx-auto px-6 py-12 md:py-20 flex flex-col items-center text-center">
        
        {/* Header */}
        <div className="mb-12 animate-in fade-in slide-in-from-top-8 duration-700">
           <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] mx-auto flex items-center justify-center shadow-2xl shadow-indigo-500/30 rotate-12 hover:rotate-6 transition-transform duration-300 mb-6">
              <Crown className="w-10 h-10 text-white" />
           </div>
           <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter text-white drop-shadow-2xl mb-2">
             Chess<span className="text-indigo-500">Pro</span>
           </h1>
           <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-xs md:text-sm">
             cờ vua của người việt
           </p>
        </div>

        <div className="w-full max-w-sm mb-12">
            <div className="glass-card p-2 rounded-full flex items-center justify-between pl-6 pr-2">
                <span className="font-bold text-slate-300">
                    Xin chào, {user.username}
                </span>
                <Button variant="ghost" size="sm" onClick={() => logout()} className="text-red-400 hover:text-red-300 hover:bg-red-950/30 rounded-full px-4">
                    Đăng xuất
                </Button>
            </div>
        </div>

        {/* Game Modes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl animate-in fade-in zoom-in-95 duration-700 delay-150">
            
            {/* Online Mode Card */}
            <div className="glass-card p-8 rounded-[2.5rem] flex flex-col items-center gap-6 group hover:border-indigo-500/30 transition-all duration-300">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Users className="w-8 h-8" />
                </div>
                <div>
                    <h2 className="text-3xl font-black italic uppercase text-indigo-400 mb-1">Đánh online</h2>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Đánh xếp hạng & giao hữu</p>
                </div>
                
                <div className="w-full space-y-4">
                    <Link href="/game/online/random">
                        <Button className="w-full h-14 text-lg font-bold rounded-xl btn-primary mb-4">
                            Ghép trận nhanh
                        </Button>
                    </Link>
                    
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t border-slate-700" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-[#0f172a] px-2 text-slate-500 font-bold">Hoặc chơi với bạn bè</span>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                        <Button onClick={createRoom} className="flex-1 bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-indigo-500/20 rounded-xl font-bold">
                            Tạo phòng
                        </Button>
                        <div className="flex-1 flex gap-2">
                            <input 
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value)}
                                placeholder="MÃ PHÒNG"
                                className="glass-input w-full rounded-xl text-center font-bold tracking-widest uppercase text-sm"
                            />
                            <Button onClick={joinRoom} size="icon" className="bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-indigo-500/20 rounded-xl font-bold shrink-0">
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Solo/AI Modes */}
            <div className="flex flex-col gap-6">
                
                {/* AI Mode */}
                <Link href="/game/ai/new" className="flex-1 glass-card p-6 rounded-[2.5rem] flex items-center gap-6 group hover:border-emerald-500/30 transition-all cursor-pointer">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <Zap className="w-8 h-8" />
                    </div>
                    <div className="text-left">
                        <h2 className="text-3xl font-black italic uppercase text-emerald-400 mb-1">Đánh với AI</h2>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Stockfish 15</p>
                    </div>
                    <ArrowRight className="ml-auto text-emerald-500/50 group-hover:translate-x-1 transition-transform" />
                </Link>

                {/* Local Mode */}
                <Link href="/game/offline/local" className="flex-1 glass-card p-6 rounded-[2.5rem] flex items-center gap-6 group hover:border-amber-500/30 transition-all cursor-pointer">
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        <Monitor className="w-8 h-8" />
                    </div>
                    <div className="text-left">
                        <h2 className="text-3xl font-black italic uppercase text-amber-400 mb-1">Chơi trên cùng máy</h2>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Chuyền lượt & đánh luân phiên</p>
                    </div>
                    <ArrowRight className="ml-auto text-amber-500/50 group-hover:translate-x-1 transition-transform" />
                </Link>

            </div>

        </div>

        {/* Stats Teaser */}
        <div className="mt-12 flex gap-4 w-full max-w-4xl">
             <Link href="/social" className="flex-1 glass-card px-8 py-4 rounded-2xl flex items-center justify-between border-indigo-500/10 cursor-pointer hover:bg-white/5 transition-colors group">
                <div className="flex items-center gap-6">
                    <Trophy className="w-5 h-5 text-yellow-500 group-hover:scale-110 transition-transform" />
                    <div className="text-left">
                        <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Bảng xếp hạng</div>
                        <div className="text-sm font-bold text-white">Xem cao thủ hàng đầu</div>
                    </div>
                </div>
                <ArrowRight className="text-slate-500 group-hover:translate-x-1 transition-transform" />
            </Link>

            <Link href="/profile" className="glass-card px-8 py-4 rounded-2xl flex items-center gap-6 border-indigo-500/10 cursor-pointer hover:bg-white/5 transition-colors group">
                <div className="text-left">
                    <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Elo của bạn</div>
                    <div className="text-xl font-black text-white group-hover:text-indigo-400 transition-colors">{user.rating ?? 0}</div>
                </div>
                <div className="h-8 w-px bg-white/10 mx-2" />
                <div className="text-left">
                    <div className="text-xs text-slate-400 uppercase font-bold tracking-wider">Ván đã chơi</div>
                    <div className="text-xl font-black text-white group-hover:text-indigo-400 transition-colors">{user.gamesPlayed || 0}</div>
                </div>
            </Link>
        </div>

      </div>
    </div>
  );
}
