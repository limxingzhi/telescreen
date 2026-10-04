import { readFileSync } from "node:fs";

const DOCKERFILE = "/root/telescreen/Dockerfile";

const ARG_REPOS: Record<string, string> = {
  NVIM_VERSION: "neovim/neovim",
  LAZYGIT_VERSION: "jesseduffield/lazygit",
  CRUSH_VERSION: "charmbracelet/crush",
  GLOW_VERSION: "charmbracelet/glow",
  TAILSCALE_VERSION: "tailscale/tailscale",
};

// Tools installed from a distro package repo rather than GitHub releases.
// The GitHub tag lands before the packages are published, so the repo index
// is the only source that reflects what the Dockerfile can actually install.
const APT_INDEXES: Record<string, string[]> = {
  TAILSCALE_VERSION: [
    "https://pkgs.tailscale.com/stable/debian/dists/bookworm/main/binary-amd64/Packages",
    "https://pkgs.tailscale.com/stable/debian/dists/bookworm/main/binary-arm64/Packages",
  ],
};

const ALIASES: Record<string, string> = {
  nvim: "NVIM_VERSION",
  neovim: "NVIM_VERSION",
  lazygit: "LAZYGIT_VERSION",
  crush: "CRUSH_VERSION",
  glow: "GLOW_VERSION",
  tailscale: "TAILSCALE_VERSION",
};

function resolveTargets(args: string[]): string[] {
  const targets = new Set<string>();
  for (const arg of args) {
    const key = arg.toLowerCase();
    if (key === "all") return Object.keys(ARG_REPOS);
    const mapped = ALIASES[key];
    if (!mapped) {
      console.error(`unknown tool: ${arg}`);
      console.error("usage: check-versions {neovim|lazygit|crush|glow|tailscale|all}");
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

function parseAptVersions(index: string): Set<string> {
  return new Set([...index.matchAll(/^Version: (.+)$/gm)].map((m) => m[1].trim()));
}

function versionParts(version: string): number[] {
  return version
    .replace(/^v/, "")
    .split(/[^0-9]+/)
    .filter((part) => part.length > 0)
    .map(Number);
}

function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Newest version published for every architecture the image targets.
async function fetchLatestPublished(indexes: string[]): Promise<string> {
  const lists = await Promise.all(
    indexes.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
      return parseAptVersions(await res.text());
    }),
  );

  const published = [...lists[0]].filter((version) => lists.every((set) => set.has(version)));
  if (published.length === 0) throw new Error(`no versions published for all architectures in ${indexes[0]}`);
  return published.reduce((newest, version) => (compareVersions(version, newest) > 0 ? version : newest));
}

type Latest = { version: string; note?: string };

async function fetchLatestVersion(argName: string): Promise<Latest> {
  const indexes = APT_INDEXES[argName];
  if (!indexes) return { version: await fetchLatestTag(ARG_REPOS[argName]) };

  const version = await fetchLatestPublished(indexes);

  let note: string | undefined;
  try {
    const tag = await fetchLatestTag(ARG_REPOS[argName]);
    if (compareVersions(tag, version) > 0) note = `${tag} released but not in apt repo yet`;
  } catch {
    // Release check is advisory only.
  }

  return { version, note };
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
    const pinned = getPinned(argName);
    const { version: latest, note } = await fetchLatestVersion(argName);
    const suffix = note ? ` (${note})` : "";

    if (compareVersions(pinned, latest) === 0) {
      console.log(`\u2713 ${argName.padEnd(18)} ${pinned}${suffix}`);
    } else {
      console.log(`\u2191 ${argName.padEnd(18)} ${pinned} \u2192 ${latest}${suffix}`);
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
