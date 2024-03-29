#!/usr/bin/env bash

set -euxo pipefail

DEVCONTAINER_DIR=$(dirname $0)
WORKSPACE_FOLDER=$(dirname "${DEVCONTAINER_DIR}")

mkdir -p "${DEVCONTAINER_DIR}/run"

function cleanup()
{
    CONTAINER_ID=$(jq -r .containerId .devcontainer/run/up.json)
    podman rm -f "${CONTAINER_ID}"
    rm .devcontainer/run/* || true
}

trap cleanup EXIT

command="${@:-/bin/bash}"

devcontainer --docker-path podman --workspace-folder "${WORKSPACE_FOLDER}" build | jq . > "${DEVCONTAINER_DIR}/run/build.json"
devcontainer --docker-path podman --workspace-folder "${WORKSPACE_FOLDER}" up | jq . > "${DEVCONTAINER_DIR}/run/up.json"
devcontainer exec --docker-path podman --workspace-folder "${WORKSPACE_FOLDER}" "$command"
