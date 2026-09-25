import { Pool, type PoolConfig } from "pg";
import type { Db, Sql } from "./ports";

/** Db na node-postgres. Działa z pulą transakcyjną Supabase (Supavisor, port 6543). */
export function createPgDb(config: PoolConfig): Db & { end(): Promise<void> } {
  const pool = new Pool(config);
  return {
    async transaction(fn) {
      const client = await pool.connect();
      const sql: Sql = async (text, params) => (await client.query(text, params)).rows;
      try {
        await client.query("begin");
        const result = await fn(sql);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}
