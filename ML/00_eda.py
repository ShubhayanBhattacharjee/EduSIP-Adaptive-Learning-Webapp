"""
00_eda.py: exploratory data analysis for the report.

Run from the ML folder:   python 00_eda.py
Needs:                    data/processed/attempts.parquet   (made by 02_prepare_data.py)
Writes:                   figures/*.png   and   metrics/eda.json

Every number quoted in the report should come from metrics/eda.json or the printed audit,
not from memory.
"""
import json
import os

import matplotlib
matplotlib.use("Agg")                       # draw to files, no window needed
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data", "processed", "attempts.parquet")
FIG = os.path.join(BASE, "figures")
MET = os.path.join(BASE, "metrics")
os.makedirs(FIG, exist_ok=True)
os.makedirs(MET, exist_ok=True)
plt.rcParams.update({"figure.dpi": 130, "axes.spines.top": False, "axes.spines.right": False, "font.size": 10})
BLUE, ORANGE, GREY = "#2b6cb0", "#dd6b20", "#718096"


def save(name):
    plt.tight_layout()
    plt.savefig(os.path.join(FIG, name))
    plt.close()
    print("  saved figures/" + name)


def read_json(name):
    p = os.path.join(MET, name)
    return json.load(open(p)) if os.path.exists(p) else None


df = pd.read_parquet(DATA)
out = {}

# =====================================================================
# A. DATA QUALITY AUDIT (the "cleaning" evidence)
# =====================================================================
print("=" * 60)
print("A. DATA QUALITY AUDIT")
print("=" * 60)
per_student = df.groupby("student").size()
first_try_clean = (df["total_attempt_cnt"] == 1) & (df["is_hint_used"] == 0)
label_violations = int(((df["is_correct"] == 1) & ~first_try_clean).sum())   # correct but NOT first-try-no-hint
ties = float((df.groupby("student")["timestamp"].diff() == pd.Timedelta(0)).mean())

audit = {
    "rows": len(df),
    "students": int(df["student"].nunique()),
    "exercises": int(df["exercise"].nunique()),
    "problems": int(df["problem"].nunique()),
    "date_from": str(df["timestamp"].min()),
    "date_to": str(df["timestamp"].max()),
    "missing_values_total": int(df.isna().sum().sum()),
    "duplicate_rows": int(df.duplicated().sum()),
    "overall_correct_rate": round(float(df["is_correct"].mean()), 4),
    "attempts_per_student_median": float(per_student.median()),
    "attempts_per_student_mean": round(float(per_student.mean()), 1),
    "attempts_per_student_max": int(per_student.max()),
    "students_with_20plus_attempts": int((per_student >= 20).sum()),
    "students_with_under_10_attempts": int((per_student < 10).sum()),
    "time_taken_zero_seconds": int((df["total_sec_taken"] == 0).sum()),
    "time_taken_at_cap_1800s": int((df["total_sec_taken"] >= 1800).sum()),
    "attempt_count_zero_rows": int((df["total_attempt_cnt"] == 0).sum()),
    "attempt_count_over_20_rows": int((df["total_attempt_cnt"] > 20).sum()),
    "label_rule_violations": label_violations,
    "share_same_timestamp_as_previous": round(ties, 3),
}
out["audit"] = audit
for k, v in audit.items():
    print(f"  {k:38s} {v}")
print("\n  Reading the audit:")
print("   * missing values / duplicates: should be 0 (nothing to impute or drop)")
print("   * label_rule_violations: 0 means is_correct = 'first try AND no hint' holds on every row")
print("   * time_taken at 1800 s is a cap in the source data; time of the CURRENT attempt is never a model input")
print("   * ties near 88% is why history uses only strictly earlier time slots (no leakage)")

# =====================================================================
# B. FIGURES
# =====================================================================
print("\n" + "=" * 60)
print("B. FIGURES")
print("=" * 60)

# 1. attempts per student: heavy users dominate, many students are short-history (cold start)
fig, ax = plt.subplots(figsize=(6.5, 3.8))
ax.hist(per_student, bins=np.logspace(0, np.log10(per_student.max() + 1), 45), color=BLUE)
ax.set_xscale("log")
ax.axvline(per_student.median(), color=ORANGE, ls="--", label=f"median = {per_student.median():.0f}")
ax.axvline(per_student.mean(), color=GREY, ls=":", label=f"mean = {per_student.mean():.0f}")
ax.set_xlabel("attempts per student (log scale)")
ax.set_ylabel("students")
ax.set_title("A few heavy users, many light users")
ax.legend(frameon=False)
save("01_attempts_per_student.png")
heavy_share = float(per_student.sort_values(ascending=False).head(int(len(per_student) * 0.1)).sum() / per_student.sum())
out["top10pct_students_share_of_rows"] = round(heavy_share, 3)
print(f"  top 10% of students produce {heavy_share:.0%} of all rows")

# 2. what the label means: correct rate by (first try?, hint used?)
grp = df.assign(first_try=(df["total_attempt_cnt"] == 1), hint=(df["is_hint_used"] == 1)) \
        .groupby(["first_try", "hint"])["is_correct"].agg(["mean", "size"]).reset_index()
labels = [("first try" if r.first_try else "2+ tries") + (", hint" if r.hint else ", no hint") for r in grp.itertuples()]
fig, ax = plt.subplots(figsize=(6.5, 3.8))
bars = ax.bar(labels, grp["mean"], color=[BLUE if m > 0.5 else ORANGE for m in grp["mean"]])
for b, n in zip(bars, grp["size"]):
    ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 0.02, f"n={n:,}", ha="center", fontsize=8)
ax.set_ylim(0, 1.15)
ax.set_ylabel("share labelled correct")
ax.set_title("Label check: 'correct' = first try AND no hint")
plt.setp(ax.get_xticklabels(), rotation=15, ha="right")
save("02_label_definition.png")
out["label_check"] = [{"group": l, "correct_rate": round(float(m), 4), "n": int(n)} for l, m, n in zip(labels, grp["mean"], grp["size"])]

# 3. exercise difficulty spread: why per-question difficulty must be learned
ex = df.groupby("exercise")["is_correct"].agg(["mean", "size"])
ex = ex[ex["size"] >= 100]
fig, ax = plt.subplots(figsize=(6.5, 3.8))
ax.hist(ex["mean"], bins=30, color=BLUE)
ax.set_xlabel("share of attempts answered correctly (exercises with 100+ attempts)")
ax.set_ylabel("exercises")
ax.set_title(f"Exercises differ a lot in difficulty (n={len(ex)})")
save("03_exercise_difficulty_spread.png")
out["exercise_correct_rate_spread"] = {"n_exercises": int(len(ex)), "min": round(float(ex["mean"].min()), 3),
                                       "p10": round(float(ex["mean"].quantile(.1)), 3), "median": round(float(ex["mean"].median()), 3),
                                       "p90": round(float(ex["mean"].quantile(.9)), 3), "max": round(float(ex["mean"].max()), 3)}
print("  exercise correct-rate spread:", out["exercise_correct_rate_spread"])

# 4. student ability spread
st = df.groupby("student")["is_correct"].agg(["mean", "size"])
st = st[st["size"] >= 20]
fig, ax = plt.subplots(figsize=(6.5, 3.8))
ax.hist(st["mean"], bins=30, color=BLUE)
ax.set_xlabel("student's share correct (students with 20+ attempts)")
ax.set_ylabel("students")
ax.set_title(f"Students differ a lot in level (n={len(st)})")
save("04_student_level_spread.png")
out["student_correct_rate_spread"] = {"n_students": int(len(st)), "p10": round(float(st["mean"].quantile(.1)), 3),
                                      "median": round(float(st["mean"].median()), 3), "p90": round(float(st["mean"].quantile(.9)), 3)}
print("  student correct-rate spread:", out["student_correct_rate_spread"])

# 5. time taken (shown for understanding only: the current attempt's time is NOT a model input)
t = df["total_sec_taken"].clip(lower=0.5)
bins = [0, 5, 10, 20, 40, 80, 160, 1801]
tb = pd.cut(df["total_sec_taken"], bins, include_lowest=True)
rate = df.groupby(tb, observed=True)["is_correct"].mean()
fig, ax = plt.subplots(1, 2, figsize=(10, 3.8))
ax[0].hist(np.log10(t), bins=50, color=BLUE)
ax[0].set_xlabel("log10(seconds taken)")
ax[0].set_ylabel("attempts")
ax[0].set_title("Time per attempt")
ax[1].bar([str(i) for i in rate.index], rate.values, color=BLUE)
ax[1].set_xlabel("seconds taken")
ax[1].set_ylabel("share correct")
ax[1].set_title("Slower attempts are less often correct\n(not usable as a feature: unknown beforehand)")
plt.setp(ax[1].get_xticklabels(), rotation=30, ha="right", fontsize=7)
save("05_time_taken.png")
out["correct_rate_by_time_taken"] = {str(k): round(float(v), 3) for k, v in rate.items()}

# 6. learning curve: does accuracy change with practice?
ab = pd.cut(df["attempt_idx"], [-1, 9, 49, 199, 999, 10**6], labels=["0-9", "10-49", "50-199", "200-999", "1000+"])
lc = df.groupby(ab, observed=True)["is_correct"].agg(["mean", "size"])
fig, ax = plt.subplots(figsize=(6.5, 3.8))
ax.plot(lc.index.astype(str), lc["mean"], marker="o", color=BLUE)
for x, (m, n) in zip(lc.index.astype(str), zip(lc["mean"], lc["size"])):
    ax.text(x, m + 0.008, f"n={n:,}", ha="center", fontsize=7)
ax.margins(y=0.2)
ax.set_xlabel("student's attempt number")
ax.set_ylabel("share correct")
ax.set_title("Accuracy by amount of earlier practice\n(mix of students: a descriptive view, not proof of learning)")
save("06_accuracy_by_experience.png")
out["correct_rate_by_attempt_number"] = {str(k): round(float(v), 3) for k, v in lc["mean"].items()}

# 7. activity over time
wk = df.set_index("timestamp").resample("W")["is_correct"].size()
fig, ax = plt.subplots(figsize=(8, 3.5))
ax.plot(wk.index, wk.values, color=BLUE)
ax.set_ylabel("attempts per week")
ax.set_title("Activity over time (Aug 2018 to Jul 2019)")
save("07_activity_over_time.png")

# 8. model comparison, straight from the metrics files (no numbers typed by hand)
models = read_json("models.json")
base = read_json("baseline.json")
elo = read_json("elo.json")
gbd = read_json("models_detail.json")
if models and base:
    rows = [(b["model"], b["AUC"]) for b in base if not b["model"].startswith("LEAKY") and not b["model"].startswith("B3")]
    rows += [(m["model"], m["AUC"]) for m in models]
    names = [r[0].replace("M1 ", "M1 ").replace(" baseline", "") for r in rows]
    vals = [r[1] for r in rows]
    colors = [GREY if n.startswith("B") else (ORANGE if "Elo" in n else BLUE) for n in names]
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.barh(names[::-1], vals[::-1], color=colors[::-1])
    for i, v in enumerate(vals[::-1]):
        ax.text(v + 0.003, i, f"{v:.3f}", va="center", fontsize=8)
    ax.set_xlim(0.45, 0.82)
    ax.set_xlabel("test AUC on 747 students never seen in training (0.5 = coin flip)")
    ax.set_title("Model comparison (orange = the model running in the app)")
    save("08_model_comparison.png")

# 9. AUC by history length: the cold-start picture
if elo and gbd:
    keys = list(elo["auc_by_history"].keys())
    fig, ax = plt.subplots(figsize=(6.5, 3.8))
    ax.plot(keys, [elo["auc_by_history"][k] for k in keys], marker="o", color=ORANGE, label="Elo (live in app)")
    ax.plot(keys, [gbd["gb_auc_by_history"][k] for k in keys], marker="s", color=BLUE, label="Gradient boosting (research)")
    ax.set_xlabel("student's earlier attempts")
    ax.set_ylabel("test AUC")
    ax.set_title("New students are harder to predict (cold start)")
    ax.legend(frameon=False)
    save("09_auc_by_history.png")

with open(os.path.join(MET, "eda.json"), "w") as f:
    json.dump(out, f, indent=2, default=str)
print("\nSaved metrics/eda.json and the figures in figures/")