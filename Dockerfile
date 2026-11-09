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

# git refuses to operate on a repo it doesn't own ("detected dubious ownership", git >= 2.35.2,
# CVE-2022-24765) - /build is owned by root (COPY, above) but build.sh runs as the arbitrary host
# UID from --user, so `git rev-parse HEAD` (GIT_SHA in build.sh) silently fell back to its "unknown"
# default via its own `|| echo unknown`, instead of erroring - a quiet loss of data provenance
# rather than a visible failure. --system (not --global) so it applies regardless of $HOME, which
# isn't reliably set for an arbitrary numeric --user with no /etc/passwd entry. Scoped to this one
# path, not a wildcard, since that's the only directory this image ever runs git against.
RUN git config --system --add safe.directory /build

# Switch back to dialog for any ad-hoc use of apt-get
ENV DEBIAN_FRONTEND=

CMD /build/bin/prebuild.sh && /build/bin/build.sh
