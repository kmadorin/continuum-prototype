# Token Standard DARs

Bundle: `0.6.11_splice-node.tar.gz` (decentralized-canton-sync v0.6.11)
Source: https://github.com/digital-asset/decentralized-canton-sync/releases/download/v0.6.11/0.6.11_splice-node.tar.gz

Extracted the pinned `-1.0.0` variants (not `-current`) of:
- splice-api-token-metadata-v1
- splice-api-token-holding-v1
- splice-api-token-transfer-instruction-v1
- splice-api-token-allocation-v1
- splice-api-token-allocation-instruction-v1
- splice-api-token-allocation-request-v1

Each renamed from `splice-api-token-<name>-v1-1.0.0.dar` to the unversioned
`splice-api-token-<name>-v1.dar` name referenced from the `daml.yaml` files.
The `.dar` files themselves are git-ignored (see `../.gitignore`).

Toolchain: dpm 1.0.21, Daml SDK 3.4.11, JDK 17 (OpenJDK 17.0.19), target LF 2.1.
