loadData(() => {
  const ticker = buildTickerDropdown("tickerSelect", drawChart);
  drawChart(ticker);
});

function drawChart(ticker) {
  const df = globalData.filter((d) => d["name of security"] === ticker);
  if (!df.length) return;

  const x = df.map((d) => new Date(d["entry date"]));
  const ni = df.map((d) => +d["NI change"]);
  const niAvg = df.map((d) => +d["NI change industry avg"]);
  const rev = df.map((d) => +d["revenue change"]);
  const revAvg = df.map((d) => +d["revenue change industry avg"]);

  const traces = [
    { y: ni, name: "NI change", color: "royalblue" },
    { y: niAvg, name: "NI change (industry avg)", color: "skyblue", dash: "dot" },
    { y: rev, name: "Revenue change", color: "seagreen" },
    { y: revAvg, name: "Revenue change (industry avg)", color: "lightgreen", dash: "dot" },
  ].map((cfg) => ({
    x,
    y: cfg.y,
    mode: "lines+markers",
    name: cfg.name,
    line: { color: cfg.color, width: 2, dash: cfg.dash || "solid" },
    marker: { size: 4, color: cfg.color },
  }));

  const layout = {
    title: `${ticker} — NI & Revenue Change vs Industry Averages`,
    xaxis: { title: "Entry Date" },
    yaxis: { title: "Change (%)" },
    hovermode: "x unified",
  };

  Plotly.newPlot("chart", traces, layout, { responsive: true });
}
