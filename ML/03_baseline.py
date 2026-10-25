import json
import os
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score, log_loss

df = pd.read_parquet("data/processed/attempts.parquet")

# ---------- 1. Student history that is CERTAINLY in the past ----------
# 88% of attempts share a timestamp with the previous one (times are rounded to 15 min),
# so inside one 15-minute slot we cannot trust the order. Rule: for an attempt, use only
# attempts from STRICTLY EARLIER time slots. Safe, even if a little cautious.
blk = (df.groupby(["student", "timestamp"], sort=True)["is_correct"]
         .agg(n="size", c="sum").reset_index())
blk["n_before"] = blk.groupby("student")["n"].cumsum() - blk["n"]   # attempts in earlier slots
blk["c_before"] = blk.groupby("student")["c"].cumsum() - blk["c"]   # of which correct
df = df.merge(blk[["student", "timestamp", "n_before", "c_before"]],
              on=["student", "timestamp"], how="left")

# ---------- 2. Split by STUDENT: 80% train students, 20% brand-new test students ----------
rng = np.random.default_rng(42)
students = df["student"].unique()
test_students = rng.choice(students, size=int(0.2 * len(students)), replace=False)
is_test = df["student"].isin(test_students)
train, test = df[~is_test], df[is_test].copy()
print(f"Train: {len(train):,} attempts from {train['student'].nunique():,} students")
print(f"Test : {len(test):,} attempts from {test['student'].nunique():,} students (never seen in training)")

g = train["is_correct"].mean()              # overall correct rate in TRAIN only
print(f"Overall correct rate (train): {g:.3f}")

# ---------- 3. The baselines ----------
K = 5   # "pseudo-attempts": pulls tiny samples toward the overall rate
ex = train.groupby("exercise")["is_correct"].agg(["sum", "count"])
ex_rate = (ex["sum"] + K * g) / (ex["count"] + K)          # how easy is each exercise, from TRAIN students only

p = {}
p["B0 always the overall rate"] = np.full(len(test), g)
p["B1 exercise easiness"] = test["exercise"].map(ex_rate).fillna(g).to_numpy()
p["B2 student's own past accuracy"] = ((test["c_before"] + K * g) / (test["n_before"] + K)).to_numpy()
p["B3 average of B1 and B2"] = (p["B1 exercise easiness"] + p["B2 student's own past accuracy"]) / 2

y = test["is_correct"].to_numpy()
rows = []
for name, pred in p.items():
    pred = np.clip(pred, 1e-4, 1 - 1e-4)
    rows.append({"model": name, "AUC": roc_auc_score(y, pred), "log_loss": log_loss(y, pred)})

# ---------- 4. What CHEATING looks like (do NOT use this as a model) ----------
leaky = ((test["total_attempt_cnt"] == 1) & (test["is_hint_used"] == 0)).astype(float)
rows.append({"model": "LEAKY: used this attempt's hint/attempt count", "AUC": roc_auc_score(y, leaky), "log_loss": np.nan})

res = pd.DataFrame(rows)
print("\nRESULTS on test students (higher AUC is better, lower log_loss is better):")
print(res.round(4).to_string(index=False))

# ---------- 5. How does B3 do for students with little vs lots of history? ----------
bucket = pd.cut(test["n_before"], [-1, 0, 9, 49, np.inf], labels=["0 (new student)", "1-9", "10-49", "50+"])
print("\nB3 AUC by how many earlier attempts the student had:")
for b in bucket.cat.categories:
    m = (bucket == b).to_numpy()
    if m.sum() > 0 and y[m].min() != y[m].max():
        print(f"  {b:>16}: AUC {roc_auc_score(y[m], p['B3 average of B1 and B2'][m]):.4f}   ({m.sum():,} attempts)")

os.makedirs("metrics", exist_ok=True)
res.to_json("metrics/baseline.json", orient="records", indent=2)
print("\nSaved metrics/baseline.json")