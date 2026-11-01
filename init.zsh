export LANG="${LANG:-C.UTF-8}"

export EDITOR=nvim
export VISUAL=nvim

alias n="npm"
alias nr="npm run"

tat() {
    if [ -z "$TMUX" ]; then
        tmux attach -t "$1" || tmux new -s "$1"
    else
        tmux switch-client -t "$1" || (tmux new-session -d -s "$1" && tmux switch-client -t "$1")
    fi
}

trun() {
    if [ -z "$1" ]; then
        echo "usage: trun <name>" >&2
        return 1
    fi

    local name="$1"

    if tmux has-session -t "=$name" 2>/dev/null; then
        if [ -z "$TMUX" ]; then
            tmux attach -t "=$name"
        else
            tmux switch-client -t "=$name"
        fi
        return
    fi

    local crush_window
    crush_window=$(tmux new-session -d -P -F '#{window_index}' -s "$name" -n crush \
        'crush --continue; exec ${SHELL:-zsh}')
    tmux new-window -t "=$name" -n lazygit 'lazygit; exec ${SHELL:-zsh}'
    tmux select-window -t "$name:$crush_window"

    if [ -z "$TMUX" ]; then
        tmux attach -t "=$name"
    else
        tmux switch-client -t "=$name"
    fi
}

if [[ -o login ]] && [[ -z "$_TELESCREEN_MOTD_SHOWN" ]]; then
    export _TELESCREEN_MOTD_SHOWN=1
    bash /usr/local/bin/motd.sh
fi
