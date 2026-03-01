#!/bin/bash
# 阿里云 ECS 服务器初始化 + 部署脚本
# 在服务器上以 root 运行: bash setup_server.sh

set -e

APP_DIR="/opt/trade-email-generator"
SERVICE_USER="cecilia"

echo "====== [1/6] 更新系统 ======"
apt update && apt upgrade -y

echo "====== [2/6] 安装依赖 ======"
apt install -y python3 python3-pip python3-venv nginx git unzip curl

echo "====== [3/6] 创建应用用户 ======"
id -u $SERVICE_USER &>/dev/null || useradd -m -s /bin/bash $SERVICE_USER

echo "====== [4/6] 创建应用目录 ======"
mkdir -p $APP_DIR
chown $SERVICE_USER:$SERVICE_USER $APP_DIR

echo "====== [5/6] 安装 Python 依赖 ======"
cd $APP_DIR
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "====== [6/6] 配置 systemd 服务 ======"
cat > /etc/systemd/system/trade-email.service << 'EOF'
[Unit]
Description=Trade Email Generator
After=network.target

[Service]
User=cecilia
WorkingDirectory=/opt/trade-email-generator
Environment="PATH=/opt/trade-email-generator/venv/bin"
ExecStart=/opt/trade-email-generator/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable trade-email
systemctl start trade-email

echo "====== 配置 Nginx ======"
cat > /etc/nginx/sites-available/trade-email << 'EOF'
server {
    listen 80;
    server_name _;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/trade-email /etc/nginx/sites-enabled/trade-email
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo ""
echo "====== 部署完成 ======"
echo "服务状态: systemctl status trade-email"
echo "应用日志: journalctl -u trade-email -f"
echo "访问地址: http://47.102.154.209"
