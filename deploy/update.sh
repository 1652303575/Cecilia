#!/bin/bash
# 一键更新部署脚本（本地运行）
# 用法: bash deploy/update.sh
# 只上传代码文件，不覆盖服务器数据库

SERVER="root@47.102.154.209"
APP_DIR="/opt/trade-email-generator"

echo "====== [1/3] 打包代码（不含数据库）======"
cd /mnt/d/trade-email-generator

tar -czf /tmp/trade-email-update.tar.gz \
    --exclude='./__pycache__' \
    --exclude='./*.pyc' \
    --exclude='./deploy' \
    --exclude='./tmpclaude*' \
    --exclude='./.env' \
    --exclude='./database/' \
    main.py \
    database.py \
    schemas.py \
    email_service.py \
    email_center_service.py \
    requirements.txt \
    templates/ \
    static/

echo "====== [2/3] 上传到服务器 ======"
scp /tmp/trade-email-update.tar.gz $SERVER:/tmp/

echo "====== [3/3] 服务器解压并重启 ======"
ssh $SERVER << 'ENDSSH'
cd /opt/trade-email-generator
tar -xzf /tmp/trade-email-update.tar.gz
# 如有新依赖则更新
source venv/bin/activate && pip install -r requirements.txt -q
# 重启服务
systemctl restart trade-email
sleep 2
systemctl status trade-email --no-pager | head -5
echo "====== 更新完成 ======"
ENDSSH
