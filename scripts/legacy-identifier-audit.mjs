import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import inventory from "./legacy-identifier-allowlist.json" with { type: "json" };

const patterns = Object.fromEntries(
  Object.entries(inventory.patterns).map(([id, expression]) => [id, new RegExp(expression, "gi")]),
);
const summaryCategories = ["historical", "durable domain language", "third-party text", "approved compatibility"];

async function collectFiles(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.relative(rootDir, path.join(currentDir, entry.name)).split(path.sep).join("/");
    if (inventory.excludedDirectories.includes(entry.name)) continue;
    if (entry.isDirectory()) {
      if (!inventory.excludedDirectories.includes(entry.name)) {
        files.push(...(await collectFiles(rootDir, path.join(currentDir, entry.name))));
      }
      continue;
    }
    if (!entry.isFile() || inventory.excludedPaths.includes(relativePath)) continue;
    files.push(relativePath);
  }
  return files.sort();
}

function globToRegExp(glob) {
  const escapeRegExp = (value) => value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const expression = glob
    .split("**")
    .map((segment) => segment.split("*").map(escapeRegExp).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${expression}$`);
}

function pathMatches(relativePath, candidate) {
  return candidate.includes("*") ? globToRegExp(candidate).test(relativePath) : relativePath === candidate;
}

function matchingRules(relativePath, patternId) {
  return inventory.rules.filter(
    (rule) => rule.patterns.includes(patternId) && rule.paths.some((candidate) => pathMatches(relativePath, candidate)),
  );
}

function classifyHit(relativePath, patternId, value) {
  const rules = matchingRules(relativePath, patternId);
  if (patternId === "legacy-environment-variable" && value !== "QUICK_STUDY_DATA_DIR") {
    return null;
  }
  return rules[0] ?? null;
}

function lineNumber(contents, offset) {
  return contents.slice(0, offset).split("\n").length;
}

function scanContents(relativePath, contents, source) {
  const hits = [];
  for (const [patternId, pattern] of Object.entries(patterns)) {
    pattern.lastIndex = 0;
    for (const match of contents.matchAll(pattern)) {
      const value = match[0];
      const rule = classifyHit(relativePath, patternId, value);
      hits.push({
        category: rule?.category ?? null,
        line: lineNumber(contents, match.index ?? 0),
        patternId,
        path: relativePath,
        rule: rule?.id ?? null,
        source,
        value,
      });
    }
  }
  return hits;
}

export async function auditLegacyIdentifiers({ rootDir }) {
  const errors = [];
  const classified = [];
  const observedCounts = new Map();
  const activeRuleIds = new Set();
  const files = await collectFiles(rootDir);

  for (const relativePath of files) {
    for (const rule of inventory.rules) {
      if (rule.paths.some((candidate) => pathMatches(relativePath, candidate))) activeRuleIds.add(rule.id);
    }
    const pathHits = scanContents(relativePath, relativePath, "path");
    const rawContents = await readFile(path.join(rootDir, relativePath));
    if (rawContents.includes(0)) continue;
    const contents = rawContents.toString("utf8");
    for (const hit of [...pathHits, ...scanContents(relativePath, contents, "content")]) {
      if (hit.rule === null) {
        errors.push(`${hit.path}:${hit.line}: unexplained legacy identifier ${hit.value} (${hit.patternId})`);
      } else {
        classified.push(hit);
        if (hit.source === "content") {
          const key = `${hit.rule}:${hit.patternId}`;
          observedCounts.set(key, (observedCounts.get(key) ?? 0) + 1);
        }
      }
    }
  }

  for (const rule of inventory.rules) {
    if (!activeRuleIds.has(rule.id)) continue;
    for (const [patternId, expected] of Object.entries(rule.expectedCounts ?? {})) {
      const actual = observedCounts.get(`${rule.id}:${patternId}`) ?? 0;
      if (actual !== expected) {
        errors.push(`${rule.id}: expected ${expected} ${patternId} occurrences, found ${actual}`);
      }
    }
  }

  const summary = Object.fromEntries(summaryCategories.map((category) => [category, 0]));
  for (const hit of classified) summary[hit.category] = (summary[hit.category] ?? 0) + 1;
  return { classified, errors, observedCounts: Object.fromEntries(observedCounts), summary };
}

async function main() {
  const result = await auditLegacyIdentifiers({ rootDir: process.cwd() });
  if (result.errors.length > 0) {
    console.error(result.errors.map((error) => `Legacy identifier policy: ${error}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log(
    `Legacy identifier policy passed: ${result.classified.length} references classified ` +
      `(${summaryText(result.summary)}); generated and dependency directories were excluded.`,
  );
}

function summaryText(summary) {
  return Object.entries(summary)
    .map(([category, count]) => `${category}=${count}`)
    .join(", ");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
