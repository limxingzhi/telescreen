FROM node:26-bookworm

ARG NVIM_VERSION=v0.12.6
ARG LAZYGIT_VERSION=v0.66.2
ARG CRUSH_VERSION=v0.100.0
ARG GLOW_VERSION=v3.0.0
ARG TAILSCALE_VERSION=v1.104.5
ARG STARSHIP_VERSION=v1.27.0

ENV DEBIAN_FRONTEND=noninteractive
ENV TERM=xterm-256color
ENV LANG=C.UTF-8
ENV TZ=UTC

# Tailscale
RUN curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null \
    && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list | tee /etc/apt/sources.list.d/tailscale.list \
    && apt-get update && apt-get install -y tailscale=${TAILSCALE_VERSION#v} \
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
    jq \
    fzf \
    fd-find \
    htop \
    build-essential \
    ca-certificates \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Install neovim from GitHub releases (newer than Debian bookworm)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then NV_ARCH="linux-arm64"; \
    else NV_ARCH="linux-x86_64"; fi && \
    curl -fsSLo nvim.tar.gz "https://github.com/neovim/neovim/releases/download/${NVIM_VERSION}/nvim-${NV_ARCH}.tar.gz" && \
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
    curl -fsSLo lazygit.tar.gz \
    https://github.com/jesseduffield/lazygit/releases/download/${LAZYGIT_VERSION}/lazygit_${LAZYGIT_VERSION#v}_Linux_${LG_ARCH}.tar.gz && \
    tar -xzf lazygit.tar.gz lazygit && \
    install lazygit /usr/local/bin && \
    rm lazygit lazygit.tar.gz

# Lazygit config (gruvbox-dark theme, outside /root so it survives bind mounts)
COPY lazygit/ /etc/lazygit/

# Install Crush CLI from GitHub releases
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then CRUSH_ARCH="arm64"; \
    else CRUSH_ARCH="amd64"; fi && \
    curl -fsSLo /tmp/crush.deb \
      "https://github.com/charmbracelet/crush/releases/download/${CRUSH_VERSION}/crush_${CRUSH_VERSION#v}_${CRUSH_ARCH}.deb" && \
    dpkg -i /tmp/crush.deb && \
    rm /tmp/crush.deb

# Install Glow (markdown renderer) from Charm
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then GLOW_ARCH="arm64"; \
    else GLOW_ARCH="amd64"; fi && \
    curl -fsSLo /tmp/glow.deb \
      "https://github.com/charmbracelet/glow/releases/download/${GLOW_VERSION}/glow_${GLOW_VERSION#v}_${GLOW_ARCH}.deb" && \
    dpkg -i /tmp/glow.deb && \
    rm /tmp/glow.deb

# TypeScript tooling
RUN npm install -g --ignore-scripts npm typescript typescript-language-server ts-node tsx http-server eslint bash-language-server markserv

# Install starship prompt from GitHub releases (static musl binary)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then SS_ARCH="aarch64-unknown-linux-musl"; \
    else SS_ARCH="x86_64-unknown-linux-musl"; fi && \
    curl -fsSLo starship.tar.gz \
    "https://github.com/starship/starship/releases/download/${STARSHIP_VERSION}/starship-${SS_ARCH}.tar.gz" && \
    tar -xzf starship.tar.gz starship && \
    install starship /usr/local/bin && \
    rm starship starship.tar.gz \
    && chsh -s /usr/bin/zsh root

# Starship config (outside /root so it survives bind mounts)
COPY starship.toml /etc/starship/starship.toml
ENV STARSHIP_CONFIG=/etc/starship/starship.toml

# Home as workspace
WORKDIR /root

# Default nvim config (outside /root, survives bind mounts)
RUN mkdir -p /etc/nvim && curl -fsSL https://gist.github.com/limxingzhi/fa3be5045caded9d4e09f2423dbfcec7/raw -o /etc/nvim/init.lua
COPY nvim/ /etc/nvim/

# Persist home directory across restarts (configs, projects, etc.)
VOLUME /root

# Tailscale state (separate volume)
VOLUME /var/lib/tailscale

# Agent skills (outside /root so it survives bind mounts)
COPY skills/ /etc/agents/skills/

# Crush config + global instructions (outside /root so it survives bind mounts)
COPY crush/ /etc/crush/
RUN chmod +x /etc/crush/notify/*.js
ENV CRUSH_GLOBAL_CONFIG=/etc/crush/crush.json

# Shell config (outside /root so it survives bind mounts)
COPY init.zsh /etc/zsh/init.zsh
COPY zshrc /etc/zsh/zshrc

# Tmux config (outside /root so it survives bind mounts)
COPY tmux/tmux.conf /etc/tmux/tmux.conf
COPY tmux/popup.sh /etc/tmux/popup.sh
COPY tmux/renumber-sess.sh /etc/tmux/renumber-sess.sh
COPY tmux/session-status.sh /etc/tmux/session-status.sh
RUN chmod +x /etc/tmux/popup.sh /etc/tmux/renumber-sess.sh /etc/tmux/session-status.sh

# Install TPM and tmux-yank at build time (pinned to specific releases)
RUN git clone --single-branch --depth 1 --branch v1.2.1 https://github.com/tmux-plugins/tpm /opt/tmux-plugins/tpm \
    && git clone --single-branch --depth 1 --branch v2.3.0 https://github.com/tmux-plugins/tmux-yank /opt/tmux-plugins/tmux-yank

# Entrypoint
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY scripts/motd.sh /usr/local/bin/motd.sh
COPY scripts/ms /usr/local/bin/ms
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/motd.sh /usr/local/bin/ms

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["zsh"]
