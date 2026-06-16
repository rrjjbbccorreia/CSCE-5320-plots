"""
Daily checker for tactical portfolio changes.
Compares current picks/weights to last entry in tactical_history.json.
If changed, appends new entry and sets output flag for email notification.
Run this script from the repo root.

To update picks or weights — edit CURRENT_PICKS and CURRENT_WEIGHTS below.
"""

import json
import os
import sys
from datetime import datetime, timezone

# ==================== CURRENT TACTICAL PORTFOLIO ====================
# Edit these when the tactical portfolio changes

CURRENT_PICKS = [
    "GLW", "STX", "DASH", "ALB", "SMCI",
    "COHR", "CVNA", "CEG", "LITE", "WSM",
    "SEB", "CIBR", "XLE", "XLK", "XLI", "BX"
]

CURRENT_WEIGHTS = {
    "GLW":  6.44,
    "STX": 5.0,
    "DASH": 536,
    "ALB":  6.0,
    "SMCI":   5.03,
    "COHR":  5.32,
    "CVNA": 5.02,
    "CEG":  5.75,
    "LITE":  5.54,
    "WSM": 5.05,
    "SEB":  9.28,
    "CIBR":  5.7,
    "XLE":  8.27,
    "XLK": 5.2,
    "XLI":   7.54,
    "BX":  9.5,
}

# ====================================================================

HISTORY_FILE = "data/tactical_history.json"


def load_history():
    try:
        with open(HISTORY_FILE, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"History file not found — creating new: {HISTORY_FILE}")
        return {"description": "Tactical portfolio history", "history": []}
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
    last_picks   = sorted(last_entry.get("picks", []))
    current_sorted = sorted(CURRENT_PICKS)

    # Check if picks list changed
    if last_picks != current_sorted:
        return True, "picks list changed"

    # Check if weights changed
    last_weights = last_entry.get("weights", {})
    for ticker in CURRENT_PICKS:
        last_w    = round(float(last_weights.get(ticker, 0)), 4)
        current_w = round(float(CURRENT_WEIGHTS.get(ticker, 0)), 4)
        if last_w != current_w:
            return True, f"weight changed for {ticker}: {last_w} → {current_w}"

    return False, "no change"


def main():
    print(f"Checking tactical portfolio at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"Current picks ({len(CURRENT_PICKS)}): {CURRENT_PICKS}")

    history = load_history()
    entries = history.get("history", [])

    if not entries:
        print("No history found — creating first entry")
        changed     = True
        change_reason = "initial entry"
    else:
        last_entry    = entries[-1]
        changed, change_reason = picks_changed(last_entry)
        print(f"Last entry date: {last_entry.get('date')}")
        print(f"Change detected: {changed} ({change_reason})")

    if changed:
        today = datetime.now(timezone.utc)
        new_entry = {
            "date":    today.strftime("%Y-%m-%d"),
            "addedAt": today.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "picks":   CURRENT_PICKS,
            "weights": CURRENT_WEIGHTS,
            "note":    change_reason
        }

        entries.append(new_entry)
        history["history"] = entries
        save_history(history)

        print(f"✅ New entry added for {new_entry['date']}")

        # Write change flag for GitHub Actions
        # This tells the notification workflow to send emails
        with open("data/tactical_changed.flag", "w") as f:
            f.write(f"changed:{today.strftime('%Y-%m-%d')}\n")
            f.write(f"reason:{change_reason}\n")
            f.write(f"picks:{','.join(CURRENT_PICKS)}\n")

        print("📧 Change flag written — email notification will be triggered")

        # Set GitHub Actions output
        github_output = os.environ.get("GITHUB_OUTPUT")
        if github_output:
            with open(github_output, "a") as f:
                f.write("portfolio_changed=true\n")
                f.write(f"change_date={today.strftime('%Y-%m-%d')}\n")
        
        sys.exit(0)

    else:
        print("✓ No changes detected — history unchanged")

        # Clear change flag if it exists
        flag_file = "data/tactical_changed.flag"
        if os.path.exists(flag_file):
            os.remove(flag_file)

        # Set GitHub Actions output
        github_output = os.environ.get("GITHUB_OUTPUT")
        if github_output:
            with open(github_output, "a") as f:
                f.write("portfolio_changed=false\n")

        sys.exit(0)


if __name__ == "__main__":
    main()
