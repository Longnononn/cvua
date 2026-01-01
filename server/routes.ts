import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import session from "express-session";
import MemoryStore from "memorystore";
import { randomBytes, pbkdf2Sync } from "crypto";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { Chess } from "chess.js";

const SessionStore = MemoryStore(session);

const PASSWORD_ALGO = "sha256";
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_KEYLEN = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(
    password,
    salt,
    PASSWORD_ITERATIONS,
    PASSWORD_KEYLEN,
    PASSWORD_ALGO,
  ).toString("hex");

  return `${PASSWORD_ALGO}:${PASSWORD_ITERATIONS}:${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 4) {
    return stored === password;
  }

  const [algo, iterStr, salt, hash] = parts;
  const iterations = Number(iterStr);
  if (!algo || !iterations || !salt || !hash) return false;

  const computed = pbkdf2Sync(
    password,
    salt,
    iterations,
    PASSWORD_KEYLEN,
    algo,
  ).toString("hex");

  return computed === hash;
}

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

interface Room {
  id: string;
  clients: Set<WebSocket>;
  fen?: string;
  white?: WebSocket;
  black?: WebSocket;
  whiteId?: number;
  blackId?: number;
  whiteUsername?: string;
  blackUsername?: string;
  started?: boolean;
  spectators: Set<WebSocket>;
  game?: Chess;
}

const rooms = new Map<string, Room>();
const matchQueue: { ws: WebSocket, userId: number }[] = [];
const userConnections = new Map<number, Set<WebSocket>>();
const invites = new Map<number, {
  id: string;
  fromUserId: number;
  fromUsername: string;
  roomId: string;
  createdAt: number;
  status: 'pending' | 'accepted' | 'declined';
}[]>();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Session Middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || "chess_secret",
    resave: false,
    saveUninitialized: false,
    store: new SessionStore({ checkPeriod: 86400000 }),
    cookie: { 
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  const emailSchema = z.object({
    email: z.string().email(),
  });

  const resetPasswordSchema = z.object({
    email: z.string(),
    code: z.string().min(1),
    newPassword: z.string().min(4),
  });

  async function sendResetEmailNode(email: string, code: string) {
    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_TEMPLATE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    if (!serviceId || !templateId || !publicKey) {
      return;
    }
    const url = "https://api.emailjs.com/api/v1.0/email/send";
    const payload = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        name: email,
        code,
      },
    };
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  // Auth Routes
  app.post(api.users.register.path, async (req, res) => {
    try {
      const input = api.users.register.input.parse(req.body);
      const existing = await storage.getUserByUsername(input.username);
      if (existing) return res.status(400).json({ message: "Username taken" });
      const user = await storage.createUser({
        username: input.username,
        password: hashPassword(input.password),
      });
      req.session.userId = user.id; // Store in session
      req.session.save();
      res.status(201).json(user);
    } catch (e) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.post(api.users.login.path, async (req, res) => {
    try {
      const input = api.users.login.input.parse(req.body);
      const user = await storage.getUserByUsername(input.username);
      if (!user || !verifyPassword(input.password, user.password)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      req.session.userId = user.id;
      req.session.save();
      res.json(user);
    } catch (e) {
      res.status(400).json({ message: "Invalid input" });
    }
  });

  app.get(api.users.me.path, async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not logged in" });
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "User not found" });
      res.json(user);
    } catch (e) {
      console.error("Me error:", e);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/logout", (req, res) => {
    if (!req.session) {
      return res.status(200).json({ success: true });
    }
    req.session.destroy(err => {
      res.clearCookie("connect.sid", {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ success: true });
    });
  });

  app.post("/api/user/email", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not logged in" });
      const parsed = emailSchema.parse(req.body);
      await storage.setUserEmail(req.session.userId, parsed.email);
      res.json({ success: true });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid email" });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/user/forgot-password", async (req, res) => {
    try {
      const parsed = emailSchema.parse(req.body);
      const user = await storage.getUserByEmail(parsed.email);
      if (!user) {
        return res.json({ success: true });
      }
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await storage.createPasswordReset(user.id, code, expiresAt);
      await sendResetEmailNode(parsed.email, code);
      res.json({ success: true });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid email" });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/user/reset-password", async (req, res) => {
    try {
      const parsed = resetPasswordSchema.parse(req.body);
      const emailOrUsername = parsed.email;
      const resetRow = await storage.getLatestPasswordResetByEmail(emailOrUsername, parsed.code);
      if (!resetRow) {
        return res.status(400).json({ message: "Invalid code" });
      }
      if (resetRow.used) {
        return res.status(400).json({ message: "Code already used" });
      }
      if (resetRow.expiresAt && resetRow.expiresAt.getTime() <= Date.now()) {
        return res.status(400).json({ message: "Code expired" });
      }
      const newHash = hashPassword(parsed.newPassword);
      const user = await storage.getUser(resetRow.userId);
      if (!user) {
        return res.status(400).json({ message: "User not found" });
      }
      await db
        .update(users)
        .set({ password: newHash })
        .where(eq(users.id, resetRow.userId));
      await storage.markPasswordResetUsed(resetRow.id);
      res.json({ success: true });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input" });
      }
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/leaderboard", async (req, res) => {
    try {
      const users = await storage.getLeaderboard();
      res.json(users);
    } catch (e) {
      console.error("Leaderboard error:", e);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/users/search", async (req, res) => {
    try {
      const q = req.query.q as string;
      if (!q) return res.json([]);
      const users = await storage.searchUsers(q);
      res.json(users);
    } catch (e) {
      console.error("Search error:", e);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID" });
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({
        id: user.id,
        username: user.username,
        rating: user.rating,
        gamesPlayed: user.gamesPlayed,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
      });
    } catch (e) {
      console.error("Get user error:", e);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/games/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID" });
      const games = await storage.getGames(userId);
      res.json(games);
    } catch (e) {
      console.error("Get games error:", e);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/invite", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not logged in" });
      const { toUserId, roomId } = req.body as { toUserId?: number; roomId?: string };
      if (!toUserId || !roomId) return res.status(400).json({ message: "Invalid invite" });

      const fromUser = await storage.getUser(req.session.userId);
      if (!fromUser) return res.status(400).json({ message: "User not found" });

      const invite = {
        id: Math.random().toString(36).slice(2, 10),
        fromUserId: fromUser.id,
        fromUsername: fromUser.username,
        roomId,
        createdAt: Date.now(),
        status: 'pending' as const,
      };

      const list = invites.get(toUserId) ?? [];
      list.push(invite);
      invites.set(toUserId, list);

      // Broadcast to target user if connected
      const targets = userConnections.get(toUserId);
      if (targets) {
        targets.forEach((targetWs) => {
          if (targetWs.readyState !== WebSocket.OPEN) return;
          targetWs.send(JSON.stringify({ type: 'new_invite', invite }));
        });
      }

      res.json(invite);
    } catch (e) {
      console.error("Invite error", e);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.get("/api/inbox", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not logged in" });
      const list = invites.get(req.session.userId) ?? [];
      res.json(list);
    } catch (e) {
      console.error("Inbox error", e);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  app.post("/api/invite/:id/respond", async (req, res) => {
    try {
      if (!req.session.userId) return res.status(401).json({ message: "Not logged in" });
      const inviteId = req.params.id;
      const { action } = req.body as { action?: 'accept' | 'decline' };
      if (action !== 'accept' && action !== 'decline') {
        return res.status(400).json({ message: "Invalid action" });
      }

      const list = invites.get(req.session.userId) ?? [];
      const idx = list.findIndex(i => i.id === inviteId);
      if (idx === -1) return res.status(404).json({ message: "Invite not found" });

      const invite = list[idx];
      invite.status = action === 'accept' ? 'accepted' : 'declined';

      // Optionally remove handled invites from inbox
      invites.set(req.session.userId, list.filter(i => i.id !== inviteId));

      res.json({ status: invite.status, roomId: invite.roomId });
    } catch (e) {
      console.error("Respond invite error", e);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  // WebSocket Setup
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    let currentUserId: number | undefined;

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'auth') {
          if (msg.userId) {
            currentUserId = msg.userId;
            const existing = userConnections.get(msg.userId);
            if (existing) {
              existing.add(ws);
            } else {
              userConnections.set(msg.userId, new Set([ws]));
            }
          }
        }
        
        if (msg.type === 'find_match') {
            const { userId } = msg;
            if (typeof userId !== "number") return;

            const existing = matchQueue.find(item => item.userId === userId);
            if (existing) {
                existing.ws = ws; 
                return;
            }

            if (matchQueue.length > 0) {
                const opponentIdx = matchQueue.findIndex(item => item.userId !== userId);
                if (opponentIdx !== -1) {
                    const opponent = matchQueue.splice(opponentIdx, 1)[0];
                    if (opponent.ws.readyState === WebSocket.OPEN) {
                        const roomId = Math.random().toString(36).substring(2, 9);
                        ws.send(JSON.stringify({ type: 'match_found', roomId }));
                        opponent.ws.send(JSON.stringify({ type: 'match_found', roomId }));
                    } else {
                        matchQueue.push({ ws, userId });
                    }
                } else {
                    matchQueue.push({ ws, userId });
                }
            } else {
                matchQueue.push({ ws, userId });
            }
        }

        if (msg.type === 'join') {
          const { roomId, userId, username } = msg;
          let room = rooms.get(roomId);
          if (!room) {
            const game = new Chess();
            room = { id: roomId, clients: new Set(), spectators: new Set(), game, fen: game.fen() };
            rooms.set(roomId, room);
          }
          
          room.clients.add(ws);

          let role: 'w' | 'b' | 's' = 's';
          if (!room.white) {
             room.white = ws;
             if (userId) room.whiteId = userId;
             if (typeof username === "string") room.whiteUsername = username;
             role = 'w';
          } else if (!room.black) {
             room.black = ws;
             if (userId) room.blackId = userId;
             if (typeof username === "string") room.blackUsername = username;
             role = 'b';
          } else {
             room.spectators.add(ws);
             role = 's';
          }

          const count = room.clients.size;
          room.clients.forEach(c => c.send(JSON.stringify({ type: 'stats', count })));

          ws.send(JSON.stringify({ type: 'role', role, waiting: role !== 's' && !(room.white && room.black) }));
          
          if (room.fen) {
              ws.send(JSON.stringify({ type: 'state', fen: room.fen }));
          }

          if (room.white && room.black) {
              // Notify the joiner about the opponent if they are one of the players
              if (ws === room.white && room.blackId && room.blackUsername) {
                ws.send(JSON.stringify({ type: 'opponent_info', id: room.blackId, username: room.blackUsername }));
              } else if (ws === room.black && room.whiteId && room.whiteUsername) {
                ws.send(JSON.stringify({ type: 'opponent_info', id: room.whiteId, username: room.whiteUsername }));
              }

              // Also notify spectators about both players
              if (room.spectators.has(ws)) {
                if (room.whiteId && room.whiteUsername) {
                   ws.send(JSON.stringify({ type: 'player_info', color: 'w', id: room.whiteId, username: room.whiteUsername }));
                }
                if (room.blackId && room.blackUsername) {
                   ws.send(JSON.stringify({ type: 'player_info', color: 'b', id: room.blackId, username: room.blackUsername }));
                }
              }

              if (!room.started) {
                room.started = true;
                if (room.whiteId && room.blackId && room.whiteUsername && room.blackUsername) {
                  room.white.send(JSON.stringify({ 
                    type: 'opponent_info', 
                    id: room.blackId, 
                    username: room.blackUsername 
                  }));
                  room.black.send(JSON.stringify({ 
                    type: 'opponent_info', 
                    id: room.whiteId, 
                    username: room.whiteUsername 
                  }));
                }

                room.white.send(JSON.stringify({ type: 'start_game', color: 'w' }));
                room.black.send(JSON.stringify({ type: 'start_game', color: 'b' }));
              }
          }
        }
        
        if (msg.type === 'move') {
          const { roomId, move, promotion } = msg;
          const room = rooms.get(roomId);
          if (room && move && move.from && move.to) {
            if (!room.game) {
              room.game = new Chess(room.fen || undefined);
            }
            try {
              const result = room.game.move({ from: move.from, to: move.to, promotion: promotion || 'q' });
              if (!result) {
                return;
              }
              room.fen = room.game.fen();
              const senderId = currentUserId;
              room.clients.forEach(c => {
                if (c !== ws) {
                  c.send(JSON.stringify({ 
                    type: 'move', 
                    from: move.from, 
                    to: move.to, 
                    promotion: promotion || 'q', 
                    fen: room.fen,
                    senderId
                  }));
                }
              });
            } catch {
            }
          }
        }
        
        if (msg.type === 'game_over') {
             const { roomId, result, winnerColor } = msg;
             const room = rooms.get(roomId);
             if (room && room.whiteId && room.blackId) {
                // Update Elo: +3 for winner, 0 for loser
                if (winnerColor === 'w') {
                    const whiteUser = await storage.getUser(room.whiteId);
                    if (whiteUser) {
                        const newRating = (whiteUser.rating || 0) + 3;
                        await storage.updateUserRating(room.whiteId, newRating);
                    }
                    // Even if loser gets 0, we still update their gamesPlayed
                    await storage.updateUserRating(room.blackId, (await storage.getUser(room.blackId))?.rating || 0);
                } else if (winnerColor === 'b') {
                    const blackUser = await storage.getUser(room.blackId);
                    if (blackUser) {
                         const newRating = (blackUser.rating || 0) + 3;
                         await storage.updateUserRating(room.blackId, newRating);
                    }
                    await storage.updateUserRating(room.whiteId, (await storage.getUser(room.whiteId))?.rating || 0);
                } else {
                    // Draw: both get +1? Or 0? User said +3 for win. Let's do 0 for draw for now.
                    await storage.updateUserRating(room.whiteId, (await storage.getUser(room.whiteId))?.rating || 0);
                    await storage.updateUserRating(room.blackId, (await storage.getUser(room.blackId))?.rating || 0);
                }
                
                await storage.createGame({
                    whitePlayerId: room.whiteId,
                    blackPlayerId: room.blackId,
                    result: result,
                    pgn: room.fen || "",
                });
             }
             
             // Broadcast game over
             if (room) {
                room.clients.forEach(c => {
                   if (c !== ws) c.send(JSON.stringify({ type: 'game_over', result }));
                });
                // Optional: rooms.delete(roomId) after some delay
             }
        }

        if (msg.type === 'chat') {
           const { roomId, text, sender } = msg;
           const room = rooms.get(roomId);
           if (room) {
             room.clients.forEach(c => {
               if (c !== ws) c.send(JSON.stringify({ type: 'chat', text, sender }));
             });
           }
        }

        if (msg.type === 'draw_request') {
          const { roomId, sender } = msg;
          const room = rooms.get(roomId);
          if (room) {
            room.clients.forEach(c => {
              if (c !== ws) c.send(JSON.stringify({ type: 'draw_request', sender }));
            });
          }
        }

        if (msg.type === 'draw_respond') {
          const { roomId, accepted } = msg;
          const room = rooms.get(roomId);
          if (room) {
            room.clients.forEach(c => {
              c.send(JSON.stringify({ type: 'draw_respond', accepted }));
            });
          }
        }

        if (msg.type === 'voice_signal') {
          const { roomId, signal, targetId, senderId } = msg;
          const room = rooms.get(roomId);
          if (room) {
            // Forward signaling to specific client or all others
            room.clients.forEach(c => {
              if (c !== ws) {
                c.send(JSON.stringify({ type: 'voice_signal', signal, senderId }));
              }
            });
          }
        }

      } catch (e) {
        console.error("WS Error", e);
      }
    });

    ws.on('close', () => {
      if (currentUserId) {
        const set = userConnections.get(currentUserId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            userConnections.delete(currentUserId);
          }
        }
      }
      for (let i = matchQueue.length - 1; i >= 0; i--) {
        if (matchQueue[i]?.ws === ws) {
          matchQueue.splice(i, 1);
        }
      }
      rooms.forEach(room => {
        if (room.clients.has(ws)) {
          room.clients.delete(ws);
          if (room.white === ws) room.white = undefined;
          if (room.black === ws) room.black = undefined;
          room.spectators.delete(ws);

          const count = room.clients.size;
          room.clients.forEach(c => c.send(JSON.stringify({ type: 'stats', count })));
        }
      });
    });
  });

  return httpServer;
}
