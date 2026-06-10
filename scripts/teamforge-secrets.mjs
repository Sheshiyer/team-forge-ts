#!/usr/bin/env node
/**
 * teamforge-secrets — founder CLI for the TeamForge secrets layer.
 *
 * Talks to the /v1/secrets/* API on forge.thoughtseed.space. Authenticates as a
 * founder using a Cloudflare Access token (preferred) or, for agent-scope reads,
 * a service token / internal secret. Secrets are stored AES-256-GCM-encrypted in
 * KV server-side; this CLI only ever sees decrypted values you are authorized for.
 *
 * Auth ladder (first available wins):
 *   1. cloudflared access token for forge.thoughtseed.space  (FOUNDER scope)
 *        Requires: `cloudflared` installed and `cloudflared access login \
 *        https://forge.thoughtseed.space` done once. The CLI shells out to
 *        `cloudflared access token -app=https://forge.thoughtseed.space`.
 *   2. CF Access service token via env CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET
 *        (AGENT scope — read-only on `agents/*`).
 *   3. Internal secret via env TF_INTERNAL_SHARED_SECRET
 *        (AGENT scope — read-only on `agents/*`).
 *
 * Usage:
 *   teamforge-secrets list <me|shared|agents>
 *   teamforge-secrets get  <me|shared|agents> <name> [--reveal]
 *   teamforge-secrets put  <me|shared|agents> <name> [value]    (value via stdin if omitted)
 *   teamforge-secrets del  <me|shared|agents> <name>
 *   teamforge-secrets env  <me|shared|agents>            (prints `export K=V`; eval in shell, RAM only)
 *   teamforge-secrets exec <me|shared|agents> -- <cmd...> (runs cmd with secrets injected, nothing on disk)
 *   teamforge-secrets pull <me|shared|agents> --out <file.env>  (DEPRECATED — writes a file to disk)
 *
 * Flags: --reveal (print full value), --base <url>, --json
 *
 * ZERO-DISK: prefer `env` and `exec` — they keep secrets in process memory only.
 *   eval "$(teamforge-secrets env shared)"      # inject into current shell, no file
 *   teamforge-secrets exec agents -- ./run.sh   # inject into a subprocess, no file
 * `pull` is retained only for legacy tooling and warns because it writes plaintext to disk.
 *
 * SECURITY: never logs token values.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync, chmodSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const DEFAULT_BASE = process.env.TF_API_BASE_URL || "https://forge.thoughtseed.space";

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--reveal" || a === "--json") flags[a.slice(2)] = true;
    else if (a === "--base") flags.base = argv[++i];
    else if (a === "--out") flags.out = argv[++i];
    else positional.push(a);
  }
  return { positional, flags };
}

function cloudflaredToken(base) {
  try {
    const out = execFileSync("cloudflared", ["access", "token", `-app=${base}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out && !out.includes("Unable to find token") ? out : null;
  } catch {
    return null;
  }
}

function buildAuthHeaders(base) {
  const token = cloudflaredToken(base);
  if (token) {
    // cloudflared token is the Access application JWT. The Worker reads it from
    // the Cf-Access-Jwt-Assertion header (canonical) or the CF_Authorization
    // cookie (fallback). Send both so server-side validation always finds it.
    return {
      "Cf-Access-Jwt-Assertion": token,
      cookie: `CF_Authorization=${token}`,
      _principal: "founder",
    };
  }
  const id = process.env.CF_ACCESS_CLIENT_ID;
  const secret = process.env.CF_ACCESS_CLIENT_SECRET;
  if (id && secret) {
    return { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret, _principal: "agent(service-token)" };
  }
  const internal = process.env.TF_INTERNAL_SHARED_SECRET;
  if (internal) {
    return { "X-TeamForge-Internal-Secret": internal, _principal: "agent(internal-secret)" };
  }
  return null;
}

async function api(base, method, path, headers, body) {
  const { _principal, ...h } = headers;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...h, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  if (res.status === 302 || res.status === 301) {
    throw new Error(
      "Cloudflare Access blocked the request (302). Run: cloudflared access login " +
        base +
        "  — or check you are an allowed founder identity.",
    );
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || json.ok === false) {
    const err = json.error || {};
    throw new Error(`${res.status} ${err.code || ""}: ${err.message || text.slice(0, 200)}`);
  }
  return json.data;
}

// Fetch every secret in a scope as [name, value] pairs. Used by env/exec/pull.
// The per-secret GETs run in parallel — one round-trip of latency, not N.
async function fetchScopeSecrets(base, scope, headers) {
  const list = await api(base, "GET", `/v1/secrets/${scope}`, headers);
  const names = (list.secrets || []).map((s) => s.name);
  return Promise.all(
    names.map(async (name) => {
      const one = await api(base, "GET", `/v1/secrets/${scope}/${encodeURIComponent(name)}`, headers);
      return [name, one.value];
    }),
  );
}

// Wrap a value in single quotes for safe shell `eval`, escaping embedded quotes.
function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    const rl = createInterface({ input: process.stdin });
    rl.on("line", (l) => (data += (data ? "\n" : "") + l));
    rl.on("close", () => resolve(data));
  });
}

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const [cmd, scope, name] = positional;
  const base = flags.base || DEFAULT_BASE;

  if (!cmd || ["help", "-h", "--help"].includes(cmd)) {
    console.log(readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 36).join("\n").replace(/^ \*\/?/gm, "").trim());
    process.exit(cmd ? 0 : 1);
  }

  const headers = buildAuthHeaders(base);
  if (!headers) {
    console.error(
      "No credentials. For founder access install cloudflared and run:\n" +
        `  cloudflared access login ${base}\n` +
        "Or set CF_ACCESS_CLIENT_ID/CF_ACCESS_CLIENT_SECRET (agent read) or TF_INTERNAL_SHARED_SECRET.",
    );
    process.exit(2);
  }

  try {
    if (cmd === "list") {
      const data = await api(base, "GET", `/v1/secrets/${scope}`, headers);
      if (flags.json) return console.log(JSON.stringify(data, null, 2));
      const rows = data.secrets || [];
      if (!rows.length) return console.log(`(no secrets in ${scope})`);
      for (const s of rows) console.log(`${s.name}\tv${s.version}\t${s.masked || ""}\t${s.updated_by || ""}`);
      return;
    }
    if (cmd === "get") {
      const data = await api(base, "GET", `/v1/secrets/${scope}/${encodeURIComponent(name)}`, headers);
      if (flags.json) return console.log(JSON.stringify(data, null, 2));
      console.log(flags.reveal ? data.value : (data.metadata?.masked || "****  (use --reveal)"));
      return;
    }
    if (cmd === "put") {
      if (positional[3] !== undefined) {
        process.stderr.write(
          "WARN: passing the secret as an argument writes it to shell history and `ps`. Prefer stdin: printf '%s' \"$V\" | teamforge-secrets put ...\n",
        );
      }
      const value = positional[3] !== undefined ? positional[3] : await readStdin();
      if (!value) throw new Error("Empty value");
      const data = await api(base, "PUT", `/v1/secrets/${scope}/${encodeURIComponent(name)}`, headers, { value });
      console.log(`stored ${scope}/${name} v${data.version} (${data.masked})`);
      return;
    }
    if (cmd === "del" || cmd === "delete") {
      await api(base, "DELETE", `/v1/secrets/${scope}/${encodeURIComponent(name)}`, headers);
      console.log(`deleted ${scope}/${name}`);
      return;
    }
    if (cmd === "env") {
      // Print `export NAME='value'` lines for `eval`. Values stay in shell RAM;
      // nothing is written to disk. Single-quote escaping is shell-safe.
      const pairs = await fetchScopeSecrets(base, scope, headers);
      for (const [name, value] of pairs) {
        console.log(`export ${name}=${shellSingleQuote(value)}`);
      }
      if (process.stdout.isTTY) {
        process.stderr.write(
          `# ${pairs.length} secrets. Inject with:  eval "$(teamforge-secrets env ${scope})"\n`,
        );
      }
      return;
    }
    if (cmd === "exec") {
      // Run a command with the scope's secrets injected as env vars. Secrets
      // exist only in the child process environment — never on disk.
      const sep = process.argv.indexOf("--");
      const child = sep >= 0 ? process.argv.slice(sep + 1) : [];
      if (!child.length) throw new Error("exec needs: exec <scope> -- <command> [args...]");
      const pairs = await fetchScopeSecrets(base, scope, headers);
      const childEnv = { ...process.env };
      for (const [name, value] of pairs) childEnv[name] = value;
      const res = spawnSync(child[0], child.slice(1), { stdio: "inherit", env: childEnv });
      process.exit(res.status ?? (res.error ? 1 : 0));
    }
    if (cmd === "pull") {
      process.stderr.write(
        "WARN: `pull` writes plaintext secrets to disk and is deprecated. Prefer zero-disk:\n" +
          `  eval "$(teamforge-secrets env ${scope || "<scope>"})"   # in-memory shell injection\n` +
          `  teamforge-secrets exec ${scope || "<scope>"} -- <cmd>   # in-memory subprocess\n`,
      );
      const out = flags.out;
      if (!out) throw new Error("pull requires --out <file.env>");
      const pairs = await fetchScopeSecrets(base, scope, headers);
      const lines = pairs.map(([name, value]) => `${name}=${value}`);
      writeFileSync(out, lines.join("\n") + "\n", { mode: 0o600 });
      chmodSync(out, 0o600);
      console.log(`wrote ${lines.length} secrets to ${out} (chmod 600)`);
      return;
    }
    throw new Error(`Unknown command: ${cmd}`);
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}

main();
