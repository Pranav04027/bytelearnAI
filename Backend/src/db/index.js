import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pkg from 'pg';
const { Pool } = pkg;
import { DB_NAME } from "../constants.js";

const connectionString = `${process.env.DATABASE_URL}`;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// Global PrismaClient instance
export const prisma = new PrismaClient({ adapter });

const connectDB = async () => {
  try {
    console.log("🔄 Connecting to PostgreSQL...");
    await prisma.$connect();

    console.log(
      `✅ PostgreSQL connected via Prisma!`
    );
  } catch (error) {
    console.error("❌ PostgreSQL connection error:", error);
    process.exit(1);
  }
};

export default connectDB;