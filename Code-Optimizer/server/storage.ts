import { db } from "./db";
import { users, games, type User, type InsertUser, type Game } from "@shared/schema";
import { eq, or } from "drizzle-orm";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createGame(game: Partial<Game>): Promise<Game>;
  getGames(userId: number): Promise<Game[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async createGame(game: Partial<Game>): Promise<Game> {
    const [newGame] = await db.insert(games).values(game).returning();
    return newGame;
  }

  async getGames(userId: number): Promise<Game[]> {
    return await db.select().from(games)
      .where(or(eq(games.whitePlayerId, userId), eq(games.blackPlayerId, userId)));
  }
}

export const storage = new DatabaseStorage();
