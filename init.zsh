export EDITOR=nvim
export VISUAL=nvim

alias n="npm"
alias nr="npm run"
alias marksrv="markserv -p 3456 -a 0.0.0.0"

tat() {
    if [ -z "$TMUX" ]; then
        tmux attach -t "$1" || tmux new -s "$1"
    else
        tmux switch-client -t "$1" || (tmux new-session -d -s "$1" && tmux switch-client -t "$1")
    fi
}
