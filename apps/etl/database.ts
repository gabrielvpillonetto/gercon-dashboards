import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

export type Database = NodePgDatabase<typeof schema> & { $client: pg.Pool }

export function createDatabase(connectionString: string): Database {
  return drizzle({ client: new pg.Pool({ connectionString, max: 2 }), schema })
}
