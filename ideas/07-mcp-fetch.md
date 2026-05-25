# Fetch MCP Server

Web content fetching and conversion optimized for LLM consumption.

## Why it fits telescreen

Crush already has built-in `fetch` and `agentic_fetch` tools. This MCP provides an alternative through the standardized MCP protocol with robust HTML-to-markdown conversion. Useful as a complementary tool when the built-in fetch doesn't handle a particular site well.

## Transport

`stdio` (npx)

## Config

```json
{
  "fetch": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-fetch"]
  }
}
```

## Tools

### `fetch`

Fetches a URL and converts the content to markdown.

**Parameters:**
- `url` (string, required) -- The URL to fetch
- `maxLength` (integer, optional) -- Maximum content length (default: 5000)
- `startIndex` (integer, optional) -- Start content at this offset (for pagination)
- `raw` (boolean, optional) -- Return raw HTML without markdown conversion

## Relationship to Crush's built-in fetch

| Feature | Crush built-in `fetch` | MCP Fetch |
|---------|----------------------|-----------|
| HTML to markdown | Yes | Yes |
| AI-powered extraction | Yes (`agentic_fetch`) | No |
| Pagination via offset | No | Yes (`startIndex`) |
| Raw HTML mode | Yes (`html` format) | Yes (`raw` param) |
| Max length control | Yes | Yes |

The MCP version is largely redundant with Crush's built-in tools. Add it only if you encounter sites that the built-in fetch handles poorly.

## Source

- [modelcontextprotocol/servers - fetch](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch)
- Package: `@modelcontextprotocol/server-fetch`
- License: MIT
