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
from datetime import datetime

from database import (
    get_db, init_db,
    User, EmailHistory, Template, GlobalSettings, Feedback,
    ComposeHistory, ComposeTemplate, Customer, SentEmailLog, EmailTemplate,
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
    UserProfileUpdate, UserProfileResponse,
    SendEmailRequest, BulkSendRequest, SentEmailLogResponse,
    InboxEmailItem, CustomerEmailItem,
    EmailTemplateCreate, EmailTemplateUpdate, EmailTemplateResponse,
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
    return {"username": user.username, "role": user.role}


@app.post("/api/logout")
async def logout(request: Request):
    request.session.clear()
    return {"message": "已退出登录"}


@app.get("/api/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {"username": current_user.username, "role": current_user.role}


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
    return db.query(User).order_by(User.created_at).all()


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
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


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
            EmailHistory.original_email.ilike(kw) |
            EmailHistory.title.ilike(kw) |
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


@app.get("/api/templates", response_model=List[TemplateResponse])
async def get_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Template).order_by(Template.created_at.desc())
    q = _user_filter(q, Template, current_user)
    return q.all()


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
    current_user: User = Depends(get_current_user),
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


@app.get("/api/feedback", response_model=List[FeedbackResponse])
async def get_feedback(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return db.query(Feedback).order_by(Feedback.created_at.desc()).limit(100).all()


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


@app.get("/api/customers", response_model=List[CustomerResponse])
async def list_customers(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Customer).order_by(Customer.created_at.desc())
    q = _user_filter(q, Customer, current_user)
    if status:
        q = q.filter(Customer.status == status)
    return q.all()


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
    attachments: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a single email (with optional attachments) and log the result."""
    from email_center_service import send_email
    settings = _get_email_settings(db)

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


@app.get("/api/email-center/sent-log", response_model=List[SentEmailLogResponse])
async def get_sent_log(
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get sent email log for the current user."""
    q = db.query(SentEmailLog).order_by(SentEmailLog.created_at.desc())
    if current_user.role != "admin":
        q = q.filter(SentEmailLog.user_id == current_user.id)
    records = q.limit(limit).all()

    result = []
    for r in records:
        item = SentEmailLogResponse.model_validate(r)
        if r.customer_id:
            cust = db.query(Customer).filter(Customer.id == r.customer_id).first()
            item.customer_name = cust.name if cust else None
        result.append(item)
    return result


@app.get("/api/email-center/contact-stats")
async def get_contact_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return per-customer contact frequency stats based on sent log + AI generation history.
    """
    # Get all customers for this user
    q = db.query(Customer)
    if current_user.role != "admin":
        q = q.filter(Customer.user_id == current_user.id)
    customers = q.all()

    stats = []
    for cust in customers:
        # Count sent emails
        sent_count = db.query(SentEmailLog).filter(
            SentEmailLog.customer_id == cust.id
        ).count()
        # Count AI-generated replies
        reply_count = db.query(EmailHistory).filter(
            EmailHistory.customer_id == cust.id
        ).count()
        compose_count = db.query(ComposeHistory).filter(
            ComposeHistory.customer_id == cust.id
        ).count()

        # Last contact time (latest across all channels)
        last_sent = db.query(SentEmailLog).filter(
            SentEmailLog.customer_id == cust.id
        ).order_by(SentEmailLog.created_at.desc()).first()
        last_reply = db.query(EmailHistory).filter(
            EmailHistory.customer_id == cust.id
        ).order_by(EmailHistory.created_at.desc()).first()
        last_compose = db.query(ComposeHistory).filter(
            ComposeHistory.customer_id == cust.id
        ).order_by(ComposeHistory.created_at.desc()).first()

        candidates = [
            last_sent.created_at if last_sent else None,
            last_reply.created_at if last_reply else None,
            last_compose.created_at if last_compose else None,
        ]
        last_contact = max((d for d in candidates if d), default=None)

        # Days since last contact
        if last_contact:
            delta = (datetime.utcnow() - last_contact).days
        else:
            delta = None

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


@app.get("/api/email-templates", response_model=List[EmailTemplateResponse])
async def get_email_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(EmailTemplate).order_by(EmailTemplate.created_at.desc())
    q = _user_filter(q, EmailTemplate, current_user)
    return q.all()


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", 8000)),
        reload=True
    )
