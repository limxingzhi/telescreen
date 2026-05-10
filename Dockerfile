FROM node:24-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV TERM=xterm-256color
ENV EDITOR=nvim
ENV VISUAL=nvim

# Tailscale
RUN curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null \
    && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list | tee /etc/apt/sources.list.d/tailscale.list \
    && apt-get update && apt-get install -y tailscale \
    && rm -rf /var/lib/apt/lists/*

# Tools
RUN apt-get update && apt-get install -y \
    zsh \
    tmux \
    git \
    curl \
    wget \
    unzip \
    ripgrep \
    fd-find \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install neovim from GitHub releases (newer than Debian bookworm)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then NV_ARCH="linux-arm64"; \
    else NV_ARCH="linux-x86_64"; fi && \
    NVIM_VERSION=$(curl -s https://api.github.com/repos/neovim/neovim/releases/latest | grep tag_name | cut -d '"' -f 4) && \
    curl -Lo nvim.tar.gz "https://github.com/neovim/neovim/releases/download/${NVIM_VERSION}/nvim-${NV_ARCH}.tar.gz" && \
    tar -xzf nvim.tar.gz && \
    mv nvim-${NV_ARCH} /opt/nvim && \
    ln -s /opt/nvim/bin/nvim /usr/local/bin/nvim && \
    rm nvim.tar.gz

# install lazygit
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then \
        LG_ARCH="arm64"; \
    else \
        LG_ARCH="x86_64"; \
    fi && \
    LAZYGIT_VERSION=$(curl -s https://api.github.com/repos/jesseduffield/lazygit/releases/latest | grep tag_name | cut -d '"' -f 4) && \
    curl -Lo lazygit.tar.gz \
    https://github.com/jesseduffield/lazygit/releases/download/${LAZYGIT_VERSION}/lazygit_${LAZYGIT_VERSION#v}_Linux_${LG_ARCH}.tar.gz && \
    tar -xzf lazygit.tar.gz lazygit && \
    install lazygit /usr/local/bin && \
    rm lazygit lazygit.tar.gz

# TypeScript tooling
RUN npm install -g npm@latest typescript ts-node

# Oh My Zsh (install to /opt so it survives bind mounts on /root)
ENV ZSH=/opt/oh-my-zsh
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended \
    && chsh -s /usr/bin/zsh root

# Home as workspace
WORKDIR /root

# Default nvim config (outside /root, survives bind mounts)
COPY init.lua.file /etc/nvim/init.lua

# Persist home directory across restarts (configs, projects, etc.)
VOLUME /root

# Tailscale state (separate volume)
VOLUME /var/lib/tailscale


# Shell config (outside /root so it survives bind mounts)
COPY zsh/aliases.zsh /etc/zsh/aliases.zsh

# Entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["zsh"]
