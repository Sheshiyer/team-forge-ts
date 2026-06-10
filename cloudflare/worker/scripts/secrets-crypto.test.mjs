/**
 * Standalone verification of the secrets envelope scheme against the REAL
 * source module (../src/lib/secrets-crypto.ts), run via `npx tsx`.
 *
 * Proves: AES-256-GCM round-trip; tamper rejection; key-relocation rejection
 * (AAD = kv key); version-rollback rejection (AAD = version). Web Crypto is a
 * Node 18+ global, so the same code path the Worker runs is exercised here.
 */
import { sealSecret, openSecret, maskValue } from "../src/lib/secrets-crypto.ts";

const b64key = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("PASS", name); } else { fail++; console.log("FAIL", name); } };

// 1. round-trip
const key = "secret/founder/shesh@x/api";
const sealed = await sealSecret("super-secret-value", key, 1, b64key);
ok("round-trip decrypts", (await openSecret(sealed, key, 1, b64key)) === "super-secret-value");

// 2. ciphertext is not plaintext
ok("ciphertext hides plaintext", !sealed.includes("super-secret-value"));

// 3. relocation rejected (different kv key, same version)
ok("relocation rejected (AAD=key)", (await openSecret(sealed, "secret/founder/other@x/api", 1, b64key)) === null);

// 4. rollback rejected (same key, different version)
ok("rollback rejected (AAD=version)", (await openSecret(sealed, key, 2, b64key)) === null);

// 5. wrong master key rejected
const otherKey = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");
ok("wrong key rejected", (await openSecret(sealed, key, 1, otherKey)) === null);

// 6. tampered ciphertext rejected
const env = JSON.parse(sealed); const ctBytes = Buffer.from(env.ct, "base64"); ctBytes[0] ^= 0xff; env.ct = ctBytes.toString("base64");
ok("tamper rejected", (await openSecret(JSON.stringify(env), key, 1, b64key)) === null);

// 7. malformed envelope rejected
ok("malformed rejected", (await openSecret("not-json", key, 1, b64key)) === null);

// 8. mask never reveals full value
ok("mask hides value", !maskValue("abcdefghijklmnop").includes("cdefghijklmn"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
