import requests
import json
import re
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
    "Accept": "application/json,text/html,application/xhtml+xml,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

def fetch_yahoo_summary(ticker):
    """Fetch yield from Yahoo Finance quoteSummary API"""
    try:
        url = f"https://query2.finance.yahoo.com/v11/finance/quoteSummary/{ticker}?modules=summaryDetail,defaultKeyStatistics,price"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        print(f"  Yahoo summary status: {resp.status_code}")

        if resp.status_code != 200:
            return None

        data   = resp.json()
        result = data.get("quoteSummary", {}).get("result", [{}])[0]
        sd     = result.get("summaryDetail", {})
        ks     = result.get("defaultKeyStatistics", {})
        pr     = result.get("price", {})

        print(f"  summaryDetail keys: {list(sd.keys())[:10]}")

        # Try all possible yield fields
        candidates = [
            sd.get("yield", {}).get("raw"),
            sd.get("dividendYield", {}).get("raw"),
            ks.get("yield", {}).get("raw"),
            pr.get("dividendYield", {}).get("raw"),
        ]

        for val in candidates:
            if val and val > 0:
                return f"{val * 100:.2f}%"

        return None

    except Exception as e:
        print(f"  Yahoo summary error: {e}")
        return None


def fetch_yahoo_chart(ticker):
    """Fetch yield from Yahoo Finance chart API using trailing dividend data"""
    try:
        url  = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1y&events=dividends"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        print(f"  Yahoo chart status: {resp.status_code}")

        if resp.status_code != 200:
            return None

        data   = resp.json()
        result = data.get("chart", {}).get("result", [{}])[0]
        meta   = result.get("meta", {})

        print(f"  Meta keys: {list(meta.keys())[:15]}")

        # Try meta yield fields
        ty = meta.get("trailingAnnualDividendYield")
        tr = meta.get("trailingAnnualDividendRate")
        px = meta.get("regularMarketPrice")

        if ty and ty > 0:
            return f"{ty * 100:.2f}%"

        if tr and px and px > 0:
            return f"{(tr / px) * 100:.2f}%"

        # Calculate from dividend events
        divs = result.get("events", {}).get("dividends", {})
        if divs and px:
            now       = datetime.utcnow().timestamp()
            one_year  = now - 365 * 24 * 3600
            total_div = sum(
                d["amount"] for d in divs.values()
                if d.get("date", 0) >= one_year
            )
            if total_div > 0:
                return f"{(total_div / px) * 100:.2f}%"

        return None

    except Exception as e:
        print(f"  Yahoo chart error: {e}")
        return None


def fetch_etf_com(ticker):
    """Scrape yield from ETF.com"""
    try:
        url  = f"https://www.etf.com/{ticker}"
        resp = requests.get(url, headers={
            **HEADERS,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }, timeout=15)
        print(f"  ETF.com status: {resp.status_code}")

        if resp.status_code != 200:
            return None

        html = resp.text

        # Multiple patterns to find yield
        patterns = [
            r'30-Day SEC Yield[^%\d]{0,100}(\d+\.\d+)\s*%',
            r'SEC Yield[^%\d]{0,100}(\d+\.\d+)\s*%',
            r'Distribution Yield[^%\d]{0,100}(\d+\.\d+)\s*%',
            r'"yield"\s*:\s*"(\d+\.\d+)%"',
            r'data-yield="(\d+\.\d+)"',
        ]

        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                val = float(match.group(1))
                if 0.1 < val < 20:
                    print(f"  ETF.com matched pattern: {pattern[:40]}")
                    return f"{val:.2f}%"

        # Print a snippet of the HTML around "yield" for debugging
        idx = html.lower().find("yield")
        if idx > 0:
            snippet = html[max(0, idx-50):idx+200]
            print(f"  ETF.com yield snippet: {snippet[:200]}")

        return None

    except Exception as e:
        print(f"  ETF.com error: {e}")
        return None


def fetch_wisesheets_or_stooq(ticker):
    """Try stooq as an alternative data source"""
    try:
        # Stooq provides some ETF data
        url  = f"https://stooq.com/q/d/l/?s={ticker.lower()}.us&i=d"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        print(f"  Stooq status: {resp.status_code}")
        # Stooq returns CSV — not useful for yield but good for debugging
        return None
    except Exception as e:
        print(f"  Stooq error: {e}")
        return None


def fetch_yield_for_ticker(ticker):
    """Try all sources in order"""
    print(f"\n--- {ticker} ---")

    # Source 1 — Yahoo Finance quoteSummary
    y = fetch_yahoo_summary(ticker)
    if y:
        print(f"  ✅ Got yield from Yahoo summary: {y}")
        return y

    time.sleep(0.5)

    # Source 2 — Yahoo Finance chart with dividends
    y = fetch_yahoo_chart(ticker)
    if y:
        print(f"  ✅ Got yield from Yahoo chart: {y}")
        return y

    time.sleep(0.5)

    # Source 3 — ETF.com scrape
    y = fetch_etf_com(ticker)
    if y:
        print(f"  ✅ Got yield from ETF.com: {y}")
        return y

    print(f"  ❌ All sources failed for {ticker}")
    return "N/A"


def main():
    print(f"Starting ETF yield fetch at {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"Fetching {len(TICKERS)} tickers...\n")

    yields = {}

    for ticker in TICKERS:
        y = fetch_yield_for_ticker(ticker)
        yields[ticker] = y
        # Small delay between tickers to avoid rate limiting
        time.sleep(1)

    # Summary
    found    = sum(1 for v in yields.values() if v != "N/A")
    not_found = sum(1 for v in yields.values() if v == "N/A")
    print(f"\n{'='*50}")
    print(f"Results: {found} found, {not_found} N/A")
    print(f"{'='*50}")

    output = {
        "updated": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "yields": yields
    }

    with open("data/etf_yields.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved to data/etf_yields.json")
    print(json.dumps(yields, indent=2))


if __name__ == "__main__":
    main()