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
  } else {
    tableContainer.innerHTML = `<p style='color:#aaa;text-align:center'>Loading market data... (attempt ${retryCount + 1} of ${maxRetries})</p>`;
  }

  try {
    const proxyUrl = "https://api.allorigins.win/get?url=";
    const yahooUrl = encodeURIComponent(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1mo`
    );

    // Add a timeout so we don't wait forever
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(proxyUrl + yahooUrl, { 
      signal: controller.signal 
    });
    clearTimeout(timeout);

    const json = await response.json();
    const data = JSON.parse(json.contents);

    const timestamps = data.chart.result[0].timestamp;
    const closes = data.chart.result[0].indicators.quote[0].close;
    const volumes = data.chart.result[0].indicators.quote[0].volume;

    // Get last 10 trading days
    const last10 = timestamps.slice(-10).map((ts, i) => {
      const idx = timestamps.length - 10 + i;
      return {
        date: new Date(ts * 1000).toLocaleDateString("en-US", {
          year: "numeric", month: "short", day: "numeric"
        }),
        close: closes[idx] ? closes[idx].toFixed(2) : "N/A",
        volume: volumes[idx] ? volumes[idx].toLocaleString() : "N/A"
      };
    }).reverse();

    // Build table HTML
    let html = `
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

    tableContainer.innerHTML = `
      <h3 class="stock-table-title">📊 ${ticker} — Last 10 Trading Days</h3>
      ${html}
    `;

  } catch (err) {

    if (retryCount < maxRetries - 1) {
      // Wait 2 seconds then retry automatically
      console.warn(`Attempt ${retryCount + 1} failed for ${ticker}, retrying in 2s...`);
      setTimeout(() => fetchStockTable(ticker, retryCount + 1), 2000);
    } else {
      // All retries exhausted — show error with manual retry button
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


// ============ DRAW CHART ============
async function drawChart(ticker, target) {
  fetchStockTable(ticker); // ADD THIS LINE
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

    const response = await fetch("data/Retirement analysis_PROT14v2_p.xlsm");
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