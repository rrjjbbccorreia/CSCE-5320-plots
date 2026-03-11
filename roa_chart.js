loadData(() => {
  const ticker = buildTickerDropdown("tickerSelect", drawChart);
  drawChart(ticker);
});

function drawChart(ticker) {
  const df = globalData.filter((d) => d["name of security"] === ticker);
  if (!df.length) return;

  const x = df.map((d) => new Date(d["entry date"]));
  const price = df.map((d) => +d["entry price"]);
  const roa = df.map((d) => +d["ROA"]);
  const roaInd = df.map((d) => +d["ROA industry avg"]);

  const trace1 = {
    x,
    y: price,
    mode: "lines+markers",
    name: "Entry Price",
    line: { color: "orange", width: 2 },
    yaxis: "y1",
  };

  const trace2 = {
    x,
    y: roa,
    mode: "markers",
    name: "ROA",
    marker: { size: 8, color: "blue", opacity: 0.7 },
    yaxis: "y2",
  };

  const trace3 = {
    x,
    y: roaInd,
    mode: "markers",
    name: "ROA Industry Avg",
    marker: { size: 8, color: "lightblue", opacity: 0.6 },
    yaxis: "y2",
  };

  const layout = {
    title: {
    text: `${ticker} — Entry Price vs ROA`,
      x: 0.5,
      xanchor: "center",
      y: 0.97,         // ⬆️ push title higher (default ~0.92)
      yanchor: "top",
      font: {
        size: 20,
        color: "#0b0d0fff",
        family: "Segoe UI, Roboto, sans-serif"
      }
    },
    xaxis: { title: "Entry Date", rangeslider: { visible: true } },
    yaxis: { title: "Entry Price ($)", side: "left" },
    yaxis2: { title: "ROA", overlaying: "y", side: "right" },
    hovermode: "x unified",
    legend: { orientation: "h" },
  };

  Plotly.newPlot("chart", [trace1, trace2, trace3], layout, { responsive: true });
}
