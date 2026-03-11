// Shared utilities for all chart pages
//const DATA_PATH = "data/merged_predictions_v2.csv";
const DATA_PATH = "https://github.com/rrjjbbccorreia/CSCE-5320-plots/releases/download/v1.0/merged_predictions_v2.csv";
let globalData = [];
let currentTicker = null;

// Load CSV via PapaParse
function loadData(callback) {
  if (globalData.length) return callback(globalData);

  Papa.parse(DATA_PATH, {
    download: true,
    header: true,
    dynamicTyping: true,
    complete: (results) => {
      globalData = results.data.filter((r) => r["name of security"]);
      currentTicker = localStorage.getItem("selectedTicker") || null;
      callback(globalData);
    },
  });
}

// Dropdown builder (used by main chart & others)
function buildTickerDropdown(selectId, onChange) {
  const select = document.getElementById(selectId);
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

  // default or saved ticker
  currentTicker = currentTicker || tickers[0];
  select.value = currentTicker;
  select.addEventListener("change", (e) => {
    currentTicker = e.target.value;
    localStorage.setItem("selectedTicker", currentTicker);
    onChange(currentTicker);
  });

  return currentTicker;
}
