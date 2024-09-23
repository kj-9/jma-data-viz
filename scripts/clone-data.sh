#!/bin/bash

# git clone a file with no extra history
rm -rf jma-data
git clone --depth 1  --filter=blob:none --no-checkout https://github.com/kj-9/jma-data.git
cd jma-data
git sparse-checkout set data/jma.db.gz
git checkout

# gunzip
gunzip -k "jma.db.gz"
