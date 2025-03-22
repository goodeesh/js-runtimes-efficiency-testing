import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import crypto from 'node:crypto';

export class Database {
    #db: any;
    constructor() {
        const dbFile = 'db.sqlite';
        const dbExists = fs.existsSync(dbFile);
        this.#db = new DatabaseSync(dbFile);
        if (!dbExists) {
            this.initialize().then(() => {
                console.log('Database initialized');
            }).catch((error) => {
                console.error('Error initializing database:', error);
            });
        }
    }

    #exec(sql: string): void {
        this.#db.exec(sql);
    }

    #prepare(sql: string): any {
        return this.#db.prepare(sql);
    }

    #close(): void {
        this.#db.close();
    }

    #all(): any[] {
        const stmt = this.#prepare(`SELECT * FROM users ORDER BY key`);
        const result = stmt.all();
        return result;
    }

    async #insert(sql: string, ...params: any[]): Promise<void> {
        // hash the password
        if (params[2]) {
            const hash = crypto.createHash('sha256').update(params[2]).digest('hex');
            params[2] = hash;
        }
        // prepare the statement
        const stmt = this.#prepare(sql);
        stmt.run(...params);
    }

    async initialize(): Promise<void> {
        // Execute SQL statements from strings.
        await this.#exec(`
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
        const key = crypto.randomUUID();
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        await this.#insert('INSERT INTO users (key, username, password, email, name, surname, age) VALUES (?, ?, ?, ?, ?, ?, ?)', key, username, hash, email, name, surname, age);
    }
  
    async getUser(username: string): Promise<any | null> {
        const stmt = this.#prepare('SELECT * FROM users WHERE username = ?');
        const user = stmt.get(username);
        return user || null;
    }

    async updateUser(username: string, newPassword: string): Promise<void> {
        const hash = crypto.createHash('sha256').update(newPassword).digest('hex');
        const stmt = this.#prepare('UPDATE users SET password = ? WHERE username = ?');
        stmt.run(hash, username);
    }

    async deleteUser(username: string): Promise<void> {
        const stmt = this.#prepare('DELETE FROM users WHERE username = ?');
        stmt.run(username);
    }
}