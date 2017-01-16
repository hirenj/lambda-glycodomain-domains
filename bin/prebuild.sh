#!/bin/bash

taxids=$1

# Check for the latest version of InterPro from the source servers

(checkversion --fail-on-match \
			 --print-remote \
			 --remote 'ftp://ftp.ebi.ac.uk/pub/databases/interpro/current/release_notes.txt' \
             --regex 'Release (\d+\.\d+)' \
			 --s3path "s3:::${BUILD_OUTPUT_BUCKET}/${BUILD_OUTPUT_PREFIX}/interpro/Interpro-${taxids%,*}.tsv" > interpro_version.txt) || touch 'have_latest_interpro'


# Grab the files that have already been parsed for InterPro


if [ -e 'have_latest_interpro' ]; then
	aws s3 sync "s3://${BUILD_OUTPUT_BUCKET}/${BUILD_OUTPUT_PREFIX}/interpo/" /tmp/interpro/
fi

# Check that we have the extracted InterPro entries for our desired taxonomy ids

for taxid in $taxids; do
	if [ -e "/tmp/interpro/InterPro-${taxid}.tsv" ]; then
		echo "Missing InterPro data for $taxid - removing old data so that we can parse InterPro again"
		rm /tmp/interpro/*;
		rm have_latest_interpro;
	fi
done

interpro_version=$(<"interpro_version.txt")

checkversion 	--fail-on-match \
				--print-remote \
				--remote "s3:::node-lambda/glycodomain/Glycodomain-latest-InterPro-$interpro_version-class.tsv" \
				--header 'version' > glycodomain_version.txt

glycodomain_version=$(<"glycodomain_version.txt")

echo "Checking for domains with version InterPro-${interpro_version}-Glycodomain-${glycodomain_version}"

testversion "glycodomain_${taxids%,*}.json" --static "Interpro-${interpro_version}-Glycodomain-${glycodomain_version}"