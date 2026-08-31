import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = "/root/telescreen";
const SKILLS_DIR = join(REPO_ROOT, "skills");
const CACHE_DIR = "/tmp/skill-upstream";

const SOURCE_RE = /github\.com\/([^/]+)\/([^/]+)\/tree\/[^/\s)]+(\/[^\s)]+)?/;

interface Upstream {
  repo: string;
  path: string;
}

function parseSource(skillDir: string): Upstream | null {
  const content = readFileSync(join(skillDir, "SKILL.md"), "utf-8");
  const match = content.match(SOURCE_RE);
  if (!match) return null;
  return { repo: `${match[1]}/${match[2]}`, path: (match[3] ?? "").replace(/^\//, "") };
}

function cloneRepo(repo: string): string | null {
  const [owner, name] = repo.split("/");
  const dir = join(CACHE_DIR, `${owner}-${name}`);
  if (!existsSync(join(dir, ".git"))) {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(CACHE_DIR, { recursive: true });
    try {
      execSync(`git clone --depth 1 https://github.com/${repo}.git "${dir}"`, { stdio: "pipe" });
    } catch {
      return null;
    }
  } else {
    try {
      execSync(`git -C "${dir}" fetch --depth 1 origin && git -C "${dir}" reset --hard FETCH_HEAD`, { stdio: "pipe" });
    } catch {
      /* keep the cached copy */
    }
  }
  return dir;
}

function diffAgainst(upstreamDir: string, localDir: string): string[] {
  try {
    execSync(`diff -rq "${localDir}" "${upstreamDir}"`, { stdio: ["ignore", "pipe", "pipe"] });
    return [];
  } catch (err) {
    const stdout = (err as { stdout?: string | Buffer }).stdout ?? "";
    return String(stdout)
      .split("\n")
      .filter((line) => line && !/agents/.test(line));
  }
}

function upstreamFiles(dir: string): string[] {
  const files: string[] = [];
  const walk = (base: string, rel = "") => {
    for (const entry of readdirSync(base)) {
      if (entry === "agents") continue;
      const full = join(base, entry);
      const relPath = rel ? `${rel}/${entry}` : entry;
      if (statSync(full).isDirectory()) walk(full, relPath);
      else files.push(relPath);
    }
  };
  walk(dir);
  return files;
}

function isStub(skillMdPath: string): boolean {
  const content = readFileSync(skillMdPath, "utf-8");
  const body = content.replace(/^---[\s\S]*?---\n?/, "").trim();
  return body.length < 120;
}

function main() {
  const args = process.argv.slice(2);
  const filter = args.find((arg) => !arg.startsWith("--")) ?? "all";
  const apply = args.includes("--apply");
  const force = args.includes("--force");

  const skills = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(SKILLS_DIR, entry.name, "SKILL.md")))
    .map((entry) => entry.name);

  const targets = filter === "all" ? skills : [filter];
  const unknown = targets.filter((name) => !skills.includes(name));
  if (unknown.length > 0) {
    console.error(`unknown skill: ${unknown.join(", ")}`);
    console.error(`known skills: ${skills.join(", ")}`);
    process.exit(1);
  }

  const clones = new Map<string, string | null>();
  let anyDiff = false;

  for (const name of targets) {
    const localDir = join(SKILLS_DIR, name);
    const upstream = parseSource(localDir);
    if (!upstream) {
      console.log(`? ${name.padEnd(18)} no upstream source tracked`);
      continue;
    }
    if (!clones.has(upstream.repo)) clones.set(upstream.repo, cloneRepo(upstream.repo));
    const cloneDir = clones.get(upstream.repo) ?? null;
    if (!cloneDir) {
      console.log(`! ${name.padEnd(18)} failed to fetch ${upstream.repo}`);
      continue;
    }
    const upstreamDir = join(cloneDir, upstream.path);
    if (!existsSync(upstreamDir)) {
      console.log(`! ${name.padEnd(18)} upstream path missing: ${upstream.path}`);
      continue;
    }

    const diffs = diffAgainst(upstreamDir, localDir);
    if (diffs.length === 0) {
      console.log(`\u2713 ${name.padEnd(18)} current`);
      continue;
    }

    anyDiff = true;
    console.log(`\u2191 ${name.padEnd(18)} ${diffs.length} file(s) differ`);
    for (const line of diffs) console.log(`    ${line.trim()}`);

    if (!apply) continue;

    const upstreamSkillMd = join(upstreamDir, "SKILL.md");
    if (existsSync(upstreamSkillMd) && isStub(upstreamSkillMd) && !force) {
      console.log("    skipped: upstream SKILL.md is a stub (content moved to packaging); pass --force to override");
      continue;
    }
    for (const rel of upstreamFiles(upstreamDir)) {
      const src = join(upstreamDir, rel);
      const dst = join(localDir, rel);
      const dirName = rel.includes("/") ? rel.split("/").slice(0, -1).join("/") : "";
      if (dirName) mkdirSync(join(localDir, dirName), { recursive: true });
      cpSync(src, dst);
      console.log(`    applied ${rel}`);
    }
  }

  if (apply) {
    console.log("\nupstream files applied: re-apply local conventions per SKILL.md (frontmatter, Source line, custom names and paths)");
  } else if (anyDiff) {
    console.log("\noutdated skills found: re-run with --apply for a skill, then restore local conventions");
  }
}

main();
