import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

class EmailGeneratorService:
    def __init__(self):
        api_key = os.getenv("DASHSCOPE_API_KEY")
        if not api_key:
            raise ValueError("DASHSCOPE_API_KEY not found in environment variables")

        self.client = OpenAI(
            api_key=api_key,
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        )
        self.model = "qwen-plus"

    def _chat(self, prompt: str) -> str:
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                timeout=60,
            )
            return response.choices[0].message.content
        except Exception as e:
            err = str(e).lower()
            if "timeout" in err:
                raise Exception("AI 响应超时，请稍后重试")
            if "authentication" in err or "invalid api key" in err or "api_key" in err:
                raise Exception("API 密钥无效或未配置，请检查设置")
            if "rate limit" in err or "rate_limit" in err:
                raise Exception("请求过于频繁，请稍后重试")
            if "connection" in err or "network" in err:
                raise Exception("网络连接失败，请检查网络后重试")
            raise Exception(f"AI 服务异常：{str(e)}")

    def generate_email_reply(
        self,
        chat_content: str,
        scenario: str,
        tone: str,
        num_versions: int = 1,
        extra_requirements: str = None,
        company_name: str = None,
        company_signature: str = None,
        products_info: str = None,
        contact_info: str = None,
        customer_background: str = None,
    ) -> list:
        system_context = """你是一名有5年以上经验的外贸跟单员，英语专业、表达专业、逻辑清晰。
你的目标是帮助中国外贸业务员生成专业但不过分卑微的商务回复。

回复要求：
1. 简洁明了，直入主题
2. 专业且有礼貌，但不过分卑微
3. 长度适中，不要写得太长
4. 适度维护客户关系，体现服务意识
5. 避免使用夸张的营销语言
6. 使用地道的商务英语表达
7. 保持自信和平等的商业伙伴关系"""

        context_parts = []
        if company_name or contact_info:
            company_section = "【发件方信息】（用于生成签名和称呼，不要原样粘贴到正文）"
            if company_name:
                company_section += f"\n公司名称: {company_name}"
            if contact_info:
                company_section += f"\n联系方式: {contact_info}"
            context_parts.append(company_section)

        if products_info:
            context_parts.append(f"【产品背景知识】（仅供参考，帮助你理解业务背景，不要原样输出到邮件中）\n{products_info}")

        if customer_background:
            context_parts.append(f"【客户背景信息】（供参考，帮助生成更个性化的回复，不要原样输出）\n{customer_background}")

        if extra_requirements:
            context_parts.append(f"【额外要求】\n{extra_requirements}")

        context_block = ("\n\n" + "\n\n".join(context_parts)) if context_parts else ""

        if company_signature:
            signature_note = f"- 签名使用以下内容：\n{company_signature}"
        else:
            signature_note = "- 签名位置"

        user_prompt = f"""{system_context}

客户原始聊天内容：
{chat_content}

场景：{scenario}
语气：{tone}{context_block}

请先用一行输出对客户消息的简短中文标题（10字以内，概括客户的核心诉求），格式如下：
TITLE: [标题内容]

然后生成三个不同格式的回复。注意：不要在回复中写"第一个版本"、"第二个版本"等标题，直接输出内容。

【格式1：中文参考版本】
将英文回复翻译成中文，保持专业语气，方便理解内容。

===

【格式2：英文正式邮件】
完整的商务邮件格式，包含：
- Subject 主题行
- Dear [客户名称] 称呼
- 正文内容（3-5段，专业地道）
- Best regards/Sincerely 结尾
{signature_note}
注意：不卑不亢，保持平等的商业伙伴关系。如果客户聊天内容中没有提及对方公司名称或联系人姓名，使用 [Company Name]、[Contact Name] 等占位符，不要自己编造。

===

【格式3：企业微信快捷回复】
即时通讯风格，特点：
- 去掉 Subject、Dear、Best regards 等邮件格式
- 直接进入主题
- 2-3句话说清楚核心内容
- 友好但简洁
- 可以使用 Hi, Thanks, Sure 等轻松表达
示例风格：
"Hi! Thanks for your inquiry. [核心内容1-2句]. Let me know if you need more details!"

请严格按照以上顺序生成，用 === 分隔三个版本，不要写版本号标题。"""

        try:
            reply_text = self._chat(user_prompt)

            if not reply_text:
                raise Exception("AI 未返回内容，请重试")

            # 提取标题
            title = None
            lines = reply_text.split('\n')
            body_lines = []
            for line in lines:
                if title is None and line.strip().startswith('TITLE:'):
                    title = line.strip()[6:].strip().strip('[]')
                else:
                    body_lines.append(line)
            body_text = '\n'.join(body_lines)

            replies = [r.strip() for r in body_text.split("===") if r.strip()]

            cleaned_replies = []
            for reply in replies:
                rlines = reply.split('\n')
                cleaned_lines = [l for l in rlines if not (l.strip().startswith('【格式') or l.strip().startswith('【Format'))]
                cleaned_reply = '\n'.join(cleaned_lines).strip()
                if cleaned_reply:
                    cleaned_replies.append(cleaned_reply)

            if len(cleaned_replies) < 3:
                return [reply_text, reply_text, reply_text], title

            return cleaned_replies[:3], title

        except Exception as e:
            raise Exception(str(e))

    def compose_email(
        self,
        email_type: str,
        target_info: str,
        tone: str,
        extra_requirements: str = None,
        company_name: str = None,
        company_signature: str = None,
        products_info: str = None,
        contact_info: str = None,
        customer_background: str = None,
    ) -> dict:
        type_instructions = {
            "开发信": "这是一封主动开发信（Cold Outreach Email），目标是引起潜在客户兴趣、建立初步联系，不要过于推销，重点在于展示价值和激发回复意愿。",
            "跟进邮件": "这是一封跟进邮件（Follow-up Email），用于跟进之前的报价/沟通/样品/订单等，语气友好但目的明确，礼貌地推进下一步行动。",
            "产品推荐": "这是一封产品推荐邮件（Product Recommendation Email），向客户推荐新品或针对其需求的特定产品，突出产品优势和对客户的价值。",
            "节后跟进": "这是一封节后跟进邮件（Post-Holiday Follow-up），节假日后重新联系客户，语气轻松自然，顺带推进合作事宜。",
            "报价跟进": "这是一封报价跟进邮件（Quotation Follow-up），在发出报价后若干天无回复，礼貌询问客户意向，语气不急不慢。",
            "自定义": "根据目标客户信息和额外要求，撰写最合适的商务邮件。",
        }
        type_desc = type_instructions.get(email_type, type_instructions["自定义"])

        context_parts = []
        if company_name or contact_info:
            company_section = "【发件方信息】"
            if company_name:
                company_section += f"\n公司名称: {company_name}"
            if contact_info:
                company_section += f"\n联系方式: {contact_info}"
            context_parts.append(company_section)

        if products_info:
            context_parts.append(f"【产品背景知识】（仅供参考，不要原样输出）\n{products_info}")

        if customer_background:
            context_parts.append(f"【客户背景信息】（供参考，帮助生成更个性化的邮件，不要原样输出）\n{customer_background}")

        if extra_requirements:
            context_parts.append(f"【必须体现的要点】（以下内容必须全部自然融入邮件正文，逐条覆盖，不可遗漏任何一条）\n{extra_requirements}")

        context_block = ("\n\n" + "\n\n".join(context_parts)) if context_parts else ""

        signature_note = f"- 签名使用以下内容：\n{company_signature}" if company_signature else "- 签名位置写 [Your Name / Company]"

        checklist_reminder = ""
        if extra_requirements:
            checklist_reminder = f"\n\n写完后请自查：【必须体现的要点】中的每一条是否都已自然融入邮件？如有遗漏请补充。"

        prompt = f"""你是一名有5年以上经验的外贸业务员，英语专业、表达专业、逻辑清晰。

任务类型：{type_desc}

语气要求：{tone}

目标客户信息：
{target_info}{context_block}

请生成两个版本的邮件：

【英文邮件】
完整的商务邮件，包含：
- Subject: 主题行（吸引眼球但不夸张）
- Dear [称呼],
- 正文（3-4段，专业地道，不卑不亢）
- Best regards,
{signature_note}

重要规则：邮件中涉及对方公司名称、联系人姓名等信息，如果目标客户信息中没有提供，必须留空白占位符（如 [Company Name]、[Contact Name]），绝对不要自己虚构或编造。{checklist_reminder}

===

【中文对照版本】
将上面的英文邮件逐段翻译为中文，方便核对内容。

请用 === 分隔两个版本，不要写版本标题。"""

        try:
            result_text = self._chat(prompt)
            if not result_text:
                raise Exception("AI 未返回内容，请重试")

            parts = [p.strip() for p in result_text.split("===") if p.strip()]

            def clean(text):
                lines = text.split('\n')
                cleaned = [l for l in lines if not (l.strip().startswith('【') and l.strip().endswith('】'))]
                return '\n'.join(cleaned).strip()

            en = clean(parts[0]) if len(parts) > 0 else result_text
            zh = clean(parts[1]) if len(parts) > 1 else ""
            return {"en": en, "zh": zh}

        except Exception as e:
            raise Exception(str(e))
