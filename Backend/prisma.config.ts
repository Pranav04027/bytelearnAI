import "dotenv/config";
import { defineConfig } from "prisma/config";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to Backend/.env before running Prisma commands."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: connectionString,
  },
});
