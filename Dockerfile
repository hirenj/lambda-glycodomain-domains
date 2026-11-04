FROM node:lts

# Avoid warnings by switching to noninteractive
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y less awscli \
#
    && apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*


RUN npm install -g hirenj/node-checkversion

RUN mkdir -p /build

COPY . /build

WORKDIR /build

RUN npm install

# The orchestrator runs this image with --user <host-uid>:<host-gid> (needed so its /dist bind
# mount, written at runtime, ends up owned by the host user) - but COPY/npm install above land
# everything in /build owned by root, and prebuild.sh/build.sh write intermediates inside /build
# itself (e.g. the InterPro download/cache), not just to /dist. Without this, those writes fail
# EACCES under a non-root --user.
RUN chmod -R a+rwX /build

# Switch back to dialog for any ad-hoc use of apt-get
ENV DEBIAN_FRONTEND=

CMD /build/bin/prebuild.sh && /build/bin/build.sh
