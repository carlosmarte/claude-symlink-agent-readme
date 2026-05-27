# claude-symlink-agent-readme

Home of the **`skill-repo-readme`** skill — it generates and refreshes the `README.md` for a
skill repository by scanning every `.agents/skills/<name>/SKILL.md`, building the skills table,
and writing the install instructions below.

Skills live under `.agents/skills/<name>/SKILL.md` and are mirrored into `.claude/skills/<name>`
as a **relative symlink** so the Claude Code harness auto-discovers them. This repo also vendors
the `agent-skill-kit-*` toolkit, but those are pulled from upstream and `.gitignore`d (tracked
in [`skills-lock.json`](skills-lock.json)) — so they don't appear below. The table lists only
the skills this repo actually owns; run the generator with `--include-ignored` to list them all.

## Skills

| Skill | What it does |
|-------|--------------|
| [`skill-repo-readme`](.agents/skills/skill-repo-readme/SKILL.md) | Generate or refresh the README.md for a skill repository — one that vendors agentskills.io skills under `.agents/skills/<name>/SKILL.md`. |

## Install

### Per skill — `npx skills add`

Install any single skill into Claude Code:

```bash
npx skills add carlosmarte/claude-symlink-agent-readme \
  --skill skill-repo-readme -a claude-code
```

### One-shot install via `curl`

This repo has no root `install.sh`. Bootstrap the symlink tool — which creates the
`.claude/skills/<name>` links the harness discovers — with the installer published by
[`claude-symlink-agent-individual-skills`](https://github.com/carlosmarte/claude-symlink-agent-individual-skills):

```bash
curl -fsSL https://raw.githubusercontent.com/carlosmarte/claude-symlink-agent-individual-skills/main/install.sh | bash
```

Preview only — change nothing:

```bash
curl -fsSL https://raw.githubusercontent.com/carlosmarte/claude-symlink-agent-individual-skills/main/install.sh | bash -s -- --dry-run
```

## Layout

```
.agents/skills/<name>/SKILL.md                          # source of truth for each skill
.claude/skills/<name> -> ../../.agents/skills/<name>    # relative symlink (harness-discovered)
```

