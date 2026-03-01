import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# 配置代理
http_proxy = os.getenv("HTTP_PROXY")
https_proxy = os.getenv("HTTPS_PROXY")

if http_proxy:
    os.environ["HTTP_PROXY"] = http_proxy
if https_proxy:
    os.environ["HTTPS_PROXY"] = https_proxy

# 配置 API Key
api_key = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=api_key)

print("正在获取可用的 Gemini 模型列表...\n")

try:
    models = genai.list_models()

    print("支持 generateContent 的模型：")
    print("=" * 60)

    for model in models:
        if 'generateContent' in model.supported_generation_methods:
            print(f"\n模型名称: {model.name}")
            print(f"显示名称: {model.display_name}")
            print(f"描述: {model.description}")
            print("-" * 60)

except Exception as e:
    print(f"错误: {e}")
