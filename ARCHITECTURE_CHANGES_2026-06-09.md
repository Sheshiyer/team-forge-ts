# TeamForge Architecture Changes — 2026-06-09

**Backfill checklist** for updating `team-forge-ts/` to match the current live architecture.

---

## 1. Cloudflare Access Protection (REQUIRED)

The TeamForge API Worker is now behind Cloudflare Zero Trust Access.

### Current State
- **Access App:** `TeamForge API` (ID: `6c2fc2fb-2e3d-4be4-b828-083a1292947b`)
- **Domain:** `forge.thoughtseed.space`
- **Audience:** `d3892b5d2a62027029b09b2fd015a9e8074d5efb38c443099f803517cb3feb51`
- **Policy:** `Operators` (ID: `af70aa6d-7e79-4477-998c-5f360b1da8f8`)

### Policy Includes
| Type | Value |
|------|-------|
| Email | `sheshnarayan.iyer@gmail.com` |
| Service Token | `5a551544-feca-4348-b229-e9b717453065` (`teamforge-multica-bridge`) |
| Service Token | `fd36d447-1a8c-40bb-b543-54e0b3327c03` (`teamforge-multica-bridge-v2`) |
| Service Token | `b95444e1-f260-46d4-b323-41b967a2c1be` (`teamforge-api-client`) |

### Known Issue: Service Token + Worker Route Compatibility
- **Symptom:** Service tokens return `302` with `service_token_status:false` even when correctly added to the Access policy.
- **Root cause:** `forge.thoughtseed.space` uses a Worker-only route (`100::` origin). Cloudflare Access service token auth appears to have a compatibility gap with Worker-only routes.
- **Workaround:** A **temporary internal shared-secret bridge** has been implemented (see below). IP bypass and browser/IdP auth continue to work normally.
- **Status:** Cloudflare support ticket recommended for platform-level fix.

### What to backfill in TeamForge repo
- [x] Document CF Access setup in `docs/` or `README.md`
- [x] Add service token auth example to API client code
- [x] Update any internal scripts that call `forge.thoughtseed.space` to include `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers
- [x] Document that `auto_redirect_to_identity` is disabled for API access
- [x] **TEMPORARY:** Add `TF_INTERNAL_SHARED_SECRET` internal auth bridge for m2m when service tokens fail

### Service Token for API Calls
```bash
CF_ACCESS_CLIENT_ID="<service-token-client-id>.access"
CF_ACCESS_CLIENT_SECRET="<service-token-client-secret>"

curl -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
     -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
     -H "Authorization: Bearer $TF_CREDENTIAL_ENVELOPE_KEY" \
     https://forge.thoughtseed.space/v1/projects
```

Never commit Cloudflare Access client IDs or secrets. Inject them from the
runtime secret store. Treat every value previously committed to Git as exposed:
rotate it, update consumers, prove the replacement works, then revoke the old
credential. Redacting this file does not remove values from repository history.

### Temporary Internal Shared-Secret Bridge (m2m)
For machine-to-machine calls from IP-bypass-allowed machines when CF Access service tokens fail:

```bash
export TF_INTERNAL_SHARED_SECRET="your-long-random-secret-here"

# Worker (production)
wrangler secret put TF_INTERNAL_SHARED_SECRET

# Parity script (from IP-bypass machine)
node scripts/teamforge-vault-parity.mjs \
  --internal-secret "$TF_INTERNAL_SHARED_SECRET" \
  --apply
```

The Worker checks `X-TeamForge-Internal-Secret` header as an alternative to the regular `Bearer` app auth. The request must still pass the upstream Access policy (e.g. via IP bypass).

---

## 2. MultiCA Integration (REQUIRED)

MultiCA is now the canonical AI gateway for all agents.

### Current State
- **API Base:** `http://a2d8a7ed58f172583.awsglobalaccelerator.com`
- **App URL:** `https://multica.thoughtseed.space`
- **Workspace:** `Thoughtseedlabs` (ID: `e0ffc9e2-7848-447f-933f-cc743deedfd0`)

### What to backfill in TeamForge repo
- [ ] Add `multica_api_url` and `multica_app_url` to TeamForge settings schema
- [ ] Add MultiCA workspace ID to project/client mapping if agents need to reference it
- [ ] Document the Global Accelerator static IPs for firewall allowlisting:
  - `166.117.29.182`
  - `76.223.32.238`

---

## 3. Telegram-First Command Interface (NEW)

Hermes now has a `thoughtseed-telegram` plugin with 13 commands.

### Current State
- **Plugin path:** `~/.hermes/plugins/thoughtseed-telegram/`
- **Commands:** `ts-status`, `ts-agents`, `ts-agent`, `ts-projects`, `ts-project`, `ts-run`, `ts-handoffs`, `ts-approve`, `ts-reject`, `ts-vault`, `ts-standup`, `ts-digest`, `ts-help`
- **Group chat:** `-1003698657291`
- **Co-founders:** `1371522080`, `926168615`

### What to backfill in TeamForge repo
- [ ] Add Telegram command reference to operator docs
- [ ] Consider adding a `telegram_command_slug` field to projects/clients for quick bot lookups
- [ ] Document that `ts-projects` and `ts-project` query TeamForge `/v1/projects`
- [ ] Add webhook endpoint for Telegram bot events if TeamForge needs to push to Telegram

---

## 4. Handoff Protocol (NEW)

Agent stage-to-stage handoffs are now tracked in `thoughtseed-labs/handoffs/`.

### Current State
- **Path:** `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs/handoffs/`
- **Format:** `HO-NNN.md` with YAML frontmatter
- **Status values:** `pending`, `approved`, `rejected`
- **Fields:** `handoff_id`, `from`, `to`, `project`, `client`, `type`, `status`, `created`, `due`, `priority`

### What to backfill in TeamForge repo
- [ ] Add `handoff` table or entity to D1 schema
- [ ] Add handoff CRUD endpoints to Worker API:
  - `GET /v1/handoffs`
  - `GET /v1/handoffs/:id`
  - `PUT /v1/handoffs/:id`
- [ ] Add handoff status to project dashboard/read model
- [ ] Sync handoff files from vault via Bridge C (`teamforge-vault-parity.mjs`)

---

## 5. Client Activation Pipeline (NEW)

Mathis is the first client activated through the new pipeline.

### Current State
- **Client:** `mathis` (Expert Property Asia)
- **Project:** `mathis-portal-reskin`
- **Status:** `activating` (vault), `pending-registration` (TeamForge)
- **Activation tracker:** `60-client-ecosystem/mathis/activation-tracker.md`

### What to backfill in TeamForge repo
- [ ] Add `activation_status` field to client/project model
- [ ] Add `activation_tracker_path` field for vault reference
- [ ] Ensure `client-profile.md` ingestion includes `sync_status` field
- [ ] Add project scaffolding for `mathis-portal-reskin` in TeamForge

---

## 6. Updated Agent Manifest (CHANGED)

Agent models and roles have been updated.

### Current State
| Agent | Model | Role |
|-------|-------|------|
| CEO | kimi-k2.6 | Chief Executive Agent |
| Scientist | kimi-k2-thinking | Head of Research |
| Engineer | qwen3-coder:480b | Head of Engineering |
| Designer | mistral-large-3:675b | Head of Design |
| Synthesist | kimi-k2.6 | Head of Synthesis |
| Hermes | ministral-3:14b | Communications Lead |

### What to backfill in TeamForge repo
- [ ] Add agent registry table to D1 if not exists
- [ ] Add agent model/role fields to project assignment logic
- [ ] Document which agent handles which project track

---

## 7. Vault Path Structure (CHANGED)

The operational vault is now clearly `thoughtseed-labs/` (not the parent `thoughtseed/`).

### Current State
- **Vault root:** `/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/thoughtseed-labs/`
- **Handoffs:** `handoffs/` (new directory)
- **Standups:** `standups/` (generated by `/ts-standup`)

### What to backfill in TeamForge repo
- [ ] Update `local_vault_root` setting to point to `thoughtseed-labs/` not parent
- [ ] Add `handoffs/` to vault sync paths in Bridge C
- [ ] Add `standups/` to vault sync paths
- [ ] Update `teamforge-vault-parity.mjs` to read from `thoughtseed-labs/`

---

## 8. DNS & Infrastructure (CHANGED)

New DNS and cert configuration.

### Current State
- **DNS Zone:** `0e5430ec8b69ce988f929aae5f2ab9f7` (`thoughtseed.space`)
- **MultiCA DNS:** `multica.thoughtseed.space` CNAME → Global Accelerator (proxied)
- **ACM Cert:** ISSUED for `multica.thoughtseed.space`
- **ALB Security Group:** `sg-060cba684ddbf6dac`

### What to backfill in TeamForge repo
- [ ] Document DNS records in infrastructure docs
- [ ] Add CAA record requirements (`amazontrust.com`) to cert rotation runbook
- [ ] Document ALB path rules:
  - `/healthz` → health check
  - `/api/*` → backend API
  - `/ws` → WebSocket
  - `/auth/*` → auth
  - `/uploads/*` → file upload
  - default → frontend

---

## Files to Update in `team-forge-ts/`

| File | Change |
|------|--------|
| `README.md` | Add CF Access, MultiCA, Telegram sections |
| `cloudflare/worker/src/routes/v1.ts` | Add handoff endpoints |
| `cloudflare/worker/src/lib/project-registry.ts` | Add `activation_status`, `sync_status` fields |
| `cloudflare/worker/src/lib/env.ts` | Add MultiCA URL vars |
| `cloudflare/worker/wrangler.jsonc` | Document `TF_ACCESS_AUDIENCE` purpose |
| `scripts/teamforge-vault-parity.mjs` | Update vault root path, add handoff/standup sync |
| `docs/architecture/` | Add new architecture docs |

---

*Generated from CLAUDE.md update — 2026-06-09*
