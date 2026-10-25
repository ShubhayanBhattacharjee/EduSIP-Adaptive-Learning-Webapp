"""
Level estimation and the 1-10 scale. Pure Python (no web framework), so it is easy to test.

  * to_scale(x)      maps an Elo number (ability OR question difficulty) to 1..10
  * estimate(items)  turns a set of answered questions into an ability, with an honest uncertainty

The same scale is used for students and questions, so "your level is 6" and "this question
is level 6" mean the same thing (a level-6 question is a fair match for a level-6 student).

HONEST LIMIT: the scale (5 + 2x, cut at 1 and 10) is a design choice to make numbers readable.
The ability itself comes from the Elo model, which is the part validated on data.
"""
import math

SCALE_CENTER = 5.0       # ability 0 (an average student) -> level 5
SCALE_SLOPE = 2.0        # one Elo unit = 2 levels. easy(-1) -> 3, medium(0) -> 5, hard(+1) -> 7

BANDS = [(3, "Beginner"), (5, "Developing"), (7, "Proficient"), (10, "Advanced")]


def to_scale(x):
    """Elo number -> whole level from 1 to 10."""
    v = math.floor(SCALE_CENTER + SCALE_SLOPE * float(x) + 0.5)
    return int(min(10, max(1, v)))


def band(level):
    for top, name in BANDS:
        if level <= top:
            return name
    return BANDS[-1][1]


def _sigmoid(x):
    return 1.0 / (1.0 + math.exp(-max(min(x, 30.0), -30.0)))


def map_ability(items, bias, prior_mean=0.0, prior_sd=1.0):
    """
    Maximum-a-posteriori ability from answers (Newton's method on the Elo/IRT likelihood,
    with a Normal prior so that a few answers cannot give an extreme value).
    items: list of (difficulty, success). Returns (ability, standard_error).
    """
    a = prior_mean
    inv_var = 1.0 / (prior_sd ** 2)
    info = inv_var
    for _ in range(30):
        g = -(a - prior_mean) * inv_var
        h = -inv_var
        for d, y in items:
            p = _sigmoid(bias + a - d)
            g += (1.0 if y else 0.0) - p
            h -= p * (1.0 - p)
        step = g / h
        a = min(4.0, max(-4.0, a - step))
        info = -h
        if abs(step) < 1e-6:
            break
    return a, 1.0 / math.sqrt(max(info, 1e-9))


def confidence(se):
    return "high" if se < 0.5 else "medium" if se < 0.8 else "low"


def _pack(ability, se):
    lv = to_scale(ability)
    return {"ability": round(ability, 3), "se": round(se, 3), "level": lv, "band": band(lv),
            "confidence": confidence(se)}


def estimate(items, bias, subject_sd=0.7, topic_sd=0.5):
    """
    items: list of dicts {subject, topic, difficulty, success}.
    Overall level from every answer; each subject is estimated around the overall level and each
    topic around its subject (with only 1-2 answers per topic the estimate stays close to its parent,
    which is honest: ten questions cannot tell topics apart very precisely).
    """
    if not items:
        raise ValueError("no answers")
    all_pairs = [(i["difficulty"], i["success"]) for i in items]
    overall, se = map_ability(all_pairs, bias, 0.0, 1.0)
    out = {"overall": _pack(overall, se), "subjects": [], "topics": [],
           "correct": sum(1 for i in items if i["success"]), "total": len(items)}

    by_subject = {}
    for i in items:
        by_subject.setdefault(i["subject"], []).append(i)
    for s_name in sorted(by_subject):
        rows = by_subject[s_name]
        s_ab, s_se = map_ability([(r["difficulty"], r["success"]) for r in rows], bias, overall, subject_sd)
        out["subjects"].append({"subject": s_name, "answered": len(rows), **_pack(s_ab, s_se)})
        by_topic = {}
        for r in rows:
            by_topic.setdefault(r["topic"], []).append(r)
        for t_name in sorted(by_topic):
            t_rows = by_topic[t_name]
            t_ab, t_se = map_ability([(r["difficulty"], r["success"]) for r in t_rows], bias, s_ab, topic_sd)
            out["topics"].append({"subject": s_name, "topic": t_name, "answered": len(t_rows), **_pack(t_ab, t_se)})
    return out
