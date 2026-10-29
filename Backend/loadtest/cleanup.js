require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const User = require("../models/User");
const Response = require("../models/Response");
const Exposure = require("../models/Exposure");
const SkillState = require("../models/SkillState");
const QuizAttempt = require("../models/QuizAttempt");
const Performance = require("../models/Performance");
const AntiCheatEvent = require("../models/AntiCheatEvent");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.collection.find({ email: /@loadtest\.local$/ }, { projection: { _id: 1 } }).toArray();
  const ids = users.map((u) => u._id);
  for (const M of [Response, Exposure, SkillState, QuizAttempt, Performance, AntiCheatEvent]) {
    const r = await M.deleteMany({ user: { $in: ids } });
    console.log(M.modelName, "deleted", r.deletedCount);
  }
  const r = await User.collection.deleteMany({ _id: { $in: ids } });
  console.log("Users deleted", r.deletedCount);
  await mongoose.disconnect();
})();