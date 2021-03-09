# Custom builds of data

We first need to start up an environment to run the build

```
build_data_docker
```
(make sure this mounts the /work folder)

Prepare the local build dependencies

```
cd /lambda-glycodomain-domains
npm install
```

Fire off the build

```
build pre_build
export BUILD_TAXONOMY=10298,10310,10319,10359,10376; export LOCAL_FILES=/work/interpro; export LOCAL_RELEASE=84.0; build build
```

You'll need to change the uniprot query id under node_modules/parse_interpro/uniprot.js so that
instead of filtering by organism: (more precise), it filters by taxonomy: , which captures
all child taxonomies (useful for families/viral stuff).


