import mongoose from "mongoose";

const uri = "mongodb+srv://pranav:pranav1727@cluster0.squpe65.mongodb.net/";

mongoose
  .connect(uri)
  .then(() => {
    console.log("Connected successfully using direct string");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Connection error:", err);
    process.exit(1);
  });
