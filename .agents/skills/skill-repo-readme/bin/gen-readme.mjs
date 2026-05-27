#!/usr/bin/env node
// gen-readme.mjs — scan a skill repo's .agents/skills/*/SKILL.md and emit a
// README.md skeleton: title, skills table, install section (npx + curl), layout.
//
// Zero dependencies (Node stdlib only). Deterministic: the same tree always
// produces the same output, so it is safe to re-run and diff.
//
//   node bin/gen-readme.mjs              # write ./README.md (refuses to clobber
//                                        #   a hand-written one unless --force)
//   node bin/gen-readme.mjs --dry-run    # print to stdout, write nothing
//   node bin/gen-readme.mjs --check      # exit 1 if README.md is out of date
//   node bin/gen-readme.mjs --force      # overwrite README.md
//   node bin/gen-readme.mjs --include-ignored   # also list git-ignored skills
//   node bin/gen-readme.mjs /path/to/repo --dry-run   # operate on another root
//
// By default, skills whose directory is git-ignored are skipped — the README
// documents only the skills this repo actually tracks, not vendored/locked ones
// re-fetched from elsewhere. Pass --include-ignored to list every skill.
//
// The generated README is a *baseline*. The intro paragraph and any per-skill
// wording are placeholders the calling agent is expected to refine — see SKILL.md.

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";

const MARKER = "<!-- gen-readme:auto -->"; // sentinel marking generator-owned output

function parseArgs(argv) {
  const flags = new Set();
  let root = null;
  for (const a of argv.slice(2)) {
    if (a.startsWith("--")) flags.add(a);
    else if (!root) root = a;
  }
  return { root, flags };
}

function repoRoot(explicit) {
  if (explicit) return explicit;
  try {
    return execSync("git rev-parse --show-toplevel", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return process.cwd();
  }
}

// Derive "owner/repo" from the origin remote, falling back to the dir name.
function repoSlug(root) {
  try {
    const url = execSync("git remote get-url origin", {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    const m = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
    if (m) return m[1];
  } catch {
    /* no remote */
  }
  return `OWNER/${basename(root)}`;
}

// Parse the first --- frontmatter block. Handles single-line `key: value` and
// folded continuation lines (subsequent indented lines append to the value).
function frontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0].trim() !== "---") return {};
  const out = {};
  let key = null;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") break;
    const m = line.match(/^([A-Za-z0-9_-]+):\s?(.*)$/);
    if (m) {
      key = m[1];
      out[key] = m[2];
    } else if (key && /^\s+\S/.test(line)) {
      out[key] += " " + line.trim();
    }
  }
  return out;
}

// Return the subset of `paths` that git ignores, as a Set of the input strings.
// Uses a single `git check-ignore --stdin` call. If git is unavailable or this
// isn't a repo, nothing is reported ignored (we can't tell, so include all).
function gitIgnored(root, paths) {
  if (paths.length === 0) return new Set();
  const res = spawnSync("git", ["check-ignore", "--stdin"], {
    cwd: root,
    input: paths.join("\n"),
    encoding: "utf8",
  });
  // exit 0 = some ignored, 1 = none ignored, >1 = error (treat as none).
  if (res.error || res.status > 1) return new Set();
  const ignored = res.stdout.split(/\r?\n/).filter(Boolean);
  return new Set(ignored);
}

function discoverSkills(root, { includeIgnored = false } = {}) {
  const dir = join(root, ".agents", "skills");
  if (!existsSync(dir)) return [];

  // Collect candidate skill dirs that contain a SKILL.md.
  const candidates = [];
  for (const name of readdirSync(dir).sort()) {
    const skillDir = join(dir, name);
    const skillMd = join(skillDir, "SKILL.md");
    if (!existsSync(skillMd) || !statSync(skillMd).isFile()) continue;
    candidates.push({ name, skillDir, skillMd });
  }

  // Filter out git-ignored skill dirs unless the caller opts in. Match on the
  // directory (so an ignored skill is dropped whole, regardless of inner files).
  const ignored = includeIgnored
    ? new Set()
    : gitIgnored(root, candidates.map((c) => relative(root, c.skillDir)));

  const skills = [];
  for (const c of candidates) {
    if (ignored.has(relative(root, c.skillDir))) continue;
    const fm = frontmatter(readFileSync(c.skillMd, "utf8"));
    skills.push({
      name: fm.name || c.name,
      description: (fm.description || "").trim(),
      relPath: `.agents/skills/${c.name}/SKILL.md`,
    });
  }
  return skills;
}

// Collapse a long description to the first sentence for the table cell.
function firstSentence(desc) {
  if (!desc) return "_no description_";
  const cut = desc.search(/\.\s/);
  return cut === -1 ? desc : desc.slice(0, cut + 1);
}

function render(root, slug, skills) {
  const title = basename(root);
  const hasInstall = existsSync(join(root, "install.sh"));
  const lines = [];

  lines.push(MARKER);
  lines.push(`# ${title}`, "");
  lines.push(
    "<!-- TODO(agent): replace this paragraph with a real description of what this repo is. -->",
    `A collection of [agentskills.io](https://agentskills.io) skills for Claude Code. ` +
      `Each skill lives under \`.agents/skills/<name>/\` and is mirrored into ` +
      `\`.claude/skills/<name>\` as a relative symlink so the harness auto-discovers it.`,
    "",
  );

  lines.push("## Skills", "");
  if (skills.length === 0) {
    lines.push("_No skills found under `.agents/skills/`._", "");
  } else {
    lines.push("| Skill | What it does |", "|-------|--------------|");
    for (const s of skills) {
      lines.push(`| [\`${s.name}\`](${s.relPath}) | ${firstSentence(s.description)} |`);
    }
    lines.push("");
  }

  lines.push("## Install", "");
  lines.push("### Per skill — `npx skills add`", "");
  lines.push("Install any single skill into Claude Code:", "");
  const example = skills[0]?.name || "<skill-name>";
  lines.push("```bash", `npx skills add ${slug} \\`, `  --skill ${example} -a claude-code`, "```", "");
  if (skills.length > 1) {
    lines.push("Swap `--skill` for any name from the table above.", "");
  }

  lines.push("### One-shot install via `curl`", "");
  if (hasInstall) {
    const raw = `https://raw.githubusercontent.com/${slug}/main/install.sh`;
    lines.push("```bash", `curl -fsSL ${raw} | bash`, "```", "");
    lines.push("Preview only — change nothing:", "");
    lines.push("```bash", `curl -fsSL ${raw} | bash -s -- --dry-run`, "```", "");
  } else {
    lines.push(
      "<!-- TODO(agent): no root install.sh found. Point curl at the bootstrap installer " +
        "that links skills (e.g. the claude-symlink-agent-individual-skills install.sh), or " +
        "add an install.sh to this repo root. -->",
      "",
    );
  }

  lines.push("## Layout", "");
  lines.push(
    "```",
    ".agents/skills/<name>/SKILL.md                          # source of truth for each skill",
    ".claude/skills/<name> -> ../../.agents/skills/<name>    # relative symlink (harness-discovered)",
    "```",
    "",
  );

  return lines.join("\n");
}

function main() {
  const { root: rootArg, flags } = parseArgs(process.argv);
  const root = repoRoot(rootArg);
  const slug = repoSlug(root);
  const skills = discoverSkills(root, { includeIgnored: flags.has("--include-ignored") });
  const content = render(root, slug, skills) + "\n";
  const readme = join(root, "README.md");

  if (flags.has("--dry-run")) {
    process.stdout.write(content);
    return;
  }

  if (flags.has("--check")) {
    const current = existsSync(readme) ? readFileSync(readme, "utf8") : "";
    if (current.trim() === content.trim()) {
      console.log("README.md is up to date.");
      process.exit(0);
    }
    console.error("README.md is out of date. Run: node bin/gen-readme.mjs --force");
    process.exit(1);
  }

  // Default write: refuse to clobber a hand-authored README (one without our
  // marker) unless --force is given.
  if (existsSync(readme)) {
    const current = readFileSync(readme, "utf8");
    if (!current.includes(MARKER) && !flags.has("--force")) {
      console.error(
        `Refusing to overwrite ${readme}: it has no ${MARKER} marker (looks hand-written).\n` +
          "Re-run with --force to overwrite, or --dry-run to preview.",
      );
      process.exit(1);
    }
  }
  writeFileSync(readme, content);
  console.log(`Wrote ${readme} (${skills.length} skill${skills.length === 1 ? "" : "s"}).`);
}

main();
