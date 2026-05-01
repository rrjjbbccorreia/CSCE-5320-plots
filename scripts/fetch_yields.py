import requests
import json
import re
from datetime import datetime

TICKERS = [
    "SGOV", "BIL", "SHV", "USFR", "BOXX",
    "SHY", "VGSH", "SCHO", "IEI", "IEF",
    "VGIT", "SCHR", "SPTI", "GOVT", "TLH",
    "TLT", "VGLT", "SPTL",
    "IBTG", "IBTH", "IBTI", "IBTJ", "IBTP"
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json"
}

def fetch_yahoo_yield(ticker):
    """Fetch yield from Yahoo Finance API directly — no proxy needed server-side"""
    try:
        url = f"https://query1.finance.yahoo.com/v11/finance/quoteSummary/{ticker}?modules=summaryDetail,defaultKeyStatistics"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()

        result = data.get("quoteSummary", {}).get("result", [{}])[0]
        sd = result.get("summaryDetail", {})
        ks = result.get("defaultKeyStatistics", {})

        # Try multiple yield fields
        yield_val = (
            sd.get("yield", {}).get("raw") or
            sd.get("dividendYield", {}).get("raw") or
            ks.get("yield", {}).get("raw")
        )

        if yield_val and yield_val > 0:
            return f"{yield_val * 100:.2f}%"

        return None

    except Exception as e:
        print(f"Yahoo failed for {ticker}: {e}")
        return None


def fetch_etf_com_yield(ticker):
    """Scrape yield from ETF.com — works server side without CORS"""
    try:
        url  = f"https://www.etf.com/{ticker}"
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        html = resp.text

        patterns = [
            r'30-Day SEC Yield[\s\S]{0,300}?(\d+\.\d+)%',
            r'SEC Yield[\s\S]{0,200}?(\d+\.\d+)%',
            r'Distribution Yield[\s\S]{0,200}?(\d+\.\d+)%',
        ]

        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                val = float(match.group(1))
                if 0 < val < 20:
                    return f"{val:.2f}%"

        return None

    except Exception as e:
        print(f"ETF.com failed for {ticker}: {e}")
        return None


def main():
    yields = {}
    
    for ticker in TICKERS:
        print(f"Fetching yield for {ticker}...")
        
        # Try Yahoo first
        y = fetch_yahoo_yield(ticker)
        
        # Fall back to ETF.com
        if not y:
            y = fetch_etf_com_yield(ticker)
        
        yields[ticker] = y or "N/A"
        print(f"  {ticker}: {yields[ticker]}")

    output = {
        "updated": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "yields": yields
    }

    with open("data/etf_yields.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved yields to data/etf_yields.json")
    print(f"Updated: {output['updated']}")


if __name__ == "__main__":
    main()