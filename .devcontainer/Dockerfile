FROM golang:1.23-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node:22-bookworm /usr/local /usr/local

WORKDIR /workspace
