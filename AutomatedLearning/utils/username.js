const crypto = require("crypto");
const User = require("../models/User");

// A username that is not taken yet, built from the email address: john, john4821, ...
async function uniqueUsername(email) {
  const base = String(email).split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "").slice(0, 20) || "user";
  let name = base;
  for (let i = 0; i < 10 && (await User.exists({ username: name })); i++) {
    name = `${base}${crypto.randomInt(100, 10000)}`;
  }
  return name;
}

module.exports = { uniqueUsername };