import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import session from "express-session";
import MemoryStore from "memorystore";

const SessionStore = MemoryStore(session);

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
  spectators: Set<WebSocket>;
}

const rooms = new Map<string, Room>();

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

  // Auth Routes
  app.post(api.users.register.path, async (req, res) => {
    try {
      const input = api.users.register.input.parse(req.body);
      const existing = await storage.getUserByUsername(input.username);
      if (existing) return res.status(400).json({ message: "Username taken" });
      const user = await storage.createUser(input);
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
      if (!user || user.password !== input.password) {
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
    if (!req.session.userId) return res.status(401).json({ message: "Not logged in" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    res.json(user);
  });

  // WebSocket Setup
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        if (msg.type === 'join') {
          const { roomId, role } = msg;
          let room = rooms.get(roomId);
          if (!room) {
            room = { id: roomId, clients: new Set(), spectators: new Set() };
            rooms.set(roomId, room);
          }
          
          room.clients.add(ws);
          
          if (role === 'white' && !room.white) room.white = ws;
          else if (role === 'black' && !room.black) room.black = ws;
          else room.spectators.add(ws);

          // Broadcast user count
          const count = room.clients.size;
          room.clients.forEach(c => c.send(JSON.stringify({ type: 'stats', count })));
          
          // Send current state
          if (room.fen) ws.send(JSON.stringify({ type: 'state', fen: room.fen }));
        }
        
        if (msg.type === 'move') {
          const { roomId, move, fen } = msg;
          const room = rooms.get(roomId);
          if (room) {
            room.fen = fen;
            // Broadcast to others
            room.clients.forEach(c => {
              if (c !== ws) c.send(JSON.stringify({ type: 'move', move, fen }));
            });
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

      } catch (e) {
        console.error("WS Error", e);
      }
    });

    ws.on('close', () => {
      // Cleanup
      rooms.forEach(room => {
        if (room.clients.has(ws)) {
          room.clients.delete(ws);
          if (room.white === ws) room.white = undefined;
          if (room.black === ws) room.black = undefined;
          room.spectators.delete(ws);
        }
      });
    });
  });

  return httpServer;
}
