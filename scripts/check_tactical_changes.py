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
    "HPE", "DELL", "DECK", "RCL", "ULTA",
    "ECHO", "SNDK", "STX", "ALB", "CPAY",
    "VPL", "EIS", "ETHE", "TMV"
]

CURRENT_WEIGHTS = {
    "HPE":  7.14,
    "DELL": 7.14,
    "DECK": 7.14,
    "RCL":  7.14,
    "ULTA": 7.14,
    "ECHO": 7.14,
    "SNDK": 7.14,
    "STX":  7.14,
    "ALB":  7.14,
    "CPAY": 7.14,
    "VPL":  7.14,
    "EIS":  7.14,
    "ETHE": 7.14,
    "TMV":  7.18,
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
