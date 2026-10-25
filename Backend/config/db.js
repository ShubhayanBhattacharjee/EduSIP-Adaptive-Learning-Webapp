const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Connected Successfully ✅");
    mongoose.connection.on("error", (err) => {
      console.error("MongoDB Error ❌:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB Disconnected ⚠");
    });
  } catch (error) {
    console.error("MongoDB Connection Failed ❌:", error.message);
    process.exit(1); // stop the server if DB fails
  }
};

module.exports = connectDB;
