from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class UserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: int
    created_at: datetime

    class Config:
        from_attributes = True


class UserAdminUpdate(BaseModel):
    is_active: Optional[int] = None


class AdminResetPasswordRequest(BaseModel):
    new_password: str


class UserProfileUpdate(BaseModel):
    avatar_emoji: Optional[str] = None
    avatar_url:   Optional[str] = None
    display_name: Optional[str] = None
    bio:          Optional[str] = None
    company:      Optional[str] = None
    title:        Optional[str] = None


class UserProfileResponse(UserProfileUpdate):
    username: str
    role: str

    class Config:
        from_attributes = True


class EmailGenerateRequest(BaseModel):
    chat_content: str
    scenario: str
    tone: str
    num_versions: int = 1
    extra_requirements: Optional[str] = None
    customer_id: Optional[int] = None

class EmailGenerateResponse(BaseModel):
    replies: List[str]

class EmailHistoryCreate(BaseModel):
    chat_content: str
    scenario: str
    tone: str
    generated_reply: str

class EmailHistoryResponse(BaseModel):
    id: int
    chat_content: str
    scenario: str
    tone: str
    title: Optional[str] = None
    generated_reply: str
    reply_en: Optional[str] = None
    reply_wechat: Optional[str] = None
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class TemplateCreate(BaseModel):
    name: str
    scenario: str
    tone: str
    description: Optional[str] = None
    extra_requirements: Optional[str] = None

class TemplateResponse(BaseModel):
    id: int
    name: str
    scenario: str
    tone: str
    description: Optional[str]
    extra_requirements: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class GlobalSettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    company_signature: Optional[str] = None
    products_info: Optional[str] = None
    contact_info: Optional[str] = None
    # Email account
    email_address: Optional[str] = None
    email_password: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    imap_host: Optional[str] = None
    imap_port: Optional[int] = None
    custom_email_types: Optional[str] = None   # JSON array string

class GlobalSettingsResponse(GlobalSettingsUpdate):
    id: int
    updated_at: datetime

    class Config:
        from_attributes = True


# ===== Email Center Schemas =====

class SendEmailRequest(BaseModel):
    to_address: str
    subject: str
    body: str
    customer_id: Optional[int] = None


class BulkSendItem(BaseModel):
    customer_id: int
    to_address: str
    subject: str   # already substituted
    body: str      # already substituted


class BulkSendRequest(BaseModel):
    items: List[BulkSendItem]


class SentEmailLogResponse(BaseModel):
    id: int
    to_address: str
    subject: str
    body: str
    status: str
    error_msg: Optional[str]
    bulk_id: Optional[str]
    created_at: datetime
    customer_id: Optional[int]
    customer_name: Optional[str] = None

    class Config:
        from_attributes = True


class InboxEmailItem(BaseModel):
    id: str
    from_address: str
    from_name: str
    subject: str
    preview: str
    body: str
    date: str
    is_read: bool


class CustomerEmailItem(BaseModel):
    id: str
    folder: str
    direction: str   # "from" | "to"
    from_address: str
    subject: str
    preview: str
    body: str
    date: str


class FeedbackCreate(BaseModel):
    content: str
    category: Optional[str] = None


class FeedbackStatusUpdate(BaseModel):
    status: str


class FeedbackResponse(BaseModel):
    id: int
    content: str
    category: Optional[str]
    status: str
    screenshot_paths: Optional[str] = None   # JSON array string
    created_at: datetime

    class Config:
        from_attributes = True


class ComposeRequest(BaseModel):
    email_type: str
    target_info: str
    tone: str
    extra_requirements: Optional[str] = None
    customer_id: Optional[int] = None


class ComposeResponse(BaseModel):
    en: str
    zh: str


class ComposeHistoryResponse(BaseModel):
    id: int
    email_type: str
    target_info: str
    tone: str
    reply_en: str
    reply_zh: Optional[str]
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ComposeTemplateCreate(BaseModel):
    name: str
    email_type: str
    tone: str
    description: Optional[str] = None
    fixed_requirements: Optional[str] = None


class ComposeTemplateResponse(BaseModel):
    id: int
    name: str
    email_type: str
    tone: str
    description: Optional[str]
    fixed_requirements: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ===== Customer Schemas =====

class CustomerCreate(BaseModel):
    name: str
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    industry: Optional[str] = None
    product_pref: Optional[str] = None
    tags: Optional[str] = None
    background: Optional[str] = None
    status: str = "prospect"


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    industry: Optional[str] = None
    product_pref: Optional[str] = None
    tags: Optional[str] = None
    background: Optional[str] = None
    status: Optional[str] = None


class CustomerResponse(BaseModel):
    id: int
    name: str
    company: Optional[str]
    email: Optional[str]
    phone: Optional[str]
    country: Optional[str]
    industry: Optional[str]
    product_pref: Optional[str]
    tags: Optional[str]
    background: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CustomerHistoryItem(BaseModel):
    kind: str        # "reply" | "compose"
    id: int
    summary: str     # title 或 email_type
    preview: str     # 前 100 字
    created_at: datetime

    class Config:
        from_attributes = True


class EmailTemplateCreate(BaseModel):
    name: str
    subject: str
    body: str
    description: Optional[str] = None


class EmailTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    description: Optional[str] = None


class EmailTemplateResponse(BaseModel):
    id: int
    name: str
    subject: str
    body: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
