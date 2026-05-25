from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    username      = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role          = Column(String(20), default="user", nullable=False)  # "admin" | "user"
    is_active     = Column(Integer, default=1, nullable=False)  # 1=active, 0=disabled
    created_at    = Column(DateTime, default=datetime.utcnow)
    # Profile fields
    avatar_emoji  = Column(String(10),  nullable=True)   # e.g. "👩‍💼"
    avatar_url    = Column(String(500), nullable=True)   # uploaded image path
    display_name  = Column(String(100), nullable=True)
    bio           = Column(Text,        nullable=True)
    company       = Column(String(255), nullable=True)
    title            = Column(String(100), nullable=True)   # job title / 职位
    page_permissions = Column(Text,        nullable=True)   # JSON array of allowed pageIds; NULL = all non-admin pages
    role_id          = Column(Integer, ForeignKey("roles.id", ondelete="SET NULL"), nullable=True, index=True)  # 分配的角色


class Customer(Base):
    __tablename__ = "customers"

    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String(100), nullable=False)
    company       = Column(String(255), nullable=True)
    email         = Column(String(255), nullable=True)
    phone         = Column(String(50),  nullable=True)
    country       = Column(String(100), nullable=True)
    industry      = Column(String(100), nullable=True)
    product_pref  = Column(String(255), nullable=True)
    tags          = Column(String(500), nullable=True)
    background    = Column(Text,        nullable=True)
    status        = Column(String(20),  default="prospect", nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user_id       = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class EmailHistory(Base):
    __tablename__ = "email_history"

    id = Column(Integer, primary_key=True, index=True)
    chat_content = Column(Text, nullable=False)
    scenario = Column(String(255), nullable=False)
    tone = Column(String(100), nullable=False)
    title = Column(String(255), nullable=True)
    generated_reply = Column(Text, nullable=False)
    reply_en = Column(Text, nullable=True)
    reply_wechat = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class Template(Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    scenario = Column(String(255), nullable=False)
    tone = Column(String(100), nullable=False)
    description = Column(Text)
    extra_requirements = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class GlobalSettings(Base):
    __tablename__ = "global_settings"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String(255), nullable=True)
    company_signature = Column(Text, nullable=True)
    products_info = Column(Text, nullable=True)
    contact_info = Column(Text, nullable=True)
    # Email account (SMTP + IMAP)
    email_address = Column(String(255), nullable=True)
    email_password = Column(String(255), nullable=True)   # stored plain for now (local use)
    smtp_host = Column(String(255), nullable=True, default="smtp.qiye.aliyun.com")
    smtp_port = Column(Integer, nullable=True, default=465)
    imap_host = Column(String(255), nullable=True, default="imap.qiye.aliyun.com")
    imap_port = Column(Integer, nullable=True, default=993)
    custom_email_types = Column(Text, nullable=True)   # JSON array of user-defined type names
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Feedback(Base):
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    category = Column(String(50), nullable=True)
    status = Column(String(20), default="pending")
    screenshot_paths = Column(Text, nullable=True)   # JSON array of paths
    created_at = Column(DateTime, default=datetime.utcnow)


class ComposeHistory(Base):
    __tablename__ = "compose_history"

    id = Column(Integer, primary_key=True, index=True)
    email_type = Column(String(50), nullable=False)
    target_info = Column(Text, nullable=False)
    tone = Column(String(100), nullable=False)
    reply_en = Column(Text, nullable=False)
    reply_zh = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class ComposeTemplate(Base):
    __tablename__ = "compose_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    email_type = Column(String(50), nullable=False)
    tone = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    fixed_requirements = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class SentEmailLog(Base):
    """Records every email sent via the email center (single or bulk)."""
    __tablename__ = "sent_email_log"

    id = Column(Integer, primary_key=True, index=True)
    to_address = Column(String(255), nullable=False)
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    status = Column(String(20), default="sent", nullable=False)  # "sent" | "failed"
    error_msg = Column(Text, nullable=True)
    bulk_id = Column(String(64), nullable=True, index=True)   # groups bulk send batch
    created_at = Column(DateTime, default=datetime.utcnow)
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class EmailTemplate(Base):
    """Reusable email templates for single/bulk send (subject + body with placeholders)."""
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    subject = Column(String(500), nullable=False)
    body = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class Anniversary(Base):
    """纪念日：相识日、表白日、结婚纪念日等，支持年度重复倒计时。"""
    __tablename__ = "anniversaries"

    id         = Column(Integer, primary_key=True, index=True)
    title      = Column(String(255), nullable=False)
    date       = Column(String(10),  nullable=False)          # MM-DD 或 YYYY-MM-DD（农历时存农历日期）
    type       = Column(String(50),  nullable=False, default="custom")
    is_yearly  = Column(Integer,     nullable=False, default=1)
    is_lunar   = Column(Integer,     nullable=False, default=0)  # 1=农历，0=公历
    note       = Column(Text,        nullable=True)
    mood       = Column(String(10),  nullable=True)           # 心情 emoji
    images     = Column(Text,        nullable=True)           # JSON 数组，存图片路径列表
    emoji      = Column(String(10),  nullable=True)
    created_at = Column(DateTime,    default=datetime.utcnow)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class Schedule(Base):
    """日程：约会计划、旅行、看诊等一次性或重要安排。"""
    __tablename__ = "schedules"

    id          = Column(Integer, primary_key=True, index=True)
    title       = Column(String(255), nullable=False)
    date        = Column(String(10),  nullable=False)   # YYYY-MM-DD
    time        = Column(String(5),   nullable=True)    # HH:MM (optional)
    end_date    = Column(String(10),  nullable=True)    # for multi-day events
    type        = Column(String(50),  nullable=False, default="other")  # date|travel|medical|errand|other
    priority    = Column(String(20),  nullable=False, default="normal")  # urgent|normal
    status      = Column(String(20),  nullable=False, default="pending") # pending|done|cancelled
    note        = Column(Text,        nullable=True)
    images      = Column(Text,        nullable=True)           # JSON 数组，存图片路径列表
    emoji       = Column(String(10),  nullable=True)
    created_at  = Column(DateTime,    default=datetime.utcnow)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class Diary(Base):
    """日记 / 回忆录：按日期排列的日常记录，文字 + 图片 + 情绪 + 地点。"""
    __tablename__ = "diaries"

    id         = Column(Integer,      primary_key=True, index=True)
    title      = Column(String(255),  nullable=True)           # 可为空，默认用日期命名
    date       = Column(String(10),   nullable=False)          # YYYY-MM-DD
    mood       = Column(String(20),   nullable=True)           # 情绪标签文字: happy|touched|excited|sweet|calm|sad|grateful|other
    location   = Column(String(255),  nullable=True)           # 地点（纯文本）
    content    = Column(Text,         nullable=True)           # 正文富文本 HTML
    images     = Column(Text,         nullable=True)           # JSON 数组，存图片路径列表
    weather    = Column(String(20),   nullable=True)           # 天气 emoji（选填）
    created_at = Column(DateTime,     default=datetime.utcnow)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class Role(Base):
    """角色：定义一组页面权限，分配给用户。"""
    __tablename__ = "roles"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String(50),  unique=True, nullable=False)   # 角色名，如"销售员"
    description  = Column(String(255), nullable=True)
    permissions  = Column(Text,        nullable=True)   # JSON array of allowed pageIds; NULL = all
    created_at   = Column(DateTime,    default=datetime.utcnow)


class WeddingTodo(Base):
    """婚礼 & 订婚 清单：每一项待办事项。"""
    __tablename__ = "wedding_todos"

    id           = Column(Integer, primary_key=True, index=True)
    list_type    = Column(String(20),  nullable=False, default="wedding")  # "engagement" | "wedding"
    title        = Column(String(255), nullable=False)
    category     = Column(String(100), nullable=True)    # 戒指/场地/拍照/宴请…
    assignee     = Column(String(100), nullable=True)    # 负责人
    status       = Column(String(20),  nullable=False, default="todo")   # todo|doing|done
    priority     = Column(String(20),  nullable=False, default="normal") # urgent|normal
    note         = Column(Text,        nullable=True)
    due_date     = Column(String(10),  nullable=True)    # YYYY-MM-DD（可选）
    sort_order   = Column(Integer,     nullable=False, default=0)
    created_at   = Column(DateTime,    default=datetime.utcnow)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class PhotoAlbum(Base):
    """时间相册：以日期为轴，上传图片形成时间线飘絮相册。"""
    __tablename__ = "photo_albums"

    id          = Column(Integer,      primary_key=True, index=True)
    title       = Column(String(255),  nullable=True)            # 可选标题
    date        = Column(String(10),   nullable=False)           # YYYY-MM-DD（拍摄日期）
    description = Column(Text,         nullable=True)            # 描述/备注
    location    = Column(String(255),  nullable=True)            # 地点
    mood        = Column(String(10),   nullable=True)            # 心情 emoji
    tags        = Column(String(500),  nullable=True)            # CSV 标签，如 "旅行,风景"
    images      = Column(Text,         nullable=True)            # JSON 数组，存图片路径列表
    cover       = Column(String(500),  nullable=True)            # 封面图 URL
    created_at  = Column(DateTime,     default=datetime.utcnow)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


class WeddingBudget(Base):
    """婚礼预算：按分类记录预算与实际花费。"""
    __tablename__ = "wedding_budgets"

    id            = Column(Integer, primary_key=True, index=True)
    category      = Column(String(100), nullable=False)   # 场地/婚纱/摄影/酒水/蜜月…
    item_name     = Column(String(255), nullable=False)   # 具体项目名称
    budget_amount = Column(Integer,     nullable=False, default=0)  # 预算金额（分，避免浮点）
    actual_amount = Column(Integer,     nullable=True)    # 实际花费（分）
    vendor        = Column(String(255), nullable=True)    # 供应商/商家
    paid_status   = Column(String(20),  nullable=False, default="unpaid")  # unpaid|partial|paid
    note          = Column(Text,        nullable=True)
    created_at    = Column(DateTime,    default=datetime.utcnow)
    user_id       = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)


DATABASE_URL = "sqlite:///./database/trade_email.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def migrate_db():
    """Apply incremental ALTER TABLE for columns added after initial release."""
    import sqlite3
    conn = sqlite3.connect("./database/trade_email.db")
    cursor = conn.cursor()
    migrations = [
        ("email_history",    "customer_id", "INTEGER REFERENCES customers(id) ON DELETE SET NULL"),
        ("compose_history",  "customer_id", "INTEGER REFERENCES customers(id) ON DELETE SET NULL"),
        ("email_history",    "user_id",     "INTEGER REFERENCES users(id) ON DELETE SET NULL"),
        ("compose_history",  "user_id",     "INTEGER REFERENCES users(id) ON DELETE SET NULL"),
        ("templates",        "user_id",     "INTEGER REFERENCES users(id) ON DELETE SET NULL"),
        ("compose_templates","user_id",     "INTEGER REFERENCES users(id) ON DELETE SET NULL"),
        ("customers",        "user_id",     "INTEGER REFERENCES users(id) ON DELETE SET NULL"),
        ("users",            "is_active",   "INTEGER NOT NULL DEFAULT 1"),
        # Email account settings
        ("global_settings",  "email_address",  "TEXT"),
        ("global_settings",  "email_password", "TEXT"),
        ("global_settings",  "smtp_host",      "TEXT DEFAULT 'smtp.qiye.aliyun.com'"),
        ("global_settings",  "smtp_port",      "INTEGER DEFAULT 465"),
        ("global_settings",  "imap_host",      "TEXT DEFAULT 'imap.qiye.aliyun.com'"),
        ("global_settings",  "imap_port",      "INTEGER DEFAULT 993"),
        ("feedback",         "screenshot_paths", "TEXT"),
        ("global_settings",  "custom_email_types", "TEXT"),
        # User profile fields
        ("users", "avatar_emoji",  "TEXT"),
        ("users", "avatar_url",    "TEXT"),
        ("users", "display_name",  "TEXT"),
        ("users", "bio",           "TEXT"),
        ("users", "company",          "TEXT"),
        ("users", "title",            "TEXT"),
        # Page permissions
        ("users", "page_permissions", "TEXT"),
        # Timemachine: Anniversary & Schedule tables handled by create_all
        # Anniversary extra columns
        ("anniversaries", "mood",   "TEXT"),
        ("anniversaries", "images", "TEXT"),
        ("schedules",     "images", "TEXT"),
        # Wedding Todo
        ("wedding_todos", "due_date",   "TEXT"),
        ("wedding_todos", "sort_order", "INTEGER NOT NULL DEFAULT 0"),
        # Wedding Budget
        ("wedding_budgets", "vendor",      "TEXT"),
        ("wedding_budgets", "paid_status", "TEXT NOT NULL DEFAULT 'unpaid'"),
        # Role assignment on users
        ("users", "role_id", "INTEGER REFERENCES roles(id) ON DELETE SET NULL"),
        # Lunar calendar support for anniversaries
        ("anniversaries", "is_lunar", "INTEGER NOT NULL DEFAULT 0"),
    ]
    for table, column, col_def in migrations:
        cursor.execute(f"PRAGMA table_info({table})")
        existing = cursor.fetchall()
        if existing:  # table exists
            cols = [row[1] for row in existing]
            if column not in cols:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")
    conn.commit()
    conn.close()


def seed_users():
    """Create initial users (skip if already exist) and assign existing data to cecilia."""
    from passlib.context import CryptContext
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    db = SessionLocal()
    try:
        initial_users = [
            {"username": "admin",   "password": "admin",   "role": "admin"},
            {"username": "Cecilia", "password": "Cecilia", "role": "admin"},
        ]
        for u in initial_users:
            existing = db.query(User).filter(User.username == u["username"]).first()
            if not existing:
                db.add(User(
                    username=u["username"],
                    password_hash=pwd_context.hash(u["password"]),
                    role=u["role"],
                ))
            # 不再强制同步 role，允许管理员在后台手动修改角色
        db.commit()

        # Assign existing data (user_id IS NULL) to Cecilia
        cecilia = db.query(User).filter(User.username == "Cecilia").first()
        if cecilia:
            for model in [EmailHistory, ComposeHistory, Template, ComposeTemplate, Customer, EmailTemplate]:
                db.query(model).filter(model.user_id == None).update({"user_id": cecilia.id})
            db.commit()
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    migrate_db()
    seed_users()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
