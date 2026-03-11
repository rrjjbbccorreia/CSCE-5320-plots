// ==================== CONFIG ====================
//const DATA_PATH = "data/merged_predictions_v2.csv";
const DATA_PATH = "https://github.com/rrjjbbccorreia/CSCE-5320-plots/releases/download/v1.0/merged_predictions_v2.csv";
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

// ============ DRAW CHART ============
function drawChart(ticker, target) {
  const df = globalData.filter((d) => d["name of security"] === ticker);
  if (df.length === 0) return;

  const entryDate = df.map((d) => new Date(d["entry date"]));
  const entryPrice = df.map((d) => +d["entry price"]);

  const tgtDate = df.map((d) =>
    new Date(d[`target ${target === "T1" ? "1" : "2"} date`])
  );
  const mu = df.map((d) => +d[`mu_h${target === "T1" ? "1" : "2"}`]);
  const yTrue = df.map((d) => +d[`y_true_h${target === "T1" ? "1" : "2"}`]);
  const std = df.map((d) => +d[`std_h${target === "T1" ? "1" : "2"}`]);

  const predPrice = entryPrice.map((v, i) => v * Math.exp(mu[i]));
  const truePrice = entryPrice.map((v, i) => v * Math.exp(yTrue[i]));
  const predLo = entryPrice.map((v, i) => v * Math.exp(mu[i] - 1.645 * std[i]));
  const predHi = entryPrice.map((v, i) => v * Math.exp(mu[i] + 1.645 * std[i]));

  // ----- Traces -----
  const entryTrace = {
    x: entryDate,
    y: entryPrice,
    mode: "lines+markers",
    name: "Entry Price",
    line: { color: "black", width: 2 },
  };

  const trueTrace = {
    x: tgtDate,
    y: truePrice,
    mode: "lines+markers",
    name: `Real Future Price (${target})`,
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
    x: [...tgtDate, ...tgtDate.slice().reverse()],
    y: [...predHi, ...predLo.slice().reverse()],
    fill: "toself",
    fillcolor: target === "T1" ? "rgba(255,165,0,0.15)" : "rgba(255,0,0,0.15)",
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
