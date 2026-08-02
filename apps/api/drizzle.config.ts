import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/persistence/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.PM_DATABASE_URL ?? './data/workspace.sqlite'
  }
});
