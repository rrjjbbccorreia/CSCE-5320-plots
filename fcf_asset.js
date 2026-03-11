loadData(() => {
  const ticker = buildTickerDropdown("tickerSelect", drawChart);
  drawChart(ticker);
});

function drawChart(ticker) {
  const df = globalData.filter((d) => d["name of security"] === ticker);
  if (!df.length) return;

  const x = df.map((d) => new Date(d["entry date"]));
  const fcf = df.map((d) => +d["free cash flow / revenue"]);
  const asset = df.map((d) => +d["asset turnover"]);

  const trace1 = {
    x,
    y: fcf,
    mode: "lines",
    name: "Free Cash Flow / Revenue",
    line: { color: "royalblue", width: 2 },
    fill: "tozeroy",
    fillcolor: "rgba(65,105,225,0.4)",
    yaxis: "y1",
  };

  const trace2 = {
    x,
    y: asset,
    mode: "lines",
    name: "Asset Turnover",
    line: { color: "lightblue", width: 2 },
    fill: "tozeroy",
    fillcolor: "rgba(173,216,230,0.4)",
    yaxis: "y2",
  };

  const layout = {
    title: `${ticker} — FCF/Revenue & Asset Turnover`,
    xaxis: { title: "Entry Date" },
    yaxis: { title: "Free Cash Flow / Revenue" },
    yaxis2: { title: "Asset Turnover", overlaying: "y", side: "right" },
    hovermode: "x unified",
  };

  Plotly.newPlot("chart", [trace1, trace2], layout, { responsive: true });
}
