#!/bin/bash
# usage: popup.sh [width-percent] [left|right|x-percent] [height-percent]

WIDTH_PERCENT=${1:-80}
X_POSITION=${2:-}
HEIGHT_PERCENT=${3:-95}

CURRENT_SESSION_NAME=$(tmux display-message -p '#S')
NEW_SESSION_NAME="scratch-${CURRENT_SESSION_NAME}"

tmux has-session -t "${NEW_SESSION_NAME}" 2>/dev/null

if [ $? != 0 ]; then
  tmux new-session -d -s "${NEW_SESSION_NAME}"
fi

CURRENT_MOUSE=$(tmux show-options -qv -t "${CURRENT_SESSION_NAME}" mouse)
SCRATCH_MOUSE=$(tmux show-options -qv -t "${NEW_SESSION_NAME}" mouse)

restore_mouse() {
  if [ -n "${CURRENT_MOUSE}" ]; then
    tmux set-option -t "${CURRENT_SESSION_NAME}" mouse "${CURRENT_MOUSE}"
  else
    tmux set-option -u -t "${CURRENT_SESSION_NAME}" mouse
  fi
  if [ -n "${SCRATCH_MOUSE}" ]; then
    tmux set-option -t "${NEW_SESSION_NAME}" mouse "${SCRATCH_MOUSE}"
  else
    tmux set-option -u -t "${NEW_SESSION_NAME}" mouse
  fi
}

trap restore_mouse EXIT

tmux set-option -t "${CURRENT_SESSION_NAME}" mouse off
tmux set-option -t "${NEW_SESSION_NAME}" mouse off

CLIENT_WIDTH=$(tmux display-message -p '#{client_width}')
CLIENT_HEIGHT=$(tmux display-message -p '#{client_height}')

POPUP_WIDTH=$((CLIENT_WIDTH * WIDTH_PERCENT / 100))
POPUP_HEIGHT=$((CLIENT_HEIGHT * HEIGHT_PERCENT / 100))

POPUP_ARGS=(-h "${POPUP_HEIGHT}" -w "${POPUP_WIDTH}")

case "${X_POSITION}" in
  "")
    ;;
  left)
    POPUP_ARGS+=(-x 1)
    ;;
  right)
    POPUP_ARGS+=(-x $((CLIENT_WIDTH - POPUP_WIDTH - 1)))
    ;;
  *)
    POPUP_ARGS+=(-x $((CLIENT_WIDTH * X_POSITION / 100)))
    ;;
esac

tmux display-popup -E "${POPUP_ARGS[@]}" "tmux attach-session -t ${NEW_SESSION_NAME}; tmux refresh-client"
