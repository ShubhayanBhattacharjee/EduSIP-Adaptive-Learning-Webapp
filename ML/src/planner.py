"""
Study planner: turns the per-topic abilities the backend stores into
  1. what the student needs NOW (diagnose / remediate / practice / review / stretch)
  2. which topics and subjects to study, and how much (questions and minutes)
  3. a plain-language reason for every decision

Pure Python, no web framework, so it can be unit-tested and reused.

HONEST LIMITS (put these in your report):
  * The Elo part (ability -> chance of success) is validated on Junyi data.
  * The forgetting curve and the "need" formula below are DESIGN CHOICES, not
    trained on data. Every number lives in CONFIG so the pilot study can tune it.
"""
import math

CONFIG = {
    "mastery_target": 0.80,      # chance on a typical question at which a topic counts as "strong"
    "weak_below": 0.60,          # below this chance a topic "needs work"
    "min_attempts": 3,           # fewer answers than this: we do not trust the number yet
    "uncertainty_scale": 8.0,    # uncertainty = 1 / (1 + attempts / scale)
    "uncertainty_weight": 0.25,  # how much "we know little" adds to a topic's need
    "half_life_base_days": 10.0, # forgetting: memory half-life with no practice...
    "half_life_per_attempt": 2.0,#   ...grows by this many days per answer (capped below)
    "half_life_attempt_cap": 30,
    "review_trigger_drop": 0.05, # decay must cut the chance by at least this much to say "review"
    "min_questions_per_topic": 3,
    "max_topics_in_plan": 3,
    "max_diagnose_topics": 1,
    "min_need": 0.03,            # below this a topic gets no study time
    "targets": {                 # wanted chance of success while practising, by situation
        "diagnose": 0.50, "remediate": 0.75, "practice": 0.70, "review": 0.80, "stretch": 0.60,
    },
}


def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-max(min(x, 30.0), -30.0)))


def half_life_days(attempts):
    n = min(attempts, CONFIG["half_life_attempt_cap"])
    return CONFIG["half_life_base_days"] + CONFIG["half_life_per_attempt"] * n


def effective_ability(ability, attempts, days_since_last):
    """Forgetting: unused positive ability fades toward 0 with a half-life that grows with practice."""
    if days_since_last is None or days_since_last <= 0 or ability <= 0:
        return ability
    return ability * (0.5 ** (days_since_last / half_life_days(attempts)))


def analyse_topic(t, bias):
    """t: dict with subject, topic, ability, attempts, days_since_last, weight, prerequisites."""
    attempts = int(t.get("attempts", 0))
    days = t.get("days_since_last")
    raw = sigmoid(bias + t["ability"])
    eff_ab = effective_ability(t["ability"], attempts, days)
    eff = sigmoid(bias + eff_ab)
    uncertainty = 1.0 / (1.0 + attempts / CONFIG["uncertainty_scale"])
    return {
        "subject": t["subject"], "topic": t["topic"], "attempts": attempts,
        "weight": float(t.get("weight", 1.0)), "prerequisites": list(t.get("prerequisites") or []),
        "days_since_last": days, "ability": t["ability"],
        "chance_raw": raw, "chance_now": eff, "uncertainty": uncertainty,
        "trusted": attempts >= CONFIG["min_attempts"] or bool(t.get("placed")),   # a placement-test estimate counts
    }


def classify(a):
    """Which kind of help does this topic need right now?"""
    if not a["trusted"]:
        return "diagnose"
    if a["chance_now"] < CONFIG["weak_below"]:
        return "practice_weak"
    if a["chance_now"] < CONFIG["mastery_target"]:
        return "practice"
    if a["chance_raw"] - a["chance_now"] >= CONFIG["review_trigger_drop"]:
        return "review"          # was strong, has faded
    return "stretch"


def need_of(a, exam_days):
    """Bigger = this topic deserves study time sooner."""
    gap = max(0.0, CONFIG["mastery_target"] - a["chance_now"]) if a["trusted"] else 0.15
    if exam_days is not None and exam_days <= 14:
        gap *= 1.0 + 2.0 * (14 - max(exam_days, 0)) / 14.0     # exam close: weak topics matter more
    return a["weight"] * (gap + CONFIG["uncertainty_weight"] * a["uncertainty"])


def _reason(a, action, back_to=None):
    pct = round(a["chance_now"] * 100)
    if action == "diagnose":
        if a["attempts"] == 0:
            return f"You have not been tested on {a['topic']} yet. A short check will place you."
        return f"Only {a['attempts']} answer(s) so far, so we cannot judge {a['topic']} yet. A short check will place you."
    if action == "remediate":
        return (f"You have about a {pct}% chance on a typical {a['topic']} question, and the earlier topic "
                f"{back_to} it builds on is weak too. Fix {back_to} first.")
    if action == "practice_weak":
        return f"About a {pct}% chance on a typical question: this is your weakest area, so it gets the most time."
    if action == "practice":
        return f"About a {pct}% chance on a typical question: close to strong. Steady practice will finish the job."
    if action == "review":
        drop = round((a["chance_raw"] - a["chance_now"]) * 100)
        return (f"You were strong here, but after {round(a['days_since_last'])} days without practice your "
                f"chance has probably dropped by about {drop} points. A quick review keeps it.")
    return f"About a {pct}% chance: strong. Try harder questions to keep growing."


def make_plan(topics, bias, minutes=30, seconds_per_question=75.0, exam_days=None):
    """
    topics: list of dicts (see analyse_topic). Returns the full decision.
    """
    if not topics:
        return {"headline": "No topics yet. Take the level test first.", "plan": [], "topics": [], "subjects": []}

    analysed = [analyse_topic(t, bias) for t in topics]
    by_key = {(a["subject"], a["topic"]): a for a in analysed}
    for a in analysed:
        a["action"] = classify(a)
        a["need"] = need_of(a, exam_days)
        a["back_to"] = None

    # Weak topic whose prerequisite is also weak: send the study time to the prerequisite.
    for a in analysed:
        if a["action"] != "practice_weak":
            continue
        weak_pre = [by_key[(a["subject"], p)] for p in a["prerequisites"]
                    if (a["subject"], p) in by_key
                    and by_key[(a["subject"], p)]["trusted"]
                    and by_key[(a["subject"], p)]["chance_now"] < CONFIG["weak_below"]]
        if weak_pre:
            pre = min(weak_pre, key=lambda x: x["chance_now"])
            a["action"], a["back_to"] = "remediate", pre["topic"]
            pre["need"] += 0.5 * a["need"]       # the prerequisite inherits half of this topic's urgency
            a["need"] *= 0.5

    # Choose the topics that get time.
    ranked = sorted(analysed, key=lambda a: a["need"], reverse=True)
    chosen, diagnose_slots = [], CONFIG["max_diagnose_topics"]
    for a in ranked:
        if a["need"] < CONFIG["min_need"] or len(chosen) >= CONFIG["max_topics_in_plan"]:
            break
        if a["action"] == "diagnose":
            if diagnose_slots <= 0:
                continue
            diagnose_slots -= 1
        chosen.append(a)
    if not chosen:
        chosen = ranked[:1]                      # everything is fine: still give one stretch topic

    total_q = max(CONFIG["min_questions_per_topic"] * len(chosen),
                  int(round(minutes * 60.0 / max(seconds_per_question, 10.0))))
    total_need = sum(a["need"] for a in chosen) or 1.0
    alloc = {}
    for a in chosen:
        alloc[(a["subject"], a["topic"])] = max(CONFIG["min_questions_per_topic"],
                                                int(round(total_q * a["need"] / total_need)))
    plan = []
    for a in chosen:
        # If remediating, the student practises the prerequisite, not the weak topic itself.
        study_topic = a["back_to"] if a["action"] == "remediate" else a["topic"]
        q = alloc[(a["subject"], a["topic"])]
        plan.append({
            "subject": a["subject"], "topic": study_topic, "for_topic": a["topic"],
            "action": a["action"], "questions": q,
            "minutes": round(q * seconds_per_question / 60.0, 1),
            "target_success": CONFIG["targets"]["remediate" if a["action"] == "practice_weak" else a["action"]],
            "mode": "practice",            # always this topic; the wanted chance of success (target_success) is what makes a check gentler or harder
            "reason": _reason(a, a["action"], a["back_to"]),
        })

    # Two reasons can point at the same study topic (e.g. Fractions itself and Algebra's prerequisite). Merge them.
    merged = {}
    for item in plan:
        key = (item["subject"], item["topic"])
        if key not in merged:
            merged[key] = item
            continue
        keep = merged[key]
        keep["questions"] += item["questions"]
        keep["minutes"] = round(keep["minutes"] + item["minutes"], 1)
        if item["for_topic"] != keep["for_topic"]:
            keep["reason"] += f" It is also holding back {item['for_topic']}."
    plan = sorted(merged.values(), key=lambda x: x["questions"], reverse=True)

    topics_out = [{
        "subject": a["subject"], "topic": a["topic"], "action": a["action"],
        "chance_now": round(a["chance_now"], 3), "chance_without_forgetting": round(a["chance_raw"], 3),
        "attempts": a["attempts"], "confidence": round(1.0 - a["uncertainty"], 2),
        "need": round(a["need"], 3), "back_to": a["back_to"],
    } for a in ranked]

    subjects = {}
    for a in analysed:
        s = subjects.setdefault(a["subject"], {"subject": a["subject"], "w": 0.0, "p": 0.0, "need": 0.0, "n": 0})
        if a["trusted"]:
            s["w"] += a["weight"]
            s["p"] += a["weight"] * a["chance_now"]
        s["need"] += max(a["need"], 0.0)
        s["n"] += 1
    subj_q = {}
    for item in plan:
        subj_q[item["subject"]] = subj_q.get(item["subject"], 0) + item["questions"]
    subjects_out = sorted(({
        "subject": s["subject"],
        "overall_chance": round(s["p"] / s["w"], 3) if s["w"] else None,
        "need": round(s["need"], 3),
        "questions_in_plan": subj_q.get(s["subject"], 0),
    } for s in subjects.values()), key=lambda x: x["need"], reverse=True)

    first = plan[0]
    if first["action"] == "remediate":
        headline = f"Start with {first['topic']}: it is holding back {first['for_topic']}."
    elif first["action"] == "diagnose":
        headline = f"Start with a short check on {first['topic']} so we can place you."
    elif first["action"] == "review":
        headline = f"Start with a quick review of {first['topic']} before it fades further."
    elif first["action"] == "stretch":
        headline = f"You are doing well. Try harder questions in {first['topic']}."
    else:
        headline = f"Focus on {first['topic']} in {first['subject']}."
    return {"headline": headline, "minutes": minutes, "plan": plan, "topics": topics_out, "subjects": subjects_out}