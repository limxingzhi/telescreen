# Memory MCP Server

Knowledge-graph-based persistent memory for LLM agents. Stores entities and relationships as JSON, survives container restarts via the home volume.

## Why it fits telescreen

The container uses a persistent Docker volume (`dev-env-home`) for `/root`. Crush can use this MCP to remember project decisions, conventions, architecture notes, and user preferences across sessions -- not just within a single conversation.

## Transport

`stdio` (npx)

## Config

```json
{
  "memory": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-memory"]
  }
}
```

Requires Node.js (already installed in container).

## Tools

| Tool | Description |
|------|-------------|
| `create_entities` | Create multiple new entities in the knowledge graph |
| `create_relations` | Create relations between entities |
| `add_observations` | Add observations to existing entities |
| `delete_entities` | Delete entities from the graph |
| `delete_observations` | Delete specific observations from entities |
| `delete_relations` | Delete relations from the graph |
| `read_graph` | Read the entire knowledge graph |
| `search_nodes` | Search nodes by query (matches names, types, observations) |
| `open_nodes` | Read specific nodes by name |

## Data persistence

The memory graph is stored as a JSON file in the container filesystem. Since `/root` is backed by the `dev-env-home` volume, memories persist across `docker run` invocations.

To persist in a known location:

```json
{
  "memory": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-memory"],
    "env": {
      "MEMORY_FILE_PATH": "/root/.config/mcp/memory.json"
    }
  }
}
```

## Example use cases

- "Remember that this project uses pnpm, not npm"
- "Save that the API base URL is `https://api.example.com/v2`"
- "Recall what we decided about the auth flow last session"
- "Store the database schema conventions for this project"

## Source

- [modelcontextprotocol/servers - memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)
- Package: `@modelcontextprotocol/server-memory`
- License: MIT
