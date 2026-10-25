// Creates (or upgrades) an admin / super admin that signs in through POST /auth/staff/login.
//   node scripts/create-staff.js you@example.com "Your Name" superadmin
//   node scripts/create-staff.js ops@example.com "Ops Person" admin
// The password is asked on the screen (not shown). For automation set STAFF_PASSWORD instead.
// If the email already exists, its role and password are replaced and every login it had is cancelled.
require("dotenv").config();
const readline = require("readline");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { uniqueUsername } = require("../utils/username");

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };   // do not echo what is typed
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

(async () => {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const fullname = (process.argv[3] || "").trim();
  const role = (process.argv[4] || "admin").trim().toLowerCase();
  if (!email || !fullname || !["admin", "superadmin"].includes(role)) {
    console.log('Usage: node scripts/create-staff.js email@example.com "Full Name" admin|superadmin');
    process.exit(1);
  }
  const password = process.env.STAFF_PASSWORD || (await askHidden("Password (min 12 characters): "));
  if (password.length < 12) { console.log("The password must have at least 12 characters."); process.exit(1); }

  await mongoose.connect(process.env.MONGO_URI);
  const hash = await bcrypt.hash(password, 10);
  let user = await User.findOne({ email });
  if (user) {
    user.role = role; user.password = hash; user.emailVerified = true; user.disabled = false;
    user.tokensValidAfter = new Date();                          // every older login stops working
    await user.save();
    console.log(`OK: ${email} is now ${role} (existing account updated)`);
  } else {
    user = await User.create({ fullname, email, role, password: hash, emailVerified: true, username: await uniqueUsername(email) });
    console.log(`OK: ${email} created as ${role}`);
  }
  console.log("Sign in with POST /auth/staff/login");
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
