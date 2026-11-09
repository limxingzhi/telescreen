HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
setopt SHARE_HISTORY HIST_IGNORE_ALL_DUPS HIST_IGNORE_SPACE AUTO_CD EXTENDED_GLOB

eval "$(starship init zsh)"

export STARSHIP_CONFIG="${STARSHIP_CONFIG:-/etc/starship/starship.toml}"

source /etc/zsh/init.zsh

# Long Crush turns spool an OSC 9 notification; replay it at the next prompt in
# whichever pane you are looking at (tmux cannot inject escapes into a program)
if [[ -o interactive && -z "${CRUSH_NOTIFY_NO_DRAIN:-}" ]]; then
  precmd_crush_notify() { /etc/crush/notify/drain.js 2>/dev/null }
  precmd_functions+=(precmd_crush_notify)
fi
