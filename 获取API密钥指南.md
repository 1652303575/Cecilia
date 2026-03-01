# 如何获取免费的 Google Gemini API Key

本指南将帮助您快速获取完全免费的 Google Gemini API Key。

## 为什么选择 Gemini API？

✅ **完全免费** - 无需信用卡
✅ **注册简单** - 只需 Google 账号
✅ **配额充足** - 每分钟 60 次请求
✅ **质量优秀** - Google 最新的 AI 模型

## 获取步骤（推荐方法）

### 方法 1：Google AI Studio（最简单）

1. **访问网站**
   - 打开 https://aistudio.google.com/app/apikey
   - 如果链接打不开，可以访问 https://makersuite.google.com/app/apikey

2. **登录账号**
   - 使用您的 Google 账号登录
   - 如果没有 Google 账号，先注册一个（Gmail、YouTube 账号都可以）

3. **创建 API Key**
   - 点击页面上的 "Get API Key" 或 "Create API Key" 按钮
   - 如果提示选择项目，可以选择现有项目或创建新项目
   - 项目名称可以随意填写，如 "TradeEmailGenerator"

4. **复制 API Key**
   - API Key 创建成功后会显示在页面上
   - 点击复制按钮复制 API Key
   - **重要：请妥善保管这个 API Key，不要分享给他人**

5. **配置到应用中**
   - 在项目目录中，将 `.env.example` 复制为 `.env`
   - 打开 `.env` 文件
   - 将 `GEMINI_API_KEY=your_api_key_here` 中的 `your_api_key_here` 替换为您复制的 API Key
   - 保存文件

## 如果遇到问题

### 问题 1：无法访问 Google AI Studio

**原因：** 可能需要科学上网工具

**解决方法：**
- 尝试使用 VPN 或代理
- 或者使用方法 2（Google Cloud Console）

### 问题 2：提示 "API Key creation failed"

**解决方法：**
1. 刷新页面重试
2. 确保您的 Google 账号已验证（绑定手机号）
3. 尝试切换浏览器（Chrome 浏览器兼容性最好）

### 问题 3：API Key 不工作

**检查步骤：**
1. 确认 API Key 已正确复制到 `.env` 文件
2. 确认 `.env` 文件名称正确（不是 `.env.txt`）
3. 检查 API Key 前后是否有空格
4. 重启应用

## 方法 2：Google Cloud Console（备用方法）

如果方法 1 无法使用，可以尝试这个方法：

1. **访问 Google Cloud Console**
   - 打开 https://console.cloud.google.com/

2. **创建或选择项目**
   - 点击顶部的项目选择器
   - 点击 "NEW PROJECT" 创建新项目
   - 输入项目名称（如 "TradeEmailGenerator"）
   - 点击 "CREATE"

3. **启用 Generative Language API**
   - 在搜索框搜索 "Generative Language API"
   - 点击搜索结果中的 "Generative Language API"
   - 点击 "ENABLE" 启用 API

4. **创建凭据**
   - 点击左侧菜单 "APIs & Services" > "Credentials"
   - 点击顶部 "+ CREATE CREDENTIALS"
   - 选择 "API Key"
   - 复制生成的 API Key

5. **（可选）限制 API Key**
   - 点击 API Key 名称进入编辑页面
   - 在 "API restrictions" 部分选择 "Restrict key"
   - 选择 "Generative Language API"
   - 这样可以提高安全性

## API 使用限制

### 免费层级限制：
- **每分钟请求数（RPM）**: 60 次
- **每天请求数（RPD）**: 1500 次
- **每分钟 tokens**: 32,000

对于个人使用来说，这些配额完全足够！

## 安全建议

1. **不要分享您的 API Key**
   - API Key 等同于密码，不要在公开场合分享

2. **不要提交到 Git**
   - `.env` 文件已经在 `.gitignore` 中
   - 确保不会意外提交到 GitHub 等平台

3. **定期更换 API Key**
   - 如果怀疑 API Key 泄露，立即在控制台中删除并创建新的

4. **设置使用提醒**
   - 可以在 Google Cloud Console 设置使用配额提醒
   - 虽然是免费的，但了解使用情况有助于优化

## 快速测试

获取 API Key 后，可以快速测试是否可用：

```bash
# 运行启动脚本
start.bat  # Windows
# 或
./start.sh  # Linux/macOS

# 访问 http://127.0.0.1:8000
# 尝试生成一个简单的回复
```

## 需要帮助？

如果按照上述步骤仍然无法获取或使用 API Key，请：
1. 检查 README.md 中的常见问题部分
2. 在项目的 GitHub Issues 中提问
3. 确保您的网络环境可以访问 Google 服务

## 总结

获取 Gemini API Key 非常简单：
1. 访问 https://aistudio.google.com/app/apikey
2. 用 Google 账号登录
3. 点击创建 API Key
4. 复制到 `.env` 文件
5. 开始使用！

完全免费，无需信用卡，3 分钟搞定！
