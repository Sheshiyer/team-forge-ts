# Cortex 3D Asset Generation — Meshy AI Workflow

Generate elegant 3D node assets for the Mission Cortex scene
(`src/components/cortex/NeuralField.tsx`) using Meshy AI's
**image-to-3D** pipeline.

We use image-to-3D specifically (not text-to-3D) because:

- We already have a visual reference: the V3 mockups at
  `design/assets/v3-command-cortex/`. Image-to-3D preserves
  the design intent end-to-end.
- Meshy text-to-3D quality is noticeably lower than image-to-3D
  for the angular tactical-biological style we want.
- Predictable, repeatable results — same input image returns
  the same mesh shape every time.

## Setup

The script reads `MESHY_API_KEY` from `~/.claude/.env` (or from the
process env if set). Standard `.env` line:

```
MESHY_API_KEY=msy_xxxxxxxxxxxx
```

## Per-asset generation

```bash
node scripts/meshy-image-to-3d.mjs <label> <image-source> <out-filename>
```

`<image-source>` can be:

- An `https://` URL Meshy can fetch directly
- A local path (PNG/JPG/WEBP) — the script uploads as a data URI

Example:

```bash
node scripts/meshy-image-to-3d.mjs nucleus \
  design/assets/v3-command-cortex/02-mission-cortex-field.png \
  mission-nucleus.glb
```

The script:

1. Reads the key from `~/.claude/.env`
2. POSTs to `https://api.meshy.ai/openapi/v1/image-to-3d` with
   `ai_model: meshy-4`, `topology: quad`, `target_polycount: 30000`,
   `should_texture: true`, `enable_pbr: true`
3. Polls every 6 s; logs each status change with progress %
4. On `SUCCEEDED` downloads the GLB to `src/assets/3d/<out-filename>`

Typical generation time: 2–5 min per asset.

## Asset catalog (target)

| Kind | Source image | Output | Visual intent |
|------|--------------|--------|---------------|
| `mission` | crop of nucleus from `02-mission-cortex-field.png` | `mission-nucleus.glb` | volumetric glowing core with internal structure |
| `client` | crop from `03-node-path-language.png` (organism cluster) | `node-client.glb` | hexagonal crystal column with cap |
| `project` | crop from `03-node-path-language.png` (work pathway) | `node-project.glb` | dodecahedron with internal glow |
| `issue` | crop from `03-node-path-language.png` (inflammation node) | `node-issue.glb` | sharp tetrahedral form |
| `agent` | crop from `03-node-path-language.png` (agent pulse glyph) | `node-agent.glb` | twin octahedron crystal |
| `human` | crop from `03-node-path-language.png` (human anchor) | `node-human.glb` | triangular pillar with cap |
| `memory` | crop from `03-node-path-language.png` (memory deposit) | `node-memory.glb` | stacked tilted discs |
| `approval` | crop from `03-node-path-language.png` (approval gate) | `node-approval.glb` | vertical diamond octahedron |
| `routine` | crop from `03-node-path-language.png` (pulse loop) | `node-routine.glb` | torus-knot loop |

To prepare inputs:

1. Open the V3 mockup PNG.
2. Crop each glyph into a square 512×512 (or 768×768) PNG on a
   solid dark background.
3. Save crops under `design/assets/v3-command-cortex/glyphs/`.
4. Feed each crop into the script.

Single-subject, centered, clean background → best Meshy results.

## Integration into NeuralField

After GLBs land in `src/assets/3d/`:

1. Add `glb` to Vite asset includes in `vite.config.ts`:
   ```ts
   export default defineConfig({ assetsInclude: ['**/*.glb'] })
   ```
2. Import + load with drei's `useGLTF`:
   ```tsx
   import { useGLTF } from "@react-three/drei"
   const { scene } = useGLTF("/src/assets/3d/node-agent.glb")
   return <primitive object={scene.clone()} scale={0.4} />
   ```
3. In `NodeForm` (`NeuralField.tsx`), switch to the GLB-backed
   primitive when present, fall back to the procedural form when
   the GLB hasn't been generated yet.

## Cost

Meshy charges credits per generation (rough: ~10 credits / asset
at meshy-4 with texture). Full 9-asset catalog ≈ **~90 credits**.

## Generation status

- [ ] mission-nucleus.glb
- [ ] node-agent.glb
- [ ] node-client.glb
- [ ] node-project.glb
- [ ] node-issue.glb
- [ ] node-human.glb
- [ ] node-memory.glb
- [ ] node-approval.glb
- [ ] node-routine.glb

Until each entry is generated, the scene falls back to procedural
geometric forms defined in `NodeForm`.

## When to re-run

- V3 mockups change → regenerate the affected asset
- Meshy ships a new `ai_model` quality tier → regenerate all
- A node kind is added to `CortexNodeKind` in `lib/commandCortex/types.ts`
- The procedural fallback isn't expressive enough for a specific kind
