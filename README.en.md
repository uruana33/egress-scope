# EgressScope

[中文](README.md) · **English**

A self-hosted egress diagnostics workbench for proxy and split-tunnel users. Compare domestic and overseas egress against your rules, check WebRTC and DNS leaks, score egress IP quality, and aggregate connectivity and official status for popular AI services.

Frontend SPA (React 19 + Vite) backed by **Cloudflare Workers**. No accounts, no database — core features work out of the box.

**Live demo**: [ip.gogoxy.com](https://ip.gogoxy.com)

## What it does

- **Egress comparison**: probe the same target from domestic and overseas perspectives, broken down by site, DNS and CDN, to verify split-tunnel rules
- **Leak checks**: compare WebRTC/STUN UDP candidates against the web egress and locate DNS resolver exits
- **IP profiling**: IPv4/IPv6 geolocation, ASN, CIDR, multi-source location comparison, datacenter/residential/mobile/VPN/proxy/Tor/abuse flags and a 0–100 quality score
- **Network measurement**: Globalping probe latency and packet loss, multi-round HTTP sampling
- **Registrations**: RDAP lookups and raw responses for domains, IPs and ASNs
- **Platform status**: connectivity checks and official status aggregation for ChatGPT, Claude, Grok, Perplexity, Gemini, DeepSeek, Qwen and Kimi
- **Shareable reports**: one-click egress-consistency snapshot links (optional KV required)
- **Experience**: Chinese/English, multiple light/dark themes, mobile layout, lookup history and QR sharing

Third-party rate limits and CORS can affect results; HTTP timing is not the same measure as ICMP Ping. IP classifications and reputation scores are references, not official rulings from any platform.

## Screenshots

| Overview · domestic vs overseas egress            | IP quality · ownership & score                 |
| ------------------------------------------------- | ---------------------------------------------- |
| ![Egress overview](docs/screenshots/overview.png) | ![IP quality](docs/screenshots/ip-quality.png) |

| AI egress · per-platform reachability        | Routed egress · per-site topology                 |
| -------------------------------------------- | ------------------------------------------------- |
| ![AI egress](docs/screenshots/ai-egress.png) | ![Routed egress](docs/screenshots/egress-map.png) |

The status page aggregates official status for nearly a hundred AI and cloud services:

![Service status](docs/screenshots/status.png)

## Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Furuana33%2Fegress-scope)

Or connect Workers Builds manually:

1. [Fork this repository](https://github.com/uruana33/egress-scope/fork)
2. Cloudflare dashboard → **Workers & Pages** → create a Worker → import a Git repository and select your fork
3. Build command `pnpm build`, deploy command `pnpm run deploy`; Node.js 24 + pnpm 10.32.1, keep the default root directory
4. Production branch `main`; open the assigned `workers.dev` address after deploying, and bind a custom domain in Worker settings

New commits on `main` trigger automatic build and deployment. `/api/*` runs on the Worker, everything else is static assets.

### Optional configuration

Everything works without these; setting them enables the corresponding source:

| Variable             | Effect                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `IPQS_API_KEY`       | IPQualityScore fraud score / anonymity flags / usage                                                    |
| `ABUSEIPDB_API_KEY`  | AbuseIPDB abuse confidence / report counts                                                              |
| `IPREGISTRY_API_KEY` | Query IPregistry with your own key; falls back to the site's shared demo key (rate-limited) when unset  |
| `MXTOOLBOX_API_KEY`  | Read blacklist listings via MXToolbox when the account has lookup quota; otherwise public DNSBL is used |
| `TIANDITU_TOKEN`     | Prefer Tianditu maps (better availability in mainland China); OpenStreetMap when unset or unavailable   |

Add them under Worker → Settings → Variables and Secrets as Secrets, or run `pnpm exec wrangler secret put IPQS_API_KEY`; no code changes needed.

Shareable reports (`/api/report`, `/r/{id}`) need KV: run `pnpm exec wrangler kv namespace create REPORTS` **in your own account**, then fill the id into the two commented `kv_namespaces` blocks in `wrangler.toml` — the id must belong to the account you deploy to, or `wrangler deploy` fails. Without the binding those routes return 503 while everything else stays up.

To keep private and public configs apart, copy `wrangler.toml` to `wrangler.prod.toml` (gitignored) and fill in real ids there; `pnpm run deploy` prefers it when present and falls back to `wrangler.toml`.

## Local development

```bash
pnpm install --frozen-lockfile
pnpm worker:dev    # Vite + local Worker at http://127.0.0.1:8787
```

Optional: copy `.dev.vars.example` to `.dev.vars` and fill in keys from the
table above to enable those data sources for the local Worker. Everything
works without keys.

```bash
pnpm build         # typecheck + production build
pnpm test          # Worker dry-run + Node tests
pnpm lint
pnpm run deploy    # publish dist (wrangler login first)
```

## HTTP API

Keyless egress health endpoint:

```bash
curl -fsS 'https://your-domain/api/ip/health?ip=1.1.1.1'               # JSON (default)
curl -fsS 'https://your-domain/api/ip/health?ip=1.1.1.1&format=text'   # terminal text
curl -fsS 'https://your-domain/api/ip/health'                          # omit ip: caller's egress
```

Returns `ip`, `checked_at`, `score`, `status` (75–100 `good`, 45–74 `moderate`, <45 `poor`, missing `unknown`), location, ISP, ASN and `flags`. Errors are `{ "error": "…" }`: 400 invalid input, 429 rate limited, 503 caller egress unrecognized, 502 upstream failure. `ip` is required against local `:8787`; responses are not cached.

## CI deployment (optional)

Choose Workers Builds **or** GitHub Actions, not both. Actions only builds and tests by default; to let it deploy, add these to the repository's Actions settings:

| Kind     | Name                    | Purpose                                              |
| -------- | ----------------------- | ---------------------------------------------------- |
| Variable | `ENABLE_CF_DEPLOY=true` | Enable deployment                                    |
| Secret   | `CLOUDFLARE_API_TOKEN`  | Worker deployment credentials for the target account |
| Secret   | `CLOUDFLARE_ACCOUNT_ID` | Target Cloudflare account ID                         |

Push to `main` or run `Build and deploy egress-scope`. External PRs run tests only, without deployment credentials. Actions deploys use the committed `wrangler.toml`; if you want shareable reports, fill in your own KV id in your fork before enabling this.

## Layout & data sources

- `src/views/`: feature pages (egress, IP, DNS, WebRTC, AI, status, docs); `src/components/ui/`: shadcn/ui; `src/app.css`: styles
- `public/worker/`: Worker API; `tests/`: Node tests
- Sources: Net.Coffee (IP details), Globalping (measurements), IANA/RDAP (registrations), official platform status feeds
- The Claude environment detection dictionary comes from [LinXiaoTao/FuckClaude](https://github.com/LinXiaoTao/FuckClaude) (MIT); see `vendor/claude-environment/` for provenance and licensing

## License

[AGPL-3.0](LICENSE). After forking, click **Sync fork → Update branch** on the repository page to pull updates. Issues and suggestions are welcome; redact IPs and locations before sharing screenshots.
