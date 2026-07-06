"""
Sends Fundamental portfolio change notification emails to all subscribers.
Uses SendGrid API — requires SENDGRID_API_KEY and SENDGRID_FROM_EMAIL env vars.
Run only when Q2 portfolio has changed.
"""

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

SUBSCRIBERS_FILE = "data/subscribers.json"
HISTORY_FILE     = "data/q2_history.json"
SITE_URL         = "https://www.correiainvestmentsolutions.com"


def load_subscribers():
    try:
        with open(SUBSCRIBERS_FILE, "r") as f:
            data = json.load(f)

        # Filter for subscribers who want Q2 notifications
        # Supports both generic subscribers and q2-specific ones
        subscribers = data.get("subscribers", [])
        active = [
            s for s in subscribers
            if s.get("active", True) and (
                s.get("notifications", {}).get("q2", True) or
                "notifications" not in s  # legacy — notify all
            )
        ]

        print(f"Loaded {len(active)} active Q2 subscribers")
        return active

    except FileNotFoundError:
        print("No subscribers file found")
        return []
    except Exception as e:
        print(f"Error loading subscribers: {e}")
        return []


def load_latest_portfolio():
    try:
        with open(HISTORY_FILE, "r") as f:
            data = json.load(f)
        history = data.get("history", [])
        if not history:
            return None
        return history[-1]
    except Exception as e:
        print(f"Error loading Q2 history: {e}")
        return None


def send_email_sendgrid(to_email, from_email, api_key, portfolio):
    """Send Q2 notification email via SendGrid"""

    picks      = portfolio.get("picks", [])
    weights    = portfolio.get("weights", {})
    date       = portfolio.get("date", datetime.now().strftime("%Y-%m-%d"))
    entry_date = portfolio.get("entryDate", "")

    # Build picks table for plain text
    picks_table = "\n".join([
        f"  • {ticker}: {weights.get(ticker, 0):.1f}%"
        for ticker in picks
    ])

    subject = "Q Fundamental Portfolio Update — Correia Investment Solutions"

    body_text = f"""Dear Investor,

The Fundamental Analysis portfolio has been updated as of {date}.
Entry date for this quarter's picks: {entry_date}

NEW PORTFOLIO ALLOCATION:
{picks_table}

These picks have been evaluated across all key financial metrics and are
intended to be held throughout the quarter. Each selection reflects a
high-conviction opportunity identified through the model's rigorous
quantitative screening process.

View the full analysis and updated charts at:
{SITE_URL}#section-fundamental

---
Correia Investment Solutions provides financial education, research tools,
and model-driven analysis. Investing involves risk, including possible loss
of principal. Past performance does not guarantee future results.

To unsubscribe, reply with "unsubscribe" in the subject line.
"""

    body_html = f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; background: #f4f4f4;
             margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff;
              border-radius: 12px; overflow: hidden;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: #0d1a2e; padding: 28px 32px; text-align: center;">
      <h1 style="color: #00b4d8; font-size: 22px; margin: 0; letter-spacing: 0.5px;">
        Correia Investment Solutions
      </h1>
      <p style="color: #6080a0; font-size: 13px; margin: 6px 0 0 0;">
        Q Fundamental Portfolio Update
      </p>
    </div>

    <!-- Body -->
    <div style="padding: 32px;">
      <p style="color: #333; font-size: 15px; line-height: 1.6; margin-top: 0;">
        Dear Investor,
      </p>
      <p style="color: #333; font-size: 15px; line-height: 1.6;">
        The <strong>Q Fundamental Analysis portfolio</strong> has been updated
        as of <strong>{date}</strong>.
      </p>

      <!-- Entry Date Badge -->
      <div style="background: #f0f7ff; border: 1px solid #bee3f8; border-radius: 8px;
                  padding: 12px 16px; margin: 16px 0; display: inline-block;">
        <span style="color: #2b6cb0; font-size: 13px; font-weight: 600;">
          📅 Entry Date: {entry_date}
        </span>
      </div>

      <!-- Portfolio Table -->
      <div style="background: #f8f9fa; border-radius: 10px;
                  padding: 20px; margin: 24px 0;">
        <h3 style="color: #0d1a2e; font-size: 14px; text-transform: uppercase;
                   letter-spacing: 1px; margin: 0 0 16px 0;">
          Q Portfolio Allocation
        </h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #0d1a2e;">
              <th style="padding: 10px 14px; text-align: left; color: #00b4d8;
                         font-size: 12px; text-transform: uppercase;
                         letter-spacing: 0.5px;">
                Ticker
              </th>
              <th style="padding: 10px 14px; text-align: right; color: #00b4d8;
                         font-size: 12px; text-transform: uppercase;
                         letter-spacing: 0.5px;">
                Allocation
              </th>
            </tr>
          </thead>
          <tbody>
            {"".join([
              f'''<tr style="border-bottom: 1px solid #e9ecef;">
                <td style="padding: 10px 14px; color: #333; font-weight: 600;
                           font-family: monospace; font-size: 14px;">
                  {ticker}
                </td>
                <td style="padding: 10px 14px; color: #333; text-align: right;">
                  {weights.get(ticker, 0):.1f}%
                </td>
              </tr>'''
              for ticker in picks
            ])}
          </tbody>
        </table>
      </div>

      <!-- Description -->
      <p style="color: #555; font-size: 14px; line-height: 1.7;
                background: #f8f9fa; border-left: 3px solid #00b4d8;
                padding: 12px 16px; border-radius: 0 8px 8px 0;">
        These picks have been evaluated across all key financial metrics and are
        intended to be held throughout the quarter. Each selection reflects a
        high-conviction opportunity identified through the model's rigorous
        quantitative screening process.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 28px 0;">
        <a href="{SITE_URL}#section-fundamental"
           style="display: inline-block; padding: 14px 32px;
                  background: linear-gradient(135deg, #f0a500, #c47f00);
                  color: white; text-decoration: none; border-radius: 8px;
                  font-size: 15px; font-weight: 600; letter-spacing: 0.3px;">
          View Full Q Analysis →
        </a>
      </div>

      <p style="color: #666; font-size: 13px; line-height: 1.6;">
        These picks rotate approximately every 3 to 5 months based on deep
        quantitative analysis of company fundamentals.
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #f1f3f5; padding: 20px 32px;
                border-top: 1px solid #dee2e6;">
      <p style="color: #999; font-size: 11px; line-height: 1.6; margin: 0;">
        Correia Investment Solutions provides financial education, research tools,
        and model-driven analysis. Investing involves risk, including possible loss
        of principal. Past performance does not guarantee future results.<br><br>
        To unsubscribe, reply with "unsubscribe" in the subject line.
      </p>
    </div>

  </div>
</body>
</html>
"""

    payload = json.dumps({
        "personalizations": [{"to": [{"email": to_email}]}],
        "from":    {"email": from_email, "name": "Correia Investment Solutions"},
        "subject": subject,
        "content": [
            {"type": "text/plain", "value": body_text},
            {"type": "text/html",  "value": body_html}
        ]
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.sendgrid.com/v3/mail/send",
        data    = payload,
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json"
        },
        method = "POST"
    )

    try:
        with urllib.request.urlopen(req) as response:
            if response.status == 202:
                return True
            print(f"SendGrid returned status {response.status}")
            return False
    except urllib.error.HTTPError as e:
        print(f"SendGrid error {e.code}: {e.read().decode()}")
        return False


def main():
    api_key    = os.environ.get("SENDGRID_API_KEY")
    from_email = os.environ.get("SENDGRID_FROM_EMAIL")

    if not api_key:
        print("ERROR: SENDGRID_API_KEY not set")
        sys.exit(1)

    if not from_email:
        print("ERROR: SENDGRID_FROM_EMAIL not set")
        sys.exit(1)

    subscribers = load_subscribers()
    if not subscribers:
        print("No active subscribers — nothing to send")
        sys.exit(0)

    portfolio = load_latest_portfolio()
    if not portfolio:
        print("No portfolio data found — cannot send")
        sys.exit(1)

    print(f"\nSending update to {len(subscribers)} subscribers...")
    print(f"Portfolio date: {portfolio.get('date')}")
    print(f"Entry date: {portfolio.get('entryDate')}")
    print(f"Picks: {portfolio.get('picks')}\n")

    sent   = 0
    failed = 0

    for subscriber in subscribers:
        email = subscriber.get("email")
        if not email:
            continue

        print(f"Sending to {email}...")
        success = send_email_sendgrid(email, from_email, api_key, portfolio)

        if success:
            print(f"  ✅ Sent to {email}")
            sent += 1
        else:
            print(f"  ❌ Failed for {email}")
            failed += 1

    print(f"\n{'='*40}")
    print(f"Results: {sent} sent, {failed} failed")
    print(f"{'='*40}")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
