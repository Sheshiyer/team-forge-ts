# TeamForge Icon Workflow

Use this workflow for TeamForge app icons and related glyph assets.

## Policy

- Provider: FAL.ai
- Model: `fal-nano-banana-2`
- First output location: `~/Downloads/`
- Prompt source of truth: `design-assets/teamforge/icons/prompts/`
- Brand source of truth: `design-assets/teamforge/visual-brief.md`

Do not start with Flux, Recraft, or generic logo tools for TeamForge icons.

## Batch Generation

```bash
pnpm design:teamforge:icon-batch
```

This generates the pinned prompt variants into a timestamped Downloads folder
and also creates a review board PNG for 16px, 32px, and 64px inspection.

## Review

Pick the strongest candidate only if it survives:

- silhouette recognition at 16px
- edge clarity at 32px
- overall balance at 64px
- LCARS fit relative to the app shell
- avoidance of generic AI badge aesthetics

## Promotion

After review, copy the chosen winner into:

```text
design-assets/teamforge/icons/approved/
```

Use a stable name such as:

```text
teamforge-dock-icon-v1.png
```

## Export To Tauri Bundle

```bash
bash scripts/export-teamforge-tauri-icons.sh design-assets/teamforge/icons/approved/teamforge-dock-icon-v1.png
```

This regenerates:

- `src-tauri/icons/32x32.png`
- `src-tauri/icons/128x128.png`
- `src-tauri/icons/128x128@2x.png`
- `src-tauri/icons/icon.icns`
- `src-tauri/icons/icon.ico`

The export script is the only supported path for live bundle PNGs. Tauri's icon
pipeline rejects RGB bundle PNGs, so the script normalizes the shipped PNGs and
temporary iconset PNGs to RGBA before packaging `icon.icns`.

## Release Validation

Use two separate checks:

- Local bundle validation:

```bash
cargo tauri build --bundles app
```

This is the right check for icon packaging, bundle wiring, and app resource
integrity. If the bundle is produced but the command later fails on missing
`TAURI_SIGNING_PRIVATE_KEY`, that is a local signing-environment gap, not an
icon regression.

- Canonical release publication:

```text
.github/workflows/release.yml
```

TeamForge's OTA signing and published release artifacts are owned by the GitHub
Actions release workflow. That workflow injects the Tauri signing secrets,
builds both macOS targets, and publishes the updater artifacts and signatures.
