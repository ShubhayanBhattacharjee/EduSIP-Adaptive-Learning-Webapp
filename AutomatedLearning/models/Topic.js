const mongoose = require("mongoose");

// Which topics must be understood before this one. Used by the weak-topic finder.
const topicSchema = new mongoose.Schema({
  subject: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  prerequisites: { type: [String], default: [] },
});

topicSchema.index({ subject: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Topic", topicSchema);