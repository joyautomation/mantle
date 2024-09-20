import { defineConfig } from "drizzle-kit";
import process from "node:process";

const getDbCredentials = () => {
  try {
    return {
      host: Deno?.env?.get("DB_HOST") || "10.3.37.32",
      user: Deno?.env?.get("DB_USER") || "postgres",
      password: Deno?.env?.get("DB_PASSWORD") || "postgres",
      database: Deno?.env?.get("DB_NAME") || "mantle",
    };
  } catch {
    return {
      host: process.env.DB_HOST || "10.3.37.32",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      database: process.env.DB_NAME || "mantle",
    };
  }
};

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: getDbCredentials(),
});
