import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createPostgresCheckpointer } from "../src/graphs/postgresCheckpointer.js";

// Shared configuration and official setup, with no imports of app/Prisma/models.
export async function setupLangGraph({ createCheckpointer = createPostgresCheckpointer } = {}) {
  let persistence;
  let failure;
  try {
    persistence = createCheckpointer();
    await persistence.setup();
  } catch (error) {
    failure = !persistence && error.message?.startsWith("LANGGRAPH_DATABASE_URL")
      ? error : new Error("LangGraph PostgreSQL setup failed");
  } finally {
    try {
      await persistence?.close();
    } catch {
      failure = new Error(failure
        ? "LangGraph PostgreSQL setup and cleanup failed"
        : "LangGraph PostgreSQL cleanup failed");
    }
  }
  if (failure) throw failure;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
  try {
    await setupLangGraph();
    console.log("LangGraph PostgreSQL setup complete");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
