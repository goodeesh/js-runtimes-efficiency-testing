import { DB } from "https://deno.land/x/sqlite@v3.8/mod.ts";
import { crypto } from "https://deno.land/std@0.215.0/crypto/mod.ts";
import { encodeHex } from "https://deno.land/std@0.215.0/encoding/hex.ts";
import { existsSync } from "https://deno.land/std@0.215.0/fs/exists.ts";

export class Database {
  #db: DB;
  
  constructor() {
    const dbFile = 'db.sqlite';
    const dbExists = existsSync(dbFile);
    this.#db = new DB(dbFile);
    
    if (!dbExists) {
      this.initialize().then(() => {
        console.log('Database initialized');
      }).catch((error) => {
        console.error('Error initializing database:', error);
      });
    }
  }

  #exec(sql: string): void {
    this.#db.execute(sql);
  }

  #prepare(sql: string): any {
    return this.#db.prepareQuery(sql);
  }

  #close(): void {
    this.#db.close();
  }

  #all(): any[] {
    const query = this.#prepare(`SELECT * FROM users ORDER BY key`);
    return query.allEntries();
  }

  async #insert(sql: string, ...params: any[]): Promise<void> {
    // hash the password
    if (params[2]) {
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(params[2])
      );
      params[2] = encodeHex(hashBuffer);
    }
    
    // prepare the statement
    const query = this.#prepare(sql);
    query.execute(params);
  }

  async initialize(): Promise<void> {
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

  async getUser(username: string): Promise<any | null> {
    const query = this.#prepare('SELECT * FROM users WHERE username = ?');
    const result = query.firstEntry([username]);
    return result || null;
  }

  async updateUser(username: string, newPassword: string): Promise<void> {
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(newPassword)
    );
    const hash = encodeHex(hashBuffer);
    
    const query = this.#prepare('UPDATE users SET password = ? WHERE username = ?');
    query.execute([hash, username]);
  }

  async deleteUser(username: string): Promise<void> {
    const query = this.#prepare('DELETE FROM users WHERE username = ?');
    query.execute([username]);
  }
}