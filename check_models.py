import os

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv("ANTHROPIC_AUTH_TOKEN")
base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.deepseek.com/anthropic")
model = os.getenv("ANTHROPIC_MODEL", "deepseek-v4-pro")

if not api_key:
    raise SystemExit("缺少 ANTHROPIC_AUTH_TOKEN，请先在 .env 中配置新的 DeepSeek Token。")

print(f"正在验证 DeepSeek Anthropic API：{base_url}")
print(f"当前模型：{model}")

client = Anthropic(api_key=api_key, base_url=base_url)

try:
    response = client.messages.create(
        model=model,
        max_tokens=16,
        messages=[{"role": "user", "content": "Reply with OK only."}],
        timeout=30,
    )
    text = "".join(
        block.text for block in response.content
        if getattr(block, "type", None) == "text"
    ).strip()
    print(f"连接成功，模型返回：{text}")
except Exception as exc:
    raise SystemExit(f"连接失败：{exc}") from exc
