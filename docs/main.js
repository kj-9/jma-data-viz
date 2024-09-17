// URL for pmtiles file hosted on the web
// pmtiles file should be hosted on the web server at the ./tile/ relative to index.html
const pmtilesURL = `pmtiles://${
  location.href.replace("index.html", "")
}tile/out.pmtiles`;
console.log(`Loading pmtiles at ${pmtilesURL}...`);

// apply pmtiles source
const pmtilesSource = {
  "type": "vector",
  "url": pmtilesURL,
};

// fetch and load json style file
const style = await fetch("tile/style.json")
  .then((response) => response.json());

style.sources["points-source"] = pmtilesSource;

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


// create a legend element
const legendGradient = document.getElementById('legend-gradient');

const circleColor = style.layers.find((l) => l.id === "pmtiles")["paint"]["circle-color"];
const textField = style.layers.find((l) => l.id === "pmtiles-symbol")["layout"]["text-field"];
const colorScheme = convertColorScheme(circleColor);

createTemperatureGradientLegend(legendGradient, colorScheme);

// add interactivity
document.querySelectorAll('input[name="temp"]').forEach((el) => {
  el.addEventListener("change", function(event) {
    const selectedValue = event.target.value;
    console.log("Selected value:", selectedValue);

    circleColor[2][1] = `${selectedValue}_temp`
    textField[1] = `${selectedValue}_temp`;

    console.log(textField)

    // update the color scheme
    map.setPaintProperty("pmtiles", "circle-color", circleColor);
    map.setLayoutProperty("pmtiles-symbol", "text-field", textField);
    
  });
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
