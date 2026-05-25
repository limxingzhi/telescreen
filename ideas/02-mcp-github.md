# GitHub MCP Server

Remote hosted by GitHub. Zero install -- just a PAT and an HTTP endpoint.

## Why it fits telescreen

The "vibe coding" workflow in telescreen is: Crush builds code, lazygit reviews diffs. This MCP lets Crush manage PRs, issues, actions, and repo operations directly without needing `gh` CLI. The remote HTTP version is ideal for the container (no Docker-in-Docker, no binary install).

## Transport

`http` (remote, hosted by GitHub)

## Config

```json
{
  "github": {
    "type": "http",
    "url": "https://api.githubcopilot.com/mcp/",
    "headers": {
      "Authorization": "Bearer $GH_PAT"
    }
  }
}
```

Pass `GH_PAT` at runtime:

```sh
docker run -it --rm -v dev-env-home:/root -e GH_PAT=ghp_xxxxx dev-env
```

## Prerequisites

- A GitHub Personal Access Token with scopes: `repo`, `read:org`, `notifications`
- No additional packages to install in the container

## Available toolsets

| Toolset | Description |
|---------|-------------|
| `context` | Current user and GitHub context (recommended) |
| `repos` | Repository browsing, file contents, commits, code search |
| `issues` | Create, update, search, and comment on issues |
| `pull_requests` | Create, review, merge PRs |
| `actions` | GitHub Actions workflows and CI/CD |
| `notifications` | Read and manage notifications |
| `code_security` | Code scanning alerts |
| `dependabot` | Dependabot vulnerability alerts |
| `discussions` | GitHub Discussions |
| `gists` | Create and manage Gists |

Default toolsets: `context`, `repos`, `issues`, `pull_requests`, `users`.

To restrict toolsets, add query params or use the local server with `--toolsets` flag. See [toolset docs](https://github.com/github/github-mcp-server#tool-configuration).

## Read-only mode

For safety, use a fine-grained PAT with read-only permissions, or run the local server with `--read-only`.

## Source

- [github/github-mcp-server](https://github.com/github/github-mcp-server)
- License: MIT
