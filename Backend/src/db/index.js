import prismaPkg from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;
const { PrismaClient } = prismaPkg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to Backend/.env before starting the backend."
  );
}

let cleanConnectionString = connectionString;
try {
  const url = new URL(connectionString);
  if (url.searchParams.has("pgbouncer")) {
    url.searchParams.delete("pgbouncer");
    cleanConnectionString = url.toString();
  }
} catch (e) {
  // ignore
}

const pool = new Pool({
  connectionString: cleanConnectionString,
  family: 4,
});
pool.on("error", (err) => {
  if (err.message?.includes("ENETUNREACH")) {
    console.error(
      "ENETUNREACH detected — the database host resolves to an unreachable IPv6 address.",
    );
    console.error(
      "Try setting DATABASE_URL to use an IPv4 address directly, or ensure your environment has IPv6 connectivity.",
    );
    process.exit(1);
  }
});
const adapter = new PrismaPg(pool);

// Global PrismaClient instance
export const prisma = new PrismaClient({ adapter });

const connectDB = async () => {
  try {
    console.log("Connecting to PostgreSQL...");
    await prisma.$connect();
    console.log("PostgreSQL connected via Prisma!");
  } catch (error) {
    console.error("PostgreSQL connection error:", error.message);
    console.error(
      "Verify that DATABASE_URL points to a reachable Postgres instance and that the Supabase connection string is correct."
    );

    process.exit(1);
  }
};

export default connectDB;
