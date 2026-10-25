import sys
import pandas as pd
from tqdm import tqdm

RAW = "data/raw/Log_Problem.csv"
OUT = "data/processed/attempts.parquet"
PERCENT = int(sys.argv[1]) if len(sys.argv) > 1 else 5   # % of STUDENTS to keep
CHUNK = 1_000_000

# level, is_upgrade and is_downgrade are skipped on purpose: they may be
# computed AFTER the answer is known, which would leak the answer to the model.
KEEP = ["timestamp_TW", "uuid", "ucid", "upid", "problem_number",
        "exercise_problem_repeat_session", "is_correct", "total_sec_taken",
        "total_attempt_cnt", "used_hint_cnt", "is_hint_used"]

# ---------- 1. read in chunks, keep a fixed random set of students ----------
kept, total = [], 0
for chunk in tqdm(pd.read_csv(RAW, usecols=KEEP, chunksize=CHUNK), desc="reading", unit="chunk"):
    total += len(chunk)
    # Hash the student id -> number 0..99. The same student always gets the same number,
    # so ALL of a student's rows are kept or ALL are dropped (histories stay complete).
    h = pd.util.hash_pandas_object(chunk["uuid"], index=False) % 100
    kept.append(chunk[h < PERCENT])
df = pd.concat(kept, ignore_index=True)
del kept

# ---------- 2. clean types ----------
df["timestamp"] = pd.to_datetime(df["timestamp_TW"], utc=True)
df["is_correct"] = df["is_correct"].astype("int8")
df["is_hint_used"] = df["is_hint_used"].astype("int8")
for c in ["problem_number", "exercise_problem_repeat_session", "total_attempt_cnt", "used_hint_cnt"]:
    df[c] = df[c].astype("int32")
df["total_sec_taken"] = df["total_sec_taken"].astype("float32")

# ---------- 3. replace long hashed IDs with small integers (saves RAM) ----------
for old, new in [("uuid", "student"), ("ucid", "exercise"), ("upid", "problem")]:
    cat = df[old].astype("category")
    df[new] = cat.cat.codes.astype("int32")
    if old != "uuid":   # keep a map so we can join Info_Content.csv later
        pd.DataFrame({old: cat.cat.categories, new: range(len(cat.cat.categories))}).to_csv(
            f"data/processed/{new}_map.csv", index=False)
df = df.drop(columns=["uuid", "ucid", "upid", "timestamp_TW"])

# ---------- 4. order each student's history by time ----------
# Timestamps are rounded to 15 minutes, so ties happen; the extra columns break ties consistently.
df = df.sort_values(["student", "timestamp", "exercise",
                     "exercise_problem_repeat_session", "problem_number"]).reset_index(drop=True)
df["attempt_idx"] = df.groupby("student").cumcount().astype("int32")   # 0,1,2,... per student

df.to_parquet(OUT, index=False)

# ---------- 5. report ----------
per_student = df.groupby("student").size()
print(f"\nRows read from raw file: {total:,}")
print(f"Rows kept: {len(df):,}   Students kept: {df['student'].nunique():,}   Exercises: {df['exercise'].nunique():,}")
print(f"Date range: {df['timestamp'].min()}  ->  {df['timestamp'].max()}")
print("\nAttempts per student:")
print(per_student.describe().round(1))
print(f"Students with 20+ attempts: {(per_student >= 20).sum():,}")
print(f"\nOverall correct rate: {df['is_correct'].mean():.3f}")
same_time = (df.groupby("student")["timestamp"].diff() == pd.Timedelta(0)).mean()
print(f"Share of attempts with the SAME timestamp as the previous one (ties): {same_time:.3f}")
print("\nWhat does is_correct mean? Share correct, split by (first try only?, hint used?):")
print(pd.crosstab([df["total_attempt_cnt"] == 1, df["is_hint_used"]], df["is_correct"],
                  normalize="index").round(3))
print(f"\nSaved {OUT}")