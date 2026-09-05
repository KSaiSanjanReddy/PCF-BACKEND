import pkg from "pg";
import * as dotenv from "dotenv";
// Load .env here too: `database.ts` builds the pool at import time, which (due
// to ESM import hoisting) can run BEFORE server.ts's dotenv.config(). Calling
// it here guarantees process.env is populated before we read the DB vars.
dotenv.config();
const { Pool } = pkg;

// Create pool connection from env variables. The PASSWORD has no fallback — it
// must come from .env (gitignored) so the secret is never committed to source.
// Every environment (local + server) must define DB_PASSWORD in its .env.
// Host/name/user/port keep non-secret fallbacks purely for resilience.
if (!process.env.DB_PASSWORD) {
  console.error("FATAL: DB_PASSWORD is not set. Add DB_* keys to .env.");
}
const pool = new Pool({
  user: process.env.DB_USER || "envguideuser",
  host: process.env.DB_HOST || "139.162.161.40",
  database: process.env.DB_NAME || "envguide",
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 5432,
  max: 20, // Reduced from 40 to prevent pool exhaustion
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000, // 20 seconds
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// const client = await pool.connect();
// export default client;


pool.on('error', (err) => {
  console.error('Unexpected error on idle client:', err);
  process.exit(-1);
});

export async function withClient(callback: (client: any) => Promise<any>) {
  let client;
  let retries = 3;
  let lastError;
  
  while (retries > 0) {
    try {
      client = await pool.connect();
      return await callback(client);
    } catch (error: any) {
      lastError = error;
      console.error(`Database connection error (${retries} retries left):`, error.message);
      
      // If it's a connection timeout or connection error, retry
      if (error.message.includes('timeout') || error.message.includes('Connection terminated') || error.code === 'ECONNREFUSED') {
        retries--;
        if (retries > 0) {
          console.log(`Retrying database connection in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      } else {
        // For other errors, don't retry
        break;
      }
    } finally {
      if (client) {
        client.release();
        client = null;
      }
    }
  }
  
  console.error('Database connection failed after retries:', lastError?.message);
  throw new Error(`Database error: ${lastError?.message || String(lastError)}`);
}

