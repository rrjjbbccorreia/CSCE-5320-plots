async function initMainPlot() {
  const data = await loadData();
  populateTickerDropdown(data);

  const nameCol = Object.keys(data[0]).find(k => k.trim().toLowerCase() === "name of security");
  const dateCol = "entry date";
  const priceCol = "entry price";
  const ticker = getTicker() || data[0][nameCol];
  setTicker(ticker);

  const dff = data.filter(d => d[nameCol] === ticker);
  const x = dff.map(d => new Date(d[dateCol]));
  const y = dff.map(d => +d[priceCol]);

  const trace = { x, y, mode: "lines+markers", name: ticker,
    line: { color: "darkorange", width: 2 } };

  Plotly.newPlot("main-chart", [trace], {
    title: `${ticker} — Entry Price`,
    xaxis: { title: "Entry Date", rangeslider: { visible: true } },
    yaxis: { title: "Entry Price ($)" },
    dragmode: "zoom", hovermode: "x unified", template: "plotly_white"
  });
}

function onTickerChange(t) { setTicker(t); initMainPlot(); }
document.addEventListener("DOMContentLoaded", initMainPlot);
