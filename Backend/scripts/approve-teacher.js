// Approve (or revoke) a teacher who signed up on their own.
//   node scripts/approve-teacher.js teacher@example.com
//   node scripts/approve-teacher.js teacher@example.com revoke
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

(async () => {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const revoke = (process.argv[3] || "").toLowerCase() === "revoke";
  if (!email) { console.log("Usage: node scripts/approve-teacher.js teacher@example.com [revoke]"); process.exit(1); }
  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOneAndUpdate({ email, role: "teacher" }, { teacherApproved: !revoke }, { new: true }).select("email teacherApproved");
  console.log(user ? `OK: ${user.email} teacherApproved=${user.teacherApproved}` : "No teacher with that email");
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
