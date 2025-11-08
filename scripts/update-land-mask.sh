#!/bin/bash
set -eu -o pipefail

DATA_DIR="data"
SRC_DIR="$DATA_DIR/land-src"
LAND_GEOJSON="$DATA_DIR/japan-land.geojson"
NE_URL="https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip"
NE_ZIP="$SRC_DIR/ne_10m_admin_0_countries.zip"
NE_SHP="$SRC_DIR/ne_10m_admin_0_countries.shp"

mkdir -p "$SRC_DIR"

echo "Downloading Natural Earth coastline (10m admin_0 countries)..."
curl -L "$NE_URL" -o "$NE_ZIP"

echo "Unpacking shapefile..."
unzip -o "$NE_ZIP" -d "$SRC_DIR" >/dev/null

if ! command -v ogr2ogr >/dev/null 2>&1; then
  echo "ogr2ogr is required. Install GDAL (e.g., brew install gdal) and retry." >&2
  exit 1
fi

echo "Extracting Japan polygons into $LAND_GEOJSON..."
ogr2ogr -f GeoJSON -where "ADM0_A3 = 'JPN'" "$LAND_GEOJSON" "$NE_SHP"

echo "Done. Updated $LAND_GEOJSON"
