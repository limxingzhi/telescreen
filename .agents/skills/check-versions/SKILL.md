---
name: check-versions
description: Check for newer upstream releases of pinned tools (Neovim, Lazygit, Crush, Glow, Tailscale) and bump the ARG versions in Dockerfile. Only applies to the telescreen repo.
user-invocable: true
argument-hint: "Tool to check (neovim, lazygit, crush, glow, tailscale) or 'all'"
---

Run when the user asks to check for tool updates, bump versions, or update pinned packages in this repo.

## Tools tracked

| ARG | Source |
|-----|--------|
| `NVIM_VERSION` | neovim/neovim |
| `LAZYGIT_VERSION` | jesseduffield/lazygit |
| `CRUSH_VERSION` | charmbracelet/crush |
| `GLOW_VERSION` | charmbracelet/glow |
| `TAILSCALE_VERSION` | `pkgs.tailscale.com` Debian apt index |

Tailscale is the exception. The Dockerfile installs it with `apt-get install tailscale=<version>` from the Tailscale apt repo, so the GitHub release tag is not necessarily a version apt can install. The script reads the apt `Packages` index instead, and prints `not in apt repo yet` when a release has no `.deb` published. Do not bump `TAILSCALE_VERSION` past the version the script reports as installable.

## Procedure

1. Run the bundled script to check all tools:
   ```
   tsx .agents/skills/check-versions/check-versions.ts all
   ```

   Or check a single tool:
   ```
   tsx .agents/skills/check-versions/check-versions.ts neovim
   ```

   Or check all including tailscale:
   ```
   tsx .agents/skills/check-versions/check-versions.ts all
   ```

   The script resolves the latest installable version for each tool and compares it against the ARG pinned in the Dockerfile. Results go to stdout. Outdated tools are marked with `↑` and current ones with `✓`.

   Report the exact pinned and available versions to the user instead of picking the highest tag. The check is only as good as the source it reads.

2. If any tool is outdated, update the corresponding ARG line(s) in `/root/telescreen/Dockerfile` using `edit`.

3. Run `docker build -t telescreen .` to verify the image builds with the new version.
