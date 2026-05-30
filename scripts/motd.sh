#!/usr/bin/env bash
set -euo pipefail

NVIM_VER=$(nvim --version 2>/dev/null | head -1 | awk '{print $2}' || echo "?")
LG_VER=$(lazygit --version 2>/dev/null | grep -oP 'version=\K[^,]+' | head -1 | sed 's/^/v/' || echo "?")
CRUSH_VER=$(crush --version 2>/dev/null | awk '{print $3}' || echo "?")
GLOW_VER=$(glow --version 2>/dev/null | awk '{print $3}' | sed 's/^/v/' || echo "?")
HOST=$(hostname 2>/dev/null || echo "?")
TS_INFO=$(tailscale status 2>/dev/null | { head -1 || true; } | awk '{print $3}')

W=77
hline() { printf "|%s%*s|\n" "$1" $((W - ${#1})) ""; }
mkborder() { local s=$(printf "%*s" "$W" "" | tr ' ' '='); printf '+%s+\n' "$s"; }

L1='  ████████╗███████╗██╗     ███████╗███████╗██████╗ ███████╗███████╗███╗   ██╗'
L2='  ╚══██╔══╝██╔════╝██║     ██╔════╝██╔════╝██╔══██╗██╔════╝██╔════╝████╗  ██║'
L3='     ██║   █████╗  ██║     █████╗  ███████╗██████╔╝█████╗  █████╗  ██╔██╗ ██║'
L4='     ██║   ██╔══╝  ██║     ██╔══╝  ╚════██║██╔══██╗██╔══╝  ██╔══╝  ██║╚██╗██║'
L5='     ██║   ███████╗███████╗███████╗███████║██║  ██║███████╗███████╗██║ ╚████║'
L6='     ╚═╝   ╚══════╝╚══════╝╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═══╝'

printf '\n'
mkborder
printf '|%s|\n' "$L1"
printf '|%s|\n' "$L2"
printf '|%s|\n' "$L3"
printf '|%s|\n' "$L4"
printf '|%s|\n' "$L5"
printf '|%s|\n' "$L6"
mkborder
hline ''
hline '  Tools'
hline "    Neovim  $(printf '%-8s' "$NVIM_VER")    Lazygit $(printf '%-8s' "$LG_VER")"
hline "    Crush   $(printf '%-8s' "$CRUSH_VER")    Glow    $(printf '%-8s' "$GLOW_VER")"
hline "    tmux    $(printf '%-8s' "3.5a")        Node.js 24"
hline "    deno    ripgrep  fd-find  jq  fzf  TypeScript"
hline ''
hline '  Aliases'
hline "    n  ->  npm          nr  ->  npm run"
hline "    ms ->  markserv     tat ->  tmux attach"
hline ''
hline "  Host: $HOST"
if [ -n "$TS_INFO" ]; then
    hline "  Tailscale: $TS_INFO"
    hline '  tailscale serve -> expose ports via Funnel'
fi
hline ''
mkborder
hline ''
hline '  Getting started'
hline '    nvim     ->  Editor          lazygit  ->  Git UI'
hline '    crush    ->  AI Assistant    glow     ->  Markdown Viewer'
hline '    tmux     ->  Terminal Mux    tat      ->  Attach tmux session'
if [ -n "$TS_INFO" ]; then
    hline '    tailscale status       tailscale serve'
fi
hline ''
mkborder
printf '\n'
