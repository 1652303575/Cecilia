from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from typing import List, Optional
import secrets
import os
import csv
import io
from datetime import datetime, date

from database import (
    get_db, init_db,
    User, EmailHistory, Template, GlobalSettings, Feedback,
    ComposeHistory, ComposeTemplate, Customer, SentEmailLog, EmailTemplate,
    Anniversary, Schedule, Diary, WeddingTodo, WeddingBudget, Role, PhotoAlbum,
)
from schemas import (
    LoginRequest,
    EmailGenerateRequest, EmailGenerateResponse,
    EmailHistoryCreate, EmailHistoryResponse,
    TemplateCreate, TemplateResponse,
    GlobalSettingsUpdate, GlobalSettingsResponse,
    FeedbackCreate, FeedbackStatusUpdate, FeedbackResponse,
    ComposeRequest, ComposeResponse, ComposeHistoryResponse,
    ComposeTemplateCreate, ComposeTemplateResponse,
    CustomerCreate, CustomerUpdate, CustomerResponse, CustomerHistoryItem,
    ChangePasswordRequest, UserResponse, UserAdminUpdate, AdminResetPasswordRequest,
    AdminCreateUserRequest,
    UserProfileUpdate, UserProfileResponse,
    SendEmailRequest, BulkSendRequest, SentEmailLogResponse,
    InboxEmailItem, CustomerEmailItem,
    EmailTemplateCreate, EmailTemplateUpdate, EmailTemplateResponse,
    PagedResponse,
    AnniversaryCreate, AnniversaryUpdate, AnniversaryResponse,
    ScheduleCreate, ScheduleUpdate, ScheduleResponse,
    DiaryCreate, DiaryUpdate, DiaryResponse,
    WeddingTodoCreate, WeddingTodoUpdate, WeddingTodoResponse,
    WeddingBudgetCreate, WeddingBudgetUpdate, WeddingBudgetResponse, WeddingBudgetSummary,
    RoleCreate, RoleUpdate, RoleResponse,
    PhotoAlbumCreate, PhotoAlbumUpdate, PhotoAlbumResponse,
)
from email_service import EmailGeneratorService
import uuid

# Initialize FastAPI app
app = FastAPI(title="Cecilia Auto Mail", version="1.0.0")

# Session middleware (must be added before mounting static files)
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "cecilia-auto-mail-secret-key-change-me"),
    session_cookie="cecilia_session",
    max_age=7 * 24 * 3600,   # 7 days
    https_only=False,
    same_site="lax",
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Initialize database
init_db()

# Ensure upload directory exists
os.makedirs("static/uploads/feedback", exist_ok=True)

# Initialize email generator service
email_service = EmailGeneratorService()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ===== Auth Dependency =====

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="请先登录")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    if not user.is_active:
        request.session.clear()
        raise HTTPException(status_code=401, detail="账号已被禁用，请联系管理员")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user


def _user_filter(query, model, current_user: User):
    """Apply user_id filter for non-admin users."""
    if current_user.role != "admin":
        query = query.filter(model.user_id == current_user.id)
    return query


def _paginate(query, page: int, page_size: int):
    """Apply pagination to a SQLAlchemy query. Returns (items, total, total_pages)."""
    total = query.count()
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = min(max(1, page), total_pages)
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return items, total, page, total_pages


def _build_customer_background(cust: Customer) -> Optional[str]:
    if not cust:
        return None
    parts = []
    if cust.background:
        parts.append(cust.background)
    if cust.industry:
        parts.append(f"行业：{cust.industry}")
    if cust.product_pref:
        parts.append(f"产品偏好：{cust.product_pref}")
    if cust.tags:
        parts.append(f"标签：{cust.tags}")
    return "\n".join(parts) if parts else None


# ===== Auth Routes =====

@app.get("/", response_class=HTMLResponse)
async def read_root():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.post("/api/login")
async def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已被禁用，请联系管理员")
    request.session["user_id"] = user.id
    return {"username": user.username, "role": user.role, "page_permissions": _resolve_permissions(user, db)}


@app.post("/api/logout")
async def logout(request: Request):
    request.session.clear()
    return {"message": "已退出登录"}


@app.get("/api/me")
async def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"username": current_user.username, "role": current_user.role,
            "page_permissions": _resolve_permissions(current_user, db)}


def _resolve_permissions(user: User, db: Session):
    """Return effective page_permissions string:
    - admin → None (no restriction)
    - user with own page_permissions set → use that
    - user with role_id → inherit role permissions
    - otherwise → None (all allowed)
    """
    if user.role == "admin":
        return None
    if user.page_permissions is not None:
        return user.page_permissions
    if user.role_id:
        role = db.query(Role).filter(Role.id == user.role_id).first()
        if role and role.permissions is not None:
            return role.permissions
    return None


@app.post("/api/me/password")
async def change_password(
    body: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not pwd_context.verify(body.old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="当前密码不正确")
    if len(body.new_password) < 4:
        raise HTTPException(status_code=400, detail="新密码至少需要4位")
    current_user.password_hash = pwd_context.hash(body.new_password)
    db.commit()
    return {"message": "密码已修改"}


@app.get("/api/me/profile", response_model=UserProfileResponse)
async def get_profile(current_user: User = Depends(get_current_user)):
    return current_user


@app.put("/api/me/profile", response_model=UserProfileResponse)
async def update_profile(
    body: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for field, value in body.dict(exclude_unset=True).items():
        setattr(current_user, field, value)
    db.commit()
    db.refresh(current_user)
    return current_user


ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
AVATAR_MAX_BYTES = 3 * 1024 * 1024  # 3MB

@app.post("/api/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=400, detail="仅支持 JPG / PNG / GIF / WebP 格式")
    data = await file.read()
    if len(data) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="图片不能超过 3MB")

    os.makedirs("static/uploads/avatars", exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    filename = f"user_{current_user.id}{ext}"
    save_path = os.path.join("static", "uploads", "avatars", filename)

    # 删除旧头像（不同扩展名）
    for old in ["jpg", "jpeg", "png", "gif", "webp"]:
        old_path = os.path.join("static", "uploads", "avatars", f"user_{current_user.id}.{old}")
        if os.path.exists(old_path) and old_path != save_path:
            os.remove(old_path)

    with open(save_path, "wb") as f:
        f.write(data)

    url = f"/static/uploads/avatars/{filename}"
    current_user.avatar_url = url
    current_user.avatar_emoji = None   # 上传图片后清空 emoji
    db.commit()
    return {"avatar_url": url}




@app.get("/api/admin/users", response_model=List[UserResponse])
async def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    import json as _json
    users = db.query(User).order_by(User.created_at).all()
    # 构建角色 id→name 映射
    role_map = {r.id: r.name for r in db.query(Role).all()}
    result = []
    for u in users:
        d = UserResponse.model_validate(u)
        d.role_name = role_map.get(u.role_id)
        # 若用户分配了角色且没有单独权限，则继承角色权限
        if u.role_id and not u.page_permissions:
            role_obj = db.query(Role).filter(Role.id == u.role_id).first()
            if role_obj:
                d.page_permissions = role_obj.permissions
        result.append(d)
    return result


@app.post("/api/admin/users", response_model=UserResponse, status_code=201)
async def create_user(
    body: AdminCreateUserRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="用户名已存在")
    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="密码至少需要4位")
    if body.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="角色值无效")
    role_id = body.role_id
    if role_id:
        role_obj = db.query(Role).filter(Role.id == role_id).first()
        if not role_obj:
            raise HTTPException(status_code=400, detail="指定的角色不存在")
    new_user = User(
        username=body.username,
        password_hash=pwd_context.hash(body.password),
        role=body.role,
        role_id=role_id,
        is_active=1,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    d = UserResponse.model_validate(new_user)
    if role_id:
        role_obj = db.query(Role).filter(Role.id == role_id).first()
        d.role_name = role_obj.name if role_obj else None
    return d


@app.patch("/api/admin/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    body: UserAdminUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == current_user.id and body.is_active == 0:
        raise HTTPException(status_code=400, detail="不能禁用自己的账号")
    if user.id == current_user.id and body.role == "user":
        raise HTTPException(status_code=400, detail="不能降低自己的权限")
    if body.role and body.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="角色值无效，只能是 admin 或 user")
    update_data = body.model_dump(exclude_unset=True)
    # role_id = -1 表示清除角色
    if "role_id" in update_data:
        if update_data["role_id"] == -1:
            update_data["role_id"] = None
        elif update_data["role_id"] is not None:
            role_obj = db.query(Role).filter(Role.id == update_data["role_id"]).first()
            if not role_obj:
                raise HTTPException(status_code=400, detail="指定角色不存在")
    for key, value in update_data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    d = UserResponse.model_validate(user)
    role_map = {r.id: r.name for r in db.query(Role).all()}
    d.role_name = role_map.get(user.role_id)
    return d


@app.post("/api/admin/users/{user_id}/reset-password")
async def admin_reset_password(
    user_id: int,
    body: AdminResetPasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if len(body.new_password) < 4:
        raise HTTPException(status_code=400, detail="密码至少需要4位")
    user.password_hash = pwd_context.hash(body.new_password)
    db.commit()
    return {"message": f"已重置 {user.username} 的密码"}


# Pages that can be toggled per-user (validated server-side)
_KNOWN_PERMISSIONABLE = {
    "emailInbox", "emailSend", "emailBulk", "emailSentLog", "contactStats",
    "emailTemplates", "generator", "history", "templates", "compose",
    "composeHistory", "composeTemplates", "customers", "settings", "feedback",
    "anniversaries", "schedules", "diaries",
    "engagementTodos", "weddingTodos", "weddingBudget", "photoAlbum",
}


@app.get("/api/admin/users/{user_id}/permissions")
async def get_user_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return {"user_id": user_id, "username": user.username, "page_permissions": user.page_permissions}


@app.put("/api/admin/users/{user_id}/permissions")
async def set_user_permissions(
    user_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    import json
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="管理员不受页面权限限制")
    permissions = body.get("page_permissions")
    if permissions is None:
        user.page_permissions = None   # NULL = all non-admin pages allowed
    else:
        if not isinstance(permissions, list):
            raise HTTPException(status_code=422, detail="page_permissions 必须是数组或 null")
        valid = [p for p in permissions if p in _KNOWN_PERMISSIONABLE]
        user.page_permissions = json.dumps(valid, ensure_ascii=False)
    db.commit()
    return {"user_id": user_id, "page_permissions": user.page_permissions}


# ===== Role Management =====

@app.get("/api/admin/roles", response_model=List[RoleResponse])
def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return db.query(Role).order_by(Role.created_at).all()


@app.post("/api/admin/roles", response_model=RoleResponse, status_code=201)
def create_role(
    body: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    import json
    if db.query(Role).filter(Role.name == body.name).first():
        raise HTTPException(status_code=400, detail="角色名已存在")
    perm = body.permissions
    if perm is not None:
        try:
            arr = json.loads(perm)
            valid = [p for p in arr if p in _KNOWN_PERMISSIONABLE]
            perm = json.dumps(valid, ensure_ascii=False)
        except Exception:
            raise HTTPException(status_code=422, detail="permissions 格式错误")
    record = Role(name=body.name, description=body.description, permissions=perm)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.patch("/api/admin/roles/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: int, body: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    import json
    record = db.query(Role).filter(Role.id == role_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="角色不存在")
    updates = body.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"] != record.name:
        if db.query(Role).filter(Role.name == updates["name"]).first():
            raise HTTPException(status_code=400, detail="角色名已存在")
    if "permissions" in updates and updates["permissions"] is not None:
        try:
            arr = json.loads(updates["permissions"])
            valid = [p for p in arr if p in _KNOWN_PERMISSIONABLE]
            updates["permissions"] = json.dumps(valid, ensure_ascii=False)
        except Exception:
            raise HTTPException(status_code=422, detail="permissions 格式错误")
    for k, v in updates.items():
        setattr(record, k, v)
    db.commit()
    db.refresh(record)
    return record


@app.delete("/api/admin/roles/{role_id}")
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    record = db.query(Role).filter(Role.id == role_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="角色不存在")
    # 解除该角色下所有用户的绑定
    db.query(User).filter(User.role_id == role_id).update({"role_id": None})
    db.delete(record)
    db.commit()
    return {"message": "已删除"}


# ===== Email Generation =====

@app.post("/api/generate", response_model=EmailGenerateResponse)
async def generate_email(
    request: EmailGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        settings = db.query(GlobalSettings).first()

        customer_bg = None
        if request.customer_id:
            cust = db.query(Customer).filter(Customer.id == request.customer_id).first()
            customer_bg = _build_customer_background(cust)

        replies, title = email_service.generate_email_reply(
            chat_content=request.chat_content,
            scenario=request.scenario,
            tone=request.tone,
            num_versions=request.num_versions,
            extra_requirements=request.extra_requirements,
            company_name=settings.company_name if settings else None,
            company_signature=settings.company_signature if settings else None,
            products_info=settings.products_info if settings else None,
            contact_info=settings.contact_info if settings else None,
            customer_background=customer_bg,
        )

        history = EmailHistory(
            chat_content=request.chat_content,
            scenario=request.scenario,
            tone=request.tone,
            title=title,
            generated_reply=replies[0],
            reply_en=replies[1] if len(replies) > 1 else None,
            reply_wechat=replies[2] if len(replies) > 2 else None,
            customer_id=request.customer_id or None,
            user_id=current_user.id,
        )
        db.add(history)
        db.commit()
        return EmailGenerateResponse(replies=replies)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.get("/api/history", response_model=List[EmailHistoryResponse])
async def get_history(
    limit: int = 50,
    q: Optional[str] = None,
    customer: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(EmailHistory).order_by(EmailHistory.created_at.desc())
    query = _user_filter(query, EmailHistory, current_user)
    if q:
        kw = f"%{q}%"
        query = query.filter(
            EmailHistory.generated_reply.ilike(kw) |
            EmailHistory.chat_content.ilike(kw) |
            EmailHistory.scenario.ilike(kw)
        )
    history = query.limit(limit).all()

    result = []
    for h in history:
        item = EmailHistoryResponse.model_validate(h)
        if h.customer_id:
            cust = db.query(Customer).filter(Customer.id == h.customer_id).first()
            item.customer_name = cust.name if cust else None
        result.append(item)

    if customer:
        cname = customer.lower()
        result = [r for r in result if r.customer_name and cname in r.customer_name.lower()]

    return result


@app.delete("/api/history/{history_id}")
async def delete_history(
    history_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(EmailHistory).filter(EmailHistory.id == history_id)
    q = _user_filter(q, EmailHistory, current_user)
    record = q.first()
    if not record:
        raise HTTPException(status_code=404, detail="History record not found")
    db.delete(record)
    db.commit()
    return {"message": "History deleted successfully"}


# ===== Templates =====

@app.post("/api/templates", response_model=TemplateResponse)
async def create_template(
    template: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(Template).filter(
        Template.name == template.name,
        Template.user_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Template with this name already exists")
    new_template = Template(**template.dict(), user_id=current_user.id)
    db.add(new_template)
    db.commit()
    db.refresh(new_template)
    return new_template


@app.get("/api/templates")
async def get_templates(
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Template).order_by(Template.created_at.desc())
    q = _user_filter(q, Template, current_user)
    if search:
        kw = f"%{search}%"
        q = q.filter(Template.name.ilike(kw) | Template.scenario.ilike(kw) | Template.description.ilike(kw))
    items, total, page, total_pages = _paginate(q, page, page_size)
    return {"items": [TemplateResponse.model_validate(t) for t in items], "total": total, "page": page, "page_size": page_size, "total_pages": total_pages}


@app.delete("/api/templates/{template_id}")
async def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Template).filter(Template.id == template_id)
    q = _user_filter(q, Template, current_user)
    template = q.first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(template)
    db.commit()
    return {"message": "Template deleted successfully"}


# ===== Global Settings (shared, not user-scoped) =====

@app.get("/api/settings", response_model=GlobalSettingsResponse)
async def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = db.query(GlobalSettings).first()
    if not settings:
        settings = GlobalSettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@app.put("/api/settings", response_model=GlobalSettingsResponse)
async def update_settings(
    settings_data: GlobalSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    settings = db.query(GlobalSettings).first()
    if not settings:
        settings = GlobalSettings(**settings_data.dict())
        db.add(settings)
    else:
        for key, value in settings_data.dict().items():
            setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings


# ===== Custom Email Types =====

@app.get("/api/custom-email-types")
async def get_custom_email_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json as _json
    settings = db.query(GlobalSettings).first()
    if not settings or not settings.custom_email_types:
        return []
    try:
        return _json.loads(settings.custom_email_types)
    except Exception:
        return []


@app.put("/api/custom-email-types")
async def save_custom_email_types(
    types: List[str],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json as _json
    # Deduplicate and strip, max 20
    cleaned = list(dict.fromkeys(t.strip() for t in types if t.strip()))[:20]
    settings = db.query(GlobalSettings).first()
    if not settings:
        settings = GlobalSettings()
        db.add(settings)
    settings.custom_email_types = _json.dumps(cleaned, ensure_ascii=False)
    db.commit()
    return cleaned

# ===== Feedback (submit: any user; manage: admin only) =====

@app.post("/api/feedback", response_model=FeedbackResponse)
async def create_feedback(
    content: str = Form(...),
    category: Optional[str] = Form(None),
    screenshots: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json as _json
    paths = []
    for screenshot in screenshots:
        if not screenshot.filename:
            continue
        data = await screenshot.read()
        if len(data) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"截图「{screenshot.filename}」不能超过 5MB")
        ext = os.path.splitext(screenshot.filename)[1].lower() or ".png"
        filename = f"{uuid.uuid4().hex}{ext}"
        save_path = os.path.join("static", "uploads", "feedback", filename)
        with open(save_path, "wb") as f:
            f.write(data)
        paths.append(f"/static/uploads/feedback/{filename}")

    new_feedback = Feedback(
        content=content,
        category=category,
        screenshot_paths=_json.dumps(paths) if paths else None,
    )
    db.add(new_feedback)
    db.commit()
    db.refresh(new_feedback)
    return new_feedback


@app.get("/api/feedback")
async def get_feedback(
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    q = db.query(Feedback).order_by(Feedback.created_at.desc())
    if search:
        q = q.filter(Feedback.content.ilike(f"%{search}%"))
    if status_filter:
        q = q.filter(Feedback.status == status_filter)
    items, total, page, total_pages = _paginate(q, page, page_size)
    return {"items": [FeedbackResponse.model_validate(f) for f in items], "total": total, "page": page, "page_size": page_size, "total_pages": total_pages}


@app.patch("/api/feedback/{feedback_id}/status", response_model=FeedbackResponse)
async def update_feedback_status(
    feedback_id: int,
    body: FeedbackStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")
    feedback.status = body.status
    db.commit()
    db.refresh(feedback)
    return feedback


@app.delete("/api/feedback/{feedback_id}")
async def delete_feedback(
    feedback_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")
    # Clean up uploaded screenshot files if any
    if feedback.screenshot_paths:
        import json as _json
        try:
            paths = _json.loads(feedback.screenshot_paths)
            for p in paths:
                file_path = p.lstrip("/")
                if os.path.exists(file_path):
                    os.remove(file_path)
        except Exception:
            pass
    db.delete(feedback)
    db.commit()
    return {"message": "Feedback deleted successfully"}


# ===== Compose =====

@app.post("/api/compose", response_model=ComposeResponse)
async def compose_email(
    request: ComposeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        settings = db.query(GlobalSettings).first()

        customer_bg = None
        if request.customer_id:
            cust = db.query(Customer).filter(Customer.id == request.customer_id).first()
            customer_bg = _build_customer_background(cust)

        result = email_service.compose_email(
            email_type=request.email_type,
            target_info=request.target_info,
            tone=request.tone,
            extra_requirements=request.extra_requirements,
            company_name=settings.company_name if settings else None,
            company_signature=settings.company_signature if settings else None,
            products_info=settings.products_info if settings else None,
            contact_info=settings.contact_info if settings else None,
            customer_background=customer_bg,
        )
        record = ComposeHistory(
            email_type=request.email_type,
            target_info=request.target_info,
            tone=request.tone,
            reply_en=result["en"],
            reply_zh=result.get("zh", ""),
            customer_id=request.customer_id or None,
            user_id=current_user.id,
        )
        db.add(record)
        db.commit()
        return ComposeResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@app.get("/api/compose/history", response_model=List[ComposeHistoryResponse])
async def get_compose_history(
    limit: int = 50,
    q: Optional[str] = None,
    customer: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ComposeHistory).order_by(ComposeHistory.created_at.desc())
    query = _user_filter(query, ComposeHistory, current_user)
    if q:
        kw = f"%{q}%"
        query = query.filter(
            ComposeHistory.reply_en.ilike(kw) |
            ComposeHistory.reply_zh.ilike(kw) |
            ComposeHistory.email_type.ilike(kw)
        )
    records = query.limit(limit).all()

    result = []
    for h in records:
        item = ComposeHistoryResponse.model_validate(h)
        if h.customer_id:
            cust = db.query(Customer).filter(Customer.id == h.customer_id).first()
            item.customer_name = cust.name if cust else None
        result.append(item)

    if customer:
        cname = customer.lower()
        result = [r for r in result if r.customer_name and cname in r.customer_name.lower()]

    return result


@app.delete("/api/compose/history/{record_id}")
async def delete_compose_history(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ComposeHistory).filter(ComposeHistory.id == record_id)
    q = _user_filter(q, ComposeHistory, current_user)
    record = q.first()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(record)
    db.commit()
    return {"message": "Deleted successfully"}


# ===== Compose Templates =====

@app.post("/api/compose/templates", response_model=ComposeTemplateResponse)
async def create_compose_template(
    t: ComposeTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    existing = db.query(ComposeTemplate).filter(
        ComposeTemplate.name == t.name,
        ComposeTemplate.user_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="模板名称已存在")
    record = ComposeTemplate(**t.model_dump(), user_id=current_user.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/api/compose/templates", response_model=List[ComposeTemplateResponse])
async def get_compose_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ComposeTemplate).order_by(ComposeTemplate.created_at.desc())
    q = _user_filter(q, ComposeTemplate, current_user)
    return q.all()


@app.delete("/api/compose/templates/{template_id}")
async def delete_compose_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ComposeTemplate).filter(ComposeTemplate.id == template_id)
    q = _user_filter(q, ComposeTemplate, current_user)
    record = q.first()
    if not record:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(record)
    db.commit()
    return {"message": "Deleted successfully"}


# ===== Customers =====

@app.post("/api/customers", response_model=CustomerResponse, status_code=201)
async def create_customer(
    customer: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = Customer(**customer.model_dump(), user_id=current_user.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


CUSTOMER_CSV_COLUMNS = ["name", "company", "email", "phone", "country", "industry", "product_pref", "tags", "background", "status"]
VALID_STATUSES = {"prospect", "active", "paused", "closed"}

@app.post("/api/customers/import-csv")
async def import_customers_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="请上传 .csv 文件")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handle BOM
    except UnicodeDecodeError:
        text = content.decode("gbk", errors="replace")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "name" not in [f.strip().lower() for f in reader.fieldnames]:
        raise HTTPException(status_code=400, detail="CSV 文件必须包含 name 列")

    # Normalize fieldnames to lowercase stripped
    reader.fieldnames = [f.strip().lower() for f in reader.fieldnames]

    imported, skipped, errors = 0, 0, []
    for i, row in enumerate(reader, start=2):  # row 1 = header
        name = (row.get("name") or "").strip()
        if not name:
            skipped += 1
            continue
        status_val = (row.get("status") or "prospect").strip().lower()
        if status_val not in VALID_STATUSES:
            status_val = "prospect"
        try:
            record = Customer(
                name=name,
                company=(row.get("company") or "").strip() or None,
                email=(row.get("email") or "").strip() or None,
                phone=(row.get("phone") or "").strip() or None,
                country=(row.get("country") or "").strip() or None,
                industry=(row.get("industry") or "").strip() or None,
                product_pref=(row.get("product_pref") or "").strip() or None,
                tags=(row.get("tags") or "").strip() or None,
                background=(row.get("background") or "").strip() or None,
                status=status_val,
                user_id=current_user.id,
            )
            db.add(record)
            imported += 1
        except Exception as ex:
            errors.append(f"第 {i} 行：{str(ex)}")

    db.commit()
    return {"imported": imported, "skipped": skipped, "errors": errors}


@app.get("/api/customers/countries")
async def list_customer_countries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return distinct non-null countries from this user's customers, sorted."""
    q = db.query(Customer.country).filter(Customer.country != None, Customer.country != "")
    q = _user_filter(q, Customer, current_user)
    rows = q.distinct().all()
    return sorted([r[0] for r in rows])


@app.get("/api/customers")
async def list_customers(
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Customer).order_by(Customer.created_at.desc())
    q = _user_filter(q, Customer, current_user)
    if status:
        q = q.filter(Customer.status == status)
    if search:
        kw = f"%{search}%"
        q = q.filter(
            Customer.name.ilike(kw) |
            Customer.company.ilike(kw) |
            Customer.email.ilike(kw) |
            Customer.country.ilike(kw)
        )
    items, total, page, total_pages = _paginate(q, page, page_size)
    return {"items": [CustomerResponse.model_validate(c) for c in items], "total": total, "page": page, "page_size": page_size, "total_pages": total_pages}


@app.get("/api/customers/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Customer).filter(Customer.id == customer_id)
    q = _user_filter(q, Customer, current_user)
    c = q.first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    return c


@app.put("/api/customers/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Customer).filter(Customer.id == customer_id)
    q = _user_filter(q, Customer, current_user)
    c = q.first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(c, key, value)
    db.commit()
    db.refresh(c)
    return c


@app.delete("/api/customers/{customer_id}")
async def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Customer).filter(Customer.id == customer_id)
    q = _user_filter(q, Customer, current_user)
    c = q.first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(c)
    db.commit()
    return {"message": "Customer deleted successfully"}


@app.get("/api/customers/{customer_id}/history", response_model=List[CustomerHistoryItem])
async def get_customer_history(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify customer belongs to current user (or is admin)
    q = db.query(Customer).filter(Customer.id == customer_id)
    q = _user_filter(q, Customer, current_user)
    c = q.first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")

    items = []

    replies = db.query(EmailHistory).filter(
        EmailHistory.customer_id == customer_id
    ).order_by(EmailHistory.created_at.desc()).all()
    for r in replies:
        items.append(CustomerHistoryItem(
            kind="reply",
            id=r.id,
            summary=r.title or r.scenario,
            preview=(r.generated_reply or "")[:100],
            created_at=r.created_at,
        ))

    composes = db.query(ComposeHistory).filter(
        ComposeHistory.customer_id == customer_id
    ).order_by(ComposeHistory.created_at.desc()).all()
    for h in composes:
        items.append(CustomerHistoryItem(
            kind="compose",
            id=h.id,
            summary=h.email_type,
            preview=(h.reply_en or "")[:100],
            created_at=h.created_at,
        ))

    items.sort(key=lambda x: x.created_at, reverse=True)
    return items


# ===== Email Center =====

def _get_email_settings(db: Session):
    """Return GlobalSettings and validate email config is present."""
    settings = db.query(GlobalSettings).first()
    if not settings or not settings.email_address or not settings.email_password:
        raise HTTPException(
            status_code=400,
            detail="请先在「全局设置」中配置邮箱账号和密码"
        )
    return settings


@app.post("/api/email-center/test-connection")
async def test_email_connection(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test SMTP and IMAP connection with current settings."""
    from email_center_service import test_connection
    settings = _get_email_settings(db)
    result = test_connection(
        smtp_host=settings.smtp_host or "smtp.qiye.aliyun.com",
        smtp_port=settings.smtp_port or 465,
        imap_host=settings.imap_host or "imap.qiye.aliyun.com",
        imap_port=settings.imap_port or 993,
        email_address=settings.email_address,
        email_password=settings.email_password,
    )
    return result


@app.get("/api/email-center/inbox")
async def get_inbox(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch recent inbox emails via IMAP."""
    from email_center_service import fetch_inbox
    settings = _get_email_settings(db)
    try:
        emails = fetch_inbox(
            imap_host=settings.imap_host or "imap.qiye.aliyun.com",
            imap_port=settings.imap_port or 993,
            email_address=settings.email_address,
            email_password=settings.email_password,
            limit=limit,
        )
        return emails
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"收取邮件失败：{str(e)}")


@app.get("/api/email-center/customer-emails/{customer_id}")
async def get_customer_emails(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch all emails to/from a specific customer by their email address."""
    from email_center_service import fetch_email_by_address
    # Verify customer access
    q = db.query(Customer).filter(Customer.id == customer_id)
    q = _user_filter(q, Customer, current_user)
    cust = q.first()
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    if not cust.email:
        raise HTTPException(status_code=400, detail="该客户没有邮箱地址")
    settings = _get_email_settings(db)
    try:
        emails = fetch_email_by_address(
            imap_host=settings.imap_host or "imap.qiye.aliyun.com",
            imap_port=settings.imap_port or 993,
            email_address=settings.email_address,
            email_password=settings.email_password,
            target_address=cust.email,
        )
        return emails
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取往来邮件失败：{str(e)}")


@app.post("/api/email-center/send")
async def send_single_email(
    to_address: str = Form(...),
    subject: str = Form(...),
    body: str = Form(...),
    customer_id: Optional[int] = Form(None),
    cc_addresses: str = Form(""),
    bcc_addresses: str = Form(""),
    attachments: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a single email (with optional attachments, CC, BCC) and log the result."""
    from email_center_service import send_email
    settings = _get_email_settings(db)

    cc_list = [a.strip() for a in cc_addresses.split(",") if a.strip()] if cc_addresses else []
    bcc_list = [a.strip() for a in bcc_addresses.split(",") if a.strip()] if bcc_addresses else []

    attachment_data = []
    for f in attachments:
        if f.filename:
            content = await f.read()
            attachment_data.append((f.filename, content, f.content_type or "application/octet-stream"))

    log = SentEmailLog(
        to_address=to_address,
        subject=subject,
        body=body,
        customer_id=customer_id,
        user_id=current_user.id,
    )
    try:
        send_email(
            smtp_host=settings.smtp_host or "smtp.qiye.aliyun.com",
            smtp_port=settings.smtp_port or 465,
            email_address=settings.email_address,
            email_password=settings.email_password,
            to_address=to_address,
            subject=subject,
            body=body,
            attachments=attachment_data or None,
            cc_addresses=cc_list or None,
            bcc_addresses=bcc_list or None,
        )
        log.status = "sent"
    except Exception as e:
        log.status = "failed"
        log.error_msg = str(e)
        db.add(log)
        db.commit()
        raise HTTPException(status_code=500, detail=f"发送失败：{str(e)}")
    db.add(log)
    db.commit()
    return {"message": "发送成功"}


@app.post("/api/email-center/bulk-send")
async def bulk_send_emails(
    items_json: str = Form(...),
    attachments: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk send personalized emails to multiple customers, with optional shared attachments."""
    import json as _json
    from email_center_service import send_email
    settings = _get_email_settings(db)

    try:
        items_data = _json.loads(items_json)
    except Exception:
        raise HTTPException(status_code=400, detail="items_json 格式错误")

    # 预读附件内容（避免在循环中多次 await）
    attachment_data = []
    for f in attachments:
        if f.filename:
            content = await f.read()
            attachment_data.append((f.filename, content, f.content_type or "application/octet-stream"))

    batch_id = str(uuid.uuid4())[:8]
    results = []

    for item in items_data:
        log = SentEmailLog(
            to_address=item["to_address"],
            subject=item["subject"],
            body=item["body"],
            bulk_id=batch_id,
            customer_id=item.get("customer_id"),
            user_id=current_user.id,
        )
        try:
            send_email(
                smtp_host=settings.smtp_host or "smtp.qiye.aliyun.com",
                smtp_port=settings.smtp_port or 465,
                email_address=settings.email_address,
                email_password=settings.email_password,
                to_address=item["to_address"],
                subject=item["subject"],
                body=item["body"],
                attachments=attachment_data or None,
            )
            log.status = "sent"
            results.append({"to": item["to_address"], "status": "sent"})
        except Exception as e:
            log.status = "failed"
            log.error_msg = str(e)
            results.append({"to": item["to_address"], "status": "failed", "error": str(e)})
        db.add(log)

    db.commit()
    sent = sum(1 for r in results if r["status"] == "sent")
    failed = len(results) - sent
    return {"batch_id": batch_id, "total": len(results), "sent": sent, "failed": failed, "details": results}


@app.get("/api/email-center/sent-log")
async def get_sent_log(
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get sent email log for the current user."""
    q = db.query(SentEmailLog).order_by(SentEmailLog.created_at.desc())
    if current_user.role != "admin":
        q = q.filter(SentEmailLog.user_id == current_user.id)
    if search:
        kw = f"%{search}%"
        q = q.filter(SentEmailLog.to_address.ilike(kw) | SentEmailLog.subject.ilike(kw))
    if status_filter:
        q = q.filter(SentEmailLog.status == status_filter)

    records, total, page, total_pages = _paginate(q, page, page_size)

    # Attach customer names
    cust_ids = list({r.customer_id for r in records if r.customer_id})
    cust_map = {}
    if cust_ids:
        custs = db.query(Customer).filter(Customer.id.in_(cust_ids)).all()
        cust_map = {c.id: c.name for c in custs}

    items = []
    for r in records:
        item = SentEmailLogResponse.model_validate(r)
        item.customer_name = cust_map.get(r.customer_id)
        items.append(item)
    return {"items": items, "total": total, "page": page, "page_size": page_size, "total_pages": total_pages}


@app.get("/api/email-center/contact-stats")
async def get_contact_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return per-customer contact frequency stats based on sent log + AI generation history.
    Uses aggregated queries to avoid N+1 performance issues.
    """
    from sqlalchemy import func, case

    uid_filter = current_user.id if current_user.role != "admin" else None

    # Get all customers
    cust_q = db.query(Customer)
    if uid_filter:
        cust_q = cust_q.filter(Customer.user_id == uid_filter)
    customers = cust_q.all()
    if not customers:
        return []

    cust_ids = [c.id for c in customers]

    # Aggregate sent log: count + max date per customer
    sent_agg = db.query(
        SentEmailLog.customer_id,
        func.count(SentEmailLog.id).label("sent_count"),
        func.max(SentEmailLog.created_at).label("last_sent"),
    ).filter(SentEmailLog.customer_id.in_(cust_ids)).group_by(SentEmailLog.customer_id).all()
    sent_map = {r.customer_id: r for r in sent_agg}

    # Aggregate email history: count + max date per customer
    reply_agg = db.query(
        EmailHistory.customer_id,
        func.count(EmailHistory.id).label("reply_count"),
        func.max(EmailHistory.created_at).label("last_reply"),
    ).filter(EmailHistory.customer_id.in_(cust_ids)).group_by(EmailHistory.customer_id).all()
    reply_map = {r.customer_id: r for r in reply_agg}

    # Aggregate compose history: count + max date per customer
    compose_agg = db.query(
        ComposeHistory.customer_id,
        func.count(ComposeHistory.id).label("compose_count"),
        func.max(ComposeHistory.created_at).label("last_compose"),
    ).filter(ComposeHistory.customer_id.in_(cust_ids)).group_by(ComposeHistory.customer_id).all()
    compose_map = {r.customer_id: r for r in compose_agg}

    stats = []
    for cust in customers:
        s = sent_map.get(cust.id)
        r = reply_map.get(cust.id)
        c = compose_map.get(cust.id)

        sent_count    = s.sent_count    if s else 0
        reply_count   = r.reply_count   if r else 0
        compose_count = c.compose_count if c else 0

        candidates = [
            s.last_sent    if s else None,
            r.last_reply   if r else None,
            c.last_compose if c else None,
        ]
        last_contact = max((d for d in candidates if d), default=None)
        delta = (datetime.utcnow() - last_contact).days if last_contact else None

        stats.append({
            "customer_id": cust.id,
            "customer_name": cust.name,
            "company": cust.company,
            "status": cust.status,
            "email": cust.email,
            "sent_count": sent_count,
            "reply_count": reply_count,
            "compose_count": compose_count,
            "total_interactions": sent_count + reply_count + compose_count,
            "last_contact": last_contact.strftime("%Y-%m-%d") if last_contact else None,
            "days_since_contact": delta,
        })

    # Sort by last contact (None = never contacted, put last)
    stats.sort(key=lambda x: (x["last_contact"] is None, -(x["days_since_contact"] or 9999)))
    return stats


# ===== Email Templates =====

@app.post("/api/email-templates", response_model=EmailTemplateResponse, status_code=201)
async def create_email_template(
    template: EmailTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = EmailTemplate(**template.model_dump(), user_id=current_user.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/api/email-templates")
async def get_email_templates(
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(EmailTemplate).order_by(EmailTemplate.created_at.desc())
    q = _user_filter(q, EmailTemplate, current_user)
    if search:
        kw = f"%{search}%"
        q = q.filter(EmailTemplate.name.ilike(kw) | EmailTemplate.subject.ilike(kw) | EmailTemplate.description.ilike(kw))
    items, total, page, total_pages = _paginate(q, page, page_size)
    return {"items": [EmailTemplateResponse.model_validate(t) for t in items], "total": total, "page": page, "page_size": page_size, "total_pages": total_pages}


@app.put("/api/email-templates/{template_id}", response_model=EmailTemplateResponse)
async def update_email_template(
    template_id: int,
    data: EmailTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(EmailTemplate).filter(EmailTemplate.id == template_id)
    q = _user_filter(q, EmailTemplate, current_user)
    record = q.first()
    if not record:
        raise HTTPException(status_code=404, detail="Template not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    return record


@app.delete("/api/email-templates/{template_id}")
async def delete_email_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(EmailTemplate).filter(EmailTemplate.id == template_id)
    q = _user_filter(q, EmailTemplate, current_user)
    record = q.first()
    if not record:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(record)
    db.commit()
    return {"message": "Deleted successfully"}


# ===== Timemachine: Anniversary Routes =====

@app.get("/api/timemachine/anniversaries", response_model=PagedResponse[AnniversaryResponse])
def list_anniversaries(
    page: int = 1, page_size: int = 20, search: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Anniversary).filter(Anniversary.user_id == current_user.id)
    if search:
        q = q.filter(Anniversary.title.ilike(f"%{search}%"))
    total = q.count()
    items = q.order_by(Anniversary.date.asc()).offset((page - 1) * page_size).limit(page_size).all()
    import math
    return PagedResponse(
        items=items, total=total, page=page, page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size))
    )


def _normalize_ann_date(date_str: str) -> str:
    """原样保留，兼容 MM-DD 或 YYYY-MM-DD 两种格式。"""
    return date_str.strip() if date_str else date_str


@app.get("/api/timemachine/lunar-to-solar")
def lunar_to_solar(
    lunar_month: int, lunar_day: int,
    lunar_year: int = 0,
    is_leap_month: bool = False,
    current_user: User = Depends(get_current_user),
):
    """把农历日期换算为公历日期。
    - 若不传 lunar_year，则换算「今年农历 MM-DD → 公历」；
      如果今年该农历日期已过，则自动换算明年的。
    - 返回 {solar: "YYYY-MM-DD", lunar_str: "农历X月X日"}
    """
    try:
        from lunardate import LunarDate
        today = date.today()
        target_year = lunar_year if lunar_year else today.year

        def _convert(y):
            ld = LunarDate(y, lunar_month, lunar_day, is_leap_month)
            return ld.toSolarDate()

        if lunar_year:
            solar = _convert(target_year)
        else:
            try:
                solar = _convert(today.year)
                if solar < today:
                    solar = _convert(today.year + 1)
            except Exception:
                solar = _convert(today.year + 1)

        leap_label = "闰" if is_leap_month else ""
        lunar_str = f"农历{leap_label}{lunar_month}月{lunar_day}日"
        return {"solar": str(solar), "lunar_str": lunar_str}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"农历换算失败: {e}")


@app.post("/api/timemachine/anniversaries", response_model=AnniversaryResponse)
def create_anniversary(
    body: AnniversaryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = body.dict()
    data["date"] = _normalize_ann_date(data["date"])
    data["is_yearly"] = 1  # 月日模式永远每年重复
    record = Anniversary(**data, user_id=current_user.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.patch("/api/timemachine/anniversaries/{ann_id}", response_model=AnniversaryResponse)
def update_anniversary(
    ann_id: int, body: AnniversaryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(Anniversary).filter(
        Anniversary.id == ann_id, Anniversary.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    updates = body.dict(exclude_unset=True)
    if "date" in updates:
        updates["date"] = _normalize_ann_date(updates["date"])
    for k, v in updates.items():
        setattr(record, k, v)
    db.commit()
    db.refresh(record)
    return record


@app.delete("/api/timemachine/anniversaries/{ann_id}")
def delete_anniversary(
    ann_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(Anniversary).filter(
        Anniversary.id == ann_id, Anniversary.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(record)
    db.commit()
    return {"message": "Deleted successfully"}


@app.get("/api/timemachine/anniversaries/{ann_id}", response_model=AnniversaryResponse)
def get_anniversary(
    ann_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(Anniversary).filter(
        Anniversary.id == ann_id, Anniversary.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    return record


@app.post("/api/timemachine/anniversaries/{ann_id}/images")
async def upload_ann_image(
    ann_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json
    record = db.query(Anniversary).filter(
        Anniversary.id == ann_id, Anniversary.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    # 最多3张
    existing = json.loads(record.images) if record.images else []
    if len(existing) >= 3:
        raise HTTPException(status_code=400, detail="最多上传3张图片")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        raise HTTPException(status_code=400, detail="仅支持图片格式")
    filename = f"ann_{ann_id}_{uuid.uuid4().hex[:8]}{ext}"
    save_dir = os.path.join("static", "uploads", "ann_images")
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, filename)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    url = f"/static/uploads/ann_images/{filename}"
    existing.append(url)
    record.images = json.dumps(existing)
    db.commit()
    return {"url": url, "images": existing}


@app.delete("/api/timemachine/anniversaries/{ann_id}/images")
def delete_ann_image(
    ann_id: int, url: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json
    record = db.query(Anniversary).filter(
        Anniversary.id == ann_id, Anniversary.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    existing = json.loads(record.images) if record.images else []
    if url in existing:
        existing.remove(url)
        # 删除文件
        file_path = url.lstrip("/").replace("/", os.sep)
        if os.path.exists(file_path):
            os.remove(file_path)
    record.images = json.dumps(existing) if existing else None
    db.commit()
    return {"images": existing}


# ===== Timemachine: Schedule Routes =====

@app.get("/api/timemachine/schedules", response_model=PagedResponse[ScheduleResponse])
def list_schedules(
    page: int = 1, page_size: int = 20, search: str = "",
    status_filter: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Schedule).filter(Schedule.user_id == current_user.id)
    if search:
        q = q.filter(Schedule.title.ilike(f"%{search}%"))
    if status_filter:
        q = q.filter(Schedule.status == status_filter)
    total = q.count()
    import math
    items = q.order_by(Schedule.date.asc()).offset((page - 1) * page_size).limit(page_size).all()
    return PagedResponse(
        items=items, total=total, page=page, page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size))
    )


@app.post("/api/timemachine/schedules", response_model=ScheduleResponse)
def create_schedule(
    body: ScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = Schedule(**body.dict(), user_id=current_user.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.patch("/api/timemachine/schedules/{sch_id}", response_model=ScheduleResponse)
def update_schedule(
    sch_id: int, body: ScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(Schedule).filter(
        Schedule.id == sch_id, Schedule.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.dict(exclude_unset=True).items():
        setattr(record, k, v)
    db.commit()
    db.refresh(record)
    return record


@app.delete("/api/timemachine/schedules/{sch_id}")
def delete_schedule(
    sch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(Schedule).filter(
        Schedule.id == sch_id, Schedule.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(record)
    db.commit()
    return {"message": "Deleted successfully"}


@app.get("/api/timemachine/schedules/{sch_id}", response_model=ScheduleResponse)
def get_schedule(
    sch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(Schedule).filter(
        Schedule.id == sch_id, Schedule.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    return record


@app.post("/api/timemachine/schedules/{sch_id}/images")
async def upload_sched_image(
    sch_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json
    record = db.query(Schedule).filter(
        Schedule.id == sch_id, Schedule.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    existing = json.loads(record.images) if record.images else []
    if len(existing) >= 5:
        raise HTTPException(status_code=400, detail="最多上传5张图片")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        raise HTTPException(status_code=400, detail="仅支持图片格式")
    filename = f"sch_{sch_id}_{uuid.uuid4().hex[:8]}{ext}"
    save_dir = os.path.join("static", "uploads", "sched_images")
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, filename)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    url = f"/static/uploads/sched_images/{filename}"
    existing.append(url)
    record.images = json.dumps(existing)
    db.commit()
    return {"url": url, "images": existing}


@app.delete("/api/timemachine/schedules/{sch_id}/images")
def delete_sched_image(
    sch_id: int, url: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json
    record = db.query(Schedule).filter(
        Schedule.id == sch_id, Schedule.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    existing = json.loads(record.images) if record.images else []
    if url in existing:
        existing.remove(url)
        file_path = url.lstrip("/").replace("/", os.sep)
        if os.path.exists(file_path):
            os.remove(file_path)
    record.images = json.dumps(existing) if existing else None
    db.commit()
    return {"images": existing}


# ===== Timemachine: Diary Routes =====

@app.get("/api/timemachine/diaries", response_model=PagedResponse[DiaryResponse])
def list_diaries(
    page: int = 1, page_size: int = 20, search: str = "",
    mood_filter: str = "",
    date_from: str = "", date_to: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Diary).filter(Diary.user_id == current_user.id)
    if search:
        q = q.filter(
            (Diary.title.ilike(f"%{search}%")) |
            (Diary.content.ilike(f"%{search}%")) |
            (Diary.location.ilike(f"%{search}%"))
        )
    if mood_filter:
        q = q.filter(Diary.mood == mood_filter)
    if date_from:
        q = q.filter(Diary.date >= date_from)
    if date_to:
        q = q.filter(Diary.date <= date_to)
    total = q.count()
    import math
    items = q.order_by(Diary.date.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return PagedResponse(
        items=items, total=total, page=page, page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size))
    )


@app.post("/api/timemachine/diaries", response_model=DiaryResponse)
def create_diary(
    body: DiaryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = Diary(**body.dict(), user_id=current_user.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/api/timemachine/diaries/{diary_id}", response_model=DiaryResponse)
def get_diary(
    diary_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(Diary).filter(
        Diary.id == diary_id, Diary.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    return record


@app.patch("/api/timemachine/diaries/{diary_id}", response_model=DiaryResponse)
def update_diary(
    diary_id: int, body: DiaryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(Diary).filter(
        Diary.id == diary_id, Diary.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.dict(exclude_unset=True).items():
        setattr(record, k, v)
    db.commit()
    db.refresh(record)
    return record


@app.delete("/api/timemachine/diaries/{diary_id}")
def delete_diary(
    diary_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(Diary).filter(
        Diary.id == diary_id, Diary.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    # 删除关联图片文件
    import json as _json
    if record.images:
        for url in _json.loads(record.images):
            fp = url.lstrip("/").replace("/", os.sep)
            if os.path.exists(fp):
                os.remove(fp)
    db.delete(record)
    db.commit()
    return {"message": "Deleted successfully"}


@app.post("/api/timemachine/diaries/{diary_id}/images")
async def upload_diary_image(
    diary_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json
    record = db.query(Diary).filter(
        Diary.id == diary_id, Diary.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    existing = json.loads(record.images) if record.images else []
    if len(existing) >= 9:
        raise HTTPException(status_code=400, detail="最多上传9张图片")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
        raise HTTPException(status_code=400, detail="仅支持图片格式")
    filename = f"diary_{diary_id}_{uuid.uuid4().hex[:8]}{ext}"
    save_dir = os.path.join("static", "uploads", "diary_images")
    os.makedirs(save_dir, exist_ok=True)
    save_path = os.path.join(save_dir, filename)
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    url = f"/static/uploads/diary_images/{filename}"
    existing.append(url)
    record.images = json.dumps(existing)
    db.commit()
    return {"url": url, "images": existing}


@app.post("/api/timemachine/diaries/{diary_id}/images/batch")
async def upload_diary_images_batch(
    diary_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json
    record = db.query(Diary).filter(
        Diary.id == diary_id, Diary.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    existing = json.loads(record.images) if record.images else []
    save_dir = os.path.join("static", "uploads", "diary_images")
    os.makedirs(save_dir, exist_ok=True)
    added = []
    for file in files:
        if len(existing) + len(added) >= 9:
            break
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in (".jpg", ".jpeg", ".png", ".gif", ".webp"):
            continue
        filename = f"diary_{diary_id}_{uuid.uuid4().hex[:8]}{ext}"
        save_path = os.path.join(save_dir, filename)
        content = await file.read()
        with open(save_path, "wb") as f:
            f.write(content)
        url = f"/static/uploads/diary_images/{filename}"
        added.append(url)
    existing.extend(added)
    record.images = json.dumps(existing)
    db.commit()
    return {"added": added, "images": existing}


@app.delete("/api/timemachine/diaries/{diary_id}/images")
def delete_diary_image(
    diary_id: int, url: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json
    record = db.query(Diary).filter(
        Diary.id == diary_id, Diary.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    existing = json.loads(record.images) if record.images else []
    if url in existing:
        existing.remove(url)
        file_path = url.lstrip("/").replace("/", os.sep)
        if os.path.exists(file_path):
            os.remove(file_path)
    record.images = json.dumps(existing) if existing else None
    db.commit()
    return {"images": existing}


# ===== Wedding Todo Routes =====

@app.get("/api/wedding/todos", response_model=PagedResponse[WeddingTodoResponse])
def list_wedding_todos(
    page: int = 1, page_size: int = 50, search: str = "",
    list_type: str = "",   # "engagement" | "wedding" | "" (all)
    status_filter: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import math
    q = db.query(WeddingTodo).filter(WeddingTodo.user_id == current_user.id)
    if list_type:
        q = q.filter(WeddingTodo.list_type == list_type)
    if status_filter:
        q = q.filter(WeddingTodo.status == status_filter)
    if search:
        q = q.filter(
            (WeddingTodo.title.ilike(f"%{search}%")) |
            (WeddingTodo.category.ilike(f"%{search}%")) |
            (WeddingTodo.assignee.ilike(f"%{search}%"))
        )
    total = q.count()
    items = q.order_by(WeddingTodo.sort_order.asc(), WeddingTodo.created_at.asc()).offset((page - 1) * page_size).limit(page_size).all()
    return PagedResponse(
        items=items, total=total, page=page, page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size))
    )


@app.post("/api/wedding/todos", response_model=WeddingTodoResponse)
def create_wedding_todo(
    body: WeddingTodoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = WeddingTodo(**body.dict(), user_id=current_user.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.patch("/api/wedding/todos/{todo_id}", response_model=WeddingTodoResponse)
def update_wedding_todo(
    todo_id: int, body: WeddingTodoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(WeddingTodo).filter(
        WeddingTodo.id == todo_id, WeddingTodo.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.dict(exclude_unset=True).items():
        setattr(record, k, v)
    db.commit()
    db.refresh(record)
    return record


@app.delete("/api/wedding/todos/{todo_id}")
def delete_wedding_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(WeddingTodo).filter(
        WeddingTodo.id == todo_id, WeddingTodo.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(record)
    db.commit()
    return {"message": "Deleted"}


@app.delete("/api/wedding/todos")
def batch_delete_wedding_todos(
    list_type: str,
    status: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量删除（如清除所有已完成的项目）"""
    q = db.query(WeddingTodo).filter(
        WeddingTodo.user_id == current_user.id,
        WeddingTodo.list_type == list_type,
    )
    if status:
        q = q.filter(WeddingTodo.status == status)
    count = q.count()
    q.delete()
    db.commit()
    return {"deleted": count}


# ===== Wedding Budget Routes =====

@app.get("/api/wedding/budget/summary", response_model=WeddingBudgetSummary)
def get_budget_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json as _json
    items = db.query(WeddingBudget).filter(WeddingBudget.user_id == current_user.id).all()
    total_budget = sum(i.budget_amount or 0 for i in items)
    total_actual = sum(i.actual_amount or 0 for i in items)
    # 按分类汇总
    cat_map = {}
    for i in items:
        c = i.category
        if c not in cat_map:
            cat_map[c] = {"category": c, "budget": 0, "actual": 0, "count": 0}
        cat_map[c]["budget"] += i.budget_amount or 0
        cat_map[c]["actual"] += i.actual_amount or 0
        cat_map[c]["count"] += 1
    return WeddingBudgetSummary(
        total_budget=total_budget,
        total_actual=total_actual,
        total_remaining=total_budget - total_actual,
        by_category=list(cat_map.values()),
    )


@app.get("/api/wedding/budget", response_model=PagedResponse[WeddingBudgetResponse])
def list_budget_items(
    page: int = 1, page_size: int = 50, search: str = "",
    category: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import math
    q = db.query(WeddingBudget).filter(WeddingBudget.user_id == current_user.id)
    if category:
        q = q.filter(WeddingBudget.category == category)
    if search:
        q = q.filter(
            (WeddingBudget.item_name.ilike(f"%{search}%")) |
            (WeddingBudget.vendor.ilike(f"%{search}%")) |
            (WeddingBudget.category.ilike(f"%{search}%"))
        )
    total = q.count()
    items = q.order_by(WeddingBudget.category.asc(), WeddingBudget.created_at.asc()).offset((page - 1) * page_size).limit(page_size).all()
    return PagedResponse(
        items=items, total=total, page=page, page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size))
    )


@app.post("/api/wedding/budget", response_model=WeddingBudgetResponse)
def create_budget_item(
    body: WeddingBudgetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = WeddingBudget(**body.dict(), user_id=current_user.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.patch("/api/wedding/budget/{item_id}", response_model=WeddingBudgetResponse)
def update_budget_item(
    item_id: int, body: WeddingBudgetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(WeddingBudget).filter(
        WeddingBudget.id == item_id, WeddingBudget.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.dict(exclude_unset=True).items():
        setattr(record, k, v)
    db.commit()
    db.refresh(record)
    return record


@app.delete("/api/wedding/budget/{item_id}")
def delete_budget_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(WeddingBudget).filter(
        WeddingBudget.id == item_id, WeddingBudget.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(record)
    db.commit()
    return {"message": "Deleted"}


# ===== Photo Album Routes =====

PHOTO_UPLOAD_DIR = "static/uploads/photo_album"
PHOTO_MAX_IMAGES = 30
ALLOWED_PHOTO_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


@app.get("/api/timemachine/photo-album", response_model=PagedResponse[PhotoAlbumResponse])
def list_photo_albums(
    page: int = 1, page_size: int = 20, search: str = "",
    date_from: str = "", date_to: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import math
    q = db.query(PhotoAlbum).filter(PhotoAlbum.user_id == current_user.id)
    if search:
        q = q.filter(
            (PhotoAlbum.title.ilike(f"%{search}%")) |
            (PhotoAlbum.description.ilike(f"%{search}%")) |
            (PhotoAlbum.location.ilike(f"%{search}%")) |
            (PhotoAlbum.tags.ilike(f"%{search}%"))
        )
    if date_from:
        q = q.filter(PhotoAlbum.date >= date_from)
    if date_to:
        q = q.filter(PhotoAlbum.date <= date_to)
    total = q.count()
    items = q.order_by(PhotoAlbum.date.desc(), PhotoAlbum.created_at.desc()) \
              .offset((page - 1) * page_size).limit(page_size).all()
    return PagedResponse(
        items=items, total=total, page=page, page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size))
    )


@app.post("/api/timemachine/photo-album", response_model=PhotoAlbumResponse)
def create_photo_album(
    body: PhotoAlbumCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = PhotoAlbum(**body.dict(), user_id=current_user.id)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/api/timemachine/photo-album/{album_id}", response_model=PhotoAlbumResponse)
def get_photo_album(
    album_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(PhotoAlbum).filter(
        PhotoAlbum.id == album_id, PhotoAlbum.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    return record


@app.patch("/api/timemachine/photo-album/{album_id}", response_model=PhotoAlbumResponse)
def update_photo_album(
    album_id: int, body: PhotoAlbumUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.query(PhotoAlbum).filter(
        PhotoAlbum.id == album_id, PhotoAlbum.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in body.dict(exclude_unset=True).items():
        setattr(record, k, v)
    db.commit()
    db.refresh(record)
    return record


@app.delete("/api/timemachine/photo-album/{album_id}")
def delete_photo_album(
    album_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json as _json
    record = db.query(PhotoAlbum).filter(
        PhotoAlbum.id == album_id, PhotoAlbum.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    if record.images:
        try:
            imgs = _json.loads(record.images)
            for url in imgs:
                fp = url.lstrip("/")
                if os.path.exists(fp):
                    os.remove(fp)
        except Exception:
            pass
    db.delete(record)
    db.commit()
    return {"message": "Deleted"}


@app.post("/api/timemachine/photo-album/{album_id}/images")
async def upload_photo_album_image(
    album_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json as _json
    record = db.query(PhotoAlbum).filter(
        PhotoAlbum.id == album_id, PhotoAlbum.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    existing = _json.loads(record.images) if record.images else []
    if len(existing) >= PHOTO_MAX_IMAGES:
        raise HTTPException(status_code=400, detail=f"最多上传 {PHOTO_MAX_IMAGES} 张图片")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_PHOTO_EXT:
        raise HTTPException(status_code=400, detail="仅支持 jpg/png/gif/webp 格式")
    os.makedirs(PHOTO_UPLOAD_DIR, exist_ok=True)
    fname = f"photo_{album_id}_{uuid.uuid4().hex[:8]}{ext}"
    fpath = os.path.join(PHOTO_UPLOAD_DIR, fname)
    content = await file.read()
    with open(fpath, "wb") as fh:
        fh.write(content)
    url = f"/{PHOTO_UPLOAD_DIR}/{fname}"
    existing.append(url)
    record.images = _json.dumps(existing)
    if not record.cover:
        record.cover = url
    db.commit()
    return {"url": url, "images": existing}


@app.post("/api/timemachine/photo-album/{album_id}/images/batch")
async def upload_photo_album_images_batch(
    album_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json as _json
    record = db.query(PhotoAlbum).filter(
        PhotoAlbum.id == album_id, PhotoAlbum.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    existing = _json.loads(record.images) if record.images else []
    added = []
    os.makedirs(PHOTO_UPLOAD_DIR, exist_ok=True)
    for file in files:
        if len(existing) + len(added) >= PHOTO_MAX_IMAGES:
            break
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in ALLOWED_PHOTO_EXT:
            continue
        fname = f"photo_{album_id}_{uuid.uuid4().hex[:8]}{ext}"
        fpath = os.path.join(PHOTO_UPLOAD_DIR, fname)
        content = await file.read()
        with open(fpath, "wb") as fh:
            fh.write(content)
        added.append(f"/{PHOTO_UPLOAD_DIR}/{fname}")
    existing.extend(added)
    record.images = _json.dumps(existing)
    if not record.cover and existing:
        record.cover = existing[0]
    db.commit()
    return {"added": added, "images": existing}


@app.delete("/api/timemachine/photo-album/{album_id}/images")
def delete_photo_album_image(
    album_id: int, url: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    import json as _json
    record = db.query(PhotoAlbum).filter(
        PhotoAlbum.id == album_id, PhotoAlbum.user_id == current_user.id
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Not found")
    existing = _json.loads(record.images) if record.images else []
    if url in existing:
        existing.remove(url)
        fp = url.lstrip("/")
        if os.path.exists(fp):
            os.remove(fp)
    record.images = _json.dumps(existing)
    if record.cover == url:
        record.cover = existing[0] if existing else None
    db.commit()
    return {"images": existing}


import uvicorn
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", 8000)),
        reload=True
    )
