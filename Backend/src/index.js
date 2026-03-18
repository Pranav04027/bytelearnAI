//starts the server {app.listen()}, connects DB

import dotenv from "dotenv"
dotenv.config()// Imp to use. Otherwise dotenv will not work.

import {app} from "./app.js"
import connectDB from "./db/index.js"

const PORT = process.env.PORT || 8001

connectDB()
.then(() => {
    app.listen(PORT , () => {
        console.log(`\n⚙️  Server is running at port : ${PORT}`);
        console.log(`🚀 API Healthcheck: http://localhost:${PORT}/api/v1/healthcheck`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
    })
})
.catch((err) => {
    console.error("❌ Postgres connection failed !!! " , err)
    process.exit(1);
})