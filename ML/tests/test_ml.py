"""Run:  python tests/test_ml.py   (no server needed; uses FastAPI's test client)"""
import os, sys
os.environ["ML_API_KEY"] = ""
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.testclient import TestClient
from src.app import app, BIAS
c = TestClient(app)
ok = lambda cond, msg: (print(("PASS " if cond else "FAIL ") + msg), cond)[1]
results = []

# --- update-state: trust, level-test multiplier, student-only update
base = {"ability": 0, "label": "medium", "success": True, "student_attempts": 0, "question_attempts": 0}
full = c.post("/update-state", json=base).json()
half = c.post("/update-state", json={**base, "trust": 0.5}).json()
zero = c.post("/update-state", json={**base, "trust": 0}).json()
lvl = c.post("/update-state", json={**base, "k_multiplier": 4}).json()
only = c.post("/update-state", json={**base, "update_question": False}).json()
results += [ok(0 < half["new_ability"] < full["new_ability"], "lower trust gives a smaller ability step"),
            ok(zero["new_ability"] == 0 and zero["new_difficulty"] == 0, "trust 0 changes nothing"),
            ok(lvl["new_ability"] > 3 * full["new_ability"], f"level test moves ability faster ({full['new_ability']} -> {lvl['new_ability']})"),
            ok(only["new_difficulty"] == 0, "update_question=false leaves the question alone"),
            ok("model_version" in full, "model_version returned")]

# --- next-question: propensity matches a simulation of the real rule
cands = [{"question_id": f"q{i}", "label": l, "question_attempts": a, "topic": t}
         for i, (l, a, t) in enumerate([("easy", 100, "A"), ("medium", 100, "A"), ("hard", 100, "B"), ("medium", 2, "B"), ("easy", 3, "B")])]
body = {"ability": 0.0, "candidates": cands, "target": 0.7, "explore": 0.2}
n, hits = 4000, {}
for s in range(n):
    r = c.post("/next-question", json={**body, "seed": s}).json()
    hits[r["question_id"]] = hits.get(r["question_id"], 0) + 1
first = c.post("/next-question", json={**body, "seed": 1}).json()
emp = hits.get(first["question_id"], 0) / n
results.append(ok(abs(emp - first["propensity"]) < 0.03, f"propensity {first['propensity']} matches simulated {emp:.3f} for {first['question_id']}"))

# --- coverage: with a penalty the level test leaves a topic it already used
cov = {"ability": 0.0, "target": 0.5, "explore": 0.0,
       "candidates": [{"question_id": "a1", "label": "medium", "topic": "A"}, {"question_id": "b1", "label": "medium", "topic": "B"}]}
no_pen = c.post("/next-question", json={**cov, "topic_counts": {"A": 0, "B": 0}}).json()
pen = c.post("/next-question", json={**cov, "topic_counts": {"A": 4}, "coverage_penalty": 0.08}).json()
results.append(ok(pen["question_id"] == "b1", "coverage penalty moves the pick to the topic not yet asked"))

# --- study plan scenarios
T = lambda topic, ab, att, days=0, pre=None, subject="Math", w=1.0: {"subject": subject, "topic": topic, "ability": ab, "attempts": att, "days_since_last": days, "prerequisites": pre or [], "weight": w}
plan = c.post("/study-plan", json={"minutes": 30, "topics": [
    T("Fractions", -1.8, 12), T("Algebra", -1.2, 10, pre=["Fractions"]), T("Geometry", 1.2, 20, 2), T("Decimals", 1.5, 25, 60),
    T("Statistics", 0.0, 1, None, subject="Science")]}).json()
acts = {t["topic"]: t["action"] for t in plan["topics"]}
print("   headline:", plan["headline"])
for p in plan["plan"]:
    print(f"   -> {p['subject']}/{p['topic']}: {p['action']}, {p['questions']} q, {p['minutes']} min, target {p['target_success']}  | {p['reason']}")
results += [ok(acts["Algebra"] == "remediate", "weak Algebra whose prerequisite Fractions is weak -> remediate"),
            ok(plan["plan"][0]["topic"] == "Fractions", "study time goes to Fractions first"),
            ok(acts["Decimals"] == "review", "strong but unpractised for 60 days -> review"),
            ok(acts["Statistics"] == "diagnose", "1 answer only -> diagnose"),
            ok(acts["Geometry"] == "stretch", "strong and recent -> stretch"),
            ok(abs(sum(p["minutes"] for p in plan["plan"]) - 30) < 8, "plan minutes are close to the time available")]
exam = c.post("/study-plan", json={"minutes": 30, "exam_days": 2, "topics": [T("A", -1.0, 10), T("B", 0.3, 10)]}).json()
calm = c.post("/study-plan", json={"minutes": 30, "topics": [T("A", -1.0, 10), T("B", 0.3, 10)]}).json()
share = lambda p: p["plan"][0]["questions"] / sum(x["questions"] for x in p["plan"])
results.append(ok(share(exam) >= share(calm), "exam close -> weakest topic gets at least as large a share"))
allgood = c.post("/study-plan", json={"topics": [T("A", 1.5, 30), T("B", 1.6, 30)]}).json()
results.append(ok(len(allgood["plan"]) >= 1 and allgood["plan"][0]["action"] == "stretch", "all strong -> stretch, never an empty plan"))
print("\nALL PASS" if all(results) else "\nSOME FAILED")
sys.exit(0 if all(results) else 1)