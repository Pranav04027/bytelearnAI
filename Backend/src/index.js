import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { startPolling } = await import("./utils/transcriptionPolling.js");

const { app } = await import("./app.js");
const { default: connectDB } = await import("./db/index.js");
const { conversationalRagRuntime } = await import("./graphs/conversationalRagRuntime.js");

const PORT = process.env.PORT || 8000;
let server;
let shutdownPromise;

// Signal handlers live only in the executable entrypoint, never library imports.
function shutdown(exitCode = 0) {
  shutdownPromise ??= (async () => {
    // Bound shutdown if an HTTP client or provider never finishes. A forced exit
    // is a cleanup failure, not a claim that every resource closed successfully.
    const deadline = setTimeout(() => {
      console.error("Backend shutdown timed out");
      process.exit(1);
    }, 15_000);
    try {
      try {
        if (server) await new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
      } finally {
        await conversationalRagRuntime.close();
      }
    } catch {
      console.error("Backend persistence shutdown failed");
      exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
    // Existing transcription polling and Prisma resources belong to their own
    // subsystems; do not end their pools through the checkpointer lifecycle.
    process.exit(exitCode);
  })();
  return shutdownPromise;
}

process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });

try {
  // connectDB currently exits on failure; construct no checkpoint pool before it.
  await connectDB();
  if (!shutdownPromise) {
    await conversationalRagRuntime.initialize();
    if (!shutdownPromise) {
      server = app.listen(PORT, () => {
        console.log(`\nServer is running at port : ${PORT}`);
        console.log(`API Healthcheck: http://localhost:${PORT}/api/v1/healthcheck`);
        console.log(`Environment: ${process.env.NODE_ENV || "development"}\n`);
      });
      server.on("error", () => {
        console.error("Backend HTTP startup failed");
        void shutdown(1);
      });
      startPolling();
    }
  }
} catch {
  console.error("Backend startup failed; verify DATABASE_URL, LANGGRAPH_DATABASE_URL and langgraph:setup");
  await shutdown(1);
}
