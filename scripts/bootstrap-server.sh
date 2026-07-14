#!/usr/bin/env bash
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 zram-tools fail2ban ufw ca-certificates curl
sudo systemctl enable --now docker fail2ban
sudo usermod -aG docker ubuntu

sudo install -d -m 0750 -o ubuntu -g docker /opt/is2u /opt/is2u/releases /opt/is2u/shared
sudo install -d -m 0700 -o ubuntu -g ubuntu /opt/is2u/tmp

sudo tee /etc/default/zramswap >/dev/null <<'EOF'
ALGO=zstd
PERCENT=50
PRIORITY=100
EOF
sudo systemctl enable zramswap
sudo systemctl restart zramswap
echo 'vm.swappiness=100' | sudo tee /etc/sysctl.d/99-is2u.conf >/dev/null
sudo sysctl --system >/dev/null

sudo install -d -m 0755 /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
EOF
sudo systemctl restart docker

sudo tee /etc/ssh/sshd_config.d/60-is2u-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
MaxAuthTries 4
EOF
sudo sshd -t
sudo systemctl reload ssh

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw --force enable

echo is2u_server_bootstrap_complete
