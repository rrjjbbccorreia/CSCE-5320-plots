// ==================== CONFIG ====================
const DATA_PATH = "data/merged_predictions_v2_web_032526.csv";
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
    const yahooChartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1mo`;

    async function proxyFetch(url) {
      const proxies = [
        async () => {
          const r = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`,
            { signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        },
        async () => {
          const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
            { signal: AbortSignal.timeout(15000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const j = await r.json();
          return JSON.parse(j.contents);
        },
        async () => {
          const r = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
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
        <div style="text-align:center; padding: 12px;">
          <p style="color:#ff6b6b; margin-bottom: 10px;">
            Unable to load market data for ${ticker}
          </p>
          <button
            onclick="fetchStockTable('${ticker}')"
            style="padding: 8px 16px; cursor: pointer; background: #00b4d8;
                   color: white; border: none; border-radius: 6px; font-size: 14px;">
            🔄 Retry
          </button>
        </div>
      `;
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
  ZION: "Zions Bancorporation", ZTS: "Zoetis"
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

    // Try multiple Wikipedia page name formats
    const attempts = [
      companyName,
      `${companyName} (company)`,
      `${ticker} (company)`,
      ticker
    ];

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

    if (!wikiData) throw new Error(`No Wikipedia page found for ${ticker}`);

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
    entryPrice[i] * Math.exp(yTrue[i])
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
    workbook.SheetNames.forEach((name, index) => {
      const tab = document.createElement("button");
      tab.className = "preview-tab" + (index === 0 ? " active" : "");
      tab.textContent = name;
      tab.onclick = () => {
        document.querySelectorAll(".preview-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        renderSheet(workbook, name, sheetContainer);
      };
      tabsContainer.appendChild(tab);
    });

    // Render first sheet by default
    renderSheet(workbook, workbook.SheetNames[0], sheetContainer);

  } catch (err) {
    console.error("Spreadsheet preview error:", err);
    sheetContainer.innerHTML = "<p style='color:#ff6b6b;text-align:center;padding:20px;'>Unable to load spreadsheet preview.</p>";
  }
}

function renderSheet(workbook, sheetName, container) {
  const sheet = workbook.Sheets[sheetName];
  const html = XLSX.utils.sheet_to_html(sheet, { editable: false });
  container.innerHTML = html;

  // Apply dark theme styling to generated table
  const table = container.querySelector("table");
  if (table) {
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";
    table.style.fontSize = "13px";
    table.style.color = "#ccc";
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

// ============ Q2 FUNDAMENTAL PICKS ============
const Q2_PICKS = [
  "ALB", "SPG", "ETR", "COST", "MU",
  "SYF", "EXPD", "CEG", "NRG", "ARE",
  "CTAS", "DECK", "DD", "AMCR","ACN",
  "FDS", "PLTR", "PSX"
];

const TACTICAL_PICKS = [
  "NVR", "CARR", "PODD", "PTC", "MU",
  "HSY", "ZBRA", "STE", "APP", "VRTX",
  "XME", "XLE", "IGE", "COPX", "BN", "UCO"
];

async function loadQ2Picks() {
  const grid = document.getElementById("picksGrid");
  if (!grid) return;

  // Build initial cards with loading state
  grid.innerHTML = Q2_PICKS.map(ticker => `
    <div class="pick-card" id="pick-${ticker}">
      <div class="pick-ticker">${ticker}</div>
      <div class="pick-price" id="price-${ticker}">
        <span style="color:#aaa;font-size:13px;">Loading...</span>
      </div>
      <div class="pick-change" id="change-${ticker}"></div>
      <button class="pick-btn" onclick="loadChart('${ticker}')">
        View Chart
      </button>
    </div>
  `).join("");

  // Wait 2 seconds for stock table and profile to finish first
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Initial staggered fetch for all picks
  for (let i = 0; i < Q2_PICKS.length; i++) {
    await new Promise(resolve => setTimeout(resolve, i * 400));
    fetchPickPrice(Q2_PICKS[i]);
  }

  // Wait for all initial fetches to complete
  const totalInitialTime = Q2_PICKS.length * 400 + 3000;
  await new Promise(resolve => setTimeout(resolve, totalInitialTime));

  // ===== INFINITE RETRY LOOP =====
  // Keeps running until ALL tickers are loaded — no round limit
  let retryRound = 1;
  const maxRoundsWithNoProgress = 5; // safety stop if nothing is improving
  let roundsWithNoProgress = 0;
  let lastFailedCount = Q2_PICKS.length;

  while (true) {
    // Find any picks still showing Unavailable or Loading
    const failedTickers = Q2_PICKS.filter(ticker => {
      const priceEl = document.getElementById(`price-${ticker}`);
      return priceEl && (
        priceEl.innerHTML.includes("Unavailable") ||
        priceEl.innerHTML.includes("Loading")
      );
    });

    // All done — exit loop
    if (failedTickers.length === 0) {
      console.log("✅ All picks loaded successfully!");
      break;
    }

    // Check if we are making progress
    if (failedTickers.length >= lastFailedCount) {
      roundsWithNoProgress++;
      console.warn(`No progress round ${roundsWithNoProgress}/${maxRoundsWithNoProgress} — still ${failedTickers.length} unavailable`);
    } else {
      // Progress was made — reset counter
      roundsWithNoProgress = 0;
      console.log(`Progress made — ${failedTickers.length} still remaining`);
    }

    // Safety stop — if nothing is improving after several rounds give up
    if (roundsWithNoProgress >= maxRoundsWithNoProgress) {
      console.warn("⚠️ Stopping retries — no progress after", maxRoundsWithNoProgress, "rounds");
      console.warn("Still unavailable:", failedTickers);
      break;
    }

    lastFailedCount = failedTickers.length;

    console.log(`Retry round ${retryRound} — retrying ${failedTickers.length} tickers:`, failedTickers);

    // Update failed cards to show retrying status
    failedTickers.forEach(ticker => {
      const priceEl = document.getElementById(`price-${ticker}`);
      if (priceEl) {
        priceEl.innerHTML = `<span style="color:#aaa;font-size:11px;">Retrying (${retryRound})...</span>`;
      }
    });

    // Wait between rounds — gets slightly longer each round to back off
    const waitTime = Math.min(3000 + retryRound * 500, 10000);
    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Retry each failed ticker with a stagger
    for (let i = 0; i < failedTickers.length; i++) {
      await new Promise(resolve => setTimeout(resolve, i * 500));
      fetchPickPrice(failedTickers[i]);
    }

    // Wait for this round to complete
    await new Promise(resolve => setTimeout(resolve, failedTickers.length * 500 + 3000));

    retryRound++;
  }
}

async function fetchPickPrice(ticker, retryCount = 0) {
  const maxRetries = 3;
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;

    // Try proxies in order — corsproxy.io first as it is most reliable
    const proxies = [
      async () => {
        const r = await fetch(`https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`, 
          { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      },
      async () => {
        const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`,
          { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        return JSON.parse(j.contents);
      },
      async () => {
        const r = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`,
          { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      },
    ];

    let data = null;
    for (let p = 0; p < proxies.length; p++) {
      try {
        data = await proxies[p]();
        console.log(`${ticker} — Proxy ${p + 1} succeeded`);
        break;
      } catch (e) {
        console.warn(`${ticker} — Proxy ${p + 1} failed: ${e.message}`);
        if (p < proxies.length - 1) await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!data) throw new Error("All proxies failed");

    const result     = data.chart.result[0];
    const closes     = result.indicators.quote[0].close;
    const validCloses = closes.filter((v) => v !== null && !isNaN(v));
    const latestPrice = validCloses[validCloses.length - 1];
    const prevPrice   = validCloses[validCloses.length - 2];
    const change      = latestPrice - prevPrice;
    const changePct   = (change / prevPrice) * 100;
    const isPositive  = change >= 0;

    document.getElementById(`price-${ticker}`).innerHTML = `
      <span class="pick-price-value">$${latestPrice.toFixed(2)}</span>
    `;
    document.getElementById(`change-${ticker}`).innerHTML = `
      <span class="pick-change-value ${isPositive ? "positive" : "negative"}">
        ${isPositive ? "▲" : "▼"} $${Math.abs(change).toFixed(2)}
        (${isPositive ? "+" : ""}${changePct.toFixed(2)}%)
      </span>
    `;

    const card = document.getElementById(`pick-${ticker}`);
    card.classList.add(isPositive ? "pick-positive" : "pick-negative");

  } catch (err) {
    if (retryCount < maxRetries - 1) {
      setTimeout(() => fetchPickPrice(ticker, retryCount + 1), 2000);
    } else {
      document.getElementById(`price-${ticker}`).innerHTML =
        "<span style='color:#ff6b6b;font-size:12px;'>Unavailable</span>";
    }
  }
}

// ============ TACTICAL ROTATION PICKS ============
async function loadTacticalPicks() {
  const grid = document.getElementById("tacticalPicksGrid");
  if (!grid) return;

  // Build initial cards with loading state
  grid.innerHTML = TACTICAL_PICKS.map(ticker => `
    <div class="pick-card tactical-card" id="tactical-pick-${ticker}">
      <div class="pick-ticker" style="color:#00c896">${ticker}</div>
      <div class="pick-price" id="tactical-price-${ticker}">
        <span style="color:#aaa;font-size:13px;">Loading...</span>
      </div>
      <div class="pick-change" id="tactical-change-${ticker}"></div>
      <button class="pick-btn tactical-btn" onclick="loadChart('${ticker}')">
        View Chart
      </button>
    </div>
  `).join("");

  // Wait for fundamental picks AND all their retries to fully complete
  // before starting tactical picks fetches
  await waitForFundamentalPicksComplete();

  console.log("Starting tactical picks fetch...");

  // Initial staggered fetch for all tactical picks
  for (let i = 0; i < TACTICAL_PICKS.length; i++) {
    await new Promise(resolve => setTimeout(resolve, i * 400));
    fetchTacticalPrice(TACTICAL_PICKS[i]);
  }

  // Wait for initial fetches to complete
  const totalInitialTime = TACTICAL_PICKS.length * 400 + 3000;
  await new Promise(resolve => setTimeout(resolve, totalInitialTime));

  // Infinite retry loop — same pattern as fundamental picks
  let retryRound = 1;
  const maxRoundsWithNoProgress = 5;
  let roundsWithNoProgress = 0;
  let lastFailedCount = TACTICAL_PICKS.length;

  while (true) {
    const failedTickers = TACTICAL_PICKS.filter(ticker => {
      const priceEl = document.getElementById(`tactical-price-${ticker}`);
      return priceEl && (
        priceEl.innerHTML.includes("Unavailable") ||
        priceEl.innerHTML.includes("Loading")
      );
    });

    if (failedTickers.length === 0) {
      console.log("✅ All tactical picks loaded successfully!");
      break;
    }

    if (failedTickers.length >= lastFailedCount) {
      roundsWithNoProgress++;
      console.warn(`Tactical — no progress round ${roundsWithNoProgress}/${maxRoundsWithNoProgress}`);
    } else {
      roundsWithNoProgress = 0;
      console.log(`Tactical — progress made, ${failedTickers.length} still remaining`);
    }

    if (roundsWithNoProgress >= maxRoundsWithNoProgress) {
      console.warn("⚠️ Tactical picks — stopping retries, no progress after", maxRoundsWithNoProgress, "rounds");
      break;
    }

    lastFailedCount = failedTickers.length;
    console.log(`Tactical retry round ${retryRound} — retrying:`, failedTickers);

    failedTickers.forEach(ticker => {
      const priceEl = document.getElementById(`tactical-price-${ticker}`);
      if (priceEl) {
        priceEl.innerHTML = `<span style="color:#aaa;font-size:11px;">Retrying (${retryRound})...</span>`;
      }
    });

    const waitTime = Math.min(3000 + retryRound * 500, 10000);
    await new Promise(resolve => setTimeout(resolve, waitTime));

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
  
  // Check every 2 seconds if fundamental picks are all done
  while (true) {
    const stillPending = Q2_PICKS.filter(ticker => {
      const priceEl = document.getElementById(`price-${ticker}`);
      return priceEl && (
        priceEl.innerHTML.includes("Loading") ||
        priceEl.innerHTML.includes("Retrying")
      );
    });

    if (stillPending.length === 0) {
      console.log("✅ Fundamental picks complete — starting tactical picks");
      break;
    }

    console.log(`Waiting... ${stillPending.length} fundamental picks still loading`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// ============ FETCH TACTICAL PICK PRICE ============
async function fetchTacticalPrice(ticker, retryCount = 0) {
  const maxRetries = 3;
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;

    // Try proxies in order — corsproxy.io first as it is most reliable
    const proxies = [
      async () => {
        const r = await fetch(`https://corsproxy.io/?${encodeURIComponent(yahooUrl)}`,
          { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      },
      async () => {
        const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(yahooUrl)}`,
          { signal: AbortSignal.timeout(15000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        return JSON.parse(j.contents);
      },
      async () => {
        const r = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(yahooUrl)}`,
          { signal: AbortSignal.timeout(15000) });
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
        if (p < proxies.length - 1) await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (!data) throw new Error("All proxies failed");

    const result      = data.chart.result[0];
    const closes      = result.indicators.quote[0].close;
    const validCloses = closes.filter((v) => v !== null && !isNaN(v));
    const latestPrice = validCloses[validCloses.length - 1];
    const prevPrice   = validCloses[validCloses.length - 2];
    const change      = latestPrice - prevPrice;
    const changePct   = (change / prevPrice) * 100;
    const isPositive  = change >= 0;

    document.getElementById(`tactical-price-${ticker}`).innerHTML = `
      <span class="pick-price-value">$${latestPrice.toFixed(2)}</span>
    `;
    document.getElementById(`tactical-change-${ticker}`).innerHTML = `
      <span class="pick-change-value ${isPositive ? "positive" : "negative"}">
        ${isPositive ? "▲" : "▼"} $${Math.abs(change).toFixed(2)}
        (${isPositive ? "+" : ""}${changePct.toFixed(2)}%)
      </span>
    `;

    const card = document.getElementById(`tactical-pick-${ticker}`);
    card.classList.add(isPositive ? "pick-positive" : "pick-negative");

  } catch (err) {
    if (retryCount < maxRetries - 1) {
      setTimeout(() => fetchTacticalPrice(ticker, retryCount + 1), 2000);
    } else {
      document.getElementById(`tactical-price-${ticker}`).innerHTML =
        "<span style='color:#ff6b6b;font-size:12px;'>Unavailable</span>";
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

// Load picks on page start
loadQ2Picks();
loadTacticalPicks();
setTimeout(() => loadSpreadsheetPreview(), 3000);