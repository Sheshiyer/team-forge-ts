# Labs calling candidate staging

- Identity: thoughtseedlabs@gmail.com through named Wrangler profile thoughtseed-labs.
- Worker: teamforge-api, Labs account 9d7cec1b5a32b2df8c6cdc1321ccd00b.
- Source: 4fc5c33 on PR #104; TypeScript and 210 tests across 18 files pass.
- Reviewed staged version: 294c3fc3-ea28-4963-b325-d3b7a19cf42e, uploaded with Wrangler 4.152.0.
- Live rollback version: 44c06546-61c2-48bc-bedb-d1149409f12c, remains at 100 percent after staging.
- Readback: all bindings exactly equal live snapshot, including secret binding names; runtime migration/date/usage settings equal. Secret values were neither retrieved nor placed in source.
- Configuration derived from live bindings and settings, including observability, rather than legacy repository configuration. Protected temporary configuration remains outside Git.
- Compiled parity: all 35 live source modules retained. Only realtime.ts, v1.ts and index.ts differ. Recovered GitHub knowledge route matches deployed module runtime.
- Earlier no-traffic versions 2954b383-a1be-410d-a319-00ac8b9817cf and 825aff76-4045-4791-9232-0996969b747c are superseded; do not promote them.

Production promotion awaits explicit operator approval. No deployed call or installed two-client media acceptance is claimed. Following approval, deploy only the reviewed version, verify authenticated session/publication/subscription/renegotiation and received media on two distinct clients, then verify leave teardown. Roll back to the pinned live version if runtime acceptance fails.
