# WorkRate HMRC sandbox gateway

Standalone, provider-neutral Node service for **HMRC sandbox only**. It has no database: rate, replay, and one-use attestation state is intentionally lost on restart. Do not run it against a production HMRC host.

## Deploy, one step at a time

1. Create a small DigitalOcean London droplet and attach a Reserved IP; set the DNS A record for `hmrc-gateway.work-rate.uk` to that IP. A basic 1 GB droplet is typically about £5–£12/month before optional backups/egress.
2. Copy the complete contents of this directory, including its local `pnpm-lock.yaml`, to `/opt/workrate/hmrc-gateway`. Install Node 20 LTS and pnpm, then run `pnpm install --frozen-lockfile && pnpm build`. The package is standalone: do not copy the WorkRate repository, root workspace file, root lockfile, or root TypeScript configuration.
3. Copy `env.example` to `/etc/workrate/hmrc-gateway.env`, set every required value using the secret manager, and set `GATEWAY_PUBLIC_IP` to the Reserved IP. Never put secrets in this repository.
4. Set the quarterly path, method, and Accept value only after confirming the API version enabled for the WorkRate HMRC application. HMRC's official Self Employment Business API 5.0 specification currently documents `PUT /individuals/business/self-employment/{nino}/{businessId}/cumulative/{taxYear}`, `Accept: application/vnd.hmrc.5.0+json`, a JSON cumulative-period body, and success as HTTP 204 with `X-CorrelationId`. The service rejects absolute, traversal, non-relative, or unsupported method values.
5. Obtain documented HMRC approval before listing any omission in `HMRC_FRAUD_APPROVED_OMISSIONS`; it fails closed for missing client port, MFA, and vendor licence IDs.
6. Install Caddy with this `Caddyfile`, run `sudo caddy validate --config /etc/caddy/Caddyfile`, reload Caddy, then run `sudo ./deploy-ufw.sh`. The config uses Caddy v2's canonical `{http.request.remote.host}` and `{http.request.remote.port}` placeholders. Caddy alone may reach loopback port 8081, and the gateway trusts the observed-evidence headers only from that loopback peer.
7. Check `GET /healthz` through the HTTPS hostname. Monitor HTTP 5xx, 429, latency, token failures, and sandbox validation FAIL/WARNING counts from the safe JSON logs. Logs intentionally exclude bodies, IDs, tokens, and fraud headers.

## Replace an existing Droplet copy

Build a fresh archive from the WorkRate repository root:

```sh
tar -C services/hmrc-gateway \
  --exclude=node_modules --exclude=dist --exclude=tsconfig.tsbuildinfo \
  -czf workrate-hmrc-gateway.tar.gz .
```

Copy `workrate-hmrc-gateway.tar.gz` to the Droplet, then replace the failed package atomically while preserving the environment file outside the application directory:

```sh
sudo rm -rf /opt/workrate/hmrc-gateway.new
sudo mkdir -p /opt/workrate/hmrc-gateway.new
sudo tar -xzf ~/workrate-hmrc-gateway.tar.gz -C /opt/workrate/hmrc-gateway.new
sudo chown -R workrate:workrate /opt/workrate/hmrc-gateway.new
cd /opt/workrate/hmrc-gateway.new
sudo -u workrate pnpm install --frozen-lockfile
sudo -u workrate pnpm build
backup="/opt/workrate/hmrc-gateway.backup-$(date +%Y%m%d%H%M%S)"
sudo systemctl stop hmrc-gateway
sudo mv /opt/workrate/hmrc-gateway "$backup"
sudo mv /opt/workrate/hmrc-gateway.new /opt/workrate/hmrc-gateway
sudo systemctl start hmrc-gateway
sudo systemctl is-active hmrc-gateway
curl --fail --silent --show-error https://hmrc-gateway.work-rate.uk/healthz
```

After the health check succeeds, remove the directory named in `$backup`. If install, build, startup, or health verification fails, move the failed directory aside, restore the directory named in `$backup` to `/opt/workrate/hmrc-gateway`, and restart the service. Do not copy a populated `env.example` or place secrets inside the archive; the service reads `/etc/workrate/hmrc-gateway.env`.

If the archive changes `Caddyfile`, deploy and validate it separately before the browser test:

```sh
sudo cp /opt/workrate/hmrc-gateway/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl is-active caddy
```

## Sandbox workflow

WorkRate signs an expiring grant. The browser submits the grant and direct telemetry to `/v1/attest` over the configured CORS origin. WorkRate then HMAC-signs each gateway request with timestamp, UUID, method, path, and exact JSON. An attestation binds identity, telemetry, and Caddy-observed IP/port and permits validation and submission once each.

`POST /v1/hmrc/sandbox/read` accepts only `business-details` and `obligations`; the gateway maps these internally to the fixed HMRC sandbox paths and currently used vendor Accept versions. It never accepts a caller URL, path, host, or content type.

For disaster recovery, redeploy the immutable build and restore secrets/configuration from the secret manager; there is no gateway data to back up. Planned restarts invalidate in-flight attestations and are safe.

## Production checklist

Keep sandbox credentials and origin only; obtain HMRC production approval and conduct a separate security review before any production design. Verify Caddy TLS renewal, firewall rules, Reserved-IP DNS, secret rotation, approved omissions, log retention/redaction, alerting, dependency patches, and an end-to-end HMRC sandbox test after each release.