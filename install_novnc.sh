#!/bin/bash
# =============================================================================
# Ubuntu 22.04 轻量服务器 - noVNC + XFCE + Chrome 一键安装脚本
# 适用: 2H2G 及以上配置
# =============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置项
VNC_PORT=5901
NOVNC_PORT=6080
GEOMETRY="1280x800"
DEPTH=24

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_ok() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 root
if [ "$EUID" -eq 0 ]; then
    log_error "请不要用 root 用户运行此脚本"
    log_info "请切换至普通用户后重新执行: su - your-username"
    exit 1
fi

USER_HOME="$HOME"
VNC_DIR="$USER_HOME/.vnc"

# =============================================================================
# 1. 更新系统
# =============================================================================
log_info "正在更新系统软件包..."
sudo apt update -qq && sudo apt upgrade -y -qq
log_ok "系统更新完成"

# =============================================================================
# 2. 安装 XFCE4 桌面环境
# =============================================================================
log_info "正在安装 XFCE4 桌面环境..."
DEBIAN_FRONTEND=noninteractive sudo apt install -y -qq     xfce4 xfce4-goodies     xfce4-terminal thunar-volman     dbus-x11 xfonts-base
log_ok "XFCE4 安装完成"

# =============================================================================
# 3. 安装 TigerVNC 服务端
# =============================================================================
log_info "正在安装 TigerVNC..."
sudo apt install -y -qq tigervnc-standalone-server tigervnc-viewer
log_ok "TigerVNC 安装完成"

# =============================================================================
# 4. 配置 VNC
# =============================================================================
log_info "正在配置 VNC..."

# 创建 .vnc 目录
mkdir -p "$VNC_DIR"

# 设置 VNC 密码（如果没有设置过）
if [ ! -f "$VNC_DIR/passwd" ]; then
    log_warn "请设置 VNC 连接密码（至少6位）"
    vncpasswd
fi

# 创建 xstartup 启动脚本
cat > "$VNC_DIR/xstartup" << 'XSTARTUP'
#!/bin/bash
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
export XKL_XMODMAP_DISABLE=1
export QT_QPA_PLATFORMTHEME=gtk2
exec startxfce4
XSTARTUP

chmod +x "$VNC_DIR/xstartup"
log_ok "VNC 配置完成"

# =============================================================================
# 5. 安装 noVNC + websockify
# =============================================================================
log_info "正在安装 noVNC..."
sudo apt install -y -qq novnc websockify python3-websockify
log_ok "noVNC 安装完成"

# =============================================================================
# 6. 生成 SSL 证书
# =============================================================================
log_info "正在生成自签名 SSL 证书..."
sudo mkdir -p /etc/novnc/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048     -keyout /etc/novnc/ssl/novnc.key     -out /etc/novnc/ssl/novnc.crt     -subj "/C=CN/ST=State/L=City/O=Org/CN=localhost" 2>/dev/null
log_ok "SSL 证书生成完成"

# =============================================================================
# 7. 安装 Google Chrome
# =============================================================================
log_info "正在安装 Google Chrome..."
if ! command -v google-chrome &> /dev/null; then
    cd /tmp
    wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    sudo apt install -y -qq ./google-chrome-stable_current_amd64.deb 2>/dev/null || true
    sudo apt --fix-broken install -y -qq
    rm -f google-chrome-stable_current_amd64.deb
    log_ok "Chrome 安装完成"
else
    log_warn "Chrome 已存在，跳过安装"
fi

# =============================================================================
# 8. 创建管理脚本
# =============================================================================
log_info "正在创建管理脚本..."

# 启动脚本
cat > "$USER_HOME/vnc-start.sh" << STARTSCRIPT
#!/bin/bash
# noVNC + VNC 启动脚本

echo "正在启动 VNC 服务..."

# 杀掉已有的 VNC 会话
vncserver -kill :1 2>/dev/null || true
sleep 1

# 启动 VNC 服务端
vncserver :1 \
    -geometry $GEOMETRY \
    -depth $DEPTH \
    -localhost no \
    -xstartup "$VNC_DIR/xstartup"

echo "VNC 服务端已启动，端口: $VNC_PORT"

# 启动 noVNC
echo "正在启动 noVNC..."
nohup /usr/share/novnc/utils/novnc_proxy \
    --vnc localhost:$VNC_PORT \
    --listen $NOVNC_PORT \
    --cert /etc/novnc/ssl/novnc.crt \
    --key /etc/novnc/ssl/novnc.key \
    --web /usr/share/novnc \
    > /tmp/novnc.log 2>&1 &

echo "noVNC 已启动，端口: $NOVNC_PORT"
echo ""
echo "=========================================="
echo "  浏览器访问: https://\$(curl -s ifconfig.me):$NOVNC_PORT/vnc.html"
echo "=========================================="
STARTSCRIPT

# 停止脚本
cat > "$USER_HOME/vnc-stop.sh" << STOPSCRIPT
#!/bin/bash
# 停止 VNC + noVNC

echo "正在停止服务..."
vncserver -kill :1 2>/dev/null || echo "VNC 未运行"
pkill -f "novnc_proxy" 2>/dev/null || echo "noVNC 未运行"
echo "服务已停止"
STOPSCRIPT

# 状态检查脚本
cat > "$USER_HOME/vnc-status.sh" << STATUSCRIPT
#!/bin/bash
# 查看服务状态

echo "=== VNC 服务状态 ==="
if pgrep -f "Xtigervnc" > /dev/null; then
    echo "VNC 服务端: 运行中 (端口 $VNC_PORT)"
else
    echo "VNC 服务端: 未运行"
fi

echo ""
echo "=== noVNC 服务状态 ==="
if pgrep -f "novnc_proxy" > /dev/null; then
    echo "noVNC: 运行中 (端口 $NOVNC_PORT)"
else
    echo "noVNC: 未运行"
fi

echo ""
echo "=== 访问地址 ==="
IP=\$(curl -s ifconfig.me 2>/dev/null || echo "你的服务器IP")
echo "浏览器访问: https://\${IP}:$NOVNC_PORT/vnc.html"
echo ""
echo "=== 内存使用 ==="
free -h
STATUSCRIPT

chmod +x "$USER_HOME/vnc-start.sh" "$USER_HOME/vnc-stop.sh" "$USER_HOME/vnc-status.sh"
log_ok "管理脚本创建完成"

# =============================================================================
# 9. 配置防火墙
# =============================================================================
log_info "正在配置防火墙..."
sudo ufw allow $NOVNC_PORT/tcp 2>/dev/null || true
sudo ufw allow $VNC_PORT/tcp 2>/dev/null || true
log_ok "防火墙配置完成"

# =============================================================================
# 10. 配置 swap（2G 内存建议加 swap）
# =============================================================================
TOTAL_MEM=\$(free -m | awk '/^Mem:/ {print $2}')
if [ "$TOTAL_MEM" -lt 4096 ] && [ ! -f /swapfile ]; then
    log_info "内存小于 4G，正在创建 2G swap..."
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile >/dev/null
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
    log_ok "Swap 创建完成"
else
    log_warn "Swap 已存在或内存充足，跳过"
fi

# =============================================================================
# 11. 创建 systemd 服务（可选）
# =============================================================================
log_info "正在创建 systemd 服务..."

sudo tee /etc/systemd/system/novnc.service > /dev/null << SYSTEMD
[Unit]
Description=noVNC Remote Desktop
After=network.target

[Service]
Type=forking
User=$USER
ExecStart=$USER_HOME/vnc-start.sh
ExecStop=$USER_HOME/vnc-stop.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target
SYSTEMD

sudo systemctl daemon-reload
log_ok "systemd 服务创建完成"

# =============================================================================
# 安装完成
# =============================================================================
IP=\$(curl -s ifconfig.me 2>/dev/null || echo "你的服务器IP")

echo ""
echo "=========================================="
echo -e "${GREEN}    安装完成！${NC}"
echo "=========================================="
echo ""
echo "  管理命令:"
echo "    ~/vnc-start.sh    启动服务"
echo "    ~/vnc-stop.sh     停止服务"
echo "    ~/vnc-status.sh   查看状态"
echo ""
echo "  浏览器访问:"
echo "    https://$IP:$NOVNC_PORT/vnc.html"
echo ""
echo "  开机自启:"
echo "    sudo systemctl enable novnc"
echo "    sudo systemctl start novnc"
echo ""
echo "  ⚠️  重要提醒:"
echo "    1. 请在云厂商控制台放行 $NOVNC_PORT 端口"
echo "    2. 首次访问会提示证书不安全，点击'高级'→'继续前往'"
echo "    3. 连接 VNC 时输入你设置的密码"
echo ""
echo "=========================================="
