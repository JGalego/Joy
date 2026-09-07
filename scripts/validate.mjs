#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = join(root, "skills", "joy", "SKILL.md");
const readmePath = join(root, "README.md");
const evalPath = join(root, "skills", "joy", "evals", "evals.json");
const pluginPath = join(root, ".claude-plugin", "plugin.json");
const marketplacePath = join(root, ".claude-plugin", "marketplace.json");
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    errors.push(`${relative(root, path)}: ${error.message}`);
    return "";
  }
}

function readJson(path) {
  try {
    return JSON.parse(read(path));
  } catch (error) {
    errors.push(`${relative(root, path)}: invalid JSON: ${error.message}`);
    return null;
  }
}

function filesUnder(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === ".git") return [];
    const child = join(path, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

function parseFrontmatter(text) {
  check(text.startsWith("---\n"), "skills/joy/SKILL.md: frontmatter must start on the first line");
  const end = text.indexOf("\n---\n", 4);
  check(end >= 0, "skills/joy/SKILL.md: closing frontmatter delimiter is missing");
  if (end < 0) return { fields: new Map(), body: "" };

  const fields = new Map();
  for (const line of text.slice(4, end).split("\n")) {
    const match = line.match(/^([a-z][a-z0-9-]*):\s+(.+)$/);
    check(Boolean(match), `skills/joy/SKILL.md: unsupported frontmatter line: ${line}`);
    if (!match) continue;
    check(!fields.has(match[1]), `skills/joy/SKILL.md: duplicate frontmatter field ${match[1]}`);
    fields.set(match[1], match[2]);
  }
  return { fields, body: text.slice(end + 5) };
}

const requiredFiles = [
  "README.md",
  "LICENSE",
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".github/workflows/ci.yml",
  "skills/joy/SKILL.md",
  "skills/joy/evals/evals.json",
  "assets/joy.svg",
  "scripts/validate.mjs"
];
for (const path of requiredFiles) {
  check(existsSync(join(root, path)), `${path}: required file is missing`);
}

const allFiles = filesUnder(root);
const skillFiles = allFiles.filter((path) => path.endsWith("/SKILL.md"));
check(skillFiles.length === 1, `expected one canonical SKILL.md, found ${skillFiles.length}`);
check(skillFiles[0] === skillPath, "canonical skill must be skills/joy/SKILL.md");

const skill = read(skillPath);
const readme = read(readmePath);
const { fields, body } = parseFrontmatter(skill);
const allowedFrontmatter = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools"
]);
for (const key of fields.keys()) {
  check(allowedFrontmatter.has(key), `skills/joy/SKILL.md: ${key} is not in the Agent Skills standard`);
}
for (const key of ["name", "description"]) {
  check(fields.has(key), `skills/joy/SKILL.md: required ${key} field is missing`);
}
check(fields.get("name") === "joy", "skill name must be joy");
check(/^([a-z0-9]+-)*[a-z0-9]+$/.test(fields.get("name") ?? ""), "skill name is not valid kebab-case");
check(fields.get("name") === dirname(skillPath).split("/").at(-1), "skill name must match its parent directory");
check((fields.get("description")?.length ?? 0) <= 1024, "skill description exceeds 1024 characters");
check((fields.get("compatibility")?.length ?? 0) <= 500, "skill compatibility exceeds 500 characters");
check(fields.get("license") === "MIT", "skill license must be MIT");
check(skill.split("\n").length <= 500, "SKILL.md must remain at or below 500 lines");

const discoveryTerms = [
  "preserve joy",
  "pair programming",
  "learning without receiving the full solution",
  "retaining authorship",
  "choosing what to delegate",
  "comprehension debt",
  "tidying a codebase",
  "Keep, Pair, and Delegate",
  "pair, learn, craft, ship, and tidy",
  "substantial or ambiguous programming task",
  "skip trivial tasks"
];
for (const term of discoveryTerms) {
  check(fields.get("description")?.includes(term), `skill description is missing discovery trigger: ${term}`);
}

const modes = ["pair", "learn", "craft", "ship", "tidy", "off"];
for (const mode of modes) {
  check(body.includes(`### \`${mode}\``), `SKILL.md is missing the ${mode} mode section`);
  check(readme.includes(`\`${mode}\``), `README.md is missing the ${mode} mode`);
  check(readme.includes(`/joy ${mode}`), `README.md does not document /joy ${mode}`);
}
check(body.includes("$ARGUMENTS"), "SKILL.md must consume invocation arguments");
check(readme.includes("/joy:joy pair"), "README.md must document the guaranteed plugin invocation");
check(readme.includes("/plugin marketplace add JGalego/Joy"), "README.md must document the GitHub marketplace command");
check(readme.includes("/plugin install joy@joy"), "README.md must document plugin installation");
check(readme.includes("actions/workflows/ci.yml/badge.svg"), "README.md must display the CI badge");
check(readme.includes("license-MIT-blue.svg"), "README.md must display the MIT badge");

for (const term of ["**Keep**", "**Pair**", "**Delegate**", "**Refine**", "**Let go**"]) {
  check(skill.includes(term), `SKILL.md is missing required terminology: ${term}`);
}
check(!/\bRelease\b/.test(skill + readme), "deprecated category label Release must not be used");

const plugin = readJson(pluginPath);
if (plugin) {
  check(plugin.name === "joy", "plugin name must be joy");
  check(plugin.displayName === "Joy", "plugin displayName must be Joy");
  check(/^\d+\.\d+\.\d+$/.test(plugin.version ?? ""), "plugin version must use semantic versioning");
  check(plugin.author?.name === "Joy contributors", "plugin author must identify Joy contributors");
  check(plugin.license === "MIT", "plugin license must be MIT");
}

const marketplace = readJson(marketplacePath);
if (marketplace) {
  check(marketplace.name === "joy", "marketplace name must be joy");
  check(marketplace.owner?.name === plugin?.author?.name, "marketplace owner must match the plugin author");
  check(Array.isArray(marketplace.plugins) && marketplace.plugins.length === 1, "marketplace must expose exactly one plugin");
  const entry = marketplace.plugins?.[0];
  check(entry?.name === "joy", "marketplace plugin name must be joy");
  check(entry?.source === "./", "marketplace plugin must use the repository root as its source");
}

const logo = read(join(root, "assets", "joy.svg"));
check(logo.startsWith("<svg "), "assets/joy.svg: expected an SVG document");
check(logo.includes('viewBox="0 0 512 512"'), "assets/joy.svg: expected a square 512-unit viewBox");
check(logo.includes('fill="#ffffff"'), "assets/joy.svg: expected an explicit white background");
check(!/<(?:text|script|image|foreignObject)\b/i.test(logo), "assets/joy.svg: text, scripts, and external images are not allowed");
check(readme.includes('src="assets/joy.svg"'), "README.md must display the Joy logo");

const evaluations = readJson(evalPath);
if (evaluations) {
  check(evaluations.skill_name === "joy", "evaluation skill_name must be joy");
  check(Array.isArray(evaluations.evals), "evaluations must contain an evals array");
  const ids = new Set();
  for (const evaluation of evaluations.evals ?? []) {
    check(Number.isInteger(evaluation.id), "every evaluation id must be an integer");
    check(!ids.has(evaluation.id), `duplicate evaluation id ${evaluation.id}`);
    ids.add(evaluation.id);
    check(typeof evaluation.prompt === "string" && evaluation.prompt.length > 0, `evaluation ${evaluation.id} needs a prompt`);
    check(typeof evaluation.expected_output === "string" && evaluation.expected_output.length > 0, `evaluation ${evaluation.id} needs expected_output`);
    check(Array.isArray(evaluation.assertions) && evaluation.assertions.length >= 2, `evaluation ${evaluation.id} needs at least two assertions`);
  }
  for (let id = 1; id <= 20; id += 1) {
    check(ids.has(id), `required behavioral evaluation ${id} is missing`);
  }

  const corpus = JSON.stringify(evaluations).toLowerCase();
  const coverageTerms = [
    "protected",
    "graduated hints",
    "ownership question",
    "trivial",
    "destructive",
    "comprehension",
    "concise",
    "guilt",
    "unsupported command",
    "mode",
    "keep",
    "pair",
    "delegate",
    "unsolicited",
    "speculative"
  ];
  for (const term of coverageTerms) {
    check(corpus.includes(term), `evaluation corpus is missing coverage for ${term}`);
  }
}

for (const path of allFiles.filter((file) => file.endsWith(".md"))) {
  const source = read(path);
  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of source.matchAll(linkPattern)) {
    const target = match[1].trim().replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const local = decodeURIComponent(target.split("#", 1)[0].split("?", 1)[0]);
    check(existsSync(resolve(dirname(path), local)), `${relative(root, path)}: broken internal link ${target}`);
  }
}

const textFiles = allFiles.filter((path) => statSync(path).isFile());
const placeholderFragments = [
  "TO" + "DO",
  "FIX" + "ME",
  "PLACE" + "HOLDER",
  "OWN" + "ER/repo",
  "<own" + "er>",
  "T" + "KTK"
];
for (const path of textFiles) {
  const source = read(path);
  check(!source.includes("\r\n"), `${relative(root, path)}: use LF line endings`);
  if (path === fileURLToPath(import.meta.url)) continue;
  for (const fragment of placeholderFragments) {
    check(!source.includes(fragment), `${relative(root, path)}: contains publication placeholder ${fragment}`);
  }
}

if (errors.length > 0) {
  console.error(`Validation failed with ${errors.length} issue${errors.length === 1 ? "" : "s"}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validation passed: ${allFiles.length} files, one canonical skill, ${evaluations?.evals?.length ?? 0} behavioral evaluations.`);
