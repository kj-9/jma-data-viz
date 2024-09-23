#!/bin/bash
set -eu -o pipefail

# constants
FILE_DB="jma-data/data/jma.db"

# alias
splite() {
    sqlite-utils --load-extension=spatialite "$FILE_DB" "$@"
}

sqlite-utils $FILE_DB "select distinct valid_date from dates order by valid_date desc" \
    | jq '[.[].valid_date]' > docs/tile/temperature/dates.json
