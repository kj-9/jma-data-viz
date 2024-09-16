tippecanoe data/data.geojson \
  --force \
  -o site/tile/out.pmtiles \
  -l points \
  --drop-densest-as-needed \
  -zg --coalesce-densest-as-needed --extend-zooms-if-still-dropping

# -B 14: min zoom level
# -zg: guess zoom level
# --coalesce-densest-as-needed: coalesce densest
# --extend-zooms-if-still-dropping: extend zooms if still dropping
 
 
#tileserver-gl-light site/tile/out.pmtiles
