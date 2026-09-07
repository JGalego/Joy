#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = join(root, "skills", "joy", "SKILL.md");
const readmePath = join(root, "README.md");
const evalPath = join(root, "skills", "joy", "evals", "evals.json");
const pluginPath = join(root, ".claude-plugin", "plugin.json");
const marketplacePath = join(root, ".claude-plugin", "marketplace.json");
const justfilePath = join(root, "justfile");
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

function readBytes(path) {
  try {
    return readFileSync(path);
  } catch (error) {
    errors.push(`${relative(root, path)}: ${error.message}`);
    return Buffer.alloc(0);
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
  "assets/ownership.svg",
  "assets/claude.gif",
  "assets/copilot.gif",
  "assets/claude.tape",
  "assets/copilot.tape",
  "justfile",
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
const justfile = read(justfilePath);
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
check(readme.includes("[justfile](justfile)"), "README.md must document the justfile");

for (const recipe of ["default", "validate", "validate-claude", "discover", "check", "demo", "demo-claude", "demo-copilot", "run"]) {
  check(new RegExp(`^${recipe}:`, "m").test(justfile), `justfile is missing the ${recipe} recipe`);
}

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

const ownership = read(join(root, "assets", "ownership.svg"));
check(ownership.startsWith("<svg "), "assets/ownership.svg: expected an SVG document");
check(ownership.includes('width="1200" height="360" viewBox="0 0 1200 360"'), "assets/ownership.svg: expected 1200×360 intrinsic dimensions and viewBox");
check(ownership.includes("<title ") && ownership.includes("<desc "), "assets/ownership.svg: expected accessible title and description");
for (const term of ["KEEP", "PAIR", "DELEGATE", "THE BOUNDARY MOVES WITH YOU"]) {
  check(ownership.includes(term), `assets/ownership.svg: missing ${term}`);
}
check(!ownership.includes("Which part do you want to remain yours?"), "assets/ownership.svg: do not repeat the ownership question");
for (const position of ["translate(24 28)", "translate(416 28)", "translate(808 28)"]) {
  check(ownership.includes(position), `assets/ownership.svg: missing centered card position ${position}`);
}
check(!/<(?:script|image|foreignObject)\b/i.test(ownership), "assets/ownership.svg: scripts and external content are not allowed");
check(readme.includes('src="assets/ownership.svg"'), "README.md must display the ownership boundary visual");

const claudeTape = read(join(root, "assets", "claude.tape"));
const copilotTape = read(join(root, "assets", "copilot.tape"));
const claudeDemo = readBytes(join(root, "assets", "claude.gif"));
const copilotDemo = readBytes(join(root, "assets", "copilot.gif"));
check(["GIF87a", "GIF89a"].includes(claudeDemo.subarray(0, 6).toString("ascii")), "assets/claude.gif: expected a valid GIF header");
check(claudeDemo.length < 5_000_000, "assets/claude.gif: keep the demo below 5 MB");
check(["GIF87a", "GIF89a"].includes(copilotDemo.subarray(0, 6).toString("ascii")), "assets/copilot.gif: expected a valid GIF header");
check(copilotDemo.length < 5_000_000, "assets/copilot.gif: keep the demo below 5 MB");
check(claudeTape.includes("Output assets/claude.gif"), "assets/claude.tape must render assets/claude.gif");
check(claudeTape.includes("Require claude"), "assets/claude.tape must require Claude Code");
check(claudeTape.includes("/joy:joy pair"), "assets/claude.tape must invoke the Joy plugin in pair mode");
check(claudeTape.includes("stty -echo; clear; claude"), "assets/claude.tape must suppress the terminal handshake without hiding Claude's banner");
check(claudeTape.includes("--disallowedTools"), "assets/claude.tape must prevent tools from changing the repository");
check(!/(?:^|\s)(?:-p|--print)(?:\s|$)/m.test(claudeTape), "assets/claude.tape must record interactive Claude Code, not print mode");
check(!claudeTape.includes("dangerously-skip-permissions"), "assets/claude.tape must not bypass Claude Code permissions");
check(copilotTape.includes("Output assets/copilot.gif"), "assets/copilot.tape must render assets/copilot.gif");
check(copilotTape.includes("Require copilot"), "assets/copilot.tape must require GitHub Copilot CLI");
check(copilotTape.includes("Use the /joy skill in learn mode"), "assets/copilot.tape must invoke Joy in learn mode");
check(copilotTape.includes("--plugin-dir ."), "assets/copilot.tape must load the local plugin");
check(copilotTape.includes("--available-tools="), "assets/copilot.tape must prevent tools from changing the repository");
check(copilotTape.includes("--session-id"), "assets/copilot.tape must isolate each recording session");
check(!/(?:--allow-all|--yolo)\b/.test(copilotTape), "assets/copilot.tape must not bypass Copilot permissions");
check(readme.includes('src="assets/claude.gif"'), "README.md must display the Claude Code demo");
check(readme.includes('src="assets/copilot.gif"'), "README.md must display the Copilot CLI demo");
check(readme.includes("(assets/copilot.tape)"), "README.md must link the Copilot CLI tape");
check(readme.includes("<details open>"), "README.md must open the primary demo by default");
check(readme.includes("<summary><strong>Claude Code</strong>"), "README.md must label the Claude Code demo panel");
check(readme.includes("<summary><strong>GitHub Copilot CLI</strong>"), "README.md must label the Copilot CLI demo panel");
check(readme.includes("<summary><strong>Not sure which mode fits?</strong></summary>"), "README.md must include the interactive mode chooser");

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

const textExtensions = new Set([".json", ".md", ".mjs", ".svg", ".tape", ".yml"]);
const textFiles = allFiles.filter((path) => textExtensions.has(extname(path)) || path === justfilePath);
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
