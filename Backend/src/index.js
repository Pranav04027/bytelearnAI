//starts the server {app.listen()}, connects DB

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const { startPolling } = await import("./utils/transcriptionPolling.js");

const { app } = await import("./app.js");
const { default: connectDB } = await import("./db/index.js");

const PORT = process.env.PORT || 8000;

connectDB()
.then(() => {
    app.listen(PORT , () => {
        console.log(`\nServer is running at port : ${PORT}`);
        console.log(`API Healthcheck: http://localhost:${PORT}/api/v1/healthcheck`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}\n`);
    })
})
.catch((err) => {
    console.error("❌ Postgres connection failed !!! " , err)
    process.exit(1);
})

startPolling()
