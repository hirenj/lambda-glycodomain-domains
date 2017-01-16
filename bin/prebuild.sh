#!/bin/bash

taxids=$1

rm -rf /tmp/interpro
rm have_latest_interpro
rm *version.txt

# Check for the latest version of InterPro from the source servers

checkversion --fail-on-match \
			 --print-remote \
			 --remote 'ftp://ftp.ebi.ac.uk/pub/databases/interpro/current/release_notes.txt' \
             --regex 'Release (\d+\.\d+)' > interpro_version.txt

interpro_version=$(<"interpro_version.txt")

echo "Checking for presence of ${taxids%,*} as extracted InterPro"

checkversion --fail-on-match \
			 --print \
			 --s3path "s3:::${BUILD_OUTPUT_BUCKET}/${BUILD_OUTPUT_PREFIX}/interpro/InterPro-${interpro_version}-${taxids%,*}.tsv" \
			 --static "$interpro_version" && echo "No existing file" || touch 'have_latest_interpro' && echo "We have an existing InterPro build for this release"

# Grab the files that have already been parsed for InterPro


if [ -e 'have_latest_interpro' ]; then
	aws s3 sync "s3://${BUILD_OUTPUT_BUCKET}/${BUILD_OUTPUT_PREFIX}/interpro/" /tmp/interpro/
fi

# Check that we have the extracted InterPro entries for our desired taxonomy ids

for taxid in $taxids; do
	if [ -e "/tmp/interpro/InterPro-${taxid}.tsv" ]; then
		echo "Missing InterPro data for $taxid - removing old data so that we can parse InterPro again"
		rm /tmp/interpro/*;
		rm have_latest_interpro;
	fi
done


checkversion 	--fail-on-match \
				--print-remote \
				--remote "s3:::node-lambda/glycodomain/Glycodomain-latest-InterPro-$interpro_version-class.tsv" \
				--header 'version' > glycodomain_version.txt

glycodomain_version=$(<"glycodomain_version.txt")

echo "Checking for domains with version InterPro-${interpro_version}-Glycodomain-${glycodomain_version}"

testversion "glycodomain_${taxids%,*}.json" --static "Interpro-${interpro_version}-Glycodomain-${glycodomain_version}"