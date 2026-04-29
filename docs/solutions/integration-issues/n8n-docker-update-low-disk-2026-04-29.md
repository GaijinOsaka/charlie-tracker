---
title: Updating n8n via Docker Compose on a low-disk DigitalOcean droplet
date: 2026-04-29
category: integration-issues
module: n8n / DigitalOcean
problem_type: deployment
component: infrastructure
severity: medium
applies_when:
  - Updating n8n on the 1GB DigitalOcean droplet
  - Docker pull fails with "no space left on device"
  - Accumulated old Docker images consume disk
tags: [n8n, docker, digitalocean, disk-space, deployment]
---

# Updating n8n via Docker Compose on a low-disk DigitalOcean droplet

## Context

The n8n droplet (1GB RAM, LON1) runs n8n, Caddy, Redis, and Postgres via Docker. Over time, old image layers accumulate. The n8n image alone is ~1GB, so after a few upgrades the disk fills up and `docker compose pull` fails with "no space left on device".

## Problem

```
failed to register layer: write /usr/local/lib/node_modules/n8n/...
no space left on device
```

The pull partially downloads the new image then fails. The containers still restart on the old image, so there's no downtime — but the update doesn't apply.

## Solution

### 1. Check disk usage

```bash
df -h
docker system df
```

`docker system df` shows reclaimable space from unused images.

### 2. Prune old images before pulling

```bash
docker system prune -a
```

This removes all images not used by running containers. It is safe because:

- Images for running containers (n8n, caddy, redis, postgres) are protected
- Volumes are never pruned unless you explicitly pass `--volumes`
- No data is lost

If cautious, remove specific old images first with `docker rmi <image_id>` to verify nothing breaks.

### 3. Then pull and restart

```bash
cd /root/n8n-docker-caddy
docker compose pull
docker compose down
docker compose up -d
```

### 4. Verify

```bash
docker exec n8n-docker-caddy-n8n-1 n8n --version
```

## Key Gotcha

The compose file is at `/root/n8n-docker-caddy/docker-compose.yml`, not in the home directory root. The container naming convention (`n8n-docker-caddy-*`) reveals the directory name. If you get "no configuration file provided", find it with:

```bash
find / -name "docker-compose*" -type f 2>/dev/null
```

## Result

n8n updated from v2.1.5 to v2.17.18 after freeing ~4GB of old image layers.
