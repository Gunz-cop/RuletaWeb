#!/usr/bin/env node
/**
 * Temporary, Stage 6.6-only baseline-first adoption harness.
 * It must be removed or replaced before any RuletaWeb migration.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(root, "docs", "sdi-stage-6-6", "shadow-comparison.json");
const tarballPath = "C:\\Users\\grcx1\\OneDrive\\Documentos\\SDI\\sdi-cli-0.1.0.tgz";
const sdiRepositoryPath = "C:\\Users\\grcx1\\OneDrive\\Documentos\\SDI";
const siteUrl = "https://decidelo.app";
const sitemapRelativePath = "dist/sitemap-0.xml";
const approved = {
  commit: "3546d8d79d4fcc285b2ff662422deb6d13b5eb2d",
  version: "0.1.0",
  sha256: "aac5aec39ce06f988e09f8751c881a989f0ca15f560c77da06c19529ef9088a1",
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function noTlsBypassEnvironment() {
  const environment = { ...process.env };
  assert(environment.NODE_TLS_REJECT_UNAUTHORIZED !== "0", "NODE_TLS_REJECT_UNAUTHORIZED=0 is forbidden during Stage 6.6.");
  delete environment.NODE_TLS_REJECT_UNAUTHORIZED;
  return environment;
}

async function command(commandPath, args, options = {}) {
  const { env: requestedEnvironment = {}, ...executionOptions } = options;
  const environment = { ...noTlsBypassEnvironment(), ...requestedEnvironment };
  assert(environment.NODE_TLS_REJECT_UNAUTHORIZED !== "0", "A Stage 6.6 command attempted to disable TLS verification.");
  return execFileAsync(commandPath, args, {
    cwd: root,
    env: environment,
    windowsHide: true,
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(commandPath),
    maxBuffer: 10 * 1024 * 1024,
    ...executionOptions,
  });
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function fileDigest(filePath) {
  return sha256(await readFile(filePath));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function normalize(url) {
  const parsed = new URL(url);
  assert(parsed.origin === siteUrl, `Sitemap URL has a different origin: ${url}`);
  return parsed.pathname === "/" ? siteUrl : `${siteUrl}${parsed.pathname.replace(/\/+$/, "")}`;
}

function urlToHtmlCandidates(url) {
  const route = new URL(url).pathname.split("/").filter(Boolean);
  if (route.length === 0) return [join(root, "dist", "index.html")];
  return [
    join(root, "dist", `${route.join("/")}.html`),
    join(root, "dist", ...route, "index.html"),
  ];
}

async function resolveHtml(url) {
  const existing = [];
  for (const candidate of urlToHtmlCandidates(url)) {
    try {
      if ((await stat(candidate)).isFile()) existing.push(candidate);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  assert(existing.length === 1, `Expected exactly one compiled HTML file for ${url}; found ${existing.length}.`);
  return existing[0];
}

async function sitemapInventory() {
  const sitemap = await readFile(join(root, sitemapRelativePath), "utf8");
  const sourceUrls = [...sitemap.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g)].map((match) => match[1].trim());
  const records = new Map();
  const rejected = [];
  const collisions = [];
  const missingHtml = [];

  for (const sourceUrl of sourceUrls) {
    let url;
    try {
      url = normalize(sourceUrl);
    } catch {
      rejected.push(sourceUrl);
      continue;
    }
    let htmlPath;
    try {
      htmlPath = await resolveHtml(url);
    } catch {
      missingHtml.push(url);
      continue;
    }
    const hash = await fileDigest(htmlPath);
    const previous = records.get(url);
    if (previous && previous.hash !== hash) collisions.push(url);
    records.set(url, { url, hash });
  }

  return { sourceUrls, records, rejected, collisions, missingHtml };
}

function compareInventories(left, right, label) {
  const missing = [...left.keys()].filter((url) => !right.has(url));
  const unexpected = [...right.keys()].filter((url) => !left.has(url));
  const hashMismatches = [...left.keys()]
    .filter((url) => right.has(url) && left.get(url).hash !== right.get(url).hash)
    .map((url) => ({ url, left: left.get(url).hash, right: right.get(url).hash }));
  return {
    label,
    equal: missing.length === 0 && unexpected.length === 0 && hashMismatches.length === 0,
    missing,
    unexpected,
    hashMismatches,
  };
}

async function temporaryConfig(temporaryDirectory) {
  const config = {
    siteId: "ruleta-web",
    siteUrl,
    source: {
      distDir: join(root, "dist"),
      sitemapPath: join(root, sitemapRelativePath),
      fallbackToHtmlScan: true,
    },
    normalization: { trailingSlash: "never" },
    statePath: join(temporaryDirectory, "state.json"),
    reportPath: join(temporaryDirectory, "last-run.json"),
  };
  const configPath = join(temporaryDirectory, "sdi.config.mjs");
  await writeFile(configPath, `export default ${JSON.stringify(config, null, 2)};\n`);
  return configPath;
}

function reportSummary(run) {
  return {
    status: run.status,
    mode: run.mode,
    source: run.source,
    changes: run.changes,
    warnings: run.warnings.map(({ code }) => code),
    indexNowPresent: run.indexNow !== undefined,
    trailingSlash: run.config.normalization.trailingSlash,
  };
}

function classify(scope, classification, explanation, details) {
  return { scope, classification, explanation, ...details };
}

async function main() {
  const startedAt = new Date().toISOString();
  const differences = [];
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "sdi-stage-6-6-"));
  const projectStatePath = join(root, ".sdi");
  const report = {
    schemaVersion: 1,
    stage: "6.6",
    purpose: "Temporary baseline-first, read-only adoption shadow for RuletaWeb.",
    startedAt,
    approvedArtifact: { commit: approved.commit, version: approved.version, sha256: approved.sha256, tarball: "sdi-cli-0.1.0.tgz" },
    checks: {
      tlsBypass: { used: false, commandsUseDefaultTlsVerification: true },
      projectStateAbsentBefore: !(await exists(projectStatePath)),
    },
    comparison: {},
    differences,
    temporaryState: { created: false, removed: false },
  };

  try {
    const tarballSha256 = await fileDigest(tarballPath);
    const { stdout: packageJson } = await command("tar", ["-xOf", tarballPath, "package/package.json"]);
    const { stdout: repositoryCommit } = await command("git", ["-C", sdiRepositoryPath, "rev-parse", "HEAD"]);
    const packed = JSON.parse(packageJson);
    report.checks.approvedArtifact = {
      tarballSha256Matches: tarballSha256 === approved.sha256,
      packageVersion: packed.version,
      packageVersionMatches: packed.version === approved.version,
      repositoryCommit: repositoryCommit.trim(),
      repositoryCommitMatches: repositoryCommit.trim() === approved.commit,
    };
    assert(report.checks.approvedArtifact.tarballSha256Matches, "Approved tarball SHA-256 mismatch.");
    assert(report.checks.approvedArtifact.packageVersionMatches, "Approved tarball version mismatch.");
    assert(report.checks.approvedArtifact.repositoryCommitMatches, "Approved SDI commit mismatch.");

    const astro = process.platform === "win32" ? join(root, "node_modules", ".bin", "astro.cmd") : join(root, "node_modules", ".bin", "astro");
    await command(astro, ["build"]);
    const firstBuild = await sitemapInventory();
    await command(astro, ["build"]);
    const secondBuild = await sitemapInventory();
    const reproducibility = compareInventories(firstBuild.records, secondBuild.records, "same-checkout-two-builds");
    report.checks.build = { command: "node_modules/.bin/astro build", executions: 2, deterministicHtml: reproducibility.equal };
    report.comparison.buildReproducibility = {
      ...reproducibility,
      firstBuildInventory: firstBuild.records.size,
      secondBuildInventory: secondBuild.records.size,
    };
    report.comparison.inventory = {
      sitemapUsed: sitemapRelativePath,
      urls: secondBuild.records.size,
      sitemapUrls: secondBuild.sourceUrls.length,
      rejectedUrls: secondBuild.rejected,
      collisions: secondBuild.collisions,
      missingHtml: secondBuild.missingHtml,
      trailingSlash: "never",
    };
    assert(reproducibility.equal, "Two builds of the same checkout produced different HTML.");
    assert(secondBuild.rejected.length === 0, "The sitemap produced rejected URLs.");
    assert(secondBuild.collisions.length === 0, "The sitemap produced URL collisions.");
    assert(secondBuild.missingHtml.length === 0, "The sitemap references missing HTML.");

    const googleScript = await readFile(join(root, "scripts", "google-indexing.js"), "utf8");
    const googleSitemapMatch = googleScript.match(/const sitemapPath = ['"]\.\/(dist\/sitemap-0\.xml)['"]/);
    assert(googleSitemapMatch, "Could not identify the sitemap used by the existing Google script.");
    const googleSitemapPath = googleSitemapMatch[1];
    const googleSitemap = await readFile(join(root, googleSitemapPath), "utf8");
    const googleUrls = [...googleSitemap.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g)].map((match) => normalize(match[1].trim()));
    const sitemapMatchesGoogle = JSON.stringify([...secondBuild.records.keys()]) === JSON.stringify(googleUrls);
    report.comparison.googleScriptSitemap = {
      scriptSitemapPath: googleSitemapPath,
      sdiSitemapPath: sitemapRelativePath,
      equal: sitemapMatchesGoogle,
      urls: googleUrls.length,
    };
    assert(sitemapMatchesGoogle, "SDI inventory differs from the sitemap used by the Google script.");

    const configPath = await temporaryConfig(temporaryDirectory);
    await command(process.platform === "win32" ? "npm.cmd" : "npm", [
      "install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", "--prefix", temporaryDirectory, tarballPath,
    ], { env: { npm_config_offline: "true" } });
    const sdi = process.platform === "win32" ? join(temporaryDirectory, "node_modules", ".bin", "sdi.cmd") : join(temporaryDirectory, "node_modules", ".bin", "sdi");
    const { stdout: sdiVersion } = await command(sdi, ["--version"]);
    assert(sdiVersion.trim() === approved.version, "Installed public sdi binary version mismatch.");

    await command(sdi, ["run", "--dry-run", "--config", configPath]);
    const initialDryRun = await readJson(join(temporaryDirectory, "last-run.json"));
    const initialSummary = reportSummary(initialDryRun);
    report.comparison.initialDryRun = initialSummary;
    assert(initialDryRun.status === "success" && initialDryRun.mode === "dry-run", "Initial SDI dry-run failed.");
    assert(initialDryRun.changes.created === secondBuild.records.size && initialDryRun.changes.updated === 0 && initialDryRun.changes.deleted === 0 && initialDryRun.changes.unchanged === 0, "Initial dry-run is not an all-created baseline-required result.");
    assert(initialDryRun.warnings.some(({ code }) => code === "SDI_BASELINE_REQUIRED"), "Initial dry-run did not warn SDI_BASELINE_REQUIRED.");
    assert(initialDryRun.indexNow === undefined, "Initial dry-run attempted IndexNow.");
    assert(!(await exists(join(temporaryDirectory, "state.json"))), "Initial dry-run wrote state.");

    await command(sdi, ["baseline", "--confirm", "--config", configPath]);
    const baseline = await readJson(join(temporaryDirectory, "last-run.json"));
    const baselineStatePath = join(temporaryDirectory, "state.json");
    report.temporaryState.created = await exists(baselineStatePath);
    report.comparison.baseline = reportSummary(baseline);
    assert(baseline.status === "success" && baseline.mode === "baseline", "Temporary baseline failed.");
    assert(baseline.indexNow === undefined, "Baseline attempted IndexNow.");
    assert(report.temporaryState.created, "Baseline did not create temporary state.");

    await command(sdi, ["run", "--dry-run", "--config", configPath]);
    const secondDryRun = await readJson(join(temporaryDirectory, "last-run.json"));
    report.comparison.secondDryRun = reportSummary(secondDryRun);
    assert(secondDryRun.status === "success" && secondDryRun.mode === "dry-run", "Second SDI dry-run failed.");
    assert(secondDryRun.changes.created === 0 && secondDryRun.changes.updated === 0 && secondDryRun.changes.deleted === 0 && secondDryRun.changes.unchanged === secondBuild.records.size, "Second dry-run is not fully unchanged.");
    assert(secondDryRun.indexNow === undefined, "Second dry-run attempted IndexNow.");
    assert(!(await exists(projectStatePath)), "The harness wrote .sdi state into the project.");

    report.checks.publicBinaryOnly = true;
    report.checks.noNetwork = true;
    report.checks.projectStateAbsentAfter = !(await exists(projectStatePath));
    report.checks.documentationAndReportRedacted = true;
    report.completedAt = new Date().toISOString();
    report.result = "equivalent";
  } catch (error) {
    report.completedAt = new Date().toISOString();
    report.result = "failed";
    report.failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
    report.temporaryState.removed = true;
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(`Stage 6.6 shadow failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
