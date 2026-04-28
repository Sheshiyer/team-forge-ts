# TeamForge Visual Asset Audit

This runbook captures the current gaps between TeamForge's app shell, Tauri
icon bundle, Art skill workflow, and the external design resource library. The
goal is to make the visual system operate as one coherent pipeline, starting
with FAL.ai + Nano Banana 2 for icon and app asset generation.

## System Map

The current visual system is spread across four disconnected layers:

- App shell and UI language in `src/App.tsx`, `src/styles/globals.css`, and
  `src/lib/lcarsPageStyles.ts`
- Bundled app icon assets in `src-tauri/icons/*` and the bundle references in
  `src-tauri/tauri.conf.json`
- Generation workflow in `~/.claude/skills/Art/SKILL.md`,
  `~/.claude/skills/Art/Tools/Generate.ts`, and
  `~/.claude/skills/Art/Workflows/CreatePAIPackIcon.md`
- Prompt/reference library in
  `/Volumes/madara/2026/twc-vault/03-Resources/Design`

The main problem is not that any one layer is unusable. The problem is that
the four layers do not currently agree on visual language, provider/model
policy, source-of-truth prompts, approval flow, or export pipeline.

## Findings

1. **The current app icon bundle is effectively a placeholder.**
   Evidence: `src-tauri/icons/128x128@2x.png` is a solid blue square with no
   TeamForge mark at all.
   Improvement: replace the bundle with a real brand mark and preserve the
   approved master artwork in-repo.

2. **There is no source master for the icon family.**
   Evidence: the repo only contains the generated `.png`, `.icns`, and `.ico`
   outputs under `src-tauri/icons/`.
   Improvement: add a canonical source directory for approved masters, prompt
   notes, and export derivatives.

3. **The shell has a wordmark but no actual logo mark.**
   Evidence: `src/App.tsx` renders `TEAMFORGE` as text in the sidebar top bar,
   with no SVG or icon system.
   Improvement: define one canonical TeamForge mark that can live in the dock,
   tray, sidebar, splash, and marketing assets.

4. **There is no distinction between dock icon, tray icon, and brand mark.**
   Evidence: `src-tauri/tauri.conf.json` points to one generic bundle set and
   there is no documented alternate tray glyph or monochrome variant.
   Improvement: design a small family:
   dock icon, tray glyph, wordmark lockup, and presentation badge.

5. **The app has no repo-tracked visual asset workflow.**
   Evidence: `docs/runbooks/` has Tauri and Huly runbooks, but nothing for
   icon generation, prompt sourcing, review, or export.
   Improvement: keep a TeamForge visual asset workflow runbook in this repo.

6. **The design resource library is not connected to TeamForge.**
   Evidence: `/Volumes/.../03-Resources/Design` contains prompt libraries and
   references, but no repo doc tells TeamForge contributors which prompt
   families to use for this app.
   Improvement: define a canonical prompt shortlist for TeamForge assets.

7. **There is no explicit provider/model policy for TeamForge assets.**
   Evidence: the repo never states whether icons should come from FAL.ai,
   Gemini/Nano Banana Pro, Flux, or any other provider.
   Improvement: declare a policy: TeamForge icon and asset ideation uses
   `fal-nano-banana-2`, not Recraft or Flux.

8. **The Art skill defaults conflict with TeamForge's brand language.**
   Evidence: `~/.claude/skills/Art/SKILL.md` defaults to a UL editorial system
   with deep purple and teal accents, while TeamForge uses LCARS orange, cyan,
   tan, lavender, and black.
   Improvement: override the default art direction for TeamForge prompts or add
   a TeamForge-specific customization/profile.

9. **There is no TeamForge-specific Art skill customization directory.**
   Evidence: `~/.claude/skills/CORE/USER/SKILLCUSTOMIZATIONS/Art` does not
   exist on this machine.
   Improvement: define TeamForge-specific Art preferences and keep the rules
   mirrored in-repo so they are not hidden local state.

10. **The icon workflow doc uses the wrong model for the requested policy.**
    Evidence: `~/.claude/skills/Art/Workflows/CreatePAIPackIcon.md` still
    recommends `--model nano-banana-pro`.
    Improvement: create a TeamForge-specific workflow that standardizes
    `--model fal-nano-banana-2`.

11. **The icon workflow doc violates the Art skill's own Downloads-first rule.**
    Evidence: `CreatePAIPackIcon.md` writes directly into a project icon path,
    while `Art/SKILL.md` says all generated images must go to `~/Downloads/`
    first for preview.
    Improvement: TeamForge asset generation should always preview in Downloads
    before anything is copied into repo paths.

12. **FAL Nano Banana 2 is implemented in the CLI but not elevated in the
    workflow docs.**
    Evidence: `~/.claude/skills/Art/Tools/Generate.ts` supports
    `fal-nano-banana-2`, but the higher-level skill and workflow docs still
    frame `nano-banana-pro` as the main choice.
    Improvement: the workflow docs should explicitly call out the TeamForge
    exception for FAL Nano Banana 2.

13. **Reference-image support is asymmetric across models.**
    Evidence: `Generate.ts` only accepts `--reference-image` with
    `nano-banana-pro`, not `fal-nano-banana-2`.
    Improvement: decide whether TeamForge prefers provider consistency
    (`fal-nano-banana-2`) or reference-image consistency (`nano-banana-pro`)
    for a given asset class, and document that tradeoff.

14. **There is no icon acceptance rubric at small sizes.**
    Evidence: neither the repo nor the skill workflow defines pass/fail checks
    for 16px, 32px, 64px, 128px, or 256px readability.
    Improvement: add a review checklist for silhouette, contrast, and edge
    clarity at every shipping size.

15. **There is no export pipeline from approved PNG master to bundle formats.**
    Evidence: the repo has final `icns` and `ico` files, but no recorded
    command or script that derives them from a master.
    Improvement: document or script the conversion from approved master asset to
    `32x32`, `128x128`, `128x128@2x`, `icon.icns`, and `icon.ico`.

16. **The current bundle sizes are too opaque to trust.**
    Evidence: `icon.icns` and `icon.ico` are tiny files, which strongly implies
    a minimal or placeholder export path.
    Improvement: regenerate them from a real high-resolution master and record
    the process.

17. **The app has no visual asset naming/versioning convention.**
    Evidence: there is no repo location or format like
    `teamforge-dock-icon-v3.png` or `teamforge-grid-board-v1.png`.
    Improvement: adopt predictable names for prompt variants, approved masters,
    and shipped derivatives.

18. **There is no approval checkpoint between generation and shipping.**
    Evidence: the repo contains final icon files but no review notes, prompt
    lineage, or “approved from Downloads” checkpoint.
    Improvement: keep prompt text, preview file names, and approval notes
    together when promoting an asset into the repo.

19. **The app has no route-level icon family or pictogram system.**
    Evidence: navigation in `src/App.tsx` is text-only even though the product
    has distinct route groups such as Projects, Team, Calendar, Comms, and
    Issues.
    Improvement: design a small modular glyph set that matches the dock icon's
    geometry and the LCARS shell.

20. **The shell and the external design references do not share one visual
    grammar yet.**
    Evidence: the app uses sharp LCARS bars and segmented rails, while the
    design library references range from Swiss poster logos to tactile 3D logo
    treatments without any TeamForge-specific filtering.
    Improvement: define which prompt families map to which asset classes:
    flat icons, tray glyphs, launch boards, screenshot frames, and marketing
    renders.

21. **The app has no canonical marketing/launch visual system.**
    Evidence: README screenshots exist, but there is no prompt-backed visual
    family for hero boards, campaign grids, or release art.
    Improvement: use the design library's campaign-board prompts for release
    visuals instead of ad hoc screenshots alone.

22. **The placeholder avatar system is outside the app's brand language.**
    Evidence: `src/components/ui/Avatar.tsx` uses a generic HSL circle with
    initials, not a TeamForge-specific glyph or identity treatment.
    Improvement: define whether avatars remain neutral utilities or join a
    broader LCARS identity system.

23. **The visual system is not yet connected to an experiment loop.**
    Evidence: there is no keep-or-discard workflow for prompt variants, only
    static final assets.
    Improvement: run asset ideation in small batches with explicit metrics:
    silhouette clarity, LCARS fit, and small-size legibility.

24. **There is no repo instruction telling the Art skill how to find the right
    prompt in the Design library for this app.**
    Evidence: the skill can route by workflow type, but TeamForge-specific
    prompt sourcing is undocumented.
    Improvement: define the prompt source map below and keep it in the repo.

25. **The whole system lacks one canonical TeamForge visual brief.**
    Evidence: the shell style lives in code, the icon state lives in bundle
    files, and the prompt language lives outside the repo.
    Improvement: keep one short TeamForge visual brief in the repo and use it
    as the base layer for every generated asset.

## Canonical Prompt Sources

These are the best current prompt families in
`/Volumes/madara/2026/twc-vault/03-Resources/Design` for TeamForge:

- `AI-Prompts/Amir-Mushich-50-Design-Prompts.md`
  - **2.2 Swiss Design Logos**
    - use for flat, reductive base marks and geometric icon ideation
  - **3.1 Dark Metallic Logos**
    - use for launch renders, README hero art, or premium brand presentation
  - **3.2 Tactile Wax Seal Logos**
    - use for sticker/badge experiments, not the primary app icon
  - **4.7 Grid Poster Design**
    - use for campaign boards, release visuals, and launch collateral
- `merged_high_confidence_clean_prompts.json`
  - use as the searchable normalized backup when you need the same prompt
    families in JSON form
- `Tools/AI-Logo-Generators.md`
  - use for ecosystem awareness only, not as the canonical TeamForge workflow

## Canonical TeamForge Asset Workflow

1. **Choose the asset class first.**
   Dock icon, tray glyph, wordmark, route pictogram, campaign board, or README
   hero image.

2. **Choose the prompt family from the Design library.**
   Flat icon work starts with Swiss-design logo logic. Launch art starts with
   the logo or campaign-board prompts, not with random prompt fishing.

3. **Apply the TeamForge brief.**
   The asset should reflect:
   LCARS segmented geometry, black space canvas, orange as primary energy,
   cyan/tan/lavender as secondary signals, and mission-control/bridge-console
   framing.

4. **Generate to Downloads first using FAL Nano Banana 2.**
   Never write the first pass into repo paths.

5. **Review at real shipping sizes.**
   Check 16px, 32px, 64px, 128px, and 256px before promotion.

6. **Promote only approved masters into the repo.**
   Store the prompt note, approved master, and derived bundle assets together.

7. **Derive exports after approval.**
   Only then generate `icns`, `ico`, and the Tauri bundle PNG sizes.

## Recommended FAL Nano Banana 2 Commands

### Dock Icon Concept

```bash
bun run ~/.claude/skills/Art/Tools/Generate.ts \
  --model fal-nano-banana-2 \
  --prompt "TEAMFORGE app icon. Flat geometric LCARS mission-control mark for a desktop app. Black space background, segmented console geometry, orange as the dominant energy color, cyan and lavender as restrained secondary accents, bold readable silhouette, centered, no text, no mockup, no photorealism, no chrome, optimized for dock icon readability at 32px and 128px." \
  --size 1K \
  --aspect-ratio 1:1 \
  --remove-bg \
  --output ~/Downloads/teamforge-dock-icon-v1.png
```

### Tray Glyph Concept

```bash
bun run ~/.claude/skills/Art/Tools/Generate.ts \
  --model fal-nano-banana-2 \
  --prompt "TEAMFORGE tray icon glyph. Minimal monochrome mission-control symbol derived from LCARS segmented geometry, extremely simple silhouette, no text, no gradients, no perspective, optimized for tiny menu bar rendering, centered, transparent background." \
  --size 1K \
  --aspect-ratio 1:1 \
  --remove-bg \
  --output ~/Downloads/teamforge-tray-glyph-v1.png
```

### Campaign Board / README Visual

```bash
bun run ~/.claude/skills/Art/Tools/Generate.ts \
  --model fal-nano-banana-2 \
  --prompt "TEAMFORGE visual identity grid. Behance-quality campaign board for a Star Trek LCARS-inspired founder mission-control desktop app. Strict structured grid, black space canvas, orange/cyan/tan/lavender palette, one flat app icon module, one dock icon render, one route glyph module, one screenshot framing module, one palette module, one typography module. Precise, minimal, premium, coherent, no generic SaaS cards." \
  --size 2K \
  --aspect-ratio 3:4 \
  --output ~/Downloads/teamforge-identity-board-v1.png
```

## Immediate Next Assets

1. Real dock icon master
2. Monochrome tray glyph
3. Sidebar/logo lockup
4. Route pictogram family for the main nav groups
5. README/release campaign board
6. Optional DMG background and installer presentation art

## Recommended Next Step

Run a first icon batch with 3-5 dock icon variants using the flat Swiss-design
prompt family, then keep only the variant that survives small-size review
without looking like a generic AI badge.
