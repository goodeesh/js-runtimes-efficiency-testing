import { Client } from "pg";
import { existsSync } from "fs";

export class Database {
  #db: Client;

  constructor() {
    this.#db = new Client({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://user:password@postgres:5432/mydb",
    });

    // Initialize database in constructor
    this.initialize().catch((err) => {
      console.error("Failed to initialize database:", err);
    });
  }

  async #exec(sql: string): Promise<void> {
    await this.#db.query(sql);
  }

  async #close(): Promise<void> {
    await this.#db.end();
  }

  async #all(): Promise<any[]> {
    const res = await this.#db.query("SELECT * FROM users ORDER BY key");
    return res.rows;
  }

  async #insert(sql: string, ...params: any[]): Promise<void> {
    await this.#db.query(sql, params);
  }

  async initialize(): Promise<void> {
    console.log("Initializing database...");
    try {
      await this.#db.connect();
      await this.#exec(`
        CREATE TABLE IF NOT EXISTS users(
          key TEXT PRIMARY KEY,
          username TEXT UNIQUE,
          password TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
          email TEXT UNIQUE,
          name TEXT,
          surname TEXT,
          age INTEGER
        )
      `);
      console.log("Database initialized successfully");
    } catch (error) {
      console.error("Error initializing database:", error);
      throw error;
    }
  }

  async createUser(
    username: string,
    password: string,
    email: string,
    name: string,
    surname: string,
    age: number
  ): Promise<void> {
    // Validate input
    if (!username || !password || !email || !name || !surname || !age) {
      throw new Error("Invalid input");
    }

    // Generate UUID
    const key = crypto.randomUUID();

    // Hash the password
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(password)
    );
    const hash = Buffer.from(hashBuffer).toString("hex");

    await this.#insert(
      "INSERT INTO users (key, username, password, email, name, surname, age) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      key,
      username,
      hash,
      email,
      name,
      surname,
      age
    );
  }

  async getUser(username: string): Promise<any | null> {
    const res = await this.#db.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    return res.rows[0] || null;
  }

  async updateUser(username: string, newPassword: string): Promise<void> {
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(newPassword)
    );
    const hash = Buffer.from(hashBuffer).toString("hex");

    await this.#db.query(
      "UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2",
      [hash, username]
    );
  }

  async deleteUser(username: string): Promise<void> {
    await this.#db.query("DELETE FROM users WHERE username = $1", [username]);
  }
}
