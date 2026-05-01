// ==================== BOND ETF DATA ====================

const PERPETUAL_ETFS = [
  { ticker: "SGOV", name: "iShares 0-3 Month Treasury Bond ETF",         duration: "0-3 Month",     aum: "$84.2B",  expense: "0.09%" },
  { ticker: "BIL",  name: "SPDR Bloomberg 1-3 Month T-Bill ETF",          duration: "1-3 Month",     aum: "$46.8B",  expense: "0.14%" },
  { ticker: "SHV",  name: "iShares 0-1 Year Treasury Bond ETF",           duration: "0-1 Year",      aum: "$20.7B",  expense: "0.15%" },
  { ticker: "USFR", name: "WisdomTree Floating Rate Treasury Fund",        duration: "Floating Rate", aum: "$17.2B",  expense: "0.15%" },
  { ticker: "BOXX", name: "Alpha Architect 1-3 Month Box ETF",             duration: "1-3 Month",     aum: "$11.0B",  expense: "0.19%" },
  { ticker: "SHY",  name: "iShares 1-3 Year Treasury Bond ETF",           duration: "1-3 Year",      aum: "$25.7B",  expense: "0.15%" },
  { ticker: "VGSH", name: "Vanguard Short-Term Treasury ETF",              duration: "1-3 Year",      aum: "$28.8B",  expense: "0.04%" },
  { ticker: "SCHO", name: "Schwab Short-Term U.S. Treasury ETF",           duration: "1-3 Year",      aum: "$12.1B",  expense: "0.03%" },
  { ticker: "IEI",  name: "iShares 3-7 Year Treasury Bond ETF",           duration: "3-7 Year",      aum: "$18.8B",  expense: "0.15%" },
  { ticker: "IEF",  name: "iShares 7-10 Year Treasury Bond ETF",          duration: "7-10 Year",     aum: "$48.7B",  expense: "0.15%" },
  { ticker: "VGIT", name: "Vanguard Intermediate-Term Treasury ETF",       duration: "5-10 Year",     aum: "$40.1B",  expense: "0.04%" },
  { ticker: "SCHR", name: "Schwab Intermediate-Term U.S. Treasury ETF",    duration: "3-10 Year",     aum: "$12.9B",  expense: "0.03%" },
  { ticker: "SPTI", name: "SPDR Portfolio Intermediate Term Treasury ETF",  duration: "3-10 Year",     aum: "$10.1B",  expense: "0.03%" },
  { ticker: "GOVT", name: "iShares U.S. Treasury Bond ETF",                duration: "1-30 Year Mix", aum: "$41.1B",  expense: "0.05%" },
  { ticker: "TLH",  name: "iShares 10-20 Year Treasury Bond ETF",         duration: "10-20 Year",    aum: "$12.2B",  expense: "0.15%" },
  { ticker: "TLT",  name: "iShares 20+ Year Treasury Bond ETF",           duration: "20+ Year",      aum: "$42.0B",  expense: "0.15%" },
  { ticker: "VGLT", name: "Vanguard Long-Term Treasury ETF",               duration: "10-25 Year",    aum: "$10.0B",  expense: "0.04%" },
  { ticker: "SPTL", name: "SPDR Portfolio Long Term Treasury ETF",         duration: "10-30 Year",    aum: "$10.5B",  expense: "0.03%" },
];

const TARGET_ETFS = [
  { ticker: "IBTG", name: "iShares iBonds Dec 2026 Term Treasury ETF", maturity: "Dec 2026", duration: "~1-2 Year",  aum: "$3.2B", expense: "0.07%" },
  { ticker: "IBTH", name: "iShares iBonds Dec 2027 Term Treasury ETF", maturity: "Dec 2027", duration: "~2-3 Year",  aum: "$2.8B", expense: "0.07%" },
  { ticker: "IBTI", name: "iShares iBonds Dec 2028 Term Treasury ETF", maturity: "Dec 2028", duration: "~3-4 Year",  aum: "$2.1B", expense: "0.07%" },
  { ticker: "IBTJ", name: "iShares iBonds Dec 2029 Term Treasury ETF", maturity: "Dec 2029", duration: "~4-5 Year",  aum: "$1.8B", expense: "0.07%" },
  { ticker: "IBTP", name: "iShares iBonds Dec 2034 Term Treasury ETF", maturity: "Dec 2034", duration: "~9-10 Year", aum: "$0.9B", expense: "0.07%" },
];

const ALL_ETFS = [...PERPETUAL_ETFS, ...TARGET_ETFS];

// ==================== TIMING ====================
const GAP_MS         = 3500;
const BATCH_SIZE     = 3;
const BATCH_PAUSE_MS = 12000;
const maxNoProgress  = 5;
const INITIAL_DELAY  = 1000;   // wait 5 seconds before starting


// ==================== PROXY LIST ====================
// Tried in order — first success wins
const PROXY_BUILDERS = [
  // Proxy 1 — allorigins
  (url) => ({
    fetchUrl: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    parseResponse: async (r) => { const j = await r.json(); return JSON.parse(j.contents); }
  }),
  // Proxy 2 — corsproxy.io
  (url) => ({
    fetchUrl: `https://corsproxy.io/?${encodeURIComponent(url)}`,
    parseResponse: async (r) => r.json()
  }),
];

// ==================== MULTI PROXY FETCH ====================

async function proxyFetch(yahooUrl) {
  for (let p = 0; p < PROXY_BUILDERS.length; p++) {
    try {
      const { fetchUrl, parseResponse } = PROXY_BUILDERS[p](yahooUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(fetchUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`Proxy ${p + 1} HTTP ${response.status}`);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      const data = await parseResponse(response);
      console.log(`Proxy ${p + 1} succeeded`);
      return data;

    } catch (err) {
      console.warn(`Proxy ${p + 1} failed: ${err.message}`);
      if (p < PROXY_BUILDERS.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  throw new Error("All proxies failed");
}



async function fetchETFYield(ticker) {
  // Source 1 — try ETF.com scrape
  try {
    const url      = `https://www.etf.com/${ticker}`;
    const proxy    = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const ctrl     = new AbortController();
    const timeout  = setTimeout(() => ctrl.abort(), 12000);
    const response = await fetch(proxy, { signal: ctrl.signal });
    clearTimeout(timeout);

    if (response.ok) {
      const json  = await response.json();
      const html  = json.contents || "";

      const match = html.match(/30-Day SEC Yield[\s\S]{0,200}?(\d+\.\d+)%/i)
        || html.match(/SEC Yield[\s\S]{0,100}?(\d+\.\d+)%/i)
        || html.match(/Distribution Yield[\s\S]{0,100}?(\d+\.\d+)%/i)
        || html.match(/Yield[\s\S]{0,50}?(\d+\.\d+)%/i);

      if (match && parseFloat(match[1]) > 0 && parseFloat(match[1]) < 20) {
        console.log(`${ticker} yield from ETF.com: ${match[1]}%`);
        return `${parseFloat(match[1]).toFixed(2)}%`;
      }
    }
  } catch (e) {
    console.warn(`${ticker} ETF.com yield failed:`, e.message);
  }

  // Source 2 — try Vanguard API for Vanguard ETFs
  const VANGUARD_TICKERS = ["VGSH", "VGIT", "VGLT"];
  if (VANGUARD_TICKERS.includes(ticker)) {
    try {
      const VANGUARD_IDS = { VGSH: "0928", VGIT: "0646", VGLT: "0644" };
      const id      = VANGUARD_IDS[ticker];
      const url     = `https://advisors.vanguard.com/web/c1/fas-investmentproducts/${id}/overview`;
      const proxy   = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const ctrl    = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 12000);
      const resp    = await fetch(proxy, { signal: ctrl.signal });
      clearTimeout(timeout);

      if (resp.ok) {
        const json  = await resp.json();
        const html  = json.contents || "";
        const match = html.match(/SEC yield[\s\S]{0,100}?(\d+\.\d+)%/i)
          || html.match(/30-day SEC[\s\S]{0,100}?(\d+\.\d+)%/i);
        if (match) {
          console.log(`${ticker} yield from Vanguard: ${match[1]}%`);
          return `${parseFloat(match[1]).toFixed(2)}%`;
        }
      }
    } catch (e) {
      console.warn(`${ticker} Vanguard yield failed:`, e.message);
    }
  }

  return "N/A";
}



// ==================== FETCH SINGLE ETF ====================

async function fetchETFData(ticker) {
  try {
    const yahooUrl =
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`;

    const data   = await proxyFetch(yahooUrl);
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error("No result in response");

    const meta        = result.meta || {};
    const closes      = result.indicators?.quote?.[0]?.close || [];
    const validCloses = closes.filter(v => v !== null && !isNaN(v));

    const latestPrice = meta.regularMarketPrice || validCloses[validCloses.length - 1];
    const prevPrice   = validCloses[0] || meta.chartPreviousClose;
    const change      = latestPrice && prevPrice ? latestPrice - prevPrice : null;
    const changePct   = change && prevPrice ? (change / prevPrice) * 100 : null;
    const isPos       = change !== null ? change >= 0 : null;

    // Try meta yield first — fast, no extra call
    let yieldStr = "N/A";
    const ty = meta.trailingAnnualDividendYield;
    const tr = meta.trailingAnnualDividendRate;
    if (ty && ty > 0) {
      yieldStr = `${(ty * 100).toFixed(2)}%`;
    } else if (tr && latestPrice > 0) {
      yieldStr = `${((tr / latestPrice) * 100).toFixed(2)}%`;
    } else {
      // Fallback — scrape from ETF.com
      yieldStr = await fetchETFYield(ticker);
    }

    return {
      price:   latestPrice ? `$${latestPrice.toFixed(2)}` : "N/A",
      change:  changePct !== null ? `${Math.abs(changePct).toFixed(2)}%` : "N/A",
      isPos,
      yield:   yieldStr,
      success: true
    };

  } catch (err) {
    console.warn(`fetchETFData failed for ${ticker}:`, err.message);
    return { price: "N/A", change: "N/A", isPos: null, yield: "N/A", success: false };
  }
}

// ==================== UPDATE ROW ====================

function updateRow(ticker, data) {
  const priceEl  = document.getElementById(`price-${ticker}`);
  const changeEl = document.getElementById(`change-${ticker}`);
  const yieldEl  = document.getElementById(`yield-${ticker}`);

  if (priceEl) {
    priceEl.innerHTML = data.price !== "N/A"
      ? `<span class="etf-price">${data.price}</span>`
      : `<a href="https://finance.yahoo.com/quote/${ticker}" target="_blank"
             style="color:#00b4d8;font-size:12px;text-decoration:none;">
           View on Yahoo →
         </a>`;
  }

  if (changeEl) {
    if (data.change !== "N/A" && data.isPos !== null) {
      const arrow = data.isPos ? "&#9650;" : "&#9660;";
      const cls   = data.isPos ? "etf-change-pos" : "etf-change-neg";
      changeEl.innerHTML = `<span class="${cls}">${arrow} ${data.change}</span>`;
    } else {
      changeEl.innerHTML = `<span style="color:#aaa;font-size:12px;">N/A</span>`;
    }
  }

  if (yieldEl) {
    yieldEl.innerHTML = data.yield !== "N/A"
      ? `<span class="etf-yield">${data.yield}</span>`
      : `<span style="color:#aaa;font-size:12px;">N/A</span>`;
  }
}

// ==================== CHECK ROW NEEDS UPDATE ====================

function rowNeedsUpdate(ticker) {
  const priceEl  = document.getElementById(`price-${ticker}`);
  const yieldEl  = document.getElementById(`yield-${ticker}`);
  const changeEl = document.getElementById(`change-${ticker}`);
  const pText    = priceEl  ? priceEl.innerText.trim()  : "";
  const yText    = yieldEl  ? yieldEl.innerText.trim()  : "";
  const cText    = changeEl ? changeEl.innerText.trim() : "";
  return (
    pText.includes("Loading") || pText.includes("Retrying") || pText === "N/A" || pText === "" ||
    yText.includes("Loading") || yText === "N/A" || yText === "" ||
    cText === "-" || cText === "N/A" || cText === ""
  );
}

// ==================== BATCH FETCH ====================

async function fetchBatch(tickers, retryRound) {
  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];

    if (retryRound > 0) {
      const priceEl = document.getElementById(`price-${ticker}`);
      if (priceEl) priceEl.innerHTML = `<span style="color:#aaa;font-size:11px;">Retrying (${retryRound})...</span>`;
    }

    console.log(`${retryRound === 0 ? "Fetching" : "Retrying"} ${i + 1}/${tickers.length}: ${ticker}`);
    const data = await fetchETFData(ticker);
    updateRow(ticker, data);

    await new Promise(r => setTimeout(r, GAP_MS));

    if ((i + 1) % BATCH_SIZE === 0 && i < tickers.length - 1) {
      console.log(`Batch pause after ${i + 1} — waiting ${BATCH_PAUSE_MS}ms...`);
      await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
    }
  }
}

// ==================== MAIN LOADER ====================

async function loadAllETFs() {
  console.log(`ETF fetch — ${ALL_ETFS.length} tickers, starting in ${INITIAL_DELAY}ms...`);

  // Initial delay to let page fully load before hitting the proxy
  await new Promise(r => setTimeout(r, INITIAL_DELAY));

  await fetchBatch(ALL_ETFS.map(e => e.ticker), 0);
  console.log("Pass 1 complete — checking for failures...");

  let retryRound       = 1;
  let noProgressRounds = 0;
  let lastFailedCount  = ALL_ETFS.length;

  while (true) {
    const failedTickers = ALL_ETFS.map(e => e.ticker).filter(t => rowNeedsUpdate(t));

    if (failedTickers.length === 0) {
      console.log("All ETF data loaded successfully!");
      break;
    }

    if (failedTickers.length >= lastFailedCount) {
      noProgressRounds++;
      console.warn(`No progress ${noProgressRounds}/${maxNoProgress} — ${failedTickers.length} pending:`, failedTickers);
    } else {
      noProgressRounds = 0;
      console.log(`Progress — ${failedTickers.length} remaining`);
    }

    if (noProgressRounds >= maxNoProgress) {
      console.warn("Stopping retries — no progress after", maxNoProgress, "rounds");
      break;
    }

    lastFailedCount = failedTickers.length;

    const backoff = Math.min(5000 + retryRound * 2000, 20000);
    console.log(`Retry round ${retryRound} — waiting ${backoff}ms...`);
    await new Promise(r => setTimeout(r, backoff));

    await fetchBatch(failedTickers, retryRound);
    retryRound++;
  }
}

// ==================== BUILD TABLES ====================

function buildPerpetualTableHTML() {
  const tbody = document.getElementById("perpetualTableBody");
  if (!tbody) return;
  tbody.innerHTML = PERPETUAL_ETFS.map(etf => `
    <tr id="row-${etf.ticker}">
      <td>
        <a href="https://finance.yahoo.com/quote/${etf.ticker}"
          target="_blank" class="etf-ticker-link">
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
      <td id="yield-${etf.ticker}"><span style="color:#aaa;font-size:12px;">Loading...</span></td>
      <td id="price-${etf.ticker}"><span style="color:#aaa;font-size:12px;">Loading...</span></td>
      <td id="change-${etf.ticker}"><span style="color:#aaa;font-size:12px;">-</span></td>
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
          target="_blank" class="etf-ticker-link">
          ${etf.ticker}
        </a>
      </td>
      <td>
        <span class="etf-name">${etf.name}</span>
        <span class="etf-subdesc">Returns capital at maturity - ${etf.duration} remaining</span>
      </td>
      <td><span class="etf-maturity">${etf.maturity}</span></td>
      <td><span class="etf-aum">${etf.aum}</span></td>
      <td><span class="etf-expense">${etf.expense}</span></td>
      <td id="yield-${etf.ticker}"><span style="color:#aaa;font-size:12px;">Loading...</span></td>
      <td id="price-${etf.ticker}"><span style="color:#aaa;font-size:12px;">Loading...</span></td>
      <td id="change-${etf.ticker}"><span style="color:#aaa;font-size:12px;">-</span></td>
    </tr>
  `).join("");
}

// ==================== INIT ====================
buildPerpetualTableHTML();
buildTargetTableHTML();
loadAllETFs();
