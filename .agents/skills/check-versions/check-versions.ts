import { readFileSync } from "node:fs";

const DOCKERFILE = "/root/telescreen/Dockerfile";

const ARG_REPOS: Record<string, string> = {
  NVIM_VERSION: "neovim/neovim",
  LAZYGIT_VERSION: "jesseduffield/lazygit",
  CRUSH_VERSION: "charmbracelet/crush",
  GLOW_VERSION: "charmbracelet/glow",
};

const ALIASES: Record<string, string> = {
  nvim: "NVIM_VERSION",
  neovim: "NVIM_VERSION",
  lazygit: "LAZYGIT_VERSION",
  crush: "CRUSH_VERSION",
  glow: "GLOW_VERSION",
};

function resolveTargets(args: string[]): string[] {
  const targets = new Set<string>();
  for (const arg of args) {
    const key = arg.toLowerCase();
    if (key === "all") return Object.keys(ARG_REPOS);
    const mapped = ALIASES[key];
    if (!mapped) {
      console.error(`unknown tool: ${arg}`);
      console.error("usage: check-versions {neovim|lazygit|crush|glow|all}");
      process.exit(1);
    }
    targets.add(mapped);
  }
  return [...targets];
}

async function fetchLatestTag(repo: string): Promise<string> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
  const data = await res.json() as { tag_name: string };
  return data.tag_name;
}

function getPinned(argName: string): string {
  const re = new RegExp(`^ARG ${argName}=(.+)$`, "m");
  const match = readFileSync(DOCKERFILE, "utf-8").match(re);
  if (!match) throw new Error(`ARG ${argName} not found in ${DOCKERFILE}`);
  return match[1];
}

async function main() {
  const targets = resolveTargets(process.argv.slice(2));
  let anyOutdated = false;

  for (const argName of targets) {
    const repo = ARG_REPOS[argName];
    const pinned = getPinned(argName);
    const latest = await fetchLatestTag(repo);

    if (pinned === latest) {
      console.log(`\u2713 ${argName.padEnd(18)} ${pinned}`);
    } else {
      console.log(`\u2191 ${argName.padEnd(18)} ${pinned} \u2192 ${latest}`);
      anyOutdated = true;
    }
  }

  if (anyOutdated) {
    console.log("\noutdated tools found — update ARG lines in Dockerfile to upgrade");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
