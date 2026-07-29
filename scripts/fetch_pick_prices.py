"""
Fetch prices and daily changes for Q2 and Tactical picks.
Runs every 15 minutes during market hours via GitHub Action.
To update picks, just edit the Q2_PICKS and TACTICAL_PICKS lists below.
"""

import requests
import json
import time
from datetime import datetime

# ==================== PICKS CONFIGURATION ====================
# Edit these lists when picks change each quarter / rotation

Q2_PICKS = [
    "ALB", "SPG", "ETR", "COST",
    "CEG", "ARE","IFF",
    "CTAS", "PLTR", "PSX",
    "LITE", "ECHO", "SNDK", "WBD",
    "GRMN", "BR"
]

TACTICAL_PICKS = [
    "NFLX", "SNDK", "ECHO", "FCX",
    "GS", "WDC", "BN", "URA",
    "APO", "COPX", "EWY", "SMH"
]

# =============================================================

ALL_PICKS = list(set(Q2_PICKS + TACTICAL_PICKS))  # deduplicate

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}


def fetch_price_and_change(ticker):
    """Fetch current price and day change from Yahoo Finance"""
    for endpoint in ["query1", "query2"]:
        try:
            url  = f"https://{endpoint}.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=2d"
            resp = requests.get(url, headers=HEADERS, timeout=15)

            if resp.status_code != 200:
                print(f"  {ticker} {endpoint} status: {resp.status_code}")
                continue

            data   = resp.json()
            result = data.get("chart", {}).get("result", [{}])[0]
            meta   = result.get("meta", {})
            closes = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])
            valid  = [c for c in closes if c is not None and str(c) != "nan"]

            # Current price
            price = meta.get("regularMarketPrice") or (valid[-1] if valid else None)
            if not price:
                continue

            # Previous close — with 2d range valid[0] is yesterday's close
            prev = valid[0] if len(valid) >= 2 else meta.get("chartPreviousClose")
            if not prev:
                continue

            change     = round(price - prev, 4)
            change_pct = round((change / prev) * 100, 4)

            print(f"  {ticker}: ${price:.2f} ({'+' if change >= 0 else ''}{change:.2f}, {'+' if change_pct >= 0 else ''}{change_pct:.2f}%)")
            return {
                "price":      round(price, 2),
                "prev":       round(prev, 2),
                "change":     change,
                "changePct":  change_pct,
                "isPositive": change >= 0
            }

        except Exception as e:
            print(f"  {ticker} {endpoint} error: {e}")
            continue

    return None


def is_market_open():
    """Check if US market is currently open (approximate)"""
    now     = datetime.utcnow()
    weekday = now.weekday()  # 0=Monday 6=Sunday
    if weekday >= 5:
        return False
    # EDT = UTC-4, EST = UTC-5 — use UTC-4 as approximate
    et_hour   = (now.hour - 4) % 24
    et_minute = now.minute
    if et_hour < 9 or (et_hour == 9 and et_minute < 30):
        return False
    if et_hour >= 16:
        return False
    return True


def main():
    now = datetime.utcnow()
    print(f"Fetching pick prices at {now.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"Market open: {is_market_open()}")
    print(f"Q2 picks ({len(Q2_PICKS)}): {Q2_PICKS}")
    print(f"Tactical picks ({len(TACTICAL_PICKS)}): {TACTICAL_PICKS}")
    print(f"Total unique tickers: {len(ALL_PICKS)}\n")

    results = {}

    for ticker in ALL_PICKS:
        print(f"Fetching {ticker}...")
        data = fetch_price_and_change(ticker)
        results[ticker] = data if data else {
            "price": None, "prev": None,
            "change": None, "changePct": None, "isPositive": None
        }
        time.sleep(0.3)

    # Build output
    output = {
        "updated":      now.strftime("%Y-%m-%d %H:%M UTC"),
        "marketOpen":   is_market_open(),
        "q2Picks":      Q2_PICKS,
        "tacticalPicks": TACTICAL_PICKS,
        "prices":       results
    }

    # Summary
    found     = sum(1 for v in results.values() if v.get("price") is not None)
    not_found = len(results) - found
    print(f"\n{'='*50}")
    print(f"Results: {found} found, {not_found} failed")
    print(f"{'='*50}")

    with open("data/pick_prices.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved to data/pick_prices.json")


if __name__ == "__main__":
    main()
