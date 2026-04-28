# TeamForge Visual Assets

This directory is the canonical repo-side source area for TeamForge visual
assets.

## Structure

- `visual-brief.md`
  - the base brand brief every generated TeamForge asset should inherit
- `icons/prompts/`
  - pinned prompt variants for dock icon exploration
- `icons/approved/`
  - approved masters promoted from `~/Downloads/` after review

## Rules

1. Generate to `~/Downloads/` first.
2. Review at 16px, 32px, and 64px before promotion.
3. Promote only the chosen winner into `icons/approved/`.
4. Export Tauri bundle files only from an approved master.

## Commands

```bash
pnpm design:teamforge:icon-batch
python3 scripts/review-teamforge-dock-icons.py ~/Downloads/teamforge-dock-icon-batch-YYYYMMDD-HHMMSS
bash scripts/export-teamforge-tauri-icons.sh design-assets/teamforge/icons/approved/teamforge-dock-icon-v1.png
```
