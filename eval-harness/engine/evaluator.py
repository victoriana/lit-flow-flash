import json
import sys
from pathlib import Path

try:
    import numpy as np
except ImportError:
    sys.stderr.write("numpy missing: pip install -r engine/requirements.txt\n")
    raise SystemExit(2)

THRESHOLD = 0.6


def lexical_density(text: str) -> float:
    tokens = [t for t in text.lower().split() if t.strip('.,!?;:"\'')]
    if not tokens:
        return 0.0
    long_tokens = sum(1 for t in tokens if len(t) > 3)
    return long_tokens / len(tokens)


def evaluate(path: Path) -> int:
    payload = json.loads(path.read_text(encoding="utf-8"))
    records = payload["records"]
    densities = np.array([lexical_density(r["text"]) for r in records])

    for record, density in zip(records, densities):
        status = "ok" if density >= THRESHOLD else "LOW"
        print(f"{record['id']}: density={density:.3f} {status}")

    mean = float(densities.mean()) if len(densities) else 0.0
    below = int(np.sum(densities < THRESHOLD))
    print(f"mean_density={mean:.3f} records={len(records)} below_threshold={below}")
    # Always return 0 (success) and let the caller interpret the output.
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.stderr.write("usage: evaluator.py <gold_standard.json>\n")
        raise SystemExit(64)
    raise SystemExit(evaluate(Path(sys.argv[1])))
