"""Pretend-student test for the learning loop. Writes data/app_responses.csv shaped like the Mongo export."""
import os, random, math, csv, datetime
random.seed(7)
os.makedirs("data", exist_ok=True)
sig = lambda x: 1/(1+math.exp(-x))
TRUE_BIAS = 0.3                    # the real world is harder than the starting settings assume (0.86)
topics = ["Fractions","Algebra","Geometry","Decimals"]
qs = []
for i in range(160):
    lab = random.choice(["easy","medium","hard"])
    true_d = {"easy":-0.6,"medium":0.1,"hard":0.9}[lab] + random.gauss(0,0.6)   # labels are only a rough guide
    qs.append((f"{i:024x}", random.choice(topics), lab, true_d))
rows, t0 = [], datetime.datetime(2026,9,1)
for s in range(80):
    uid = f"{10_000+s:024x}"
    ab = {t: random.gauss(0,0.8) for t in topics}
    t = t0 + datetime.timedelta(hours=random.randint(0, 24*20))
    for k in range(60):
        q = random.choice(qs)
        p = sig(TRUE_BIAS + ab[q[1]] - q[3])
        ok = random.random() < p
        ab[q[1]] += 0.01 if ok else 0       # slow real learning
        t += datetime.timedelta(minutes=random.randint(1,300))
        rows.append((uid,q[0],"Math",q[1],q[2],str(ok).lower(),1,"true","practice",t.isoformat()+"Z"))
with open("data/app_responses.csv","w",newline="") as f:
    w = csv.writer(f); w.writerow("user,question,subject,topic,difficulty,success,trust,learned,mode,createdAt".split(","))
    w.writerows(rows)
print(len(rows), "simulated answers written")