#!/bin/bash

taxids=${1:-9606,7227,6239,284812,559292,9823,10090,10116,10029}
workdir=${2:-/work}

#rm -rf $workdir/interpro

if [ -e have_latest_interpro ]; then
	rm have_latest_interpro
fi

rm *version.txt

# Check for the latest version of InterPro from the source servers

checkversion --fail-on-match \
			 --print-remote \
			 --remote 'ftp://ftp.ebi.ac.uk/pub/databases/interpro/current_release/release_notes.txt' \
             --regex 'Release (\d+\.\d+)' > interpro_version.txt

interpro_version=$(<"interpro_version.txt")

aws sts get-caller-identity
has_credentials="$?"

if [[ $has_credentials == 0 ]]; then

	echo "Checking for presence of ${taxids%%,*} as extracted InterPro"
	echo "Checking S3 path s3:::${BUILD_OUTPUT_BUCKET}/${BUILD_OUTPUT_PREFIX}/interpro/InterPro-${interpro_version}-${taxids%%,*}.tsv"

	checkversion --fail-on-match \
			 --s3path "s3:::${BUILD_OUTPUT_BUCKET}/${BUILD_OUTPUT_PREFIX}/interpro/InterPro-${interpro_version}-${taxids%%,*}.tsv" \
			 --static "$interpro_version"

	have_existing_interpro=$?
else
	have_existing_interpro=0
	exit 0
fi

if [ $have_existing_interpro -gt 0 ]; then
	touch 'have_latest_interpro' && echo "We have an existing InterPro build for this release"
else
	echo "No existing file"
fi

# Grab the files that have already been parsed for InterPro


if [ -e 'have_latest_interpro' ]; then
	aws s3 sync "s3://${BUILD_OUTPUT_BUCKET}/${BUILD_OUTPUT_PREFIX}/interpro/" $workdir/interpro --exclude "*" --include "*-$interpro_version-*" --include "membrane-*" --include "*InterPro.tsv" --include "*$interpro_version.tsv"
fi

# Check that we have the extracted InterPro entries for our desired taxonomy ids

for taxid in ${taxids//,/ }; do
	if [ ! -e "$workdir/interpro/InterPro-${interpro_version}-${taxid}.tsv" ]; then
		echo "Missing InterPro data for $taxid - removing old data so that we can parse InterPro again"
		rm $workdir/interpro/*;
		rm have_latest_interpro;
	else
		echo "We have existing InterPro data for $taxid"
	fi
done

if [[ $has_credentials == 0 ]]; then
checkversion 	--fail-on-match \
				--print-remote \
				--remote "s3:::node-lambda/glycodomain/Glycodomain-latest-InterPro-latest-class.tsv" \
				--header 'version' > glycodomain_version.txt

glycodomain_version=$(<"glycodomain_version.txt")
echo "Checking for domains with version InterPro-${interpro_version}-Glycodomain-${glycodomain_version}"
fi

exit_code=1

for taxid in ${taxids//,/ }; do
	echo "Checking existence of Glycodomain json for $taxid"
	testversion_skip_exit "glycodomain_${taxid}.json" --static "Interpro-${interpro_version}-Glycodomain-${glycodomain_version}"
	retcode=$?
	if [ $retcode -ne 0 ]; then
		echo "Existing Glycodomain json for $taxid"
	else
		echo "No existing Glycodomain json for $taxid"
		exit_code=0
	fi
done

if [ $exit_code -eq 0 ]; then
	true
else
	echo "Glycodomain files are up to date"
	touch VERSION_MATCHING
	exit 2
fi
