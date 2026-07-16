import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RETIRED_IDENTIFIERS = [
  "downstream" + "_multica",
  "multica" + "_agent",
  "multica" + "_service",
  "aws" + "_task_role",
];

const RUNTIME_NAME = "multi" + "ca";
const GUARD_PATH = "cloudflare/worker/scripts/check-retired-routing.mjs";

const EXCLUDED_PATH_PREFIXES = [
  ".git/",
  ".pnpm-store/",
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
  "target/",
  ".turbo/",
  ".vite/",
  "design/assets/",
  "design-assets/",
  "docs/images/",
  "docs/qa/screenshots/",
  "src-tauri/icons/",
  // Explicitly historical surfaces: readable evidence, never runtime authority.
  "docs/architecture/contracts/_archived/",
  "cloudflare/worker/migrations/",
  "src-tauri/migrations/",
];

const EXCLUDED_FILES = new Set([
  GUARD_PATH,
  "pnpm-lock.yaml",
  "cloudflare/worker/pnpm-lock.yaml",
  "sidecar/pnpm-lock.yaml",
  "src-tauri/Cargo.lock",
]);

const TEXT_EXTENSIONS = new Set([
  ".cjs", ".conf", ".css", ".env", ".example", ".fish", ".go", ".html",
  ".ini", ".java", ".js", ".json", ".jsonc", ".jsx", ".kt", ".md",
  ".mdx", ".mjs", ".php", ".properties", ".ps1", ".py", ".rb", ".rs",
  ".sh", ".sql", ".swift", ".toml", ".ts", ".tsx", ".txt", ".xml",
  ".yaml", ".yml", ".zsh",
]);

const DOCUMENT_EXTENSIONS = new Set([".md", ".mdx", ".txt"]);

const RESURRECTION_CLAIMS = [
  /\bmultica\b\s+is\s+(?:now\s+)?(?:the\s+)?canonical/i,
  /\bmultica\b\s+integration\s*\(required\)/i,
  /\bmultica\b\s*\(ai gateway\s*\+\s*agent backend\)\s*:\s*runs/i,
  /add\s+`?multica_(?:api|app|workspace)[a-z0-9_]*`?/i,
  /add\s+\bmultica\b\s+url\s+vars/i,
  /\bmultica\b\s+issue\s+assign/i,
  /route\s*=\s*["'`]?downstream_multica/i,
  /wrangler[^\n]*\bmultica_[a-z0-9_]+/i,
  /-\s*\[\s\][^\n]*\bmultica\b/i,
];

const OPERATIONAL_DOC_CUES = /\b(active|agent backend|api url|callback|canonical|configure|deploy|endpoint|gateway|health|provision|required|route|run|secret|workspace)\b/i;
const RETIREMENT_CONTEXT = /\b(archiv(?:e|ed)|cancel(?:led)?|do not|former|historical|legacy|must not|never|no longer|not active|removed|retir(?:e|ed|ement)|superseded)\b/i;

function normalized(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isExcludedPath(path) {
  const candidate = normalized(path);
  return EXCLUDED_FILES.has(candidate)
    || EXCLUDED_PATH_PREFIXES.some((prefix) => candidate.startsWith(prefix));
}

function isTextCandidate(path) {
  const name = basename(path);
  if (["Dockerfile", "Makefile", "Procfile"].includes(name)) return true;
  if (name === ".env" || name.startsWith(".env.")) return true;
  return TEXT_EXTENSIONS.has(extname(name).toLowerCase());
}

function walkAll(root, current = root) {
  const files = [];
  if (!existsSync(current)) return files;
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name);
    const repoPath = normalized(relative(root, absolute));
    if (isExcludedPath(repoPath)) continue;
    if (entry.isDirectory()) files.push(...walkAll(root, absolute));
    else files.push(repoPath);
  }
  return files;
}

function repositoryFiles(repoRoot) {
  try {
    const output = execFileSync(
      "git",
      ["-C", repoRoot, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return output.split("\0").filter(Boolean).map(normalized);
  } catch {
    // Self-test fixtures are intentionally not Git repositories.
    return walkAll(repoRoot);
  }
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactIdentifierPattern(identifier) {
  return new RegExp(`(?<![A-Za-z0-9_])${escaped(identifier)}(?![A-Za-z0-9_])`, "i");
}

const IDENTIFIER_PATTERNS = RETIRED_IDENTIFIERS.map((identifier) => ({
  identifier,
  pattern: exactIdentifierPattern(identifier),
}));

const RUNTIME_NAME_PATTERN = new RegExp(`(?<![A-Za-z0-9])${RUNTIME_NAME}(?![A-Za-z0-9])`, "i");
const RUNTIME_PATH_PATTERN = new RegExp(`(?:^|[/_.-])${RUNTIME_NAME}(?=$|[/_.-])`, "i");

function runtimeFinding(line) {
  for (const { identifier, pattern } of IDENTIFIER_PATTERNS) {
    if (pattern.test(line)) return identifier;
  }
  if (RUNTIME_NAME_PATTERN.test(line)) return `${RUNTIME_NAME} runtime reference`;
  return null;
}

function isExplicitlyHistoricalDocument(source) {
  const headerLines = source.slice(0, 1_500).split(/\r?\n/).slice(0, 6);
  return headerLines.some((line) => /^>\s*Historical record\b.*\bDo not execute\b/i.test(line));
}

function documentFinding(line, explicitlyHistorical) {
  if (explicitlyHistorical) return null;
  for (const claim of RESURRECTION_CLAIMS) {
    if (claim.test(line)) return "execution-authority resurrection claim";
  }
  if (
    RUNTIME_NAME_PATTERN.test(line)
    && OPERATIONAL_DOC_CUES.test(line)
    && !RETIREMENT_CONTEXT.test(line)
  ) {
    return "unretired operational MultiCA claim";
  }
  return null;
}

export function findRetiredRoutingReferences(repoRoot) {
  const findings = [];
  const candidates = repositoryFiles(repoRoot)
    .filter((path) => !isExcludedPath(path) && isTextCandidate(path));

  for (const repoPath of candidates) {
    const absolute = join(repoRoot, repoPath);
    if (!existsSync(absolute)) continue;

    const extension = extname(repoPath).toLowerCase();
    const isDocument = DOCUMENT_EXTENSIONS.has(extension);
    if (!isDocument && RUNTIME_PATH_PATTERN.test(repoPath)) {
      findings.push(`${repoPath}: retired runtime name in active path`);
    }

    const bytes = readFileSync(absolute);
    if (bytes.includes(0)) continue;
    const source = bytes.toString("utf8");
    const explicitlyHistorical = isDocument && isExplicitlyHistoricalDocument(source);
    const lines = source.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const finding = isDocument
        ? documentFinding(lines[index], explicitlyHistorical)
        : runtimeFinding(lines[index]);
      if (finding) findings.push(`${repoPath}:${index + 1}: ${finding}`);
    }
  }

  return [...new Set(findings)].sort();
}

function writeFixture(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
}

function fixtureCase(parent, name, files) {
  const root = join(parent, name);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  writeFixture(root, files);
  return root;
}

function assertFinds(root, message) {
  if (findRetiredRoutingReferences(root).length === 0) throw new Error(message);
}

function assertClean(root, message) {
  const findings = findRetiredRoutingReferences(root);
  if (findings.length > 0) throw new Error(`${message}: ${findings.join(", ")}`);
}

function runSelfTest() {
  const fixture = mkdtempSync(join(tmpdir(), "teamforge-retirement-guard-"));
  try {
    for (let index = 0; index < RETIRED_IDENTIFIERS.length; index += 1) {
      const term = RETIRED_IDENTIFIERS[index];
      const root = fixtureCase(fixture, `identifier-${index}`, {
        "future-runtime/bridge.ts": `export const route = ${JSON.stringify(term)};\n`,
      });
      assertFinds(root, `guard missed active identifier: ${term}`);
    }

    assertFinds(
      fixtureCase(fixture, "env-example", {
        ".env.example": `MULTICA_API_URL=https://retired.invalid\n`,
      }),
      "guard missed root env example",
    );

    assertFinds(
      fixtureCase(fixture, "compose", {
        "compose.yaml": `services:\n  retired:\n    image: multica:latest\n`,
      }),
      "guard missed root compose config",
    );

    assertFinds(
      fixtureCase(fixture, "imported-test-name", {
        "src/index.ts": `import { route } from \"./runtime.test\";\nvoid route;\n`,
        "src/runtime.test.ts": `export const route = \"downstream_multica\";\n`,
      }),
      "guard skipped an imported test-named production artifact",
    );

    assertFinds(
      fixtureCase(fixture, "path-token", {
        "src/auth-multica.ts": `export const disabled = true;\n`,
      }),
      "guard missed retired runtime name in a path",
    );

    assertFinds(
      fixtureCase(fixture, "current-doc", {
        "docs/plans/current-runtime.md": `# Current\nMultiCA is now the canonical execution gateway.\n`,
      }),
      "guard missed a current planning-document resurrection claim",
    );

    assertClean(
      fixtureCase(fixture, "allowed-substrings", {
        "src/network.ts": `export const multicast = true;\nexport function multicall() {}\n`,
      }),
      "guard false-positived on multicast/multicall",
    );

    assertClean(
      fixtureCase(fixture, "retirement-doc", {
        "README.md": `# Current\nMultiCA is retired and must not receive active execution work.\n`,
      }),
      "guard rejected explicit retirement documentation",
    );

    assertClean(
      fixtureCase(fixture, "historical", {
        "docs/plans/2026-06-01-old-plan.md": `# Old plan\n\n> Historical record — superseded. Do not execute this plan.\n\n${RETIRED_IDENTIFIERS.join("\n")}\n`,
        "cloudflare/worker/migrations/0001_history.sql": RETIRED_IDENTIFIERS.join("\n"),
      }),
      "guard rejected explicitly historical records",
    );

    assertFinds(
      fixtureCase(fixture, "incidental-history-phrase", {
        "docs/plans/current-runtime.md": "# Current\n\nThis is not a historical record. MultiCA is now the canonical execution gateway.\n",
      }),
      "guard treated an incidental or negated history phrase as an archive marker",
    );

    assertClean(
      fixtureCase(fixture, "generated-dependencies", {
        "dist/bundle.js": `const route = \"downstream_multica\";\n`,
        "node_modules/example/index.js": `const route = \"downstream_multica\";\n`,
      }),
      "guard rejected generated or dependency output",
    );

    console.log("retired-routing guard self-test passed");
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
  } else {
    const repoRoot = resolve(dirname(invokedPath), "../../..");
    const findings = findRetiredRoutingReferences(repoRoot);
    if (findings.length > 0) {
      console.error("Retired execution authority found in active code/config/docs:");
      for (const finding of findings) console.error(`- ${finding}`);
      process.exitCode = 1;
    } else {
      console.log("retired-routing guard passed: active code/config/docs are clean");
    }
  }
}
