# Sequential Thinking MCP Server

Dynamic and reflective problem-solving through structured thought sequences.

## Why it fits telescreen

Telescreen ships skills like `diagnose` and `prototype` that involve multi-step reasoning. This MCP gives Crush a formal "scratchpad" for complex debugging, architecture decisions, and multi-step planning -- forcing it to reason step-by-step rather than jumping to conclusions.

## Transport

`stdio` (npx)

## Config

```json
{
  "sequential-thinking": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
  }
}
```

## Tool

### `sequentialthinking`

A single tool that manages a chain of thoughts. Each invocation can:

- Add a new thought to the sequence
- Revise a previous thought
- Branch into alternative reasoning paths

**Parameters:**
- `thought` (string) -- The thinking step content
- `nextThoughtNeeded` (boolean) -- Whether more thinking is needed
- `thoughtNumber` (integer) -- Current step number
- `totalThoughts` (integer) -- Estimated total steps
- `isRevision` (boolean, optional) -- Whether this revises a previous thought
- `revisesThought` (integer, optional) -- Which thought number is being revised
- `branchFromThought` (integer, optional) -- Branch point for alternative reasoning
- `branchId` (string, optional) -- Identifier for the branch

## When Crush would use this

- Debugging complex issues (pairs with the `diagnose` skill)
- Planning multi-file refactors
- Evaluating tradeoffs between approaches
- Breaking down ambiguous requirements before coding

## Source

- [modelcontextprotocol/servers - sequentialthinking](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking)
- Package: `@modelcontextprotocol/server-sequential-thinking`
- License: Apache 2.0
