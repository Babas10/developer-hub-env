# Containerfile — packages the metering plugin dist-dynamic as an OCI image
# for consumption by RHDH dynamic plugin loader.
#
# Usage (build both frontend and backend):
#
#   # 1. Export plugins (generates dist-dynamic/)
#   cd plugins && ./export-dev.sh
#
#   # 2. Build and push frontend OCI image
#   podman build --build-arg PLUGIN_DIR=metering \
#     -t quay.io/<your-org>/rhdh-plugin-metering:1.0.0 .
#   podman push quay.io/<your-org>/rhdh-plugin-metering:1.0.0
#
#   # 3. Build and push backend OCI image
#   podman build --build-arg PLUGIN_DIR=metering-backend \
#     -t quay.io/<your-org>/rhdh-plugin-metering-backend:1.0.0 .
#   podman push quay.io/<your-org>/rhdh-plugin-metering-backend:1.0.0
#
# RHDH then loads them via oci:// references in dynamic-plugins.yaml.

FROM scratch

ARG PLUGIN_DIR

# The dist-dynamic directory is the self-contained plugin package
COPY plugins/${PLUGIN_DIR}/dist-dynamic /
