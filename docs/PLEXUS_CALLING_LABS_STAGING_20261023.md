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

## Approved promotion

The operator explicitly approved promotion and call verification. Wrangler 4.152.0 successfully promoted 294c3fc3-ea28-4963-b325-d3b7a19cf42e to 100 percent. Independent API readback confirms that active version, exact observability preservation and unchanged logpush. The protected API returns the expected Labs Access sign-in. Member authentication is pending a freshly requested email code; no authenticated call or media success is claimed. Rollback version remains 44c06546-61c2-48bc-bedb-d1149409f12c.

## Authenticated live attempt and diagnostic candidate

The operator completed Labs Access. Live whoami confirms access and ws_thoughtseed admin membership. The empty workspace lobby had no participants/call. A developer harness bundling actual RealtimeSession attempted two independent client sessions under that identity, with generated media only. First media join failed502/realtime_provider_unavailable before capture or publication. Own presence disconnect succeeded; room readback confirms0 probe participants and0 probe tracks. No room was created/deleted.

Source4469c85 adds bounded private session allocation diagnostics (category, upstream status, constrained Ray ID only), preserving generic client errors. TypeScript and211 tests across18 files pass. Version450ec42c-5690-4d0b-b059-eaa16554dca0 is staged with no traffic; bindings/runtime exactly match current294c3fc3. Exact new-version promotion approval requested.

## Workers runtime correction

The approved diagnostic450ec42c retry emitted network_or_timeout before provider HTTP response. Exact compatibility-date2026-04-09 workerd probe reproduces redirect:error throwing TypeError at Request construction; manual is supported. Sourcebc713d0 changes bothSFUfetches to manual while existing non-success checks reject3xx; TypeScript and212tests pass.

Operator approved exact versionbb596574-a47e-4a1a-8d9f-1075955844cd; promoted100percent and independently read back. Observability preserved. Actual authenticated lounge probe now allocates two independent app/presence/provider sessions successfully under one Labs admin identity. Publication/subscription verification in progress; distinct installed-member acceptance remains open.
