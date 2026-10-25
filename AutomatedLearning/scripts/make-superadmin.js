// Run once to create the first super admin:  node scripts/make-superadmin.js you@example.com
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

(async () => {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.log("Usage: node scripts/make-superadmin.js you@example.com");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOneAndUpdate({ email }, { role: "superadmin" }, { new: true }).select("email role");
  console.log(user ? `OK: ${user.email} is now ${user.role}` : "No user with that email");
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });