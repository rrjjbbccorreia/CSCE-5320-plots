let currentTicker = null;
let currentTarget = "T1";

loadData((data) => {
  const select = document.getElementById("tickerSelect");
  const tickers = Array.from(new Set(data.map((d) => d["name of security"]))).sort();

  tickers.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  });

  const saved = getTicker();
  currentTicker = saved || tickers[0];
  select.value = currentTicker;
  drawChart(data, currentTicker, currentTarget);

  select.addEventListener("change", (e) => {
    currentTicker = e.target.value;
    setTicker(currentTicker);
    drawChart(data, currentTicker, currentTarget);
  });

  document.getElementById("toggleBtn").addEventListener("click", () => {
    currentTarget = currentTarget === "T1" ? "T2" : "T1";
    drawChart(data, currentTicker, currentTarget);
  });
});

function drawChart(data, ticker, target) {
  const df = data.filter((d) => d["name of security"] === ticker);
  if (!df.length) return;

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

  const traces = [
    {
      x: entryDate,
      y: entryPrice,
      mode: "lines+markers",
      name: "Entry Price",
      line: { color: "black", width: 2 },
    },
    {
      x: tgtDate,
      y: truePrice,
      mode: "lines+markers",
      name: `Real Price (${target})`,
      line: { color: target === "T1" ? "green" : "blue" },
    },
    {
      x: tgtDate,
      y: predPrice,
      mode: "lines+markers",
      name: `Predicted Price (${target})`,
      line: { color: target === "T1" ? "orange" : "red", dash: "dot" },
    },
    {
      x: [...tgtDate, ...tgtDate.slice().reverse()],
      y: [...predHi, ...predLo.slice().reverse()],
      fill: "toself",
      fillcolor: target === "T1" ? "rgba(255,165,0,0.15)" : "rgba(255,0,0,0.15)",
      line: { width: 0 },
      name: "90% CI",
    },
  ];

  Plotly.newPlot("chart", traces, {
    title: `${ticker} — Entry vs Future Prices (${target})`,
    xaxis: { title: "Date", rangeslider: { visible: true } },
    yaxis: { title: "Price" },
    hovermode: "x unified",
    template: "plotly_white",
  });
}
