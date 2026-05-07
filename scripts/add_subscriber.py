"""
Adds a new email subscriber to data/subscribers.json.
Called by GitHub Action when a new signup is submitted.
Validates email format before adding.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

SUBSCRIBERS_FILE = "data/subscribers.json"


def is_valid_email(email):
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email.strip().lower()))


def load_subscribers():
    try:
        with open(SUBSCRIBERS_FILE, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"description": "Email subscribers for tactical portfolio notifications.", "subscribers": []}
    except Exception as e:
        print(f"Error loading subscribers: {e}")
        sys.exit(1)


def save_subscribers(data):
    os.makedirs("data", exist_ok=True)
    with open(SUBSCRIBERS_FILE, "w") as f:
        json.dump(data, f, indent=2)


def main():
    email = os.environ.get("NEW_SUBSCRIBER_EMAIL", "").strip().lower()

    if not email:
        print("ERROR: NEW_SUBSCRIBER_EMAIL not set")
        sys.exit(1)

    if not is_valid_email(email):
        print(f"ERROR: Invalid email format: {email}")
        sys.exit(1)

    data        = load_subscribers()
    subscribers = data.get("subscribers", [])

    # Check for duplicate
    existing = [s for s in subscribers if s.get("email", "").lower() == email]
    if existing:
        print(f"Email already subscribed: {email}")
        sys.exit(0)

    # Add new subscriber
    now = datetime.now(timezone.utc)
    subscribers.append({
        "email":       email,
        "subscribedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "active":      True
    })

    data["subscribers"] = subscribers
    save_subscribers(data)

    print(f"✅ Added subscriber: {email}")
    print(f"Total subscribers: {len(subscribers)}")


if __name__ == "__main__":
    main()
