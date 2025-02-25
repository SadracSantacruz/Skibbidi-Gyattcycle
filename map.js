import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import mapboxgl from "https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm";

// Set your Mapbox access token
mapboxgl.accessToken =
  "pk.eyJ1Ijoic2FkcmFjc2FudGFjcnV6IiwiYSI6ImNtN2lveHZucDB1amkyc29sbmhvMnNzZWwifQ.PIX8O91zoii_Wb3vHbPpcw";

// Initialize the map
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/mapbox/streets-v12",
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

// Global Variables
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);
let stations, trips, circles, radiusScale;

let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

// Tooltip Setup
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

// **Time Slider Setup**
const timeSlider = document.getElementById("time-slider");
const selectedTime = document.getElementById("selected-time");
const anyTimeLabel = document.getElementById("any-time");

function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(2000, 0, 1, hours, mins).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// **Helper Functions**
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// 🚀 **Efficient Filtering via Pre-buckets**
function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) return tripsByMinute.flat(); // No filtering, return all trips

  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  return minMinute > maxMinute
    ? tripsByMinute
        .slice(minMinute)
        .concat(tripsByMinute.slice(0, maxMinute))
        .flat()
    : tripsByMinute.slice(minMinute, maxMinute).flat();
}

// 🚀 **Efficient Station Traffic Calculation**
function computeStationTraffic(stations, timeFilter = -1) {
  const departures = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter),
    (v) => v.length,
    (d) => d.start_station_id
  );

  const arrivals = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter),
    (v) => v.length,
    (d) => d.end_station_id
  );

  return stations.map((station) => {
    let id = station.short_name;
    station.departures = departures.get(id) ?? 0;
    station.arrivals = arrivals.get(id) ?? 0;
    station.totalTraffic = station.departures + station.arrivals;
    return station;
  });
}

// Update Scatter Plot Efficiently
function updateScatterPlot(timeFilter) {
  if (!stations) return; // Prevent crashes before data loads

  const filteredStations = computeStationTraffic(stations, timeFilter);

  timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

  circles
    .data(filteredStations, (d) => d.short_name)
    .join("circle")
    .attr("r", (d) => radiusScale(d.totalTraffic))
    .style("--departure-ratio", (d) =>
      stationFlow(d.departures / (d.totalTraffic || 1))
    );
}

// Update Time Display and Scatter Plot
function updateTimeDisplay() {
  let timeFilter = Number(timeSlider.value);

  if (timeFilter === -1) {
    selectedTime.textContent = "";
    anyTimeLabel.style.display = "block";
  } else {
    selectedTime.textContent = formatTime(timeFilter);
    anyTimeLabel.style.display = "none";
  }

  updateScatterPlot(timeFilter);
}

function updateSliderBackground() {
  const min = parseInt(timeSlider.min);
  const max = parseInt(timeSlider.max);
  const val = parseInt(timeSlider.value);

  // Calculate percentage for the progress fill
  const percent = ((val - min) / (max - min)) * 100;

  // Dynamically update the slider background
  timeSlider.style.background = `linear-gradient(to right, #3b82f6 ${percent}%, #ddd ${percent}%)`;
}

// Attach event listener to update slider fill on input
timeSlider.addEventListener("input", updateSliderBackground);
updateSliderBackground(); // Initialize fill on page load

timeSlider.addEventListener("input", updateTimeDisplay);
updateTimeDisplay(); // Initialize display

map.on("load", async () => {
  // Load Bike Lanes
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

  try {
    // Load Stations
    const stationsUrl =
      "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";
    const jsonData = await d3.json(stationsUrl);
    stations = jsonData.data.stations;

    // Load and Bucket Trips
    const tripsUrl =
      "https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv";
    trips = await d3.csv(tripsUrl, (trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);

      let startedMinutes = minutesSinceMidnight(trip.started_at);
      let endedMinutes = minutesSinceMidnight(trip.ended_at);

      departuresByMinute[startedMinutes].push(trip);
      arrivalsByMinute[endedMinutes].push(trip);

      return trip;
    });

    // Compute Initial Traffic
    stations = computeStationTraffic(stations);

    // Set Up SVG for Circles
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

    // Create Circles
    circles = svg
      .selectAll("circle")
      .data(stations, (d) => d.short_name)
      .enter()
      .append("circle")
      .attr("fill", "steelblue")
      .attr("stroke", "white")
      .attr("stroke-width", 1)
      .attr("opacity", 0.8)
      .style("--departure-ratio", (d) =>
        stationFlow(d.departures / (d.totalTraffic || 1))
      );

    // Define Radius Scale
    radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 25]);

    function updatePositions() {
      circles
        .attr("cx", (d) => getCoords(d).cx)
        .attr("cy", (d) => getCoords(d).cy)
        .attr("r", (d) => radiusScale(d.totalTraffic));
    }

    updatePositions();
    map.on("move", updatePositions);
    map.on("zoom", updatePositions);
  } catch (error) {
    console.error("Error loading data:", error);
  }
});
