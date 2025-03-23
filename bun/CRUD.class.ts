import { Database as BunDatabase } from "bun:sqlite";
import { existsSync } from "fs";

export class Database {
  #db: BunDatabase;
  
  constructor() {
    const dbFile = 'db.sqlite';
    const dbExists = existsSync(dbFile);
    this.#db = new BunDatabase(dbFile);
    
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

  #prepare(sql: string) {
    return this.#db.prepare(sql);
  }

  #close(): void {
    this.#db.close();
  }

  #all() {
    const stmt = this.#prepare(`SELECT * FROM users ORDER BY key`);
    return stmt.all();
  }

  async #insert(sql: string, ...params: any[]): Promise<void> {
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
    
    // Generate UUID
    const key = crypto.randomUUID();
    
    // Hash the password
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(password)
    );
    const hash = Buffer.from(hashBuffer).toString("hex");
    
    await this.#insert('INSERT INTO users (key, username, password, email, name, surname, age) VALUES (?, ?, ?, ?, ?, ?, ?)', 
      key, username, hash, email, name, surname, age);
  }

  getUser(username: string) {
    const stmt = this.#prepare('SELECT * FROM users WHERE username = ?');
    const result = stmt.get(username);
    return result ?? null;
  }

  async updateUser(username: string, newPassword: string): Promise<void> {
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(newPassword)
    );
    const hash = Buffer.from(hashBuffer).toString("hex");
    
    const stmt = this.#prepare('UPDATE users SET password = ? WHERE username = ?');
    stmt.run(hash, username);
  }

  deleteUser(username: string): void {
    const stmt = this.#prepare('DELETE FROM users WHERE username = ?');
    stmt.run(username);
  }
}