# Golden Demo Rootfs Provenance (2026-02-23)

## Asset Hashes
- `docs_site/rootfs.tar` sha256 `8b2cc39e257bd3da4ae19f6e84df174318e082439a2760927c3c004bdef42750`
- `docs_site/nodejs.tar` sha256 `7a82cd8c5c68185be4a6179dc0195831af581c02a0b8ff03cb2208f130e27082`
- `docs_site/goserver.tar` sha256 `cd98407864bcf8d596dffa1d8cd4094580e6d50e32a7768888dfd1c67787e8b9`

## Alpine Demo Rootfs (`docs_site/rootfs.tar`)
- Source Dockerfile: `tools/Dockerfile.golden-alpine-dev`
- Build image: `friscy-golden-alpine-dev`
- Export flow: `docker create` + `docker export > docs_site/rootfs.tar`
- Key binaries verified in tar:
  - `/bin/bash`, `/bin/sh`
  - `/usr/bin/git`, `/usr/bin/gpg`, `/usr/bin/nano`, `/usr/bin/jq`
  - `/usr/bin/curl`, `/usr/bin/wget`, `/usr/bin/tmux`, `/usr/bin/screen`, `/usr/bin/vim`

## Node Demo Rootfs (`docs_site/nodejs.tar`)
- Source Dockerfile: `tools/Dockerfile.golden-nodejs`
- Base image: `node:22-alpine` (riscv64 target)
- Export flow: `docker create` + `docker export > docs_site/nodejs.tar`
- Key binaries verified in tar:
  - `/usr/bin/node`
  - `/lib/ld-musl-riscv64.so.1`
  - `/etc/alpine-release`

## Go Demo Rootfs (`docs_site/goserver.tar`)
- Source Dockerfile: `tools/Dockerfile.golden-goserver`
- Build stage: `golang:1.22-alpine` cross-builds `tests/echo_server/main.go` for `GOARCH=riscv64`
- Runtime image: `alpine:3.20`
- Runtime entrypoint binary: `/bin/echo_server`
- Export flow: `docker create` + `docker export > docs_site/goserver.tar`

## Demo Mapping
- `golden_demo` Alpine -> `/docs_site/rootfs.tar`
- `golden_demo` Node -> `/docs_site/nodejs.tar`
- `golden_demo` Go server -> `/docs_site/goserver.tar`
