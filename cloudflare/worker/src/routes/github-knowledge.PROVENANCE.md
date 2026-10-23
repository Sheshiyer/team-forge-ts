# Deployed source recovery

Recovered without semantic changes from the active Worker content/v2 bundle supplied by the parent operator.

- Active version: `44c06546-61c2-48bc-bedb-d1149409f12c`
- Source section: `src/routes/github-knowledge.ts`
- SHA-256 of deployed module section (including name annotations and trailing whitespace): `d653333e659fea68f98d6e338c3a0138c9b2ff6fe92f1ad5cfc812c8ca6da2f7`
- Recovery added TypeScript annotations and imports; original control flow, limits, auth, SQL, GitHub scope and response semantics retained.
- Restored its pre-principal-auth GET route in `v1.ts` and four environment type declarations.
- No deployment or secret changes performed.
