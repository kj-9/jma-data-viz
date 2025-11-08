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

style.sources["points-source"] = initialPmtileSource;

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
let radiusKm = Number(radiusInput?.value) || 50;
let selectedLngLat = null;
let centerMarker = null;
let coldestMarker = null;
let pendingSearch = false;


// create date selector
const dateSelector = document.getElementById('date-selector');
dates.forEach((date) => {
  const option = document.createElement('option');
  option.value = date;
  option.textContent = date;
  dateSelector.appendChild(option);
});

// on date change, update the source
dateSelector.addEventListener("change", function(event) {
  const selectedDate = event.target.value;
  console.log("Selected date:", selectedDate);

  const newSource = getPmtileSource(selectedDate);

  style.sources["points-source"] = newSource;

  map.setStyle(style);
  console.log(`Loading pmtilesSource: ${newSource.url}`);

  if (selectedLngLat) {
    map.once("idle", () => runColdestSearch());
  }
});



// create a legend element
const legendGradient = document.getElementById('legend-gradient');

const circleColor = style.layers.find((l) => l.id === "pmtiles")["paint"]["circle-color"];
const textField = style.layers.find((l) => l.id === "pmtiles-symbol")["layout"]["text-field"];
const colorScheme = convertColorScheme(circleColor);

createTemperatureGradientLegend(legendGradient, colorScheme);

// add interactivity
const temperatureInputs = document.querySelectorAll('input[name="temp"]');
temperatureInputs.forEach((el) => {
  el.addEventListener("change", function(event) {
    const selectedValue = event.target.value;
    console.log("Selected value:", selectedValue);

    circleColor[2][1] = `${selectedValue}_temp`
    textField[1] = `${selectedValue}_temp`;

    console.log(textField)

    // update the color scheme
    map.setPaintProperty("pmtiles", "circle-color", circleColor);
    map.setLayoutProperty("pmtiles-symbol", "text-field", textField);

    if (selectedLngLat) {
      runColdestSearch();
    }
    
  });
});

radiusInput.addEventListener("input", (event) => {
  const parsed = Number(event.target.value);
  radiusKm = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  if (selectedLngLat) {
    updateSearchAreaDisplay();
    runColdestSearch();
  }
});

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
    const candidate = new maplibregl.LngLat(coords[0], coords[1]);
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
        coordinates: coords,
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
  return map.queryRenderedFeatures([minPoint, maxPoint], { layers: ["pmtiles"] });
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
