#!/bin/bash
# 本地执行：打包项目并上传到服务器
# 用法: bash deploy/upload.sh
# 需要先安装 scp/ssh (Windows 用 Git Bash 或 WSL)

SERVER="root@47.102.154.209"
APP_DIR="/opt/trade-email-generator"
PACK_NAME="trade-email-deploy.tar.gz"

echo "====== [1/3] 打包项目 ======"
cd d:/trade-email-generator

tar -czf $PACK_NAME \
    --exclude='./__pycache__' \
    --exclude='./database/__pycache__' \
    --exclude='./*.pyc' \
    --exclude='./deploy' \
    --exclude='./tmpclaude*' \
    --exclude='./.env' \
    main.py \
    database.py \
    schemas.py \
    email_service.py \
    email_center_service.py \
    requirements.txt \
    templates/ \
    static/ \
    database/trade_email.db

echo "打包完成: $PACK_NAME"

echo "====== [2/3] 上传到服务器 ======"
scp $PACK_NAME $SERVER:/tmp/
scp deploy/setup_server.sh $SERVER:/tmp/

echo "====== [3/3] 在服务器解压并部署 ======"
ssh $SERVER << 'ENDSSH'
mkdir -p /opt/trade-email-generator
cd /opt/trade-email-generator
tar -xzf /tmp/trade-email-deploy.tar.gz
chown -R cecilia:cecilia /opt/trade-email-generator 2>/dev/null || true
echo "解压完成"
ls -la
ENDSSH

echo ""
echo "====== 上传完成 ======"
echo "接下来在服务器上运行: bash /tmp/setup_server.sh"
