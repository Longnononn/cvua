import { users, games, passwordResets, type User, type InsertUser, type Game, type PasswordReset } from "@shared/schema";
import { db } from "./db";
import { eq, or, and, ilike, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  setUserEmail(userId: number, email: string): Promise<void>;
  createUser(user: InsertUser): Promise<User>;
  createGame(game: Partial<Game>): Promise<Game>;
  getGames(userId: number): Promise<Game[]>;
  getLeaderboard(): Promise<User[]>;
  searchUsers(query: string): Promise<User[]>;
  updateUserRating(userId: number, newRating: number): Promise<void>;
  createPasswordReset(userId: number, code: string, expiresAt: Date): Promise<PasswordReset>;
  getLatestPasswordResetByEmail(email: string, code: string): Promise<PasswordReset | undefined>;
  markPasswordResetUsed(id: number): Promise<void>;
}

class DbStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    return user;
  }

  async setUserEmail(userId: number, email: string): Promise<void> {
    await db
      .update(users)
      .set({ email })
      .where(eq(users.id, userId));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createGame(game: Partial<Game>): Promise<Game> {
    const [created] = await db
      .insert(games)
      .values({
        whitePlayerId: game.whitePlayerId ?? null,
        blackPlayerId: game.blackPlayerId ?? null,
        pgn: game.pgn ?? "",
        result: game.result ?? null,
      })
      .returning();
    return created;
  }

  async updateUserRating(userId: number, newRating: number): Promise<void> {
    const existing = await this.getUser(userId);
    if (!existing) return;

    await db
      .update(users)
      .set({
        rating: newRating,
        gamesPlayed: (existing.gamesPlayed ?? 0) + 1,
      })
      .where(eq(users.id, userId));
  }

  async getGames(userId: number): Promise<Game[]> {
    return db
      .select()
      .from(games)
      .where(
        or(
          eq(games.whitePlayerId, userId),
          eq(games.blackPlayerId, userId),
        ),
      );
  }

  async getLeaderboard(): Promise<User[]> {
    return db
      .select()
      .from(users)
      .orderBy(desc(users.rating))
      .limit(10);
  }

  async searchUsers(query: string): Promise<User[]> {
    if (!query) return [];
    const pattern = `%${query.toLowerCase()}%`;
    return db
      .select()
      .from(users)
      .where(ilike(users.username, pattern))
      .limit(5);
  }

  async createPasswordReset(userId: number, code: string, expiresAt: Date): Promise<PasswordReset> {
    const [row] = await db
      .insert(passwordResets)
      .values({
        userId,
        code,
        expiresAt,
        used: false,
      })
      .returning();
    return row;
  }

  async getLatestPasswordResetByEmail(email: string, code: string): Promise<PasswordReset | undefined> {
    const [row] = await db
      .select({
        id: passwordResets.id,
        userId: passwordResets.userId,
        code: passwordResets.code,
        expiresAt: passwordResets.expiresAt,
        used: passwordResets.used,
        createdAt: passwordResets.createdAt,
      })
      .from(passwordResets)
      .innerJoin(users, eq(passwordResets.userId, users.id))
      .where(
        and(
          or(
            eq(users.email, email),
            eq(users.username, email),
          ),
          eq(passwordResets.code, code),
        ),
      )
      .orderBy(desc(passwordResets.createdAt))
      .limit(1);
    return row;
  }

  async markPasswordResetUsed(id: number): Promise<void> {
    await db
      .update(passwordResets)
      .set({ used: true })
      .where(eq(passwordResets.id, id));
  }
}

export const storage: IStorage = new DbStorage();
