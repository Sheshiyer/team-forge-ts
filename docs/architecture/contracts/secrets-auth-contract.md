# Secrets And Auth Contract

## Purpose

This document freezes how secrets and trust boundaries work for the TeamForge Cloudflare backend.

## Trust Boundary

### Allowed trust relationships

- desktop app trusts TeamForge Worker
- Worker trusts D1, R2, Queues, Workflows, Durable Objects, and bound secrets
- Worker authenticates to Clockify, Huly, and Slack

### Disallowed trust relationships

- desktop app directly holding long-lived shared vendor API tokens as the end-state
- Worker holding Tauri release signing private keys
- OTA publishing logic depending on secrets present in user devices

## Secret Ownership

### Cloudflare secret management

Use Cloudflare secret management for:

- `TF_CLOCKIFY_API_TOKEN_GLOBAL`
- `TF_HULY_USER_TOKEN_GLOBAL`
- `TF_SLACK_BOT_TOKEN_GLOBAL`
- `TF_CREDENTIAL_ENVELOPE_KEY`
- `TF_WEBHOOK_HMAC_SECRET`
- `TF_RELEASE_PUBLISH_TOKEN`

### Worker runtime bindings

Worker bindings may expose:

- secret references
- environment identifiers
- bucket names
- D1 bindings
- Queue bindings
- Durable Object namespaces

### CI/CD-only secrets

These must never move to Worker runtime:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Apple code signing identity and notarization credentials
- GitHub release publication tokens when used

### Shared Worker + CI release callback secret

The OTA release publication callback is a special case:

- `TF_RELEASE_PUBLISH_TOKEN` must exist in Worker secret storage so the Worker
  can validate `/internal/releases/publish`
- the same token must exist in GitHub Actions secrets so release CI can call
  that route
- this token must not be reused for generic webhook, sync, or agent-feed
  callbacks

## Credential Modes

### Mode 1: shared global credentials

Use when one TeamForge workspace owns one upstream integration credential set.

Storage:

- Cloudflare Secrets Store or Worker secrets

### Mode 2: encrypted workspace credentials

Use when different workspaces or environments require different upstream credentials.

Storage:

- encrypted blob in D1
- encrypted and decrypted using `TF_CREDENTIAL_ENVELOPE_KEY`

### Forbidden mode

- storing plaintext upstream tokens in local desktop settings as the long-term design

## Desktop To Worker Auth

### Phase 1 and Phase 2 expectation

Use a simple workspace-scoped app token or device bootstrap token.

Required claims or metadata:

- `workspace_id`
- `device_id` when available
- `channel`
- optional `role`

### Phase 3 and beyond

This contract allows upgrading to:

- device sessions
- user/device identity
- role-aware permissions

without changing the route surface.

## Worker To Vendor Auth

The Worker is the only runtime that should call:

- Clockify APIs
- Huly APIs
- Slack APIs

The Worker must:

- read secrets only at request or job execution time
- avoid logging raw secrets
- log only connection metadata and masked identifiers

## Settings UX Consequence

The long-term Settings UX should show:

- connection status
- workspace/team identity
- last test time
- last sync time
- last error
- reconnect or rotate flow

The long-term Settings UX should not show:

- persistent raw token textareas for end users

## Audit Requirements

Every secret-affecting action should produce an audit event:

- credential connected
- credential rotated
- credential test failed
- credential test succeeded
- sync blocked due to missing credential

## Contract Change Rule

If implementation requires desktop clients to regain ownership of shared vendor tokens, stop and review the architecture before proceeding.
