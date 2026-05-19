"""
Process email subscribers from Web3Forms email export document.
Reads data/Email_for_CiS.docx, extracts emails and dates,
adds any new ones to data/subscribers.json without duplicates.

Run daily in the evening via GitHub Action.
"""

import json
import os
import re
import sys
from datetime import datetime, timezone

try:
    from docx import Document
except ImportError:
    print("Installing python-docx...")
    os.system("pip install python-docx --break-system-packages -q")
    from docx import Document

# ==================== FILE PATHS ====================
DOCX_FILE        = "data/Email_for_CiS.docx"
SUBSCRIBERS_FILE = "data/subscribers.json"


# ==================== VALIDATE EMAIL ====================
def is_valid_email(email):
    pattern = r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email.strip().lower()))


# ==================== PARSE DOCX ====================
def parse_docx(filepath):
    """
    Parse the Web3Forms email export docx.
    Format is:
      Email
      someone@example.com
      Message
      New subscriber: someone@example.com
      Source: Portfolio Alerts Form
      Date: 2026-05-17T16:55:17.481Z
    """
    if not os.path.exists(filepath):
        print(f"ERROR: Document not found: {filepath}")
        return []

    doc     = Document(filepath)
    paras   = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    entries = []

    i = 0
    while i < len(paras):
        # Look for "Email" header
        if paras[i].lower() == "email" and i + 1 < len(paras):
            email = paras[i + 1].strip().lower()

            # Extract date from the Message paragraph if available
            date_str = None
            if i + 3 < len(paras) and paras[i + 2].lower() == "message":
                message_text = paras[i + 3]
                # Look for Date: line within message
                date_match = re.search(r'Date:\s*(\S+)', message_text)
                if date_match:
                    raw_date = date_match.group(1).strip()
                    try:
                        # Parse ISO format date from Web3Forms
                        dt = datetime.fromisoformat(
                            raw_date.replace("Z", "+00:00")
                        )
                        date_str = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                    except Exception:
                        date_str = None

            if is_valid_email(email):
                entries.append({
                    "email":    email,
                    "date_str": date_str
                })
                print(f"  Found: {email} (subscribed: {date_str or 'unknown'})")
            else:
                print(f"  Skipping invalid email: {email}")

            i += 4  # skip Email + email + Message + message_text
        else:
            i += 1

    return entries


# ==================== LOAD SUBSCRIBERS ====================
def load_subscribers():
    if not os.path.exists(SUBSCRIBERS_FILE):
        print(f"No subscribers file found — will create: {SUBSCRIBERS_FILE}")
        return {"description": "Email subscribers for portfolio change notifications.", "subscribers": []}

    try:
        with open(SUBSCRIBERS_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"ERROR loading subscribers: {e}")
        sys.exit(1)


# ==================== SAVE SUBSCRIBERS ====================
def save_subscribers(data):
    os.makedirs("data", exist_ok=True)
    with open(SUBSCRIBERS_FILE, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Saved to {SUBSCRIBERS_FILE}")


# ==================== MAIN ====================
def main():
    now = datetime.now(timezone.utc)
    print(f"\n{'='*50}")
    print(f"Processing email subscribers at {now.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'='*50}\n")

    # Parse docx
    print(f"Reading: {DOCX_FILE}")
    found_entries = parse_docx(DOCX_FILE)
    print(f"\nFound {len(found_entries)} email(s) in document\n")

    if not found_entries:
        print("No emails found in document — nothing to add")
        return

    # Load existing subscribers
    data        = load_subscribers()
    subscribers = data.get("subscribers", [])

    # Build set of existing emails for fast duplicate check
    existing_emails = {
        s.get("email", "").strip().lower()
        for s in subscribers
    }

    added   = 0
    skipped = 0

    for entry in found_entries:
        email    = entry["email"]
        date_str = entry["date_str"]

        if email in existing_emails:
            print(f"  SKIP (duplicate): {email}")
            skipped += 1
            continue

        # Use the date from the document if available
        # otherwise use current time
        subscribed_at = date_str or now.strftime("%Y-%m-%dT%H:%M:%SZ")

        new_subscriber = {
            "email":          email,
            "subscribedAt":   subscribed_at,
            "active":         True,
            "notifications":  {
                "tactical": True,
                "q2":       True
            }
        }

        subscribers.append(new_subscriber)
        existing_emails.add(email)
        added += 1
        print(f"  ADDED: {email} (subscribed: {subscribed_at})")

    # Save updated list
    data["subscribers"] = subscribers
    save_subscribers(data)

    print(f"\n{'='*50}")
    print(f"Results: {added} added, {skipped} duplicates skipped")
    print(f"Total subscribers: {len(subscribers)}")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
