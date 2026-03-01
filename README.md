# Cecilia Auto Mail

基于阿里云通义千问 API 的专属外贸邮件助手，帮助外贸业务员快速生成专业回复、主动撰写开发信、管理客户档案、直接收发邮件。

## 功能特性

### 邮件回复
- 粘贴客户消息，AI 自动生成**三套回复**：中文对照 + 英文正式邮件 + 企业微信快捷版
- 支持 13 种外贸场景（询盘、报价、投诉处理、催款等）
- 支持多种语气风格（专业正式、友好亲切、诚恳歉意等）
- AI 自动提取标题，历史记录自动保存（最近 50 条）

### 邮件撰写
- 主动撰写：开发信、跟进邮件、产品推荐、报价跟进、节后跟进
- 同时输出英文版 + 中文对照，方便审核

### 历史记录搜索
- 「历史记录」和「撰写记录」支持**关键词搜索**（回复内容 / 标题 / 场景）
- **客户下拉筛选**，从客户管理自动同步，切换即触发

### 客户管理
- 创建客户档案：姓名、公司、行业、产品偏好、背景备注、状态分类
- 生成回复/撰写邮件时选择客户，**背景信息自动注入 AI 提示词**，生成更个性化的内容
- 客户详情页展示该客户的完整往来记录（生成回复 + 撰写邮件）
- 支持 **CSV 批量导入**，可下载模板后批量填写上传（支持 UTF-8 / GBK 编码）

### 模板管理
- 回复模板：保存常用场景 + 语气组合，一键加载
- 撰写模板：保存常用邮件类型配置，快速复用
- 邮件模板：保存带占位符的邮件内容，供单发/群发复用

### 邮件中心
- **收件箱**：IMAP 读取最新 50 封邮件，一键填入 AI 生成页面
- **发邮件**：SMTP 单发，选客户自动填入邮箱，加载模板自动替换 `{{name}}` `{{company}}` 等占位符，发送前预览确认
- **群发邮件**：批量发送个性化邮件，支持附件，每封按客户信息自动替换占位符
- **发送记录**：完整记录单发/群发历史，含状态和失败原因
- **联系统计**：每个客户的互动次数和距上次联系天数，颜色预警

### 全局设置
- 填写一次公司名称、产品背景、联系方式、邮件签名
- 配置 SMTP/IMAP 邮箱账号（默认支持阿里企业邮箱）
- 之后每次生成自动带入，无需重复填写

### 意见反馈
- 提交建议或问题，选择反馈类型
- 支持**多张截图上传**（最多 5 张），可点击添加或 Ctrl+V 粘贴，方便精准定位问题
- 管理员可在「反馈管理」查看、标记完成、删除，截图点击放大查看

### 用户系统
- 登录保护，Session Cookie（7天有效）
- 数据完全隔离：每个用户只能看到自己的数据
- 管理员可查看所有数据、管理所有用户
- 所有用户可自行修改密码
- 管理员可重置任意用户密码、禁用/启用账号

## 技术栈

- **后端**: FastAPI + SQLAlchemy + SQLite
- **前端**: 原生 HTML/CSS/JavaScript（单页应用）
- **AI**: 阿里云通义千问（qwen-plus，DashScope 兼容接口）
- **认证**: Starlette SessionMiddleware + passlib[bcrypt]

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
copy .env.example .env
```

编辑 `.env`，填入 DashScope API Key：

```env
DASHSCOPE_API_KEY=your_api_key_here
HOST=127.0.0.1
PORT=8000
SESSION_SECRET=your-random-secret-key
```

### 3. 启动应用

```bash
# Windows
start.bat

# 手动启动
python main.py
```

### 4. 访问应用

浏览器访问 http://127.0.0.1:8000，使用以下账号登录：

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin | 管理员（查看所有数据 + 用户管理） |
| cecilia | cecilia | 普通用户（仅看自己数据） |

> **首次登录后请立即修改密码**（顶栏「改密码」按钮）。

## 项目结构

```
trade-email-generator/
├── main.py                  # FastAPI 主应用（所有路由）
├── database.py              # ORM 模型 + init_db() + migrate_db()
├── schemas.py               # Pydantic 数据模型
├── email_service.py         # 通义千问 API 集成
├── email_center_service.py  # SMTP/IMAP 邮件中心服务
├── requirements.txt         # Python 依赖
├── .env                     # 环境变量（本地，不提交）
├── .env.example             # 环境变量示例
├── database/
│   └── trade_email.db       # SQLite 数据库
├── static/
│   ├── style.css
│   ├── app.js
│   └── uploads/
│       └── feedback/        # 反馈截图上传目录（自动创建）
└── templates/
    └── index.html           # 单页应用 HTML
```

## 注意事项

- **密码安全**：首次部署后请修改 admin 和 cecilia 的默认密码
- **SESSION_SECRET**：生产环境请在 `.env` 中设置随机字符串，防止重启后 session 失效
- **API Key 安全**：`DASHSCOPE_API_KEY` 不要提交到版本控制
- **上传文件**：反馈截图存储在 `static/uploads/feedback/`，部署时注意目录权限；Nginx 需配置 `client_max_body_size 20M` 以支持多图上传
- **生成质量**：输入越完整，生成效果越好；客户档案背景信息越详细，个性化程度越高

---

## 生产环境部署（阿里云 ECS）

> 服务器：47.102.154.209 | Ubuntu 22.04 | 2vCPU 2GiB

### 架构

```
用户浏览器
    ↓ HTTP:80
  Nginx（反向代理）
    ↓
  uvicorn（127.0.0.1:8000）
    ↓
  /opt/trade-email-generator/database/trade_email.db
```

### 首次部署

**1. 本地打包上传**

在本地 Git Bash 运行：

```bash
# 打包（含数据库）
cd /d/trade-email-generator
tar -czf /tmp/trade-email-deploy.tar.gz \
    main.py database.py schemas.py \
    email_service.py email_center_service.py \
    requirements.txt templates/ static/ \
    database/trade_email.db

# 上传到服务器
scp /tmp/trade-email-deploy.tar.gz root@47.102.154.209:/tmp/
```

**2. 服务器初始化**

SSH 连接服务器后运行：

```bash
# 解压
mkdir -p /opt/trade-email-generator
cd /opt/trade-email-generator
tar -xzf /tmp/trade-email-deploy.tar.gz

# 创建上传目录
mkdir -p static/uploads/feedback

# 安装依赖
apt install -y python3 python3-pip python3-venv nginx
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 创建环境变量
cat > /opt/trade-email-generator/.env << 'EOF'
DASHSCOPE_API_KEY=你的API密钥
SECRET_KEY=cecilia-trade-email-secret-2024
EOF
```

**3. 配置 systemd 服务**

```bash
cat > /etc/systemd/system/trade-email.service << 'EOF'
[Unit]
Description=Trade Email Generator
After=network.target

[Service]
User=root
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
```

**4. 配置 Nginx**

```bash
cat > /etc/nginx/nginx.conf << 'EOF'
user www-data;
worker_processes auto;
pid /run/nginx.pid;

events { worker_connections 768; }

http {
    sendfile on;
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    server {
        listen 80;
        server_name _;
        client_max_body_size 20M;

        location / {
            proxy_pass http://127.0.0.1:8000;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_read_timeout 120s;
        }
    }
}
EOF

nginx -t && systemctl restart nginx
```

访问 http://47.102.154.209 验证。

---

### 日常更新发布

本地修改代码后，运行一键更新脚本：

```bash
bash /mnt/d/trade-email-generator/deploy/update.sh
```

脚本自动完成：打包代码 → 上传 → 解压 → 重启服务（**不覆盖服务器数据库和上传文件**）。

也可手动执行：

```bash
# 1. 本地打包（不含数据库和上传文件）
cd /d/trade-email-generator
tar -czf /tmp/trade-email-update.tar.gz \
    main.py database.py schemas.py \
    email_service.py email_center_service.py \
    requirements.txt templates/ static/style.css static/app.js

# 2. 上传
scp /tmp/trade-email-update.tar.gz root@47.102.154.209:/tmp/

# 3. 服务器解压重启
ssh root@47.102.154.209 "cd /opt/trade-email-generator && tar -xzf /tmp/trade-email-update.tar.gz && systemctl restart trade-email"
```

---

### 常用运维命令

| 操作 | 命令（在服务器上运行） |
|------|----------------------|
| 查看服务状态 | `systemctl status trade-email` |
| 查看实时日志 | `journalctl -u trade-email -f` |
| 重启服务 | `systemctl restart trade-email` |
| 备份数据库 | `cp /opt/trade-email-generator/database/trade_email.db ~/backup_$(date +%Y%m%d).db` |
| 备份上传文件 | `tar -czf ~/uploads_backup_$(date +%Y%m%d).tar.gz /opt/trade-email-generator/static/uploads/` |
| 查看 Nginx 日志 | `tail -f /var/log/nginx/error.log` |
