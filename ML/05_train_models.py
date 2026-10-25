import json
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, log_loss
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

COLS = ["student", "exercise", "problem", "timestamp", "is_correct",
        "is_hint_used", "total_attempt_cnt", "total_sec_taken"]
df = pd.read_parquet("data/processed/attempts.parquet", columns=COLS)

# ---------- 1. Same split as Lessons 3 and 4 (by student) ----------
rng = np.random.default_rng(42)
students = df["student"].unique()
test_students = rng.choice(students, size=int(0.2 * len(students)), replace=False)
rest = np.setdiff1d(students, test_students)
valid_students = np.random.default_rng(7).choice(rest, size=int(0.2 * len(rest)), replace=False)
train_students = np.setdiff1d(rest, valid_students)
df["role"] = np.where(df["student"].isin(test_students), "test",
                      np.where(df["student"].isin(valid_students), "valid", "train"))
print(df["role"].value_counts().to_string())

K = 5                                                    # smoothing: tiny samples are pulled toward the overall rate
tr = df["role"] == "train"
g = df.loc[tr, "is_correct"].mean()
hg = df.loc[tr, "is_hint_used"].mean()
ag = df.loc[tr, "total_attempt_cnt"].mean()

# speed relative to the typical time for that exercise (typical time from TRAIN students only)
df["log_sec"] = np.log1p(df["total_sec_taken"].clip(lower=0))
ex_med = df.loc[tr].groupby("exercise")["log_sec"].median()
df["speed_dev"] = df["log_sec"] - df["exercise"].map(ex_med).fillna(df.loc[tr, "log_sec"].median())

# ---------- 2. Student history from strictly EARLIER time slots ----------
slot = (df.groupby(["student", "timestamp"], sort=True)
          .agg(n=("is_correct", "size"), c=("is_correct", "sum"), h=("is_hint_used", "sum"),
               a=("total_attempt_cnt", "sum"), sd=("speed_dev", "sum")).reset_index())
gb = slot.groupby("student")
for col in ["n", "c", "h", "a", "sd"]:
    slot[col + "_b"] = gb[col].cumsum() - slot[col]                 # totals over earlier slots
for m in (3, 10):                                                    # "recent form": last 3 / last 10 earlier slots
    for col in ("n", "c"):
        slot[f"{col}_l{m}"] = gb[col].transform(
            lambda x, m=m: x.shift(1).rolling(m, min_periods=1).sum()).fillna(0)
slot["hours_since_last"] = gb["timestamp"].diff().dt.total_seconds() / 3600
keep = ["student", "timestamp", "n_b", "c_b", "h_b", "a_b", "sd_b",
        "n_l3", "c_l3", "n_l10", "c_l10", "hours_since_last"]
df = df.merge(slot[keep], on=["student", "timestamp"], how="left")

df["n_before_log"] = np.log1p(df["n_b"])
df["acc_all"] = (df["c_b"] + K * g) / (df["n_b"] + K)
df["acc_last3"] = (df["c_l3"] + K * g) / (df["n_l3"] + K)
df["acc_last10"] = (df["c_l10"] + K * g) / (df["n_l10"] + K)
df["hint_rate"] = (df["h_b"] + K * hg) / (df["n_b"] + K)
df["mean_tries"] = (df["a_b"] + K * ag) / (df["n_b"] + K)
df["speed_dev_mean"] = df["sd_b"] / (df["n_b"] + K)
df["log_hours_since_last"] = np.log1p(df["hours_since_last"])

# the same student on the SAME exercise before
se = (df.groupby(["student", "exercise", "timestamp"], sort=True)
        .agg(n=("is_correct", "size"), c=("is_correct", "sum")).reset_index())
gs = se.groupby(["student", "exercise"])
se["ex_n_before"] = gs["n"].cumsum() - se["n"]
se["ex_c_before"] = gs["c"].cumsum() - se["c"]
df = df.merge(se[["student", "exercise", "timestamp", "ex_n_before", "ex_c_before"]],
              on=["student", "exercise", "timestamp"], how="left")
df["ex_acc"] = (df["ex_c_before"] + 2 * df["acc_all"]) / (df["ex_n_before"] + 2)

# ---------- 3. How easy is the exercise / problem for OTHER students ----------
def easiness_tables(rows):
    ex = rows.groupby("exercise")["is_correct"].agg(["sum", "count"])
    ex_rate = (ex["sum"] + 5 * g) / (ex["count"] + 5)
    pr = rows.groupby("problem").agg(s=("is_correct", "sum"), n=("is_correct", "size"), e=("exercise", "first"))
    pr_rate = pd.Series((pr["s"].to_numpy() + 10 * ex_rate.reindex(pr["e"]).to_numpy()) / (pr["n"].to_numpy() + 10),
                        index=pr.index)
    return ex_rate, pr_rate


def encode(rows, ex_rate, pr_rate):
    e = rows["exercise"].map(ex_rate).fillna(g)
    p = rows["problem"].map(pr_rate)
    return e.to_numpy(), p.fillna(e).to_numpy()


# ---------- 4. OUT-OF-FOLD encoding (the subtle leakage trap) ----------
# If a training row's easiness were computed from data that includes that row's own answer, the
# model would learn to over-trust it, and would then disappoint on new students. So for TRAIN rows,
# easiness comes from the OTHER 4/5 of the training students. Valid/test rows use all training students.
df["ex_easy"] = np.nan
df["prob_easy"] = np.nan
train_idx = df.index[df["role"] == "train"]
fold_of = pd.Series(np.random.default_rng(1).integers(0, 5, size=len(train_students)), index=train_students)
fold = df.loc[train_idx, "student"].map(fold_of).to_numpy()
for k in range(5):
    er, pr = easiness_tables(df.loc[train_idx[fold != k]])
    apply_idx = train_idx[fold == k]
    e, p = encode(df.loc[apply_idx], er, pr)
    df.loc[apply_idx, "ex_easy"] = e
    df.loc[apply_idx, "prob_easy"] = p
er_all, pr_all = easiness_tables(df.loc[train_idx])
other = df.index[df["role"] != "train"]
e, p = encode(df.loc[other], er_all, pr_all)
df.loc[other, "ex_easy"] = e
df.loc[other, "prob_easy"] = p

logit = lambda p: np.log(np.clip(p, 1e-4, 1 - 1e-4) / (1 - np.clip(p, 1e-4, 1 - 1e-4)))
df["gap"] = logit(df["acc_all"]) - logit(df["ex_easy"])      # student level minus exercise easiness

FEATURES = ["n_before_log", "acc_all", "acc_last3", "acc_last10", "hint_rate", "mean_tries",
            "speed_dev_mean", "log_hours_since_last", "ex_n_before", "ex_acc", "ex_easy", "prob_easy", "gap"]
trn, va, te = df[df["role"] == "train"], df[df["role"] == "valid"], df[df["role"] == "test"]
y_tr, y_va, y_te = trn["is_correct"].to_numpy(), va["is_correct"].to_numpy(), te["is_correct"].to_numpy()

# ---------- 5. Leakage alarm: a single honest feature should NOT score above ~0.9 AUC ----------
print("\nEach feature ALONE, AUC on validation students (0.5 = useless; above 0.9 = suspect a leak):")
for f in FEATURES:
    v = va[f].fillna(va[f].median()).to_numpy()
    a = roc_auc_score(y_va, v)
    print(f"  {f:>22}: {max(a, 1 - a):.4f}  ({'higher' if a >= .5 else 'lower'} value -> more success)")

# ---------- 6. Model M2: logistic regression ----------
lr = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), LogisticRegression(max_iter=1000))
lr.fit(trn[FEATURES], y_tr)
print("\nLogistic regression: what it learned (bigger number = stronger push; sign = direction):")
coefs = pd.Series(lr[-1].coef_[0], index=FEATURES).sort_values(key=abs, ascending=False)
print(coefs.round(3).to_string())

# ---------- 7. Model M3: gradient boosting (choose number of trees on VALIDATION students) ----------
def make_hgb(n_trees):
    return HistGradientBoostingClassifier(learning_rate=0.08, max_iter=n_trees, max_leaf_nodes=31,
                                          min_samples_leaf=200, l2_regularization=1.0,
                                          early_stopping=False, random_state=0)

probe = make_hgb(400).fit(trn[FEATURES], y_tr)
val_curve = [log_loss(y_va, p[:, 1]) for p in probe.staged_predict_proba(va[FEATURES])]
best_iter = int(np.argmin(val_curve)) + 1
print(f"\nGradient boosting: best number of trees on validation students = {best_iter} (of 400 tried)")
hgb = make_hgb(best_iter).fit(trn[FEATURES], y_tr)

# ---------- 8. Final scores on the TEST students ----------
def score(model, X, y):
    p = np.clip(model.predict_proba(X)[:, 1], 1e-4, 1 - 1e-4)
    return p, roc_auc_score(y, p), log_loss(y, p)

p_lr, auc_lr, ll_lr = score(lr, te[FEATURES], y_te)
p_gb, auc_gb, ll_gb = score(hgb, te[FEATURES], y_te)

rows = []
if os.path.exists("metrics/baseline.json"):
    b = pd.read_json("metrics/baseline.json")
    b3 = b[b["model"].str.startswith("B3")].iloc[0]
    rows.append(("B3 baseline", b3["AUC"], b3["log_loss"]))
if os.path.exists("metrics/elo.json"):
    el = json.load(open("metrics/elo.json"))
    rows.append(("M1 Elo", el["test_AUC"], el["test_log_loss"]))
rows += [("M2 Logistic regression", auc_lr, ll_lr), ("M3 Gradient boosting", auc_gb, ll_gb)]
res = pd.DataFrame(rows, columns=["model", "AUC", "log_loss"])
print("\nRESULTS on TEST students (higher AUC better, lower log loss better):")
print(res.round(4).to_string(index=False))

bucket = pd.cut(te["n_b"].to_numpy(), [-1, 0, 9, 49, np.inf], labels=["0 (new student)", "1-9", "10-49", "50+"])
print("\nGradient boosting AUC by how many earlier attempts the student had:")
by_hist = {}
for bname in bucket.categories:
    m = np.asarray(bucket == bname)
    if m.sum() > 0 and y_te[m].min() != y_te[m].max():
        by_hist[str(bname)] = float(roc_auc_score(y_te[m], p_gb[m]))
        print(f"  {bname:>16}: AUC {by_hist[str(bname)]:.4f}   ({m.sum():,} attempts)")

cal = pd.DataFrame({"p": p_gb, "y": y_te})
cal["band"] = pd.cut(cal["p"], [0, .3, .5, .6, .7, .8, .9, 1.0])
print("\nCALIBRATION of gradient boosting (predicted vs real success rate):")
print(cal.groupby("band", observed=True).agg(predicted=("p", "mean"), real=("y", "mean"),
                                              attempts=("y", "size")).round(3).to_string())

# ---------- 9. Which features matter? (shuffle one feature, see how much AUC drops) ----------
sub = va.sample(min(40000, len(va)), random_state=0)
imp = permutation_importance(hgb, sub[FEATURES], sub["is_correct"], scoring="roc_auc",
                             n_repeats=2, random_state=0)
print("\nFeature importance for gradient boosting (AUC lost when that feature is shuffled):")
print(pd.Series(imp.importances_mean, index=FEATURES).sort_values(ascending=False).round(4).to_string())

# ---------- 10. Save ----------
os.makedirs("models", exist_ok=True)
os.makedirs("metrics", exist_ok=True)
joblib.dump(lr, "models/m2_logreg.joblib")
joblib.dump(hgb, "models/m3_hgb.joblib")
er_all.rename("easiness").to_csv("models/exercise_easiness.csv")
pr_all.rename("easiness").to_csv("models/problem_easiness.csv")
with open("models/features.json", "w") as f:
    json.dump({"features": FEATURES, "smoothing_K": K, "global_rate": float(g), "best_trees": best_iter}, f, indent=2)
res.assign(by_history_gb=None).to_json("metrics/models.json", orient="records", indent=2)
with open("metrics/models_detail.json", "w") as f:
    json.dump({"gb_auc_by_history": by_hist}, f, indent=2)
print("\nSaved models/m2_logreg.joblib, models/m3_hgb.joblib, models/features.json, metrics/models.json")