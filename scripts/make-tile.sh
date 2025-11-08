#!/bin/bash
set -eu -o pipefail

# constants
FILE_DB="jma-data/data/jma.db"
FILE_GEOJSON="jma-data/data/jma.geojson"
MESH_LAT_STEP=0.05
MESH_LON_STEP=0.0625
MESH_LAT_HALF=$(awk "BEGIN {print $MESH_LAT_STEP / 2}")
MESH_LON_HALF=$(awk "BEGIN {print $MESH_LON_STEP / 2}")
MESH_LAT_OFFSET=0
MESH_LON_OFFSET=0

# arg
VALID_DATE=$1 # from arg like "20240923"

# land mask
FILE_LAND_GEOJSON="data/japan-land.geojson"
if [[ ! -f "$FILE_LAND_GEOJSON" ]]; then
  echo "Missing land mask at $FILE_LAND_GEOJSON. Run curl -L https://raw.githubusercontent.com/johan/world.geo.json/master/countries/JPN.geo.json -o $FILE_LAND_GEOJSON" >&2
  exit 1
fi
LAND_GEOMETRY=$(jq -c '.features[0].geometry' "$FILE_LAND_GEOJSON")

# alias
splite() {
    sqlite-utils --load-extension=spatialite "$FILE_DB" "$@"
}

echo "creating tile for $VALID_DATE"

echo "dropping table geojson ..."
splite "drop table if exists geojson;"

echo "creating table geojson ..."
splite "
create table geojson as
with base as (
  select
    min_temp,
    max_temp,
    floor((st_x(points.geometry) + :lon_offset) / :lon_step) as lon_idx,
    floor((st_y(points.geometry) + :lat_offset) / :lat_step) as lat_idx
  from temperature
      left join points using(point_id)
  where date_id in (
      select date_id
      from dates
      where valid_date = :valid_date
  )
  and ST_Intersects(
      points.geometry,
      GeomFromGeoJSON(:land_geojson)
  )
)
select
  min_temp,
  max_temp,
  SetSRID(
    BuildMbr(
      (lon_idx * :lon_step) - :lon_offset,
      (lat_idx * :lat_step) - :lat_offset,
      ((lon_idx + 1) * :lon_step) - :lon_offset,
      ((lat_idx + 1) * :lat_step) - :lat_offset
    ),
    4326
  ) as geometry
from base;
" -p valid_date $VALID_DATE -p land_geojson "$LAND_GEOMETRY" -p lon_step $MESH_LON_STEP -p lat_step $MESH_LAT_STEP -p lon_offset $MESH_LON_OFFSET -p lat_offset $MESH_LAT_OFFSET


splite \
  "SELECT RecoverGeometryColumn('geojson', 'geometry', 4326, 'POLYGON');"


echo "exporting geojson ..."
export SPATIALITE_SECURITY=relaxed 
splite "select ExportGeoJSON2('geojson', 'geometry', :out_file)" -p out_file $FILE_GEOJSON


echo "drop table geojson ..."
splite "select DropTable('main', 'geojson');"


# TODO: migrate existing pmtiles once to remove sea-only points (rerun make-tile.sh for each date).
echo "creating tile ..."
tippecanoe $FILE_GEOJSON \
  --force \
  -o docs/tile/temperature/${VALID_DATE}.pmtiles \
  -l mesh \
  --detect-shared-borders \
  --drop-densest-as-needed \
  -zg --coalesce-densest-as-needed --extend-zooms-if-still-dropping
