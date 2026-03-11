loadData(() => {
  const ticker = buildTickerDropdown("tickerSelect", drawChart);
  drawChart(ticker);
});

function drawChart(ticker) {
  const df = globalData.filter((d) => d["name of security"] === ticker);
  if (!df.length) return;

  const x = df.map((d) => new Date(d["entry date"]));
  const ni = df.map((d) => +d["NI"]);
  const rev = df.map((d) => +d["revenue"]);
  const roe = df.map((d) => +d["ROE"]);

  const barNI = { x, y: ni, type: "bar", name: "NI", marker: { color: "gray" }, yaxis: "y1" };
  const barRev = { x, y: rev, type: "bar", name: "Revenue", marker: { color: "lightgray" }, yaxis: "y1" };
  const lineROE = {
    x,
    y: roe,
    mode: "lines+markers",
    name: "ROE",
    line: { color: "blue", width: 2 },
    yaxis: "y2",
  };

  const layout = {
    title: `${ticker} — NI + Revenue vs ROE`,
    barmode: "stack",
    xaxis: { title: "Entry Date" },
    yaxis: { title: "NI & Revenue" },
    yaxis2: { title: "ROE", overlaying: "y", side: "right" },
    hovermode: "x unified",
  };

  Plotly.newPlot("chart", [barNI, barRev, lineROE], layout, { responsive: true });
}
