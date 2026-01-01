import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { 
  Trophy, Search, User as UserIcon, ArrowLeft, Crown, 
  Gamepad2, Swords, MessageSquare
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Table, TableBody, TableCell, TableHead, 
  TableHeader, TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { nanoid } from "nanoid";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/queryClient";

const TOKEN_KEY = "auth_token";

function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export default function SocialPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  
  const { data: leaderboard, isLoading: loadingLeaderboard } = useQuery<any[]>({ 
    queryKey: ['/api/leaderboard'] 
  });

  const { data: searchResults } = useQuery<any[]>({ 
    queryKey: ['/api/users/search', search], 
    queryFn: async () => {
        if (!search) return [];
        const res = await fetch(`${API_BASE_URL}/api/users/search?q=${encodeURIComponent(search)}`);
        return res.json();
    },
    enabled: search.length > 0 
  });

  return (
    <div className="min-h-screen bg-[#020617] text-white relative p-6">
      <div className="bg-glow-layer" />
      
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
                <ArrowLeft className="w-6 h-6" />
            </Button>
            <h1 className="text-3xl font-black italic tracking-tighter">
                Cộng đồng<span className="text-indigo-500">Hub</span>
            </h1>
        </div>

        {selectedUser && (
            <Card className="bg-indigo-600/10 border-indigo-500/30 backdrop-blur-md mb-8">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                            <UserIcon className="w-8 h-8 text-indigo-400" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl text-white">{selectedUser.username}</CardTitle>
                            <CardDescription className="text-indigo-300">Hạng: {selectedUser.rating} Elo</CardDescription>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedUser(null)}>Đóng</Button>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-center">
                            <div className="text-sm text-slate-400">Thắng</div>
                            <div className="text-xl font-bold text-emerald-400">{selectedUser.wins || 0}</div>
                        </div>
                        <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-center">
                            <div className="text-sm text-slate-400">Thua</div>
                            <div className="text-xl font-bold text-red-400">{selectedUser.losses || 0}</div>
                        </div>
                        <div className="bg-white/5 p-4 rounded-xl border border-white/10 text-center">
                            <div className="text-sm text-slate-400">Hòa</div>
                            <div className="text-xl font-bold text-amber-400">{selectedUser.draws || 0}</div>
                        </div>
                    </div>
                    <Button 
                        className="w-full bg-indigo-500 hover:bg-indigo-600"
                        onClick={async () => {
                            const roomId = nanoid(6).toUpperCase();
                            try {
                                const token = getToken();
                                const res = await fetch(`${API_BASE_URL}/api/invite`, {
                                    method: 'POST',
                                    headers: token
                                      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
                                      : { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ toUserId: selectedUser.id, roomId }),
                                });
                                if (res.ok) {
                                    toast({
                                        title: "Đã gửi lời mời",
                                        description: `Đang chờ ${selectedUser.username} chấp nhận...`,
                                    });
                                    setLocation(`/game/online/${roomId}`);
                                }
                            } catch (e) {
                                console.error("Send invite failed", e);
                            }
                        }}
                    >
                        <Swords className="w-4 h-4 mr-2" />
                        Gửi lời mời thách đấu
                    </Button>
                </CardContent>
            </Card>
        )}

        <Tabs defaultValue="leaderboard" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-slate-900/50 p-1 rounded-xl mb-8">
                <TabsTrigger value="leaderboard" className="rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                    <Trophy className="w-4 h-4 mr-2" />
                    Bảng xếp hạng
                </TabsTrigger>
                <TabsTrigger value="search" className="rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                    <Search className="w-4 h-4 mr-2" />
                    Tìm người chơi
                </TabsTrigger>
            </TabsList>

            <TabsContent value="leaderboard">
                <Card className="glass-card border-none text-slate-200">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Crown className="w-6 h-6 text-yellow-500" />
                            Cao thủ hàng đầu
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loadingLeaderboard ? (
                            <div className="text-center py-8 text-slate-500">Đang tải...</div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-white/10">
                                        <TableHead className="text-slate-400">Hạng</TableHead>
                                        <TableHead className="text-slate-400">Người chơi</TableHead>
                                        <TableHead className="text-right text-slate-400">Elo</TableHead>
                                        <TableHead className="text-right text-slate-400">Ván</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {leaderboard?.map((player, index) => (
                                        <TableRow 
                                            key={player.id} 
                                            className="hover:bg-white/5 border-white/5 cursor-pointer" 
                                            onClick={() => setSelectedUser(player)}
                                        >
                                            <TableCell className="font-bold">
                                                {index === 0 && <span className="text-yellow-500">🥇</span>}
                                                {index === 1 && <span className="text-slate-400">🥈</span>}
                                                {index === 2 && <span className="text-amber-700">🥉</span>}
                                                {index > 2 && <span className="text-slate-500">#{index + 1}</span>}
                                            </TableCell>
                                            <TableCell className="font-medium text-indigo-300">
                                                <div className="flex items-center gap-2">
                                                    {player.username}
                                                    {player.id !== user?.id && (
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost" 
                                                            className="h-6 w-6 p-0"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedUser(player);
                                                            }}
                                                        >
                                                            <UserIcon className="w-3 h-3" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right font-mono font-bold">{player.rating}</TableCell>
                                            <TableCell className="text-right text-slate-500">{player.gamesPlayed}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="search">
                <Card className="glass-card border-none text-slate-200">
                    <CardHeader>
                        <CardTitle>Tìm người chơi</CardTitle>
                        <div className="relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                            <Input 
                                placeholder="Tìm theo tên tài khoản..." 
                                className="pl-10 bg-slate-900/50 border-white/10 text-white"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                         <div className="space-y-4">
                            {searchResults?.map(player => (
                                <div 
                                    key={player.id} 
                                    className="flex items-center justify-between p-4 bg-slate-900/30 rounded-xl border border-white/5 cursor-pointer hover:border-indigo-500/50 transition-all"
                                    onClick={() => setSelectedUser(player)}
                                >
                                    <div className="flex items-center gap-4">
                                        <Avatar>
                                            <AvatarFallback className="bg-indigo-600 text-white">
                                                {player.username.substring(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="font-bold text-white">{player.username}</div>
                                            <div className="text-xs text-slate-500">Elo: {player.rating}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button 
                                            size="sm" 
                                            variant="secondary" 
                                            className="bg-white/10 hover:bg-white/20"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedUser(player);
                                            }}
                                        >
                                            Xem Profile
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            {search && searchResults?.length === 0 && (
                                <div className="text-center text-slate-500 py-8">Không tìm thấy người chơi nào</div>
                            )}
                         </div>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
