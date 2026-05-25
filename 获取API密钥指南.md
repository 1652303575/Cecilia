# 如何配置 DeepSeek API Token

本项目使用 DeepSeek 的 Anthropic 兼容 API，为邮件回复与邮件撰写提供模型能力。

## 获取与保管 Token

1. 登录 DeepSeek 开放平台并创建新的 API Token。
2. 复制 Token 后妥善保存；页面可能不会再次展示完整值。
3. 不要将 Token 提交到 Git、粘贴到聊天、日志、截图或公开文档中。
4. 如果 Token 曾经暴露，立即在平台吊销并创建新的 Token。

DeepSeek 官方 Anthropic 接口说明：<https://api-docs.deepseek.com/guides/anthropic_api>

## 配置应用

在项目目录将示例文件复制为 `.env`：

```bash
# macOS / Linux
cp .env.example .env

# Windows
copy .env.example .env
```

将新 Token 写入 `.env`：

```env
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_AUTH_TOKEN=你的新DeepSeekToken
ANTHROPIC_MODEL=deepseek-v4-pro
HOST=127.0.0.1
PORT=8000
SESSION_SECRET=请替换为随机长字符串
```

`ANTHROPIC_MODEL` 可替换为 DeepSeek 官方当前支持的其他 Anthropic 兼容模型标识。不要将界面展示标签或未经确认的后缀作为模型标识。

## 快速验证

安装依赖并执行连接验证：

```bash
pip install -r requirements.txt
python check_models.py
```

验证成功后运行应用：

```bash
python main.py
```

访问 http://127.0.0.1:8000 并尝试生成一封简短回复。

## 常见错误

- `缺少 ANTHROPIC_AUTH_TOKEN`：`.env` 未创建、变量名拼写错误，或启动目录不正确。
- `API 密钥无效或未配置`：Token 无效、已吊销或被错误复制；创建新 Token 后重试。
- `请求过于频繁`：等待后重试，或检查账户配额与限流策略。
- `网络连接失败`：检查服务器出站访问、防火墙或代理设置，详见 `网络问题解决方案.md`。

## 安全建议

- `.env` 已被 `.gitignore` 排除，仍应在提交前检查 `git status`。
- 生产环境使用部署平台的环境变量或仅服务器可读的 `.env` 文件。
- `SESSION_SECRET` 同样应替换为随机长字符串，并与 Token 一起保密。
