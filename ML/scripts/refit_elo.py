"""
Make the model finer from your app's own answers.

1) Export the responses collection from MongoDB:
   mongoexport --uri="$MONGO_URI" --collection=responses --type=csv ^
     --fields=user,question,subject,topic,difficulty,success,trust,learned,mode,createdAt ^
     --out=data/app_responses.csv

2) Run:  python scripts/refit_elo.py data/app_responses.csv
         (add --write to save the new numbers; without it nothing changes)

3) If it wrote new numbers: POST /reload-params on the ML service (or restart it).

How the test is honest
  * Elo is online: every prediction is made BEFORE that answer is learned. So replaying the answers
    in time order gives out-of-sample predictions for free.
  * Settings are chosen on the MIDDLE slice of time (40% to 70%) and judged on the LAST 30%,
    which the search never looked at.
  * New numbers are saved only if they beat the current ones on that last 30% by a clear margin.
"""
import argparse
import itertools
import json
import math
import os
import re
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARAMS_PATH = os.path.join(BASE, "models", "elo_params.json")
LABEL = {"easy": -1.0, "medium": 0.0, "hard": 1.0}
MIN_TRUST = 0.3            # same rule as the backend: flagged sessions do not teach the model
QUESTION_WARM = 50         # same shapes as app.py
STUDENT_WARM = 20


def sig(x):
    return 1.0 / (1.0 + math.exp(-max(min(x, 30.0), -30.0)))


def clean_id(v):
    m = re.search(r"[0-9a-fA-F]{24}", str(v))
    return m.group(0) if m else str(v)


def load(path):
    df = pd.read_csv(path)
    for col in ("user", "question"):
        df[col] = df[col].map(clean_id)
    df["t"] = pd.to_datetime(df["createdAt"], utc=True, errors="coerce")
    df["success"] = df["success"].astype(str).str.lower().isin(["true", "1"])
    df["trust"] = pd.to_numeric(df.get("trust", 1.0), errors="coerce").fillna(1.0)
    if "learned" in df:
        df = df[df["learned"].astype(str).str.lower() != "false"]
    if "mode" in df:
        df["k_mult"] = np.where(df["mode"].astype(str) == "level", 4.0, 1.0)
    else:
        df["k_mult"] = 1.0
    df["d0"] = df["difficulty"].astype(str).str.lower().map(LABEL).fillna(0.0)
    df = df.dropna(subset=["t"])
    df = df[df["trust"] >= MIN_TRUST].sort_values("t").reset_index(drop=True)
    return df


def replay(df, K, KD, bias):
    """Return the predicted chance for every row, made before learning that row."""
    ability, a_n, diff, q_n = {}, {}, {}, {}
    pred = np.empty(len(df))
    users, subs, tops = df["user"].values, df["subject"].values, df["topic"].values
    qs, d0 = df["question"].values, df["d0"].values
    succ, trust, km = df["success"].values.astype(float), df["trust"].values, df["k_mult"].values
    for i in range(len(df)):
        ak = (users[i], subs[i], tops[i])
        a = ability.get(ak, 0.0)
        d = diff.get(qs[i], d0[i])
        p = sig(bias + a - d)
        pred[i] = p
        err = succ[i] - p
        ks = K * (0.25 + 0.75 / (1 + a_n.get(ak, 0) / STUDENT_WARM))
        kq = KD * (0.25 + 0.75 / (1 + q_n.get(qs[i], 0) / QUESTION_WARM))
        ability[ak] = max(-6, min(6, a + trust[i] * km[i] * ks * err))
        diff[qs[i]] = max(-6, min(6, d - trust[i] * kq * err))
        a_n[ak] = a_n.get(ak, 0) + 1
        q_n[qs[i]] = q_n.get(qs[i], 0) + 1
    return pred


def log_loss(y, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def auc(y, p):
    y = np.asarray(y, dtype=bool)
    pos, neg = p[y], p[~y]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    order = pd.Series(np.concatenate([pos, neg])).rank().values
    return float((order[: len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def calibration(y, p):
    bands = [(0, .3), (.3, .5), (.5, .7), (.7, .8), (.8, .9), (.9, 1.01)]
    out = []
    for lo, hi in bands:
        m = (p >= lo) & (p < hi)
        if m.sum() >= 20:
            out.append({"band": f"{lo:.1f}-{min(hi, 1):.1f}", "n": int(m.sum()),
                        "predicted": round(float(p[m].mean()), 3), "real": round(float(y[m].mean()), 3)})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--write", action="store_true", help="save the new settings if they win")
    ap.add_argument("--min-rows", type=int, default=2000)
    ap.add_argument("--margin", type=float, default=0.002, help="log loss improvement needed to promote")
    args = ap.parse_args()

    df = load(args.csv)
    n = len(df)
    print(f"{n} usable answers from {df['user'].nunique()} students and {df['question'].nunique()} questions")
    if n < args.min_rows:
        print(f"Need at least {args.min_rows} answers before re-tuning is meaningful. Keep collecting. Nothing changed.")
        return 0

    y = df["success"].values.astype(float)
    tune = slice(int(n * 0.4), int(n * 0.7))
    final = slice(int(n * 0.7), n)

    try:
        cur = json.load(open(PARAMS_PATH))
    except Exception:
        cur = {"K": 0.2, "Kd": 0.05, "bias": 0.85}
    cur_K, cur_KD, cur_B = float(cur.get("K", .2)), float(cur.get("Kd", .05)), float(cur.get("bias", .85))

    best = None
    for K, KD, bias in itertools.product([0.05, 0.1, 0.2, 0.3, 0.4, 0.6], [0.02, 0.05, 0.1, 0.2, 0.3],
                                         [0.0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.2]):
        ll = log_loss(y[tune], replay(df, K, KD, bias)[tune])
        if best is None or ll < best[0]:
            best = (ll, K, KD, bias)
    _, K, KD, bias = best
    print(f"Best on the tuning slice: K={K} Kd={KD} bias={bias}")

    p_new = replay(df, K, KD, bias)[final]
    p_old = replay(df, cur_K, cur_KD, cur_B)[final]
    yf = y[final]
    res = {
        "answers": n, "judged_on_last_answers": int(len(yf)),
        "current": {"K": cur_K, "Kd": cur_KD, "bias": cur_B, "log_loss": round(log_loss(yf, p_old), 4), "auc": round(auc(yf, p_old), 4)},
        "candidate": {"K": K, "Kd": KD, "bias": bias, "log_loss": round(log_loss(yf, p_new), 4), "auc": round(auc(yf, p_new), 4)},
        "calibration_candidate": calibration(yf, p_new),
        "real_success_rate": round(float(yf.mean()), 3),
    }
    print(json.dumps(res, indent=2))

    gain = res["current"]["log_loss"] - res["candidate"]["log_loss"]
    win = gain >= args.margin
    print(f"\nLog loss gain on untouched data: {gain:+.4f} (need {args.margin}) -> {'PROMOTE' if win else 'KEEP CURRENT'}")

    os.makedirs(os.path.join(BASE, "metrics"), exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    with open(os.path.join(BASE, "metrics", f"refit_{stamp}.json"), "w") as f:
        json.dump(res, f, indent=2)

    if win and args.write:
        new = {"K": K, "Kd": KD, "bias": bias, "version": f"elo-{stamp}-n{n}", "fitted_on": "app answers"}
        with open(PARAMS_PATH, "w") as f:
            json.dump(new, f, indent=2)
        print("Saved", PARAMS_PATH, "-> now call POST /reload-params on the ML service.")
    elif win:
        print("Run again with --write to save.")
    return 0


if __name__ == "__main__":
    sys.exit(main())