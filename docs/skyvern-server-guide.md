# Skyvern Server Guide

**Droplet:** bfc-docling-serve (do-skyvern-docling)
**Public IP:** 139.59.165.79
**Private IP:** 10.106.0.5
**Region:** LON1

---

## Connecting via VS Code

1. **Ctrl+Shift+P** → "Remote-SSH: Connect to Host" → **do-skyvern-docling**
2. Open folder: `/opt/skyvern/`
3. SSH config is in `C:\Users\david\.ssh\config`

## File Locations

| What                   | Path                                       |
| ---------------------- | ------------------------------------------ |
| Skyvern docker-compose | `/opt/skyvern/docker-compose.yml`          |
| Skyvern .env           | `/opt/skyvern/.env`                        |
| Skyvern API key        | `/opt/skyvern/.streamlit/secrets.toml`     |
| Artifacts/screenshots  | `/opt/skyvern/artifacts/`                  |
| Videos                 | `/opt/skyvern/videos/`                     |
| Logs                   | `/opt/skyvern/log/`                        |
| Docling                | Standalone container (`bfc-docling-serve`) |

## Docker Services

```bash
cd /opt/skyvern
docker compose ps          # Check status
docker compose logs -f     # Follow logs
docker compose restart     # Restart all
docker compose up -d       # Start all
```

Individual services: `postgres`, `skyvern`, `skyvern-ui`

```bash
docker compose logs -f skyvern       # Skyvern logs only
docker compose restart skyvern-ui    # Restart UI only
docker compose up -d skyvern-ui      # Start UI only
```

## Accessing the Skyvern UI

The UI is bound to `127.0.0.1` only (not publicly accessible). Access it via VS Code port forwarding:

1. Connect to **do-skyvern-docling** in VS Code
2. Open the **Ports** panel (bottom bar)
3. Forward these ports:

| Port | Service         |
| ---- | --------------- |
| 8000 | Skyvern API     |
| 8081 | Skyvern UI      |
| 9090 | Artifact server |

4. Open `http://localhost:8081` in your browser

Alternative: SSH tunnel from PowerShell:

```bash
ssh -L 8000:localhost:8000 -L 8081:localhost:8081 -L 9090:localhost:9090 root@139.59.165.79
```

## Networking & Security

- **DO Cloud Firewall** "Skyvern-Docling" is attached to this droplet
- Port 8000 (Skyvern API) only accepts connections from `10.106.0.3` (n8n droplet private IP)
- Port 22 (SSH) open from anywhere
- Skyvern UI ports (8081, 9090) bound to `127.0.0.1` — only accessible via SSH tunnel/port forward
- n8n calls Skyvern at: `http://10.106.0.5:8000/api/v1/run/tasks`

## Skyvern API Quick Reference

```bash
# Run a task
curl -X POST http://10.106.0.5:8000/api/v1/run/tasks \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "...", "url": "https://..."}'

# Check task status
curl http://10.106.0.5:8000/api/v1/runs/{run_id} \
  -H "x-api-key: YOUR_API_KEY"

# Task statuses: created → queued → running → completed/failed/terminated/canceled
```

## Important Config Notes

- The `skyvern` service **must** have `shm_size: '2gb'` in docker-compose.yml — Chrome crashes without sufficient shared memory
- The `skyvern-ui` needs `ENVIRONMENT=local` set to avoid console warnings
- The UI API key (`VITE_SKYVERN_API_KEY`) may need regenerating via the UI if it shows as invalid — click "Regenerate API key" in the UI
- WebSocket streaming doesn't work through VS Code port forwarding — refresh the page manually to see task progress

## Troubleshooting

### Browser crashes ("Page crashed" / "Target crashed")

This means Chrome needs more shared memory. Ensure `shm_size: '2gb'` is in the `skyvern` service in docker-compose.yml.

### Skyvern not responding

```bash
docker compose ps                    # Check if healthy
docker compose logs skyvern          # Check for errors
docker compose restart skyvern       # Restart
```

### UI not loading

```bash
docker compose ps skyvern-ui         # Check status
docker compose logs skyvern-ui       # Check errors
# Make sure ports 8000, 8081, 9090 are all forwarded
```

### Can't reach Skyvern from n8n

```bash
# From n8n droplet (ssh root@144.126.200.83):
curl -s http://10.106.0.5:8000/api/v1/runs/test
# Should return JSON (even if error), not timeout
```

### Rebuild from scratch

```bash
cd /opt/skyvern
docker compose down
docker compose pull        # Get latest images
docker compose up -d
```

## Related Droplets

| Name              | IP (public)    | IP (private) | SSH alias          | Purpose           |
| ----------------- | -------------- | ------------ | ------------------ | ----------------- |
| n8n-DigOcean      | 144.126.200.83 | 10.106.0.3   | do-n8n             | n8n workflows     |
| bfc-docling-serve | 139.59.165.79  | 10.106.0.5   | do-skyvern-docling | Skyvern + Docling |

Both on VPC: `c14a4976-32cc-4bef-8da0-07dc74dcd1ab`
