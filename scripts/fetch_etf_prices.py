import requests
import json
import time
from datetime import datetime

TICKERS = [
    "SGOV", "BIL", "SHV", "USFR", "BOXX",
    "SHY", "VGSH", "SCHO", "IEI", "IEF",
    "VGIT", "SCHR", "SPTI", "GOVT", "TLH",
    "TLT", "VGLT", "SPTL",
    "IBTG", "IBTH", "IBTI", "IBTJ", "IBTP"
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}

def fetch_price(ticker):
    """Fetch current price from Yahoo Finance — no CORS issues server-side"""
    try:
        url  = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=2d"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        print(f"  {ticker} status: {resp.status_code}")

        if resp.status_code != 200:
            # Try query2 as fallback
            url2  = f"https://query2.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=2d"
            resp2 = requests.get(url2, headers=HEADERS, timeout=15)
            print(f"  {ticker} query2 status: {resp2.status_code}")
            if resp2.status_code != 200:
                return None
            resp = resp2

        data   = resp.json()
        result = data.get("chart", {}).get("result", [{}])[0]
        meta   = result.get("meta", {})

        price  = meta.get("regularMarketPrice")
        if price:
            print(f"  {ticker} price: ${price:.2f}")
            return round(price, 2)

        # Fallback to last close in array
        closes      = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])
        valid_closes = [c for c in closes if c is not None]
        if valid_closes:
            price = round(valid_closes[-1], 2)
            print(f"  {ticker} price (from closes): ${price:.2f}")
            return price

        return None

    except Exception as e:
        print(f"  {ticker} error: {e}")
        return None


def main():
    now = datetime.utcnow()
    print(f"Starting ETF price fetch at {now.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"Fetching {len(TICKERS)} tickers...\n")

    prices = {}

    for ticker in TICKERS:
        price = fetch_price(ticker)
        prices[ticker] = price if price else "N/A"
        time.sleep(0.5)  # small delay between requests

    # Summary
    found     = sum(1 for v in prices.values() if v != "N/A")
    not_found = sum(1 for v in prices.values() if v == "N/A")
    print(f"\n{'='*50}")
    print(f"Results: {found} found, {not_found} N/A")
    print(f"{'='*50}")
    print(json.dumps(prices, indent=2))

    output = {
        "updated": now.strftime("%Y-%m-%d %H:%M UTC"),
        "market_open": is_market_open(now),
        "prices": prices
    }

    with open("data/etf_prices.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved to data/etf_prices.json")


def is_market_open(now):
    """Rough check if US market is open"""
    # Market hours: Mon-Fri 9:30am - 4:00pm ET (UTC-4 or UTC-5)
    weekday = now.weekday()  # 0=Monday, 6=Sunday
    if weekday >= 5:         # Weekend
        return False
    hour   = now.hour
    minute = now.minute
    # Approximate ET offset (UTC-4 during EDT)
    et_hour = (hour - 4) % 24
    et_min  = minute
    if et_hour < 9 or (et_hour == 9 and et_min < 30):
        return False
    if et_hour >= 16:
        return False
    return True


if __name__ == "__main__":
    main()
