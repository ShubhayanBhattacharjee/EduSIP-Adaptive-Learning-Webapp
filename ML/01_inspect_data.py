import sys
import pandas as pd

path = sys.argv[1] if len(sys.argv) > 1 else "data/raw/Log_Problem.csv"
n_rows = int(sys.argv[2]) if len(sys.argv) > 2 else 500_000

df = pd.read_csv(path, nrows=n_rows)

print(f"READ ONLY THE FIRST {len(df)} ROWS (a sample, not the whole file)")
print("\nCOLUMNS:", df.columns.tolist())

print("\nFIRST 5 ROWS:")
print(df.head().to_string())

print("\nDATA TYPES:")
print(df.dtypes)

# Few unique values = a category/flag. Huge number = an ID (student, exercise...).
print("\nUNIQUE VALUES PER COLUMN (in this sample):")
print(df.nunique().sort_values())

missing = df.isna().sum()
print("\nCOLUMNS WITH MISSING VALUES:")
print(missing[missing > 0] if (missing > 0).any() else "none")

for col in ["is_correct", "is_hint_used"]:
    if col in df.columns:
        print(f"\nVALUE COUNTS for {col}:")
        print(df[col].value_counts(dropna=False))