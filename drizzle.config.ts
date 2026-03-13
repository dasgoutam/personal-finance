import type { Config } from 'drizzle-kit';

export default {
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle/migrations',
	dialect: 'sqlite',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? './data/finance.db'
	}
} satisfies Config;
