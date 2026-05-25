# Git MCP Server

Structured Git repository operations through MCP. Provides a cleaner interface to Git than raw shell commands.

## Why it fits telescreen

Complements the existing lazygit workflow. While lazygit is great for manual review in a TUI, this MCP gives Crush direct, structured access to git operations (status, diff, log, branch management) without shell escaping issues or ambiguous output parsing.

## Transport

`stdio` (npx or uvx)

## Config

```json
{
  "git": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "mcp-server-git", "--repository", "."]
  }
}
```

Or via Python (if `uv` is added to the container):

```json
{
  "git": {
    "type": "stdio",
    "command": "uvx",
    "args": ["mcp-server-git", "--repository", "."]
  }
}
```

The `--repository` argument sets the working repo. Use `.` for the current directory.

## Tools

| Tool | Description |
|------|-------------|
| `git_status` | Working tree status |
| `git_diff_unstaged` | Unstaged changes (3 context lines) |
| `git_diff_staged` | Staged changes (3 context lines) |
| `git_diff` | Diff between branches/commits |
| `git_commit` | Commit with message |
| `git_add` | Stage files |
| `git_reset` | Unstage all changes |
| `git_log` | Commit log with optional date filtering |
| `git_create_branch` | Create branch (optional base) |
| `git_checkout` | Switch branches |
| `git_show` | Show commit contents |
| `git_branch` | List branches (local/remote/all) |

## Relationship to Crush's built-in tools

Crush already has a `bash` tool that can run `git` commands. This MCP provides:

- **Structured input/output** -- no shell escaping issues
- **Cleaner diffs** -- consistent formatting, configurable context lines
- **Safer operations** -- each tool has a clear scope, harder to accidentally run destructive commands
- **Better for the LLM** -- typed parameters vs freeform shell strings

## Relationship to GitHub MCP

- **Git MCP** = local repo operations (commit, branch, diff, log)
- **GitHub MCP** = remote platform operations (PRs, issues, actions, code review)
- They complement each other: use Git MCP for local work, GitHub MCP for remote collaboration

## Source

- [modelcontextprotocol/servers - git](https://github.com/modelcontextprotocol/servers/tree/main/src/git)
- Package: `mcp-server-git` (PyPI)
- License: Apache 2.0
