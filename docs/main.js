
// URL for pmtiles file hosted on the web
// pmtiles file should be hosted on the web server at the ./tile/ relative to index.html
const pmtilesURL = `pmtiles://${location.href.replace("index.html", "")}tile/out.pmtiles`
console.log(`Loading pmtiles at ${pmtilesURL}...`)

// apply pmtiles source
const pmtilesSource = {
        "type": "vector",
        "url": pmtilesURL
}

// fetch and load json style file
const style = await fetch('tile/style.json')
.then(response => response.json())

style.sources["points-source"] = pmtilesSource;

// add pmtiles protocol
let protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles",protocol.tile);


const map = new maplibregl.Map({
  container: 'map',
  style,
  center: [139.7, 35.7], 
  zoom: 5 // starting zoom
});
