// URL for pmtiles file hosted on the web
// pmtiles file should be hosted on the web server at the ./tile/ relative to index.html
const dates = await fetch("tile/temperature/dates.json")
  .then((response) => response.json());

function getPmtileSource(date) {
  const baseURL = location.href.replace("index.html", "");
  const pmtilesURL = `pmtiles://${baseURL}tile/temperature/${date}.pmtiles`;
  
  // apply pmtiles source
  return  {
    "type": "vector",
    "url": pmtilesURL,
  };

}

const initialPmtileSource = getPmtileSource(dates[0]);

console.log(`Loading initialPmtileSource: ${initialPmtileSource.url}`);


// fetch and load json style file
const style = await fetch("tile/style.json")
  .then((response) => response.json());

style.sources["mesh-source"] = initialPmtileSource;

// add pmtiles protocol
let protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// create a map
const map = new maplibregl.Map({
  container: "map",
  style,
  center: [139.7, 35.7],
  zoom: 5, // starting zoom
});

const SEARCH_AREA_SOURCE_ID = "search-area";
const SEARCH_AREA_FILL_LAYER_ID = "search-area-fill";
const SEARCH_AREA_LINE_LAYER_ID = "search-area-outline";
const EARTH_RADIUS_METERS = 6378137;

const radiusInput = document.getElementById('radius-input');
const searchResultPanel = document.getElementById('search-result');
const recentDatesContainer = document.getElementById('recent-dates');
const prevDateBtn = document.getElementById('prev-date-btn');
const nextDateBtn = document.getElementById('next-date-btn');
const dateSelector = document.getElementById('date-selector');
const radiusValueLabel = document.getElementById('radius-value');
let radiusKm = 50;
if (radiusInput) {
  const initialRadius = Number(radiusInput.value);
  if (Number.isFinite(initialRadius) && initialRadius > 0) {
    radiusKm = initialRadius;
  }
  updateRadiusLabel(radiusKm);
} else if (radiusValueLabel) {
  radiusValueLabel.textContent = `${radiusKm}`;
}
let selectedLngLat = null;
let centerMarker = null;
let coldestMarker = null;
let pendingSearch = false;
let selectedDateIndex = 0;


// create date selector
dates.forEach((date) => {
  const option = document.createElement('option');
  option.value = date;
  option.textContent = date;
  dateSelector.appendChild(option);
});

renderRecentDateButtons();
updateDateUIState();

// on date change, update the source
if (dateSelector) {
  dateSelector.addEventListener("change", function(event) {
    const selectedDate = event.target.value;
    applyDateChange(selectedDate);
  });
}

if (prevDateBtn && nextDateBtn) {
  prevDateBtn.addEventListener("click", () => stepDate(1));
  nextDateBtn.addEventListener("click", () => stepDate(-1));
}



// create a legend element
const legendGradient = document.getElementById('legend-gradient');

const fillColor = style.layers.find((l) => l.id === "mesh-fill")["paint"]["fill-color"];
const textField = style.layers.find((l) => l.id === "mesh-symbol")["layout"]["text-field"];
const colorScheme = convertColorScheme(fillColor);

createTemperatureGradientLegend(legendGradient, colorScheme);

// add interactivity
const temperatureInputs = document.querySelectorAll('input[name="temp"]');
temperatureInputs.forEach((el) => {
  el.addEventListener("change", function(event) {
    const selectedValue = event.target.value;
    console.log("Selected value:", selectedValue);

    fillColor[2][1] = `${selectedValue}_temp`
    textField[1] = `${selectedValue}_temp`;

    console.log(textField)

    // update the color scheme
    map.setPaintProperty("mesh-fill", "fill-color", fillColor);
    map.setLayoutProperty("mesh-symbol", "text-field", textField);

    if (selectedLngLat) {
      runColdestSearch();
    }
    
  });
});

if (radiusInput) {
  radiusInput.addEventListener("input", (event) => {
    const parsed = Number(event.target.value);
    radiusKm = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    updateRadiusLabel(radiusKm);
    if (selectedLngLat) {
      updateSearchAreaDisplay();
      runColdestSearch();
    }
  });
} else {
  console.warn("radius-input element is missing; using default radius 50km.");
}

map.on("load", () => {
  map.getCanvas().style.cursor = "crosshair";
  addSearchAreaLayers();
  map.on("click", handleMapClick);
});

map.on("styledata", () => {
  if (!map.isStyleLoaded()) {
    return;
  }
  addSearchAreaLayers();
  if (selectedLngLat) {
    updateSearchAreaDisplay();
  }
});


// functions ----------------------------
function convertColorScheme(inputArray) {
  const result = [];
  
  // Start from index 3 as the first three elements are not part of the color scheme
  for (let i = 3; i < inputArray.length; i += 2) {
      result.push({
          temp: inputArray[i],
          color: inputArray[i + 1]
      });
  }
  
  return result;
}

function createTemperatureGradientLegend(node, colorScheme) {
  
  // Create gradient bar
  const gradientBar = document.createElement('div');
  gradientBar.style.height = '20px';
  gradientBar.style.width = '100%';
  gradientBar.style.background = `linear-gradient(to right, ${colorScheme.map(item => item.color).join(', ')})`;
  gradientBar.style.marginBottom = '5px';
  node.appendChild(gradientBar);

  // Create labels
  const labelsContainer = document.createElement('div');
  labelsContainer.style.display = 'flex';
  labelsContainer.style.justifyContent = 'space-between';
  node.appendChild(labelsContainer);

  colorScheme.forEach((item, index) => {
      if (index === 0 || index === colorScheme.length - 1 || index % 2 === 0) {
          const label = document.createElement('div');
          label.textContent = `${item.temp}°C`;
          label.style.flex = '0 0 auto';
          label.style.textAlign = index === 0 ? 'left' : (index === colorScheme.length - 1 ? 'right' : 'center');
          labelsContainer.appendChild(label);
      }
  });
}

function handleMapClick(event) {
  selectedLngLat = event.lngLat;
  if (!centerMarker) {
    centerMarker = new maplibregl.Marker({ color: "#444" });
  }
  centerMarker.setLngLat(selectedLngLat).addTo(map);
  updateSearchAreaDisplay();
  runColdestSearch();
}

function getSelectedMetricKey() {
  const selectedRadio = document.querySelector('input[name="temp"]:checked');
  const metric = selectedRadio ? selectedRadio.value : "max";
  return `${metric}_temp`;
}

// MapLibreのイベントと距離APIだけで半径検索を完結させる
function runColdestSearch() {
  if (!selectedLngLat || !radiusKm) {
    updateResultPanel();
    return;
  }

  if (!map.isStyleLoaded()) {
    if (!pendingSearch) {
      pendingSearch = true;
      map.once("idle", () => {
        pendingSearch = false;
        runColdestSearch();
      });
    }
    return;
  }

  const radiusMeters = radiusKm * 1000;
  const candidateFeatures = queryFeaturesNearSelection(selectedLngLat, radiusMeters);
  const metricKey = getSelectedMetricKey();
  const center = new maplibregl.LngLat(selectedLngLat.lng, selectedLngLat.lat);

  let coldest = null;

  candidateFeatures.forEach((feature) => {
    const coords = feature.geometry?.coordinates;
    if (!coords) {
      return;
    }
    const candidateCoord = extractRepresentativeCoordinate(feature);
    const candidate = new maplibregl.LngLat(candidateCoord[0], candidateCoord[1]);
    const distance = center.distanceTo(candidate);
    if (distance > radiusMeters) {
      return;
    }
    const value = Number(feature.properties?.[metricKey]);
    if (Number.isNaN(value)) {
      return;
    }
    if (!coldest || value < coldest.value) {
      coldest = {
        value,
        distance,
        coordinates: candidateCoord,
        properties: feature.properties,
      };
    }
  });

  if (!coldest) {
    updateResultPanel();
    updateResultMarker();
    return;
  }

  updateResultPanel(coldest);
  updateResultMarker(coldest.coordinates);
  updateSearchAreaDisplay();
}

// queryRenderedFeaturesにはピクセル単位のバウンディングボックスが必要なので距離をピクセルへ変換
function queryFeaturesNearSelection(center, radiusMeters) {
  const metersPerPixel = getMetersPerPixel(center.lat, map.getZoom());
  const radiusPixels = radiusMeters / metersPerPixel;
  const projected = map.project(center);
  const minPoint = [projected.x - radiusPixels, projected.y - radiusPixels];
  const maxPoint = [projected.x + radiusPixels, projected.y + radiusPixels];
  return map.queryRenderedFeatures([minPoint, maxPoint], { layers: ["mesh-fill"] });
}

// Webメルカトルの解像度 (m/px) を算出し、任意半径をスクリーンスペースに写像する
function getMetersPerPixel(latitude, zoom) {
  const earthCircumference = 40075016.686; // meters
  return (earthCircumference * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom + 8);
}

function updateResultPanel(result) {
  if (!result) {
    searchResultPanel.textContent = "指定半径内に気温データがありません。ズームや半径を調整して再検索してください。";
    return;
  }

  const tempLabel = getSelectedMetricKey() === "min_temp" ? "最低気温" : "最高気温";
  const distanceKm = (result.distance / 1000).toFixed(1);
  searchResultPanel.innerHTML = `
    <div><strong>${tempLabel}</strong>${result.value.toFixed(1)} °C</div>
    <div><strong>距離</strong>${distanceKm} km</div>
    <div><strong>座標</strong>${result.coordinates[1].toFixed(3)}, ${result.coordinates[0].toFixed(3)}</div>
  `;
}

function updateResultMarker(coordinates) {
  if (!coordinates) {
    if (coldestMarker) {
      coldestMarker.remove();
      coldestMarker = null;
    }
    return;
  }

  if (!coldestMarker) {
    coldestMarker = new maplibregl.Marker({ color: "#ff3b30" });
  }
  coldestMarker.setLngLat(coordinates).addTo(map);
}

function extractRepresentativeCoordinate(feature) {
  const geom = feature.geometry;
  if (!geom) {
    return [feature.properties?.longitude || 0, feature.properties?.latitude || 0];
  }
  if (geom.type === "Point") {
    return geom.coordinates;
  }
  if (geom.type === "Polygon") {
    const ring = geom.coordinates[0];
    if (!ring || ring.length < 3) {
      return ring?.[0] || [0, 0];
    }
    const lastIndex = ring.length - 1;
    const coords = ring.slice(0, lastIndex);
    const sum = coords.reduce(
      (acc, coord) => {
        acc[0] += coord[0];
        acc[1] += coord[1];
        return acc;
      },
      [0, 0]
    );
    return [sum[0] / coords.length, sum[1] / coords.length];
  }
  if (geom.type === "MultiPolygon") {
    const firstPoly = geom.coordinates[0];
    if (!firstPoly) {
      return [0, 0];
    }
    const ring = firstPoly[0];
    if (!ring || ring.length < 3) {
      return ring?.[0] || [0, 0];
    }
    const lastIndex = ring.length - 1;
    const coords = ring.slice(0, lastIndex);
    const sum = coords.reduce(
      (acc, coord) => {
        acc[0] += coord[0];
        acc[1] += coord[1];
        return acc;
      },
      [0, 0]
    );
    return [sum[0] / coords.length, sum[1] / coords.length];
  }
  return [0, 0];
}

function addSearchAreaLayers() {
  if (!map.getSource(SEARCH_AREA_SOURCE_ID)) {
    map.addSource(SEARCH_AREA_SOURCE_ID, {
      type: "geojson",
      data: emptyFeature(),
    });
  }

  if (!map.getLayer(SEARCH_AREA_FILL_LAYER_ID)) {
    map.addLayer({
      id: SEARCH_AREA_FILL_LAYER_ID,
      type: "fill",
      source: SEARCH_AREA_SOURCE_ID,
      paint: {
        "fill-color": "#5b8def",
        "fill-opacity": 0.08,
      },
    });
  }

  if (!map.getLayer(SEARCH_AREA_LINE_LAYER_ID)) {
    map.addLayer({
      id: SEARCH_AREA_LINE_LAYER_ID,
      type: "line",
      source: SEARCH_AREA_SOURCE_ID,
      paint: {
        "line-color": "#5b8def",
        "line-width": 1,
      },
    });
  }
}

function updateSearchAreaDisplay() {
  const source = map.getSource(SEARCH_AREA_SOURCE_ID);
  if (!source) {
    return;
  }

  if (!selectedLngLat || !radiusKm) {
    source.setData(emptyFeature());
    return;
  }

  source.setData(createCircleFeature(selectedLngLat, radiusKm * 1000));
}

function createCircleFeature(center, radiusMeters, steps = 64) {
  const ring = [];
  const latRad = degreesToRadians(center.lat);
  const lngRad = degreesToRadians(center.lng);
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;

  for (let i = 0; i <= steps; i++) {
    const bearing = (2 * Math.PI * i) / steps;
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const sinAngular = Math.sin(angularDistance);
    const cosAngular = Math.cos(angularDistance);
    const sinBearing = Math.sin(bearing);
    const cosBearing = Math.cos(bearing);

    const lat2 = Math.asin(
      sinLat * cosAngular + cosLat * sinAngular * cosBearing
    );
    const lng2 =
      lngRad +
      Math.atan2(
        sinBearing * sinAngular * cosLat,
        cosAngular - sinLat * Math.sin(lat2)
      );

    ring.push([radiansToDegrees(lng2), radiansToDegrees(lat2)]);
  }

  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [ring],
        },
        properties: {},
      },
    ],
  };
}

function degreesToRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function emptyFeature() {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function renderRecentDateButtons() {
  if (!recentDatesContainer) {
    return;
  }
  recentDatesContainer.innerHTML = "";
  const displayDates = dates.slice(0, 6);
  displayDates.forEach((date) => {
    const button = document.createElement("button");
    button.className = "chip-button";
    button.textContent = formatDateLabel(date);
    button.dataset.date = date;
    button.addEventListener("click", () => applyDateChange(date));
    recentDatesContainer.appendChild(button);
  });
}

function updateDateUIState() {
  if (dateSelector) {
    dateSelector.value = dates[selectedDateIndex];
  }
  if (recentDatesContainer) {
    recentDatesContainer.querySelectorAll(".chip-button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.date === dates[selectedDateIndex]);
    });
  }
  if (prevDateBtn) {
    prevDateBtn.disabled = selectedDateIndex >= dates.length - 1;
  }
  if (nextDateBtn) {
    nextDateBtn.disabled = selectedDateIndex <= 0;
  }
}

function applyDateChange(date) {
  const newIndex = dates.indexOf(date);
  if (newIndex === -1 || newIndex === selectedDateIndex) {
    return;
  }
  selectedDateIndex = newIndex;
  updateDateUIState();

  const newSource = getPmtileSource(date);
  style.sources["mesh-source"] = newSource;
  map.setStyle(style);
  console.log(`Loading pmtilesSource: ${newSource.url}`);

  if (selectedLngLat) {
    map.once("idle", () => runColdestSearch());
  }
}

function stepDate(offset) {
  const targetIndex = selectedDateIndex + offset;
  if (targetIndex < 0 || targetIndex >= dates.length) {
    return;
  }
  applyDateChange(dates[targetIndex]);
}

function formatDateLabel(compact) {
  if (!compact || compact.length !== 8) {
    return compact;
  }
  const y = compact.slice(0, 4);
  const m = compact.slice(4, 6);
  const d = compact.slice(6, 8);
  return `${y}/${m}/${d}`;
}

function updateRadiusLabel(value) {
  if (!radiusValueLabel) {
    return;
  }
  radiusValueLabel.textContent = `${value}`;
}
