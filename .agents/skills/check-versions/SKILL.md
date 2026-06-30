---
name: check-versions
description: Check for newer upstream releases of pinned tools (Neovim, Lazygit, Crush, Glow, Tailscale) and bump the ARG versions in Dockerfile. Only applies to the telescreen repo.
user-invocable: true
argument-hint: "Tool to check (neovim, lazygit, crush, glow, tailscale) or 'all'"
---

Run when the user asks to check for tool updates, bump versions, or update pinned packages in this repo.

## Tools tracked

| ARG | Repo |
|-----|------|
| `NVIM_VERSION` | neovim/neovim |
| `LAZYGIT_VERSION` | jesseduffield/lazygit |
| `CRUSH_VERSION` | charmbracelet/crush |
| `GLOW_VERSION` | charmbracelet/glow |
| `TAILSCALE_VERSION` | tailscale/tailscale |

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

   The script fetches the latest release tag from each GitHub repo and compares it against the ARG pinned in the Dockerfile. Results are printed to stdout — outdated tools are marked with `↑` and current ones with `✓`.

2. If any tool is outdated, update the corresponding ARG line(s) in `/root/telescreen/Dockerfile` using `edit`.

3. Run `docker build -t telescreen .` to verify the image builds with the new version.
