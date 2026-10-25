import json
import math
import os
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, log_loss

df = pd.read_parquet("data/processed/attempts.parquet",
                     columns=["student", "exercise", "timestamp", "is_correct"])

# ---------- 1. Same TEST students as Lesson 3, plus a VALIDATION group from the rest ----------
rng = np.random.default_rng(42)
students = df["student"].unique()
test_students = rng.choice(students, size=int(0.2 * len(students)), replace=False)   # identical to 03_baseline.py
rest = np.setdiff1d(students, test_students)
valid_students = np.random.default_rng(7).choice(rest, size=int(0.2 * len(rest)), replace=False)

is_test = df["student"].isin(test_students)
is_valid = df["student"].isin(valid_students)
train_all = df[~is_test]
train_sub = df[~is_test & ~is_valid]    # used while tuning
valid = df[is_valid]
test = df[is_test]
print(f"train {len(train_all):,} | of which tuning-train {len(train_sub):,} | validation {len(valid):,} | test {len(test):,} attempts")

N_STUD = int(df["student"].max()) + 1
N_EX = int(df["exercise"].max()) + 1


def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-max(min(x, 30.0), -30.0)))


def k_student(k0, n_seen):      # big steps while we know little, smaller later (never below 25%)
    return k0 * (0.25 + 0.75 / (1 + n_seen / 20))


def k_exercise(kd, n_seen):
    return kd * (0.25 + 0.75 / (1 + n_seen / 50))


def fit_elo(rows, k0, kd, bias):
    """PHASE A: learn exercise difficulties from TRAINING students, in time order."""
    rows = rows.sort_values("timestamp", kind="stable")
    th, ns = [0.0] * N_STUD, [0] * N_STUD
    d, ne = [0.0] * N_EX, [0] * N_EX
    for s, e, y in zip(rows["student"].tolist(), rows["exercise"].tolist(), rows["is_correct"].tolist()):
        err = y - sigmoid(bias + th[s] - d[e])
        th[s] += k_student(k0, ns[s]) * err
        d[e] -= k_exercise(kd, ne[e]) * err
        ns[s] += 1
        ne[e] += 1
    return d, ne


def evaluate_elo(rows, d, k0, bias):
    """PHASE B: brand-new students. Difficulties are frozen, ability starts at 0 and is learned on the fly.
    All attempts in one 15-minute slot are predicted with the ability from the START of that slot."""
    rows = rows.sort_values(["student", "timestamp"], kind="stable")
    s = rows["student"].to_numpy()
    t = pd.to_datetime(rows["timestamp"], utc=True).dt.tz_convert(None).to_numpy()
    new_student = np.ones(len(rows), dtype=bool)
    new_student[1:] = s[1:] != s[:-1]
    new_slot = new_student.copy()
    new_slot[1:] |= t[1:] != t[:-1]
    preds, hist = [0.0] * len(rows), [0] * len(rows)
    th = th_slot = 0.0
    n_seen = n_slot = 0
    for i, (ns_, nsl, e, y) in enumerate(zip(new_student.tolist(), new_slot.tolist(),
                                             rows["exercise"].tolist(), rows["is_correct"].tolist())):
        if ns_:
            th, n_seen = 0.0, 0
        if nsl:
            th_slot, n_slot = th, n_seen
        preds[i] = sigmoid(bias + th_slot - d[e])      # prediction uses only the past
        hist[i] = n_slot
        th += k_student(k0, n_seen) * (y - sigmoid(bias + th - d[e]))   # then learn from the outcome
        n_seen += 1
    return rows["is_correct"].to_numpy(), np.clip(np.array(preds), 1e-4, 1 - 1e-4), np.array(hist)


def bias_of(rows):
    g = rows["is_correct"].mean()
    return math.log(g / (1 - g))


# ---------- 2. Tune K (student step) and Kd (exercise step) on VALIDATION students ----------
print("\nTuning on validation students (test students are NOT touched):")
bias_sub = bias_of(train_sub)
grid = []
for k0 in [0.05, 0.1, 0.2, 0.4, 0.8]:
    for kd in [0.02, 0.05]:
        d, _ = fit_elo(train_sub, k0, kd, bias_sub)
        y, p, _ = evaluate_elo(valid, d, k0, bias_sub)
        grid.append({"K": k0, "Kd": kd, "valid_AUC": roc_auc_score(y, p), "valid_log_loss": log_loss(y, p)})
grid = pd.DataFrame(grid)
print(grid.round(4).to_string(index=False))
best = grid.sort_values("valid_log_loss").iloc[0]
K0, KD = float(best["K"]), float(best["Kd"])
print(f"\nChosen settings (lowest validation log loss): K={K0}, Kd={KD}")
if K0 in (0.05, 0.8) or KD in (0.02, 0.05) and KD == grid["Kd"].max():
    print("Note: the best value sits at the edge of the tested range; a wider range might do even better.")

# ---------- 3. Final: learn difficulties from ALL training students, score the TEST students ----------
bias = bias_of(train_all)
d, ne = fit_elo(train_all, K0, KD, bias)
y, p, hist = evaluate_elo(test, d, K0, bias)
auc, ll = roc_auc_score(y, p), log_loss(y, p)
print(f"\nELO on test students:  AUC {auc:.4f}   log loss {ll:.4f}")

if os.path.exists("metrics/baseline.json"):
    base = pd.read_json("metrics/baseline.json")
    b3 = base[base["model"].str.startswith("B3")].iloc[0]
    print(f"B3 baseline          :  AUC {b3['AUC']:.4f}   log loss {b3['log_loss']:.4f}   <- the number to beat")

bucket = pd.cut(pd.Series(hist), [-1, 0, 9, 49, np.inf], labels=["0 (new student)", "1-9", "10-49", "50+"])
print("\nElo AUC by how many earlier attempts the student had:")
by_hist = {}
for b in bucket.cat.categories:
    m = (bucket == b).to_numpy()
    if m.sum() > 0 and y[m].min() != y[m].max():
        by_hist[str(b)] = float(roc_auc_score(y[m], p[m]))
        print(f"  {b:>16}: AUC {by_hist[str(b)]:.4f}   ({m.sum():,} attempts)")

# ---------- 4. Calibration: do the percentages come true? ----------
cal = pd.DataFrame({"p": p, "y": y})
cal["band"] = pd.cut(cal["p"], [0, .3, .5, .6, .7, .8, .9, 1.0])
tab = cal.groupby("band", observed=True).agg(predicted=("p", "mean"), real=("y", "mean"), attempts=("y", "size"))
print("\nCALIBRATION (predicted vs real success rate; the two columns should be close):")
print(tab.round(3).to_string())

# ---------- 5. Save ----------
os.makedirs("models", exist_ok=True)
os.makedirs("metrics", exist_ok=True)
diff = pd.DataFrame({"exercise": range(N_EX), "difficulty": d, "train_attempts": ne})
if os.path.exists("data/processed/exercise_map.csv"):
    diff = diff.merge(pd.read_csv("data/processed/exercise_map.csv"), on="exercise", how="left")
diff.to_csv("models/elo_exercise_difficulty.csv", index=False)
with open("models/elo_params.json", "w") as f:
    json.dump({"K": K0, "Kd": KD, "bias": bias}, f, indent=2)
with open("metrics/elo.json", "w") as f:
    json.dump({"test_AUC": auc, "test_log_loss": ll, "K": K0, "Kd": KD, "auc_by_history": by_hist,
               "tuning_grid": grid.to_dict("records")}, f, indent=2)
print("\nSaved models/elo_exercise_difficulty.csv, models/elo_params.json, metrics/elo.json")