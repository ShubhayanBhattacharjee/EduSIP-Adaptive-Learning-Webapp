const Setting = require("../models/Setting");

// Settings a super admin can change without touching .env or restarting the server.
// get() is synchronous and reads memory, so it is cheap to call on every request.
// Value order: saved on screen (database)  >  .env  >  built-in default.
const DEFS = {
  forceAdaptive:             { type: "boolean", env: "FORCE_ADAPTIVE",               def: false, label: "Force adaptive for everyone (no control group)" },
  pilotMode:                 { type: "boolean", env: "PILOT_MODE",                   def: false, label: "Pilot mode (split students into adaptive / control)" },
  requirePlacement:          { type: "boolean", env: "REQUIRE_PLACEMENT",            def: true, label: "Students must finish the placement test first" },
  placementSize:             { type: "number",  env: "PLACEMENT_SIZE",               def: 10,  min: 5,  max: 30,  label: "Placement test length (questions)" },
  placementRetakeDays:       { type: "number",  env: "PLACEMENT_RETAKE_DAYS",        def: 90,  min: 1,  max: 365, label: "Days before a student may retake placement" },
  defaultSecondsPerQuestion: { type: "number",  env: "DEFAULT_SECONDS_PER_QUESTION", def: 120, min: 10, max: 600, label: "Default seconds per question (new students)" },
};

const overrides = new Map();     // key -> value saved in the database

function fromEnv(key) {
  const d = DEFS[key];
  const raw = process.env[d.env];
  if (raw === undefined || raw === "") return d.def;
  if (d.type === "boolean") return raw === "true";
  const n = Number(raw);
  return Number.isFinite(n) ? n : d.def;
}

function get(key) {
  if (!DEFS[key]) throw new Error(`Unknown setting: ${key}`);
  return overrides.has(key) ? overrides.get(key) : fromEnv(key);
}

// Returns the cleaned value, or throws an Error with status 400.
function clean(key, value) {
  const d = DEFS[key];
  if (!d) throw Object.assign(new Error(`Unknown setting: ${key}`), { status: 400 });
  if (d.type === "boolean") {
    if (typeof value !== "boolean") throw Object.assign(new Error(`${key} must be true or false`), { status: 400 });
    return value;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < d.min || n > d.max) {
    throw Object.assign(new Error(`${key} must be a whole number from ${d.min} to ${d.max}`), { status: 400 });
  }
  return n;
}

function getAll() {
  return Object.entries(DEFS).map(([key, d]) => ({
    key, label: d.label, type: d.type, min: d.min, max: d.max,
    value: get(key), envValue: fromEnv(key), source: overrides.has(key) ? "database" : "env",
  }));
}

async function load() {
  const rows = await Setting.find().lean();
  overrides.clear();
  for (const r of rows) {
    if (!DEFS[r.key]) continue;
    try { overrides.set(r.key, clean(r.key, r.value)); } catch { /* a bad saved value is ignored; the .env value applies */ }
  }
}

async function set(key, value, userId) {
  const v = clean(key, value);
  await Setting.updateOne({ key }, { $set: { value: v, updatedBy: userId } }, { upsert: true });
  overrides.set(key, v);
  return v;
}

async function reset(key) {
  if (!DEFS[key]) throw Object.assign(new Error(`Unknown setting: ${key}`), { status: 400 });
  await Setting.deleteOne({ key });
  overrides.delete(key);
}

// Other server instances pick up a change within a minute.
function startRefresh(ms = 60000) {
  return setInterval(() => load().catch((e) => console.error("Settings refresh failed:", e.message)), ms).unref();
}

module.exports = { get, getAll, load, set, reset, clean, startRefresh, DEFS };