#!/bin/bash
set -eu -o pipefail

# constants
FILE_DB="jma-data/data/jma.db"
FILE_GEOJSON="jma-data/data/jma.geojson"

# arg
VALID_DATE=$1 # from arg like "20240923"


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
);' -p valid_date $VALID_DATE


splite \
  "SELECT RecoverGeometryColumn('geojson', 'geometry', 4326, 'POINT');"


echo "exporting geojson ..."
export SPATIALITE_SECURITY=relaxed 
splite "select ExportGeoJSON2('geojson', 'geometry', :out_file)" -p out_file $FILE_GEOJSON


echo "drop table geojson ..."
splite "select DropTable('main', 'geojson');"


echo "creating tile ..."
tippecanoe $FILE_GEOJSON \
  --force \
  -o docs/tile/temperature/${VALID_DATE}.pmtiles \
  -l points \
  --drop-densest-as-needed \
  -zg --coalesce-densest-as-needed --extend-zooms-if-still-dropping
  
#tileserver-gl-light docs/tile/out.pmtiles
