#!/bin/bash

if [ ! -z $BUILD_TEST ]; then
	build_test_flag="--test"
fi

curl="curl -ssS"

curl="curl"

cached_curl

if [ $? -eq 0 ]; then
	curl="cached_curl"
fi

aws sts get-caller-identity
has_credentials="$?"

taxids=${1:-9606,7227,6239,284812,559292,9823,10090,10116,10029}
workdir=${2:-/work}
outdir=${3:-/dist}

interpro=$(<"interpro_version.txt");

curlpath=$(which curl)
echo "Using $curl for curl ($curlpath)"

if [ ! -e 'have_latest_interpro' ]; then
	echo "Retrieving InterPro data for release $interpro locally"
	mkdir -p $workdir/interpro;
	if [ ! -f "$workdir/interpro_$interpro.gz" ]; then
		$curl "ftp://ftp.ebi.ac.uk/pub/databases/interpro/releases/$interpro/protein2ipr.dat.gz" > "$workdir/interpro_$interpro.gz"
		if [ $? -gt 0 ]; then
			errcode = $?
			echo "Failed to download InterPro file"
			exit $errcode
		fi
	fi
	echo "File info for locally downloaded InterPro"
	local_interpro_info=$(ls -al $workdir/interpro_$interpro.gz)
	echo "$local_interpro_info"
	if [ ! -s $workdir/interpro_$interpro.gz ]; then
		echo "InterPro file is zero length, aborting"
		exit 1
	fi
	node node_modules/parse_interpro/index.js --interpro-data="$workdir/interpro_$interpro.gz" --release="$interpro" --taxid "$taxids" $build_test_flag --output $workdir/interpro;
	if [ $? -gt 0 ]; then
		errcode = $?
		echo "Failed to download InterPro entries"
		exit $errcode
	fi
	cp "$workdir/interpro/meta-InterPro-$interpro.tsv" "$workdir/interpro/meta-InterPro.tsv"
	cp "$workdir/interpro/class-InterPro-$interpro.tsv" "$workdir/interpro/class-InterPro.tsv"
	for f in $workdir/interpro/membrane*.tsv
	do
	    [ -f "$f" ] && mv "$f" "${f%.tsv}"
	done
fi

if [ ! -e 'have_latest_interpro' && "$has_credentials" == 0 ]; then
	echo "Syncing locally retrieved data to output bucket $BUILD_OUTPUT_BUCKET"
	aws s3 sync --metadata "version=$interpro" $workdir/interpro/ "s3://${BUILD_OUTPUT_BUCKET}/${BUILD_OUTPUT_PREFIX}/interpro/";
	if [ $? -gt 0 ]; then
		errcode=$?
		echo "Could not upload InterPro entries to S3 server"
		exit $errcode
	fi
fi

for membrane_file in $workdir/interpro/membrane-*; do
	echo "Sorting $membrane_file"
	sort -k1 -o "$membrane_file" "$membrane_file"
done

for interpro_file in $workdir/interpro/InterPro-$interpro-*.tsv; do
	echo "Sorting $interpro_file"
	sort -k1 -o "$interpro_file" "$interpro_file"
done

cp Glycodomain-latest-InterPro-latest-class.tsv $workdir/interpro/

if [ ! -d "$outdir" ]; then
	mkdir -p "$outdir"
fi

LOCAL_FILES=$workdir/interpro LOCAL_RELEASE="$interpro" node script.js --output "$outdir" --release=$interpro #--interpro_bucket "$BUILD_OUTPUT_BUCKET" --interpro_bucket_prefix "$BUILD_OUTPUT_PREFIX/interpro" --release=$interpro

