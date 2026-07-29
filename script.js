// ============ DETECT HARD REFRESH ============
// On hard refresh (F5 / browser refresh button):
//   - If proxies ran within 5 minutes → keep price caches (immediate re-refresh)
//   - If proxies ran more than 5 minutes ago → clear all price caches (stale)
// On page navigation (clicking links) → nothing cleared, session cache preserved

(function detectHardRefresh() {
  let isHardRefresh = false;

  // Modern browsers
  if (window.performance && performance.getEntriesByType) {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav && nav.type === "reload") {
      isHardRefresh = true;
    }
  }

  // Fallback for older browsers
  if (!isHardRefresh && window.performance && performance.navigation) {
    if (performance.navigation.type === 1) {
      isHardRefresh = true;
    }
  }

  if (isHardRefresh) {
    // Always clear file-based refresh stamps
    sessionStorage.removeItem("last_price_refresh");
    sessionStorage.removeItem("last_price_refresh_source");

    // Check if proxies ran very recently (within 5 minutes)
    const lastProxy   = sessionStorage.getItem("last_proxy_refresh");
    const proxyRecent = lastProxy &&
      Date.now() - parseInt(lastProxy) < 5 * 60 * 1000;

    if (proxyRecent) {
      // Proxies just ran — keep price caches so cards load instantly
      // Clears the proxy stamp too so next staleness check runs fresh
      sessionStorage.removeItem("last_proxy_refresh");
      console.log("Hard refresh — proxies ran recently, keeping price caches for fast reload");
    } else {
      // Proxies haven't run recently — clear ALL price caches
      // Forces fresh proxy fetch on stale or day-old data
      sessionStorage.removeItem("last_proxy_refresh");
      const keysToRemove = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith("price_cache_")) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
      console.log(`Hard refresh — ${keysToRemove.length} price caches cleared`);
    }
  }
})();

// ==================== CONFIG ====================
const DATA_PATH = "data/merged_predictions_v2_web_063026.csv";
let globalData = [];
let currentTicker = null;
let currentTarget = "T1";

// ============ LOAD CSV =============
console.log("Attempting to load data from:", DATA_PATH);

Papa.parse(DATA_PATH, {
  download: true,
  header: true,
  dynamicTyping: true,
  complete: (results) => {
    console.log("Papa parse complete");
    console.log("Total rows returned:", results.data.length);
    console.log("First row sample:", results.data[0]);
    console.log("Errors:", results.errors);
    
    globalData = results.data.filter((r) => r["name of security"]);
    console.log("Rows after filter:", globalData.length);
    
    if (globalData.length === 0) {
      console.error("No data after filtering — check column name matches exactly");
    }
    
    initTickerMenu();
  },
  error: (error) => {
    console.error("Papa parse error:", error);
  }
});

// ============ INITIALIZE MENU ============
function initTickerMenu() {
  const select = document.getElementById("tickerSelect");
  const tickers = Array.from(
    new Set(globalData.map((d) => d["name of security"]))
  ).sort();

  select.innerHTML = "";
  tickers.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  });

  // Try to restore last selection from localStorage
  const savedTicker = localStorage.getItem("selectedTicker");
  currentTicker = savedTicker && tickers.includes(savedTicker)
    ? savedTicker
    : tickers[0];
  select.value = currentTicker;

  select.addEventListener("change", (e) => {
    currentTicker = e.target.value;
    localStorage.setItem("selectedTicker", currentTicker);
    drawChart(currentTicker, currentTarget);
  });

  document.getElementById("toggleBtn").addEventListener("click", toggleTarget);

  // Draw initial chart
  drawChart(currentTicker, currentTarget);
}

// ============ TOGGLE BETWEEN T1 AND T2 ============
function toggleTarget() {
  currentTarget = currentTarget === "T1" ? "T2" : "T1";
  drawChart(currentTicker, currentTarget);
}

// ============ FETCH & DISPLAY STOCK TABLE ============

async function fetchStockTable(ticker, retryCount = 0) {
  const maxRetries = 3;
  const tableContainer = document.getElementById("stock-table-container");

  if (retryCount === 0) {
    tableContainer.innerHTML = "<p style='color:#aaa;text-align:center'>Loading market data...</p>";
    await new Promise(resolve => setTimeout(resolve, 500));
  } else {
    tableContainer.innerHTML = `<p style='color:#aaa;text-align:center'>Loading market data... (attempt ${retryCount + 1} of ${maxRetries})</p>`;
  }

  try {

    // ===== CHECK CACHE FIRST =====
    if (retryCount === 0) {
      const cached = sessionStorage.getItem(`table_cache_${ticker}`);
      if (cached) {
        const { html, savedAt } = JSON.parse(cached);
        const cachedDate = new Date(savedAt).toDateString();
        const todayDate  = new Date().toDateString();
        // Expire if older than 15 min OR from a different day
        if (Date.now() - savedAt < 15 * 60 * 1000 && cachedDate === todayDate) {
          console.log(`${ticker} table — loaded from cache`);
          tableContainer.innerHTML = html;
          return;
        } else {
          sessionStorage.removeItem(`table_cache_${ticker}`);
        }
      }
    }

    const yahooChartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1mo`;

    async function proxyFetch(url) {
      const proxies = [
        // Proxy 1 — allorigins
        async () => {
          const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
            { signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = await r.json();
          return JSON.parse(j.contents);
        },
        // Proxy 2 — corsproxy.io
        async () => {
          const r = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`,
            { signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        },
      ];

      for (let p = 0; p < proxies.length; p++) {
        try {
          const data = await proxies[p]();
          console.log(`${ticker} stock table — Proxy ${p + 1} succeeded`);
          return data;
        } catch (e) {
          console.warn(`${ticker} stock table — Proxy ${p + 1} failed: ${e.message}`);
          if (p < proxies.length - 1) await new Promise(r => setTimeout(r, 1000));
        }
      }
      throw new Error("All proxies failed");
    }

    const chartData = await proxyFetch(yahooChartUrl);

    const timestamps = chartData.chart.result[0].timestamp;
    const closes     = chartData.chart.result[0].indicators.quote[0].close;
    const volumes    = chartData.chart.result[0].indicators.quote[0].volume;

    const last10 = timestamps.slice(-10).map((ts, i) => {
      const idx = timestamps.length - 10 + i;
      return {
        date:   new Date(ts * 1000).toLocaleDateString("en-US", {
                  year: "numeric", month: "short", day: "numeric"
                }),
        close:  closes[idx]  ? closes[idx].toFixed(2)       : "N/A",
        volume: volumes[idx] ? volumes[idx].toLocaleString() : "N/A"
      };
    }).reverse();

    tableContainer.innerHTML = `
      <h3 class="stock-table-title">${ticker} — Last 10 Trading Days</h3>
      <table class="stock-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Closing Price</th>
            <th>Volume</th>
          </tr>
        </thead>
        <tbody>
          ${last10.map(row => `
            <tr>
              <td>${row.date}</td>
              <td>$${row.close}</td>
              <td>${row.volume}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

  } catch (err) {
    if (retryCount < maxRetries - 1) {
      console.warn(`Attempt ${retryCount + 1} failed for ${ticker}, retrying in 2s...`);
      setTimeout(() => fetchStockTable(ticker, retryCount + 1), 2000);
    } else {
      console.error(`All ${maxRetries} attempts failed for ${ticker}:`, err);
      tableContainer.innerHTML = `
        <div style="text-align:center; padding: 16px;">
          <p style="color:#ff6b6b; margin-bottom: 12px; font-size:14px;">
            Unable to load market data for ${ticker}
          </p>
          <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
            <button
              onclick="fetchStockTable('${ticker}')"
              style="padding: 9px 18px; cursor: pointer; background: #00b4d8;
                     color: white; border: none; border-radius: 6px; font-size: 14px;
                     font-weight:600;">
              🔄 Retry
            </button>
            <a href="https://finance.yahoo.com/quote/${ticker}"
               target="_blank"
               style="padding: 9px 18px; background: #6a0dad; color: white;
                      border-radius: 6px; font-size: 14px; font-weight:600;
                      text-decoration: none; display:inline-block;">
              📈 View ${ticker} on Yahoo Finance
            </a>
          </div>
        </div>
      `;

      // ===== SAVE TABLE TO CACHE =====
      try {
        sessionStorage.setItem(`table_cache_${ticker}`, JSON.stringify({
          html: tableContainer.innerHTML,
          savedAt: Date.now()
        }));
      } catch (e) {
        console.warn("Table cache save failed:", e.message);
      }

    }
  }
}


// ============ FETCH & DISPLAY COMPANY PROFILE ============

// ============ TICKER TO COMPANY NAME MAP ============
const TICKER_MAP = {
  A: "Agilent Technologies", AA: "Alcoa", AAPL: "Apple Inc",
  ABBV: "AbbVie", ABT: "Abbott Laboratories", ACN: "Accenture",
  ADBE: "Adobe Inc", ADI: "Analog Devices", ADM: "Archer-Daniels-Midland",
  ADP: "ADP Inc", ADSK: "Autodesk", AEE: "Ameren",
  AEP: "American Electric Power", AES: "AES Corporation", AFL: "Aflac",
  AIG: "American International Group", AIZ: "Assurant", AJG: "Arthur J. Gallagher",
  AKAM: "Akamai Technologies", ALB: "Albemarle", ALGN: "Align Technology",
  ALL: "Allstate", AMAT: "Applied Materials", AMGN: "Amgen",
  AMP: "Ameriprise Financial", AMT: "American Tower", AMZN: "Amazon",
  ANET: "Arista Networks", AON: "Aon", AOS: "A. O. Smith",
  APA: "APA Corporation", APD: "Air Products and Chemicals", APH: "Amphenol",
  APTV: "Aptiv", ARE: "Alexandria Real Estate", ATO: "Atmos Energy",
  AVB: "AvalonBay Communities", AVGO: "Broadcom", AVY: "Avery Dennison",
  AWK: "American Water Works", AXON: "Axon Enterprise", AXP: "American Express",
  AZO: "AutoZone", BA: "Boeing", BALL: "Ball Corporation",
  BAC: "Bank of America", BBWI: "Bath Body Works", BBY: "Best Buy",
  BDX: "Becton Dickinson", BEN: "Franklin Resources", BF: "Brown-Forman",
  BIO: "Bio-Rad Laboratories", BIIB: "Biogen", BK: "Bank of New York Mellon",
  BKNG: "Booking Holdings", BKR: "Baker Hughes", BMY: "Bristol-Myers Squibb",
  BR: "Broadridge Financial", BRK: "Berkshire Hathaway", BSX: "Boston Scientific",
  BWA: "BorgWarner", BXP: "BXP Inc", C: "Citigroup",
  CAG: "Conagra Brands", CAH: "Cardinal Health", CARR: "Carrier Global",
  CAT: "Caterpillar", CB: "Chubb", CBOE: "Cboe Global Markets",
  CBRE: "CBRE Group", CCI: "Crown Castle", CCL: "Carnival Corporation",
  CDNS: "Cadence Design Systems", CDW: "CDW Corporation", CE: "Celanese",
  CEG: "Constellation Energy", CF: "CF Industries", CFG: "Citizens Financial",
  CHD: "Church Dwight", CHRW: "C.H. Robinson", CHTR: "Charter Communications",
  CI: "Cigna", CINF: "Cincinnati Financial", CL: "Colgate-Palmolive",
  CLX: "Clorox", CMA: "Comerica", CMCSA: "Comcast",
  CME: "CME Group", CMG: "Chipotle Mexican Grill", CMI: "Cummins",
  CMS: "CMS Energy", CNC: "Centene", CNP: "CenterPoint Energy",
  COF: "Capital One", COO: "Cooper Companies", COP: "ConocoPhillips",
  COST: "Costco", CPB: "Campbell Soup", CPRT: "Copart",
  CPT: "Camden Property Trust", CRL: "Charles River Laboratories", CRM: "Salesforce",
  CSCO: "Cisco Systems", CSGP: "CoStar Group", CSX: "CSX Corporation",
  CTAS: "Cintas", CTLT: "Catalent", CTRA: "Coterra Energy",
  CTSH: "Cognizant", CTVA: "Corteva", CVS: "CVS Health",
  CVX: "Chevron", CZR: "Caesars Entertainment", D: "Dominion Energy",
  DAL: "Delta Air Lines", DD: "DuPont", DE: "Deere Company",
  DFS: "Discover Financial", DG: "Dollar General", DGX: "Quest Diagnostics",
  DHI: "D.R. Horton", DHR: "Danaher", DIS: "Walt Disney",
  DLR: "Digital Realty", DLTR: "Dollar Tree", DOV: "Dover Corporation",
  DOW: "Dow Inc", DPZ: "Dominos Pizza", DRI: "Darden Restaurants",
  DTE: "DTE Energy", DUK: "Duke Energy", DVA: "DaVita",
  DVN: "Devon Energy", DXCM: "DexCom", EA: "Electronic Arts",
  EBAY: "eBay", ECL: "Ecolab", ED: "Consolidated Edison",
  EFX: "Equifax", EIX: "Edison International", EL: "Estee Lauder",
  EMN: "Eastman Chemical", EMR: "Emerson Electric", ENPH: "Enphase Energy",
  EOG: "EOG Resources", EPAM: "EPAM Systems", EQIX: "Equinix",
  EQR: "Equity Residential", EQT: "EQT Corporation", ES: "Eversource Energy",
  ESS: "Essex Property Trust", ETN: "Eaton", ETR: "Entergy",
  ETSY: "Etsy", EVRG: "Evergy", EW: "Edwards Lifesciences",
  EXC: "Exelon", EXR: "Extra Space Storage", F: "Ford Motor",
  FANG: "Diamondback Energy", FAST: "Fastenal", FCX: "Freeport-McMoRan",
  FDS: "FactSet Research", FDX: "FedEx", FE: "FirstEnergy",
  FFIV: "F5 Inc", FIS: "Fidelity National Information", FITB: "Fifth Third Bancorp",
  FLT: "Fleetcor Technologies", FMC: "FMC Corporation", FOX: "Fox Corporation",
  FRT: "Federal Realty", FTNT: "Fortinet", FTV: "Fortive",
  GD: "General Dynamics", GE: "GE Aerospace", GEHC: "GE HealthCare",
  GEN: "Gen Digital", GILD: "Gilead Sciences", GIS: "General Mills",
  GL: "Globe Life", GLW: "Corning", GM: "General Motors",
  GNRC: "Generac Holdings", GOOG: "Alphabet", GOOGL: "Alphabet",
  GPC: "Genuine Parts", GPN: "Global Payments", GPS: "Gap Inc",
  GRMN: "Garmin", GS: "Goldman Sachs", GWW: "W.W. Grainger",
  HAL: "Halliburton", HAS: "Hasbro", HBAN: "Huntington Bancshares",
  HCA: "HCA Healthcare", HD: "Home Depot", HES: "Hess Corporation",
  HIG: "Hartford Financial", HII: "Huntington Ingalls", HLT: "Hilton Worldwide",
  HOLX: "Hologic", HON: "Honeywell", HPE: "Hewlett Packard Enterprise",
  HPQ: "HP Inc", HRL: "Hormel Foods", HSIC: "Henry Schein",
  HST: "Host Hotels", HSY: "Hershey", HUM: "Humana",
  HWM: "Howmet Aerospace", IBM: "IBM", ICE: "Intercontinental Exchange",
  IDXX: "IDEXX Laboratories", IEX: "IDEX Corporation", IFF: "International Flavors",
  ILMN: "Illumina", INCY: "Incyte", INTC: "Intel",
  INTU: "Intuit", INVH: "Invitation Homes", IP: "International Paper",
  IPG: "Interpublic Group", IQV: "IQVIA Holdings", IR: "Ingersoll Rand",
  IRM: "Iron Mountain", ISRG: "Intuitive Surgical", IT: "Gartner",
  ITW: "Illinois Tool Works", IVZ: "Invesco", J: "Jacobs Solutions",
  JBHT: "J.B. Hunt Transport", JBL: "Jabil", JCI: "Johnson Controls",
  JKHY: "Jack Henry Associates", JNJ: "Johnson Johnson", JNPR: "Juniper Networks",
  JPM: "JPMorgan Chase", K: "Kellanova", KEY: "KeyCorp",
  KEYS: "Keysight Technologies", KHC: "Kraft Heinz", KIM: "Kimco Realty",
  KLAC: "KLA Corporation", KMB: "Kimberly-Clark", KMI: "Kinder Morgan",
  KMX: "CarMax", KO: "Coca-Cola", KR: "Kroger",
  L: "Loews Corporation", LDOS: "Leidos", LEN: "Lennar",
  LH: "Laboratory Corporation", LHX: "L3Harris Technologies", LIN: "Linde",
  LKQ: "LKQ Corporation", LLY: "Eli Lilly", LMT: "Lockheed Martin",
  LNT: "Alliant Energy", LOW: "Lowes", LRCX: "Lam Research",
  LULU: "Lululemon Athletica", LUV: "Southwest Airlines", LVS: "Las Vegas Sands",
  LW: "Lamb Weston", LYB: "LyondellBasell", LYV: "Live Nation",
  MA: "Mastercard", MAA: "Mid-America Apartment", MAR: "Marriott International",
  MAS: "Masco", MCD: "McDonalds", MCHP: "Microchip Technology",
  MCK: "McKesson", MCO: "Moodys", MDLZ: "Mondelez International",
  MDT: "Medtronic", MET: "MetLife", META: "Meta Platforms",
  MGM: "MGM Resorts", MHK: "Mohawk Industries", MKC: "McCormick",
  MKTX: "MarketAxess", MLM: "Martin Marietta Materials", MMC: "Marsh McLennan",
  MMM: "3M Company", MNST: "Monster Beverage", MO: "Altria Group",
  MOS: "Mosaic Company", MPC: "Marathon Petroleum", MPWR: "Monolithic Power",
  MRK: "Merck", MRNA: "Moderna", MRO: "Marathon Oil",
  MS: "Morgan Stanley", MSCI: "MSCI Inc", MSFT: "Microsoft",
  MSI: "Motorola Solutions", MTB: "M&T Bank", MTCH: "Match Group",
  MTD: "Mettler-Toledo", MU: "Micron Technology", NCLH: "Norwegian Cruise Line",
  NDAQ: "Nasdaq", NEE: "NextEra Energy", NEM: "Newmont",
  NFLX: "Netflix", NI: "NiSource", NKE: "Nike",
  NOC: "Northrop Grumman", NOW: "ServiceNow", NRG: "NRG Energy",
  NSC: "Norfolk Southern", NTAP: "NetApp", NTRS: "Northern Trust",
  NUE: "Nucor", NVDA: "Nvidia", NVR: "NVR Inc",
  NWS: "News Corporation", O: "Realty Income", ODFL: "Old Dominion Freight",
  OKE: "ONEOK", OMC: "Omnicom Group", ON: "ON Semiconductor",
  ORCL: "Oracle", ORLY: "OReilly Automotive", OTIS: "Otis Worldwide",
  OXY: "Occidental Petroleum", PANW: "Palo Alto Networks", PARA: "Paramount Global",
  PAYC: "Paycom Software", PAYX: "Paychex", PCAR: "PACCAR",
  PCG: "PG&E", PEAK: "Healthpeak Properties", PEG: "Public Service Enterprise",
  PEP: "PepsiCo", PFE: "Pfizer", PFG: "Principal Financial",
  PG: "Procter Gamble", PGR: "Progressive Corporation", PH: "Parker Hannifin",
  PHM: "PulteGroup", PKG: "Packaging Corporation", PLD: "Prologis",
  PM: "Philip Morris", PNC: "PNC Financial", PNR: "Pentair",
  PNW: "Pinnacle West", PODD: "Insulet Corporation", POOL: "Pool Corporation",
  PPG: "PPG Industries", PPL: "PPL Corporation", PRU: "Prudential Financial",
  PSA: "Public Storage", PSX: "Phillips 66", PTC: "PTC Inc",
  PWR: "Quanta Services", PXD: "Pioneer Natural Resources", PYPL: "PayPal",
  QCOM: "Qualcomm", QRVO: "Qorvo", RCL: "Royal Caribbean",
  REG: "Regency Centers", REGN: "Regeneron", RF: "Regions Financial",
  RJF: "Raymond James", RL: "Ralph Lauren", RMD: "ResMed",
  ROK: "Rockwell Automation", ROL: "Rollins", ROP: "Roper Technologies",
  ROST: "Ross Stores", RSG: "Republic Services", RTX: "RTX Corporation",
  SBAC: "SBA Communications", SBUX: "Starbucks", SCHW: "Charles Schwab",
  SHW: "Sherwin-Williams", SJM: "J.M. Smucker", SLB: "SLB",
  SMCI: "Super Micro Computer", SNA: "Snap-on", SNPS: "Synopsys",
  SO: "Southern Company", SPG: "Simon Property Group", SPGI: "S&P Global",
  SRE: "Sempra", STE: "STERIS", STLD: "Steel Dynamics",
  STT: "State Street", STX: "Seagate Technology", STZ: "Constellation Brands",
  SW: "Smurfit Westrock", SWK: "Stanley Black Decker", SWKS: "Skyworks Solutions",
  SYF: "Synchrony Financial", SYK: "Stryker", SYY: "Sysco",
  T: "AT&T", TAP: "Molson Coors", TDG: "TransDigm Group",
  TDY: "Teledyne Technologies", TECH: "Bio-Techne", TEL: "TE Connectivity",
  TER: "Teradyne", TFC: "Truist Financial", TFX: "Teleflex",
  TGT: "Target", TJX: "TJX Companies", TMO: "Thermo Fisher Scientific",
  TMUS: "T-Mobile", TPL: "Texas Pacific Land", TPR: "Tapestry",
  TRGP: "Targa Resources", TRMB: "Trimble", TROW: "T. Rowe Price",
  TRV: "Travelers Companies", TSCO: "Tractor Supply", TSLA: "Tesla",
  TSN: "Tyson Foods", TT: "Trane Technologies", TTWO: "Take-Two Interactive",
  TXN: "Texas Instruments", TYL: "Tyler Technologies", UAL: "United Airlines",
  UDR: "UDR Inc", UHS: "Universal Health Services", ULTA: "Ulta Beauty",
  UNH: "UnitedHealth Group", UNP: "Union Pacific", UPS: "United Parcel Service",
  URI: "United Rentals", USB: "U.S. Bancorp", V: "Visa",
  VFC: "VF Corporation", VICI: "VICI Properties", VLO: "Valero Energy",
  VMC: "Vulcan Materials", VNO: "Vornado Realty", VRSK: "Verisk Analytics",
  VRSN: "VeriSign", VRTX: "Vertex Pharmaceuticals", VTR: "Ventas",
  VTRS: "Viatris", VZ: "Verizon", WAB: "Wabtec",
  WAT: "Waters Corporation", WBA: "Walgreens Boots Alliance", WBD: "Warner Bros Discovery",
  WDC: "Western Digital", WEC: "WEC Energy", WELL: "Welltower",
  WFC: "Wells Fargo", WHR: "Whirlpool", WM: "Waste Management",
  WMB: "Williams Companies", WMT: "Walmart", WRB: "W.R. Berkley",
  WRK: "WestRock", WST: "West Pharmaceutical", WTW: "Willis Towers Watson",
  WY: "Weyerhaeuser", WYNN: "Wynn Resorts", XEL: "Xcel Energy",
  XOM: "ExxonMobil", XRAY: "Dentsply Sirona", XYL: "Xylem",
  YUM: "Yum Brands", ZBH: "Zimmer Biomet", ZBRA: "Zebra Technologies",
  ZION: "Zions Bancorporation", ZTS: "Zoetis",
  ARE:  "Alexandria Real Estate Equities",
  NVR:  "NVR Inc",
  CARR: "Carrier Global",
  PODD: "Insulet Corporation",
  APP:  "Applovin",
  BN:   "Brookfield Corporation",
  UCO:  "ProShares Ultra Bloomberg Crude Oil",
  IGE:  "iShares North American Natural Resources ETF",
  COPX: "Global X Copper Miners ETF",
  XME:  "SPDR S&P Metals and Mining ETF",
  XLE:  "Energy Select Sector SPDR Fund",
  CEG:  "Constellation Energy",
  NRG:  "NRG Energy",
  MOS:  "Mosaic Company",
  EXPD: "Expeditors International",
  DECK: "Deckers Outdoor",
  AMCR: "Amcor",
  PLTR: "Palantir Technologies",
  PSX:  "Phillips 66",
  SYF:  "Synchrony Financial",
  ETR:  "Entergy",
  ALB:  "Albemarle Corporation",
  SPG:  "Simon Property Group",
  DD:   "DuPont de Nemours",
  FDS:  "FactSet Research Systems",
  ACN:  "Accenture",
  CTAS: "Cintas Corporation"
};

async function fetchCompanyProfile(ticker, retryCount = 0) {
  const maxRetries = 3;
  const profileContainer = document.getElementById("company-profile-container");

  if (retryCount === 0) {
    profileContainer.innerHTML = "<p style='color:#aaa;text-align:center'>Loading company profile...</p>";
  }

  try {
    // Resolve company name from map or use ticker directly
    const companyName = TICKER_MAP[ticker] || ticker;
    console.log(`Looking up Wikipedia for ${ticker} as "${companyName}"`);

    // Build a richer set of search attempts
    const attempts = [
      companyName,
      `${companyName} (company)`,
      `${ticker} (company)`,
      // Strip common suffixes and try again
      companyName.replace(/ Inc\.?$/, "").replace(/ Corp\.?$/, "").replace(/ Corporation$/, "").replace(/ Limited$/, "").replace(/ Ltd\.?$/, "").trim(),
      // Try just the first two words of the company name
      companyName.split(" ").slice(0, 2).join(" "),
      ticker
    ].filter((v, i, arr) => v && arr.indexOf(v) === i); // remove duplicates and empty

    let wikiData = null;

    for (const attempt of attempts) {
      const encoded = encodeURIComponent(attempt);
      const wikiRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
        { headers: { "Accept": "application/json" } }
      );

      if (wikiRes.ok) {
        const data = await wikiRes.json();
        if (data.type !== "disambiguation" && data.extract) {
          wikiData = data;
          console.log(`Wikipedia matched "${attempt}" for ${ticker}`);
          break;
        }
      }
    }

    if (!wikiData) {
      // Show a clean fallback card instead of erroring
      const companyDisplayName = TICKER_MAP[ticker] || ticker;
      profileContainer.innerHTML = `
        <div class="company-profile">
          <div class="profile-header">
            <div class="profile-name-block">
              <h3 class="profile-company-name">${companyDisplayName}</h3>
              <span class="profile-sector">
                <a href="https://finance.yahoo.com/quote/${ticker}" 
                   target="_blank" class="profile-link">
                  View on Yahoo Finance →
                </a>
              </span>
            </div>
            <div class="profile-meta">
              <span class="profile-meta-item">
                🏷️ Ticker: <strong style="color:#00b4d8">${ticker}</strong>
              </span>
            </div>
          </div>
          <p class="profile-description" style="color:#666;font-style:italic;">
            Detailed company description not available. 
            Click the Yahoo Finance link above for full company information.
          </p>
        </div>
      `;
      return;
    }

    const description = wikiData.extract || "No description available.";
    const thumbnail = wikiData.thumbnail?.source || null;
    const pageUrl = wikiData.content_urls?.desktop?.page || "#";

    profileContainer.innerHTML = `
      <div class="company-profile">
        <div class="profile-header">
          <div class="profile-name-block">
            <h3 class="profile-company-name">
              ${thumbnail
                ? `<img src="${thumbnail}" class="profile-logo"
                    alt="${ticker}" onerror="this.style.display='none'" />`
                : ""}
              ${wikiData.title || companyName}
            </h3>
            <span class="profile-sector">
              <a href="${pageUrl}" target="_blank" class="profile-link">
                View full Wikipedia page →
              </a>
            </span>
          </div>
          <div class="profile-meta">
            <span class="profile-meta-item">
              🏷️ Ticker: <strong style="color:#00b4d8">${ticker}</strong>
            </span>
          </div>
        </div>
        <p class="profile-description">
          ${description.length > 800
            ? description.substring(0, 800) + "..."
            : description}
        </p>
      </div>
    `;

  } catch (err) {
    if (retryCount < maxRetries - 1) {
      console.warn(`Profile attempt ${retryCount + 1} failed for ${ticker}, retrying...`);
      setTimeout(() => fetchCompanyProfile(ticker, retryCount + 1), 2000);
    } else {
      console.error(`Could not load profile for ${ticker}:`, err);
      profileContainer.innerHTML = `
        <div style="text-align:center; padding: 12px;">
          <p style="color:#ff6b6b; margin-bottom: 10px;">
            Unable to load company profile for ${ticker}
          </p>
          <button
            onclick="fetchCompanyProfile('${ticker}')"
            style="padding: 8px 16px; cursor: pointer; background: #00b4d8;
                   color: white; border: none; border-radius: 6px; font-size: 14px;">
            🔄 Retry
          </button>
        </div>
      `;
    }
  }
}


// ============ DRAW CHART ============
async function drawChart(ticker, target) {
  fetchStockTable(ticker); 
  fetchCompanyProfile(ticker);  
  const df = globalData.filter((d) => d["name of security"] === ticker);
  if (df.length === 0) return;

  // const entryDate = df.map((d) => new Date(d["entry date"]));
  // const entryPrice = df.map((d) => +d["entry price"]);

  const entryDate = df.map((d) => new Date(d["entry date"]));
  const entryPrice = df.map((d) => +d["entry price"]);
  const today = new Date();

  // Check if any entry prices are missing or zero
  const hasMissingEntryPrices = entryPrice.some(
    (v) => v === null || v === 0 || isNaN(v)
  );

  if (hasMissingEntryPrices) {
    try {
      const proxyUrl = "https://api.allorigins.win/get?url=";

      // Fetch last 6 months of daily prices to cover all possible entry dates
      const yahooUrl = encodeURIComponent(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=6mo`
      );
      const response = await fetch(proxyUrl + yahooUrl);
      const json = await response.json();
      const yahooData = JSON.parse(json.contents);
      const result = yahooData.chart.result[0];

      const timestamps = result.timestamp;
      const closes = result.indicators.quote[0].close;

      // Build a map of date string -> closing price for quick lookup
      const priceByDate = {};
      timestamps.forEach((ts, i) => {
        if (closes[i] !== null && !isNaN(closes[i])) {
          const dateStr = new Date(ts * 1000).toISOString().split("T")[0];
          priceByDate[dateStr] = closes[i];
        }
      });

      // Get the latest available price as fallback for future entry dates
      const latestPrice = [...closes].reverse().find(
        (v) => v !== null && !isNaN(v)
      );

      // Fill in missing entry prices
      for (let i = 0; i < entryPrice.length; i++) {
        if (entryPrice[i] === null || entryPrice[i] === 0 || isNaN(entryPrice[i])) {
          
          const entryDateObj = entryDate[i];
          const entryDateStr = entryDateObj.toISOString().split("T")[0];

          if (entryDateObj <= today) {
            // Entry date is in the past — find exact or closest date in history
            if (priceByDate[entryDateStr]) {
              // Exact match found
              entryPrice[i] = priceByDate[entryDateStr];
              console.log(`${ticker} row ${i}: exact price on ${entryDateStr} = $${entryPrice[i].toFixed(2)}`);
            } else {
              // Find closest available trading date
              const allDates = Object.keys(priceByDate).sort();
              const closest = allDates.reduce((prev, curr) => {
                return Math.abs(new Date(curr) - entryDateObj) 
                  Math.abs(new Date(prev) - entryDateObj)
                  ? curr
                  : prev;
              });
              entryPrice[i] = priceByDate[closest];
              console.log(`${ticker} row ${i}: no exact match for ${entryDateStr}, using closest date ${closest} = $${entryPrice[i].toFixed(2)}`);
            }
          } else {
            // Entry date is in the future — use latest available price
            entryPrice[i] = latestPrice;
            console.log(`${ticker} row ${i}: future entry date ${entryDateStr}, using latest price = $${latestPrice.toFixed(2)}`);
          }
        }
      }
    } catch (err) {
      console.warn(`Could not fetch historical prices for ${ticker}:`, err);
    }
  }

  // Plot only valid entry prices
  const validEntryIndices = entryPrice
    .map((v, i) => (v !== null && v !== 0 && !isNaN(v) ? i : null))
    .filter((i) => i !== null);

  const entryDateFiltered = validEntryIndices.map((i) => entryDate[i]);
  const entryPriceFiltered = validEntryIndices.map((i) => entryPrice[i]);

  const tgtDate = df.map((d) =>
    new Date(d[`target ${target === "T1" ? "1" : "2"} date`])
  );
  const mu = df.map((d) => +d[`mu_h${target === "T1" ? "1" : "2"}`]);
  const yTrue = df.map((d) => +d[`y_true_h${target === "T1" ? "1" : "2"}`]);
  const std = df.map((d) => +d[`std_h${target === "T1" ? "1" : "2"}`]);

  // Only include rows where y_true actually exists (non-zero, non-null, non-NaN)
  const validTrueIndices = yTrue
    .map((v, i) => (v !== null && v !== 0 && !isNaN(v) ? i : null))
    .filter((i) => i !== null);

  const trueDateFiltered = validTrueIndices.map((i) => tgtDate[i]);
  const truePriceFiltered = validTrueIndices.map((i) =>
  entryPrice[i] * yTrue[i]
  );



  const predPrice = entryPrice.map((v, i) => v * Math.exp(mu[i]));
  //const truePrice = entryPrice.map((v, i) => v * Math.exp(yTrue[i]));
  // const predLo = entryPrice.map((v, i) => v * Math.exp(mu[i] - 1.645 * std[i]));
  // const predHi = entryPrice.map((v, i) => v * Math.exp(mu[i] + 1.645 * std[i]));

  // Sort all target date points together to prevent inversion
  const ciPoints = tgtDate.map((date, i) => ({
    date,
    hi: entryPrice[i] * Math.exp(mu[i] + 1.645 * std[i]),
    lo: entryPrice[i] * Math.exp(mu[i] - 1.645 * std[i])
  }))
  .filter((p) => 
    p.date instanceof Date && !isNaN(p.date) &&
    p.hi !== null && !isNaN(p.hi) &&
    p.lo !== null && !isNaN(p.lo) &&
    p.hi > 0 && p.lo > 0
  )
  .sort((a, b) => a.date - b.date);

  // Debug — log to confirm hi is always above lo
  ciPoints.forEach((p, i) => {
    if (p.hi < p.lo) {
      console.warn(`CI inversion at index ${i}, date ${p.date}, hi=${p.hi}, lo=${p.lo}`);
    }
  });

  const ciDates = ciPoints.map((p) => p.date);
  const ciHi = ciPoints.map((p) => Math.max(p.hi, p.lo));
  const ciLo = ciPoints.map((p) => Math.min(p.hi, p.lo));

  // ----- Traces -----

  const entryTrace = {
    x: entryDateFiltered,
    y: entryPriceFiltered,
    mode: "lines+markers",
    name: "Past Entry Price<br>or Today's Price<br>(entry date in future)",
    line: { color: "black", width: 2 },
  };

  const trueTrace = {
    x: trueDateFiltered,
    y: truePriceFiltered,
    mode: "lines+markers",
    name: `Real Price  (${target})`,
    line: { color: target === "T1" ? "green" : "blue" },
  };

  const predTrace = {
    x: tgtDate,
    y: predPrice,
    mode: "lines+markers",
    name: `Predicted Price (${target})`,
    line: { color: target === "T1" ? "orange" : "red", dash: "dot" },
  };

  const ciTrace = {
    x: [...ciDates, ...ciDates.slice().reverse()],
    y: [...ciHi, ...ciLo.slice().reverse()],
    fill: "toself",
    fillcolor: "rgba(30, 144, 255, 0.2)",
    line: { width: 0 },
    name: `90% CI (${target})`,
  };

  const layout = {
    title: `${ticker} — Predicted vs Real (${target})`,
    xaxis: { title: "Date", rangeslider: { visible: true } },
    yaxis: { title: "Price" },
    hovermode: "x unified",
    template: "plotly_white",
    margin: { t: 80, l: 60, r: 60, b: 50 },
  };

  Plotly.newPlot("chart", [entryTrace, trueTrace, predTrace, ciTrace], layout, {
    responsive: true,
  });
}

// ============ SPREADSHEET PREVIEW ============
async function loadSpreadsheetPreview() {
  const tabsContainer = document.getElementById("previewTabs");
  const sheetContainer = document.getElementById("spreadsheet-container");

  if (!tabsContainer) return;

  try {
    // Load SheetJS from CDN
    if (typeof XLSX === "undefined") {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }

    sheetContainer.innerHTML = "<p style='color:#aaa;text-align:center;padding:20px;'>Loading spreadsheet...</p>";

    const response = await fetch("data/Retirement analysis_PROT14v4_p.xlsm");
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    // Build sheet tabs
    tabsContainer.innerHTML = "";
    // TO:
    // Track first renderable sheet for default display
    let firstRenderableSheet = null;

    workbook.SheetNames.forEach((name, index) => {
      const tab      = document.createElement("button");
      const sheet    = workbook.Sheets[name];

      // ===== Skip hidden sheets entirely =====
      const sheetInfo = workbook.Workbook?.Sheets?.find(s => s.name === name);
      const isHidden  = sheetInfo && sheetInfo.Hidden !== 0; // 0 = visible, 1 = hidden, 2 = very hidden
      if (isHidden) {
        console.log(`Skipping hidden sheet: ${name}`);
        return; // skip — don't create a tab at all
      }

      let canRender  = true;

      // Test if sheet can be rendered before wiring up tab
      try {
        XLSX.utils.sheet_to_html(sheet, { editable: false });
      } catch (e) {
        canRender = false;
      }

      tab.className   = "preview-tab" + (index === 0 ? " active" : "");
      tab.textContent = name;

      if (!canRender) {
        // Dim the tab — sheet has images or unsupported content
        tab.style.opacity = "0.5";
        tab.style.cursor  = "default";
        tab.title         = "This sheet contains images or charts and cannot be previewed";
        tab.onclick = () => {
          document.querySelectorAll(".preview-tab").forEach(t => t.classList.remove("active"));
          tab.classList.add("active");
          sheetContainer.innerHTML = `
            <div style="text-align:center; padding:40px 20px;">
              <div style="font-size:32px; margin-bottom:16px;">🖼️</div>
              <p style="color:#aaa; font-size:15px; margin-bottom:8px;">
                This sheet contains images or charts that cannot be previewed here.
              </p>
              <p style="color:#666; font-size:13px;">
                Download the spreadsheet to view the full content including all visuals.
              </p>
            </div>
          `;
        };
      } else {
        // Normal renderable sheet
        if (!firstRenderableSheet) firstRenderableSheet = name;
        tab.onclick = () => {
          document.querySelectorAll(".preview-tab").forEach(t => t.classList.remove("active"));
          tab.classList.add("active");
          renderSheet(workbook, name, sheetContainer);
        };
      }

      tabsContainer.appendChild(tab);
    });

    // Render first renderable sheet by default (skip image-only sheets)
    if (firstRenderableSheet) {
      renderSheet(workbook, firstRenderableSheet, sheetContainer);
    } else {
      sheetContainer.innerHTML = `
        <div style="text-align:center; padding:40px 20px;">
          <p style="color:#aaa; font-size:15px;">
            No previewable sheets found in this workbook.
          </p>
        </div>
      `;
    }

  } catch (err) {
    console.error("Spreadsheet preview error:", err);
    sheetContainer.innerHTML = "<p style='color:#ff6b6b;text-align:center;padding:20px;'>Unable to load spreadsheet preview.</p>";
  }
}

// TO:
function renderSheet(workbook, sheetName, container) {
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    console.warn(`Sheet "${sheetName}" not found in workbook`);
    container.innerHTML = `
      <div style="text-align:center; padding:40px 20px;">
        <p style="color:#aaa; font-size:15px;">Sheet not found.</p>
      </div>
    `;
    return;
  }

  try {
    const html = XLSX.utils.sheet_to_html(sheet, { editable: false });
    container.innerHTML = html;

    // Apply dark theme styling to generated table
    const table = container.querySelector("table");
    if (table) {
      table.style.borderCollapse = "collapse";
      table.style.width          = "100%";
      table.style.fontSize       = "13px";
      table.style.color          = "#ccc";
    }
  } catch (e) {
    // Sheet contains images or unsupported objects
    console.warn(`Sheet "${sheetName}" cannot be previewed:`, e.message);
    container.innerHTML = `
      <div style="text-align:center; padding:40px 20px;">
        <div style="font-size:32px; margin-bottom:16px;">🖼️</div>
        <p style="color:#aaa; font-size:15px; margin-bottom:8px;">
          This sheet contains images or charts that cannot be previewed here.
        </p>
        <p style="color:#666; font-size:13px;">
          Download the spreadsheet to view the full content including all visuals.
        </p>
      </div>
    `;
  }
}

// Auto load preview on page load
loadSpreadsheetPreview();

function generatePrompt() {
  const userInput = document.getElementById("userQuestion").value;

  if (!userInput) {
    alert("Please enter a question.");
    return;
  }

  const structuredPrompt = `
You are a professional financial analyst.

Analyze the following request in detail:

"${userInput}"

Provide:
1. Fundamental analysis (revenue, earnings, margins)
2. Valuation metrics (PE, PS, intrinsic value if possible)
3. Risks and macro considerations
4. Short-term vs long-term outlook
5. Investment recommendation with reasoning

Be detailed, structured, and data-driven.
  `;

  document.getElementById("generatedPrompt").value = structuredPrompt;
}

function openChatGPT() {
  const prompt = document.getElementById("generatedPrompt").value;

  if (!prompt) {
    alert("Generate a prompt first.");
    return;
  }

  const url = `https://chat.openai.com/?prompt=${encodeURIComponent(prompt)}`;
  window.open(url, "_blank");
}

// ============ PRICE CACHE (sessionStorage) ============

function savePrice(key, price, change, changePct, isPositive) {
  try {
    sessionStorage.setItem(`price_cache_${key}`, JSON.stringify({
      price, change, changePct, isPositive,
      savedAt: Date.now()
    }));
  } catch (e) {
    console.warn("Cache save failed:", e.message);
  }
}

function loadPrice(key) {
  try {
    const raw = sessionStorage.getItem(`price_cache_${key}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Cache expires after 15 minutes
    if (Date.now() - data.savedAt > 15 * 60 * 1000) {
      sessionStorage.removeItem(`price_cache_${key}`);
      return null;
    }

    // Also expire if cached on a different calendar day
    const cachedDate  = new Date(data.savedAt).toDateString();
    const todayDate   = new Date().toDateString();
    if (cachedDate !== todayDate) {
      sessionStorage.removeItem(`price_cache_${key}`);
      return null;
    }

    return data;
  } catch (e) {
    return null;
  }
}



// ============ PROXY REFRESH TRACKER ============   ← ADD HERE
// Tracks when proxies last ran successfully
// Prevents duplicate proxy runs within 30 minutes

function saveProxyRefreshTime() {
  sessionStorage.setItem("last_proxy_refresh", Date.now().toString());
}

function wasProxyRefreshedRecently() {
  const last = sessionStorage.getItem("last_proxy_refresh");
  if (!last) return false;
  const ageMs = Date.now() - parseInt(last);
  return ageMs < 30 * 60 * 1000;
}

// ============ FILE + CACHE FRESHNESS TRACKER ============
// During market hours — 15 min is fresh enough
// Prevents unnecessary proxy calls when file is being updated regularly

const MARKET_FRESH_MS  = 15 * 60 * 1000; // 15 minutes
const OUTSIDE_FRESH_MS = 30 * 60 * 1000; // 30 minutes

function savePriceRefreshTime(source) {
  // source = "file" or "proxy"
  sessionStorage.setItem("last_price_refresh",      Date.now().toString());
  sessionStorage.setItem("last_price_refresh_source", source);
}

function getPriceRefreshAge() {
  const last = sessionStorage.getItem("last_price_refresh");
  if (!last) return Infinity;
  return Date.now() - parseInt(last);
}

function wasPricesRefreshedRecently() {
  const ageMs    = getPriceRefreshAge();
  const source   = sessionStorage.getItem("last_price_refresh_source") || "unknown";
  const threshold = isMarketHours() ? MARKET_FRESH_MS : OUTSIDE_FRESH_MS;

  if (ageMs < threshold) {
    console.log(`Prices fresh — last ${source} refresh was ${Math.round(ageMs/60000)}min ago`);
    return true;
  }
  return false;
}


// ============ PICK PRICES FROM JSON FILE ====================
// Loaded from data/pick_prices.json which is updated every 15min
// by GitHub Action during market hours — no proxy needed

let pickPricesCache = {};       // prices from JSON file
let pickPricesUpdated = null;   // timestamp from JSON file

async function loadPickPricesFromFile() {
  try {
    const url      = `data/pick_prices.json?v=${Date.now()}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data        = await response.json();
    pickPricesCache   = data.prices  || {};
    pickPricesUpdated = data.updated || null;

    console.log(`Pick prices loaded — last updated: ${pickPricesUpdated}`);

    // Check staleness
    if (isPickPricesStale()) {
      if (isMarketHours()) {
        console.warn("Market open + stale file → proxy will fetch fresh prices");
      } else if (isAfterMarketClose()) {
        console.warn("After close + stale file → proxy will fetch closing prices");
      } else {
        console.warn("Outside market hours + stale file → proxy will fetch");
      }
      pickPricesCache = {};
      return true;
    }

    // File is fresh — save the refresh time
    savePriceRefreshTime("file");
    console.log("✅ File prices are fresh — applying to cards");
    return true;

  } catch (e) {
    console.warn("Could not load pick_prices.json:", e.message);
    return false;
  }
}

// ============ MARKET HOURS CHECK ============
function isMarketHours() {
  const now        = new Date();
  const weekday    = now.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;

  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  // 13:30 UTC = 9:30am ET open
  // 20:00 UTC = 4:00pm ET close
  return utcMinutes >= 810 && utcMinutes < 1200;
}

// ============ CHECK IF JUST AFTER CLOSE ============
// Returns true if we are within 2 hours after market close
// This is the window where we want fresh closing prices
function isAfterMarketClose() {
  const now        = new Date();
  const weekday    = now.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;

  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  // 20:00 UTC = 4pm ET close
  // 22:00 UTC = 6pm ET (2hr window after close)
  return utcMinutes >= 1200 && utcMinutes <= 1320;
}

// ============ FILE STALENESS CHECK ============
function isPickPricesStale() {
  if (!pickPricesUpdated) return true;

  // If prices were already refreshed recently this session
  // (from file OR proxy) — skip the staleness check entirely
  if (wasPricesRefreshedRecently()) {
    return false;
  }

  try {
    const fileTime = new Date(
      pickPricesUpdated
        .replace(" UTC", "")
        .replace(" ", "T")
        + "Z"
    );
    const ageMs  = Date.now() - fileTime.getTime();
    const ageMin = Math.round(ageMs / 60000);

    console.log(`pick_prices.json age: ${ageMin} minutes`);

    if (isMarketHours()) {
      const stale = ageMs > MARKET_FRESH_MS;
      if (stale) console.warn(`⚠️ File stale during market hours (${ageMin}min)`);
      return stale;
    }

    if (isAfterMarketClose()) {
      const stale = ageMs > OUTSIDE_FRESH_MS;
      if (stale) console.warn(`⚠️ File stale after close (${ageMin}min)`);
      return stale;
    }

    // Outside market hours
    if (ageMs > OUTSIDE_FRESH_MS) {
      if (wasProxyRefreshedRecently()) {
        console.log(`File old but proxy ran recently — skipping`);
        return false;
      }
      console.warn(`⚠️ File is ${ageMin}min old outside market hours`);
      return true;
    }

    console.log(`Outside market hours — file fresh enough (${ageMin}min old)`);
    return false;

  } catch (e) {
    console.warn("Could not parse file timestamp:", e.message);
    return true;
  }
}

// ============ PRICE FRESHNESS CHECK ====================
// Checks if prices need refreshing and does so automatically
// Triggers on: 15min interval, page visibility change, manual click

const PRICE_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
let lastPriceRefresh   = Date.now();

async function refreshPickPrices() {
  console.log("🔄 Refreshing pick prices...");

  // Clear session cache
  Q2_PICKS.forEach(ticker => {
    sessionStorage.removeItem(`price_cache_q2_${ticker}`);
  });
  TACTICAL_PICKS.forEach(ticker => {
    sessionStorage.removeItem(`price_cache_tac_${ticker}`);
  });

  // Re-fetch the file
  await loadPickPricesFromFile();

  if (isPickPricesStale()) {
    // File is stale — GitHub Action missed its window
    // Fetch fresh prices via proxy WITHOUT rebuilding the card grid
    console.warn("⚠️ File stale — fetching fresh prices via proxy...");

    // Fetch Q2 first
    for (let i = 0; i < Q2_PICKS.length; i++) {
      await new Promise(r => setTimeout(r, i * 500));
      fetchPickPrice(Q2_PICKS[i]);
    }

    // Wait for Q2 to settle before starting tactical
    await new Promise(r => setTimeout(r, Q2_PICKS.length * 500 + 5000));

    // Then fetch tactical
    for (let i = 0; i < TACTICAL_PICKS.length; i++) {
      await new Promise(r => setTimeout(r, i * 500));
      fetchTacticalPrice(TACTICAL_PICKS[i]);
    }


    console.log(`Proxy refresh started — Q2: ${Q2_PICKS.length}, Tactical: ${TACTICAL_PICKS.length}`);
    savePriceRefreshTime("proxy");
    lastPriceRefresh = Date.now();
    return;
  }

  // File is fresh — apply to all cards
  Q2_PICKS.forEach(ticker      => applyFilePriceToQ2Card(ticker));
  TACTICAL_PICKS.forEach(ticker => applyFilePriceToTacticalCard(ticker));

  lastPriceRefresh = Date.now();
  console.log(`✅ Prices refreshed at ${new Date().toLocaleTimeString()}`);
}


function startPickPriceAutoRefresh() {
  // 1 — Interval every 15 minutes
  setInterval(() => {
    console.log("15 min interval — auto-refreshing prices...");
    refreshPickPrices();
  }, PRICE_MAX_AGE_MS);

  // 2 — Refresh when tab becomes visible again
  // (catches case where user switches tabs and comes back)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const ageMs = Date.now() - lastPriceRefresh;
      if (ageMs > PRICE_MAX_AGE_MS) {
        console.log(`Tab visible — prices are ${Math.round(ageMs/60000)}min old, refreshing...`);
        refreshPickPrices();
      } else {
        console.log(`Tab visible — prices are ${Math.round(ageMs/60000)}min old, still fresh`);
      }
    }
  });

  // 3 — Refresh on browser back/forward navigation
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      // Page was loaded from cache (back button)
      console.log("Page restored from cache — refreshing prices...");
      refreshPickPrices();
    }
  });

  console.log("⏰ Auto-refresh active — every 15min, on tab focus, and on navigation");
}

// Apply a price from the JSON file to a Q2 card
function applyFilePriceToQ2Card(ticker) {
  const data = pickPricesCache[ticker];
  if (!data || data.price === null) return false;

  const priceEl  = document.getElementById(`price-${ticker}`);
  const changeEl = document.getElementById(`change-${ticker}`);
  const card     = document.getElementById(`pick-${ticker}`);
  if (!priceEl) return false;

  priceEl.innerHTML = `<span class="pick-price-value">$${data.price.toFixed(2)}</span>`;

  if (changeEl && data.change !== null) {
    changeEl.innerHTML = `
      <span class="pick-change-value ${data.isPositive ? "positive" : "negative"}">
        ${data.isPositive ? "▲" : "▼"} $${Math.abs(data.change).toFixed(2)}
        (${data.isPositive ? "+" : ""}${data.changePct.toFixed(2)}%)
      </span>
    `;
  }

  if (card) {
    card.classList.remove("pick-positive", "pick-negative");
    card.classList.add(data.isPositive ? "pick-positive" : "pick-negative");
  }

  // Also save to session cache so it persists during navigation
  savePrice(`q2_${ticker}`, data.price, data.change, data.changePct, data.isPositive);
  return true;
}

// Apply a price from the JSON file to a Tactical card
function applyFilePriceToTacticalCard(ticker) {
  const data = pickPricesCache[ticker];
  if (!data || data.price === null) return false;

  const priceEl  = document.getElementById(`tactical-price-${ticker}`);
  const changeEl = document.getElementById(`tactical-change-${ticker}`);
  const card     = document.getElementById(`tactical-pick-${ticker}`);
  if (!priceEl) return false;

  priceEl.innerHTML = `<span class="pick-price-value">$${data.price.toFixed(2)}</span>`;

  if (changeEl && data.change !== null) {
    changeEl.innerHTML = `
      <span class="pick-change-value ${data.isPositive ? "positive" : "negative"}">
        ${data.isPositive ? "▲" : "▼"} $${Math.abs(data.change).toFixed(2)}
        (${data.isPositive ? "+" : ""}${data.changePct.toFixed(2)}%)
      </span>
    `;
  }

  if (card) {
    card.classList.remove("pick-positive", "pick-negative");
    card.classList.add(data.isPositive ? "pick-positive" : "pick-negative");
  }

  // Also save to session cache
  savePrice(`tac_${ticker}`, data.price, data.change, data.changePct, data.isPositive);
  return true;
}

// ============ CHECK IF FILE PRICES ARE FROM TODAY ============
function isFilePriceFromToday() {
  if (!pickPricesUpdated) return false;
  try {
    const fileTime = new Date(
      pickPricesUpdated
        .replace(" UTC", "")
        .replace(" ", "T")
        + "Z"
    );
    return fileTime.toDateString() === new Date().toDateString();
  } catch (e) {
    return false;
  }
}


// ============ Q2 FUNDAMENTAL PICKS ============
const Q2_PICKS = [
  "ALB", "SPG", "ETR", "COST",
  "CEG", "ARE","IFF",
  "CTAS", "PLTR", "PSX",
  "LITE", "ECHO", "SNDK", "WBD",
  "GRMN", "BR"
];

const TACTICAL_PICKS = [
"NFLX", "SNDK", "ECHO", "FCX",
"GS", "WDC", "BN", "URA",
"APO", "COPX", "EWY", "SMH"
];

async function loadQ2Picks() {
  const grid = document.getElementById("picksGrid");
  if (!grid) return;

  // Build initial cards with loading state
  grid.innerHTML = Q2_PICKS.map(ticker => `
    <div class="pick-card" id="pick-${ticker}">
      <div class="pick-ticker">
        <a href="https://finance.yahoo.com/quote/${ticker}"
           target="_blank"
           class="ticker-yahoo-link"
           title="View ${ticker} on Yahoo Finance">
          ${ticker}
        </a>
      </div>
      <div class="pick-price" id="price-${ticker}">
        <span style="color:#aaa;font-size:13px;">Loading...</span>
      </div>
      <div class="pick-change" id="change-${ticker}"></div>
      <button class="pick-btn" onclick="loadChart('${ticker}')">
        View Chart
      </button>
    </div>
  `).join("");

  // Wait 3 seconds for stock table and profile to finish first
  await new Promise(resolve => setTimeout(resolve, 3000));

  // ===== STEP 1: Apply prices from session cache (instant) =====
  Q2_PICKS.forEach(ticker => {
    const cached = loadPrice(`q2_${ticker}`);
    if (cached) {
      console.log(`${ticker} Q2 — loaded from session cache`);
      document.getElementById(`price-${ticker}`).innerHTML =
        `<span class="pick-price-value">$${cached.price.toFixed(2)}</span>`;
      document.getElementById(`change-${ticker}`).innerHTML = `
        <span class="pick-change-value ${cached.isPositive ? "positive" : "negative"}">
          ${cached.isPositive ? "▲" : "▼"} $${Math.abs(cached.change).toFixed(2)}
          (${cached.isPositive ? "+" : ""}${cached.changePct.toFixed(2)}%)
        </span>`;
      const card = document.getElementById(`pick-${ticker}`);
      if (card) card.classList.add(cached.isPositive ? "pick-positive" : "pick-negative");
    }
  });

  // Cache staleness result once — prevents double evaluation
  const fileIsStale = isPickPricesStale();

  // ===== Show refreshing indicator if file is stale =====
  // Only on cards that don't already have a price from session cache
  if (fileIsStale) {
    Q2_PICKS.forEach(ticker => {
      const priceEl = document.getElementById(`price-${ticker}`);
      if (priceEl
          && !priceEl.querySelector(".price-refreshing")
          && !priceEl.innerHTML.includes("pick-price-value")) {
        priceEl.innerHTML += `<div class="price-refreshing">⟳ refreshing...</div>`;
      }
    });
  }

  // ===== STEP 2: Apply any prices from JSON file =====
  Q2_PICKS.forEach(ticker => {
    const priceEl = document.getElementById(`price-${ticker}`);
    const alreadyLoaded = priceEl && priceEl.innerHTML.includes("pick-price-value");
    if (!alreadyLoaded) {
      applyFilePriceToQ2Card(ticker);
    }
  });

  // ===== STEP 3: Find remaining =====
  const stillNeeded = Q2_PICKS.filter(ticker => {
    const el = document.getElementById(`price-${ticker}`);
    return el && !el.innerHTML.includes("pick-price-value");
  });

  // Use cached fileIsStale — don't call isPickPricesStale() again
  const needsProxy = fileIsStale
    ? Q2_PICKS.filter(ticker => {
        const cached = loadPrice(`q2_${ticker}`);
        return !cached;
      })
    : stillNeeded;

  if (fileIsStale) {
    console.warn(`pick_prices.json is stale — ${needsProxy.length} Q2 picks need proxy, ${Q2_PICKS.length - needsProxy.length} served from session cache`);
  }

  console.log(`Q2 — ${Q2_PICKS.length - stillNeeded.length} loaded from cache/file, ${needsProxy.length} need proxy fetch`);

  // If everything loaded from cache — skip proxy entirely
  if (needsProxy.length === 0) {
    // Clean up any refreshing indicators before returning
    Q2_PICKS.forEach(ticker => {
      const priceEl = document.getElementById(`price-${ticker}`);
      if (priceEl) {
        const refreshEl = priceEl.querySelector(".price-refreshing");
        if (refreshEl) refreshEl.remove();
      }
    });
    console.log(fileIsStale
      ? "✅ All Q picks served from session cache — no proxy needed!"
      : "✅ All Q picks loaded from fresh file — no proxy needed!");
    return;
  }

  // ===== STEP 4: Proxy fetch =====

  // If file is stale — show refreshing indicator on all cards
  if (fileIsStale) {
    needsProxy.forEach(ticker => {
      const priceEl = document.getElementById(`price-${ticker}`);
      //if (priceEl) {
      //  const currentHtml = priceEl.innerHTML;
      //  priceEl.innerHTML = currentHtml +
      //    `<div class="price-refreshing">⟳ refreshing...</div>`;
      //}
    });
  }


  for (let i = 0; i < needsProxy.length; i++) {
    await new Promise(resolve => setTimeout(resolve, i * 400));
    fetchPickPrice(needsProxy[i]);
  }

  await new Promise(resolve => setTimeout(resolve, needsProxy.length * 400 + 3000));

// ===== STEP 5: Retry loop — never gives up on Q2 =====
  // Calculator depends on prices so we cannot end with Yahoo links
  let PROXY_TIMEOUT_MS     = 30000;
  let proxyStart           = Date.now();
  let retryRound           = 1;
  const maxRoundsNoProgress = 10;
  let roundsWithNoProgress  = 0;
  let lastFailedCount       = needsProxy.length;

  while (true) {
    const failedTickers = Q2_PICKS.filter(ticker => {
      const el = document.getElementById(`price-${ticker}`);
      return el && (
        el.innerHTML.includes("Unavailable") ||
        el.innerHTML.includes("Loading")     ||
        el.innerHTML.includes("refreshing")  ||
        el.innerHTML.includes("Retrying")
      );
    });

    // All done — exit loop
    if (failedTickers.length === 0) {
      console.log("✅ All Q2 picks loaded successfully!");
      break;
    }

    // 30s passed — try file as interim but keep retrying
    // Never show Yahoo link — calculator needs real prices
    if (Date.now() - proxyStart > PROXY_TIMEOUT_MS) {
      console.warn(`Q — 30s passed, ${failedTickers.length} still missing — applying file prices as interim...`);

      // 30s interim fallback
      failedTickers.forEach(ticker => {
        const el = document.getElementById(`price-${ticker}`);
        if (isFilePriceFromToday()) {                    // ← add check
          const applied = applyFilePriceToQ2Card(ticker);
          if (applied) {
            console.log(`${ticker} — interim file price applied`);
          } else {
            if (el) el.innerHTML =
              `<span style="color:#aaa;font-size:11px;">⟳ fetching...</span>`;
          }
        } else {
          // File is from a different day — don't show stale prices
          if (el && !el.innerHTML.includes("pick-price-value")) {
            el.innerHTML =
              `<span style="color:#aaa;font-size:11px;">⟳ fetching...</span>`;
          }
        }
      });

      // Reset clock and progress — keep trying
      proxyStart           = Date.now();
      roundsWithNoProgress = 0;
      lastFailedCount      = failedTickers.length;
    }

    // Check progress
    if (failedTickers.length >= lastFailedCount) {
      roundsWithNoProgress++;
    } else {
      roundsWithNoProgress = 0;
    }

    // No progress for many rounds — pause 2 min then restart
    if (roundsWithNoProgress >= maxRoundsNoProgress) {
      console.warn(`⚠️ Q — no progress for ${maxRoundsNoProgress} rounds`);
      console.warn("Applying file prices as interim and pausing 2 minutes before retry...");

      // maxRounds interim fallback
      failedTickers.forEach(ticker => {
        const el = document.getElementById(`price-${ticker}`);
        if (isFilePriceFromToday()) {                    // ← add check
          const applied = applyFilePriceToQ2Card(ticker);
          if (!applied) {
            if (el) el.innerHTML =
              `<span style="color:#aaa;font-size:11px;">⟳ fetching...</span>`;
          }
        } else {
          if (el && !el.innerHTML.includes("pick-price-value")) {
            el.innerHTML =
              `<span style="color:#aaa;font-size:11px;">⟳ fetching...</span>`;
          }
        }
      });

      // Wait 2 minutes then reset and try again
      await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000));
      roundsWithNoProgress = 0;
      lastFailedCount      = failedTickers.length;
      proxyStart           = Date.now();
      retryRound           = 1;
      console.log("Q — resuming proxy retries after 2min pause...");
    }

    lastFailedCount = failedTickers.length;

    // Show retrying status on failed cards
    failedTickers.forEach(ticker => {
      const el = document.getElementById(`price-${ticker}`);
      // Only show retrying if not already showing a real price from file
      if (el && !el.innerHTML.includes("pick-price-value")) {
        el.innerHTML =
          `<span style="color:#aaa;font-size:11px;">Retrying (${retryRound})...</span>`;
      }
    });

    const backoff = Math.min(3000 + retryRound * 500, 10000);
    await new Promise(resolve => setTimeout(resolve, backoff));

    for (let i = 0; i < failedTickers.length; i++) {
      await new Promise(resolve => setTimeout(resolve, i * 500));
      fetchPickPrice(failedTickers[i]);
    }

    await new Promise(resolve => setTimeout(resolve, failedTickers.length * 500 + 3000));
    retryRound++;
  }
}

async function fetchPickPrice(ticker, retryCount = 0) {
  const maxRetries = 3;
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`;

    const proxies = [
      async () => {
        const r = await fetch(
          `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        return JSON.parse(j.contents);
      },
      async () => {
        const r = await fetch(
          `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      },
      async () => {
        const v2Url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`;
        const r     = await fetch(
          `https://api.allorigins.win/get?url=${encodeURIComponent(v2Url)}`,
          { signal: AbortSignal.timeout(20000) }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        return JSON.parse(j.contents);
      },
      async () => {
        const v2Url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`;
        const r     = await fetch(
          `https://corsproxy.io/?${encodeURIComponent(v2Url)}`,
          { signal: AbortSignal.timeout(20000) }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      },
    ];

    let data = null;
    for (let p = 0; p < proxies.length; p++) {
      try {
        data = await proxies[p]();
        console.log(`${ticker} Q2 — Proxy ${p + 1} succeeded`);
        break;
      } catch (e) {
        console.warn(`${ticker} Q2 — Proxy ${p + 1} failed: ${e.message}`);
        if (p < proxies.length - 1) await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!data) throw new Error("All proxies failed");

    const result      = data.chart.result[0];
    const meta        = result.meta || {};
    const closes      = result.indicators.quote[0].close;
    const validCloses = closes.filter(v => v !== null && !isNaN(v));

    const latestPrice = meta.regularMarketPrice || validCloses[validCloses.length - 1];
    const prevPrice   = validCloses[0] || meta.chartPreviousClose;
    const change      = latestPrice - prevPrice;
    const changePct   = (change / prevPrice) * 100;
    const isPositive  = change >= 0;

    savePrice(`q2_${ticker}`, latestPrice, change, changePct, isPositive);

    // ===== Remove refreshing indicator before updating price =====
    const priceElSuccess = document.getElementById(`price-${ticker}`);
    if (priceElSuccess) {
      const refreshEl = priceElSuccess.querySelector(".price-refreshing");
      if (refreshEl) refreshEl.remove();
    }

    document.getElementById(`price-${ticker}`).innerHTML =
      `<span class="pick-price-value">$${latestPrice.toFixed(2)}</span>`;
    document.getElementById(`change-${ticker}`).innerHTML = `
      <span class="pick-change-value ${isPositive ? "positive" : "negative"}">
        ${isPositive ? "▲" : "▼"} $${Math.abs(change).toFixed(2)}
        (${isPositive ? "+" : ""}${changePct.toFixed(2)}%)
      </span>`;

    const card = document.getElementById(`pick-${ticker}`);
    if (card) {
      card.classList.remove("pick-positive", "pick-negative");
      card.classList.add(isPositive ? "pick-positive" : "pick-negative");
    }

  } catch (err) {
    const priceEl  = document.getElementById(`price-${ticker}`);
    const changeEl = document.getElementById(`change-${ticker}`);

    // Remove refreshing indicator
    if (priceEl) {
      const refreshEl = priceEl.querySelector(".price-refreshing");
      if (refreshEl) refreshEl.remove();
    }

    if (retryCount < maxRetries - 1) {
      const waitTime = (retryCount + 1) * 3000;
      setTimeout(() => fetchPickPrice(ticker, retryCount + 1), waitTime);
    } else {
      // All standard retries exhausted — try file cache as last resort
      const fileData    = pickPricesCache[ticker];
      const today       = new Date().toDateString();
      const fileUpdated = pickPricesUpdated
        ? new Date(pickPricesUpdated.replace(" UTC","").replace(" ","T") + "Z").toDateString()
        : null;
      const isSameDay   = fileUpdated === today;
      const appliedFromFile = isSameDay && fileData?.price
        ? applyFilePriceToQ2Card(ticker)
        : false;

      if (appliedFromFile) {
        if (priceEl) {
          priceEl.innerHTML =
            `<span class="pick-price-value" title="Price from last file update — refreshing">
              ~$${fileData.price.toFixed(2)}
             </span>
             <div class="price-refreshing" style="color:#888;">↻ retrying...</div>`;
        }
      } else if (!applyFilePriceToQ2Card(ticker)) {
        if (priceEl) {
          priceEl.innerHTML = `
            <a href="https://finance.yahoo.com/quote/${ticker}" target="_blank"
               style="color:#00b4d8;font-size:11px;text-decoration:none;">
              View on Yahoo →
            </a>`;
        }
      }

      // Keep retrying in background every 2 minutes
      setTimeout(() => {
        // Only retry if still not showing a real price
        const el = document.getElementById(`price-${ticker}`);
        if (el && !el.innerHTML.includes("pick-price-value")) {
          fetchPickPrice(ticker, 0);
        } else {
          console.log(`${ticker} — background retry cancelled, price already loaded`);
        }
      }, 2 * 60 * 1000);
    }
  }
}

// ============ TACTICAL ROTATION PICKS ============

async function loadTacticalPicks() {
  const grid = document.getElementById("tacticalPicksGrid");
  if (!grid) return;

  grid.innerHTML = TACTICAL_PICKS.map(ticker => `
    <div class="pick-card tactical-card" id="tactical-pick-${ticker}">
      <div class="pick-ticker">
        <a href="https://finance.yahoo.com/quote/${ticker}"
           target="_blank"
           class="ticker-yahoo-link tactical-ticker-link"
           title="View ${ticker} on Yahoo Finance">
          ${ticker}
        </a>
      </div>
      <div class="pick-price" id="tactical-price-${ticker}">
        <span style="color:#aaa;font-size:13px;">Loading...</span>
      </div>
      <div class="pick-change" id="tactical-change-${ticker}"></div>
      <button class="pick-btn tactical-btn" onclick="loadChart('${ticker}')">
        View Chart
      </button>
    </div>
  `).join("");

  await waitForFundamentalPicksComplete();
  console.log("Starting tactical picks fetch...");

// ===== STEP 1: Apply session cache =====
  TACTICAL_PICKS.forEach(ticker => {
    const cached = loadPrice(`tac_${ticker}`);
    if (cached) {
      document.getElementById(`tactical-price-${ticker}`).innerHTML =
        `<span class="pick-price-value">$${cached.price.toFixed(2)}</span>`;
      document.getElementById(`tactical-change-${ticker}`).innerHTML = `
        <span class="pick-change-value ${cached.isPositive ? "positive" : "negative"}">
          ${cached.isPositive ? "▲" : "▼"} $${Math.abs(cached.change).toFixed(2)}
          (${cached.isPositive ? "+" : ""}${cached.changePct.toFixed(2)}%)
        </span>`;
      const card = document.getElementById(`tactical-pick-${ticker}`);
      if (card) card.classList.add(cached.isPositive ? "pick-positive" : "pick-negative");
    }
  });

  // Cache staleness result once — prevents double evaluation
  const fileIsStale = isPickPricesStale();

  // ===== Show refreshing indicator if file is stale =====
  // Only on cards that don't already have a price from session cache
  if (fileIsStale) {
    TACTICAL_PICKS.forEach(ticker => {
      const priceEl = document.getElementById(`tactical-price-${ticker}`);
      if (priceEl
          && !priceEl.querySelector(".price-refreshing")
          && !priceEl.innerHTML.includes("pick-price-value")) {
        priceEl.innerHTML += `<div class="price-refreshing">⟳ refreshing...</div>`;
      }
    });
  }

  // ===== STEP 2: Apply file prices =====
  TACTICAL_PICKS.forEach(ticker => {
    const priceEl = document.getElementById(`tactical-price-${ticker}`);
    const alreadyLoaded = priceEl && priceEl.innerHTML.includes("pick-price-value");
    if (!alreadyLoaded) applyFilePriceToTacticalCard(ticker);
  });

  // ===== STEP 3: Find remaining =====
  const stillNeeded = TACTICAL_PICKS.filter(ticker => {
    const el = document.getElementById(`tactical-price-${ticker}`);
    return el && !el.innerHTML.includes("pick-price-value");
  });

  // Use cached fileIsStale — don't call isPickPricesStale() again
  const needsProxy = fileIsStale
    ? TACTICAL_PICKS.filter(ticker => {       // ← was Q2_PICKS
        const cached = loadPrice(`tac_${ticker}`); // ← was q2_${ticker}
        return !cached;
      })
    : stillNeeded;

  if (fileIsStale) {
    console.warn(`pick_prices.json is stale — ${needsProxy.length} Tactical picks need proxy, ${TACTICAL_PICKS.length - needsProxy.length} served from session cache`);
  }

  console.log(`Tactical — ${TACTICAL_PICKS.length - stillNeeded.length} from cache/file, ${needsProxy.length} need proxy`);

  if (needsProxy.length === 0) {
    // Clean up any refreshing indicators before returning
    TACTICAL_PICKS.forEach(ticker => {
      const priceEl = document.getElementById(`tactical-price-${ticker}`);
      if (priceEl) {
        const refreshEl = priceEl.querySelector(".price-refreshing");
        if (refreshEl) refreshEl.remove();
      }
    });
    console.log(fileIsStale
      ? "✅ All tactical picks served from session cache — no proxy needed!"
      : "✅ All tactical picks loaded from fresh file — no proxy needed!");
    return;
  }

  // ===== STEP 4: Proxy fetch for missing =====

  // Add refreshing indicator to any not already showing it
  if (fileIsStale) {
    needsProxy.forEach(ticker => {
      const priceEl = document.getElementById(`tactical-price-${ticker}`); 
      //if (priceEl && !priceEl.querySelector(".price-refreshing")) {
      //  priceEl.innerHTML += `<div class="price-refreshing">⟳ refreshing...</div>`;
      //}
    });
  }

  for (let i = 0; i < needsProxy.length; i++) {
    await new Promise(resolve => setTimeout(resolve, i * 400));
    fetchTacticalPrice(needsProxy[i]);
  }

  await new Promise(resolve => setTimeout(resolve, needsProxy.length * 400 + 3000));

// ===== STEP 5: Retry loop — never gives up on Tactical =====
  // Calculator depends on prices so we cannot end with Yahoo links
  let PROXY_TIMEOUT_MS      = 30000;
  let proxyStart            = Date.now();
  let retryRound            = 1;
  const maxRoundsNoProgress = 10;
  let roundsWithNoProgress  = 0;
  let lastFailedCount       = needsProxy.length;

  while (true) {
    const failedTickers = TACTICAL_PICKS.filter(ticker => {
      const el = document.getElementById(`tactical-price-${ticker}`);
      return el && (
        el.innerHTML.includes("Unavailable") ||
        el.innerHTML.includes("Loading")     ||
        el.innerHTML.includes("refreshing")  ||
        el.innerHTML.includes("Retrying")
      );
    });

    // All done — exit loop
    if (failedTickers.length === 0) {
      console.log("✅ All tactical picks loaded successfully!");
      break;
    }

    // 30s passed — try file as interim but keep retrying
    // Never show Yahoo link — calculator needs real prices
    if (Date.now() - proxyStart > PROXY_TIMEOUT_MS) {
      console.warn(`Tactical — 30s passed, ${failedTickers.length} still missing — applying file prices as interim...`);

      failedTickers.forEach(ticker => {
        const el = document.getElementById(`tactical-price-${ticker}`);
        if (isFilePriceFromToday()) {
          const applied = applyFilePriceToTacticalCard(ticker);
          if (applied) {
            console.log(`${ticker} — interim file price applied`);
          } else {
            if (el && !el.innerHTML.includes("pick-price-value"))
              el.innerHTML = `<span style="color:#aaa;font-size:11px;">⟳ fetching...</span>`;
          }
        } else {
          // File is from a different day — don't show stale prices
          if (el && !el.innerHTML.includes("pick-price-value"))
            el.innerHTML = `<span style="color:#aaa;font-size:11px;">⟳ fetching...</span>`;
        }
      });

      // Reset clock and progress — keep trying
      proxyStart           = Date.now();
      roundsWithNoProgress = 0;
      lastFailedCount      = failedTickers.length;
    }

    // Check progress
    if (failedTickers.length >= lastFailedCount) {
      roundsWithNoProgress++;
    } else {
      roundsWithNoProgress = 0;
    }

    // No progress for many rounds — pause 2 min then restart
    if (roundsWithNoProgress >= maxRoundsNoProgress) {
      console.warn(`⚠️ Tactical — no progress for ${maxRoundsNoProgress} rounds`);
      console.warn("Applying file prices as interim and pausing 2 minutes before retry...");

      failedTickers.forEach(ticker => {
        const el = document.getElementById(`tactical-price-${ticker}`);
        if (isFilePriceFromToday()) {
          const applied = applyFilePriceToTacticalCard(ticker);
          if (!applied) {
            if (el && !el.innerHTML.includes("pick-price-value"))
              el.innerHTML = `<span style="color:#aaa;font-size:11px;">⟳ fetching...</span>`;
          }
        } else {
          // File is from a different day — don't show stale prices
          if (el && !el.innerHTML.includes("pick-price-value"))
            el.innerHTML = `<span style="color:#aaa;font-size:11px;">⟳ fetching...</span>`;
        }
      });

      // Wait 2 minutes then reset and try again
      await new Promise(resolve => setTimeout(resolve, 2 * 60 * 1000));
      roundsWithNoProgress = 0;
      lastFailedCount      = failedTickers.length;
      proxyStart           = Date.now();
      retryRound           = 1;
      console.log("Tactical — resuming proxy retries after 2min pause...");
    }

    lastFailedCount = failedTickers.length;

    // Show retrying status on failed cards
    failedTickers.forEach(ticker => {
      const el = document.getElementById(`tactical-price-${ticker}`);
      if (el && !el.innerHTML.includes("pick-price-value")) {
        el.innerHTML =
          `<span style="color:#aaa;font-size:11px;">Retrying (${retryRound})...</span>`;
      }
    });

    const backoff = Math.min(3000 + retryRound * 500, 10000);
    await new Promise(resolve => setTimeout(resolve, backoff));

    for (let i = 0; i < failedTickers.length; i++) {
      await new Promise(resolve => setTimeout(resolve, i * 500));
      fetchTacticalPrice(failedTickers[i]);
    }

    await new Promise(resolve => setTimeout(resolve, failedTickers.length * 500 + 3000));
    retryRound++;
  }
}

// ============ WAIT FOR FUNDAMENTAL PICKS TO COMPLETE ============
async function waitForFundamentalPicksComplete() {
  console.log("Waiting for fundamental picks to complete...");
  while (true) {
    const stillPending = Q2_PICKS.filter(ticker => {
      const el = document.getElementById(`price-${ticker}`);
      if (!el) return true;
      const html = el.innerHTML;
      return html.includes("Loading") || html.includes("Retrying") || html.trim() === "";
    });

    if (stillPending.length === 0) {
      console.log("Q2 picks settled — waiting 5s before starting tactical...");
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log("✅ Starting tactical picks now");
      break;
    }

    console.log(`Waiting... ${stillPending.length} Q2 picks still loading`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// ============ FETCH TACTICAL PICK PRICE ============
async function fetchTacticalPrice(ticker, retryCount = 0) {
  const maxRetries = 3;
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`;

    const proxies = [
      async () => {
        const r = await fetch(
          `https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        return JSON.parse(j.contents);
      },
      async () => {
        const r = await fetch(
          `https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      },
      async () => {
        const v2Url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`;
        const r     = await fetch(
          `https://api.allorigins.win/get?url=${encodeURIComponent(v2Url)}`,
          { signal: AbortSignal.timeout(20000) }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        return JSON.parse(j.contents);
      },
      async () => {
        const v2Url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2d`;
        const r     = await fetch(
          `https://corsproxy.io/?${encodeURIComponent(v2Url)}`,
          { signal: AbortSignal.timeout(20000) }
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      },
    ];

    let data = null;
    for (let p = 0; p < proxies.length; p++) {
      try {
        data = await proxies[p]();
        console.log(`${ticker} tactical — Proxy ${p + 1} succeeded`);
        break;
      } catch (e) {
        console.warn(`${ticker} tactical — Proxy ${p + 1} failed: ${e.message}`);
        if (p < proxies.length - 1) await new Promise(r => setTimeout(r, 2000)); // ← was 1000
      }
    }

    if (!data) throw new Error("All proxies failed");

    const result      = data.chart.result[0];
    const meta        = result.meta || {};
    const closes      = result.indicators.quote[0].close;
    const validCloses = closes.filter(v => v !== null && !isNaN(v));

    const latestPrice = meta.regularMarketPrice || validCloses[validCloses.length - 1];
    const prevPrice   = validCloses[0] || meta.chartPreviousClose;
    const change      = latestPrice - prevPrice;
    const changePct   = (change / prevPrice) * 100;
    const isPositive  = change >= 0;

    savePrice(`tac_${ticker}`, latestPrice, change, changePct, isPositive);

    // ===== Remove refreshing indicator before updating price =====
    const priceElSuccess = document.getElementById(`tactical-price-${ticker}`);
    if (priceElSuccess) {
      const refreshEl = priceElSuccess.querySelector(".price-refreshing");
      if (refreshEl) refreshEl.remove();
    }

    document.getElementById(`tactical-price-${ticker}`).innerHTML =
      `<span class="pick-price-value">$${latestPrice.toFixed(2)}</span>`;
    document.getElementById(`tactical-change-${ticker}`).innerHTML = `
      <span class="pick-change-value ${isPositive ? "positive" : "negative"}">
        ${isPositive ? "▲" : "▼"} $${Math.abs(change).toFixed(2)}
        (${isPositive ? "+" : ""}${changePct.toFixed(2)}%)
      </span>`;

    const card = document.getElementById(`tactical-pick-${ticker}`);
    if (card) {
      card.classList.remove("pick-positive", "pick-negative");
      card.classList.add(isPositive ? "pick-positive" : "pick-negative");
    }

  } catch (err) {
    const priceEl  = document.getElementById(`tactical-price-${ticker}`);
    const changeEl = document.getElementById(`tactical-change-${ticker}`);

    // Remove refreshing indicator
    if (priceEl) {
      const refreshEl = priceEl.querySelector(".price-refreshing");
      if (refreshEl) refreshEl.remove();
    }

    if (retryCount < maxRetries - 1) {
      const waitTime = (retryCount + 1) * 3000;
      setTimeout(() => fetchTacticalPrice(ticker, retryCount + 1), waitTime);
    } else {
      // All standard retries exhausted — try file cache as last resort
      const fileData    = pickPricesCache[ticker];
      const today       = new Date().toDateString();
      const fileUpdated = pickPricesUpdated
        ? new Date(pickPricesUpdated.replace(" UTC","").replace(" ","T") + "Z").toDateString()
        : null;
      const isSameDay   = fileUpdated === today;
      const appliedFromFile = isSameDay && fileData?.price
        ? applyFilePriceToTacticalCard(ticker)
        : false;

      if (appliedFromFile) {
        if (priceEl) {
          priceEl.innerHTML =
            `<span class="pick-price-value" title="Price from last file update — refreshing">
              ~$${fileData.price.toFixed(2)}
             </span>
             <div class="price-refreshing" style="color:#888;">↻ retrying...</div>`;
        }
      } else if (!applyFilePriceToTacticalCard(ticker)) {
        if (priceEl) {
          priceEl.innerHTML = `
            <a href="https://finance.yahoo.com/quote/${ticker}" target="_blank"
               style="color:#00b4d8;font-size:11px;text-decoration:none;">
              View on Yahoo →
            </a>`;
        }
      }

      // Keep retrying in background every 2 minutes
      setTimeout(() => {
        const el = document.getElementById(`tactical-price-${ticker}`);
        if (el && !el.innerHTML.includes("pick-price-value")) {
          fetchTacticalPrice(ticker, 0);
        } else {
          console.log(`${ticker} tactical — background retry cancelled, price already loaded`);
        }
      }, 2 * 60 * 1000);
    }
  }
}

function loadChart(ticker) {
  // Switch the main chart dropdown to selected ticker
  const select = document.getElementById("tickerSelect");
  if (select) {
    const options = Array.from(select.options);
    const match = options.find((o) => o.value === ticker);
    if (match) {
      select.value = ticker;
      currentTicker = ticker;
      localStorage.setItem("selectedTicker", ticker);
      drawChart(ticker, currentTarget);
      // Scroll up to chart
      document.getElementById("chart").scrollIntoView({ behavior: "smooth" });
    } else {
      alert(`${ticker} is not available in the current dataset.`);
    }
  }
}

// ============ Q2 CALCULATOR BUTTON ============

function updateQ2CalcButton() {
  const btn      = document.getElementById("q2CalcBtn");
  const statusEl = document.getElementById("q2CalcBtnStatus");
  if (!btn || !statusEl) return;

  const ready = Q2_PICKS.filter(ticker => {
    const el   = document.getElementById(`price-${ticker}`);
    const text = el ? el.innerText.trim() : "";
    return text.startsWith("$");
  });

  if (ready.length === Q2_PICKS.length) {
    btn.disabled      = false;
    btn.style.opacity = "1";
    btn.style.cursor  = "pointer";
    statusEl.innerHTML = `✅ All ${Q2_PICKS.length} Q prices loaded — ready to calculate!`;
    statusEl.style.color = "#00c896";
  } else {
    btn.disabled      = true;
    btn.style.opacity = "0.5";
    btn.style.cursor  = "not-allowed";
    const remaining   = Q2_PICKS.length - ready.length;
    statusEl.innerHTML = `⏳ Waiting for ${remaining} price${remaining !== 1 ? "s" : ""} to load 
      (${ready.length}/${Q2_PICKS.length} loaded)...
      <br><small style="color:#666">Button activates automatically when all prices are available.</small>`;
    statusEl.style.color = "#aaa";
    setTimeout(updateQ2CalcButton, 3000);
  }
}

function openQ2Calculator() {
  const ready = Q2_PICKS.filter(ticker => {
    const el   = document.getElementById(`price-${ticker}`);
    const text = el ? el.innerText.trim() : "";
    return text.startsWith("$");
  });

  if (ready.length < Q2_PICKS.length) {
    alert("Q2 prices are still loading. Please wait.");
    return;
  }

  const params = Q2_PICKS.map(ticker => {
    const el    = document.getElementById(`price-${ticker}`);
    const price = parseFloat(el ? el.innerText.trim().replace("$", "") : "");
    return `${ticker}:${isNaN(price) ? "" : price}`;
  }).filter(p => p.split(":")[1] !== "").join(",");

  window.open(`q2_calculator.html?picks=${encodeURIComponent(params)}&type=Q2%20Fundamental%20Picks`, "_blank");
}

// ============ TACTICAL CALCULATOR BUTTON ============

function updateTacCalcButton() {
  const btn      = document.getElementById("tacCalcBtn");
  const statusEl = document.getElementById("tacCalcBtnStatus");
  if (!btn || !statusEl) return;

  const ready = TACTICAL_PICKS.filter(ticker => {
    const el   = document.getElementById(`tactical-price-${ticker}`);
    const text = el ? el.innerText.trim() : "";
    return text.startsWith("$");
  });

  if (ready.length === TACTICAL_PICKS.length) {
    btn.disabled      = false;
    btn.style.opacity = "1";
    btn.style.cursor  = "pointer";
    statusEl.innerHTML = `✅ All ${TACTICAL_PICKS.length} Tactical prices loaded — ready to calculate!`;
    statusEl.style.color = "#00c896";
  } else {
    btn.disabled      = true;
    btn.style.opacity = "0.5";
    btn.style.cursor  = "not-allowed";
    const remaining   = TACTICAL_PICKS.length - ready.length;
    statusEl.innerHTML = `⏳ Waiting for ${remaining} price${remaining !== 1 ? "s" : ""} to load 
      (${ready.length}/${TACTICAL_PICKS.length} loaded)...
      <br><small style="color:#666">Button activates automatically when all prices are available.</small>`;
    statusEl.style.color = "#aaa";
    setTimeout(updateTacCalcButton, 3000);
  }
}

function openTacticalCalculator() {
  const ready = TACTICAL_PICKS.filter(ticker => {
    const el   = document.getElementById(`tactical-price-${ticker}`);
    const text = el ? el.innerText.trim() : "";
    return text.startsWith("$");
  });

  if (ready.length < TACTICAL_PICKS.length) {
    alert("Tactical prices are still loading. Please wait.");
    return;
  }

  const params = TACTICAL_PICKS.map(ticker => {
    const el    = document.getElementById(`tactical-price-${ticker}`);
    const price = parseFloat(el ? el.innerText.trim().replace("$", "") : "");
    return `${ticker}:${isNaN(price) ? "" : price}`;
  }).filter(p => p.split(":")[1] !== "").join(",");

  window.open(`tactical_calculator.html?picks=${encodeURIComponent(params)}&type=Tactical%20Rotation%20Picks`, "_blank");
}

// Load file prices first, then start the pick sections
loadPickPricesFromFile().then(() => {
  loadQ2Picks();
  loadTacticalPicks();
  // Start auto-refresh to match GitHub Action schedule
  startPickPriceAutoRefresh();
});
// Load picks on page start
//loadQ2Picks();
//loadTacticalPicks();
setTimeout(() => loadSpreadsheetPreview(), 3000);

updateQ2CalcButton();
updateTacCalcButton();







// ============================================================
// NAV ENHANCEMENTS — Add this at the bottom of script.js
// 1. Scroll progress bar
// 2. Active nav section highlighting
// 3. Mobile hamburger menu
// ============================================================

// ===== 1. SCROLL PROGRESS BAR =====
function initScrollProgressBar() {
  // Create the bar element
  const bar = document.createElement("div");
  bar.className = "scroll-progress-bar";
  bar.id = "scrollProgressBar";
  document.body.prepend(bar);

  // Update width on scroll
  window.addEventListener("scroll", () => {
    const scrollTop    = window.scrollY;
    const docHeight    = document.documentElement.scrollHeight - window.innerHeight;
    const scrollPct    = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    bar.style.width    = `${Math.min(scrollPct, 100)}%`;
  }, { passive: true });
}

// ===== 2. ACTIVE NAV HIGHLIGHTING =====
function initActiveNav() {
  const sections = [
    { id: "section-purpose",     navHref: "#section-purpose"     },
    { id: "section-videos",      navHref: "#section-videos"      },
    { id: "section-ai-chat",     navHref: "#section-ai-chat"     },
    { id: "section-sp500",       navHref: "#section-sp500"       },
    { id: "section-fundamental", navHref: "#section-fundamental" },
    { id: "section-tactical",    navHref: "#section-tactical"    },
    { id: "section-charts",      navHref: "#section-charts"      },
    { id: "section-planning",    navHref: "#section-planning"    },
  ];

  const navLinks = document.querySelectorAll(".nav-btn");

  // Use IntersectionObserver to detect which section is visible
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const activeId = entry.target.id;

        // Remove active from all nav buttons
        navLinks.forEach(link => link.classList.remove("active"));

        // Add active to matching nav button
        const activeLink = document.querySelector(`.nav-btn[href="#${activeId}"]`);
        if (activeLink) {
          activeLink.classList.add("active");

          // Scroll the nav button into view on mobile
          activeLink.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center"
          });
        }
      }
    });
  }, {
    // Trigger when section is 20% visible
    threshold: 0.2,
    rootMargin: "-60px 0px -60px 0px"
  });

  // Observe all sections
  sections.forEach(({ id }) => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

// ===== 3. MOBILE HAMBURGER MENU =====
function initMobileHamburger() {
  const navInner = document.querySelector(".page-nav-inner");
  if (!navInner) return;

  // Add mobile label
  const mobileLabel = document.createElement("span");
  mobileLabel.className = "nav-mobile-label";
  mobileLabel.textContent = "Navigate to section";
  navInner.prepend(mobileLabel);

  // Create hamburger button
  const hamburger = document.createElement("button");
  hamburger.className = "nav-hamburger";
  hamburger.setAttribute("aria-label", "Toggle navigation menu");
  hamburger.innerHTML = `
    <span></span>
    <span></span>
    <span></span>
  `;
  navInner.appendChild(hamburger);

  // Toggle menu open/close
  hamburger.addEventListener("click", () => {
    hamburger.classList.toggle("open");
    navInner.classList.toggle("mobile-open");
  });

  // Close menu when a nav link is clicked
  document.querySelectorAll(".nav-btn").forEach(link => {
    link.addEventListener("click", () => {
      hamburger.classList.remove("open");
      navInner.classList.remove("mobile-open");
    });
  });

  // Close menu when clicking outside the nav
  document.addEventListener("click", (e) => {
    const nav = document.querySelector(".page-nav");
    if (nav && !nav.contains(e.target)) {
      hamburger.classList.remove("open");
      navInner.classList.remove("mobile-open");
    }
  });
}

// ===== INIT ALL NAV FEATURES =====
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initScrollProgressBar();
    initActiveNav();
    initMobileHamburger();
    // Fix back to top buttons
    document.querySelectorAll(".back-to-top-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  });
} else {
  initScrollProgressBar();
  initActiveNav();
  initMobileHamburger();
  document.querySelectorAll(".back-to-top-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}