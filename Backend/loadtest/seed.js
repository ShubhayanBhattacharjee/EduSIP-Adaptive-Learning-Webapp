require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const COUNT = Number(process.argv[2] || 300);

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const tokens = [];
  for (let i = 0; i < COUNT; i++) {
    const email = `lt_student_${i}@loadtest.local`;
    // upsert straight into the collection: skips hooks, no bcrypt cost
    await User.collection.updateOne(
      { email },
      {
        $setOnInsert: {
          fullname: `LT Student ${i}`,
          username: `lt_student_${i}`,
          email,
          password: "x".repeat(60),
          role: "student",
          emailVerified: true,
          disabled: false,
          skills: [],
          bio: "",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        $set: {
          placement: { done: true, completedAt: new Date(), level: 5, band: "Developing", confidence: "medium", correct: 6, total: 10, ability: 0, se: 0.5, subjects: [] },
        },
      },
      { upsert: true }
    );
    const u = await User.collection.findOne({ email }, { projection: { _id: 1 } });
    tokens.push(jwt.sign({ id: u._id.toString(), scope: "public" }, process.env.JWT_SECRET, { expiresIn: "1d" }));
  }
  fs.writeFileSync(path.join(__dirname, "tokens.json"), JSON.stringify(tokens));
  console.log(`Created ${COUNT} users, wrote tokens.json`);
  await mongoose.disconnect();
})();