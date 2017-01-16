#!/bin/bash

taxids=$1

interpro=$(<"interpro_version.txt");
if [ ! -e 'have_latest_interpro' ]; then
	echo "Retrieving InterPro data for release $interpro locally"
	mkdir -p /tmp/interpro;
	node node_modules/parse_interpro/index.js --release="$interpro" --taxid "$taxids" --test --output /tmp/interpro;
	cp "/tmp/interpro/meta-InterPro-$interpro.tsv" "/tmp/interpro/meta-InterPro.tsv"
	cp "/tmp/interpro/class-InterPro-$interpro.tsv" "/tmp/interpro/class-InterPro.tsv"
	for f in /tmp/interpro/membrane*.tsv
	do
	    [ -f "$f" ] && mv "$f" "${f%.tsv}"
	done
fi

if [ ! -e 'have_latest_interpro' ]; then
	echo "Syncing locally retrieved data to output bucket $BUILD_OUTPUT_BUCKET"
	aws s3 sync --metadata "version=$interpro" /tmp/interpro/ "s3://${BUILD_OUTPUT_BUCKET}/${BUILD_OUTPUT_PREFIX}/interpro/";
fi

if [ ! -d dist ]; then
	mkdir -p dist
fi

node script.js