# MCP Recommendations for Telescreen

Researched MCPs that enhance the telescreen dev environment. Each doc below contains transport config, prerequisites, and rationale.

## Priority ranking

| # | MCP | Transport | Install needed? | API key? | Value |
|---|-----|-----------|-----------------|----------|-------|
| 1 | [GitHub](./02-mcp-github.md) | `http` | No | `GH_PAT` | **High** -- full GitHub workflow inside Crush |
| 2 | [Context7](./03-mcp-context7.md) | `http` | No | No | **High** -- eliminates stale-doc hallucinations |
| 3 | [Memory](./04-mcp-memory.md) | `stdio` (npx) | No (Node in container) | No | **High** -- persistent cross-session memory via home volume |
| 4 | [Git](./05-mcp-git.md) | `stdio` (npx) | No (Node in container) | No | **Medium** -- structured git ops, complements lazygit |
| 5 | [Sequential Thinking](./06-mcp-sequential-thinking.md) | `stdio` (npx) | No (Node in container) | No | **Medium** -- formal reasoning for complex debugging |
| 6 | [Fetch](./07-mcp-fetch.md) | `stdio` (npx) | No (Node in container) | No | **Low** -- largely redundant with Crush built-in fetch |

## Suggested minimal config

Add to `crush/crush.json` under the `"mcp"` key:

```json
{
  "mcp": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer $GH_PAT"
      }
    },
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp"
    },
    "memory": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

Then pass `GH_PAT` at runtime:

```sh
docker run -it --rm -v dev-env-home:/root -e GH_PAT=ghp_xxxxx dev-env
```

## Notes

- HTTP transports are preferred for the container (zero install, no runtime deps)
- All `npx`-based servers work since Node.js 24 is pre-installed
- Secrets use env vars (`$GH_PAT`) per the project's no-hardcoded-secrets rule
- `stdio` MCP servers add startup latency; HTTP servers start instantly
