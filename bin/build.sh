#!/bin/bash

if [ ! -z $BUILD_TEST ]; then
	build_test_flag="--test"
fi

curl="curl -ssS"

cached_curl

if [ $? -eq 0 ]; then
	curl="cached_curl"
fi

taxids=$1

interpro=$(<"interpro_version.txt");

if [ ! -e 'have_latest_interpro' ]; then
	echo "Retrieving InterPro data for release $interpro locally"
	mkdir -p /tmp/interpro;
	$curl "ftp://ftp.ebi.ac.uk/pub/databases/interpro/$interpro/protein2ipr.dat.gz" > "/tmp/interpro_$interpro.gz"
	node node_modules/parse_interpro/index.js --interpro-data="/tmp/interpro_$interpro.gz" --release="$interpro" --taxid "$taxids" $build_test_flag --output /tmp/interpro;
	if [ $? -gt 0 ]; then
		errcode = $?
		echo "Failed to download InterPro entries"
		exit $errcode
	fi
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
	if [ $? -gt 0 ]; then
		errcode = $?
		echo "Could not download InterPro entries from server"
		exit $errcode
	fi
fi

if [ ! -d dist ]; then
	mkdir -p dist
fi

node script.js --output dist --interpro_bucket "$BUILD_OUTPUT_BUCKET" --interpro_bucket_prefix "$BUILD_OUTPUT_PREFIX/interpro"