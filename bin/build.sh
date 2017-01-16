#!/bin/bash

taxids=$1

interpro=$(<"interpro_version.txt");
if [ ! -e 'have_latest_interpro' ]; then
	echo "Retrieving InterPro data for release $interpro locally"
	mkdir -p /tmp/interpro;
	node node_modules/parse_interpro/index.js --release="$interpro" --taxid "$taxids" --test --output /tmp/interpro;
fi

if [ ! -e 'have_latest_interpro' ]; then
	echo "Syncing locally retrieved data to output bucket $BUILD_OUTPUT_BUCKET"
	aws s3 sync --metadata "version=$interpro" /tmp/interpro/ "s3://${BUILD_OUTPUT_BUCKET}/${BUILD_OUTPUT_PREFIX}/interpro/";
fi
