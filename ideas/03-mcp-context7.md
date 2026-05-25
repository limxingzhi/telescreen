# Context7 MCP

Fetches up-to-date, version-specific library documentation for LLMs. Eliminates hallucinated APIs and stale code examples.

## Why it fits telescreen

The container ships Node.js 24, TypeScript, and Deno. Crush can pull current docs for any library instead of relying on potentially outdated training data. The HTTP transport requires zero install and no API key.

## Transport

`http` (remote, hosted by Context7)

## Config

```json
{
  "context7": {
    "type": "http",
    "url": "https://mcp.context7.com/mcp"
  }
}
```

No environment variables needed. No API key required.

## Tools

### `resolve-library-id`

Required first step. Resolves a general package name (e.g. `react`, `express`) into a Context7-compatible library ID (e.g. `facebook/react`, `expressjs/express`).

**Parameters:**
- `libraryName` (string, required) -- The package or library name to resolve

### `get-library-docs`

Fetches documentation for a resolved library ID. Returns relevant, up-to-date documentation snippets.

**Parameters:**
- `context7CompatibleLibraryID` (string, required) -- Library ID from `resolve-library-id`
- `topic` (string, optional) -- Specific topic to focus the documentation on (e.g. `hooks`, `middleware`)

## Usage flow

1. Call `resolve-library-id` with a package name
2. Receive a Context7-compatible library ID
3. Call `get-library-docs` with that ID and optional topic
4. Get version-accurate documentation to inform code generation

## Example

Ask Crush: "Use Context7 to look up the latest Next.js App Router docs, then build me a route handler."

Crush will:
1. Resolve `nextjs` to `vercel/next.js`
2. Fetch docs focused on `app router`
3. Use accurate, current API signatures in the generated code

## Alternative: stdio transport

```json
{
  "context7": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@upstash/context7-mcp@latest"]
  }
}
```

Requires Node.js (already in container). Slightly higher latency on first run due to npx download.

## Source

- [upstash/context7-mcp](https://github.com/upstash/context7-mcp)
- Website: [context7.com](https://context7.com)
- License: MIT
