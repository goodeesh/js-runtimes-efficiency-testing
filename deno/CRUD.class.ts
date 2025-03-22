import { Database as SQLite3Database, Statement } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { encodeHex } from "https://deno.land/std@0.215.0/encoding/hex.ts";
import { existsSync } from "https://deno.land/std@0.215.0/fs/exists.ts";

export class Database {
  #db: SQLite3Database;
  
  constructor() {
    const dbFile = 'db.sqlite';
    const dbExists = existsSync(dbFile);
    this.#db = new SQLite3Database(dbFile);
    
    if (!dbExists) {
      try {
        this.initialize();
        console.log('Database initialized');
      } catch (error) {
        console.error('Error initializing database:', error);
      }
    }
  }

  #exec(sql: string): void {
    this.#db.exec(sql);
  }

  #prepare(sql: string): Statement {
    return this.#db.prepare(sql);
  }

  #close(): void {
    this.#db.close();
  }

  #all(): Statement[] {
    const stmt = this.#prepare(`SELECT * FROM users ORDER BY key`);
    return stmt.all();
  }

  async #insert(sql: string, ...params: Statement[]): Promise<void> {
    // hash the password
    if (params[2]) {
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(params[2])
      );
      params[2] = encodeHex(hashBuffer);
    }
    
    // prepare the statement
    const stmt = this.#prepare(sql);
    stmt.run(...params);
  }

  initialize(): void {
    console.log('Executing SQL statements...');
    // Execute SQL statements from strings.
    this.#exec(`
      CREATE TABLE users(
        key TEXT PRIMARY KEY,
        username TEXT UNIQUE,
        password TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        email TEXT UNIQUE,
        name TEXT,
        surname TEXT,
        age INTEGER
      ) STRICT
    `);
  }
  
  async insertUser(
    username: string, 
    password: string, 
    email: string, 
    name: string, 
    surname: string, 
    age: number
  ): Promise<void> {
    // Validate input
    if (!username || !password || !email || !name || !surname || !age) {
      throw new Error('Invalid input');
    }
    
    // Generate UUID using Deno's crypto API
    const key = crypto.randomUUID();
    
    // Hash the password
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(password)
    );
    const hash = encodeHex(hashBuffer);
    
    await this.#insert('INSERT INTO users (key, username, password, email, name, surname, age) VALUES (?, ?, ?, ?, ?, ?, ?)', 
      key, username, hash, email, name, surname, age);
  }

  getUser(username: string): Statement | null {
    const stmt = this.#prepare('SELECT * FROM users WHERE username = ?');
    const result = stmt.get(username);
    return result || null;
  }

  async updateUser(username: string, newPassword: string): Promise<void> {
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(newPassword)
    );
    const hash = encodeHex(hashBuffer);
    
    const stmt = this.#prepare('UPDATE users SET password = ? WHERE username = ?');
    stmt.run(hash, username);
  }

  deleteUser(username: string): void {
    const stmt = this.#prepare('DELETE FROM users WHERE username = ?');
    stmt.run(username);
  }
}