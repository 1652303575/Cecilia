# 快速使用指南

## 第一次使用

### 1. 准备 DeepSeek Token

在 DeepSeek 开放平台创建新的 API Token。Token 与密码等同，不要提交到 Git，也不要发送到聊天或截图中；已泄露的 Token 应立即吊销。

本项目通过 DeepSeek 官方 Anthropic 兼容接口调用模型：

```env
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_MODEL=deepseek-v4-pro
```

### 2. 配置应用

复制环境变量示例文件：

```bash
# macOS / Linux
cp .env.example .env

# Windows
copy .env.example .env
```

编辑 `.env`：

```env
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_AUTH_TOKEN=你的新DeepSeekToken
ANTHROPIC_MODEL=deepseek-v4-pro
HOST=127.0.0.1
PORT=8000
SESSION_SECRET=请替换为随机长字符串
```

### 3. 启动应用

```bash
# macOS / Linux
chmod +x start.sh
./start.sh

# Windows
start.bat
```

也可以手动启动：

```bash
pip install -r requirements.txt
python main.py
```

打开 http://127.0.0.1:8000，首次登录后立即修改默认密码：

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin | 管理员 |
| Cecilia | Cecilia | 管理员 |

## 主要功能

- 邮件中心：通过 IMAP/SMTP 收发邮件、群发、发送记录和联系统计
- AI 邮件：生成中英回复、企业微信快捷回复与主动开发/跟进邮件
- 客户与模板：维护客户档案、批量导入与复用邮件模板
- 管理后台：用户、角色、页面权限和反馈管理
- 时光机：纪念日、日程、日记、婚礼清单、预算与时间相册

## 常见问题

**提示缺少 `ANTHROPIC_AUTH_TOKEN` 怎么办？**

确认 `.env` 位于项目根目录、变量名拼写正确，然后重启应用。

**如何验证 AI 配置？**

配置 `.env` 后运行：

```bash
python check_models.py
```

脚本会向当前配置的 DeepSeek 模型发送一次极短测试请求。

**能否更换模型？**

可以，将 `.env` 中的 `ANTHROPIC_MODEL` 改为 DeepSeek 官方支持的 Anthropic 兼容模型标识后重启服务。

**数据保存在哪里？**

业务数据保存在 `database/trade_email.db`，上传图片位于 `static/uploads/`。部署前请做好备份。

**没有网络能否生成邮件？**

不可以。AI 生成必须访问 DeepSeek API；客户资料和本地历史数据仍保存在 SQLite 中。

更多部署说明见 `README.md`，连接异常排查见 `网络问题解决方案.md`。
