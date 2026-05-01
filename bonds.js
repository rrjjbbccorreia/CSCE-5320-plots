// ==================== BOND ETF DATA ====================
// Yields are loaded from data/etf_yields.json (auto-updated every 2 days via GitHub Action)
// Fallback yields shown below are used if JSON file is unavailable

const PERPETUAL_ETFS = [
  { ticker: "SGOV", name: "iShares 0-3 Month Treasury Bond ETF",         duration: "0-3 Month",     aum: "$84.2B", expense: "0.09%", yield: "4.32%" },
  { ticker: "BIL",  name: "SPDR Bloomberg 1-3 Month T-Bill ETF",          duration: "1-3 Month",     aum: "$46.8B", expense: "0.14%", yield: "4.28%" },
  { ticker: "SHV",  name: "iShares 0-1 Year Treasury Bond ETF",           duration: "0-1 Year",      aum: "$20.7B", expense: "0.15%", yield: "4.35%" },
  { ticker: "USFR", name: "WisdomTree Floating Rate Treasury Fund",        duration: "Floating Rate", aum: "$17.2B", expense: "0.15%", yield: "4.38%" },
  { ticker: "BOXX", name: "Alpha Architect 1-3 Month Box ETF",             duration: "1-3 Month",     aum: "$11.0B", expense: "0.19%", yield: "4.30%" },
  { ticker: "SHY",  name: "iShares 1-3 Year Treasury Bond ETF",           duration: "1-3 Year",      aum: "$25.7B", expense: "0.15%", yield: "4.12%" },
  { ticker: "VGSH", name: "Vanguard Short-Term Treasury ETF",              duration: "1-3 Year",      aum: "$28.8B", expense: "0.04%", yield: "4.10%" },
  { ticker: "SCHO", name: "Schwab Short-Term U.S. Treasury ETF",           duration: "1-3 Year",      aum: "$12.1B", expense: "0.03%", yield: "4.09%" },
  { ticker: "IEI",  name: "iShares 3-7 Year Treasury Bond ETF",           duration: "3-7 Year",      aum: "$18.8B", expense: "0.15%", yield: "4.18%" },
  { ticker: "IEF",  name: "iShares 7-10 Year Treasury Bond ETF",          duration: "7-10 Year",     aum: "$48.7B", expense: "0.15%", yield: "4.28%" },
  { ticker: "VGIT", name: "Vanguard Intermediate-Term Treasury ETF",       duration: "5-10 Year",     aum: "$40.1B", expense: "0.04%", yield: "4.22%" },
  { ticker: "SCHR", name: "Schwab Intermediate-Term U.S. Treasury ETF",    duration: "3-10 Year",     aum: "$12.9B", expense: "0.03%", yield: "4.15%" },
  { ticker: "SPTI", name: "SPDR Portfolio Intermediate Term Treasury ETF",  duration: "3-10 Year",     aum: "$10.1B", expense: "0.03%", yield: "4.16%" },
  { ticker: "GOVT", name: "iShares U.S. Treasury Bond ETF",                duration: "1-30 Year Mix", aum: "$41.1B", expense: "0.05%", yield: "4.25%" },
  { ticker: "TLH",  name: "iShares 10-20 Year Treasury Bond ETF",         duration: "10-20 Year",    aum: "$12.2B", expense: "0.15%", yield: "4.52%" },
  { ticker: "TLT",  name: "iShares 20+ Year Treasury Bond ETF",           duration: "20+ Year",      aum: "$42.0B", expense: "0.15%", yield: "4.62%" },
  { ticker: "VGLT", name: "Vanguard Long-Term Treasury ETF",               duration: "10-25 Year",    aum: "$10.0B", expense: "0.04%", yield: "4.58%" },
  { ticker: "SPTL", name: "SPDR Portfolio Long Term Treasury ETF",         duration: "10-30 Year",    aum: "$10.5B", expense: "0.03%", yield: "4.60%" },
];

const TARGET_ETFS = [
  { ticker: "IBTG", name: "iShares iBonds Dec 2026 Term Treasury ETF", maturity: "Dec 2026", duration: "~1-2 Year",  aum: "$3.2B", expense: "0.07%", yield: "4.45%" },
  { ticker: "IBTH", name: "iShares iBonds Dec 2027 Term Treasury ETF", maturity: "Dec 2027", duration: "~2-3 Year",  aum: "$2.8B", expense: "0.07%", yield: "4.38%" },
  { ticker: "IBTI", name: "iShares iBonds Dec 2028 Term Treasury ETF", maturity: "Dec 2028", duration: "~3-4 Year",  aum: "$2.1B", expense: "0.07%", yield: "4.32%" },
  { ticker: "IBTJ", name: "iShares iBonds Dec 2029 Term Treasury ETF", maturity: "Dec 2029", duration: "~4-5 Year",  aum: "$1.8B", expense: "0.07%", yield: "4.28%" },
  { ticker: "IBTP", name: "iShares iBonds Dec 2034 Term Treasury ETF", maturity: "Dec 2034", duration: "~9-10 Year", aum: "$0.9B", expense: "0.07%", yield: "4.42%" },
];

const ALL_ETFS = [...PERPETUAL_ETFS, ...TARGET_ETFS];

// ==================== LOAD PRICES FROM JSON FILE ====================
// Prices are fetched server-side every hour via GitHub Action
// and saved to data/etf_prices.json — loaded here with no proxy needed

async function loadPricesFromFile() {
  try {
    const url      = `data/etf_prices.json?v=${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data    = await response.json();
    const prices  = data.prices  || {};
    const updated = data.updated || null;

    console.log(`ETF prices loaded from file — last updated: ${updated}`);

    // Update price cells in both tables
    ALL_ETFS.forEach(etf => {
      const price = prices[etf.ticker];
      const el    = document.getElementById(`price-${etf.ticker}`);
      if (!el) return;

      if (price && price !== "N/A") {
        el.innerHTML = `<span class="etf-price">$${Number(price).toFixed(2)}</span>`;
      } else {
        el.innerHTML = `
          <a href="https://finance.yahoo.com/quote/${etf.ticker}"
             target="_blank"
             style="color:#00b4d8;font-size:12px;text-decoration:none;">
            View on Yahoo →
          </a>`;
      }
    });

    // Show last updated timestamp
    const tsEl = document.getElementById("pricesUpdatedAt");
    if (tsEl && updated) {
      tsEl.textContent = `Prices last updated: ${updated}`;
    }

  } catch (e) {
    console.warn("Could not load etf_prices.json:", e.message);
    // Show Yahoo Finance links for all tickers as fallback
    ALL_ETFS.forEach(etf => {
      const el = document.getElementById(`price-${etf.ticker}`);
      if (el) {
        el.innerHTML = `
          <a href="https://finance.yahoo.com/quote/${etf.ticker}"
             target="_blank"
             style="color:#00b4d8;font-size:12px;text-decoration:none;">
            View on Yahoo →
          </a>`;
      }
    });
  }
}

// ==================== LOAD YIELDS FROM JSON FILE ====================
// Yields are fetched server-side every 2 days via GitHub Action
// and saved to data/etf_yields.json — loaded here with no proxy needed

let cachedYields = {};
let yieldsLastUpdated = null;

async function loadYieldsFromFile() {
  try {
    // Add cache-busting to always get fresh file from GitHub Pages
    const url      = `data/etf_yields.json?v=${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data      = await response.json();
    cachedYields    = data.yields || {};
    yieldsLastUpdated = data.updated || null;

    console.log(`ETF yields loaded from file — last updated: ${yieldsLastUpdated}`);

    // Update yield cells in both tables
    ALL_ETFS.forEach(etf => {
      const yieldVal = cachedYields[etf.ticker];
      if (yieldVal && yieldVal !== "N/A") {
        const el = document.getElementById(`yield-${etf.ticker}`);
        if (el) {
          el.innerHTML = `<span class="etf-yield">${yieldVal}</span>`;
        }
      }
    });

    // Show last updated timestamp in page
    const tsEl = document.getElementById("yieldsUpdatedAt");
    if (tsEl && yieldsLastUpdated) {
      tsEl.textContent = `Yields last updated: ${yieldsLastUpdated}`;
    }

  } catch (e) {
    console.warn("Could not load etf_yields.json — using fallback yields from ETF data array:", e.message);
    // Fallback yields already in the table from buildTableHTML functions
  }
}




// ==================== BUILD TABLE HTML ====================

function buildPerpetualTableHTML() {
  const tbody = document.getElementById("perpetualTableBody");
  if (!tbody) return;
  tbody.innerHTML = PERPETUAL_ETFS.map(etf => `
    <tr id="row-${etf.ticker}">
      <td>
        <a href="https://finance.yahoo.com/quote/${etf.ticker}"
           target="_blank"
           class="etf-ticker-link"
           title="View ${etf.ticker} on Yahoo Finance">
          ${etf.ticker}
        </a>
      </td>
      <td>
        <span class="etf-name">${etf.name}</span>
        <span class="etf-subdesc">${etf.duration} duration focus</span>
      </td>
      <td>${etf.duration}</td>
      <td><span class="etf-aum">${etf.aum}</span></td>
      <td><span class="etf-expense">${etf.expense}</span></td>
      <td id="yield-${etf.ticker}">
        <span class="etf-yield">${etf.yield}</span>
      </td>
      <td id="price-${etf.ticker}">
        <span style="color:#aaa;font-size:12px;">Loading...</span>
      </td>
    </tr>
  `).join("");
}

function buildTargetTableHTML() {
  const tbody = document.getElementById("targetTableBody");
  if (!tbody) return;
  tbody.innerHTML = TARGET_ETFS.map(etf => `
    <tr id="row-${etf.ticker}">
      <td>
        <a href="https://finance.yahoo.com/quote/${etf.ticker}"
           target="_blank"
           class="etf-ticker-link"
           title="View ${etf.ticker} on Yahoo Finance">
          ${etf.ticker}
        </a>
      </td>
      <td>
        <span class="etf-name">${etf.name}</span>
        <span class="etf-subdesc">Returns capital at maturity — ${etf.duration} remaining</span>
      </td>
      <td><span class="etf-maturity">${etf.maturity}</span></td>
      <td><span class="etf-aum">${etf.aum}</span></td>
      <td><span class="etf-expense">${etf.expense}</span></td>
      <td id="yield-${etf.ticker}">
        <span class="etf-yield">${etf.yield}</span>
      </td>
      <td id="price-${etf.ticker}">
        <span style="color:#aaa;font-size:12px;">Loading...</span>
      </td>
    </tr>
  `).join("");
}

// ==================== INIT ====================
buildPerpetualTableHTML();
buildTargetTableHTML();

// Load yields and prices from JSON files — both served from same domain
// No proxy needed — GitHub Action updates them automatically
Promise.all([
  loadYieldsFromFile(),
  loadPricesFromFile()
]).then(() => {
  console.log("All ETF data loaded from pre-fetched files!");
});
