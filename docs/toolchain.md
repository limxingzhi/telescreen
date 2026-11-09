# Toolchain and script conventions

## What ships in the image

Base is `node:26-bookworm` with: neovim, tmux (+ TPM and tmux-yank), lazygit,
TypeScript, starship, Crush, Glow, htop, and Tailscale for SSH. Neovim's config
is fetched from a Gist at first start (fallback: `/etc/nvim/init.lua`).

Versions of the pinned tools (Neovim, lazygit, Crush, Glow, Tailscale, starship)
live as `ARG`s in the `Dockerfile`; check for upstream releases with the
`check-versions` skill.

## Build and run

| Action | Command |
|--------|---------|
| Build | `docker build -t telescreen .` |
| Run | `docker run -it --rm telescreen` |
| Persistent home | `docker run -it --rm -v dev-env-home:/root telescreen` |
| Timezone | `-e TZ=America/New_York` |
| Crush | `-e ZAI_API_KEY=your-key` |
| Multi-arch | `docker buildx build --platform linux/amd64,linux/arm64 -t telescreen .` |

Tailscale SSH needs three things that Docker cannot grant on its own:

```sh
docker run -it --rm \
  --cap-add=NET_ADMIN --device /dev/net/tun \
  -v tailscale-state:/var/lib/tailscale \
  -e TS_AUTHKEY=tskey-auth-xxx -e TS_HOSTNAME=my-dev-env \
  telescreen
```

plus an ACL policy in the Tailscale admin console allowing SSH.

## Testing

There is no lint step and no test framework. Verify changes with `docker build`
and, where the change is exercised by a test file, run it directly:

```sh
node --test scripts/test-crush-notify.js
```

Tests sit next to their script (`foo.js` + `foo.test.js`) and use `node --test`.

## Language rules

Prefer JavaScript for scripts. New scripts under `scripts/`, `crush/`, and
`.agents/skills/` are `.js` run with `node`; ESM is fine, and `check-versions.ts`
already runs via `tsx`, so existing `.ts` stays as is.

Shell stays for shell config (`zshrc`, `entrypoint.sh`, `init.zsh`,
`tmux/*.sh`) and line-level glue such as a `precmd` hook calling a script.

Do not add Python: the runtime already ships Node 26 and the repo has no Python
tooling.
