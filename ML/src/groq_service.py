import os
import requests
from dotenv import load_dotenv

load_dotenv()  # reads GROQ_API_KEY from the .env file in your ML folder

API_KEY = os.getenv("GROQ_API_KEY")
# Model name is configurable, so you can change it in .env without touching code.
MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
BASE = "https://api.groq.com/openai/v1"


def ask_llm(prompt, system="You are a helpful tutor."):
    if not API_KEY:
        raise RuntimeError("GROQ_API_KEY is missing. Put it in the .env file.")
    res = requests.post(
        f"{BASE}/chat/completions",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={
            "model": MODEL,
            "temperature": 0.5,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=30,
    )
    if res.status_code != 200:
        # Raise an error instead of returning the error text as if it were an answer.
        raise RuntimeError(f"Groq error {res.status_code}: {res.text}")
    return res.json()["choices"][0]["message"]["content"]


def list_models():
    """Returns the model names your key can use. Handy when a model gets retired."""
    res = requests.get(f"{BASE}/models", headers={"Authorization": f"Bearer {API_KEY}"}, timeout=30)
    res.raise_for_status()
    return sorted(m["id"] for m in res.json()["data"])


if __name__ == "__main__":
    print("Using model:", MODEL)
    print(ask_llm("Explain in one sentence what binary search does."))