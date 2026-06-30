"""
Daily checker for Q2 Fundamental portfolio changes.
Compares current picks/weights to last entry in q2_history.json.
If changed, appends new entry and sets output flag for email notification.
Run this script from the repo root.

To update picks or weights — edit CURRENT_PICKS and CURRENT_WEIGHTS below.
"""

import json
import os
import sys
from datetime import datetime, timezone

# ==================== CURRENT Q2 PORTFOLIO ====================
# Edit these when the Q2 portfolio changes each quarter

CURRENT_PICKS = [
    "ALB", "SPG", "ETR", "COST",
    "CEG", "ARE","IFF",
    "CTAS", "PLTR", "PSX",
    "LITE", "ECHO", "SNDK", "WBD",
    "GRMN", "BR"
]

CURRENT_WEIGHTS = {
    "ALB":  6.25,
    "SPG":  6.25,
    "ETR":  6.25,
    "COST": 6.25,
    "CEG":  6.25,
    "ARE":  6.25,
    "IFF":  6.25,
    "CTAS": 6.25,
    "PLTR": 6.25,
    "PSX":  6.25,
    "LITE": 6.25,
    "ECHO": 6.25,
    "SNDK": 6.25,
    "WBD":  6.25,
    "GRMN": 6.25,
    "BR":   6.25,
}

# Entry date for this quarter's picks
ENTRY_DATE = "2026-06-30"

# ==============================================================

HISTORY_FILE = "data/q2_history.json"


def load_history():
    try:
        with open(HISTORY_FILE, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"History file not found — creating new: {HISTORY_FILE}")
        return {
            "description": "Historical log of Q2 Fundamental portfolio changes.",
            "history": []
        }
    except Exception as e:
        print(f"Error loading history: {e}")
        sys.exit(1)


def save_history(data):
    os.makedirs("data", exist_ok=True)
    with open(HISTORY_FILE, "w") as f:
        json.dump(data, f, indent=2)
    print(f"History saved to {HISTORY_FILE}")


def picks_changed(last_entry):
    """Compare current picks and weights to last history entry"""
    last_picks     = sorted(last_entry.get("picks", []))
    current_sorted = sorted(CURRENT_PICKS)

    if last_picks != current_sorted:
        return True, "picks list changed"

    last_weights = last_entry.get("weights", {})
    for ticker in CURRENT_PICKS:
        last_w    = round(float(last_weights.get(ticker, 0)), 4)
        current_w = round(float(CURRENT_WEIGHTS.get(ticker, 0)), 4)
        if last_w != current_w:
            return True, f"weight changed for {ticker}: {last_w} → {current_w}"

    last_entry_date = last_entry.get("entryDate", "")
    if last_entry_date != ENTRY_DATE:
        return True, f"entry date changed: {last_entry_date} → {ENTRY_DATE}"

    return False, "no change"


def main():
    now = datetime.now(timezone.utc)
    print(f"Checking Q2 portfolio at {now.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"Current picks ({len(CURRENT_PICKS)}): {CURRENT_PICKS}")
    print(f"Entry date: {ENTRY_DATE}")

    history = load_history()
    entries = history.get("history", [])

    if not entries:
        print("No history found — creating first entry")
        changed       = True
        change_reason = "initial entry"
    else:
        last_entry    = entries[-1]
        changed, change_reason = picks_changed(last_entry)
        print(f"Last entry date: {last_entry.get('date')}")
        print(f"Change detected: {changed} ({change_reason})")

    if changed:
        new_entry = {
            "date":      now.strftime("%Y-%m-%d"),
            "addedAt":   now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "entryDate": ENTRY_DATE,
            "picks":     CURRENT_PICKS,
            "weights":   CURRENT_WEIGHTS,
            "note":      change_reason
        }

        entries.append(new_entry)
        history["history"] = entries
        save_history(history)

        print(f"✅ New Q2 entry added for {new_entry['date']}")

        # Write change flag
        with open("data/q2_changed.flag", "w") as f:
            f.write(f"changed:{now.strftime('%Y-%m-%d')}\n")
            f.write(f"reason:{change_reason}\n")
            f.write(f"entryDate:{ENTRY_DATE}\n")
            f.write(f"picks:{','.join(CURRENT_PICKS)}\n")

        print("📧 Q2 change flag written — email notification will be triggered")

        # Set GitHub Actions output
        github_output = os.environ.get("GITHUB_OUTPUT")
        if github_output:
            with open(github_output, "a") as f:
                f.write("portfolio_changed=true\n")
                f.write(f"change_date={now.strftime('%Y-%m-%d')}\n")

        sys.exit(0)

    else:
        print("✓ No Q2 changes detected — history unchanged")

        flag_file = "data/q2_changed.flag"
        if os.path.exists(flag_file):
            os.remove(flag_file)

        github_output = os.environ.get("GITHUB_OUTPUT")
        if github_output:
            with open(github_output, "a") as f:
                f.write("portfolio_changed=false\n")

        sys.exit(0)


if __name__ == "__main__":
    main()
