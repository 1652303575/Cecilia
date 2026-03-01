#!/bin/bash

echo "========================================"
echo "外贸商务邮件回复生成器"
echo "========================================"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "[错误] 未找到 .env 文件！"
    echo ""
    echo "请按照以下步骤配置："
    echo "1. 复制 .env.example 为 .env"
    echo "2. 编辑 .env 文件，填入您的 Claude API Key"
    echo ""
    echo "命令: cp .env.example .env"
    echo ""
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "[提示] 未找到虚拟环境，正在创建..."
    python3 -m venv venv
    if [ $? -ne 0 ]; then
        echo "[错误] 创建虚拟环境失败！请检查 Python 是否正确安装。"
        exit 1
    fi
    echo "[成功] 虚拟环境创建完成"
    echo ""
fi

# Activate virtual environment
echo "[提示] 激活虚拟环境..."
source venv/bin/activate
if [ $? -ne 0 ]; then
    echo "[错误] 激活虚拟环境失败！"
    exit 1
fi

# Install dependencies
echo "[提示] 检查依赖..."
pip install -q -r requirements.txt
if [ $? -ne 0 ]; then
    echo "[错误] 安装依赖失败！"
    exit 1
fi

echo ""
echo "========================================"
echo "[启动] 正在启动应用..."
echo "========================================"
echo ""
echo "访问地址: http://127.0.0.1:8000"
echo "按 Ctrl+C 停止服务器"
echo ""

# Start the application
python main.py
