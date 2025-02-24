import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
// Import Mapbox as an ESM module
import mapboxgl from "https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm";

// Check that Mapbox GL JS is loaded
console.log("Mapbox GL JS Loaded:", mapboxgl);

// Set your Mapbox access token here
mapboxgl.accessToken =
  "pk.eyJ1Ijoic2FkcmFjc2FudGFjcnV6IiwiYSI6ImNtN2lveHZucDB1amkyc29sbmhvMnNzZWwifQ.PIX8O91zoii_Wb3vHbPpcw";

// Initialize the map
const map = new mapboxgl.Map({
  container: "map", // ID of the div where the map will render
  style: "mapbox://styles/mapbox/streets-v12", // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

// Tooltip setup
const tooltip = d3
  .select("body")
  .append("div")
  .attr("id", "tooltip")
  .style("position", "absolute")
  .style("display", "none")
  .style("background", "rgba(255, 255, 255, 0.9)")
  .style("border", "1px solid black")
  .style("border-radius", "5px")
  .style("padding", "6px")
  .style("pointer-events", "none")
  .style("font-size", "14px");

map.on("load", async () => {
  // Add Boston bike lanes
  map.addSource("boston_route", {
    type: "geojson",
    data: "https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson",
  });

  map.addLayer({
    id: "bike-lanes",
    type: "line",
    source: "boston_route",
    paint: {
      "line-color": "#32D400",
      "line-width": 5,
      "line-opacity": 0.6,
    },
  });

  // Fetch BlueBikes station data
  try {
    const stationsUrl =
      "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
    const jsonData = await d3.json(stationsUrl);

    console.log("Loaded JSON Data:", jsonData);

    let stations = jsonData.data.stations;
    console.log("Stations Array:", stations);

    let svg = d3.select("#map").select("svg");

    if (svg.empty()) {
      svg = d3
        .select("#map")
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .style("position", "absolute")
        .style("top", "0")
        .style("left", "0")
        .style("pointer-events", "none");
    }

    function getCoords(station) {
      const point = new mapboxgl.LngLat(+station.lon, +station.lat);
      const { x, y } = map.project(point);
      return { cx: x, cy: y };
    }

    const circles = svg
      .selectAll("circle")
      .data(stations)
      .enter()
      .append("circle")
      .attr("fill", "steelblue")
      .attr("stroke", "white")
      .attr("stroke-width", 1)
      .attr("opacity", 0.8)
      .style("pointer-events", "auto") // ✅ Enable mouse interactions
      .on("mouseover", function (event, d) {
        // Show tooltip on hover
        tooltip
          .style("display", "block")
          .html(
            `<b>${d.totalTraffic} trips</b><br>🚴‍♂️ ${d.departures} departures<br>🛬 ${d.arrivals} arrivals`
          );
      })
      .on("mousemove", function (event) {
        // Move tooltip with cursor
        tooltip
          .style("left", event.pageX + 10 + "px")
          .style("top", event.pageY - 10 + "px");
      })
      .on("mouseout", function () {
        // Hide tooltip when not hovering
        tooltip.style("display", "none");
      });

    // Step 4.1: Importing and parsing the traffic data
    const tripsUrl =
      "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv";

    console.log("Fetching traffic data...");
    const trips = await d3.csv(tripsUrl, d3.autoType);

    console.log("Loaded Traffic Data:", trips);

    // Step 4.2: Calculating traffic data
    const departures = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.start_station_id
    );

    const arrivals = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.end_station_id
    );

    stations = stations.map((station) => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
      return station;
    });

    console.log("Stations with Traffic Data:", stations);

    // Step 4.3: Size markers according to traffic
    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([3, 25]); // Prevents zero-size circles

    // ✅ Update function for positioning & scaling markers
    function updatePositions() {
      circles
        .attr("cx", (d) => getCoords(d).cx)
        .attr("cy", (d) => getCoords(d).cy)
        .attr("r", (d) => radiusScale(d.totalTraffic)); // ✅ Applies radius scaling
    }

    // ✅ Apply updates and make sure tooltips work dynamically
    updatePositions();

    // ✅ Ensure markers resize dynamically when interacting with the map
    map.on("move", updatePositions);
    map.on("zoom", updatePositions);
    map.on("resize", updatePositions);
    map.on("moveend", updatePositions);
  } catch (error) {
    console.error("Error loading data:", error);
  }
});
