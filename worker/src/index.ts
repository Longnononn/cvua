type TokenPayload = {
  sub: number;
  username: string;
  iat: number;
  exp: number;
};

type Env = {
  DB: D1Database;
  SESSION_SECRET: string;
  TOKEN_TTL_SECONDS?: string;
  ROOM: DurableObjectNamespace;
  HUB: DurableObjectNamespace;
  MATCH: DurableObjectNamespace;
  EMAILJS_SERVICE_ID?: string;
  EMAILJS_TEMPLATE_ID?: string;
  EMAILJS_PUBLIC_KEY?: string;
};

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function withCors(req: Request, res: Response) {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function base64UrlEncode(bytes: ArrayBuffer) {
  const bin = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeToBytes(input: string) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string) {
  const clean = hex.trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function hmacSign(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(sig);
}

function ensureSessionSecret(env: Env) {
  const s = (env as any)?.SESSION_SECRET;
  if (typeof s !== "string" || !s.trim()) {
    throw new Error("SESSION_SECRET not set");
  }
  return s;
}

async function makeToken(env: Env, payload: Omit<TokenPayload, "iat" | "exp">) {
  const secret = ensureSessionSecret(env);
  const now = Date.now();
  const ttl = Number(env.TOKEN_TTL_SECONDS || "604800") * 1000;
  const full: TokenPayload = { ...payload, iat: now, exp: now + ttl };
  const body = btoa(JSON.stringify(full)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

async function verifyToken(env: Env, token: string | null): Promise<TokenPayload | null> {
  if (!token) return null;
  let secret: string;
  try {
    secret = ensureSessionSecret(env);
  } catch {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = await hmacSign(secret, body);
  if (sig !== expected) return null;
  try {
    const jsonStr = atob(body.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((body.length + 3) % 4));
    const payload = JSON.parse(jsonStr) as TokenPayload;
    if (!payload?.sub || !payload?.exp) return null;
    if (payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function readBearer(req: Request) {
  const h = req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

async function hashPassword(password: string) {
  const algo = "sha256";
  const iterations = 100_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    512,
  );
  return `${algo}:${iterations}:${toHex(salt)}:${toHex(bits)}`;
}

async function verifyPassword(password: string, stored: string) {
  const parts = stored.split(":");
  if (parts.length !== 4) return stored === password;
  const [algo, iterStr, saltHex, hashHex] = parts;
  const iterations = Number(iterStr);
  if (algo !== "sha256" || !iterations || !saltHex || !hashHex) return false;
  const salt = fromHex(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    512,
  );
  return toHex(bits) === hashHex.toLowerCase();
}

function userDto(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? null,
    rating: row.rating ?? 0,
    gamesPlayed: row.games_played ?? row.gamesPlayed ?? 0,
    wins: row.wins ?? 0,
    losses: row.losses ?? 0,
    draws: row.draws ?? 0,
  };
}

async function requireAuth(req: Request, env: Env) {
  const token = readBearer(req);
  const payload = await verifyToken(env, token);
  return payload;
}

async function handleApi(req: Request, env: Env, url: URL) {
  const { pathname } = url;

  if (req.method === "OPTIONS") {
    return withCors(req, new Response(null, { status: 204 }));
  }

  if (
    (pathname === "/api/register" && req.method !== "POST") ||
    (pathname === "/api/login" && req.method !== "POST") ||
    (pathname === "/api/user" && req.method !== "GET") ||
    (pathname === "/api/logout" && req.method !== "POST") ||
    (pathname === "/api/leaderboard" && req.method !== "GET") ||
    (pathname === "/api/users/search" && req.method !== "GET") ||
    (pathname === "/api/invite" && req.method !== "POST") ||
    (pathname === "/api/inbox" && req.method !== "GET") ||
    (pathname === "/api/user/email" && req.method !== "POST") ||
    (pathname === "/api/user/forgot-password" && req.method !== "POST") ||
    (pathname === "/api/user/reset-password" && req.method !== "POST")
  ) {
    return withCors(req, json({ message: "Method Not Allowed" }, { status: 405 }));
  }

  if (pathname === "/api/register" && req.method === "POST") {
    const body = await req.json().catch(() => null) as { username?: string; password?: string } | null;
    const username = body?.username?.trim();
    const password = body?.password;
    if (!username || !password) return withCors(req, json({ message: "Invalid input" }, { status: 400 }));

    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) return withCors(req, json({ message: "Username taken" }, { status: 400 }));

    const pw = await hashPassword(password);
    const createdAt = Math.floor(Date.now() / 1000);
    const insert = await env.DB.prepare(
      "INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)",
    ).bind(username, pw, createdAt).run();

    const id = Number(insert.meta.last_row_id);
    const row = await env.DB.prepare(
      "SELECT id, username, email, rating, games_played, wins, losses, draws FROM users WHERE id = ?",
    ).bind(id).first();

    const token = await makeToken(env, { sub: id, username });
    return withCors(req, json({ ...userDto(row), token }, { status: 201 }));
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const body = await req.json().catch(() => null) as { username?: string; password?: string } | null;
    const username = body?.username?.trim();
    const password = body?.password;
    if (!username || !password) return withCors(req, json({ message: "Invalid input" }, { status: 400 }));

    const row = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
    if (!row) return withCors(req, json({ message: "Invalid credentials" }, { status: 401 }));
    const ok = await verifyPassword(password, row.password);
    if (!ok) return withCors(req, json({ message: "Invalid credentials" }, { status: 401 }));

    const token = await makeToken(env, { sub: row.id, username: row.username });
    return withCors(req, json({ ...userDto(row), token }, { status: 200 }));
  }

  if (pathname === "/api/user" && req.method === "GET") {
    const payload = await requireAuth(req, env);
    if (!payload) return withCors(req, json({ message: "Not logged in" }, { status: 401 }));
    const row = await env.DB.prepare(
      "SELECT id, username, email, rating, games_played, wins, losses, draws FROM users WHERE id = ?",
    ).bind(payload.sub).first();
    if (!row) return withCors(req, json({ message: "User not found" }, { status: 401 }));
    return withCors(req, json(userDto(row), { status: 200 }));
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    return withCors(req, json({ success: true }, { status: 200 }));
  }

  if (pathname === "/api/leaderboard" && req.method === "GET") {
    const res = await env.DB.prepare(
      "SELECT id, username, email, rating, games_played, wins, losses, draws FROM users ORDER BY rating DESC LIMIT 10",
    ).all();
    return withCors(req, json((res.results || []).map(userDto), { status: 200 }));
  }

  if (pathname === "/api/users/search" && req.method === "GET") {
    const q = url.searchParams.get("q")?.trim() || "";
    if (!q) return withCors(req, json([], { status: 200 }));
    const pattern = `%${q.toLowerCase()}%`;
    const res = await env.DB.prepare(
      "SELECT id, username, email, rating, games_played, wins, losses, draws FROM users WHERE lower(username) LIKE ? LIMIT 5",
    ).bind(pattern).all();
    return withCors(req, json((res.results || []).map(userDto), { status: 200 }));
  }

  const userIdMatch = pathname.match(/^\/api\/users\/(\d+)$/);
  if (userIdMatch && req.method === "GET") {
    const id = Number(userIdMatch[1]);
    const row = await env.DB.prepare(
      "SELECT id, username, rating, games_played, wins, losses, draws FROM users WHERE id = ?",
    ).bind(id).first();
    if (!row) return withCors(req, json({ message: "User not found" }, { status: 404 }));
    return withCors(req, json(userDto(row), { status: 200 }));
  }

  const gamesMatch = pathname.match(/^\/api\/games\/(\d+)$/);
  if (gamesMatch && req.method === "GET") {
    const id = Number(gamesMatch[1]);
    const res = await env.DB.prepare(
      "SELECT id, white_player_id as whitePlayerId, black_player_id as blackPlayerId, pgn, result, created_at as createdAt FROM games WHERE white_player_id = ? OR black_player_id = ? ORDER BY created_at DESC",
    ).bind(id, id).all();
    return withCors(req, json(res.results || [], { status: 200 }));
  }

  if (pathname === "/api/invite" && req.method === "POST") {
    const payload = await requireAuth(req, env);
    if (!payload) return withCors(req, json({ message: "Not logged in" }, { status: 401 }));
    const body = await req.json().catch(() => null) as { toUserId?: number; roomId?: string } | null;
    const toUserId = typeof body?.toUserId === "number" ? body.toUserId : null;
    const roomId = typeof body?.roomId === "string" ? body.roomId : null;
    if (!toUserId || !roomId) return withCors(req, json({ message: "Invalid invite" }, { status: 400 }));

    const inviteId = crypto.randomUUID().slice(0, 8);
    const createdAt = Math.floor(Date.now() / 1000);
    const invite = {
      id: inviteId,
      fromUserId: payload.sub,
      fromUsername: payload.username,
      roomId,
      createdAt,
      status: "pending" as const,
    };

    await env.DB.prepare(
      "INSERT INTO invites (id, to_user_id, from_user_id, from_username, room_id, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(inviteId, toUserId, payload.sub, payload.username, roomId, createdAt, "pending").run();

    const hubId = env.HUB.idFromName("hub");
    const hub = env.HUB.get(hubId);
    await hub.fetch("https://hub/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId, invite }),
    });

    return withCors(req, json(invite, { status: 200 }));
  }

  if (pathname === "/api/inbox" && req.method === "GET") {
    const payload = await requireAuth(req, env);
    if (!payload) return withCors(req, json({ message: "Not logged in" }, { status: 401 }));
    const res = await env.DB.prepare(
      "SELECT id, from_user_id as fromUserId, from_username as fromUsername, room_id as roomId, created_at as createdAt, status FROM invites WHERE to_user_id = ? ORDER BY created_at DESC",
    ).bind(payload.sub).all();
    return withCors(req, json(res.results || [], { status: 200 }));
  }

  const inviteRespondMatch = pathname.match(/^\/api\/invite\/([^/]+)\/respond$/);
  if (inviteRespondMatch && req.method === "POST") {
    const payload = await requireAuth(req, env);
    if (!payload) return withCors(req, json({ message: "Not logged in" }, { status: 401 }));
    const inviteId = inviteRespondMatch[1];
    const body = await req.json().catch(() => null) as { action?: "accept" | "decline" } | null;
    const action = body?.action;
    if (action !== "accept" && action !== "decline") {
      return withCors(req, json({ message: "Invalid action" }, { status: 400 }));
    }

    const row = await env.DB.prepare(
      "SELECT id, room_id as roomId FROM invites WHERE id = ? AND to_user_id = ?",
    ).bind(inviteId, payload.sub).first();
    if (!row) return withCors(req, json({ message: "Invite not found" }, { status: 404 }));

    const status = action === "accept" ? "accepted" : "declined";
    await env.DB.prepare(
      "UPDATE invites SET status = ? WHERE id = ?",
    ).bind(status, inviteId).run();
    await env.DB.prepare(
      "DELETE FROM invites WHERE id = ?",
    ).bind(inviteId).run();

    return withCors(req, json({ status, roomId: row.roomId }, { status: 200 }));
  }

  if (pathname === "/api/user/email" && req.method === "POST") {
    const payload = await requireAuth(req, env);
    if (!payload) return withCors(req, json({ message: "Not logged in" }, { status: 401 }));
    const body = await req.json().catch(() => null) as { email?: string } | null;
    const email = body?.email?.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return withCors(req, json({ message: "Invalid email" }, { status: 400 }));
    await env.DB.prepare("UPDATE users SET email = ? WHERE id = ?").bind(email, payload.sub).run();
    return withCors(req, json({ success: true }, { status: 200 }));
  }

  if (pathname === "/api/user/forgot-password" && req.method === "POST") {
    const body = await req.json().catch(() => null) as { email?: string } | null;
    const email = body?.email?.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return withCors(req, json({ message: "Invalid email" }, { status: 400 }));

    const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (!user) return withCors(req, json({ success: true }, { status: 200 }));

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Math.floor((Date.now() + 15 * 60 * 1000) / 1000);
    const createdAt = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      "INSERT INTO password_resets (user_id, code, expires_at, used, created_at) VALUES (?, ?, ?, 0, ?)",
    ).bind(user.id, code, expiresAt, createdAt).run();

    const serviceId = env.EMAILJS_SERVICE_ID;
    const templateId = env.EMAILJS_TEMPLATE_ID;
    const publicKey = env.EMAILJS_PUBLIC_KEY;
    if (serviceId && templateId && publicKey) {
      await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId,
          template_id: templateId,
          user_id: publicKey,
          template_params: { email, code },
        }),
      }).catch(() => null);
    }

    return withCors(req, json({ success: true }, { status: 200 }));
  }

  if (pathname === "/api/user/reset-password" && req.method === "POST") {
    const body = await req.json().catch(() => null) as { email?: string; code?: string; newPassword?: string } | null;
    const emailOrUsername = body?.email?.trim();
    const code = body?.code?.trim();
    const newPassword = body?.newPassword;
    if (!emailOrUsername || !code || !newPassword || newPassword.length < 4) {
      return withCors(req, json({ message: "Invalid input" }, { status: 400 }));
    }

    const row = await env.DB.prepare(
      "SELECT pr.id as id, pr.user_id as userId, pr.expires_at as expiresAt, pr.used as used FROM password_resets pr INNER JOIN users u ON pr.user_id = u.id WHERE (u.email = ? OR u.username = ?) AND pr.code = ? ORDER BY pr.created_at DESC LIMIT 1",
    ).bind(emailOrUsername, emailOrUsername, code).first();
    if (!row) return withCors(req, json({ message: "Invalid code" }, { status: 400 }));
    if (Number(row.used) === 1) return withCors(req, json({ message: "Code already used" }, { status: 400 }));
    if (Number(row.expiresAt) * 1000 <= Date.now()) return withCors(req, json({ message: "Code expired" }, { status: 400 }));

    const newHash = await hashPassword(newPassword);
    await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(newHash, row.userId).run();
    await env.DB.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").bind(row.id).run();
    return withCors(req, json({ success: true }, { status: 200 }));
  }

  return withCors(req, json({ message: "Not Found" }, { status: 404 }));
}

async function handleWs(req: Request, env: Env, url: URL) {
  const id = url.pathname.split("/").filter(Boolean)[1] || "";
  if (!id) return new Response("Missing room", { status: 400 });
  if (id === "global") {
    const stub = env.HUB.get(env.HUB.idFromName("hub"));
    return stub.fetch(req);
  }
  if (id === "random") {
    const stub = env.MATCH.get(env.MATCH.idFromName("match"));
    return stub.fetch(req);
  }
  const stub = env.ROOM.get(env.ROOM.idFromName(id));
  return stub.fetch(req);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/ws/")) {
        return handleWs(req, env, url);
      }
      if (url.pathname.startsWith("/api/")) {
        return handleApi(req, env, url);
      }
      return withCors(req, json({ message: "Not Found" }, { status: 404 }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal Server Error";
      return withCors(req, json({ message }, { status: 500 }));
    }
  },
};

type HubConnection = { userId: number };

export class Hub {
  private state: DurableObjectState;
  private env: Env;
  private sockets = new Map<WebSocket, HubConnection>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname === "/notify" && req.method === "POST") {
      const body = await req.json().catch(() => null) as { toUserId?: number; invite?: any } | null;
      if (!body || typeof body.toUserId !== "number") return json({ ok: false }, { status: 400 });
      const payload = { type: "new_invite", invite: body.invite };
      this.sockets.forEach((meta, ws) => {
        if (meta.userId !== body.toUserId) return;
        try { ws.send(JSON.stringify(payload)); } catch {}
      });
      return json({ ok: true }, { status: 200 });
    }

    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const token = url.searchParams.get("token");
    const auth = await verifyToken(this.env, token);
    if (!auth) return new Response("Unauthorized", { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    this.sockets.set(server, { userId: auth.sub });
    server.addEventListener("close", () => {
      this.sockets.delete(server);
    });
    server.addEventListener("error", () => {
      this.sockets.delete(server);
    });
    return new Response(null, { status: 101, webSocket: client });
  }
}

type RoomConn = { userId?: number; username?: string; role: "w" | "b" | "s" };

export class Room {
  private state: DurableObjectState;
  private env: Env;
  private fen: string | null = null;
  private started = false;
  private white: WebSocket | null = null;
  private black: WebSocket | null = null;
  private whiteMeta: { id?: number; username?: string } = {};
  private blackMeta: { id?: number; username?: string } = {};
  private sockets = new Map<WebSocket, RoomConn>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<any>("room");
      if (stored) {
        this.fen = stored.fen ?? null;
        this.started = !!stored.started;
        this.whiteMeta = stored.whiteMeta ?? {};
        this.blackMeta = stored.blackMeta ?? {};
      }
    });
  }

  private persist() {
    return this.state.storage.put("room", {
      fen: this.fen,
      started: this.started,
      whiteMeta: this.whiteMeta,
      blackMeta: this.blackMeta,
    });
  }

  private broadcast(payload: any, except?: WebSocket) {
    const msg = JSON.stringify(payload);
    this.sockets.forEach((_meta, ws) => {
      if (except && ws === except) return;
      try { ws.send(msg); } catch {}
    });
  }

  private send(ws: WebSocket, payload: any) {
    try { ws.send(JSON.stringify(payload)); } catch {}
  }

  private updateStats() {
    const count = this.sockets.size;
    this.broadcast({ type: "stats", count });
  }

  private assignRole(ws: WebSocket, userId?: number, username?: string) {
    let role: "w" | "b" | "s" = "s";
    if (!this.white) {
      this.white = ws;
      this.whiteMeta = { id: userId, username };
      role = "w";
    } else if (!this.black) {
      this.black = ws;
      this.blackMeta = { id: userId, username };
      role = "b";
    }
    this.sockets.set(ws, { userId, username, role });
    return role;
  }

  private maybeStart() {
    if (this.started) return;
    if (!this.white || !this.black) return;
    this.started = true;
    if (this.whiteMeta.id && this.whiteMeta.username && this.blackMeta.id && this.blackMeta.username) {
      this.send(this.white, { type: "opponent_info", id: this.blackMeta.id, username: this.blackMeta.username });
      this.send(this.black, { type: "opponent_info", id: this.whiteMeta.id, username: this.whiteMeta.username });
    }
    this.send(this.white, { type: "start_game", color: "w" });
    this.send(this.black, { type: "start_game", color: "b" });
    void this.persist();
  }

  async fetch(req: Request) {
    const url = new URL(req.url);
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const token = url.searchParams.get("token");
    const auth = await verifyToken(this.env, token);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();

    this.assignRole(server, auth?.sub, auth?.username);
    this.updateStats();
    const role = this.sockets.get(server)!.role;
    const waiting = role !== "s" && !(this.white && this.black);
    this.send(server, { type: "role", role, waiting });
    if (this.fen) this.send(server, { type: "state", fen: this.fen });
    if (role === "s") {
      if (this.whiteMeta.id && this.whiteMeta.username) this.send(server, { type: "player_info", color: "w", id: this.whiteMeta.id, username: this.whiteMeta.username });
      if (this.blackMeta.id && this.blackMeta.username) this.send(server, { type: "player_info", color: "b", id: this.blackMeta.id, username: this.blackMeta.username });
    }
    this.maybeStart();

    server.addEventListener("message", (event: MessageEvent) => {
      try {
        const msg = JSON.parse(String(event.data || "{}"));
        if (!msg?.type) return;

        if (msg.type === "move") {
          const from = msg.move?.from;
          const to = msg.move?.to;
          const fen = msg.fen;
          const promotion = msg.promotion || "q";
          if (typeof from !== "string" || typeof to !== "string" || typeof fen !== "string") return;
          this.fen = fen;
          void this.persist();
          this.broadcast({ type: "move", from, to, promotion, fen });
          return;
        }

        if (msg.type === "chat") {
          const text = msg.text;
          const sender = msg.sender;
          if (typeof text !== "string" || typeof sender !== "string") return;
          this.broadcast({ type: "chat", text, sender }, server);
          return;
        }

        if (msg.type === "draw_request") {
          const sender = msg.sender;
          if (typeof sender !== "string") return;
          this.broadcast({ type: "draw_request", sender }, server);
          return;
        }

        if (msg.type === "draw_respond") {
          const accepted = !!msg.accepted;
          this.broadcast({ type: "draw_respond", accepted });
          return;
        }

        if (msg.type === "voice_signal") {
          const signal = msg.signal;
          const senderId = msg.senderId;
          if (!signal) return;
          this.broadcast({ type: "voice_signal", signal, senderId }, server);
          return;
        }

        if (msg.type === "game_over") {
          const result = typeof msg.result === "string" ? msg.result : "Hòa";
          const winnerColor = msg.winnerColor as ("w" | "b" | undefined);
          void this.handleGameOver(result, winnerColor);
          this.broadcast({ type: "game_over", result });
          return;
        }
      } catch {}
    });

    const cleanup = () => {
      const meta = this.sockets.get(server);
      this.sockets.delete(server);
      if (this.white === server) this.white = null;
      if (this.black === server) this.black = null;
      this.updateStats();
      if (meta?.role === "w") this.started = false;
      if (meta?.role === "b") this.started = false;
      void this.persist();
    };
    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);
    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleGameOver(result: string, winnerColor?: "w" | "b") {
    const whiteId = this.whiteMeta.id;
    const blackId = this.blackMeta.id;
    if (!whiteId || !blackId) return;

    const pgn = this.fen || "";
    const createdAt = Math.floor(Date.now() / 1000);
    await this.env.DB.prepare(
      "INSERT INTO games (white_player_id, black_player_id, pgn, result, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(whiteId, blackId, pgn, result, createdAt).run();

    const inc = async (userId: number, field: "wins" | "losses" | "draws", ratingDelta: number) => {
      const row = await this.env.DB.prepare(
        "SELECT rating, games_played, wins, losses, draws FROM users WHERE id = ?",
      ).bind(userId).first();
      if (!row) return;
      const rating = Number(row.rating || 0) + ratingDelta;
      const gamesPlayed = Number(row.games_played || 0) + 1;
      const wins = Number(row.wins || 0) + (field === "wins" ? 1 : 0);
      const losses = Number(row.losses || 0) + (field === "losses" ? 1 : 0);
      const draws = Number(row.draws || 0) + (field === "draws" ? 1 : 0);
      await this.env.DB.prepare(
        "UPDATE users SET rating = ?, games_played = ?, wins = ?, losses = ?, draws = ? WHERE id = ?",
      ).bind(rating, gamesPlayed, wins, losses, draws, userId).run();
    };

    if (winnerColor === "w") {
      await inc(whiteId, "wins", 3);
      await inc(blackId, "losses", 0);
    } else if (winnerColor === "b") {
      await inc(blackId, "wins", 3);
      await inc(whiteId, "losses", 0);
    } else {
      await inc(whiteId, "draws", 0);
      await inc(blackId, "draws", 0);
    }
  }
}

export class Matchmaking {
  private env: Env;
  private queue: WebSocket[] = [];
  private sockets = new Map<WebSocket, { userId: number; username: string }>();

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
  }

  async fetch(req: Request) {
    const url = new URL(req.url);
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }
    const token = url.searchParams.get("token");
    const auth = await verifyToken(this.env, token);
    if (!auth) return new Response("Unauthorized", { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    this.sockets.set(server, { userId: auth.sub, username: auth.username });

    const cleanup = () => {
      this.sockets.delete(server);
      this.queue = this.queue.filter((s) => s !== server);
    };
    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);

    server.addEventListener("message", (event: MessageEvent) => {
      try {
        const msg = JSON.parse(String(event.data || "{}"));
        if (msg.type !== "find_match") return;

        this.queue = this.queue.filter((s) => s !== server);
        const opponent = this.queue.shift();
        if (opponent && this.sockets.has(opponent)) {
          const roomId = Math.random().toString(36).slice(2, 9).toUpperCase();
          try { server.send(JSON.stringify({ type: "match_found", roomId })); } catch {}
          try { opponent.send(JSON.stringify({ type: "match_found", roomId })); } catch {}
        } else {
          this.queue.push(server);
        }
      } catch {}
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}
