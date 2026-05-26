---
name: check-versions
description: Check for newer upstream releases of pinned tools (Neovim, Lazygit, Crush, Glow) and bump the ARG versions in Dockerfile. Only applies to the telescreen repo.
user-invocable: true
argument-hint: "Tool to check (neovim, lazygit, crush, glow) or 'all'"
---

Run when the user asks to check for tool updates, bump versions, or update pinned packages in this repo.

## Tools tracked

| ARG | Repo |
|-----|------|
| `NVIM_VERSION` | neovim/neovim |
| `LAZYGIT_VERSION` | jesseduffield/lazygit |
| `CRUSH_VERSION` | charmbracelet/crush |
| `GLOW_VERSION` | charmbracelet/glow |

## Procedure

1. For the requested tool(s), fetch the latest release tag from GitHub API:
   ```
   https://api.github.com/repos/{owner}/{repo}/releases/latest
   ```
   Extract `tag_name` from the JSON response.

2. Read the current pinned version from the Dockerfile ARG at `/root/telescreen/Dockerfile`.

3. If the latest version differs from the pinned version, update the ARG line in the Dockerfile.

4. Run `docker build -t telescreen .` to verify the image builds with the new version.

5. Report what changed.
