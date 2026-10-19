if vim.g.clipboard == nil then
  local osc52 = require('vim.ui.clipboard.osc52')
  local in_tmux = vim.env.TMUX ~= nil and vim.fn.executable('tmux') == 1

  vim.g.clipboard = {
    name = 'OSC 52',
    copy = {
      ['+'] = osc52.copy('+'),
      ['*'] = osc52.copy('+'),
    },
    paste = in_tmux and {
      ['+'] = { 'tmux', 'save-buffer', '-' },
      ['*'] = { 'tmux', 'save-buffer', '-' },
    } or {
      ['+'] = osc52.paste('+'),
      ['*'] = osc52.paste('*'),
    },
  }
end
