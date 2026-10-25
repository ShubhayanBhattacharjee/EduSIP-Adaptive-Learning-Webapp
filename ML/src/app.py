import hmac
import json
import math
import os
import random
import re
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from src.groq_service import ask_llm
from src import planner, level

load_dotenv()
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_json(rel_path):
    path = os.path.join(BASE_DIR, rel_path)
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


# ---------------- settings ----------------
def load_params():
    """Read models/elo_params.json (written by 04_elo.py, later by scripts/refit_elo.py)."""
    global K, KD, BIAS, MODEL_VERSION
    p = read_json("models/elo_params.json") or {}
    K = float(p.get("K", 0.2))          # how fast a STUDENT's ability moves
    KD = float(p.get("Kd", 0.05))       # how fast a QUESTION's difficulty moves
    BIAS = float(p.get("bias", 0.85))   # makes "ability 0 vs difficulty 0" about a 70% chance
    MODEL_VERSION = str(p.get("version", "elo-v1"))   # logged with every answer
    return p


K = KD = BIAS = 0.0
MODEL_VERSION = "elo-v1"
params = load_params()
LABEL_DIFFICULTY = {"easy": -1.0, "medium": 0.0, "hard": 1.0}   # starting guesses, live answers correct them
NEW_STUDENT_ABILITY = 0.0
QUESTION_NEEDS_DATA_BELOW = 30           # a question with fewer answers than this is still "being learned"
API_KEY = os.getenv("ML_API_KEY", "")
ORIGINS = [o.strip() for o in os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",") if o.strip()]

app = FastAPI(title="Adaptive Learning ML + Tutor service")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["*"])


def require_key(x_api_key: str = Header(default="")):
    """If ML_API_KEY is set in .env, the backend must send it in the X-API-KEY header."""
    if API_KEY and not hmac.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Missing or wrong X-API-KEY")


# ---------------- Elo maths (same as 04_elo.py) ----------------
def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-max(min(x, 30.0), -30.0)))


def k_student(n_seen):       # big steps while we know little about a student, smaller later
    return K * (0.25 + 0.75 / (1 + n_seen / 20))


def k_question(n_seen):      # same idea for a question
    return KD * (0.25 + 0.75 / (1 + n_seen / 50))


def resolve_difficulty(difficulty, label):
    if difficulty is not None:
        return difficulty
    if label is None:
        return 0.0
    key = label.strip().lower()
    if key not in LABEL_DIFFICULTY:
        raise HTTPException(status_code=400, detail=f"label must be one of {list(LABEL_DIFFICULTY)}")
    return LABEL_DIFFICULTY[key]


def chance_of_success(ability, difficulty):
    return sigmoid(BIAS + ability - difficulty)


# ---------------- request shapes ----------------
class Candidate(BaseModel):
    question_id: str = Field(max_length=100)
    difficulty: Optional[float] = Field(default=None, ge=-8, le=8)   # the question's current rating, if known
    label: Optional[str] = None                                      # "Easy"/"Medium"/"Hard" for brand-new questions
    question_attempts: int = Field(default=0, ge=0)                  # how many answers this question has had
    topic: Optional[str] = Field(default=None, max_length=100)       # lets the level test spread across topics


class PredictRequest(BaseModel):
    ability: float = Field(default=NEW_STUDENT_ABILITY, ge=-8, le=8)
    candidates: List[Candidate] = Field(min_length=1, max_length=500)


class NextQuestionRequest(PredictRequest):
    exclude: List[str] = []                                  # question ids already answered this session
    target: float = Field(default=0.7, ge=0.3, le=0.95)      # aim for this chance of success
    explore: float = Field(default=0.1, ge=0.0, le=0.5)      # share of picks used to learn about new questions
    seed: Optional[int] = None                               # only for testing
    topic_counts: dict = {}                                  # topic -> how many questions already asked this session
    coverage_penalty: float = Field(default=0.0, ge=0.0, le=0.5)   # level test: ~0.08 spreads picks over topics


class UpdateRequest(BaseModel):
    ability: float = Field(default=NEW_STUDENT_ABILITY, ge=-8, le=8)
    difficulty: Optional[float] = Field(default=None, ge=-8, le=8)
    label: Optional[str] = None
    success: bool                                            # correct on the FIRST try WITHOUT a hint
    student_attempts: int = Field(default=0, ge=0)           # this student's earlier attempts in this topic
    question_attempts: int = Field(default=0, ge=0)          # this question's earlier answers
    trust: float = Field(default=1.0, ge=0.0, le=1.0)        # 1 = clean session, lower = suspicious (integrity)
    k_multiplier: float = Field(default=1.0, ge=0.1, le=8.0) # above 1 for the level test (ability must move fast)
    update_question: bool = True                             # False = move only the student
    score: Optional[float] = Field(default=None, ge=0.0, le=1.0)   # OPTIONAL softer outcome, see note in update_state


class TopicState(BaseModel):
    topic: str = Field(max_length=100)
    ability: float = Field(ge=-8, le=8)
    attempts: int = Field(default=0, ge=0)


class PlanRequest(BaseModel):
    topics: List[TopicState] = Field(min_length=1, max_length=200)


class HintRequest(BaseModel):
    question: str = Field(max_length=4000)
    options: Optional[List[str]] = None
    topic: str = Field(default="General", max_length=200)
    hint_level: int = Field(default=1, ge=1, le=3)
    correct_answer: Optional[str] = Field(default=None, max_length=1000)    # used only to steer away from it
    success_chance: Optional[float] = Field(default=None, ge=0, le=1)       # from /predict-success


class PlanTopic(BaseModel):
    subject: str = Field(max_length=100)
    topic: str = Field(max_length=100)
    ability: float = Field(ge=-8, le=8)
    attempts: int = Field(default=0, ge=0)
    days_since_last: Optional[float] = Field(default=None, ge=0)     # days since this topic was last practised
    weight: float = Field(default=1.0, ge=0.0, le=5.0)               # exam weight; 1 = normal
    prerequisites: List[str] = []
    placed: bool = False             # this topic's ability came from the placement test: use it even with few answers


class StudyPlanRequest(BaseModel):
    topics: List[PlanTopic] = Field(min_length=1, max_length=300)
    minutes: int = Field(default=30, ge=5, le=240)                   # time the student has today
    seconds_per_question: float = Field(default=75.0, ge=10, le=600) # backend sends the student's own average
    exam_days: Optional[int] = Field(default=None, ge=0, le=365)     # days to the exam, if known


# ---------------- basic endpoints ----------------
@app.get("/health")
def health():
    return {"status": "ok", "model_version": MODEL_VERSION,
            "groq_configured": bool(os.getenv("GROQ_API_KEY")), "api_key_required": bool(API_KEY)}


@app.post("/reload-params", dependencies=[Depends(require_key)])
def reload_params():
    """After scripts/refit_elo.py writes new numbers, load them without restarting the service."""
    p = load_params()
    return {"reloaded": True, "model_version": MODEL_VERSION, "K": K, "Kd": KD, "bias": BIAS, "file": p}


@app.get("/model-info", dependencies=[Depends(require_key)])
def model_info():
    return {
        "method": "live Elo ratings (student ability vs question difficulty)",
        "model_version": MODEL_VERSION,
        "settings": {"K": K, "Kd": KD, "bias": BIAS, "label_difficulty": LABEL_DIFFICULTY,
                     "new_student_ability": NEW_STUDENT_ABILITY},
        "research_results_on_junyi_test_students": {
            "baseline": read_json("metrics/baseline.json"),
            "elo": read_json("metrics/elo.json"),
            "models": read_json("metrics/models.json"),
        },
    }


# ---------------- the brain ----------------
@app.post("/predict-success", dependencies=[Depends(require_key)])
def predict_success(req: PredictRequest):
    """For each candidate question: the chance this student solves it first try, without a hint."""
    return {"predictions": [
        {"question_id": c.question_id,
         "p_success": round(chance_of_success(req.ability, resolve_difficulty(c.difficulty, c.label)), 4)}
        for c in req.candidates]}


@app.post("/update-state", dependencies=[Depends(require_key)])
def update_state(req: UpdateRequest):
    """After an answer: move the student's ability and the question's difficulty.
    trust shrinks the step for suspicious sessions; k_multiplier speeds it up for the level test.
    score (0 to 1) is optional. Leave it out and the outcome is success = 1 or 0, exactly what the
    Junyi experiments tested. Only use score (e.g. 0.4 for correct-with-hint) after you have checked
    on your own data that it predicts later results better."""
    difficulty = resolve_difficulty(req.difficulty, req.label)
    p = chance_of_success(req.ability, difficulty)
    outcome = req.score if req.score is not None else (1.0 if req.success else 0.0)
    error = outcome - p                                  # surprise: big when the result was unexpected
    new_ability = req.ability + req.trust * req.k_multiplier * k_student(req.student_attempts) * error
    new_difficulty = difficulty
    if req.update_question:
        new_difficulty = difficulty - req.trust * k_question(req.question_attempts) * error
    clamp = lambda v: max(-6.0, min(6.0, v))
    return {"p_before": round(p, 4),
            "new_ability": round(clamp(new_ability), 4),
            "new_difficulty": round(clamp(new_difficulty), 4),
            "model_version": MODEL_VERSION}


def pick_probabilities(scored, target, explore):
    """Exact chance that each candidate is chosen by the rule in next_question().
    Stored with every exposure so the adaptive policy can be evaluated honestly later."""
    pool = sorted([x for x in scored if x["attempts"] < QUESTION_NEEDS_DATA_BELOW and 0.4 <= x["p_success"] <= 0.9],
                  key=lambda x: x["attempts"])[:5]
    p_explore = explore if pool else 0.0
    best = min(scored, key=lambda x: (x["score"], x["attempts"]))
    probs = {x["question_id"]: 0.0 for x in scored}
    for x in pool:
        probs[x["question_id"]] += p_explore / len(pool)
    probs[best["question_id"]] += 1.0 - p_explore
    return probs, {x["question_id"] for x in pool}


@app.post("/next-question", dependencies=[Depends(require_key)])
def next_question(req: NextQuestionRequest):
    """Pick the question whose chance of success is closest to the target (default 70%).
    Level test: coverage_penalty makes topics that were already asked look slightly worse, so the
    10 questions cover the subject instead of sitting in one topic."""
    rng = random.Random(req.seed)
    skip = set(req.exclude)
    scored = []
    for c in req.candidates:
        if c.question_id in skip:
            continue
        p = chance_of_success(req.ability, resolve_difficulty(c.difficulty, c.label))
        seen = int(req.topic_counts.get(c.topic, 0)) if c.topic else 0
        scored.append({"question_id": c.question_id, "p_success": round(p, 4), "attempts": c.question_attempts,
                       "score": abs(p - req.target) + req.coverage_penalty * seen})
    if not scored:
        raise HTTPException(status_code=400, detail="No candidate questions left after exclusions")

    probs, pool_ids = pick_probabilities(scored, req.target, req.explore)
    by_id = {x["question_id"]: x for x in scored}
    if pool_ids and rng.random() < req.explore:
        pool = sorted([by_id[i] for i in pool_ids], key=lambda x: (x["attempts"], x["question_id"]))
        pick = rng.choice(pool)
        reason = "explore"        # this question needs more answers to learn its difficulty
    else:
        pick = min(scored, key=lambda x: (x["score"], x["attempts"]))
        reason = "target"         # closest to the wanted chance of success
    ranked = sorted(scored, key=lambda x: x["score"])[:5]
    return {"question_id": pick["question_id"], "p_success": pick["p_success"], "reason": reason,
            "propensity": round(probs[pick["question_id"]], 6), "target": req.target,
            "model_version": MODEL_VERSION,
            "ranked": [{"question_id": r["question_id"], "p_success": r["p_success"]} for r in ranked]}


# ---------------- level test: answers -> level 1-10 ----------------
class LevelItem(BaseModel):
    subject: str = Field(max_length=100)
    topic: str = Field(max_length=100)
    success: bool                                                    # right, with no hint
    difficulty: Optional[float] = Field(default=None, ge=-8, le=8)   # the question's current rating, if known
    label: Optional[str] = None                                      # "easy"/"medium"/"hard" until it has a rating


class EstimateLevelRequest(BaseModel):
    items: List[LevelItem] = Field(min_length=3, max_length=60)


@app.post("/estimate-level", dependencies=[Depends(require_key)])
def estimate_level(req: EstimateLevelRequest):
    """Placement test result. Stateless: the backend sends every answer, we return the level,
    the per-subject and per-topic abilities (to seed SkillState) and how sure we are."""
    items = [{"subject": i.subject, "topic": i.topic, "success": i.success,
              "difficulty": resolve_difficulty(i.difficulty, i.label)} for i in req.items]
    return {"model_version": MODEL_VERSION, **level.estimate(items, BIAS)}


@app.post("/study-plan", dependencies=[Depends(require_key)])
def study_plan(req: StudyPlanRequest):
    """What does this student need NOW? Which subjects/topics, how many questions, why.
    Stateless: the backend sends every topic's ability, attempts and days since last practice."""
    topics = [t.model_dump() for t in req.topics]
    return {"model_version": MODEL_VERSION,
            **planner.make_plan(topics, bias=BIAS, minutes=req.minutes,
                                seconds_per_question=req.seconds_per_question, exam_days=req.exam_days)}


@app.post("/tutor/plan", dependencies=[Depends(require_key)])
def tutor_plan(req: PlanRequest):
    """Where is the student strong or weak? Uses the ability the backend stores per topic."""
    out = []
    for t in req.topics:
        p = chance_of_success(t.ability, 0.0)        # chance on a typical (medium) question of that topic
        if t.attempts < 3:
            status = "not enough data yet"
        elif p >= 0.8:
            status = "strong"
        elif p >= 0.6:
            status = "developing"
        else:
            status = "needs work"
        out.append({"topic": t.topic, "chance_on_typical_question": round(p, 3), "status": status, "attempts": t.attempts})
    out.sort(key=lambda x: x["chance_on_typical_question"])
    weak = [o["topic"] for o in out if o["status"] == "needs work"][:3]
    suggestion = (f"Practice next: {', '.join(weak)}." if weak
                  else "No weak topics found. Keep practising to unlock harder questions.")
    return {"topics": out, "suggestion": suggestion}


# ---------------- the voice (Groq AI) ----------------
def call_llm(prompt, system="You are a helpful tutor."):
    try:
        return ask_llm(prompt, system=system)
    except Exception as e:                         # never hide a failure behind a fake answer
        raise HTTPException(status_code=502, detail=f"AI tutor unavailable: {e}")


@app.post("/ai-explain", dependencies=[Depends(require_key)])
def ai_explain(data: dict):
    """Same request and response as the old service, so the frontend needs no change."""
    for key in ["question", "student_answer", "correct_answer", "topic"]:
        if key not in data:
            raise HTTPException(status_code=400, detail=f"Missing field: {key}")
    q, sa, ca, topic = (str(data[k])[:4000] for k in ["question", "student_answer", "correct_answer", "topic"])
    prompt = f"""
You are an expert tutor helping a student learn.

Question: {q}
Student Answer: {sa}
Correct Answer: {ca}
Topic: {topic}

Give a structured response in EXACT format:

1. First line:
- If correct -> "\u2705 Correct Answer"
- If wrong -> "\u274c Incorrect Answer"

2. Then: explain WHY the student's answer is correct or wrong
3. Then: explain the correct concept in simple and clear terms
4. Then: give a short real-world or exam-style example
5. Then: give a quick tip or memory trick (very short)
6. Finally: give a 1-line takeaway

Keep it simple, structured and student-friendly. No long paragraphs. Use bullet points where helpful.
"""
    return {"explanation": call_llm(prompt)}


HINT_STYLE = {
    1: "Give ONE short nudge: name the key idea or ask one guiding question. Show no steps.",
    2: "Give a more specific hint: outline the approach in 2-3 short steps, or rule out one wrong idea. Do not finish the problem.",
    3: "Walk through the reasoning up to, but NOT including, the final step, so the student finishes it themselves.",
}


@app.post("/tutor/hint", dependencies=[Depends(require_key)])
def tutor_hint(req: HintRequest):
    """A hint that guides without giving the answer. Level 1 is the gentlest, level 3 the most detailed."""
    level_note = ""
    if req.success_chance is not None and req.success_chance < 0.4:
        level_note = "This student will probably find the question hard: use very simple words and small steps."
    elif req.success_chance is not None and req.success_chance > 0.8:
        level_note = "This student is strong in this area: keep the hint brief."
    options = "\n".join(f"- {o}" for o in (req.options or []))
    reference = f"\nCorrect answer (for your reference ONLY, never reveal it): {req.correct_answer}" if req.correct_answer else ""
    system = ("You are a patient tutor. You help students think, you never hand over the answer. "
              "NEVER state the final answer and never say which option is correct. Keep it under 80 words.")
    prompt = (f"Topic: {req.topic}\nQuestion: {req.question}\n{('Options:' + chr(10) + options) if options else ''}{reference}\n\n"
              f"Hint level {req.hint_level} of 3. {HINT_STYLE[req.hint_level]} {level_note}")
    hint = call_llm(prompt, system)
    answer = (req.correct_answer or "").strip().lower()
    if len(answer) >= 4 and answer in hint.lower():           # guard: the hint leaked the answer
        hint = call_llm(prompt + "\n\nYour previous hint revealed the answer. Rewrite it WITHOUT the answer.", system)
        if answer in hint.lower():
            hint = f"Re-read the question and think about the key idea in {req.topic}. What does each option say about it?"
    return {"hint": hint, "hint_level": req.hint_level}


# ---------------- AI question maker (checked automatically) ----------------
class GenerateRequest(BaseModel):
    subject: str = Field(max_length=100)
    topic: str = Field(max_length=100)
    difficulty: str = "medium"
    count: int = Field(default=10, ge=1, le=20)


def parse_json_array(text):
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("no JSON array found")
    return json.loads(text[start:end + 1])


def question_is_valid(q):
    try:
        opts = q["options"]
        return (isinstance(q["questionText"], str) and len(q["questionText"].strip()) >= 10
                and isinstance(opts, list) and len(opts) == 4
                and all(isinstance(o, str) and o.strip() for o in opts)
                and len({o.strip().lower() for o in opts}) == 4
                and isinstance(q["correctAnswer"], int) and 0 <= q["correctAnswer"] <= 3
                and not any("all of the above" in o.lower() or "none of the above" in o.lower() for o in opts))
    except (KeyError, TypeError):
        return False


@app.post("/generate-questions", dependencies=[Depends(require_key)])
def generate_questions(req: GenerateRequest):
    diff = req.difficulty.strip().lower()           # was called `level`, which hid the imported `level` module
    if diff not in LABEL_DIFFICULTY:
        raise HTTPException(status_code=400, detail=f"difficulty must be one of {list(LABEL_DIFFICULTY)}")
    system = "You write accurate exam-quality multiple choice questions. Reply with a JSON array only, no other text."
    prompt = (f"Write {req.count} multiple choice questions.\nSubject: {req.subject}\nTopic: {req.topic}\n"
              f"Difficulty: {diff}\n\nEach item must be an object with exactly these keys:\n"
              '"questionText": string,\n"options": array of exactly 4 different strings,\n'
              '"correctAnswer": integer 0 to 3 (index of the one correct option),\n'
              '"hint": one short nudge that does NOT reveal the answer,\n'
              '"misconceptions": array of 4 strings; for each WRONG option the mistake that leads to it, and "" for the correct one.\n'
              "Exactly one option is correct. Do not use 'all of the above' or 'none of the above'.")
    raw = call_llm(prompt, system)
    try:
        items = parse_json_array(raw)
    except Exception:
        raise HTTPException(status_code=502, detail="AI did not return valid JSON; try again")

    good, rejected = [], {"bad_format": 0, "answer_mismatch": 0, "check_failed": 0}
    for q in items[: req.count]:
        if not isinstance(q, dict) or not question_is_valid(q):
            rejected["bad_format"] += 1
            continue
        order = list(range(4))
        random.shuffle(order)                       # stop the AI's favourite answer position leaking in
        options = [q["options"][i] for i in order]
        answer = order.index(q["correctAnswer"])
        listing = "\n".join(f"{i}. {o}" for i, o in enumerate(options))
        try:                                        # second, independent AI solve must agree with the key
            solved = call_llm(f"Question: {q['questionText']}\nOptions:\n{listing}\n\nWhich option is correct? "
                              "Reply with ONLY the option number (0, 1, 2 or 3).", "You are a careful, expert solver.")
            solved_idx = int(re.search(r"[0-3]", solved).group())
        except Exception:
            rejected["check_failed"] += 1
            continue
        if solved_idx != answer:
            rejected["answer_mismatch"] += 1
            continue
        miscon = q.get("misconceptions") if isinstance(q.get("misconceptions"), list) and len(q["misconceptions"]) == 4 else [""] * 4
        good.append({"subject": req.subject, "topic": req.topic, "difficulty": diff,
                     "questionText": q["questionText"].strip(), "options": options, "correctAnswer": answer,
                     "hint": str(q.get("hint", ""))[:300],
                     "misconceptions": [str(miscon[i])[:200] for i in order]})
    return {"questions": good, "rejected": rejected, "asked": req.count}