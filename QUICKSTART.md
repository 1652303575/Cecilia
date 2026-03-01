# 快速使用指南

## 第一次使用

### 1. 获取免费的 Gemini API Key

访问 [Google AI Studio](https://aistudio.google.com/app/apikey)
- 使用您的 Google 账号登录
- 点击 "Get API Key" 或 "Create API Key"
- 复制生成的 API Key

**注意：完全免费，无需信用卡！**

### 2. 配置 API Key

复制环境变量示例文件：
```bash
copy .env.example .env
```

编辑 `.env` 文件，填入您的 Gemini API Key：
```
GEMINI_API_KEY=你的API密钥
```

### 3. 启动应用

**Windows 用户**:
```bash
start.bat
```

**macOS/Linux 用户**:
```bash
chmod +x start.sh
./start.sh
```

**或者手动启动**:
```bash
pip install -r requirements.txt
python main.py
```

### 4. 访问应用

打开浏览器访问: http://127.0.0.1:8000

## 使用流程

1. **输入客户内容** - 粘贴客户发送的邮件或消息
2. **选择场景** - 选择合适的商务场景（询盘、报价等）
3. **选择语气** - 选择期望的回复语气（专业正式、友好等）
4. **生成回复** - 点击"生成回复"按钮，等待 5-10 秒
5. **查看三种格式** - 自动生成中文、英文邮件、企业微信三种格式
6. **复制使用** - 选择需要的格式，点击复制按钮

## 主要功能

- **智能生成**: 基于 Google Gemini 3 AI 生成专业回复
- **三种格式**: 中文版本 + 英文邮件 + 企业微信格式
- **模板管理**: 保存常用场景组合，快速复用
- **历史记录**: 查看和复用之前生成的回复

## 支持的场景

- 询盘 (Inquiry)
- 报价 (Quotation)
- 订单确认 (Order Confirmation)
- 发货通知 (Shipping Notice)
- 投诉处理 (Complaint Handling)
- 催款 (Payment Reminder)
- 样品申请 (Sample Request)
- 售后服务 (After-sales Service)
- 一般交流 (General Communication)

## 常见问题

**Q: 如何停止服务器？**
A: 在终端中按 `Ctrl+C`

**Q: 忘记 API Key 怎么办？**
A: 编辑 `.env` 文件重新填入

**Q: 为什么推荐 Gemini 而不是 ChatGPT？**
A: Gemini API 完全免费，无需信用卡，质量也很好，非常适合个人使用

**Q: Gemini API 有使用限制吗？**
A: 有的，每分钟最多 60 次请求，对于个人使用来说完全足够

**Q: 数据会丢失吗？**
A: 所有数据保存在本地 database/trade_email.db 文件中，不会丢失

**Q: 可以在没有网络的情况下使用吗？**
A: 不可以，生成回复需要调用 Gemini API，必须联网

## 使用示例

**客户消息：**
```
Hi, I'm interested in your products. Can you send me a catalog and price list?
```

**选择：**
- 场景：询盘 (Inquiry)
- 语气：专业正式 (Professional & Formal)

**生成的回复示例：**
```
Dear Customer,

Thank you for your interest in our products.

We would be happy to send you our latest catalog and price list.
Could you please provide your email address and company information?
This will help us send you the most relevant materials.

We look forward to the opportunity to work with you.

Best regards,
[Your Name]
```

## 技术支持

如有问题，请查阅 README.md 获取详细文档。

## 为什么选择外贸沟通助手？

✅ **完全免费** - 使用 Google Gemini API，无需付费
✅ **简单易用** - 3 步配置，立即使用
✅ **三种格式** - 中文参考、英文邮件、企业微信一次生成
✅ **专业质量** - AI 生成的回复专业且地道
✅ **隐私安全** - 数据存储在本地，不上传到云端
✅ **快速高效** - 几秒钟生成三种格式供选择
