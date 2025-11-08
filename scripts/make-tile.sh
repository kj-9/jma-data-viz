#!/bin/bash
set -eu -o pipefail

# constants
FILE_DB="jma-data/data/jma.db"
FILE_GEOJSON="jma-data/data/jma.geojson"

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
splite '
create table geojson as
select
  min_temp,
  max_temp,
  points.geometry as geometry
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
);' -p valid_date $VALID_DATE -p land_geojson "$LAND_GEOMETRY"


splite \
  "SELECT RecoverGeometryColumn('geojson', 'geometry', 4326, 'POINT');"


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
  -l points \
  --drop-densest-as-needed \
  -zg --coalesce-densest-as-needed --extend-zooms-if-still-dropping
