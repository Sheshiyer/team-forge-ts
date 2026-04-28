# OTA Updater Contract

## Purpose

This document freezes how TeamForge OTA updates will work in Tauri v2.

## Core Rule

OTA updates ship signed desktop binaries.

OTA is not:

- hot code push for Rust logic
- unsigned patch delivery
- a replacement for remote config

## Repo Touchpoints

Implementation will touch these lock zones:

- [package.json](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/package.json)
- [src-tauri/Cargo.toml](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/src-tauri/Cargo.toml)
- [src-tauri/tauri.conf.json](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/src-tauri/tauri.conf.json)
- [src-tauri/src/lib.rs](/Volumes/madara/2026/twc-vault/01-Projects/thoughtseed/team-forge-ts/src-tauri/src/lib.rs)

## Required App Changes

- add JS updater plugin dependency
- add Rust updater plugin dependency
- initialize updater plugin in Tauri bootstrap
- configure updater endpoint and public key
- enable updater artifact generation
- add updater UX for check, download, install, relaunch

## Required CI Changes

- build release binaries
- generate updater artifacts and signatures
- sign with Tauri signing key
- notarize macOS release as needed
- upload artifacts and `.sig` files to R2
- publish release metadata to D1 or an equivalent Worker-readable control plane
- authenticate the publish callback with `TF_RELEASE_PUBLISH_TOKEN`, not the
  generic webhook callback secret

## Artifact Contract

### R2 object layout

```text
ota/releases/{version}/darwin-aarch64/TeamForge.app.tar.gz
ota/releases/{version}/darwin-aarch64/TeamForge.app.tar.gz.sig
ota/releases/{version}/darwin-aarch64/release-notes.md
```

### Manifest endpoint

```text
GET /v1/ota/check?channel=stable&platform=darwin&arch=aarch64&currentVersion=%VERSION%
```

## Manifest Shape

The Worker must return a Tauri-compatible manifest payload.

Example:

```json
{
  "version": "0.2.0",
  "notes": "Cloudflare-backed project mappings and updater support.",
  "pub_date": "2026-04-09T09:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "url": "https://artifacts.teamforge.app/ota/releases/0.2.0/darwin-aarch64/TeamForge.app.tar.gz",
      "signature": "SIGNATURE_TEXT"
    }
  }
}
```

## Rollout Channels

Approved channels:

- `canary`
- `stable`

Optional later:

- `beta`

## Rollout Rules

- canary receives new builds first
- stable only advances after canary validation
- rollout percentage may be less than 100
- previous stable release must remain publishable for rollback

## Install Telemetry

The app must report:

- `device_id`
- `version_from`
- `version_to`
- `channel`
- `status`
- optional error details

Telemetry is required for rollout confidence, not optional polish.

## UX Rules

- manual update check must exist in Settings
- startup update checks may be gated by remote config
- silent auto-install is out of scope for the first release
- user-visible install state and failure state are required

## Contract Change Rule

If the release publication or manifest strategy changes, update this contract before altering CI or Tauri config.
