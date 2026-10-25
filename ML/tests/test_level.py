"""Level estimation + planner checks. No web framework needed:  python tests/test_level.py"""
import os, sys
sys.path.insert(
    0,
    os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
)

from src import level, planner

B = 0.8613
D = {"easy": -1.0, "medium": 0.0, "hard": 1.0}
LABS = ["easy", "medium", "hard"] * 3 + ["medium"]


def items(rule, topics=5):
    return [{"subject": "Maths" if i % 2 else "CS", "topic": f"T{i % topics}", "difficulty": D[l], "success": rule(l, i)}
            for i, l in enumerate(LABS)]


def test_scale():
    assert level.to_scale(-9) == 1 and level.to_scale(9) == 10
    assert [level.to_scale(D[l]) for l in ("easy", "medium", "hard")] == [3, 5, 7]
    assert level.band(1) == "Beginner" and level.band(5) == "Developing" and level.band(7) == "Proficient" and level.band(10) == "Advanced"


def test_ordering():
    lo = level.estimate(items(lambda l, i: False), B)["overall"]
    mid = level.estimate(items(lambda l, i: l != "hard"), B)["overall"]
    hi = level.estimate(items(lambda l, i: True), B)["overall"]
    assert lo["ability"] < mid["ability"] < hi["ability"]
    assert lo["level"] < mid["level"] < hi["level"]
    assert all(0 < x["se"] < 1.0 for x in (lo, mid, hi))      # ten answers: honest, not tiny, not huge


def test_hard_right_beats_easy_right():
    mk = lambda pairs: level.estimate([{"subject": "S", "topic": "T", "difficulty": D[l], "success": y} for l, y in pairs], B)["overall"]
    hard_right = mk([("hard", True), ("hard", True), ("medium", False)])
    easy_right = mk([("easy", True), ("easy", True), ("medium", False)])
    assert hard_right["ability"] > easy_right["ability"]      # same score, but passing hard questions proves more


def test_shrinkage():
    r = level.estimate(items(lambda l, i: i % 2 == 0), B)
    for t in r["topics"]:
        assert abs(t["ability"] - r["overall"]["ability"]) < 1.5     # a topic with 1-2 answers stays near the overall level
    assert r["total"] == 10 and r["correct"] == 5


def test_planner_uses_placement():
    topics = [{"subject": "Maths", "topic": "Algebra", "ability": -1.2, "attempts": 1, "days_since_last": 0, "placed": True, "prerequisites": []},
              {"subject": "Maths", "topic": "Fractions", "ability": 1.0, "attempts": 1, "days_since_last": 0, "placed": True, "prerequisites": []}]
    plan = planner.make_plan(topics, B, minutes=20, seconds_per_question=60)
    first = plan["plan"][0]
    assert first["topic"] == "Algebra" and first["action"] == "practice_weak", first
    assert first["mode"] == "practice" and first["questions"] >= 3
    unplaced = [dict(t, placed=False) for t in topics]
    assert planner.make_plan(unplaced, B)["plan"][0]["action"] == "diagnose"     # without a placement we still ask for a check


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("ok", name)
