import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Game } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Swords, Calendar, Home, History, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { api } from "@shared/routes";
import { API_BASE_URL } from "@/lib/queryClient";

const TOKEN_KEY = "auth_token";

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export default function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inbox, setInbox] = useState<Array<{
    id: string;
    fromUserId: number;
    fromUsername: string;
    roomId: string;
    createdAt: number;
    status: 'pending' | 'accepted' | 'declined';
  }>>([]);

  const { data: games, isLoading } = useQuery<Game[]>({
    queryKey: [`/api/games/${user?.id}`],
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (user?.email) {
      setEmail(user.email);
    }
  }, [user?.email]);

  useEffect(() => {
    const loadInbox = async () => {
      if (!user) return;
      setInboxLoading(true);
      try {
        const token = getToken();
        const res = await fetch(`${API_BASE_URL}/api/inbox`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          setInbox(data || []);
        }
      } catch (e) {
        console.error("Failed to load inbox", e);
      } finally {
        setInboxLoading(false);
      }
    };
    loadInbox();
  }, [user]);

  if (!user) return null;

  const handleSaveEmail = async () => {
    if (!email) {
      toast({
        title: "Lỗi",
        description: "Vui lòng nhập email",
        variant: "destructive",
      });
      return;
    }
    setSavingEmail(true);
    try {
      const token = getToken();
      const res = await fetch(API_BASE_URL + "/api/user/email", {
        method: "POST",
        headers: token
          ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
          : { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Lưu email thất bại");
      }
      queryClient.setQueryData([api.users.me.path], (old: any) =>
        old ? { ...old, email } : old,
      );
      toast({
        title: "Đã lưu email",
        description: "Email sẽ dùng để đặt lại mật khẩu khi quên.",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Có lỗi xảy ra, vui lòng thử lại";
      toast({
        title: "Lỗi",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white p-4 md:p-8 relative overflow-hidden">
      <div className="bg-glow-layer" />
      
      <div className="max-w-4xl mx-auto relative z-10">
        <header className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="hover:bg-white/10 rounded-xl">
                    <Home className="w-5 h-5 text-slate-400" />
                </Button>
                <h1 className="text-3xl font-black italic tracking-tighter">
                    Hồ sơ <span className="text-indigo-500">người chơi</span>
                </h1>
            </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="bg-slate-900/50 border-white/10 backdrop-blur-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest">
                        Điểm Elo
                    </CardTitle>
                    <Trophy className="w-4 h-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-4xl font-black text-white">{user.rating || 0}</div>
                    <p className="text-xs text-slate-500 mt-1">Elo hiện tại</p>
                </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-white/10 backdrop-blur-md md:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-indigo-400" />
                  <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest">
                    Email tài khoản
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
                  <Input
                    type="email"
                    placeholder="ban@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="glass-input h-11 rounded-xl text-sm md:text-base"
                  />
                  <Button
                    onClick={handleSaveEmail}
                    disabled={savingEmail}
                    className="md:w-auto w-full h-11 rounded-xl font-bold"
                  >
                    {savingEmail ? "Đang lưu..." : "Lưu email"}
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Email dùng để nhận mã khi bạn bấm quên mật khẩu.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-white/10 backdrop-blur-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest">
                        Số ván đã chơi
                    </CardTitle>
                    <Swords className="w-4 h-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-4xl font-black text-white">{user.gamesPlayed || 0}</div>
                    <p className="text-xs text-slate-500 mt-1">Tổng số ván</p>
                </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-white/10 backdrop-blur-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest">
                        Tham gia từ
                    </CardTitle>
                    <Calendar className="w-4 h-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-xl font-bold text-white">Hôm nay</div>
                    <p className="text-xs text-slate-500 mt-1">Vừa tham gia</p>
                </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-white/10 backdrop-blur-md md:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-indigo-400" />
                  <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-widest">
                    Hòm thư lời mời đấu
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {inboxLoading ? (
                  <div className="text-sm text-slate-500">Đang tải lời mời...</div>
                ) : inbox.length === 0 ? (
                  <div className="text-sm text-slate-500">
                    Chưa có lời mời nào.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {inbox.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3"
                      >
                        <div>
                          <div className="text-sm font-bold text-white">
                            {invite.fromUsername} mời bạn đấu cờ
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Mã phòng: {invite.roomId}
                          </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                              onClick={async () => {
                                try {
                                  const token = getToken();
                                  const res = await fetch(
                                    `${API_BASE_URL}/api/invite/${invite.id}/respond`,
                                    {
                                      method: "POST",
                                      headers: token
                                        ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
                                        : { "Content-Type": "application/json" },
                                      body: JSON.stringify({ action: "accept" }),
                                    },
                                  );
                                  if (res.ok) {
                                    const data = await res.json();
                                  setInbox((prev) =>
                                    prev.filter((i) => i.id !== invite.id)
                                  );
                                  if (data.roomId) {
                                    setLocation(`/game/online/${data.roomId}`);
                                  }
                                }
                              } catch (e) {
                                console.error("Accept invite failed", e);
                              }
                            }}
                          >
                            Chấp nhận
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg border-red-500/40 text-red-400"
                            onClick={async () => {
                              try {
                                const token = getToken();
                                const res = await fetch(
                                  `${API_BASE_URL}/api/invite/${invite.id}/respond`,
                                  {
                                    method: "POST",
                                    headers: token
                                      ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
                                      : { "Content-Type": "application/json" },
                                    body: JSON.stringify({ action: "decline" }),
                                  }
                                );
                                if (res.ok) {
                                  setInbox((prev) =>
                                    prev.filter((i) => i.id !== invite.id)
                                  );
                                }
                              } catch (e) {
                                console.error("Decline invite failed", e);
                              }
                            }}
                          >
                            Từ chối
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
        </div>

        <div className="bg-slate-900/50 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md">
            <div className="p-6 border-b border-white/10 flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-bold text-white">Lịch sử thi đấu</h2>
            </div>
            
            <div className="divide-y divide-white/5">
                {isLoading ? (
                    <div className="p-8 text-center text-slate-500">Đang tải lịch sử...</div>
                ) : games && games.length > 0 ? (
                    games.map((game) => {
                        const isWhite = game.whitePlayerId === user.id;
                        const resultText = game.result || "";
                        const winnerColor =
                          resultText.includes("Trắng thắng")
                            ? "w"
                            : resultText.includes("Đen thắng")
                            ? "b"
                            : resultText.includes("Hòa")
                            ? "draw"
                            : null;
                        const isWin =
                          winnerColor === (isWhite ? "w" : "b");
                        const isDraw = winnerColor === "draw";
                        const barColorClass = isWin
                          ? "bg-emerald-500"
                          : isDraw
                          ? "bg-slate-500"
                          : "bg-red-500";
                        const playingAsLabel = isWhite
                          ? "Cầm quân Trắng"
                          : "Cầm quân Đen";
                        const displayResult =
                          resultText || "Kết quả chưa xác định";
                        const startTimeText = game.createdAt
                          ? format(new Date(game.createdAt), "MMM d, HH:mm")
                          : "-";
                        return (
                            <div key={game.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`w-2 h-12 rounded-full ${barColorClass}`} />
                                    <div>
                                        <div className="font-bold text-white">
                                            {displayResult}
                                        </div>
                                        <div className="text-sm text-slate-400">
                                            {playingAsLabel}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-mono text-slate-500">
                                        {startTimeText}
                                    </div>
                                    <div className="text-xs text-indigo-400 mt-1">
                                        ID: {game.id}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="p-8 text-center text-slate-500">
                        Chưa có ván nào. Hãy bắt đầu một ván đấu!
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
