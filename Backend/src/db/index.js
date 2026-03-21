import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pkg from "pg";
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to Backend/.env before starting the backend."
  );
}

const pool = new Pool({
  connectionString,
  family: 4,
});
const adapter = new PrismaPg(pool);

// Global PrismaClient instance
export const prisma = new PrismaClient({ adapter });

const connectDB = async () => {
  try {
    console.log("🔄 Connecting to PostgreSQL...");
    await prisma.$connect();
    console.log("✅ PostgreSQL connected via Prisma!");
  } catch (error) {
    console.error("❌ PostgreSQL connection error:", error.message);
    console.error(
      "Verify that DATABASE_URL points to a reachable Postgres instance and that the Supabase connection string is correct."
    );

    process.exit(1);
  }
};

export default connectDB;
