from pydantic import BaseModel
from typing import Optional, List, Generic, TypeVar, Any
from datetime import datetime

T = TypeVar('T')

class PagedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int

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
    page_permissions: Optional[str] = None   # JSON array string or null
    role_id: Optional[int] = None            # 分配的角色 ID
    role_name: Optional[str] = None          # 角色名（join 后填入）

    class Config:
        from_attributes = True


class UserAdminUpdate(BaseModel):
    is_active: Optional[int] = None
    role: Optional[str] = None
    page_permissions: Optional[str] = None   # JSON array string; send null to reset to all-allowed
    role_id: Optional[int] = None            # 分配角色；-1 表示清除角色


class AdminResetPasswordRequest(BaseModel):
    new_password: str


class AdminCreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"       # "admin" | "user"
    role_id: Optional[int] = None


# ===== Role Schemas =====

class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: Optional[str] = None   # JSON array string or null (null = all)


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[str] = None


class RoleResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    permissions: Optional[str]   # JSON array string or null
    created_at: datetime

    class Config:
        from_attributes = True


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


# ===== Timemachine Schemas =====

class AnniversaryCreate(BaseModel):
    title: str
    date: str
    type: str = "custom"
    is_lunar: int = 0
    note: Optional[str] = None
    mood: Optional[str] = None
    images: Optional[str] = None   # JSON 数组字符串
    emoji: Optional[str] = None


class AnniversaryUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    type: Optional[str] = None
    is_lunar: Optional[int] = None
    note: Optional[str] = None
    mood: Optional[str] = None
    images: Optional[str] = None
    emoji: Optional[str] = None


class AnniversaryResponse(BaseModel):
    id: int
    title: str
    date: str
    type: str
    is_lunar: int = 0
    note: Optional[str]
    mood: Optional[str]
    images: Optional[str]
    emoji: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ScheduleCreate(BaseModel):
    title: str
    date: str              # YYYY-MM-DD
    time: Optional[str] = None   # HH:MM
    end_date: Optional[str] = None
    type: str = "other"    # date|travel|medical|errand|other
    priority: str = "normal"  # urgent|normal
    status: str = "pending"   # pending|done|cancelled
    note: Optional[str] = None
    emoji: Optional[str] = None


class ScheduleUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    end_date: Optional[str] = None
    type: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None
    emoji: Optional[str] = None


class ScheduleResponse(BaseModel):
    id: int
    title: str
    date: str
    time: Optional[str]
    end_date: Optional[str]
    type: str
    priority: str
    status: str
    note: Optional[str]
    images: Optional[str]
    emoji: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True



# ===== Wedding Todo Schemas =====

class WeddingTodoCreate(BaseModel):
    list_type: str = "wedding"    # "engagement" | "wedding"
    title: str
    category: Optional[str] = None
    assignee: Optional[str] = None
    status: str = "todo"          # todo|doing|done
    priority: str = "normal"      # urgent|normal
    note: Optional[str] = None
    due_date: Optional[str] = None
    sort_order: int = 0


class WeddingTodoUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    assignee: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    note: Optional[str] = None
    due_date: Optional[str] = None
    sort_order: Optional[int] = None


class WeddingTodoResponse(BaseModel):
    id: int
    list_type: str
    title: str
    category: Optional[str]
    assignee: Optional[str]
    status: str
    priority: str
    note: Optional[str]
    due_date: Optional[str]
    sort_order: int
    created_at: datetime

    class Config:
        from_attributes = True


# ===== Wedding Budget Schemas =====

class WeddingBudgetCreate(BaseModel):
    category:      str
    item_name:     str
    budget_amount: int = 0       # 单位：分（前端传入时 * 100）
    actual_amount: Optional[int] = None
    vendor:        Optional[str] = None
    paid_status:   str = "unpaid"  # unpaid|partial|paid
    note:          Optional[str] = None


class WeddingBudgetUpdate(BaseModel):
    category:      Optional[str] = None
    item_name:     Optional[str] = None
    budget_amount: Optional[int] = None
    actual_amount: Optional[int] = None
    vendor:        Optional[str] = None
    paid_status:   Optional[str] = None
    note:          Optional[str] = None


class WeddingBudgetResponse(BaseModel):
    id:            int
    category:      str
    item_name:     str
    budget_amount: int
    actual_amount: Optional[int]
    vendor:        Optional[str]
    paid_status:   str
    note:          Optional[str]
    created_at:    datetime

    class Config:
        from_attributes = True


class WeddingBudgetSummary(BaseModel):
    total_budget: int
    total_actual: int
    total_remaining: int
    by_category: List[Any]   # [{category, budget, actual, count}]


# ===== Photo Album Schemas =====

class PhotoAlbumCreate(BaseModel):
    title:       Optional[str] = None
    date:        str                       # YYYY-MM-DD
    description: Optional[str] = None
    location:    Optional[str] = None
    mood:        Optional[str] = None
    tags:        Optional[str] = None      # CSV


class PhotoAlbumUpdate(BaseModel):
    title:       Optional[str] = None
    date:        Optional[str] = None
    description: Optional[str] = None
    location:    Optional[str] = None
    mood:        Optional[str] = None
    tags:        Optional[str] = None
    cover:       Optional[str] = None


class PhotoAlbumResponse(BaseModel):
    id:          int
    title:       Optional[str]
    date:        str
    description: Optional[str]
    location:    Optional[str]
    mood:        Optional[str]
    tags:        Optional[str]
    images:      Optional[str]   # JSON array string
    cover:       Optional[str]
    created_at:  datetime

    class Config:
        from_attributes = True


class DiaryCreate(BaseModel):
    title: Optional[str] = None
    date: str                        # YYYY-MM-DD
    mood: Optional[str] = None       # happy|touched|excited|sweet|calm|sad|grateful|other
    location: Optional[str] = None
    content: Optional[str] = None    # 富文本 HTML
    weather: Optional[str] = None    # emoji


class DiaryUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    mood: Optional[str] = None
    location: Optional[str] = None
    content: Optional[str] = None
    weather: Optional[str] = None


class DiaryResponse(BaseModel):
    id: int
    title: Optional[str]
    date: str
    mood: Optional[str]
    location: Optional[str]
    content: Optional[str]
    images: Optional[str]
    weather: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

