# Custom builds of data

```
docker build . --tag glycodomain:latest
docker run --rm -v $HOME/.build-cache:/work -v $HOME/build-output/glycodomain:/dist glycodomain:latest
```

If you want to develop using the image/container, then mount this code folder into /build


You'll need to change the uniprot query id under node_modules/parse_interpro/uniprot.js so that
instead of filtering by organism: (more precise), it filters by taxonomy: , which captures
all child taxonomies (useful for families/viral stuff).


