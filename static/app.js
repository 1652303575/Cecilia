// API Base URL
const API_BASE = '';

// ===== 通用确认 Modal =====
function showConfirm({ title = '确认操作', message, confirmText = '确认', danger = true, onConfirm }) {
    const modal   = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl   = document.getElementById('confirmModalMessage');
    const okBtn   = document.getElementById('confirmModalOk');
    const cancelBtn = document.getElementById('confirmModalCancel');

    titleEl.textContent = title;
    msgEl.textContent   = message;
    okBtn.textContent   = confirmText;
    okBtn.className     = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    modal.classList.add('show');

    // Clone to remove previous event listeners
    const newOk = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    function close() { modal.classList.remove('show'); }
    document.getElementById('confirmModalOk').addEventListener('click', () => { close(); onConfirm(); }, { once: true });
    document.getElementById('confirmModalCancel').addEventListener('click', close, { once: true });
    modal.addEventListener('click', e => { if (e.target === modal) close(); }, { once: true });
}

// ===== 通用分页工具 =====
// renderPaged(items, pageSize, curPage, renderFn, containerEl, paginationEl, onPageChange, infoEl, infoLabel)
function renderPaged(items, pageSize, curPage, renderFn, containerEl, paginationEl, onPageChange, infoEl, infoLabel) {
    const total = items.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const cur   = Math.min(Math.max(1, curPage), pages);

    if (infoEl) infoEl.textContent = total ? `共 ${total} ${infoLabel || '条'}` : '';

    const slice = items.slice((cur - 1) * pageSize, cur * pageSize);
    renderFn(slice, total);

    if (!paginationEl) return;
    if (pages <= 1) { paginationEl.innerHTML = ''; return; }

    const range = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || (i >= cur - 2 && i <= cur + 2)) range.push(i);
        else if (range[range.length - 1] !== '…') range.push('…');
    }
    let html = `<button class="page-btn" ${cur===1?'disabled':''} data-p="${cur-1}">‹</button>`;
    range.forEach(p => {
        if (p === '…') html += `<span class="page-btn" style="cursor:default;border:none;opacity:.5">…</span>`;
        else html += `<button class="page-btn${p===cur?' active':''}" data-p="${p}">${p}</button>`;
    });
    html += `<button class="page-btn" ${cur===pages?'disabled':''} data-p="${cur+1}">›</button>`;
    paginationEl.innerHTML = html;

    paginationEl.querySelectorAll('button[data-p]').forEach(btn => {
        btn.addEventListener('click', () => onPageChange(parseInt(btn.dataset.p)));
    });
}

// 时间格式化：数据库存的是UTC，显示时转为北京时间
function fmtTime(utcStr, opts) {
    if (!utcStr) return '';
    // 补上 Z 让浏览器识别为 UTC
    const s = utcStr.endsWith('Z') || utcStr.includes('+') ? utcStr : utcStr + 'Z';
    return new Date(s).toLocaleString('zh-CN', opts || {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
}

// 全局 fetch 包装：自动处理 session 过期（401）
const _origFetch = window.fetch;
window.fetch = async function(...args) {
    const res = await _origFetch(...args);
    if (res.status === 401) {
        // 克隆一份给调用方，同时弹出登录框
        const clone = res.clone();
        showLoginOverlay();
        return clone;
    }
    return res;
};

// ===== 用户认证 =====
async function checkLogin() {
    try {
        const res = await fetch('/api/me', { credentials: 'include' });
        if (res.ok) {
            const user = await res.json();
            onLoginSuccess(user);
        } else {
            showLoginOverlay();
        }
    } catch {
        showLoginOverlay();
    }
}

// ---- 管理员个人导航偏好（localStorage） ----
function _adminNavPrefsKey(username) {
    return `nav_hidden_pages_${username}`;
}
function _getAdminHiddenPages(username) {
    try { return new Set(JSON.parse(localStorage.getItem(_adminNavPrefsKey(username)) || '[]')); }
    catch { return new Set(); }
}
function _saveAdminHiddenPages(username, hiddenSet) {
    localStorage.setItem(_adminNavPrefsKey(username), JSON.stringify([...hiddenSet]));
}
function _applyAdminNavPrefs(username) {
    const hidden = _getAdminHiddenPages(username);
    // 先全部恢复（防止重复应用）
    PERMISSIONABLE_PAGES.forEach(p =>
        document.querySelectorAll(`[data-page="${p}"]`).forEach(el => el.style.display = '')
    );
    // 再隐藏勾选的
    hidden.forEach(p =>
        document.querySelectorAll(`[data-page="${p}"]`).forEach(el => el.style.display = 'none')
    );
    // 隐藏空分组
    document.querySelectorAll('.nav-group').forEach(group => {
        const btns = group.querySelectorAll('.nav-item[data-page]');
        const allHidden = btns.length > 0 && [...btns].every(b => b.style.display === 'none');
        group.style.display = allHidden ? 'none' : '';
    });
}

function showLoginOverlay() {
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('appLayout').style.display = 'none';
}

function onLoginSuccess(user) {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('appLayout').style.display = '';
    window._currentUser = user;
    // 非 admin 隐藏 admin-only 入口，并应用页面权限
    if (user.role !== 'admin') {
        // 始终隐藏管理员专属页面
        ADMIN_ONLY_PAGES.forEach(p =>
            document.querySelectorAll(`[data-page="${p}"]`).forEach(el => el.style.display = 'none')
        );
        // 应用用户自定义页面权限（非 null 时）
        if (user.page_permissions) {
            let allowed;
            try { allowed = new Set(JSON.parse(user.page_permissions)); } catch { allowed = null; }
            if (allowed) {
                PERMISSIONABLE_PAGES.forEach(p => {
                    if (!allowed.has(p))
                        document.querySelectorAll(`[data-page="${p}"]`).forEach(el => el.style.display = 'none');
                });
            }
        }
    } else {
        // admin：应用个人导航偏好（localStorage）
        _applyAdminNavPrefs(user.username);
    }
    // 隐藏所有子按钮都被隐藏的导航分组标题
    document.querySelectorAll('.nav-group').forEach(group => {
        const btns = group.querySelectorAll('.nav-item[data-page]');
        const allHidden = btns.length > 0 && [...btns].every(b => b.style.display === 'none');
        if (allHidden) group.style.display = 'none';
    });
    // 拉取 profile 更新顶栏显示（头像图片 / emoji / 显示名）
    fetch('/api/me/profile', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(p => {
            if (!p) throw new Error();
            const name = p.display_name || p.username;
            const topbar = document.getElementById('topbarUsername');
            if (p.avatar_url) {
                topbar.innerHTML = `<img src="${p.avatar_url}" class="topbar-avatar-img" alt=""> ${name}`;
            } else {
                const icon = p.avatar_emoji || (p.role === 'admin' ? '👑' : '👤');
                topbar.textContent = `${icon} ${name}`;
            }
        })
        .catch(() => {
            document.getElementById('topbarUsername').textContent =
                user.role === 'admin' ? '👑 Admin' : `👤 ${user.username}`;
        });
    switchPage('emailInbox');
    // 预拉取签名+邮箱配置，供正文工具栏和发件人显示使用
    fetch('/api/settings', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(s => {
            if (s) {
                window._cachedSignature = s.company_signature || null;
                window._cachedSettings = s;
                _updateSendFromDisplay();
            }
        })
        .catch(() => {});
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    const errEl = document.getElementById('loginError');
    btn.disabled = true;
    btn.textContent = '登录中...';
    errEl.style.display = 'none';
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password }),
        });
        if (!res.ok) {
            const err = await res.json();
            errEl.textContent = err.detail || '登录失败';
            errEl.style.display = 'block';
        } else {
            const user = await res.json();
            // 触发浏览器密码保存提示
            if (window.PasswordCredential) {
                const cred = new PasswordCredential({ id: username, password });
                navigator.credentials.store(cred);
            }
            onLoginSuccess(user);
        }
    } catch {
        errEl.textContent = '网络错误，请重试';
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = '登 录';
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    window._currentUser = null;
    document.getElementById('loginForm').reset();
    showLoginOverlay();
});

// ===== 修改密码 =====
document.getElementById('changePasswordBtn').addEventListener('click', () => {
    document.getElementById('changePasswordForm').reset();
    document.getElementById('cpError').style.display = 'none';
    document.getElementById('changePasswordModal').classList.add('show');
});
document.getElementById('changePasswordClose').addEventListener('click', () => {
    document.getElementById('changePasswordModal').classList.remove('show');
});
document.getElementById('changePasswordCancel').addEventListener('click', () => {
    document.getElementById('changePasswordModal').classList.remove('show');
});
document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPw = document.getElementById('cpOldPassword').value;
    const newPw = document.getElementById('cpNewPassword').value;
    const confirmPw = document.getElementById('cpConfirmPassword').value;
    const errEl = document.getElementById('cpError');
    errEl.style.display = 'none';
    if (newPw !== confirmPw) {
        errEl.textContent = '两次输入的新密码不一致';
        errEl.style.display = 'block';
        return;
    }
    const btn = document.getElementById('changePasswordSubmit');
    btn.disabled = true;
    try {
        const res = await fetch('/api/me/password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
        });
        if (!res.ok) {
            const err = await res.json();
            errEl.textContent = err.detail || '修改失败';
            errEl.style.display = 'block';
        } else {
            document.getElementById('changePasswordModal').classList.remove('show');
            showSuccess('密码已修改');
        }
    } catch {
        errEl.textContent = '网络错误，请重试';
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false;
    }
});

// App 初始化时检查登录状态
checkLogin();

// ===== 专属问候语 =====
(function setGreeting() {
    const h = new Date().getHours();
    const greetings = {
        morning:   ['早上好，Cecilia ☀️ 新的一天，冲鸭！', '早安 Cecilia，今天也要元气满满～'],
        afternoon: ['下午好，Cecilia 🌤 客户的事交给我~', 'Cecilia 辛苦了，有邮件我来帮你搞定 💪'],
        evening:   ['晚上好，Cecilia 🌙 还在努力呢～', 'Cecilia，今晚的邮件我来帮你收尾 ✨'],
        night:     ['夜深了，Cecilia 🌙 注意休息哦~', '这么晚还在工作，Cecilia 辛苦啦 💙'],
    };
    const pool = h >= 5 && h < 12  ? greetings.morning
               : h >= 12 && h < 18 ? greetings.afternoon
               : h >= 18 && h < 22 ? greetings.evening
               :                     greetings.night;
    const text = pool[Math.floor(Math.random() * pool.length)];
    const el = document.getElementById('headerGreeting');
    if (el) el.textContent = text;
})();

// DOM Elements
const generateBtn = document.getElementById('generateBtn');
const loadTemplateBtn = document.getElementById('loadTemplateBtn');
const resultsSection = document.getElementById('resultsSection');
const resultsContainer = document.getElementById('resultsContainer');
const addTemplateBtn = document.getElementById('addTemplateBtn');
const templateModal = document.getElementById('templateModal');
const templateSelectorModal = document.getElementById('templateSelectorModal');
const templateForm = document.getElementById('templateForm');
const cancelTemplateBtn = document.getElementById('cancelTemplateBtn');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
const settingsForm = document.getElementById('settingsForm');

// ===== 左侧菜单导航 =====
const PAGE_META = {
    emailInbox:       { group: '邮件中心', label: '收件箱' },
    emailSend:        { group: '邮件中心', label: '发邮件' },
    emailBulk:        { group: '邮件中心', label: '群发邮件' },
    emailSentLog:     { group: '邮件中心', label: '发送记录' },
    contactStats:     { group: '邮件中心', label: '联系统计' },
    emailTemplates:   { group: '邮件中心', label: '邮件模板' },
    generator:        { group: '邮件回复', label: '生成回复' },
    history:          { group: '邮件回复', label: '历史记录' },
    templates:        { group: '邮件回复', label: '回复模板' },
    compose:          { group: '邮件撰写', label: '写邮件' },
    composeHistory:   { group: '邮件撰写', label: '撰写记录' },
    composeTemplates: { group: '邮件撰写', label: '撰写模板' },
    customers:        { group: '资源管理', label: '客户管理' },
    settings:         { group: '资源管理', label: '全局设置' },
    anniversaries:    { group: '时光机', label: '纪念日' },
    schedules:        { group: '时光机', label: '日程安排' },
    diaries:          { group: '时光机', label: '日记' },
    engagementTodos:  { group: '时光机', label: '订婚清单' },
    weddingTodos:     { group: '时光机', label: '婚礼清单' },
    weddingBudget:    { group: '时光机', label: '婚礼预算' },
    photoAlbum:       { group: '时光机', label: '时间相册' },
    feedback:         { group: '其他', label: '意见反馈' },
    feedbackAdmin:    { group: '其他', label: '反馈管理' },
    userAdmin:        { group: '其他', label: '用户管理' },
    pagePermAdmin:    { group: '其他', label: '页面授权' },
    profile:          { group: '其他', label: '个人资料' },
    guide:            { group: '其他', label: '使用手册' },
    roleAdmin:        { group: '其他', label: '角色管理' },
};

// Pages that are always admin-only — never configurable for regular users
const ADMIN_ONLY_PAGES     = new Set(['feedbackAdmin', 'userAdmin', 'pagePermAdmin', 'roleAdmin']);
// Pages always visible to all users regardless of permissions
const ALWAYS_VISIBLE_PAGES = new Set(['profile', 'guide']);
// Pages that can be toggled per-user by admin
const PERMISSIONABLE_PAGES = Object.keys(PAGE_META).filter(
    p => !ADMIN_ONLY_PAGES.has(p) && !ALWAYS_VISIBLE_PAGES.has(p)
);

function switchPage(pageId) {
    // 更新菜单激活状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageId);
    });
    // 更新页面显示
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(pageId);
    if (target) target.classList.add('active');
    // 更新面包屑
    const meta = PAGE_META[pageId] || {};
    const groupEl = document.getElementById('topbarGroup');
    const pageEl  = document.getElementById('topbarPage');
    if (groupEl) groupEl.textContent = meta.group || '';
    if (pageEl)  pageEl.textContent  = meta.label || '';
    // 触发数据加载
    if (pageId === 'emailInbox')       loadInbox();
    if (pageId === 'history')          loadHistory();
    if (pageId === 'templates')        loadTemplates();
    if (pageId === 'composeTemplates') loadComposeTemplates();
    if (pageId === 'customers')        loadCustomers();
    if (pageId === 'settings')         loadSettings();
    if (pageId === 'feedbackAdmin')    loadFeedbackAdmin();
    if (pageId === 'composeHistory')   loadComposeHistory();
    if (pageId === 'userAdmin')        loadUserAdmin();
    if (pageId === 'pagePermAdmin')    loadPagePermAdmin();
    if (pageId === 'emailSend')        loadSendCustomerSearch();
    if (pageId === 'emailBulk')        loadBulkCustomers();
    if (pageId === 'emailSentLog')     loadSentLog();
    if (pageId === 'contactStats')     loadContactStats();
    if (pageId === 'emailTemplates')   loadEmailTemplates();
    if (pageId === 'profile')          loadProfile();
    if (pageId === 'anniversaries')    loadAnniversaries();
    if (pageId === 'schedules')        loadSchedules();
    if (pageId === 'diaries')          loadDiaries();
    if (pageId === 'engagementTodos')  loadWeddingTodos('engagement', 1);
    if (pageId === 'weddingTodos')     loadWeddingTodos('wedding', 1);
    if (pageId === 'weddingBudget')    loadBudget(1);
    if (pageId === 'photoAlbum')       loadPhotoAlbum(1);
    if (pageId === 'roleAdmin')        loadRoleAdmin();
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        switchPage(item.dataset.page);
        // 移动端：点击菜单项后自动关闭侧边栏
        if (window.innerWidth <= 768) closeSidebar();
    });
});

// ===== 移动端侧边栏开关 =====
const sidebarEl    = document.querySelector('.sidebar');
const overlayEl    = document.getElementById('sidebarOverlay');
const toggleBtn    = document.getElementById('sidebarToggle');

function openSidebar() {
    sidebarEl.classList.add('open');
    overlayEl.classList.add('active');
    document.body.style.overflow = 'hidden';
}
function closeSidebar() {
    sidebarEl.classList.remove('open');
    overlayEl.classList.remove('active');
    document.body.style.overflow = '';
}

toggleBtn.addEventListener('click', () => {
    sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar();
});
overlayEl.addEventListener('click', closeSidebar);

// Generate email reply
generateBtn.addEventListener('click', async () => {
    const chatContent = document.getElementById('chatContent').value.trim();
    const scenario = document.getElementById('scenario').value;
    const tone = document.getElementById('tone').value;
    const numVersions = parseInt(document.getElementById('numVersions').value);
    const extraRequirements = document.getElementById('extraRequirements').value.trim() || null;

    if (!chatContent) {
        showError('请输入客户聊天内容');
        return;
    }

    generateBtn.disabled = true;
    generateBtn.textContent = '生成中...';
    resultsSection.style.display = 'block';
    resultsContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p>正在生成专业回复...</p></div>';

    try {
        const response = await fetch(`${API_BASE}/api/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                chat_content: chatContent,
                scenario: scenario,
                tone: tone,
                num_versions: numVersions,
                extra_requirements: extraRequirements,
                customer_id: _selectedGeneratorCustomer ? _selectedGeneratorCustomer.id : null,
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '生成失败，请稍后重试');
        }

        const data = await response.json();
        displayResults(data.replies);
    } catch (error) {
        console.error('Error:', error);
        resultsContainer.innerHTML = `<div class="error-message">❌ ${escapeHtml(error.message)}</div>`;
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = '生成回复';
    }
});

// Display generated results
function displayResults(replies) {
    resultsContainer.innerHTML = '';

    const versionTitles = [
        '📝 中文版本（参考理解）',
        '✉️ 英文邮件格式（正式邮件）',
        '💬 企业微信格式（即时消息）'
    ];

    replies.forEach((reply, index) => {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'result-item';
        resultDiv.innerHTML = `
            <div class="result-header">
                <h3>${versionTitles[index] || '版本 ' + (index + 1)}</h3>
                <button class="copy-btn" data-index="${index}">复制</button>
            </div>
            <div class="result-content">${escapeHtml(reply)}</div>
        `;
        resultsContainer.appendChild(resultDiv);
    });

    // Add copy functionality
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            const content = replies[index];
            copyToClipboard(content, e.target);
        });
    });
}

// Copy to clipboard
function copyToClipboard(text, button) {
    navigator.clipboard.writeText(text).then(() => {
        const originalText = button.textContent;
        button.textContent = '已复制!';
        button.classList.add('copied');

        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('复制失败:', err);
        showError('复制失败');
    });
}

// Template management
addTemplateBtn.addEventListener('click', () => {
    templateModal.classList.add('show');
});

cancelTemplateBtn.addEventListener('click', () => {
    templateModal.classList.remove('show');
    templateForm.reset();
});

templateModal.querySelector('.close').addEventListener('click', () => {
    templateModal.classList.remove('show');
    templateForm.reset();
});

templateForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const templateData = {
        name: document.getElementById('templateName').value.trim(),
        scenario: document.getElementById('templateScenario').value,
        tone: document.getElementById('templateTone').value,
        description: document.getElementById('templateDescription').value.trim() || null,
        extra_requirements: document.getElementById('templateExtraReq').value.trim() || null
    };

    try {
        const response = await fetch(`${API_BASE}/api/templates`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify(templateData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || '创建模板失败');
        }

        templateModal.classList.remove('show');
        templateForm.reset();
        showSuccess('模板创建成功!');
        loadTemplates();
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
    }
});

// Load templates
let _templatesAllData = [];
let _templatesPage = 1;
const _TEMPLATES_PAGE_SIZE = 10;

function _applyTemplatesFilter() {
    const q = document.getElementById('templatesSearch').value.trim().toLowerCase();
    const filtered = q
        ? _templatesAllData.filter(t =>
            (t.name || '').toLowerCase().includes(q) ||
            (t.scenario || '').toLowerCase().includes(q) ||
            (t.tone || '').toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q))
        : _templatesAllData;
    renderPaged(filtered, _TEMPLATES_PAGE_SIZE, _templatesPage,
        _renderTemplatesSlice,
        document.getElementById('templatesContainer'),
        document.getElementById('templatesPagination'),
        p => { _templatesPage = p; _applyTemplatesFilter(); },
        document.getElementById('templatesInfo'), '个模板'
    );
}

function _renderTemplatesSlice(slice, total) {
    const container = document.getElementById('templatesContainer');
    if (!total) {
        container.innerHTML = '<div class="empty-state"><h3>暂无模板</h3><p>点击"添加新模板"创建您的第一个模板</p></div>';
        return;
    }
    container.innerHTML = '';
    slice.forEach(template => {
        const templateCard = document.createElement('div');
        templateCard.className = 'template-card';
        templateCard.innerHTML = `
            <div class="template-card-header">
                <div>
                    <h3>${escapeHtml(template.name)}</h3>
                    <div class="template-meta">
                        <span class="meta-item">场景: ${escapeHtml(template.scenario)}</span>
                        <span class="meta-item">语气: ${escapeHtml(template.tone)}</span>
                    </div>
                    ${template.description ? `<p style="color: #666; margin-top: 8px; font-size: 0.9rem;">${escapeHtml(template.description)}</p>` : ''}
                    ${template.extra_requirements ? `<div style="margin-top: 8px; background: #fff8e1; border-left: 3px solid #f0a500; padding: 8px 12px; border-radius: 4px; font-size: 0.9rem; color: #555;"><strong>额外要求：</strong>${escapeHtml(template.extra_requirements)}</div>` : ''}
                </div>
                <div class="card-actions">
                    <button class="btn btn-small btn-danger" onclick="deleteTemplate(${template.id})">删除</button>
                </div>
            </div>
        `;
        container.appendChild(templateCard);
    });
}

async function loadTemplates() {
    const container = document.getElementById('templatesContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const response = await fetch(`${API_BASE}/api/templates?page=1&page_size=500`, { credentials: 'include' });
        const data = await response.json();
        _templatesAllData = data.items || [];
        _templatesPage = 1;
        _applyTemplatesFilter();
    } catch (error) {
        container.innerHTML = '<div class="error-message">加载模板失败</div>';
    }
}

document.getElementById('templatesSearch').addEventListener('input', () => { _templatesPage = 1; _applyTemplatesFilter(); });

// Delete template
async function deleteTemplate(id) {
    showConfirm({
        title: '删除模板',
        message: '确定要删除这个模板吗？',
        onConfirm: async () => {
            try {
                const response = await fetch(`${API_BASE}/api/templates/${id}`, {
                    method: 'DELETE',
                    credentials: 'include',
                });
                if (!response.ok) throw new Error('删除失败');
                showSuccess('模板已删除');
                loadTemplates();
            } catch (error) {
                showError('删除失败');
            }
        }
    });
}

// Load template into form
loadTemplateBtn.addEventListener('click', async () => {
    try {
        const response = await fetch(`${API_BASE}/api/templates`, { credentials: 'include' });
        const templates = await response.json();

        if (templates.length === 0) {
            showError('暂无可用模板');
            return;
        }

        const container = document.getElementById('templateSelectorContainer');
        container.innerHTML = '';

        templates.forEach(template => {
            const item = document.createElement('div');
            item.className = 'template-selector-item';
            item.innerHTML = `
                <h4>${escapeHtml(template.name)}</h4>
                <div class="template-meta">
                    <span class="meta-item">场景: ${escapeHtml(template.scenario)}</span>
                    <span class="meta-item">语气: ${escapeHtml(template.tone)}</span>
                </div>
                ${template.extra_requirements ? `<p style="margin-top: 6px; font-size: 0.85rem; color: #888;">额外要求: ${escapeHtml(template.extra_requirements)}</p>` : ''}
            `;
            item.addEventListener('click', () => {
                document.getElementById('scenario').value = template.scenario;
                document.getElementById('tone').value = template.tone;
                if (template.extra_requirements) {
                    document.getElementById('extraRequirements').value = template.extra_requirements;
                }
                templateSelectorModal.classList.remove('show');
                showSuccess('模板已加载');
            });
            container.appendChild(item);
        });

        templateSelectorModal.classList.add('show');
    } catch (error) {
        console.error('Error:', error);
        showError('加载模板失败');
    }
});

templateSelectorModal.querySelector('.close').addEventListener('click', () => {
    templateSelectorModal.classList.remove('show');
});

// Load history
let _historyAllData = [];
let _historyPage = 1;

async function loadHistory() {
    const container = document.getElementById('historyContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const response = await fetch(`${API_BASE}/api/history?limit=500`, { credentials: 'include' });
        _historyAllData = await response.json();
        window._historyData = {};
        window._historyItems = {};
        _historyAllData.forEach(item => {
            window._historyData[item.id] = { zh: item.generated_reply, en: item.reply_en || null, wechat: item.reply_wechat || null };
            window._historyItems[item.id] = item;
        });
        _historyPage = 1;
        _applyHistoryFilter();
    } catch (error) {
        container.innerHTML = '<div class="error-message">加载历史记录失败</div>';
    }
}

function _applyHistoryFilter() {
    const q        = (document.getElementById('historySearchQ').value || '').trim().toLowerCase();
    const customer = document.getElementById('historySearchCustomer').value;
    const filtered = _historyAllData.filter(item => {
        if (customer && item.customer_name !== customer) return false;
        if (q) {
            const hay = [item.title, item.scenario, item.tone, item.generated_reply, item.reply_en, item.customer_name]
                .filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    renderPaged(filtered, 15, _historyPage,
        (slice, total) => _renderHistoryPage(slice, total, q || customer),
        null,
        document.getElementById('historyPagination'),
        p => { _historyPage = p; _applyHistoryFilter(); },
        document.getElementById('historyInfo'),
        '条记录'
    );
}

function _renderHistoryPage(items, total, hasFilter) {
    const container = document.getElementById('historyContainer');
    if (!items.length) {
        container.innerHTML = hasFilter
            ? '<div class="empty-state"><h3>未找到匹配记录</h3><p>尝试修改搜索条件</p></div>'
            : '<div class="empty-state"><h3>暂无历史记录</h3><p>开始生成您的第一个邮件回复吧！</p></div>';
        return;
    }
    const tbody = items.map(item => {
        const hasTabs = item.reply_en || item.reply_wechat;
        const replyCell = hasTabs ? `
            <div class="reply-tabs">
                <div class="reply-tab-btns">
                    <button class="reply-tab-btn active" onclick="switchReplyTab(${item.id}, 'zh', this)">中文</button>
                    ${item.reply_en ? `<button class="reply-tab-btn" onclick="switchReplyTab(${item.id}, 'en', this)">英文邮件</button>` : ''}
                    ${item.reply_wechat ? `<button class="reply-tab-btn" onclick="switchReplyTab(${item.id}, 'wechat', this)">微信</button>` : ''}
                </div>
                <div id="reply-content-${item.id}" class="cell-text-clamp">${escapeHtml(item.generated_reply)}</div>
            </div>` : `<div class="cell-text-clamp">${escapeHtml(item.generated_reply)}</div>`;
        return `<tr>
            <td class="cell-time">${fmtTime(item.created_at)}</td>
            <td><span class="tag">${escapeHtml(item.scenario)}</span></td>
            <td><span class="tag tag-tone">${escapeHtml(item.tone)}</span></td>
            <td class="cell-content"><div class="cell-title">${item.title ? escapeHtml(item.title) : '<span style="color:#bbb">—</span>'}</div></td>
            <td class="cell-content">${replyCell}</td>
            <td class="cell-actions">
                <button class="btn btn-small btn-view" onclick="openHistoryDetail(${item.id})">查看</button>
                <button class="btn btn-small btn-danger" onclick="deleteHistory(${item.id})">删除</button>
            </td>
        </tr>`;
    }).join('');
    container.innerHTML = `<table class="history-table">
        <thead><tr>
            <th style="width:110px">时间</th><th style="width:90px">场景</th>
            <th style="width:80px">语气</th><th style="width:160px">标题</th>
            <th>生成回复</th><th style="width:70px">操作</th>
        </tr></thead>
        <tbody>${tbody}</tbody>
    </table>`;
}

// Switch reply tab in history table
function switchReplyTab(id, type, btn) {
    const data = window._historyData && window._historyData[id];
    if (!data) return;
    const content = data[type];
    if (!content) return;

    document.getElementById(`reply-content-${id}`).textContent = content;

    const tabBtns = btn.closest('.reply-tab-btns').querySelectorAll('.reply-tab-btn');
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 记录当前 tab 以便复制
    window._historyData[id]._currentTab = type;
}

// Copy history reply
function copyHistoryReplyById(id, button) {
    const data = window._historyData && window._historyData[id];
    if (!data) return;
    const type = data._currentTab || 'zh';
    const content = data[type] || data.zh;
    if (content) copyToClipboard(content, button);
}

// History detail modal
const historyDetailModal = document.getElementById('historyDetailModal');
const historyDetailContent = document.getElementById('historyDetailContent');
const historyDetailMeta = document.getElementById('historyDetailMeta');
const historyDetailCopyBtn = document.getElementById('historyDetailCopyBtn');
let _detailCurrentId = null;
let _detailCurrentType = 'zh';

function openHistoryDetail(id) {
    const data = window._historyData && window._historyData[id];
    if (!data) return;
    _detailCurrentId = id;
    _detailCurrentType = 'zh';

    // 显示 meta 信息
    const item = window._historyItems && window._historyItems[id];
    if (item) {
        historyDetailMeta.innerHTML = `
            <span class="tag">${escapeHtml(item.scenario)}</span>
            <span class="tag tag-tone" style="margin-left:6px">${escapeHtml(item.tone)}</span>
            <span style="color:#888; font-size:0.85rem; margin-left:10px">${fmtTime(item.created_at)}</span>
            <div style="margin-top:10px; color:#555; font-size:0.9rem;"><strong>客户内容：</strong>${escapeHtml(item.chat_content)}</div>
        `;
    }

    // 设置 tab 按钮状态
    document.querySelectorAll('.detail-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === 'zh');
        btn.style.display = data[btn.dataset.type] ? '' : 'none';
    });

    historyDetailContent.textContent = data.zh || '';
    historyDetailModal.classList.add('show');
}

document.querySelectorAll('.detail-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const data = window._historyData && window._historyData[_detailCurrentId];
        if (!data) return;
        _detailCurrentType = btn.dataset.type;
        historyDetailContent.textContent = data[_detailCurrentType] || '';
        document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

historyDetailCopyBtn.addEventListener('click', () => {
    const data = window._historyData && window._historyData[_detailCurrentId];
    if (!data) return;
    const content = data[_detailCurrentType] || data.zh;
    if (content) copyToClipboard(content, historyDetailCopyBtn);
});

document.getElementById('historyDetailClose').addEventListener('click', () => {
    historyDetailModal.classList.remove('show');
});

// Delete history
async function deleteHistory(id) {
    showConfirm({
        title: '删除记录',
        message: '确定要删除这条记录吗？',
        onConfirm: async () => {
            try {
                const response = await fetch(`${API_BASE}/api/history/${id}`, {
                    method: 'DELETE',
                    credentials: 'include',
                });
                if (!response.ok) throw new Error('删除失败');
                showSuccess('记录已删除');
                loadHistory();
            } catch (error) {
                showError('删除失败');
            }
        }
    });
}

refreshHistoryBtn.addEventListener('click', loadHistory);
document.getElementById('historySearchBtn').addEventListener('click', () => { _historyPage = 1; _applyHistoryFilter(); });
document.getElementById('historySearchClearBtn').addEventListener('click', () => {
    document.getElementById('historySearchQ').value = '';
    document.getElementById('historySearchCustomer').value = '';
    _historyPage = 1; _applyHistoryFilter();
});
document.getElementById('historySearchQ').addEventListener('input', () => { _historyPage = 1; _applyHistoryFilter(); });
document.getElementById('historySearchCustomer').addEventListener('change', () => { _historyPage = 1; _applyHistoryFilter(); });

// Global settings
async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE}/api/settings`, { credentials: 'include' });
        const settings = await response.json();

        document.getElementById('companyName').value = settings.company_name || '';
        document.getElementById('productsInfo').value = settings.products_info || '';
        document.getElementById('contactInfo').value = settings.contact_info || '';
        document.getElementById('companySignature').value = settings.company_signature || '';
        window._cachedSignature = settings.company_signature || null;
        // Email account
        document.getElementById('settingsEmailAddress').value = settings.email_address || '';
        document.getElementById('settingsEmailPassword').value = settings.email_password || '';
        document.getElementById('settingsSmtpHost').value = settings.smtp_host || 'smtp.qiye.aliyun.com';
        document.getElementById('settingsSmtpPort').value = settings.smtp_port || 465;
        document.getElementById('settingsImapHost').value = settings.imap_host || 'imap.qiye.aliyun.com';
        document.getElementById('settingsImapPort').value = settings.imap_port || 993;
        // 缓存邮箱地址供发件人显示使用
        window._cachedSettings = settings;
        _updateSendFromDisplay();
    } catch (error) {
        console.error('Error loading settings:', error);
        showError('加载设置失败');
    }
}

settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const settingsData = {
        company_name: document.getElementById('companyName').value.trim() || null,
        products_info: document.getElementById('productsInfo').value.trim() || null,
        contact_info: document.getElementById('contactInfo').value.trim() || null,
        company_signature: document.getElementById('companySignature').value.trim() || null,
        // Email account
        email_address: document.getElementById('settingsEmailAddress').value.trim() || null,
        email_password: document.getElementById('settingsEmailPassword').value.trim() || null,
        smtp_host: document.getElementById('settingsSmtpHost').value.trim() || null,
        smtp_port: parseInt(document.getElementById('settingsSmtpPort').value) || null,
        imap_host: document.getElementById('settingsImapHost').value.trim() || null,
        imap_port: parseInt(document.getElementById('settingsImapPort').value) || null,
    };

    try {
        const response = await fetch(`${API_BASE}/api/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(settingsData)
        });

        if (!response.ok) {
            throw new Error('保存失败');
        }

        showSuccess('全局设置已保存！');
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
    }
});

// Test email connection button
document.getElementById('testEmailConnectionBtn').addEventListener('click', async () => {
    const btn = document.getElementById('testEmailConnectionBtn');
    const resultEl = document.getElementById('emailConnectionTestResult');
    btn.disabled = true;
    btn.textContent = '测试中...';
    resultEl.style.display = 'none';
    try {
        const res = await fetch('/api/email-center/test-connection', {
            method: 'POST',
            credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) {
            resultEl.innerHTML = `<div class="error-message">${data.detail || '请求失败'}</div>`;
        } else {
            const smtpOk = data.smtp ? '✅ SMTP 连接成功' : `❌ SMTP 失败：${data.errors?.smtp || '未知错误'}`;
            const imapOk = data.imap ? '✅ IMAP 连接成功' : `❌ IMAP 失败：${data.errors?.imap || '未知错误'}`;
            const allOk = data.smtp && data.imap;
            resultEl.innerHTML = `<div class="${allOk ? 'success-message' : 'error-message'}">${smtpOk}<br>${imapOk}</div>`;
        }
        resultEl.style.display = 'block';
    } catch {
        resultEl.innerHTML = '<div class="error-message">网络错误，请重试</div>';
        resultEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = '测试邮箱连接';
    }
});

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '20px';
    errorDiv.style.right = '20px';
    errorDiv.style.zIndex = '10000';
    errorDiv.style.minWidth = '300px';

    document.body.appendChild(errorDiv);

    setTimeout(() => {
        errorDiv.remove();
    }, 3000);
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    successDiv.style.position = 'fixed';
    successDiv.style.top = '20px';
    successDiv.style.right = '20px';
    successDiv.style.zIndex = '10000';
    successDiv.style.minWidth = '300px';

    document.body.appendChild(successDiv);

    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

// Close modals when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === templateModal) {
        templateModal.classList.remove('show');
        templateForm.reset();
    }
    if (e.target === templateSelectorModal) {
        templateSelectorModal.classList.remove('show');
    }
    if (e.target === historyDetailModal) {
        historyDetailModal.classList.remove('show');
    }
    const customerModal = document.getElementById('customerModal');
    const customerDetailModal = document.getElementById('customerDetailModal');
    if (e.target === customerModal) {
        customerModal.classList.remove('show');
    }
    if (e.target === customerDetailModal) {
        customerDetailModal.classList.remove('show');
    }
    const sendPreviewModal = document.getElementById('sendPreviewModal');
    if (e.target === sendPreviewModal) {
        sendPreviewModal.classList.remove('show');
    }
});

// ===== Feedback =====

// Screenshot upload state (multi-image)
let _feedbackScreenshots = [];  // [{file, url}, ...]
const MAX_SCREENSHOTS = 5;

(function initScreenshotUpload() {
    const fileInput = document.getElementById('screenshotFileInput');
    const addBtn    = document.getElementById('screenshotAddBtn');
    const listEl    = document.getElementById('screenshotList');

    function addScreenshot(file) {
        if (!file || !file.type.startsWith('image/')) {
            showError('请选择图片文件'); return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showError('截图文件不能超过 5MB'); return;
        }
        if (_feedbackScreenshots.length >= MAX_SCREENSHOTS) {
            showError(`最多添加 ${MAX_SCREENSHOTS} 张截图`); return;
        }
        _feedbackScreenshots.push({ file, url: URL.createObjectURL(file) });
        renderScreenshotList();
    }

    function removeScreenshot(idx) {
        URL.revokeObjectURL(_feedbackScreenshots[idx].url);
        _feedbackScreenshots.splice(idx, 1);
        renderScreenshotList();
    }

    function renderScreenshotList() {
        if (!_feedbackScreenshots.length) {
            listEl.innerHTML = '<div class="screenshot-empty-hint">📎 点击「添加截图」或按 Ctrl+V 粘贴</div>';
        } else {
            listEl.innerHTML = _feedbackScreenshots.map((s, i) => `
                <div class="screenshot-item">
                    <img src="${s.url}" class="screenshot-thumb-sm" onclick="openScreenshotLightbox('${s.url}')" title="点击查看大图">
                    <button type="button" class="screenshot-remove-sm" onclick="_removeScreenshot(${i})" title="移除">✕</button>
                </div>
            `).join('');
        }
        addBtn.style.display = _feedbackScreenshots.length >= MAX_SCREENSHOTS ? 'none' : '';
    }

    // expose for inline onclick
    window._removeScreenshot = removeScreenshot;

    addBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) {
            addScreenshot(fileInput.files[0]);
            fileInput.value = '';
        }
    });

    // Paste from clipboard (only when on feedback page)
    document.addEventListener('paste', (e) => {
        const feedbackPage = document.getElementById('feedback');
        if (!feedbackPage || !feedbackPage.classList.contains('active')) return;
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                addScreenshot(item.getAsFile());
                break;
            }
        }
    });

    // Expose clear for form reset
    window._clearFeedbackScreenshots = () => {
        _feedbackScreenshots.forEach(s => URL.revokeObjectURL(s.url));
        _feedbackScreenshots = [];
        renderScreenshotList();
    };

    renderScreenshotList();
})();

// Submit feedback
document.getElementById('feedbackForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = document.getElementById('feedbackContent').value.trim();
    const category = document.getElementById('feedbackCategory').value;
    if (!content) return;

    const fd = new FormData();
    fd.append('content', content);
    fd.append('category', category);
    _feedbackScreenshots.forEach(s => fd.append('screenshots', s.file, s.file.name));

    try {
        const response = await fetch(`${API_BASE}/api/feedback`, {
            method: 'POST',
            credentials: 'include',
            body: fd,
        });
        if (!response.ok) throw new Error('提交失败');
        document.getElementById('feedbackForm').reset();
        window._clearFeedbackScreenshots();
        showSuccess('反馈已提交，感谢您的建议！');
    } catch (error) {
        console.error('Error:', error);
        showError('提交失败，请重试');
    }
});

// Load feedback admin list
let _feedbackAdminAllData = [];
let _feedbackAdminPage = 1;
const _FEEDBACK_PAGE_SIZE = 10;

function _applyFeedbackAdminFilter() {
    const q = document.getElementById('feedbackAdminSearch').value.trim().toLowerCase();
    const statusVal = document.getElementById('feedbackAdminStatusFilter').value;
    let filtered = _feedbackAdminAllData;
    if (q) filtered = filtered.filter(item =>
        (item.content || '').toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q));
    if (statusVal) filtered = filtered.filter(item => item.status === statusVal);
    renderPaged(filtered, _FEEDBACK_PAGE_SIZE, _feedbackAdminPage,
        _renderFeedbackAdminSlice,
        document.getElementById('feedbackAdminContainer'),
        document.getElementById('feedbackAdminPagination'),
        p => { _feedbackAdminPage = p; _applyFeedbackAdminFilter(); },
        document.getElementById('feedbackAdminInfo'), '条反馈'
    );
}

function _renderFeedbackAdminSlice(slice, total) {
    const container = document.getElementById('feedbackAdminContainer');
    if (!total) {
        container.innerHTML = '<div class="empty-state"><h3>暂无反馈</h3><p>用户提交意见后将在此显示</p></div>';
        return;
    }
    container.innerHTML = '';
    slice.forEach(item => {
        const createdAt = fmtTime(item.created_at);
        const isDone = item.status === 'done';
        let screenshotHtml = '';
        if (item.screenshot_paths) {
            try {
                const paths = JSON.parse(item.screenshot_paths);
                if (paths.length) {
                    const thumbs = paths.map(p =>
                        `<img src="${escapeHtml(p)}" class="feedback-screenshot-thumb"
                              onclick="openScreenshotLightbox('${escapeHtml(p)}')"
                              title="点击查看大图">`
                    ).join('');
                    screenshotHtml = `<div class="feedback-screenshot">${thumbs}</div>`;
                }
            } catch {}
        }
        const card = document.createElement('div');
        card.className = 'feedback-card';
        card.innerHTML = `
            <div class="feedback-card-header">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    <span class="tag">${escapeHtml(item.category || '其他')}</span>
                    <span class="status-badge ${isDone ? 'status-done' : 'status-pending'}">${isDone ? '已完成' : '待处理'}</span>
                    <span style="color:#aaa;font-size:0.82rem">${createdAt}</span>
                </div>
                <div class="card-actions">
                    ${!isDone ? `<button class="btn btn-small btn-secondary" onclick="markFeedbackDone(${item.id})">标记完成</button>` : ''}
                    <button class="btn btn-small btn-danger" onclick="deleteFeedback(${item.id})">删除</button>
                </div>
            </div>
            <div class="feedback-content">${escapeHtml(item.content)}</div>
            ${screenshotHtml}
        `;
        container.appendChild(card);
    });
}

async function loadFeedbackAdmin() {
    const container = document.getElementById('feedbackAdminContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const response = await fetch(`${API_BASE}/api/feedback?page=1&page_size=500`, { credentials: 'include' });
        const data = await response.json();
        _feedbackAdminAllData = data.items || [];
        _feedbackAdminPage = 1;
        _applyFeedbackAdminFilter();
    } catch (error) {
        container.innerHTML = '<div class="error-message">加载反馈失败</div>';
    }
}

document.getElementById('feedbackAdminSearch').addEventListener('input', () => { _feedbackAdminPage = 1; _applyFeedbackAdminFilter(); });
document.getElementById('feedbackAdminStatusFilter').addEventListener('change', () => { _feedbackAdminPage = 1; _applyFeedbackAdminFilter(); });

function openScreenshotLightbox(src) {
    document.getElementById('screenshotLightboxImg').src = src;
    document.getElementById('screenshotLightbox').classList.add('show');
}

async function markFeedbackDone(id) {
    try {
        const response = await fetch(`${API_BASE}/api/feedback/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: 'done' })
        });
        if (!response.ok) throw new Error('操作失败');
        loadFeedbackAdmin();
    } catch (error) {
        console.error('Error:', error);
        showError('操作失败');
    }
}

async function deleteFeedback(id) {
    showConfirm({
        title: '删除反馈',
        message: '确定要删除这条反馈吗？',
        onConfirm: async () => {
            try {
                const response = await fetch(`${API_BASE}/api/feedback/${id}`, { method: 'DELETE', credentials: 'include' });
                if (!response.ok) throw new Error('删除失败');
                loadFeedbackAdmin();
            } catch (error) {
                showError('删除失败');
            }
        }
    });
}

document.getElementById('refreshFeedbackBtn').addEventListener('click', loadFeedbackAdmin);


// ===== 邮件撰写 (Compose) =====

let _composeCurrentType = '开发信';
let _composeResult = { en: '', zh: '' };
let _composeLang = 'en';
let _customEmailTypes = [];   // loaded from server

const COMPOSE_BANNERS = {
    '开发信':   '🚀 主动出击！填入目标客户背景，AI 帮你写一封专业的开发信 ~',
    '跟进邮件': '🔄 保持跟进！描述上次沟通情况，AI 帮你写一封得体的跟进邮件 ~',
    '产品推荐': '🎯 精准推荐！描述客户痛点和产品亮点，AI 帮你写一封有说服力的推荐邮件 ~',
    '报价跟进': '💰 推进订单！描述报价情况和客户状态，AI 帮你写一封有力的报价跟进邮件 ~',
    '节后跟进': '🎉 节后复热！填入客户背景和节日信息，AI 帮你写一封温暖的节后问候邮件 ~',
};

const COMPOSE_PLACEHOLDERS = {
    '开发信':   '描述目标客户的信息，越详细越好。例：\n- 客户公司：XX Trading Co.，英国，主营家居类产品\n- 渠道：LinkedIn 找到，尚未联系过\n- 客户关注点：产品认证、交期\n- 本次目标：引起兴趣，获取回复',
    '跟进邮件': '描述上次沟通情况和本次目的。例：\n- 客户公司：ABC Ltd，上周发过报价单\n- 当前状态：客户未回复，已过3天\n- 本次目标：礼貌跟进，询问是否有问题',
    '产品推荐': '描述客户背景和要推荐的产品。例：\n- 客户公司：XYZ Corp，德国，主营工业照明\n- 新品：我司新款 LED 工矿灯，效率提升20%\n- 客户痛点：之前反映旧款能耗高\n- 本次目标：推荐新品，邀请测试',
    '报价跟进': '描述报价情况和跟进背景。例：\n- 客户公司：Sunrise Ltd，澳大利亚\n- 报价时间：10天前，报价总额约 $8,000\n- 当前状态：已读但无回复\n- 本次目标：了解客户顾虑，推进下单',
    '节后跟进': '描述客户情况和节假日背景。例：\n- 客户公司：Global Trade Co.，美国\n- 节假日：春节假期刚结束\n- 上次联系：节前已确认样品满意\n- 本次目标：节后重新联系，推进订单',
};

const FIXED_COMPOSE_TYPES = ['开发信', '跟进邮件', '产品推荐', '报价跟进', '节后跟进'];

function _updateComposePlaceholder(type) {
    const el = document.getElementById('composeTargetInfo');
    el.placeholder = COMPOSE_PLACEHOLDERS[type]
        || '描述目标客户的信息和本次邮件的目的，越详细越好。';
    const banner = document.querySelector('#compose .cecilia-banner');
    if (banner) {
        banner.textContent = COMPOSE_BANNERS[type]
            || `✍️ 填入客户背景，AI 帮你写一封「${type}」邮件 ~`;
    }
}

function _selectComposeTypeBtn(type) {
    document.querySelectorAll('.compose-type-btn[data-type]').forEach(b => b.classList.remove('active'));
    const target = document.querySelector(`.compose-type-btn[data-type="${CSS.escape(type)}"]`);
    if (target) target.classList.add('active');
    _composeCurrentType = type;
    _updateComposePlaceholder(type);
}

// ── 自定义类型：渲染卡片 ──
function _renderCustomTypeCards() {
    const grid = document.getElementById('composeTypeGrid');
    const addBtn = document.getElementById('composeTypeAddBtn');
    // 移除旧的自定义卡片
    grid.querySelectorAll('.compose-type-custom').forEach(el => el.remove());
    // 在「新增」按钮前插入自定义卡片
    _customEmailTypes.forEach(typeName => {
        const btn = document.createElement('button');
        btn.className = 'compose-type-btn compose-type-custom';
        btn.dataset.type = typeName;
        btn.innerHTML = `
            <span class="compose-type-icon">✏️</span>
            <span class="compose-type-label">${escapeHtml(typeName)}</span>
            <span class="compose-type-desc">自定义</span>
            <span class="compose-type-del" title="删除此类型" onclick="event.stopPropagation();_deleteCustomType('${escapeHtml(typeName)}')">✕</span>
        `;
        btn.addEventListener('click', () => _selectComposeTypeBtn(typeName));
        grid.insertBefore(btn, addBtn);
    });
    // 如果当前选中的是已删除的自定义类型，回退到开发信
    const stillExists = FIXED_COMPOSE_TYPES.includes(_composeCurrentType)
        || _customEmailTypes.includes(_composeCurrentType);
    if (!stillExists) _selectComposeTypeBtn('开发信');
}

async function _loadCustomEmailTypes() {
    try {
        const res = await fetch('/api/custom-email-types', { credentials: 'include' });
        _customEmailTypes = await res.json();
    } catch {
        _customEmailTypes = [];
    }
    _renderCustomTypeCards();
}

async function _saveCustomEmailTypes() {
    try {
        await fetch('/api/custom-email-types', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(_customEmailTypes),
        });
    } catch {
        showError('保存失败');
    }
}

async function _deleteCustomType(typeName) {
    showConfirm({
        title: '删除邮件类型',
        message: `删除类型「${typeName}」？`,
        onConfirm: async () => {
            _customEmailTypes = _customEmailTypes.filter(t => t !== typeName);
            _renderCustomTypeCards();
            await _saveCustomEmailTypes();
            showSuccess(`已删除「${typeName}」`);
        }
    });
}

// ── 新增类型按钮逻辑 ──
document.getElementById('composeTypeAddBtn').addEventListener('click', () => {
    const row = document.getElementById('composeAddTypeRow');
    row.classList.add('open');
    document.getElementById('composeNewTypeName').value = '';
    document.getElementById('composeNewTypeName').focus();
});

document.getElementById('composeNewTypeCancel').addEventListener('click', () => {
    document.getElementById('composeAddTypeRow').classList.remove('open');
});

document.getElementById('composeNewTypeConfirm').addEventListener('click', async () => {
    const name = document.getElementById('composeNewTypeName').value.trim();
    if (!name) { showError('请输入类型名称'); return; }
    if (FIXED_COMPOSE_TYPES.includes(name) || _customEmailTypes.includes(name)) {
        showError('该类型已存在'); return;
    }
    _customEmailTypes.push(name);
    _renderCustomTypeCards();
    await _saveCustomEmailTypes();
    document.getElementById('composeAddTypeRow').classList.remove('open');
    _selectComposeTypeBtn(name);
    showSuccess(`已添加「${name}」`);
});

document.getElementById('composeNewTypeName').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('composeNewTypeConfirm').click();
    if (e.key === 'Escape') document.getElementById('composeNewTypeCancel').click();
});

// ── 固定类型按钮事件 ──
document.querySelectorAll('.compose-type-btn[data-type]').forEach(btn => {
    if (btn.id === 'composeTypeAddBtn') return;
    btn.addEventListener('click', () => _selectComposeTypeBtn(btn.dataset.type));
});

// 初始化
_updateComposePlaceholder(_composeCurrentType);
_loadCustomEmailTypes();

// 生成邮件
document.getElementById('composeBtn').addEventListener('click', async () => {
    const targetInfo = document.getElementById('composeTargetInfo').value.trim();
    if (!targetInfo) {
        showError('请填写目标客户背景');
        return;
    }
    const emailType = _composeCurrentType;

    const btn = document.getElementById('composeBtn');
    btn.disabled = true;
    btn.textContent = '生成中...';

    const resultSection = document.getElementById('composeResultSection');
    resultSection.style.display = 'block';
    document.getElementById('composeResultContent').innerHTML =
        '<div class="loading"><div class="spinner"></div><p>AI 正在撰写邮件，请稍候...</p></div>';

    try {
        const response = await fetch(`${API_BASE}/api/compose`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                email_type: emailType,
                target_info: targetInfo,
                tone: document.getElementById('composeTone').value,
                extra_requirements: document.getElementById('composeExtra').value.trim() || null,
                customer_id: _selectedComposeCustomer ? _selectedComposeCustomer.id : null,
            })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || '生成失败，请稍后重试');
        }
        const data = await response.json();
        _composeResult = { en: data.en, zh: data.zh };
        _composeLang = 'en';

        // 重置 tab 状态
        document.querySelectorAll('.compose-result-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.lang === 'en');
        });
        document.getElementById('composeResultContent').textContent = _composeResult.en;
        loadComposeHistory();
    } catch (err) {
        document.getElementById('composeResultContent').textContent = '';
        showError(err.message || '生成失败，请稍后重试');
    } finally {
        btn.disabled = false;
        btn.textContent = '✍️ 生成邮件';
    }
});

// 语言切换
document.querySelectorAll('.compose-result-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.compose-result-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _composeLang = btn.dataset.lang;
        document.getElementById('composeResultContent').textContent = _composeResult[_composeLang] || '';
    });
});

// 复制
document.getElementById('composeCopyBtn').addEventListener('click', function() {
    const content = _composeResult[_composeLang];
    if (!content) return;
    copyToClipboard(content, this);
});

// 生成完毕后自动刷新撰写历史
const _origComposeBtn = document.getElementById('composeBtn');
_origComposeBtn.addEventListener('click', () => {
    // 等生成完成后刷新（在 fetch 完成后会调用 loadComposeHistory）
});

// ===== 撰写历史 =====
const _composeHistoryData = {};  // id -> record
let _composeHistoryAllData = [];
let _composeHistoryPage = 1;

function _stripSubjectLine(text) {
    return (text || '').replace(/^[ \t]*subject:[^\n]*\n?/im, '').trimStart();
}

async function loadComposeHistory() {
    const container = document.getElementById('composeHistoryContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const res = await fetch(`${API_BASE}/api/compose/history?limit=500`, { credentials: 'include' });
        _composeHistoryAllData = await res.json();
        _composeHistoryAllData.forEach(r => { _composeHistoryData[r.id] = r; });
        _composeHistoryPage = 1;
        _applyComposeHistoryFilter();
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

function _applyComposeHistoryFilter() {
    const q        = (document.getElementById('composeHistorySearchQ').value || '').trim().toLowerCase();
    const customer = document.getElementById('composeHistorySearchCustomer').value;
    const type     = document.getElementById('composeHistorySearchType').value;
    const filtered = _composeHistoryAllData.filter(r => {
        if (type && r.email_type !== type) return false;
        if (customer && r.customer_name !== customer) return false;
        if (q) {
            const hay = [r.email_type, r.tone, r.reply_en, r.reply_zh, r.target_info, r.customer_name]
                .filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    renderPaged(filtered, 10, _composeHistoryPage,
        (slice, total) => _renderComposeHistoryPage(slice, total, q || customer || type),
        null,
        document.getElementById('composeHistoryPagination'),
        p => { _composeHistoryPage = p; _applyComposeHistoryFilter(); },
        document.getElementById('composeHistoryInfo'),
        '条记录'
    );
}

function _renderComposeHistoryPage(records, total, hasFilter) {
    const container = document.getElementById('composeHistoryContainer');
    if (!records.length) {
        container.innerHTML = hasFilter
            ? '<div class="empty-state"><h3>未找到匹配记录</h3><p>尝试修改搜索条件</p></div>'
            : '<div class="empty-state"><h3>暂无撰写记录</h3><p>生成邮件后自动保存在这里</p></div>';
        return;
    }
    const typeIcons = { '开发信':'🚀','跟进邮件':'🔄','产品推荐':'🎯','报价跟进':'💰','节后跟进':'🎉','自定义':'✏️' };
    container.innerHTML = records.map(r => {
        const icon = typeIcons[r.email_type] || '✉️';
        const lines = (r.reply_en || '').split('\n');
        let subject = '';
        for (const line of lines) {
            if (!subject && line.trim().toLowerCase().startsWith('subject:')) subject = line.trim().replace(/^subject:\s*/i, '');
        }
        const customerTag = r.customer_name ? `<span class="tag tag-customer">👤 ${escapeHtml(r.customer_name)}</span>` : '';
        return `<div class="compose-history-card" id="compose-card-${r.id}">
            <div class="compose-history-header">
                <div class="compose-history-meta">
                    <span class="compose-history-type">${icon} ${r.email_type}</span>
                    <span class="tag tag-tone">${r.tone}</span>
                    ${customerTag}
                    <span class="cell-time">${fmtTime(r.created_at)}</span>
                </div>
                <div class="card-actions">
                    <button class="btn btn-small btn-view" onclick="toggleComposeDetail(${r.id}, this)">查看</button>
                    <button class="btn btn-small btn-danger" onclick="deleteComposeHistory(${r.id})">删除</button>
                </div>
            </div>
            ${subject ? `<div class="compose-history-subject">📌 ${escapeHtml(subject)}</div>` : ''}
            ${r.target_info ? `<div class="compose-history-target">要求：${escapeHtml(r.target_info)}</div>` : ''}
            <div class="compose-history-detail" id="compose-detail-${r.id}" style="display:none;">
                <div class="compose-detail-tabs">
                    <button class="compose-result-tab-btn active" onclick="switchComposeDetailLang(${r.id},'en',this)">✉️ 英文邮件</button>
                    <button class="compose-result-tab-btn" onclick="switchComposeDetailLang(${r.id},'zh',this)">📝 中文对照</button>
                </div>
                <div class="result-content" id="compose-detail-content-${r.id}" style="margin-top:10px;white-space:pre-wrap;">${escapeHtml(_stripSubjectLine(r.reply_en || ''))}</div>
                <div class="form-actions" style="margin-top:10px;">
                    <button class="btn btn-secondary btn-small" onclick="copyComposeHistory(${r.id})">复制</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function toggleComposeDetail(id, btn) {
    const detail = document.getElementById(`compose-detail-${id}`);
    if (!detail) return;
    const isOpen = detail.style.display !== 'none';
    detail.style.display = isOpen ? 'none' : 'block';
    btn.textContent = isOpen ? '查看' : '收起';
}

function switchComposeDetailLang(id, lang, btn) {
    const record = _composeHistoryData[id];
    if (!record) return;
    const text = record['reply_' + lang] || '';
    document.getElementById(`compose-detail-content-${id}`).textContent =
        lang === 'en' ? _stripSubjectLine(text) : text;
    btn.closest('.compose-detail-tabs').querySelectorAll('.compose-result-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    btn._lang = lang;
}

function copyComposeHistory(id) {
    const contentEl = document.getElementById(`compose-detail-content-${id}`);
    if (!contentEl) return;
    navigator.clipboard.writeText(contentEl.textContent).then(() => {
        showSuccess('已复制');
    });
}

async function deleteComposeHistory(id) {
    showConfirm({
        title: '删除撰写记录',
        message: '确定删除这条撰写记录吗？',
        onConfirm: async () => {
            try {
                const res = await fetch(`${API_BASE}/api/compose/history/${id}`, { method: 'DELETE', credentials: 'include' });
                if (!res.ok) throw new Error('删除失败');
                loadComposeHistory();
            } catch (e) {
                showError('删除失败');
            }
        }
    });
}

document.getElementById('refreshComposeHistoryBtn').addEventListener('click', loadComposeHistory);
document.getElementById('composeHistorySearchBtn').addEventListener('click', () => {
    const q = document.getElementById('composeHistorySearchQ').value.trim();
    const customer = document.getElementById('composeHistorySearchCustomer').value;
    loadComposeHistory(q, customer);
});
document.getElementById('composeHistorySearchClearBtn').addEventListener('click', () => {
    document.getElementById('composeHistorySearchQ').value = '';
    document.getElementById('composeHistorySearchType').value = '';
    document.getElementById('composeHistorySearchCustomer').value = '';
    loadComposeHistory();
});
document.getElementById('composeHistorySearchQ').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('composeHistorySearchBtn').click();
});
document.getElementById('composeHistorySearchType').addEventListener('change', () => {
    document.getElementById('composeHistorySearchBtn').click();
});
document.getElementById('composeHistorySearchCustomer').addEventListener('change', () => {
    document.getElementById('composeHistorySearchBtn').click();
});


// ===== 撰写模板 (Compose Templates) =====

const composeTemplateModal = document.getElementById('composeTemplateModal');
const composeTemplateSelectorModal = document.getElementById('composeTemplateSelectorModal');

// 打开新增模板 Modal
document.getElementById('addComposeTemplateBtn').addEventListener('click', () => {
    document.getElementById('composeTemplateForm').reset();
    composeTemplateModal.classList.add('show');
});

document.getElementById('cancelComposeTemplateBtn').addEventListener('click', () => {
    composeTemplateModal.classList.remove('show');
});

// 保存新模板
document.getElementById('composeTemplateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        name: document.getElementById('ctName').value.trim(),
        email_type: document.getElementById('ctType').value,
        tone: document.getElementById('ctTone').value,
        description: document.getElementById('ctDesc').value.trim() || null,
        fixed_requirements: document.getElementById('ctFixed').value.trim() || null,
    };
    try {
        const res = await fetch(`${API_BASE}/api/compose/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || '保存失败');
        }
        composeTemplateModal.classList.remove('show');
        document.getElementById('composeTemplateForm').reset();
        showSuccess('模板已保存');
        loadComposeTemplates();
    } catch (err) {
        showError(err.message);
    }
});

// 加载撰写模板列表（管理页）
const TYPE_ICONS = { '开发信':'🚀','跟进邮件':'🔄','产品推荐':'🎯','报价跟进':'💰','节后跟进':'🎉','自定义':'✏️' };

let _composeTemplatesAllData = [];
let _composeTemplatesPage = 1;
const _COMPOSE_TEMPLATES_PAGE_SIZE = 10;

function _applyComposeTemplatesFilter() {
    const q = document.getElementById('composeTemplatesSearch').value.trim().toLowerCase();
    const filtered = q
        ? _composeTemplatesAllData.filter(t =>
            (t.name || '').toLowerCase().includes(q) ||
            (t.email_type || '').toLowerCase().includes(q) ||
            (t.tone || '').toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q))
        : _composeTemplatesAllData;
    renderPaged(filtered, _COMPOSE_TEMPLATES_PAGE_SIZE, _composeTemplatesPage,
        _renderComposeTemplatesSlice,
        document.getElementById('composeTemplatesContainer'),
        document.getElementById('composeTemplatesPagination'),
        p => { _composeTemplatesPage = p; _applyComposeTemplatesFilter(); },
        document.getElementById('composeTemplatesInfo'), '个模板'
    );
}

function _renderComposeTemplatesSlice(slice, total) {
    const container = document.getElementById('composeTemplatesContainer');
    if (!total) {
        container.innerHTML = '<div class="empty-state"><h3>暂无撰写模板</h3><p>点击「添加撰写模板」创建第一个模板</p></div>';
        return;
    }
    container.innerHTML = slice.map(t => `
        <div class="template-card">
            <div class="template-card-header">
                <div>
                    <h3>${TYPE_ICONS[t.email_type] || '✉️'} ${escapeHtml(t.name)}</h3>
                    <div class="template-meta">
                        <span class="meta-item">${escapeHtml(t.email_type)}</span>
                        <span class="meta-item">${escapeHtml(t.tone)}</span>
                    </div>
                    ${t.description ? `<p style="font-size:0.85rem;color:var(--gray-500);margin-top:6px;">${escapeHtml(t.description)}</p>` : ''}
                    ${t.fixed_requirements ? `
                    <div style="margin-top:8px;padding:8px 12px;background:var(--primary-light);border-radius:6px;font-size:0.82rem;color:var(--primary);white-space:pre-wrap;">${escapeHtml(t.fixed_requirements)}</div>
                    ` : ''}
                </div>
                <div class="card-actions">
                    <button class="btn btn-small btn-danger" onclick="deleteComposeTemplate(${t.id})">删除</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function loadComposeTemplates() {
    const container = document.getElementById('composeTemplatesContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const res = await fetch(`${API_BASE}/api/compose/templates`, { credentials: 'include' });
        _composeTemplatesAllData = await res.json();
        _composeTemplatesPage = 1;
        _applyComposeTemplatesFilter();
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

document.getElementById('composeTemplatesSearch').addEventListener('input', () => { _composeTemplatesPage = 1; _applyComposeTemplatesFilter(); });

async function deleteComposeTemplate(id) {
    showConfirm({
        title: '删除撰写模板',
        message: '确定删除这个撰写模板吗？',
        onConfirm: async () => {
            try {
                const res = await fetch(`${API_BASE}/api/compose/templates/${id}`, { method: 'DELETE', credentials: 'include' });
                if (!res.ok) throw new Error('删除失败');
                showSuccess('已删除');
                loadComposeTemplates();
            } catch (e) {
                showError('删除失败');
            }
        }
    });
}

// 加载模板到写邮件表单（选择器）
document.getElementById('loadComposeTemplateBtn').addEventListener('click', async () => {
    try {
        const res = await fetch(`${API_BASE}/api/compose/templates`, { credentials: 'include' });
        const list = await res.json();
        const container = document.getElementById('composeTemplateSelectorContainer');
        if (!list.length) {
            container.innerHTML = '<div class="empty-state"><p>暂无撰写模板，请先在「撰写模板」页面添加</p></div>';
        } else {
            container.innerHTML = list.map(t => `
                <div class="template-selector-item" onclick="applyComposeTemplate(${t.id})">
                    <h4>${TYPE_ICONS[t.email_type] || '✉️'} ${t.name}</h4>
                    <div style="display:flex;gap:8px;margin:4px 0;">
                        <span class="meta-item" style="font-size:0.78rem;">${t.email_type}</span>
                        <span class="meta-item" style="font-size:0.78rem;">${t.tone}</span>
                    </div>
                    ${t.description ? `<p style="font-size:0.82rem;color:var(--gray-500);margin-top:4px;">${t.description}</p>` : ''}
                    ${t.fixed_requirements ? `<p style="font-size:0.78rem;color:var(--primary);margin-top:4px;">📌 固定要求已配置</p>` : ''}
                </div>
            `).join('');
        }
        // 存一下供 apply 用
        window._composeTemplateList = list;
        composeTemplateSelectorModal.classList.add('show');
    } catch (e) {
        showError('加载模板失败');
    }
});

function applyComposeTemplate(id) {
    const t = (window._composeTemplateList || []).find(x => x.id === id);
    if (!t) return;

    const FIXED_TYPES = ['开发信', '跟进邮件', '产品推荐', '报价跟进', '节后跟进', '自定义'];
    const isFixed = FIXED_TYPES.includes(t.email_type);

    // 切换类型按钮
    document.querySelectorAll('.compose-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === (isFixed ? t.email_type : '自定义'));
    });

    if (isFixed) {
        _composeCurrentType = t.email_type;
    } else {
        // 非固定类型：选中「自定义」并填入实际类型名
        _composeCurrentType = '自定义';
        document.getElementById('composeCustomType').value = t.email_type;
    }
    _updateComposePlaceholder(_composeCurrentType);

    // 填入语气
    document.getElementById('composeTone').value = t.tone;

    // 填入固定要求
    if (t.fixed_requirements) {
        document.getElementById('composeExtra').value = t.fixed_requirements;
    }

    composeTemplateSelectorModal.classList.remove('show');
    showSuccess(`已加载模板「${t.name}」`);
}

// 关闭 Modal
composeTemplateModal.addEventListener('click', e => {
    if (e.target === composeTemplateModal) composeTemplateModal.classList.remove('show');
});
composeTemplateSelectorModal.addEventListener('click', e => {
    if (e.target === composeTemplateSelectorModal) composeTemplateSelectorModal.classList.remove('show');
});
composeTemplateSelectorModal.querySelector('.close').addEventListener('click', () => {
    composeTemplateSelectorModal.classList.remove('show');
});
composeTemplateModal.querySelector('.close').addEventListener('click', () => {
    composeTemplateModal.classList.remove('show');
});


// ===== 客户管理 (Customer Management) =====

let _customerList = [];
let _selectedGeneratorCustomer = null;
let _selectedComposeCustomer   = null;

const STATUS_LABELS = { prospect: '潜在客户', active: '活跃客户', closed: '已关闭', paused: '暂停跟进' };

function _renderCustomerCard(c) {
    const tags = c.tags
        ? c.tags.split(',').map(t => `<span class="customer-tag">${escapeHtml(t.trim())}</span>`).join('')
        : '';
    const meta = [
        c.country  ? `🌍 ${escapeHtml(c.country)}`  : '',
        c.email    ? `✉️ ${escapeHtml(c.email)}`    : '',
        c.industry ? `🏭 ${escapeHtml(c.industry)}` : '',
    ].filter(Boolean).map(m => `<span class="meta-item">${m}</span>`).join('');

    return `
    <div class="customer-card" id="customer-card-${c.id}">
        <div class="customer-card-header">
            <div class="customer-card-main">
                <div class="customer-card-name">
                    ${escapeHtml(c.name)}
                    ${c.company ? `<span class="customer-card-company">${escapeHtml(c.company)}</span>` : ''}
                </div>
                ${meta ? `<div class="customer-card-meta">${meta}</div>` : ''}
                ${tags ? `<div class="customer-card-tags">${tags}</div>` : ''}
            </div>
            <div class="customer-card-right">
                <span class="customer-status-badge customer-status-${c.status}">${STATUS_LABELS[c.status] || c.status}</span>
                <div class="card-actions">
                    <button class="btn btn-small btn-view" onclick="openCustomerDetail(${c.id})">详情</button>
                    <button class="btn btn-small btn-secondary" onclick="openEditCustomer(${c.id})">编辑</button>
                    <button class="btn btn-small btn-danger" onclick="deleteCustomer(${c.id})">删除</button>
                </div>
            </div>
        </div>
        ${c.background ? `<div class="customer-card-bg">${escapeHtml(c.background)}</div>` : ''}
    </div>`;
}

async function loadCustomers() {
    const container = document.getElementById('customersContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const search  = (document.getElementById('customerSearchInput').value || '').trim();
    const status  = document.getElementById('customerStatusFilter').value;
    const country = document.getElementById('customerCountryFilter').value;
    const params = new URLSearchParams({ page: _customerPage, page_size: CUSTOMER_PAGE_SIZE });
    if (search)  params.set('search', search);
    if (status)  params.set('status', status);
    if (country) params.set('search', country);  // country filter overrides text search for simplicity
    try {
        const res = await fetch(`${API_BASE}/api/customers?${params}`, { credentials: 'include' });
        const data = await res.json();
        _customerList = data.items;
        _refreshCustomerSelectors();
        _renderCustomerResults(data);
        // Only refresh country filter when no filter active (avoid collapsing options)
        if (!search && !status && !country) _refreshCountryFilter();
    } catch (e) {
        container.innerHTML = '<div class="error-message">加载失败</div>';
    }
}

// ── 客户筛选 + 分页 ──
const CUSTOMER_PAGE_SIZE = 10;
let _customerPage = 1;

function _renderCustomerResults(data) {
    const { items, total, total_pages } = data;
    const search = (document.getElementById('customerSearchInput').value || '').trim();
    const status = document.getElementById('customerStatusFilter').value;

    const info = document.getElementById('customerListInfo');
    info.textContent = total ? `共 ${total} 位客户` + (search || status ? '（已筛选）' : '') : '';

    const container = document.getElementById('customersContainer');
    if (!items.length) {
        container.innerHTML = search || status
            ? '<div class="empty-state"><p>没有符合条件的客户</p></div>'
            : '<div class="empty-state"><h3>暂无客户</h3><p>点击「添加客户」创建第一个客户档案</p></div>';
    } else {
        container.innerHTML = items.map(_renderCustomerCard).join('');
    }
    _renderCustomerPagination(total_pages);
}

function _applyCustomerFilters() {
    _customerPage = 1;
    loadCustomers();
}

function _renderCustomerPagination(pages) {
    const el = document.getElementById('customerPagination');
    if (pages <= 1) { el.innerHTML = ''; return; }

    const cur = _customerPage;
    let html = `<button class="page-btn" ${cur===1?'disabled':''} onclick="_goCustomerPage(${cur-1})">‹</button>`;

    // 显示页码，省略中间过多时用…
    const range = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || (i >= cur - 2 && i <= cur + 2)) range.push(i);
        else if (range[range.length-1] !== '…') range.push('…');
    }
    range.forEach(p => {
        if (p === '…') {
            html += `<span class="page-btn" style="cursor:default;border:none;">…</span>`;
        } else {
            html += `<button class="page-btn${p===cur?' active':''}" onclick="_goCustomerPage(${p})">${p}</button>`;
        }
    });
    html += `<button class="page-btn" ${cur===pages?'disabled':''} onclick="_goCustomerPage(${cur+1})">›</button>`;
    el.innerHTML = html;
}

function _goCustomerPage(page) {
    _customerPage = page;
    loadCustomers();
    document.getElementById('customers').scrollTo({ top: 0 });
}

// ── 国家下拉 ──
const COUNTRIES = [
    '阿富汗','阿尔巴尼亚','阿尔及利亚','安哥拉','阿根廷','亚美尼亚','澳大利亚','奥地利','阿塞拜疆',
    '巴哈马','巴林','孟加拉国','白俄罗斯','比利时','贝宁','玻利维亚','波黑','巴西','保加利亚','布基纳法索',
    '柬埔寨','喀麦隆','加拿大','智利','中国','哥伦比亚','刚果','哥斯达黎加','克罗地亚','古巴','塞浦路斯','捷克',
    '丹麦','多米尼加共和国','厄瓜多尔','埃及','萨尔瓦多','埃塞俄比亚',
    '芬兰','法国','德国','加纳','希腊','危地马拉','几内亚',
    '海地','洪都拉斯','匈牙利','印度','印度尼西亚','伊朗','伊拉克','爱尔兰','以色列','意大利',
    '牙买加','日本','约旦','哈萨克斯坦','肯尼亚','科威特','吉尔吉斯斯坦',
    '老挝','黎巴嫩','利比亚','立陶宛','卢森堡',
    '马达加斯加','马来西亚','马里','墨西哥','摩洛哥','莫桑比克','缅甸',
    '纳米比亚','尼泊尔','荷兰','新西兰','尼加拉瓜','尼日利亚','挪威',
    '阿曼','巴基斯坦','巴勒斯坦','巴拿马','巴拉圭','秘鲁','菲律宾','波兰','葡萄牙',
    '卡塔尔','罗马尼亚','俄罗斯','卢旺达',
    '沙特阿拉伯','塞内加尔','塞尔维亚','新加坡','斯洛伐克','索马里','南非','西班牙','斯里兰卡','苏丹','瑞典','瑞士','叙利亚',
    '台湾','坦桑尼亚','泰国','突尼斯','土耳其',
    '乌干达','乌克兰','阿联酋','英国','美国','乌拉圭','乌兹别克斯坦',
    '委内瑞拉','越南','也门','赞比亚','津巴布韦',
];

function _initCountrySelect() {
    const sel = document.getElementById('customerCountry');
    if (!sel) return;
    COUNTRIES.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        sel.appendChild(opt);
    });
}

async function _refreshCountryFilter() {
    const sel = document.getElementById('customerCountryFilter');
    if (!sel) return;
    const cur = sel.value;
    try {
        const res = await fetch('/api/customers/countries', { credentials: 'include' });
        const countries = await res.json();
        sel.innerHTML = '<option value="">全部国家</option>' +
            countries.map(c => `<option value="${escapeHtml(c)}"${c === cur ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('');
    } catch {
        // keep existing options on error
    }
}

_initCountrySelect();


function _refreshCustomerSelectors() {
    if (!Array.isArray(_customerList)) return;
    const customerOptions = _customerList.map(c =>
        `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}${c.company ? ' · ' + escapeHtml(c.company) : ''}</option>`
    ).join('');

    // Generator + Compose selects (by id)
    ['generatorCustomerSelect', 'composeCustomerSelect'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="">— 不关联客户 —</option>' +
            _customerList.map(c =>
                `<option value="${c.id}">${escapeHtml(c.name)}${c.company ? ' · ' + escapeHtml(c.company) : ''}</option>`
            ).join('');
        sel.value = cur;
    });

    // History search customer selects (by name value for API param)
    ['historySearchCustomer', 'composeHistorySearchCustomer'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = '<option value="">全部客户</option>' + customerOptions;
        sel.value = cur;
    });
}

async function saveCustomer(e) {
    e.preventDefault();
    const id = document.getElementById('customerFormId').value;
    const payload = {
        name:         document.getElementById('customerName').value.trim(),
        company:      document.getElementById('customerCompany').value.trim()      || null,
        email:        document.getElementById('customerEmail').value.trim()         || null,
        phone:        document.getElementById('customerPhone').value.trim()         || null,
        country:      document.getElementById('customerCountry').value  || null,
        status:       document.getElementById('customerStatus').value,
        industry:     document.getElementById('customerIndustry').value.trim()    || null,
        product_pref: document.getElementById('customerProductPref').value.trim() || null,
        tags:         document.getElementById('customerTags').value.trim()         || null,
        background:   document.getElementById('customerBackground').value.trim()  || null,
    };
    const isEdit = !!id;
    const url    = isEdit ? `${API_BASE}/api/customers/${id}` : `${API_BASE}/api/customers`;
    const method = isEdit ? 'PUT' : 'POST';
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || '保存失败');
        }
        document.getElementById('customerModal').classList.remove('show');
        document.getElementById('customerForm').reset();
        document.getElementById('customerFormId').value = '';
        showSuccess(isEdit ? '客户信息已更新' : '客户已创建');
        loadCustomers();
    } catch (err) {
        showError(err.message);
    }
}

async function deleteCustomer(id) {
    showConfirm({
        title: '删除客户',
        message: '确定删除这个客户？相关历史记录的客户关联会被清除，但记录本身保留。',
        onConfirm: async () => {
            try {
                const res = await fetch(`${API_BASE}/api/customers/${id}`, { method: 'DELETE', credentials: 'include' });
                if (!res.ok) throw new Error('删除失败');
                showSuccess('客户已删除');
                loadCustomers();
            } catch (e) {
                showError('删除失败');
            }
        }
    });
}

function openEditCustomer(id) {
    const c = _customerList.find(x => x.id === id);
    if (!c) return;
    document.getElementById('customerModalTitle').textContent = '编辑客户';
    document.getElementById('customerFormId').value       = c.id;
    document.getElementById('customerName').value         = c.name          || '';
    document.getElementById('customerCompany').value      = c.company       || '';
    document.getElementById('customerEmail').value        = c.email         || '';
    document.getElementById('customerPhone').value        = c.phone         || '';
    document.getElementById('customerCountry').value       = c.country || '';
    document.getElementById('customerStatus').value       = c.status        || 'prospect';
    document.getElementById('customerIndustry').value     = c.industry      || '';
    document.getElementById('customerProductPref').value  = c.product_pref  || '';
    document.getElementById('customerTags').value         = c.tags          || '';
    document.getElementById('customerBackground').value   = c.background    || '';
    document.getElementById('customerModal').classList.add('show');
}

async function openCustomerDetail(id) {
    const c = _customerList.find(x => x.id === id);
    if (!c) return;

    document.getElementById('customerDetailHeader').innerHTML = `
        <div class="customer-detail-name">
            ${escapeHtml(c.name)}
            ${c.company ? `<span class="customer-card-company" style="margin-left:10px;">${escapeHtml(c.company)}</span>` : ''}
            <span class="customer-status-badge customer-status-${c.status}" style="margin-left:10px;">${STATUS_LABELS[c.status]}</span>
        </div>
        <div class="customer-card-meta" style="margin-top:8px;">
            ${c.email   ? `<span class="meta-item">✉️ ${escapeHtml(c.email)}</span>`   : ''}
            ${c.phone   ? `<span class="meta-item">📞 ${escapeHtml(c.phone)}</span>`   : ''}
            ${c.country ? `<span class="meta-item">🌍 ${escapeHtml(c.country)}</span>` : ''}
        </div>`;

    const rows = [
        c.industry     ? `<div class="customer-detail-row"><label>行业</label><span>${escapeHtml(c.industry)}</span></div>` : '',
        c.product_pref ? `<div class="customer-detail-row"><label>产品偏好</label><span>${escapeHtml(c.product_pref)}</span></div>` : '',
        c.tags         ? `<div class="customer-detail-row"><label>标签</label><span>${c.tags.split(',').map(t => `<span class="customer-tag">${escapeHtml(t.trim())}</span>`).join(' ')}</span></div>` : '',
        `<div class="customer-detail-row customer-detail-bg"><label>背景备注</label><div>${c.background ? escapeHtml(c.background) : '<span style="color:var(--gray-400)">暂无</span>'}</div></div>`,
    ].filter(Boolean).join('');
    document.getElementById('customerDetailInfo').innerHTML = `<div class="customer-detail-section">${rows}</div>`;

    // Reset tabs
    document.querySelectorAll('.customer-detail-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === 'info');
    });
    document.getElementById('customerDetailInfo').style.display    = 'block';
    document.getElementById('customerDetailHistory').style.display = 'none';
    document.getElementById('customerDetailHistory').innerHTML     =
        '<div class="loading"><div class="spinner"></div></div>';

    document.getElementById('customerDetailModal').classList.add('show');

    // Load history async
    try {
        const res = await fetch(`${API_BASE}/api/customers/${id}/history`, { credentials: 'include' });
        const items = await res.json();
        const KIND_LABELS = { reply: '生成回复', compose: '撰写邮件' };
        if (!items.length) {
            document.getElementById('customerDetailHistory').innerHTML =
                '<div class="empty-state"><p>暂无往来记录</p></div>';
        } else {
            document.getElementById('customerDetailHistory').innerHTML = items.map(item => `
                <div class="customer-history-item">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span class="tag">${KIND_LABELS[item.kind] || item.kind}</span>
                        <span class="customer-history-summary">${escapeHtml(item.summary)}</span>
                        <span class="cell-time" style="margin-left:auto;">${fmtTime(item.created_at)}</span>
                    </div>
                    <p class="customer-history-preview">${escapeHtml(item.preview)}…</p>
                </div>`).join('');
        }
    } catch (e) {
        document.getElementById('customerDetailHistory').innerHTML =
            '<div class="error-message">加载往来记录失败</div>';
    }
}

// Detail modal tab switching
document.querySelectorAll('.customer-detail-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.customer-detail-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.getElementById('customerDetailInfo').style.display    = tab === 'info'    ? 'block' : 'none';
        document.getElementById('customerDetailHistory').style.display = tab === 'history' ? 'block' : 'none';
    });
});

// Customer Modal wiring
document.getElementById('addCustomerBtn').addEventListener('click', () => {
    document.getElementById('customerModalTitle').textContent = '添加客户';
    document.getElementById('customerFormId').value = '';
    document.getElementById('customerForm').reset();
    document.getElementById('customerCountry').value = '';
    document.getElementById('customerModal').classList.add('show');
});
document.getElementById('cancelCustomerBtn').addEventListener('click', () => {
    document.getElementById('customerModal').classList.remove('show');
});
document.getElementById('customerModalClose').addEventListener('click', () => {
    document.getElementById('customerModal').classList.remove('show');
});
document.getElementById('customerDetailClose').addEventListener('click', () => {
    document.getElementById('customerDetailModal').classList.remove('show');
});
document.getElementById('customerForm').addEventListener('submit', saveCustomer);

document.getElementById('customerStatusFilter').addEventListener('change', () => {
    _customerPage = 1; _applyCustomerFilters();
});
document.getElementById('customerCountryFilter').addEventListener('change', () => {
    _customerPage = 1; _applyCustomerFilters();
});
document.getElementById('customerSearchInput').addEventListener('input', () => {
    _customerPage = 1; _applyCustomerFilters();
});

// ===== CSV Import =====
(function() {
    const modal = document.getElementById('csvImportModal');
    const resultEl = document.getElementById('csvImportResult');

    // Build template CSV download link
    const templateHeaders = 'name,company,email,phone,country,industry,product_pref,tags,background,status\n';
    const sampleRow = '张三,ABC公司,zhangsan@example.com,+86-138-0000-0000,中国,家居,LED灯具,"大客户,长期合作",已合作两年活跃客户,active\n';
    const blob = new Blob(['\uFEFF' + templateHeaders + sampleRow], { type: 'text/csv;charset=utf-8;' });
    document.getElementById('csvTemplateDownload').href = URL.createObjectURL(blob);

    document.getElementById('importCsvBtn').addEventListener('click', () => {
        document.getElementById('csvFileInput').value = '';
        resultEl.style.display = 'none';
        modal.classList.add('show');
    });

    function closeModal() { modal.classList.remove('show'); }
    document.getElementById('csvImportClose').addEventListener('click', closeModal);
    document.getElementById('csvImportCancelBtn').addEventListener('click', closeModal);
    window.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    document.getElementById('csvImportConfirmBtn').addEventListener('click', async () => {
        const fileInput = document.getElementById('csvFileInput');
        if (!fileInput.files.length) { showError('请先选择 CSV 文件'); return; }

        const btn = document.getElementById('csvImportConfirmBtn');
        btn.disabled = true;
        btn.textContent = '导入中...';
        resultEl.style.display = 'none';

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);

        try {
            const res = await fetch(`${API_BASE}/api/customers/import-csv`, {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });
            const data = await res.json();
            if (!res.ok) {
                resultEl.innerHTML = `<div class="error-message">${escapeHtml(data.detail || '导入失败')}</div>`;
            } else {
                const errHtml = data.errors && data.errors.length
                    ? `<ul style="margin-top:6px;font-size:0.85rem;">${data.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>`
                    : '';
                resultEl.innerHTML = `<div class="success-message">
                    ✅ 成功导入 <strong>${data.imported}</strong> 条
                    ${data.skipped ? `，跳过 ${data.skipped} 条（无名称）` : ''}
                    ${errHtml}
                </div>`;
                if (data.imported > 0) {
                    loadCustomers();
                }
            }
        } catch (e) {
            resultEl.innerHTML = `<div class="error-message">导入失败：${escapeHtml(e.message)}</div>`;
        } finally {
            resultEl.style.display = 'block';
            btn.disabled = false;
            btn.textContent = '开始导入';
        }
    });
})();

// ===== Customer Selector (Generator + Compose pages) =====

document.getElementById('generatorCustomerSelect').addEventListener('change', function() {
    const id = parseInt(this.value);
    if (!id) {
        _selectedGeneratorCustomer = null;
        document.getElementById('generatorCustomerBadge').style.display = 'none';
        document.getElementById('generatorCustomerHint').style.display  = 'none';
        return;
    }
    const c = _customerList.find(x => x.id === id);
    _selectedGeneratorCustomer = c || null;
    if (c) {
        const badge = document.getElementById('generatorCustomerBadge');
        badge.textContent = `已关联：${c.name}${c.company ? ' · ' + c.company : ''}`;
        badge.style.display = 'inline-block';
        const hint = document.getElementById('generatorCustomerHint');
        if (c.background || c.industry || c.product_pref) {
            hint.textContent = '客户背景信息将自动带入 AI 提示词';
            hint.style.display = 'block';
        } else {
            hint.style.display = 'none';
        }
    }
});

document.getElementById('composeCustomerSelect').addEventListener('change', function() {
    const id = parseInt(this.value);
    if (!id) {
        _selectedComposeCustomer = null;
        document.getElementById('composeCustomerBadge').style.display = 'none';
        document.getElementById('composeCustomerHint').style.display  = 'none';
        return;
    }
    const c = _customerList.find(x => x.id === id);
    _selectedComposeCustomer = c || null;
    if (c) {
        // 自动填入目标客户背景（如果当前为空）
        const targetEl = document.getElementById('composeTargetInfo');
        if (!targetEl.value.trim()) {
            const parts = [];
            if (c.company)      parts.push(`客户公司：${c.company}`);
            if (c.country)      parts.push(`所在地区：${c.country}`);
            if (c.industry)     parts.push(`行业：${c.industry}`);
            if (c.product_pref) parts.push(`产品偏好：${c.product_pref}`);
            if (c.background)   parts.push(c.background);
            targetEl.value = parts.join('\n');
        }
        const badge = document.getElementById('composeCustomerBadge');
        badge.textContent = `已关联：${c.name}${c.company ? ' · ' + c.company : ''}`;
        badge.style.display = 'inline-block';
        const hint = document.getElementById('composeCustomerHint');
        hint.textContent = '客户背景将自动带入 AI 提示词';
        hint.style.display = 'block';
    }
});

// Pre-load customer list on app init so selectors are ready
fetch(`${API_BASE}/api/customers?page=1&page_size=1000`, { credentials: 'include' })
    .then(r => r.json())
    .then(data => { _customerList = data.items || []; _refreshCustomerSelectors(); })
    .catch(() => {});

// ===== 用户管理（admin only） =====

// ===== 页面授权管理 =====

async function loadPagePermAdmin() {
    const container = document.getElementById('pagePermAdminContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const res = await fetch('/api/admin/users', { credentials: 'include' });
        if (!res.ok) { container.innerHTML = '<div class="error-message">加载失败</div>'; return; }
        const users = await res.json();
        const regularUsers = users.filter(u => u.role !== 'admin');

        // ---- 管理员自己的导航偏好卡片 ----
        const me = window._currentUser;
        const hidden = _getAdminHiddenPages(me.username);
        const groups = {};
        PERMISSIONABLE_PAGES.forEach(pageId => {
            const meta = PAGE_META[pageId];
            if (!groups[meta.group]) groups[meta.group] = [];
            groups[meta.group].push({ pageId, label: meta.label });
        });
        const groupsHtml = Object.entries(groups).map(([group, pages]) => `
            <div>
                <div class="perm-group-label">${group}</div>
                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                    ${pages.map(({ pageId, label }) => `
                        <label class="perm-check-label">
                            <input type="checkbox" class="admin-nav-pref-cb" data-page="${pageId}"
                                style="accent-color:var(--primary);width:14px;height:14px;"
                                ${hidden.has(pageId) ? '' : 'checked'}>
                            ${label}
                        </label>
                    `).join('')}
                </div>
            </div>
        `).join('');

        const myCardHtml = `
            <div class="perm-user-card" style="margin-bottom:24px;border-color:var(--primary);background:linear-gradient(135deg,#f8f7ff 0%,#fff 100%);">
                <div class="perm-user-header">
                    <div>
                        <strong style="font-size:1rem;">我的导航偏好</strong>
                        <span style="margin-left:10px;font-size:0.82rem;color:var(--gray-400);">仅影响自己的侧边栏显示，不影响实际访问权限</span>
                    </div>
                    <button class="btn btn-small btn-primary" id="saveAdminNavPrefsBtn">保存偏好</button>
                </div>
                <div style="display:flex;flex-direction:column;gap:16px;margin-top:14px;" id="adminNavPrefsGroups">
                    ${groupsHtml}
                </div>
            </div>
        `;

        // ---- 普通用户权限列表 ----
        const usersHtml = regularUsers.length ? regularUsers.map(u => {
            let perms = null;
            try { if (u.page_permissions) perms = JSON.parse(u.page_permissions); } catch {}
            const isAllAllowed = perms === null;
            const allowedSet = perms ? new Set(perms) : null;

            const tagHtml = PERMISSIONABLE_PAGES.map(pageId => {
                const allowed = isAllAllowed || allowedSet.has(pageId);
                const label = PAGE_META[pageId]?.label || pageId;
                return `<span class="perm-tag ${allowed ? 'perm-tag-on' : 'perm-tag-off'}">${label}</span>`;
            }).join('');

            return `
                <div class="perm-user-card" id="permCard_${u.id}">
                    <div class="perm-user-header">
                        <div>
                            <strong style="font-size:1rem;">${escapeHtml(u.username)}</strong>
                            <span class="status-badge ${u.is_active ? 'status-active' : 'status-closed'}" style="margin-left:8px;">${u.is_active ? '正常' : '已禁用'}</span>
                            <span style="margin-left:10px;font-size:0.82rem;color:var(--gray-400);">${isAllAllowed ? '默认（全部允许）' : `已授权 ${perms.length} 个页面`}</span>
                        </div>
                        <button class="btn btn-small btn-primary" onclick="openPagePermissions(${u.id}, '${escapeHtml(u.username)}', loadPagePermAdmin)">配置权限</button>
                    </div>
                    <div class="perm-tag-list">${tagHtml}</div>
                </div>
            `;
        }).join('') : '<div class="empty-state"><p>暂无普通用户账号</p><p style="font-size:0.85rem;color:var(--gray-400);">在「用户管理」中创建普通用户后，可在此配置其页面权限</p></div>';

        container.innerHTML = myCardHtml + usersHtml;

        // 绑定保存按钮
        document.getElementById('saveAdminNavPrefsBtn').addEventListener('click', () => {
            const newHidden = new Set();
            container.querySelectorAll('.admin-nav-pref-cb').forEach(cb => {
                if (!cb.checked) newHidden.add(cb.dataset.page);
            });
            _saveAdminHiddenPages(me.username, newHidden);
            _applyAdminNavPrefs(me.username);
            showSuccess('导航偏好已保存');
        });

    } catch {
        container.innerHTML = '<div class="error-message">加载失败</div>';
    }
}

async function loadUserAdmin() {
    const container = document.getElementById('userAdminContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const res = await fetch('/api/admin/users', { credentials: 'include' });
        if (!res.ok) { container.innerHTML = '<div class="error-message">加载失败</div>'; return; }
        const users = await res.json();
        container.innerHTML = `
            <table class="user-admin-table">
                <thead>
                    <tr>
                        <th>用户名</th>
                        <th>角色</th>
                        <th>状态</th>
                        <th>创建时间</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr class="${!u.is_active ? 'user-disabled' : ''}">
                            <td><strong>${escapeHtml(u.username)}</strong></td>
                            <td>
                                ${u.role === 'admin'
                                    ? '<span class="role-badge role-admin">👑 管理员</span>'
                                    : (u.role_name
                                        ? `<span class="role-name-badge">${escapeHtml(u.role_name)}</span>`
                                        : '<span style="color:var(--gray-400);font-size:0.82rem;">普通用户</span>')}
                            </td>
                            <td><span class="status-badge ${u.is_active ? 'status-active' : 'status-closed'}">${u.is_active ? '正常' : '已禁用'}</span></td>
                            <td style="color:var(--gray-400);font-size:0.85rem;">${fmtTime(u.created_at, {year:'numeric',month:'2-digit',day:'2-digit'})}</td>
                            <td class="user-actions">
                                <button class="btn btn-small btn-secondary" onclick="openResetPassword(${u.id}, '${escapeHtml(u.username)}')">重置密码</button>
                                ${window._currentUser && window._currentUser.id !== u.id ? `
                                    ${u.role !== 'admin' ? `
                                        <button class="btn btn-small btn-secondary" onclick="openAssignRole(${u.id}, '${escapeHtml(u.username)}', ${u.role_id || 'null'})">分配角色</button>
                                    ` : ''}
                                    <button class="btn btn-small ${u.is_active ? 'btn-danger' : 'btn-primary'}" onclick="toggleUserActive(${u.id}, ${u.is_active})">${u.is_active ? '禁用' : '启用'}</button>
                                ` : '<span style="color:var(--gray-300);font-size:0.8rem;">（自己）</span>'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch {
        container.innerHTML = '<div class="error-message">加载失败</div>';
    }
}

async function toggleUserActive(userId, currentActive) {
    const action = currentActive ? '禁用' : '启用';
    showConfirm({
        title: `${action}账号`,
        message: `确定要${action}该账号吗？`,
        danger: !!currentActive,
        onConfirm: async () => {
            try {
                const res = await fetch(`/api/admin/users/${userId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ is_active: currentActive ? 0 : 1 }),
                });
                if (!res.ok) {
                    const err = await res.json();
                    showError(err.detail || '操作失败');
                } else {
                    showSuccess(`已${action}账号`);
                    loadUserAdmin();
                }
            } catch {
                showError('操作失败');
            }
        }
    });
}

function openResetPassword(userId, username) {
    document.getElementById('resetPasswordUserId').value = userId;
    document.getElementById('resetPasswordDesc').textContent = `为用户「${username}」设置新密码`;
    document.getElementById('resetPasswordValue').value = '';
    document.getElementById('rpError').style.display = 'none';
    document.getElementById('resetPasswordModal').classList.add('show');
}

document.getElementById('resetPasswordClose').addEventListener('click', () => {
    document.getElementById('resetPasswordModal').classList.remove('show');
});
document.getElementById('resetPasswordCancel').addEventListener('click', () => {
    document.getElementById('resetPasswordModal').classList.remove('show');
});
document.getElementById('resetPasswordSubmit').addEventListener('click', async () => {
    const userId = document.getElementById('resetPasswordUserId').value;
    const newPw = document.getElementById('resetPasswordValue').value;
    const errEl = document.getElementById('rpError');
    errEl.style.display = 'none';
    if (!newPw || newPw.length < 4) {
        errEl.textContent = '密码至少需要4位';
        errEl.style.display = 'block';
        return;
    }
    const btn = document.getElementById('resetPasswordSubmit');
    btn.disabled = true;
    try {
        const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ new_password: newPw }),
        });
        if (!res.ok) {
            const err = await res.json();
            errEl.textContent = err.detail || '重置失败';
            errEl.style.display = 'block';
        } else {
            document.getElementById('resetPasswordModal').classList.remove('show');
            showSuccess('密码已重置');
        }
    } catch {
        errEl.textContent = '网络错误';
        errEl.style.display = 'block';
    } finally {
        btn.disabled = false;
    }
});

// ===== 页面权限管理 =====

async function openPagePermissions(userId, username, onSaved) {
    document.getElementById('pagePermUserId').value = userId;
    document.getElementById('pagePermDesc').textContent = `为用户「${username}」配置可访问的页面`;
    document.getElementById('pagePermSave').disabled = false;
    document.getElementById('pagePermModal').dataset.onSaved = '';   // 清空旧回调标记
    window._pagePermOnSaved = onSaved || null;

    // 获取当前权限配置
    let currentPerms = null;  // null = 全部允许
    try {
        const res = await fetch(`/api/admin/users/${userId}/permissions`, { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            if (data.page_permissions) {
                currentPerms = new Set(JSON.parse(data.page_permissions));
            }
        }
    } catch {}

    const isAllAllowed = currentPerms === null;

    // 按分组渲染复选框
    const groups = {};
    PERMISSIONABLE_PAGES.forEach(pageId => {
        const meta = PAGE_META[pageId];
        if (!groups[meta.group]) groups[meta.group] = [];
        groups[meta.group].push({ pageId, label: meta.label });
    });

    document.getElementById('pagePermGroups').innerHTML = Object.entries(groups).map(([group, pages]) => `
        <div>
            <div style="font-weight:600;font-size:0.78rem;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${group}</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
                ${pages.map(({ pageId, label }) => `
                    <label style="display:flex;align-items:center;gap:6px;padding:6px 12px;border:1.5px solid var(--gray-200);border-radius:var(--radius);cursor:pointer;font-size:0.88rem;background:var(--gray-50);user-select:none;">
                        <input type="checkbox" class="perm-checkbox" data-page="${pageId}"
                            style="accent-color:var(--primary);width:14px;height:14px;"
                            ${isAllAllowed || currentPerms.has(pageId) ? 'checked' : ''}
                            ${isAllAllowed ? 'disabled' : ''}>
                        ${label}
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');

    // 全部允许复选框（重新绑定避免重复监听）
    const allCheck = document.getElementById('pagePermAllCheck');
    const newAllCheck = allCheck.cloneNode(true);
    allCheck.parentNode.replaceChild(newAllCheck, allCheck);
    document.getElementById('pagePermAllCheck').checked = isAllAllowed;
    document.getElementById('pagePermAllCheck').addEventListener('change', e => {
        const checked = e.target.checked;
        document.querySelectorAll('.perm-checkbox').forEach(cb => {
            cb.checked = checked;
            cb.disabled = checked;
        });
    });

    document.getElementById('pagePermModal').classList.add('show');
}

document.getElementById('pagePermClose').addEventListener('click', () => {
    document.getElementById('pagePermModal').classList.remove('show');
});
document.getElementById('pagePermCancel').addEventListener('click', () => {
    document.getElementById('pagePermModal').classList.remove('show');
});
document.getElementById('pagePermModal').addEventListener('click', e => {
    if (e.target === document.getElementById('pagePermModal'))
        document.getElementById('pagePermModal').classList.remove('show');
});

document.getElementById('pagePermSave').addEventListener('click', async () => {
    const userId = document.getElementById('pagePermUserId').value;
    const btn = document.getElementById('pagePermSave');
    btn.disabled = true;

    const isAll = document.getElementById('pagePermAllCheck').checked;
    const permissions = isAll
        ? null
        : Array.from(document.querySelectorAll('.perm-checkbox:checked')).map(cb => cb.dataset.page);

    try {
        const res = await fetch(`/api/admin/users/${userId}/permissions`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ page_permissions: permissions }),
        });
        if (!res.ok) {
            const err = await res.json();
            showError(err.detail || '保存失败');
        } else {
            document.getElementById('pagePermModal').classList.remove('show');
            showSuccess('页面权限已保存');
            if (typeof window._pagePermOnSaved === 'function') window._pagePermOnSaved();
        }
    } catch {
        showError('网络错误');
    } finally {
        btn.disabled = false;
    }
});

// ===================================================
//  邮件中心 — Email Center
// ===================================================

// ───── 收件箱 ─────
let _inboxCache = [];
let _inboxPage = 1;
const _INBOX_PAGE_SIZE = 20;

document.getElementById('refreshInboxBtn').addEventListener('click', loadInbox);

function _applyInboxFilter() {
    const q = document.getElementById('inboxSearch').value.trim().toLowerCase();
    const filtered = q
        ? _inboxCache.filter(m =>
            (m.from_name || '').toLowerCase().includes(q) ||
            (m.from_address || '').toLowerCase().includes(q) ||
            (m.subject || '').toLowerCase().includes(q) ||
            (m.preview || '').toLowerCase().includes(q))
        : _inboxCache;
    renderPaged(filtered, _INBOX_PAGE_SIZE, _inboxPage,
        _renderInboxSlice,
        document.getElementById('inboxContainer'),
        document.getElementById('inboxPagination'),
        p => { _inboxPage = p; _applyInboxFilter(); },
        document.getElementById('inboxInfo'), '封邮件'
    );
}

function _renderInboxSlice(slice, total) {
    const container = document.getElementById('inboxContainer');
    if (!total) {
        container.innerHTML = '<div class="empty-state"><h3>收件箱为空</h3><p>暂无邮件</p></div>';
        return;
    }
    const rows = slice.map(m => `
        <tr class="${m.is_read ? '' : 'inbox-unread'}" style="cursor:pointer;" onclick="openInboxEmail('${m.id}')">
            <td class="cell-time">${m.is_read ? '' : '<span class="unread-dot"></span>'}</td>
            <td><div class="cell-title">${escapeHtml(m.from_name || m.from_address)}</div>
                <div style="font-size:0.78rem;color:var(--gray-400);">${escapeHtml(m.from_address)}</div></td>
            <td><div class="cell-title">${escapeHtml(m.subject)}</div>
                <div class="cell-text-clamp">${escapeHtml(m.preview)}</div></td>
            <td class="cell-time">${m.date}</td>
        </tr>
    `).join('');
    container.innerHTML = `
        <table class="history-table">
            <thead><tr>
                <th style="width:24px;"></th>
                <th>发件人</th>
                <th>主题 / 预览</th>
                <th>时间</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

async function loadInbox() {
    const container = document.getElementById('inboxContainer');
    const statusEl = document.getElementById('inboxStatus');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>正在读取邮件...</p></div>';
    statusEl.textContent = '';
    try {
        const res = await fetch('/api/email-center/inbox?limit=50', { credentials: 'include' });
        if (!res.ok) {
            const err = await res.json();
            container.innerHTML = `<div class="error-message">${err.detail || '加载失败'}</div>`;
            return;
        }
        _inboxCache = await res.json();
        _inboxPage = 1;
        _applyInboxFilter();
    } catch (e) {
        container.innerHTML = `<div class="error-message">加载失败：${e.message}</div>`;
    }
}

function renderInbox(emails) {
    _inboxCache = emails;
    _inboxPage = 1;
    _applyInboxFilter();
}

document.getElementById('inboxSearch').addEventListener('input', () => { _inboxPage = 1; _applyInboxFilter(); });

function openInboxEmail(emailId) {
    const m = _inboxCache.find(x => x.id === emailId);
    if (!m) return;
    document.getElementById('emailPreviewMeta').textContent = `来自：${m.from_name || ''} <${m.from_address}>  ·  ${m.date}`;
    document.getElementById('emailPreviewSubject').textContent = m.subject;
    document.getElementById('emailPreviewBody').textContent = m.body;
    document.getElementById('emailPreviewModal').classList.add('show');
    document.getElementById('emailPreviewModal')._currentEmail = m;
}

document.getElementById('emailPreviewClose').addEventListener('click', () => {
    document.getElementById('emailPreviewModal').classList.remove('show');
});
document.getElementById('emailPreviewCloseBtn').addEventListener('click', () => {
    document.getElementById('emailPreviewModal').classList.remove('show');
});
document.getElementById('emailPreviewUseBtn').addEventListener('click', () => {
    const m = document.getElementById('emailPreviewModal')._currentEmail;
    if (!m) return;
    document.getElementById('chatContent').value = m.body;
    document.getElementById('emailPreviewModal').classList.remove('show');
    switchPage('generator');
    showSuccess('邮件内容已填入「生成回复」');
});


// ───── 标签式邮箱输入组件 ─────
// 每个 wrapId 对应一个 Map: wrapId → { tags: string[], inputEl: HTMLInputElement }
const _tagInputState = {};

function _isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function _renderTagInput(wrapId) {
    const state = _tagInputState[wrapId];
    if (!state) return;
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;

    // 保留 input 元素，清除其余
    const oldInput = state.inputEl;
    wrap.innerHTML = '';

    state.tags.forEach((tag, i) => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.innerHTML = `<span class="tag-chip-text">${escapeHtml(tag)}</span><button type="button" class="tag-chip-del" title="移除">×</button>`;
        chip.querySelector('.tag-chip-del').addEventListener('click', () => removeTag(wrapId, i));
        wrap.appendChild(chip);
    });

    wrap.appendChild(oldInput);
    oldInput.placeholder = state.tags.length ? '' : '输入邮箱，按 Enter 或逗号确认';
}

function createTagInput(wrapId) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tag-chip-input';
    input.autocomplete = 'off';
    input.placeholder = '输入邮箱，按 Enter 或逗号确认';

    _tagInputState[wrapId] = { tags: [], inputEl: input };
    wrap.appendChild(input);

    // 点击 wrap 聚焦 input
    wrap.addEventListener('click', () => input.focus());

    input.addEventListener('keydown', (e) => {
        if (['Enter', ',', ';', 'Tab'].includes(e.key)) {
            e.preventDefault();
            const val = input.value.trim().replace(/[,;]$/, '');
            if (val) addTag(wrapId, val);
        } else if (e.key === 'Backspace' && !input.value) {
            const state = _tagInputState[wrapId];
            if (state.tags.length) removeTag(wrapId, state.tags.length - 1);
        }
    });

    input.addEventListener('blur', () => {
        const val = input.value.trim().replace(/[,;]$/, '');
        if (val) addTag(wrapId, val);
    });
}

function addTag(wrapId, value) {
    const state = _tagInputState[wrapId];
    if (!state) return;
    const emails = value.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    emails.forEach(email => {
        if (!_isValidEmail(email)) { showError(`无效邮箱地址：${email}`); return; }
        if (state.tags.includes(email)) return;
        state.tags.push(email);
    });
    state.inputEl.value = '';
    _renderTagInput(wrapId);
}

function removeTag(wrapId, index) {
    const state = _tagInputState[wrapId];
    if (!state) return;
    state.tags.splice(index, 1);
    _renderTagInput(wrapId);
}

function getTagValues(wrapId) {
    return (_tagInputState[wrapId]?.tags || []).slice();
}

function clearTags(wrapId) {
    const state = _tagInputState[wrapId];
    if (!state) return;
    state.tags = [];
    _renderTagInput(wrapId);
}

// 发件人显示
function _updateSendFromDisplay() {
    const el = document.getElementById('sendFromDisplay');
    if (!el) return;
    const email = window._cachedSettings?.email_address || '';
    el.textContent = email || '（未配置邮箱，请在全局设置中填写）';
    el.style.color = email ? 'var(--gray-700)' : 'var(--gray-400)';
}

// 初始化发邮件页标签输入 + CC/BCC 切换
function _initSendEmailFields() {
    createTagInput('sendToWrap');
    createTagInput('sendCcWrap');
    createTagInput('sendBccWrap');

    document.getElementById('addCcBtn')?.addEventListener('click', () => {
        const row = document.getElementById('sendCcRow');
        row.style.display = 'flex';
        document.getElementById('addCcBtn').style.display = 'none';
        _tagInputState['sendCcWrap']?.inputEl?.focus();
    });

    document.getElementById('addBccBtn')?.addEventListener('click', () => {
        const row = document.getElementById('sendBccRow');
        row.style.display = 'flex';
        document.getElementById('addBccBtn').style.display = 'none';
        _tagInputState['sendBccWrap']?.inputEl?.focus();
    });

    _updateSendFromDisplay();
}

document.addEventListener('DOMContentLoaded', _initSendEmailFields);

// ───── 发邮件（单发）— 客户列表关联 ─────
let _sendSelectedCustomerId = null;
let _sendSelectedCustomer = null;
let _sendCustAll = [];

function initSendCustomerSearch() {
    // 筛选器事件绑定
    document.getElementById('sendCustStatusFilter').addEventListener('change', _loadSendCustByStatus);
    document.getElementById('sendCustCountryFilter').addEventListener('change', _applySendCustFilter);
    document.getElementById('sendCustIndustryFilter').addEventListener('change', _applySendCustFilter);
    document.getElementById('sendCustSearchInput').addEventListener('input', _applySendCustFilter);
    document.getElementById('sendCustClearBtn').addEventListener('click', _clearSendCustomer);
}

async function _loadSendCustByStatus() {
    const status = document.getElementById('sendCustStatusFilter').value;
    const params = new URLSearchParams({ page: 1, page_size: 1000 });
    if (status) params.set('status', status);
    try {
        const res = await fetch(`/api/customers?${params}`, { credentials: 'include' });
        const data = await res.json();
        _sendCustAll = data.items || [];
        _populateSendCustFilterOptions();
        _applySendCustFilter();
    } catch { showError('加载客户列表失败'); }
}

function _populateSendCustFilterOptions() {
    const countries  = [...new Set(_sendCustAll.map(c => c.country).filter(Boolean))].sort();
    const industries = [...new Set(_sendCustAll.map(c => c.industry).filter(Boolean))].sort();

    const countryEl = document.getElementById('sendCustCountryFilter');
    const prev = countryEl.value;
    countryEl.innerHTML = '<option value="">全部国家</option>' +
        countries.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if (countries.includes(prev)) countryEl.value = prev;

    const industryEl = document.getElementById('sendCustIndustryFilter');
    const prevI = industryEl.value;
    industryEl.innerHTML = '<option value="">全部行业</option>' +
        industries.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if (industries.includes(prevI)) industryEl.value = prevI;
}

function _applySendCustFilter() {
    const country  = document.getElementById('sendCustCountryFilter').value;
    const industry = document.getElementById('sendCustIndustryFilter').value;
    const q        = document.getElementById('sendCustSearchInput').value.trim().toLowerCase();
    const filtered = _sendCustAll.filter(c => {
        if (country  && c.country  !== country)  return false;
        if (industry && c.industry !== industry)  return false;
        if (q && ![c.name, c.company, c.email].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
        return true;
    });
    _renderSendCustomerList(filtered);
}

function _renderSendCustomerList(customers) {
    const container = document.getElementById('sendCustomerList');
    if (!customers.length) {
        container.innerHTML = '<div class="empty-state"><p>没有符合条件的客户</p></div>';
        return;
    }
    container.innerHTML = customers.map(c => `
        <label class="bulk-customer-item${_sendSelectedCustomerId === c.id ? ' send-cust-selected' : ''}">
            <input type="radio" name="sendCustRadio" class="send-cust-radio" value="${c.id}"
                ${_sendSelectedCustomerId === c.id ? 'checked' : ''}
                style="width:16px;height:16px;flex-shrink:0;accent-color:var(--primary);">
            <span class="bulk-customer-info">
                <span class="bulk-customer-name">${escapeHtml(c.name)}</span>
                ${c.company ? `<span class="bulk-customer-company">${escapeHtml(c.company)}</span>` : ''}
                ${c.country ? `<span class="bulk-customer-company" style="color:var(--gray-400);">📍${escapeHtml(c.country)}</span>` : ''}
                ${c.industry ? `<span class="bulk-customer-company" style="color:var(--gray-400);">🏭${escapeHtml(c.industry)}</span>` : ''}
                ${c.email ? `<span class="bulk-customer-email">${escapeHtml(c.email)}</span>` : '<span class="bulk-customer-noemail">无邮箱</span>'}
            </span>
        </label>
    `).join('');
    container.querySelectorAll('.send-cust-radio').forEach(radio => {
        radio.addEventListener('change', () => {
            const c = _sendCustAll.find(x => x.id === parseInt(radio.value));
            if (c) selectSendCustomer(c);
        });
    });
}

function selectSendCustomer(c) {
    _sendSelectedCustomerId = c.id;
    _sendSelectedCustomer = c;
    if (c.email) {
        clearTags('sendToWrap');
        addTag('sendToWrap', c.email);
        document.getElementById('sendCustomerHint').textContent = `✅ 已关联：${c.name}${c.company ? ' · ' + c.company : ''}，收件人已自动填入`;
    } else {
        document.getElementById('sendCustomerHint').textContent = `⚠️ 已关联：${c.name}，该客户无邮箱，请手动填写收件人`;
    }
    document.getElementById('sendCustClearBtn').style.display = 'inline-flex';
    // 高亮选中行
    document.querySelectorAll('.bulk-customer-item').forEach(el => el.classList.remove('send-cust-selected'));
    const radio = document.querySelector(`.send-cust-radio[value="${c.id}"]`);
    if (radio) radio.closest('.bulk-customer-item').classList.add('send-cust-selected');
}

function _clearSendCustomer() {
    _sendSelectedCustomerId = null;
    _sendSelectedCustomer = null;
    document.getElementById('sendCustomerHint').textContent = '';
    document.getElementById('sendCustClearBtn').style.display = 'none';
    document.querySelectorAll('.send-cust-radio').forEach(r => { r.checked = false; });
    document.querySelectorAll('.bulk-customer-item').forEach(el => el.classList.remove('send-cust-selected'));
}

function loadSendCustomerSearch() {
    _sendSelectedCustomerId = null;
    _sendSelectedCustomer = null;
    document.getElementById('sendCustomerHint').textContent = '';
    document.getElementById('sendCustClearBtn').style.display = 'none';
    _updateSendFromDisplay();
    // 若已有数据则直接复用，否则拉取
    if (_sendCustAll.length) {
        _populateSendCustFilterOptions();
        _applySendCustFilter();
    } else {
        _loadSendCustByStatus();
    }
}

initSendCustomerSearch();

// ───── 附件拖拽上传 ─────
(function() {
    const dropZone = document.getElementById('attachmentDropZone');
    const fileInput = document.getElementById('sendAttachments');
    const placeholder = document.getElementById('attachmentPlaceholder');
    const list = document.getElementById('attachmentList');

    // 用独立数组维护已选文件，支持多次追加
    let _attachFiles = [];

    function renderList() {
        placeholder.style.display = _attachFiles.length ? 'none' : 'flex';
        const items = _attachFiles.map((f, i) => {
            const size = f.size > 1024 * 1024
                ? (f.size / 1024 / 1024).toFixed(1) + ' MB'
                : (f.size / 1024).toFixed(0) + ' KB';
            return `<li class="attachment-item">
                <span class="attachment-icon">📎</span>
                <span class="attachment-name">${escapeHtml(f.name)}</span>
                <span class="attachment-size">${size}</span>
                <button type="button" class="attachment-remove" onclick="removeAttachment(${i})" title="移除">×</button>
            </li>`;
        }).join('');
        const addBtn = _attachFiles.length
            ? `<li class="attachment-add-more"><button type="button" onclick="document.getElementById('sendAttachments').click()">+ 继续添加附件</button></li>`
            : '';
        list.innerHTML = items + addBtn;
        // 同步回 fileInput 以便发送时读取
        const dt = new DataTransfer();
        _attachFiles.forEach(f => dt.items.add(f));
        fileInput.files = dt.files;
    }

    window.removeAttachment = function(index) {
        _attachFiles.splice(index, 1);
        renderList();
    };

    // 清空附件（发送成功后调用）
    window.clearAttachments = function() {
        _attachFiles = [];
        renderList();
    };

    dropZone.addEventListener('click', e => {
        if (e.target.classList.contains('attachment-remove')) return;
        if (e.target.closest('.attachment-add-more')) return;
        fileInput.click();
    });

    fileInput.addEventListener('change', () => {
        Array.from(fileInput.files).forEach(f => _attachFiles.push(f));
        renderList();
    });

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        Array.from(e.dataTransfer.files).forEach(f => _attachFiles.push(f));
        renderList();
    });
})();

document.getElementById('sendEmailBtn').addEventListener('click', () => {
    const toList = getTagValues('sendToWrap');
    const subject = document.getElementById('sendSubject').value.trim();
    const body = document.getElementById('sendBody').value.trim();

    if (!toList.length || !subject || !body) {
        showError('请填写收件人、主题和正文');
        return;
    }

    const ccList  = getTagValues('sendCcWrap');
    const bccList = getTagValues('sendBccWrap');

    // Show preview modal
    document.getElementById('sendPreviewTo').textContent = toList.join('、');
    document.getElementById('sendPreviewSubject').textContent = subject;
    document.getElementById('sendPreviewBody').textContent = body;

    // CC/BCC preview rows
    const previewCcRow = document.getElementById('sendPreviewCcRow');
    const previewBccRow = document.getElementById('sendPreviewBccRow');
    if (ccList.length && previewCcRow) {
        document.getElementById('sendPreviewCc').textContent = ccList.join('、');
        previewCcRow.style.display = 'block';
    } else if (previewCcRow) {
        previewCcRow.style.display = 'none';
    }
    if (bccList.length && previewBccRow) {
        document.getElementById('sendPreviewBcc').textContent = bccList.join('、');
        previewBccRow.style.display = 'block';
    } else if (previewBccRow) {
        previewBccRow.style.display = 'none';
    }

    const files = Array.from(document.getElementById('sendAttachments').files);
    const attachRow = document.getElementById('sendPreviewAttachRow');
    if (files.length) {
        document.getElementById('sendPreviewAttach').textContent = files.map(f => f.name).join('、');
        attachRow.style.display = 'block';
    } else {
        attachRow.style.display = 'none';
    }

    document.getElementById('sendPreviewModal').classList.add('show');
});

document.getElementById('sendPreviewClose').addEventListener('click', () => {
    document.getElementById('sendPreviewModal').classList.remove('show');
});
document.getElementById('sendPreviewCancelBtn').addEventListener('click', () => {
    document.getElementById('sendPreviewModal').classList.remove('show');
});

document.getElementById('sendPreviewConfirmBtn').addEventListener('click', async () => {
    const toList  = getTagValues('sendToWrap');
    const ccList  = getTagValues('sendCcWrap');
    const bccList = getTagValues('sendBccWrap');
    const subject = document.getElementById('sendSubject').value.trim();
    const body = document.getElementById('sendBody').value.trim();
    const customerId = _sendSelectedCustomerId || null;
    const resultEl = document.getElementById('sendEmailResult');

    document.getElementById('sendPreviewModal').classList.remove('show');

    const btn = document.getElementById('sendEmailBtn');
    btn.disabled = true;
    btn.textContent = '发送中...';
    resultEl.style.display = 'none';

    try {
        const formData = new FormData();
        formData.append('to_address', toList[0]);  // 主收件人取第一个
        // 多收件人：其余的放 CC（业务处理方式）或逗号拼接
        const extraTo = toList.slice(1);
        const allCc = [...extraTo, ...ccList];
        formData.append('subject', subject);
        formData.append('body', body);
        if (customerId) formData.append('customer_id', customerId);
        if (allCc.length) formData.append('cc_addresses', allCc.join(','));
        if (bccList.length) formData.append('bcc_addresses', bccList.join(','));
        Array.from(document.getElementById('sendAttachments').files).forEach(f => {
            formData.append('attachments', f);
        });

        const res = await fetch('/api/email-center/send', {
            method: 'POST',
            credentials: 'include',
            body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
            resultEl.innerHTML = `<div class="error-message">${escapeHtml(data.detail || '发送失败')}</div>`;
        } else {
            resultEl.innerHTML = '<div class="success-message">✅ 发送成功！</div>';
            clearTags('sendToWrap');
            clearTags('sendCcWrap');
            clearTags('sendBccWrap');
            document.getElementById('sendSubject').value = '';
            document.getElementById('sendBody').value = '';
            if (_quillSend) _quillSend.setContents([]);
            loadSendCustomerSearch(); // 重置客户搜索框
            clearAttachments();       // 重置附件列表
        }
        resultEl.style.display = 'block';
    } catch (e) {
        resultEl.innerHTML = `<div class="error-message">发送失败：${escapeHtml(e.message)}</div>`;
        resultEl.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.textContent = '发送邮件';
    }
});


// ───── 群发邮件 ─────
let _bulkCustomers = [];

// 群发附件管理（复用与单发相同的追加逻辑）
(function() {
    const dropZone   = document.getElementById('bulkAttachmentDropZone');
    const fileInput  = document.getElementById('bulkAttachments');
    const placeholder = document.getElementById('bulkAttachmentPlaceholder');
    const list       = document.getElementById('bulkAttachmentList');
    let _files = [];

    function render() {
        placeholder.style.display = _files.length ? 'none' : 'flex';
        const items = _files.map((f, i) => {
            const size = f.size > 1024 * 1024
                ? (f.size / 1024 / 1024).toFixed(1) + ' MB'
                : (f.size / 1024).toFixed(0) + ' KB';
            return `<li class="attachment-item">
                <span class="attachment-icon">📎</span>
                <span class="attachment-name">${escapeHtml(f.name)}</span>
                <span class="attachment-size">${size}</span>
                <button type="button" class="attachment-remove" onclick="removeBulkAttachment(${i})" title="移除">×</button>
            </li>`;
        }).join('');
        const addBtn = _files.length
            ? `<li class="attachment-add-more"><button type="button" onclick="document.getElementById('bulkAttachments').click()">+ 继续添加附件</button></li>`
            : '';
        list.innerHTML = items + addBtn;
        const dt = new DataTransfer();
        _files.forEach(f => dt.items.add(f));
        fileInput.files = dt.files;
    }

    window.removeBulkAttachment = function(i) { _files.splice(i, 1); render(); };
    window.getBulkAttachFiles   = () => _files;
    window.clearBulkAttachments = () => { _files = []; render(); };

    dropZone.addEventListener('click', e => {
        if (e.target.classList.contains('attachment-remove')) return;
        if (e.target.closest('.attachment-add-more')) return;
        fileInput.click();
    });
    fileInput.addEventListener('change', () => {
        Array.from(fileInput.files).forEach(f => _files.push(f));
        render();
    });
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        Array.from(e.dataTransfer.files).forEach(f => _files.push(f));
        render();
    });
})();

document.getElementById('bulkStatusFilter').addEventListener('change', loadBulkCustomers);
document.getElementById('bulkCountryFilter').addEventListener('change', _applyBulkFilter);
document.getElementById('bulkIndustryFilter').addEventListener('change', _applyBulkFilter);
document.getElementById('bulkSearchInput').addEventListener('input', _applyBulkFilter);

async function loadBulkCustomers() {
    const statusFilter = document.getElementById('bulkStatusFilter').value;
    const params = new URLSearchParams({ page: 1, page_size: 1000 });
    if (statusFilter) params.set('status', statusFilter);
    try {
        const res = await fetch(`/api/customers?${params}`, { credentials: 'include' });
        const data = await res.json();
        _bulkCustomers = data.items;
        _populateBulkFilterOptions();
        _applyBulkFilter();
    } catch {
        showError('加载客户列表失败');
    }
}

function _populateBulkFilterOptions() {
    const countries = [...new Set(_bulkCustomers.map(c => c.country).filter(Boolean))].sort();
    const industries = [...new Set(_bulkCustomers.map(c => c.industry).filter(Boolean))].sort();

    const countryEl = document.getElementById('bulkCountryFilter');
    const prevCountry = countryEl.value;
    countryEl.innerHTML = '<option value="">全部国家</option>' +
        countries.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if (countries.includes(prevCountry)) countryEl.value = prevCountry;

    const industryEl = document.getElementById('bulkIndustryFilter');
    const prevIndustry = industryEl.value;
    industryEl.innerHTML = '<option value="">全部行业</option>' +
        industries.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if (industries.includes(prevIndustry)) industryEl.value = prevIndustry;
}

function _applyBulkFilter() {
    const country  = document.getElementById('bulkCountryFilter').value;
    const industry = document.getElementById('bulkIndustryFilter').value;
    const q        = document.getElementById('bulkSearchInput').value.trim().toLowerCase();
    const filtered = _bulkCustomers.filter(c => {
        if (country  && c.country  !== country)  return false;
        if (industry && c.industry !== industry)  return false;
        if (q && ![ c.name, c.company, c.email ].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
        return true;
    });
    renderBulkCustomerList(filtered);
}

function renderBulkCustomerList(customers) {
    const container = document.getElementById('bulkCustomerList');
    if (!customers.length) {
        container.innerHTML = '<div class="empty-state"><p>没有符合条件的客户</p></div>';
        updateBulkSelectedCount();
        return;
    }
    container.innerHTML = customers.map(c => `
        <label class="bulk-customer-item">
            <input type="checkbox" class="bulk-customer-check" value="${c.id}"
                data-name="${escapeHtml(c.name)}"
                data-company="${escapeHtml(c.company || '')}"
                data-country="${escapeHtml(c.country || '')}"
                data-email="${escapeHtml(c.email || '')}"
                data-product="${escapeHtml(c.product_pref || '')}"
                data-industry="${escapeHtml(c.industry || '')}">
            <span class="bulk-customer-info">
                <span class="bulk-customer-name">${escapeHtml(c.name)}</span>
                ${c.company ? `<span class="bulk-customer-company">${escapeHtml(c.company)}</span>` : ''}
                ${c.country ? `<span class="bulk-customer-company" style="color:var(--gray-400);">📍${escapeHtml(c.country)}</span>` : ''}
                ${c.industry ? `<span class="bulk-customer-company" style="color:var(--gray-400);">🏭${escapeHtml(c.industry)}</span>` : ''}
                ${c.email ? `<span class="bulk-customer-email">${escapeHtml(c.email)}</span>` : '<span class="bulk-customer-noemail">无邮箱</span>'}
            </span>
        </label>
    `).join('');

    container.querySelectorAll('.bulk-customer-check').forEach(cb => {
        cb.addEventListener('change', updateBulkSelectedCount);
    });
    updateBulkSelectedCount();
}

function updateBulkSelectedCount() {
    const checked = document.querySelectorAll('.bulk-customer-check:checked').length;
    document.getElementById('bulkSelectedCount').textContent = `已选 ${checked} 位客户`;
}

document.getElementById('selectAllBulkBtn').addEventListener('click', () => {
    document.querySelectorAll('.bulk-customer-check').forEach(cb => { cb.checked = true; });
    updateBulkSelectedCount();
});
document.getElementById('deselectAllBulkBtn').addEventListener('click', () => {
    document.querySelectorAll('.bulk-customer-check').forEach(cb => { cb.checked = false; });
    updateBulkSelectedCount();
});

function buildBulkItems() {
    const subject = document.getElementById('bulkSubject').value;
    const body = document.getElementById('bulkBody').value;
    if (!subject || !body) return null;

    const items = [];
    document.querySelectorAll('.bulk-customer-check:checked').forEach(cb => {
        if (!cb.dataset.email) return;
        const name     = cb.dataset.name;
        const company  = cb.dataset.company  || '';
        const country  = cb.dataset.country  || '';
        const email    = cb.dataset.email    || '';
        const product  = cb.dataset.product  || '';
        const industry = cb.dataset.industry || '';
        const subst = (s) => s
            .replace(/\{\{name\}\}/g,     name)
            .replace(/\{\{company\}\}/g,  company)
            .replace(/\{\{country\}\}/g,  country)
            .replace(/\{\{email\}\}/g,    email)
            .replace(/\{\{product\}\}/g,  product)
            .replace(/\{\{industry\}\}/g, industry);
        items.push({
            customer_id: parseInt(cb.value),
            to_address: cb.dataset.email,
            subject: subst(subject),
            body: subst(body),
        });
    });
    return items;
}

document.getElementById('previewBulkBtn').addEventListener('click', () => {
    const items = buildBulkItems();
    if (!items) { showError('请填写主题和正文'); return; }
    if (!items.length) { showError('请选择至少一位有邮箱的客户'); return; }

    const first = items[0];
    document.getElementById('bulkPreviewTo').textContent = first.to_address;
    document.getElementById('bulkPreviewSubject').textContent = first.subject;
    document.getElementById('bulkPreviewBody').textContent = first.body;
    document.getElementById('bulkPreviewModal').classList.add('show');
});

document.getElementById('bulkPreviewClose').addEventListener('click', () => {
    document.getElementById('bulkPreviewModal').classList.remove('show');
});
document.getElementById('bulkPreviewCloseBtn').addEventListener('click', () => {
    document.getElementById('bulkPreviewModal').classList.remove('show');
});

document.getElementById('sendBulkBtn').addEventListener('click', async () => {
    const items = buildBulkItems();
    if (!items) { showError('请填写主题和正文'); return; }
    if (!items.length) { showError('请选择至少一位有邮箱的客户'); return; }

    showConfirm({
        title: '确认群发',
        message: `即将向 ${items.length} 位客户发送邮件，确认吗？`,
        confirmText: '确认发送',
        danger: false,
        onConfirm: async () => {
            const btn = document.getElementById('sendBulkBtn');
            const resultEl = document.getElementById('bulkSendResult');
            btn.disabled = true;
            btn.textContent = '发送中...';
            resultEl.style.display = 'none';

            try {
                const fd = new FormData();
                fd.append('items_json', JSON.stringify(items));
                getBulkAttachFiles().forEach(f => fd.append('attachments', f));
                const res = await fetch('/api/email-center/bulk-send', {
                    method: 'POST',
                    credentials: 'include',
                    body: fd,
                });
                const data = await res.json();
                if (!res.ok) {
                    resultEl.innerHTML = `<div class="error-message">${data.detail || '群发失败'}</div>`;
                } else {
                    const failDetails = data.details.filter(d => d.status === 'failed');
                    const failHtml = failDetails.length
                        ? '<ul style="margin-top:8px;">' + failDetails.map(d => `<li>${escapeHtml(d.to)}: ${escapeHtml(d.error || '')}</li>`).join('') + '</ul>'
                        : '';
                    resultEl.innerHTML = `<div class="${data.failed === 0 ? 'success-message' : 'error-message'}">✅ 成功：${data.sent} 封　❌ 失败：${data.failed} 封${failHtml}</div>`;
                }
                resultEl.style.display = 'block';
            } catch (e) {
                resultEl.innerHTML = `<div class="error-message">群发失败：${e.message}</div>`;
                resultEl.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = '确认群发';
            }
        }
    });
});


// ───── 发送记录 ─────
let _sentLogAllData = [];
let _sentLogPage = 1;
const _SENT_LOG_PAGE_SIZE = 20;

document.getElementById('refreshSentLogBtn').addEventListener('click', loadSentLog);

function _applySentLogFilter() {
    const q = document.getElementById('sentLogSearch').value.trim().toLowerCase();
    const statusVal = document.getElementById('sentLogStatusFilter').value;
    let filtered = _sentLogAllData;
    if (q) filtered = filtered.filter(r =>
        (r.to_address || '').toLowerCase().includes(q) ||
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.subject || '').toLowerCase().includes(q));
    if (statusVal) filtered = filtered.filter(r => r.status === statusVal);
    renderPaged(filtered, _SENT_LOG_PAGE_SIZE, _sentLogPage,
        _renderSentLogSlice,
        document.getElementById('sentLogContainer'),
        document.getElementById('sentLogPagination'),
        p => { _sentLogPage = p; _applySentLogFilter(); },
        document.getElementById('sentLogInfo'), '条记录'
    );
}

function _renderSentLogSlice(slice, total) {
    const container = document.getElementById('sentLogContainer');
    if (!total) {
        container.innerHTML = '<div class="empty-state"><h3>暂无发送记录</h3></div>';
        return;
    }
    const rows = slice.map(r => `
        <tr>
            <td class="cell-time">${fmtTime(r.created_at)}</td>
            <td>${escapeHtml(r.to_address)}</td>
            <td>${escapeHtml(r.customer_name || '—')}</td>
            <td><div class="cell-title">${escapeHtml(r.subject)}</div></td>
            <td><span class="status-badge ${r.status === 'sent' ? 'status-done' : 'status-pending'}">${r.status === 'sent' ? '✅ 成功' : '❌ 失败'}</span>
                ${r.error_msg ? `<div style="font-size:0.78rem;color:var(--danger);">${escapeHtml(r.error_msg.substring(0, 60))}</div>` : ''}
            </td>
            <td class="cell-time">${r.bulk_id ? `批次 ${r.bulk_id}` : '单发'}</td>
        </tr>
    `).join('');
    container.innerHTML = `
        <table class="history-table">
            <thead><tr>
                <th>时间</th><th>收件人</th><th>客户</th><th>主题</th><th>状态</th><th>类型</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

async function loadSentLog() {
    const container = document.getElementById('sentLogContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const res = await fetch('/api/email-center/sent-log?page=1&page_size=500', { credentials: 'include' });
        const data = await res.json();
        _sentLogAllData = data.items || [];
        _sentLogPage = 1;
        _applySentLogFilter();
    } catch (e) {
        container.innerHTML = `<div class="error-message">加载失败：${e.message}</div>`;
    }
}

document.getElementById('sentLogSearch').addEventListener('input', () => { _sentLogPage = 1; _applySentLogFilter(); });
document.getElementById('sentLogStatusFilter').addEventListener('change', () => { _sentLogPage = 1; _applySentLogFilter(); });


// ───── 联系统计 ─────
let _contactStatsAllData = [];
let _contactStatsPage = 1;
const _CONTACT_STATS_PAGE_SIZE = 20;

document.getElementById('refreshContactStatsBtn').addEventListener('click', loadContactStats);
document.getElementById('contactOverdueDays').addEventListener('change', () => { _contactStatsPage = 1; _applyContactStatsFilter(); });

function _applyContactStatsFilter() {
    const overdueDays = Math.max(1, parseInt(document.getElementById('contactOverdueDays').value) || 30);
    const q = document.getElementById('contactStatsSearch').value.trim().toLowerCase();
    const summary = document.getElementById('contactStatsSummary');

    // summary banner uses full dataset
    const overdueList  = _contactStatsAllData.filter(s => s.days_since_contact !== null && s.days_since_contact >= overdueDays);
    const neverList    = _contactStatsAllData.filter(s => s.days_since_contact === null);
    const needFollowUp = overdueList.length + neverList.length;
    summary.innerHTML = needFollowUp > 0 ? `
        <div class="contact-alert-banner">
            <span class="contact-alert-icon">⚠️</span>
            <span>共 <strong>${needFollowUp}</strong> 位客户需要跟进：
                ${overdueList.length ? `<strong>${overdueList.length}</strong> 位超过 ${overdueDays} 天未联系` : ''}
                ${overdueList.length && neverList.length ? '，' : ''}
                ${neverList.length ? `<strong>${neverList.length}</strong> 位从未联系` : ''}
            </span>
        </div>` : '';

    let filtered = _contactStatsAllData;
    if (q) filtered = filtered.filter(s =>
        (s.customer_name || '').toLowerCase().includes(q) ||
        (s.company || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q));

    renderPaged(filtered, _CONTACT_STATS_PAGE_SIZE, _contactStatsPage,
        slice => _renderContactStatsSlice(slice, filtered.length, overdueDays),
        document.getElementById('contactStatsContainer'),
        document.getElementById('contactStatsPagination'),
        p => { _contactStatsPage = p; _applyContactStatsFilter(); },
        document.getElementById('contactStatsInfo'), '位客户'
    );
}

function _renderContactStatsSlice(slice, total, overdueDays) {
    const container = document.getElementById('contactStatsContainer');
    if (!total) {
        container.innerHTML = '<div class="empty-state"><h3>暂无客户数据</h3><p>先在「客户管理」添加客户</p></div>';
        return;
    }
    const halfDays = Math.floor(overdueDays / 2);
    const rows = slice.map(s => {
        const isOverdue = s.days_since_contact !== null && s.days_since_contact >= overdueDays;
        const isNever   = s.days_since_contact === null;
        const daysClass = isNever    ? 'contact-never'
                        : isOverdue  ? 'contact-overdue'
                        : s.days_since_contact > halfDays ? 'contact-warning'
                        : 'contact-ok';
        const rowClass  = isOverdue || isNever ? 'contact-row-alert' : '';
        const daysLabel = isNever                       ? '从未联系'
                        : s.days_since_contact === 0    ? '今天'
                        : `${s.days_since_contact} 天前`;
        const stLabel = { prospect: '潜在', active: '活跃', paused: '暂停', closed: '关闭' }[s.status] || s.status;
        return `
            <tr class="${rowClass}">
                <td><div class="cell-title">${escapeHtml(s.customer_name)}</div>
                    <div style="font-size:0.8rem;color:var(--gray-400);">${escapeHtml(s.company || '')}</div></td>
                <td><span class="customer-status-badge customer-status-${s.status}">${stLabel}</span></td>
                <td>${escapeHtml(s.email || '—')}</td>
                <td style="text-align:center;">${s.total_interactions}</td>
                <td style="text-align:center;">${s.sent_count}</td>
                <td class="${daysClass}" style="font-weight:600;">${daysLabel}</td>
                <td class="cell-time">${s.last_contact || '—'}</td>
            </tr>`;
    }).join('');
    container.innerHTML = `
        <div class="contact-stats-legend">
            <span class="contact-ok-swatch">■</span> ${halfDays}天内 &nbsp;
            <span class="contact-warning-swatch">■</span> ${halfDays+1}–${overdueDays-1}天 &nbsp;
            <span class="contact-overdue-swatch">■</span> 超过${overdueDays}天 &nbsp;
            <span class="contact-never-swatch">■</span> 从未联系
        </div>
        <table class="history-table">
            <thead><tr>
                <th>客户</th><th>状态</th><th>邮箱</th>
                <th style="text-align:center;">互动总数</th>
                <th style="text-align:center;">已发邮件</th>
                <th>上次联系距今</th>
                <th>最近联系日期</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>`;
}

async function loadContactStats() {
    const container = document.getElementById('contactStatsContainer');
    const summary   = document.getElementById('contactStatsSummary');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    summary.innerHTML = '';
    try {
        const res = await fetch('/api/email-center/contact-stats', { credentials: 'include' });
        _contactStatsAllData = await res.json();
        _contactStatsPage = 1;
        _applyContactStatsFilter();
    } catch (e) {
        container.innerHTML = `<div class="error-message">加载失败：${e.message}</div>`;
    }
}

document.getElementById('contactStatsSearch').addEventListener('input', () => { _contactStatsPage = 1; _applyContactStatsFilter(); });


// ───── 邮件模板 ─────
let _editingEmailTemplateId = null;
let _etLastFocused = 'etBody'; // 追踪最后聚焦的字段（etSubject 或 etBody）

// 共用占位符插入：插入到最后聚焦的字段
function insertPlaceholderFocused(placeholder) {
    if (_etLastFocused === 'etBody' && _quillEt) {
        const range = _quillEt.getSelection(true);
        const idx = range ? range.index : _quillEt.getLength();
        _quillEt.insertText(idx, placeholder, 'user');
        _quillEt.setSelection(idx + placeholder.length, 0);
    } else {
        insertPlaceholder(_etLastFocused, placeholder);
    }
}

// 在光标位置插入占位符
function insertPlaceholder(fieldId, placeholder) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    el.value = el.value.slice(0, start) + placeholder + el.value.slice(end);
    const pos = start + placeholder.length;
    el.focus();
    el.setSelectionRange(pos, pos);
    _updateWordCount(fieldId);
}

// ───── Quill 富文本编辑器 ─────

// 工具栏配置：标准格式按钮（副工具栏另行注入）
const _QUILL_TOOLBAR = [
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['link'],
    ['clean'],
];

// 问候语选项
const _GREETINGS = [
    { label: 'Dear {{name}},',           value: 'Dear {{name}},\n\n' },
    { label: 'Dear Sir/Madam,',          value: 'Dear Sir/Madam,\n\n' },
    { label: 'Hello {{name}},',          value: 'Hello {{name}},\n\n' },
    { label: 'Hi {{name}},',             value: 'Hi {{name}},\n\n' },
    { label: 'To Whom It May Concern,',  value: 'To Whom It May Concern,\n\n' },
    { label: 'Good day {{name}},',       value: 'Good day {{name}},\n\n' },
];

// 结束语选项
const _CLOSINGS = [
    { label: 'Best regards,',                    value: '\n\nBest regards,\n{sender}' },
    { label: 'Kind regards,',                    value: '\n\nKind regards,\n{sender}' },
    { label: 'Warm regards,',                    value: '\n\nWarm regards,\n{sender}' },
    { label: 'Sincerely,',                       value: '\n\nSincerely,\n{sender}' },
    { label: 'Looking forward to your reply.',   value: '\n\nLooking forward to your reply.\n\nBest regards,\n{sender}' },
    { label: 'Please feel free to contact us.', value: '\n\nPlease feel free to contact us at any time.\n\nBest regards,\n{sender}' },
    { label: 'Thank you for your consideration.',value: '\n\nThank you for your time and consideration.\n\nBest regards,\n{sender}' },
];

let _quillSend, _quillBulk, _quillEt;
// 当前浮动菜单
let _activeQuillDropdown = null;

function _closeQuillDropdown() {
    if (_activeQuillDropdown) {
        _activeQuillDropdown.remove();
        _activeQuillDropdown = null;
    }
}

document.addEventListener('click', (e) => {
    if (_activeQuillDropdown &&
        !_activeQuillDropdown.contains(e.target) &&
        !e.target.closest('.ql-extra-greeting, .ql-extra-closing')) {
        _closeQuillDropdown();
    }
});

function _showQuillMenu(btn, items, quill) {
    _closeQuillDropdown();
    const menu = document.createElement('div');
    menu.className = 'quill-float-menu';
    items.forEach(item => {
        const el = document.createElement('div');
        el.className = 'quill-float-menu-item';
        el.textContent = item.label;
        el.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const text = item.value
                .replace(/\\n/g, '\n')
                .replace(/\{sender\}/g, _getSenderName());
            const range = quill.getSelection(true);
            const idx = range ? range.index : quill.getLength();
            quill.insertText(idx, text, 'user');
            quill.setSelection(idx + text.length, 0);
            _closeQuillDropdown();
        });
        menu.appendChild(el);
    });
    document.body.appendChild(menu);
    _activeQuillDropdown = menu;

    // 定位到按钮下方
    const rect = btn.getBoundingClientRect();
    let left = rect.left;
    const menuWidth = 220;
    if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
    menu.style.top  = (rect.bottom + window.scrollY + 2) + 'px';
    menu.style.left = left + 'px';
}

// 在 Quill 编辑区上方注入副工具栏（问候语/结束语/签名/词数/清空）
function _injectQuillSubtoolbar(quill, key, countId) {
    const editorWrap = quill.container.parentElement; // .quill-editor-wrap
    const bar = document.createElement('div');
    bar.className = 'quill-sub-toolbar';

    // 问候语按钮
    const greetBtn = document.createElement('button');
    greetBtn.type = 'button';
    greetBtn.className = 'ql-extra-greeting';
    greetBtn.textContent = '问候语 ▾';
    greetBtn.addEventListener('click', () => _showQuillMenu(greetBtn, _GREETINGS, quill));

    // 结束语按钮
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ql-extra-closing';
    closeBtn.textContent = '结束语 ▾';
    closeBtn.addEventListener('click', () => _showQuillMenu(closeBtn, _CLOSINGS, quill));

    // 签名按钮
    const sigBtn = document.createElement('button');
    sigBtn.type = 'button';
    sigBtn.className = 'ql-extra-sig';
    sigBtn.textContent = '✍️ 签名';
    sigBtn.addEventListener('click', () => editorInsertSignature(key));

    // 分隔线
    const sep = document.createElement('span');
    sep.className = 'ql-extra-sep';

    // 词数统计
    const countSpan = document.createElement('span');
    countSpan.id = countId;
    countSpan.className = 'ql-wordcount';
    countSpan.textContent = '0 词';

    // 清空按钮（右对齐）
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'ql-extra-clear';
    clearBtn.textContent = '清空';
    clearBtn.addEventListener('click', () => editorClear(key));

    bar.appendChild(greetBtn);
    bar.appendChild(closeBtn);
    bar.appendChild(sigBtn);
    bar.appendChild(sep);
    bar.appendChild(countSpan);
    bar.appendChild(clearBtn);

    // 插在 Quill 工具栏之后、编辑区之前
    const qlContainer = quill.container; // .ql-container
    editorWrap.insertBefore(bar, qlContainer);
}

const _QUILL_TOOLBAR_TITLES = {
    '.ql-font':         '字体',
    '.ql-size':         '字号',
    '.ql-bold':         '粗体 (Ctrl+B)',
    '.ql-italic':       '斜体 (Ctrl+I)',
    '.ql-underline':    '下划线 (Ctrl+U)',
    '.ql-strike':       '删除线',
    '.ql-color':        '文字颜色',
    '.ql-background':   '文字背景色',
    '.ql-align':        '对齐方式',
    '.ql-link':         '插入链接',
    '.ql-clean':        '清除格式',
};

function _applyQuillTooltips(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    // 副工具栏注入后，.ql-toolbar 是 editorWrap 的第一个子元素
    const editorWrap = container.parentElement;
    const toolbar = editorWrap?.querySelector('.ql-toolbar');
    if (!toolbar) return;
    Object.entries(_QUILL_TOOLBAR_TITLES).forEach(([sel, title]) => {
        toolbar.querySelectorAll(sel).forEach(el => { el.title = title; });
    });
}

function _initQuillEditors() {
    if (typeof Quill === 'undefined') return;

    const makeOpts = (placeholder) => ({
        theme: 'snow',
        placeholder,
        modules: { toolbar: { container: _QUILL_TOOLBAR } },
    });

    _quillSend = new Quill('#sendBodyEditor', makeOpts('在此输入邮件正文…'));
    _quillBulk = new Quill('#bulkBodyEditor', makeOpts('在此输入正文，支持 {{name}}{{company}} 等占位符…'));
    _quillEt   = new Quill('#etBodyEditor',   makeOpts('在此输入模板正文…'));

    _applyQuillTooltips('#sendBodyEditor');
    _applyQuillTooltips('#bulkBodyEditor');
    _applyQuillTooltips('#etBodyEditor');

    // 注入副工具栏（问候语/结束语/签名/词数/清空）
    _injectQuillSubtoolbar(_quillSend, 'send', 'sendBodyCount');
    _injectQuillSubtoolbar(_quillBulk, 'bulk', 'bulkBodyCount');
    _injectQuillSubtoolbar(_quillEt,   'et',   'etBodyCount');

    // 词数统计 + hidden input 同步
    _quillSend.on('text-change', () => {
        document.getElementById('sendBody').value = _quillSend.root.innerHTML;
        _updateQuillWordCount('sendBody', _quillSend);
    });
    _quillBulk.on('text-change', () => {
        document.getElementById('bulkBody').value = _quillBulk.root.innerHTML;
        _updateQuillWordCount('bulkBody', _quillBulk);
    });
    _quillEt.on('text-change', () => {
        document.getElementById('etBody').value = _quillEt.root.innerHTML;
        _updateQuillWordCount('etBody', _quillEt);
    });
}

function _getQuill(key) {
    if (key === 'send') return _quillSend;
    if (key === 'bulk') return _quillBulk;
    if (key === 'et')   return _quillEt;
    return null;
}

function _updateQuillWordCount(fieldId, quill) {
    const countEl = document.getElementById(fieldId + 'Count');
    if (!countEl || !quill) return;
    const text = quill.getText().trim();
    const words = text ? text.split(/\s+/).length : 0;
    countEl.textContent = words + ' 词';
}

function _getSenderName() {
    return window._currentUser?.username || 'Cecilia';
}

function editorInsertSelect(key, type, selectEl) {
    const raw = selectEl.value;
    selectEl.value = '';
    if (!raw) return;
    const quill = _getQuill(key);
    if (!quill) return;
    const text = raw.replace(/\\n/g, '\n').replace(/\{sender\}/g, _getSenderName());
    const range = quill.getSelection(true);
    const idx = range ? range.index : quill.getLength();
    quill.insertText(idx, text, 'user');
    quill.setSelection(idx + text.length, 0);
}

function editorInsertSignature(key) {
    const sig = window._cachedSignature;
    if (!sig) { showError('请先在「全局设置」中填写公司签名'); return; }
    const quill = _getQuill(key);
    if (!quill) return;
    const len = quill.getLength();
    const cur = quill.getText();
    const sep = cur.trim() ? '\n\n' : '';
    quill.insertText(len - 1, sep + sig, 'user');
    quill.setSelection(quill.getLength(), 0);
}

function editorClear(key) {
    const quill = _getQuill(key);
    if (!quill) return;
    if (!quill.getText().trim()) return;
    showConfirm({
        title: '清空正文',
        message: '确认清空编辑器内容？',
        confirmText: '清空',
        danger: true,
        onConfirm: () => {
            quill.setContents([]);
            const fieldId = key === 'et' ? 'etBody' : key + 'Body';
            document.getElementById(fieldId).value = '';
            _updateQuillWordCount(fieldId, quill);
        },
    });
}

// 缓存签名供工具栏使用（settings 加载时同步）
window._cachedSignature = null;

// DOM 加载完毕后初始化 Quill
document.addEventListener('DOMContentLoaded', _initQuillEditors);

document.getElementById('refreshEmailTemplatesBtn').addEventListener('click', loadEmailTemplates);
document.getElementById('saveEmailTemplateBtn').addEventListener('click', saveEmailTemplate);
document.getElementById('cancelEmailTemplateModalBtn').addEventListener('click', closeEmailTemplateModal);
document.getElementById('emailTemplateModalClose').addEventListener('click', closeEmailTemplateModal);
document.getElementById('emailTemplateModal').addEventListener('click', function(e) {
    if (e.target === this) closeEmailTemplateModal();
});

function openEmailTemplateModal(t = null) {
    _editingEmailTemplateId = t ? t.id : null;
    document.getElementById('emailTemplateModalTitle').textContent = t ? '编辑模板' : '新建模板';
    document.getElementById('etName').value = t ? t.name : '';
    document.getElementById('etDescription').value = t ? (t.description || '') : '';
    document.getElementById('etSubject').value = t ? t.subject : '';
    document.getElementById('etBody').value = t ? (t.body || '') : '';
    if (_quillEt) {
        _quillEt.clipboard.dangerouslyPasteHTML(t ? (t.body || '') : '');
        _updateQuillWordCount('etBody', _quillEt);
    }
    _etLastFocused = 'etBody';
    ['etSubject'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.onfocus = () => { _etLastFocused = id; };
    });
    document.getElementById('emailTemplateModal').classList.add('show');
}

function closeEmailTemplateModal() {
    document.getElementById('emailTemplateModal').classList.remove('show');
    _editingEmailTemplateId = null;
}

let _emailTemplatesAllData = [];
let _emailTemplatesPage = 1;
const _EMAIL_TEMPLATES_PAGE_SIZE = 10;

function _applyEmailTemplatesFilter() {
    const q = document.getElementById('emailTemplatesSearch').value.trim().toLowerCase();
    const filtered = q
        ? _emailTemplatesAllData.filter(t =>
            (t.name || '').toLowerCase().includes(q) ||
            (t.subject || '').toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q))
        : _emailTemplatesAllData;
    renderPaged(filtered, _EMAIL_TEMPLATES_PAGE_SIZE, _emailTemplatesPage,
        _renderEmailTemplatesSlice,
        document.getElementById('emailTemplateList'),
        document.getElementById('emailTemplatesPagination'),
        p => { _emailTemplatesPage = p; _applyEmailTemplatesFilter(); },
        document.getElementById('emailTemplatesInfo'), '个模板'
    );
}

function _renderEmailTemplatesSlice(slice, total) {
    const list = document.getElementById('emailTemplateList');
    if (!total) {
        list.innerHTML = '<div class="empty-state"><h3>暂无邮件模板</h3><p>点击「新建模板」创建第一个吧</p></div>';
        return;
    }
    list.innerHTML = `
        <table class="history-table">
            <thead><tr>
                <th>名称</th><th>备注</th><th>主题</th><th>创建时间</th><th>操作</th>
            </tr></thead>
            <tbody>
                ${slice.map(t => `
                    <tr>
                        <td><div class="cell-title">${escapeHtml(t.name)}</div></td>
                        <td style="color:var(--gray-400);font-size:0.85rem;">${escapeHtml(t.description || '—')}</td>
                        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.subject)}</td>
                        <td class="cell-time">${t.created_at ? t.created_at.slice(0,10) : ''}</td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn btn-sm btn-secondary" onclick="editEmailTemplate(${t.id})">编辑</button>
                                <button class="btn btn-sm btn-danger" onclick="deleteEmailTemplate(${t.id})">删除</button>
                            </div>
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table>`;
}

async function loadEmailTemplates() {
    const list = document.getElementById('emailTemplateList');
    list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const res = await fetch('/api/email-templates?page=1&page_size=500', { credentials: 'include' });
        const data = await res.json();
        _emailTemplatesAllData = data.items || [];
        _emailTemplatesPage = 1;
        _applyEmailTemplatesFilter();
    } catch (e) {
        list.innerHTML = `<div class="error-message">加载失败：${e.message}</div>`;
    }
}

document.getElementById('emailTemplatesSearch').addEventListener('input', () => { _emailTemplatesPage = 1; _applyEmailTemplatesFilter(); });

async function saveEmailTemplate() {
    const name = document.getElementById('etName').value.trim();
    const subject = document.getElementById('etSubject').value.trim();
    const body = document.getElementById('etBody').value.trim();
    const description = document.getElementById('etDescription').value.trim();
    if (!name || !subject || !body) {
        showError('请填写模板名称、主题和正文');
        return;
    }
    const payload = { name, subject, body, description: description || null };
    try {
        let res;
        if (_editingEmailTemplateId) {
            res = await fetch(`/api/email-templates/${_editingEmailTemplateId}`, {
                method: 'PUT', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } else {
            res = await fetch('/api/email-templates', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        }
        if (!res.ok) throw new Error('保存失败');
        showSuccess(_editingEmailTemplateId ? '模板已更新' : '模板已保存');
        closeEmailTemplateModal();
        loadEmailTemplates();
    } catch (e) {
        showError(e.message);
    }
}

async function editEmailTemplate(id) {
    try {
        const res = await fetch('/api/email-templates?page=1&page_size=500', { credentials: 'include' });
        const data = await res.json();
        const templates = data.items || [];
        const t = templates.find(x => x.id === id);
        if (!t) return;
        openEmailTemplateModal(t);
    } catch (e) {
        showError('加载模板失败');
    }
}

async function deleteEmailTemplate(id) {
    showConfirm({
        title: '删除邮件模板',
        message: '确认删除此模板？',
        onConfirm: async () => {
            try {
                const res = await fetch(`/api/email-templates/${id}`, {
                    method: 'DELETE', credentials: 'include',
                });
                if (!res.ok) throw new Error('删除失败');
                showSuccess('已删除');
                loadEmailTemplates();
            } catch (e) {
                showError(e.message);
            }
        }
    });
}

// 模板选择弹窗（供单发/群发使用）
let _emailTemplateSelectorTarget = null; // 'send' | 'bulk'

async function openEmailTemplateSelector(target) {
    _emailTemplateSelectorTarget = target;
    const modal = document.getElementById('emailTemplateSelectorModal');
    const listEl = document.getElementById('emailTemplateSelectorList');
    listEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modal.classList.add('show');
    try {
        const res = await fetch('/api/email-templates?page=1&page_size=500', { credentials: 'include' });
        const data = await res.json();
        const templates = data.items || [];
        if (!templates.length) {
            listEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p>暂无模板，请先在「邮件模板」页面创建</p></div>';
            return;
        }
        listEl.innerHTML = templates.map(t => `
            <div class="template-selector-item" onclick="applyEmailTemplate(${t.id})" style="cursor:pointer;padding:12px 16px;border-bottom:1px solid var(--gray-100);transition:background 0.15s;">
                <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(t.name)}</div>
                ${t.description ? `<div style="font-size:0.8rem;color:var(--gray-400);margin-bottom:4px;">${escapeHtml(t.description)}</div>` : ''}
                <div style="font-size:0.85rem;color:var(--gray-500);">主题：${escapeHtml(t.subject)}</div>
            </div>`).join('');
        listEl.querySelectorAll('.template-selector-item').forEach(el => {
            el.addEventListener('mouseenter', () => el.style.background = 'var(--gray-50)');
            el.addEventListener('mouseleave', () => el.style.background = '');
        });
    } catch (e) {
        listEl.innerHTML = `<div class="error-message">加载失败：${e.message}</div>`;
    }
}

function closeEmailTemplateSelector() {
    document.getElementById('emailTemplateSelectorModal').classList.remove('show');
    _emailTemplateSelectorTarget = null;
}

async function applyEmailTemplate(id) {
    try {
        const res = await fetch('/api/email-templates?page=1&page_size=500', { credentials: 'include' });
        const data = await res.json();
        const templates = data.items || [];
        const t = templates.find(x => x.id === id);
        if (!t) return;

        function fillPlaceholders(text) {
            if (!text) return text;
            const c = _sendSelectedCustomer || {};
            return text
                .replace(/\{\{name\}\}/g, c.name || '{{name}}')
                .replace(/\{\{company\}\}/g, c.company || '{{company}}')
                .replace(/\{\{country\}\}/g, c.country || '{{country}}')
                .replace(/\{\{email\}\}/g, c.email || '{{email}}');
        }

        if (_emailTemplateSelectorTarget === 'send') {
            document.getElementById('sendSubject').value = fillPlaceholders(t.subject);
            if (_quillSend) _quillSend.clipboard.dangerouslyPasteHTML(fillPlaceholders(t.body || ''));
            else document.getElementById('sendBody').value = fillPlaceholders(t.body);
        } else if (_emailTemplateSelectorTarget === 'bulk') {
            document.getElementById('bulkSubject').value = t.subject;
            if (_quillBulk) _quillBulk.clipboard.dangerouslyPasteHTML(t.body || '');
            else document.getElementById('bulkBody').value = t.body;
        }
        closeEmailTemplateSelector();
        showSuccess(`已加载模板「${t.name}」`);
    } catch (e) {
        showError('加载失败');
    }
}

document.getElementById('emailTemplateSelectorClose').addEventListener('click', closeEmailTemplateSelector);
document.getElementById('emailTemplateSelectorModal').addEventListener('click', function(e) {
    if (e.target === this) closeEmailTemplateSelector();
});


// ===== 个人资料 (Profile) =====

const PROFILE_EMOJIS = [
    '👤','👩','👨','👩‍💼','👨‍💼','👩‍💻','👨‍💻','👩‍🏫','👨‍🏫','👩‍🔬',
    '👨‍🔬','🧑‍🚀','👩‍🎨','👨‍🎨','🦸‍♀️','🦸‍♂️','🧑‍💼','🌟','💼','🎯',
    '🌺','🦋','🐼','🦊','🐱','🐶','🦁','🐯','🐻','🐨',
];

let _profileData = {};
let _profileSelectedEmoji = '';
let _profileHasImage = false;   // true = 当前头像是上传的图片

function _setAvatarImage(url) {
    const el = document.getElementById('profileAvatarDisplay');
    el.innerHTML = `<img src="${url}?t=${Date.now()}" alt="avatar">`;
    document.getElementById('profileClearAvatarBtn').style.display = '';
    _profileHasImage = true;
    _profileSelectedEmoji = '';
    // 取消 emoji 选中态
    document.querySelectorAll('.profile-emoji-btn').forEach(b => b.classList.remove('selected'));
}

function _setAvatarEmoji(emoji) {
    const el = document.getElementById('profileAvatarDisplay');
    el.textContent = emoji;
    document.getElementById('profileClearAvatarBtn').style.display = 'none';
    _profileHasImage = false;
    _profileSelectedEmoji = emoji;
}

function _renderProfileEmojiGrid(selected) {
    const grid = document.getElementById('profileEmojiGrid');
    grid.innerHTML = PROFILE_EMOJIS.map(e => `
        <button class="profile-emoji-btn${e === selected ? ' selected' : ''}"
            data-emoji="${e}" title="${e}" onclick="_selectProfileEmoji('${e}')">${e}</button>
    `).join('');
}

function _selectProfileEmoji(emoji) {
    _setAvatarEmoji(emoji);
    document.querySelectorAll('.profile-emoji-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.emoji === emoji);
    });
}

function _topbarAvatarHtml(profile) {
    const name = profile.display_name || profile.username;
    if (profile.avatar_url) {
        return `<img src="${profile.avatar_url}?t=${Date.now()}" class="topbar-avatar-img" alt=""> ${name}`;
    }
    const icon = profile.avatar_emoji || (profile.role === 'admin' ? '👑' : '👤');
    return `${icon} ${name}`;
}

async function loadProfile() {
    try {
        const res = await fetch('/api/me/profile', { credentials: 'include' });
        if (!res.ok) throw new Error();
        _profileData = await res.json();
    } catch {
        _profileData = { username: window._currentUser?.username || '', role: window._currentUser?.role || 'user' };
    }

    document.getElementById('profileUsernameDisplay').textContent = _profileData.username || '';
    document.getElementById('profileRoleBadge').textContent =
        _profileData.role === 'admin' ? '👑 管理员' : '👤 用户';
    document.getElementById('profileDisplayName').value = _profileData.display_name || '';
    document.getElementById('profileTitle').value       = _profileData.title || '';
    document.getElementById('profileCompany').value     = _profileData.company || '';
    document.getElementById('profileBio').value         = _profileData.bio || '';

    if (_profileData.avatar_url) {
        _setAvatarImage(_profileData.avatar_url);
        _renderProfileEmojiGrid('');
    } else {
        const emoji = _profileData.avatar_emoji || '👤';
        _setAvatarEmoji(emoji);
        _renderProfileEmojiGrid(emoji);
    }
}

// ── 上传图片 ──
document.getElementById('profileAvatarUploadBtn').addEventListener('click', () => {
    document.getElementById('profileAvatarFile').click();
});

document.getElementById('profileAvatarFile').addEventListener('change', async function () {
    const file = this.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { showError('图片不能超过 3MB'); return; }

    const uploadBtn = document.getElementById('profileAvatarUploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = '上传中…';

    const fd = new FormData();
    fd.append('file', file);
    try {
        const res = await fetch('/api/me/avatar', {
            method: 'POST',
            credentials: 'include',
            body: fd,
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || '上传失败');
        }
        const data = await res.json();
        _profileData.avatar_url   = data.avatar_url;
        _profileData.avatar_emoji = null;
        _setAvatarImage(data.avatar_url);
        _renderProfileEmojiGrid('');
        // 同步顶栏
        document.getElementById('topbarUsername').innerHTML = _topbarAvatarHtml(_profileData);
        showSuccess('头像已更新');
    } catch (e) {
        showError(e.message || '上传失败');
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📷 上传图片';
        this.value = '';
    }
});

// ── 移除图片头像 ──
document.getElementById('profileClearAvatarBtn').addEventListener('click', () => {
    showConfirm({
        title: '移除图片头像',
        message: '移除图片头像，切换回表情头像？',
        danger: false,
        confirmText: '确认移除',
        onConfirm: async () => {
            try {
                await fetch('/api/me/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ avatar_url: null, avatar_emoji: '👤' }),
                });
                _profileData.avatar_url = null;
                _profileData.avatar_emoji = '👤';
                _setAvatarEmoji('👤');
                _renderProfileEmojiGrid('👤');
                document.getElementById('topbarUsername').innerHTML = _topbarAvatarHtml(_profileData);
                showSuccess('已移除图片头像');
            } catch {
                showError('操作失败');
            }
        }
    });
});

// ── 保存资料 ──
document.getElementById('profileSaveBtn').addEventListener('click', async () => {
    const btn = document.getElementById('profileSaveBtn');
    btn.disabled = true;
    btn.textContent = '保存中…';
    try {
        const body = {
            avatar_emoji: _profileHasImage ? null : (_profileSelectedEmoji || null),
            display_name: document.getElementById('profileDisplayName').value.trim() || null,
            title:        document.getElementById('profileTitle').value.trim() || null,
            company:      document.getElementById('profileCompany').value.trim() || null,
            bio:          document.getElementById('profileBio').value.trim() || null,
        };
        const res = await fetch('/api/me/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error();
        _profileData = { ..._profileData, ...await res.json() };
        document.getElementById('topbarUsername').innerHTML = _topbarAvatarHtml(_profileData);
        showSuccess('资料已保存');
    } catch {
        showError('保存失败，请重试');
    } finally {
        btn.disabled = false;
        btn.textContent = '保存资料';
    }
});

// ============================================================
// ⏳  时光机 — 共用工具 (Shared helpers)
// ============================================================

// Emoji picker click handler — called via onclick="setEmoji('fieldId', el)"
function setEmoji(fieldId, el) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    if (!el) {
        // clear button
        input.value = '';
        const grid = input.closest('.tm-emoji-picker')?.querySelector('.tm-emoji-grid');
        if (grid) grid.querySelectorAll('.tm-emoji-opt').forEach(s => s.classList.remove('selected'));
        return;
    }
    const v = el.textContent.trim();
    input.value = v;
    el.closest('.tm-emoji-grid').querySelectorAll('.tm-emoji-opt').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
}

// Sync emoji picker highlight to match input value
function _syncEmojiPicker(fieldId) {
    const input = document.getElementById(fieldId);
    if (!input) return;
    const val = input.value.trim();
    const grid = input.closest('.tm-emoji-picker')?.querySelector('.tm-emoji-grid');
    if (!grid) return;
    grid.querySelectorAll('.tm-emoji-opt').forEach(s => {
        s.classList.toggle('selected', val !== '' && s.textContent.trim() === val);
    });
}

// Type-grid initializer: wires click events (safe to call multiple times)
function _initTypeGrid(gridId, hiddenId) {
    const grid = document.getElementById(gridId);
    if (!grid || grid.dataset.wired) return;
    grid.dataset.wired = '1';
    grid.querySelectorAll('.tm-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            grid.querySelectorAll('.tm-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(hiddenId).value = btn.dataset.value;
        });
    });
}

// Set active type-grid button and sync hidden input
function _setTypeGrid(gridId, hiddenId, value) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.querySelectorAll('.tm-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === value);
    });
    document.getElementById(hiddenId).value = value;
}

// ============================================================
// ⏳  时光机 — 纪念日 (Anniversaries)
// ============================================================

let _annPage = 1;
const _annPageSize = 20;
let _annSearchTimer = null;

// 计算天数信息对象，区分有年份/无年份两种模式
// solarDate：农历条目预换算好的公历日期（YYYY-MM-DD），非农历时传空
function _annCalc(dateStr, solarDate) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const effectiveDate = solarDate || dateStr;
    const hasYear = effectiveDate.length === 10;
    const md = hasYear ? effectiveDate.slice(5) : effectiveDate;

    if (hasYear) {
        // 有年份：从那天到今天过了多少天
        const origin = new Date(effectiveDate); origin.setHours(0, 0, 0, 0);
        const totalDays = Math.round((today - origin) / 86400000);
        // 计算周年：今年这天 vs 今天
        const thisYearDate = new Date(`${today.getFullYear()}-${md}`);
        thisYearDate.setHours(0, 0, 0, 0);
        const originYear = parseInt(effectiveDate.slice(0, 4));
        let anniversary = today.getFullYear() - originYear;
        // 今年这天还没到，周年数是上一年
        if (thisYearDate > today) anniversary--;
        return { hasYear: true, totalDays, anniversary };
    } else {
        // 无年份：每年循环，下次还有多少天
        let target = new Date(`${today.getFullYear()}-${md}`);
        target.setHours(0, 0, 0, 0);
        if (target < today) target = new Date(`${today.getFullYear() + 1}-${md}`);
        const days = Math.round((target - today) / 86400000);
        return { hasYear: false, days };
    }
}

const _ANN_TYPE_MAP = {
    anniversary: { label: '在一起', emoji: '💕' },
    proposal:    { label: '求婚',   emoji: '💍' },
    wedding:     { label: '结婚',   emoji: '👰' },
    birthday:    { label: '生日',   emoji: '🎂' },
    firstmeet:   { label: '初次见面', emoji: '🌸' },
    travel:      { label: '旅行',   emoji: '✈️' },
    holiday:     { label: '节日',   emoji: '🎉' },
};
function _annTypeLabel(t) { return (_ANN_TYPE_MAP[t] || { label: t }).label; }
function _annTypeEmoji(t) { return (_ANN_TYPE_MAP[t] || { emoji: '⭐' }).emoji; }

// 公历日期格式化：YYYY-MM-DD 或 MM-DD → "X年X月X日" / "X月X日"
function _annDateLabel(d) {
    const md = d.length === 5 ? d : d.slice(5);
    const [m, day] = md.split('-');
    const yearPart = d.length > 5 ? `${d.slice(0,4)}年` : '';
    return `${yearPart}${parseInt(m)}月${parseInt(day)}日`;
}

// 农历日期格式化：MM-DD 或 YYYY-MM-DD → "农历X月X日" / "农历X年X月X日"
function _lunarDateLabel(d) {
    const md = d.length === 5 ? d : d.slice(5);
    const [m, day] = md.split('-');
    const yearPart = d.length > 5 ? `${d.slice(0,4)}年` : '';
    return `农历${yearPart}${parseInt(m)}月${parseInt(day)}日`;
}

// 换算农历条目（返回带 _solarDate 字段的新对象，失败则原样返回）
async function _enrichLunar(a) {
    if (!a.is_lunar) return a;
    const md = a.date.length === 10 ? a.date.slice(5) : a.date;
    const [m, d] = md.split('-');
    try {
        const r = await fetch(`/api/timemachine/lunar-to-solar?lunar_month=${parseInt(m)}&lunar_day=${parseInt(d)}`, { credentials: 'include' });
        if (r.ok) { const dt = await r.json(); return { ...a, _solarDate: dt.solar }; }
    } catch {}
    return a;
}

// 农历/公历切换（silent=true 时不触发 hint 更新）
function _switchAnnCalendar(mode, silent) {
    const isLunar = mode === 'lunar';
    document.getElementById('annIsLunar').value = isLunar ? '1' : '0';
    document.getElementById('annCalSolar')?.classList.toggle('active', !isLunar);
    document.getElementById('annCalLunar')?.classList.toggle('active', isLunar);
    document.getElementById('annLeapRow') && (document.getElementById('annLeapRow').style.display = isLunar ? '' : 'none');
    if (!silent) _updateAnnDateHint();
}

// 初始化年份下拉（当年到50年前）
function _initAnnYearSelect() {
    const sel = document.getElementById('annYear');
    if (!sel || sel.options.length > 1) return;
    const thisYear = new Date().getFullYear();
    for (let y = thisYear; y <= 2099; y++) {
        const opt = Object.assign(document.createElement('option'), { value: y, textContent: `${y}年` });
        if (y === thisYear) opt.selected = true;
        sel.appendChild(opt);
    }
}

// 根据月份动态填充日期选项（考虑大小月，2月按29天）
function _updateAnnDayOptions(month) {
    const sel = document.getElementById('annDay');
    if (!sel) return;
    const maxDay = month === '02' ? 29
        : ['04','06','09','11'].includes(month) ? 30 : 31;
    const curVal = sel.value;
    sel.innerHTML = '<option value="">日</option>' +
        Array.from({length: maxDay}, (_, i) => {
            const d = String(i + 1).padStart(2, '0');
            return `<option value="${d}">${i + 1}日</option>`;
        }).join('');
    if (curVal && parseInt(curVal) <= maxDay) sel.value = curVal;
}

function _updateAnnDateHint() {
    const hint = document.getElementById('annDateHint');
    if (!hint) return;
    const isLunar = document.getElementById('annIsLunar')?.value === '1';
    const year  = document.getElementById('annYear')?.value;
    const month = document.getElementById('annMonth')?.value;
    const day   = document.getElementById('annDay')?.value;
    if (!month || !day) { hint.textContent = ''; return; }

    if (isLunar) {
        if (!year) {
            // 无年份农历：查今年对应公历
            const isLeap = document.getElementById('annIsLeapMonth')?.checked || false;
            hint.textContent = '换算中…';
            fetch(`/api/timemachine/lunar-to-solar?lunar_month=${parseInt(month)}&lunar_day=${parseInt(day)}&is_leap_month=${isLeap}`, { credentials: 'include' })
                .then(r => r.json()).then(d => {
                    if (d.solar) hint.textContent = `→ 今年公历 ${d.solar.slice(5).replace('-','月')}日 · 每年循环`;
                }).catch(() => { hint.textContent = '农历换算失败'; });
        } else {
            hint.textContent = '农历 · 每年自动换算为当年公历日期';
        }
        return;
    }

    // 公历模式（原逻辑）
    if (!year) { hint.textContent = '不填年份 → 每年循环倒计时'; return; }
    const dateStr = `${year}-${month}-${day}`;
    const calc = _annCalc(dateStr);
    if (calc.totalDays < 0) { hint.textContent = '日期在未来'; return; }
    if (calc.totalDays === 0) { hint.textContent = '就是今天！🎉'; return; }
    if (calc.anniversary > 0) {
        hint.textContent = `已过去 ${calc.totalDays} 天 · 第 ${calc.anniversary} 周年 🥂`;
    } else {
        hint.textContent = `已过去 ${calc.totalDays} 天`;
    }
}

document.getElementById('annMonth')?.addEventListener('change', function() {
    _updateAnnDayOptions(this.value);
    _updateAnnDateHint();
});
document.getElementById('annDay')?.addEventListener('change', _updateAnnDateHint);
document.getElementById('annYear')?.addEventListener('change', _updateAnnDateHint);
document.getElementById('annIsLeapMonth')?.addEventListener('change', _updateAnnDateHint);

// ---- 心情选择 ----
(function() {
    const row = document.getElementById('annMoodRow');
    if (!row) return;
    row.addEventListener('click', e => {
        const btn = e.target.closest('.ann-mood-btn');
        if (!btn) return;
        const already = btn.classList.contains('selected');
        row.querySelectorAll('.ann-mood-btn').forEach(b => b.classList.remove('selected'));
        if (!already) {
            btn.classList.add('selected');
            document.getElementById('annMood').value = btn.dataset.mood;
        } else {
            document.getElementById('annMood').value = '';
        }
    });
})();

// ---- 富文本备注 ----
const _annNoteEl = () => document.getElementById('annNote');
const _ANN_NOTE_MAX = 500;

function _annNoteText() {
    return _annNoteEl()?.innerText?.trim() || '';
}
function _annNoteHtml() {
    return _annNoteEl()?.innerHTML?.trim() || '';
}
function _setAnnNote(html) {
    const el = _annNoteEl();
    if (!el) return;
    el.innerHTML = html || '';
    _updateAnnNoteCount();
}
function _updateAnnNoteCount() {
    const len = _annNoteText().length;
    const counter = document.getElementById('annNoteCount');
    if (!counter) return;
    counter.textContent = len;
    counter.closest('.ann-note-count')?.classList.toggle('warn', len > _ANN_NOTE_MAX);
}
document.getElementById('annNote')?.addEventListener('input', _updateAnnNoteCount);

// 工具栏按钮
document.querySelector('.ann-note-toolbar')?.addEventListener('mousedown', e => {
    e.preventDefault(); // 阻止编辑器失焦
});
document.querySelector('.ann-note-toolbar')?.addEventListener('click', e => {
    const btn = e.target.closest('.ann-tb-btn');
    if (!btn) return;
    _annNoteEl()?.focus();
    document.execCommand(btn.dataset.cmd, false, null);
});

// ---- 图片上传（仅编辑模式，已保存的记录） ----
let _annCurrentId = null;
let _annCurrentImages = [];

function _renderAnnImagesPreview(images) {
    const preview = document.getElementById('annImagesPreview');
    if (!preview) return;
    _annCurrentImages = images || [];
    preview.innerHTML = _annCurrentImages.map(url =>
        `<div class="ann-img-thumb">
            <img src="${url}" onclick="openAnnLightbox('${url}')">
            <button type="button" class="ann-img-del" onclick="deleteAnnImage('${url}')">✕</button>
        </div>`
    ).join('');
    // 超过3张隐藏上传按钮
    const label = document.getElementById('annUploadLabel');
    if (label) label.style.display = _annCurrentImages.length >= 3 ? 'none' : '';
}

document.getElementById('annImageFile')?.addEventListener('change', async function() {
    if (!_annCurrentId || !this.files[0]) return;
    const btn = document.getElementById('annSaveBtn');
    const label = document.getElementById('annUploadLabel');
    label.textContent = '上传中…';
    const fd = new FormData();
    fd.append('file', this.files[0]);
    try {
        const res = await fetch(`/api/timemachine/anniversaries/${_annCurrentId}/images`, {
            method: 'POST', credentials: 'include', body: fd
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || '上传失败'); }
        const data = await res.json();
        _renderAnnImagesPreview(data.images);
        showSuccess('图片已上传');
    } catch(e) { showError(e.message || '上传失败'); }
    finally { label.textContent = '+ 添加图片'; this.value = ''; }
});

async function deleteAnnImage(url) {
    if (!_annCurrentId) return;
    try {
        const res = await fetch(
            `/api/timemachine/anniversaries/${_annCurrentId}/images?url=${encodeURIComponent(url)}`,
            { method: 'DELETE', credentials: 'include' }
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        _renderAnnImagesPreview(data.images);
    } catch { showError('删除失败'); }
}

function openAnnLightbox(url) {
    const lb = document.createElement('div');
    lb.className = 'ann-lightbox';
    lb.innerHTML = `<img src="${url}">`;
    lb.onclick = () => lb.remove();
    document.body.appendChild(lb);
}

// 构建「年年都要过」区块（无年份的纪念日，按到期天数升序全量展示）
async function _buildAnnYearlySection(items) {
    const section = document.getElementById('annYearlySection');
    const container = document.getElementById('annYearlyCards');
    if (!section || !container) return;

    // 过滤出无年份的条目（日期格式 MM-DD，5字符）；农历条目也是 MM-DD 格式
    const noYearItems = items.filter(a => a.date.length === 5);
    if (!noYearItems.length) { section.style.display = 'none'; return; }

    // 农历条目换算今年公历
    const enriched = await Promise.all(noYearItems.map(_enrichLunar));

    const yearlyItems = enriched.map(a => {
        // 倒计时用公历日期：农历用换算结果，公历用原始
        const solarMD = a._solarDate ? a._solarDate.slice(5) : a.date;
        const calc = _annCalc(solarMD);
        return { ...a, daysToNext: calc.days };
    }).sort((a, b) => a.daysToNext - b.daysToNext);

    section.style.display = '';
    container.innerHTML = yearlyItems.map(a => {
        const emoji = a.emoji || _annTypeEmoji(a.type);
        const days = a.daysToNext;
        const pct = Math.round((1 - days / 365) * 100);

        // 日期显示：农历条目 → 两行；公历条目 → 一行
        let dateDisplay;
        if (a.is_lunar && a._solarDate) {
            const [, sm, sd] = a._solarDate.split('-');
            dateDisplay = `${_lunarDateLabel(a.date)} → 公历 ${parseInt(sm)}月${parseInt(sd)}日`;
        } else {
            dateDisplay = _annDateLabel(a.date);
        }

        let daysLabel, urgencyClass;
        if (days === 0)      { daysLabel = '今天就是！🎉'; urgencyClass = 'ann-yc-today'; }
        else if (days <= 7)  { daysLabel = `还有 <b>${days}</b> 天`; urgencyClass = 'ann-yc-urgent'; }
        else if (days <= 30) { daysLabel = `还有 <b>${days}</b> 天`; urgencyClass = 'ann-yc-near'; }
        else                 { daysLabel = `还有 <b>${days}</b> 天`; urgencyClass = ''; }

        const lunarBadge = a.is_lunar ? '<span style="font-size:0.72rem;color:var(--primary);background:#f0f0ff;padding:1px 5px;border-radius:4px;margin-left:4px;">农历</span>' : '';

        return `<div class="ann-yc ${urgencyClass}" onclick="openAnnModal(${a.id})">
            <div class="ann-yc-top">
                <span class="ann-yc-emoji">${emoji}</span>
                <div class="ann-yc-info">
                    <div class="ann-yc-title">${escapeHtml(a.title)}${lunarBadge}</div>
                    <div class="ann-yc-date">${dateDisplay} &nbsp;·&nbsp; ${_annTypeLabel(a.type)}</div>
                </div>
            </div>
            <div class="ann-yc-days">${daysLabel}</div>
            <div class="ann-yc-bar-wrap">
                <div class="ann-yc-bar-fill" style="width:${pct}%"></div>
            </div>
        </div>`;
    }).join('');
}

async function loadAnniversaries(page) {
    _annPage = page || _annPage;
    const search = document.getElementById('annSearch')?.value.trim() || '';
    try {
        const res = await fetch(`/api/timemachine/anniversaries?page=${_annPage}&page_size=${_annPageSize}&search=${encodeURIComponent(search)}`, { credentials: 'include' });
        if (!res.ok) throw new Error();
        const data = await res.json();
        // 始终拉全量数据用于构建「年年都要过」区块（不受分页/搜索影响）
        fetch(`/api/timemachine/anniversaries?page=1&page_size=200`, { credentials: 'include' })
            .then(r => r.json()).then(all => _buildAnnYearlySection(all.items)).catch(() => {});
        await _renderAnnList(data);
    } catch {
        showError('加载纪念日失败');
    }
}

async function _renderAnnList(data) {
    const info = document.getElementById('annInfo');
    const container = document.getElementById('annList');
    const pag = document.getElementById('annPagination');
    if (!container) return;
    info.textContent = `共 ${data.total} 条`;
    if (!data.items.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">💕</div><p>还没有纪念日，快去添加第一个吧~</p></div>';
        pag.innerHTML = '';
        return;
    }

    // 农历条目换算今年公历
    const enriched = await Promise.all(data.items.map(_enrichLunar));

    container.innerHTML = enriched.map(a => {
        const emoji = a.emoji || _annTypeEmoji(a.type);
        // 倒计时：农历用换算后的公历 MM-DD，公历直接用 date
        const solarRef = a.is_lunar && a._solarDate ? a._solarDate.slice(5) : a.date;
        const calc = _annCalc(solarRef);
        const moodBadge = a.mood ? `<span class="ann-row-mood">${a.mood}</span>` : '';
        const lunarBadge = a.is_lunar ? `<span style="font-size:0.72rem;color:var(--primary);background:#f0f0ff;padding:1px 5px;border-radius:4px;margin-left:4px;">农历</span>` : '';
        const imgs = a.images ? JSON.parse(a.images) : [];
        const imgHtml = imgs.length ? `<div class="ann-row-images">${imgs.map(u =>
            `<img class="ann-row-img" src="${u}" onclick="openAnnLightbox('${u}')">`
        ).join('')}</div>` : '';

        let daysTag = '', yearText = '';
        if (calc.hasYear) {
            daysTag = calc.totalDays === 0
                ? `<span class="ann-tag ann-today">今天 🎉</span>`
                : `<span class="ann-tag ann-past">已过 ${calc.totalDays} 天</span>`;
            if (calc.anniversary > 0) yearText = `&nbsp;·&nbsp; 第 ${calc.anniversary} 周年`;
        } else {
            daysTag = calc.days === 0
                ? `<span class="ann-tag ann-today">今天 🎉</span>`
                : `<span class="ann-tag ann-upcoming">还有 ${calc.days} 天</span>`;
        }

        // 日期显示：农历条目 = "农历X月X日 → 公历M月D日"；公历 = "X月X日"
        let dateLine;
        if (a.is_lunar && a._solarDate) {
            const [, sm, sd] = a._solarDate.split('-');
            dateLine = `${_lunarDateLabel(a.date)} → 公历 ${parseInt(sm)}月${parseInt(sd)}日`;
        } else {
            dateLine = _annDateLabel(a.date);
        }

        const noteHtml = a.note ? `<div class="ann-row-note" style="white-space:normal;overflow:visible;max-height:none;">${a.note}</div>` : '';
        return `<div class="ann-row">
            <div class="ann-row-left">
                <span class="ann-row-emoji">${emoji}</span>
                <div class="ann-row-info">
                    <div class="ann-row-title">${escapeHtml(a.title)} ${moodBadge}${lunarBadge}</div>
                    <div class="ann-row-meta">${dateLine} &nbsp;·&nbsp; ${_annTypeLabel(a.type)}${yearText}</div>
                    ${noteHtml}
                    ${imgHtml}
                </div>
            </div>
            <div class="ann-row-right">
                ${daysTag}
                <button class="btn btn-small btn-secondary" onclick="openAnnModal(${a.id})">编辑</button>
                <button class="btn btn-small btn-danger" onclick="deleteAnn(${a.id})">删除</button>
            </div>
        </div>`;
    }).join('');
    _renderAnnPagination(data.total_pages);
    const listHeader = document.getElementById('annListHeader');
    if (listHeader) listHeader.style.display = data.items.length ? '' : 'none';
}


function _renderAnnPagination(pages) {
    const el = document.getElementById('annPagination');
    if (pages <= 1) { el.innerHTML = ''; return; }
    const cur = _annPage;
    const range = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || (i >= cur - 2 && i <= cur + 2)) range.push(i);
        else if (range[range.length-1] !== '…') range.push('…');
    }
    let html = `<button class="page-btn" ${cur===1?'disabled':''} onclick="loadAnniversaries(${cur-1})">‹</button>`;
    range.forEach(p => {
        if (p === '…') html += `<span class="page-btn" style="cursor:default;border:none;opacity:.5">…</span>`;
        else html += `<button class="page-btn${p===cur?' active':''}" onclick="loadAnniversaries(${p})">${p}</button>`;
    });
    html += `<button class="page-btn" ${cur===pages?'disabled':''} onclick="loadAnniversaries(${cur+1})">›</button>`;
    el.innerHTML = html;
}

function openAnnModal(id) {
    const modal = document.getElementById('annModal');
    document.getElementById('annForm').reset();
    document.getElementById('annId').value = '';
    document.getElementById('annModalTitle').textContent = id ? '编辑纪念日' : '添加纪念日';
    // Wire type-grid once
    _initTypeGrid('annTypeGrid', 'annType');
    // 自定义类型名称框：每次类型切换时控制显隐
    const annTypeGrid = document.getElementById('annTypeGrid');
    if (!annTypeGrid.dataset.customWired) {
        annTypeGrid.dataset.customWired = '1';
        annTypeGrid.addEventListener('click', e => {
            const btn = e.target.closest('.tm-type-btn');
            if (!btn) return;
            const isCustom = btn.dataset.value === 'custom';
            document.getElementById('annCustomTypeGroup').style.display = isCustom ? '' : 'none';
            if (isCustom) document.getElementById('annCustomTypeLabel').focus();
        });
    }
    // Reset to default type
    _setTypeGrid('annTypeGrid', 'annType', 'anniversary');
    document.getElementById('annCustomTypeGroup').style.display = 'none';
    document.getElementById('annCustomTypeLabel').value = '';
    // Reset emoji picker
    document.getElementById('annEmoji').value = '';
    _syncEmojiPicker('annEmoji');
    // Reset month/day/year selects + 农历重置
    _initAnnYearSelect();
    document.getElementById('annYear').value = '';
    document.getElementById('annMonth').value = '';
    _updateAnnDayOptions('');
    document.getElementById('annDate').value = '';
    document.getElementById('annIsLunar').value = '0';
    document.getElementById('annIsLeapMonth') && (document.getElementById('annIsLeapMonth').checked = false);
    document.getElementById('annLeapRow') && (document.getElementById('annLeapRow').style.display = 'none');
    _switchAnnCalendar('solar', true);
    _updateAnnDateHint();
    // Reset mood
    document.getElementById('annMood').value = '';
    document.getElementById('annMoodRow')?.querySelectorAll('.ann-mood-btn').forEach(b => b.classList.remove('selected'));
    // Reset note
    _setAnnNote('');
    // Reset images (hide for new record)
    _annCurrentId = null;
    _renderAnnImagesPreview([]);
    document.getElementById('annImagesGroup').style.display = 'none';
    if (id) {
        fetch(`/api/timemachine/anniversaries/${id}`, { credentials: 'include' })
            .then(r => r.json()).then(rec => {
                document.getElementById('annId').value = rec.id;
                document.getElementById('annTitle').value = rec.title;
                // 农历/公历回填
                const isLunar = rec.is_lunar === 1;
                _switchAnnCalendar(isLunar ? 'lunar' : 'solar', true);
                document.getElementById('annIsLunar').value = isLunar ? '1' : '0';
                const hasYear = rec.date.length === 10;
                const md = hasYear ? rec.date.slice(5) : rec.date;
                const [m, d] = md.split('-');
                if (hasYear) document.getElementById('annYear').value = rec.date.slice(0, 4);
                _updateAnnDayOptions(m);
                document.getElementById('annMonth').value = m;
                document.getElementById('annDay').value = d;
                document.getElementById('annDate').value = rec.date;
                _updateAnnDateHint();
                // 类型回填：内置类型直接选中，自定义文字则选 custom 按钮并填入输入框
                const recType = rec.type || 'anniversary';
                const isBuiltin = !!_ANN_TYPE_MAP[recType];
                if (isBuiltin) {
                    _setTypeGrid('annTypeGrid', 'annType', recType);
                    document.getElementById('annCustomTypeGroup').style.display = 'none';
                    document.getElementById('annCustomTypeLabel').value = '';
                } else {
                    _setTypeGrid('annTypeGrid', 'annType', 'custom');
                    document.getElementById('annCustomTypeGroup').style.display = '';
                    document.getElementById('annCustomTypeLabel').value = recType;
                }
                document.getElementById('annEmoji').value = rec.emoji || '';
                _syncEmojiPicker('annEmoji');
                // 心情
                const mood = rec.mood || '';
                document.getElementById('annMood').value = mood;
                document.getElementById('annMoodRow')?.querySelectorAll('.ann-mood-btn').forEach(b => {
                    b.classList.toggle('selected', b.dataset.mood === mood);
                });
                // 备注富文本
                _setAnnNote(rec.note || '');
                // 图片（已保存记录才显示）
                _annCurrentId = rec.id;
                const imgs = rec.images ? JSON.parse(rec.images) : [];
                _renderAnnImagesPreview(imgs);
                document.getElementById('annImagesGroup').style.display = '';
            }).catch(() => {});
    }
    modal.classList.add('show');
}

document.getElementById('annModalClose')?.addEventListener('click', () => document.getElementById('annModal').classList.remove('show'));
document.getElementById('annCancelBtn')?.addEventListener('click', () => document.getElementById('annModal').classList.remove('show'));
document.getElementById('annModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });

document.getElementById('annForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('annSaveBtn');
    btn.disabled = true;
    const id    = document.getElementById('annId').value;
    const year  = document.getElementById('annYear').value.trim();
    const month = document.getElementById('annMonth').value;
    const day   = document.getElementById('annDay').value;
    if (!month || !day) { showError('请选择月份和日期'); btn.disabled = false; return; }
    const date = year ? `${year}-${month}-${day}` : `${month}-${day}`;
    const noteHtml = _annNoteHtml();
    const noteText = _annNoteText();
    if (noteText.length > _ANN_NOTE_MAX) { showError(`备注最多 ${_ANN_NOTE_MAX} 字`); btn.disabled = false; return; }
    // 类型：custom 时取输入框文字，空则提示
    let annTypeVal = document.getElementById('annType').value;
    if (annTypeVal === 'custom') {
        const customLabel = document.getElementById('annCustomTypeLabel').value.trim();
        if (!customLabel) { showError('请输入自定义类型名称'); btn.disabled = false; return; }
        annTypeVal = customLabel;
    }
    const body = {
        title: document.getElementById('annTitle').value.trim(),
        date,
        type:     annTypeVal,
        is_lunar: parseInt(document.getElementById('annIsLunar').value) || 0,
        emoji: document.getElementById('annEmoji').value.trim() || null,
        mood:  document.getElementById('annMood').value || null,
        note:  noteHtml || null,
    };
    try {
        const url = id ? `/api/timemachine/anniversaries/${id}` : '/api/timemachine/anniversaries';
        const method = id ? 'PATCH' : 'POST';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        if (!res.ok) throw new Error();
        const saved = await res.json();
        showSuccess(id ? '已更新' : '已添加');
        loadAnniversaries();
        document.getElementById('annModal').classList.remove('show');
    } catch {
        showError('保存失败，请重试');
    } finally {
        btn.disabled = false;
    }
});

async function deleteAnn(id) {
    showConfirm({ title: '删除纪念日', message: '确定要删除这条纪念日吗？', onConfirm: async () => {
        try {
            const res = await fetch(`/api/timemachine/anniversaries/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error();
            showSuccess('已删除');
            loadAnniversaries();
        } catch { showError('删除失败'); }
    }});
}

document.getElementById('annSearch')?.addEventListener('input', () => {
    clearTimeout(_annSearchTimer);
    _annSearchTimer = setTimeout(() => loadAnniversaries(1), 400);
});


// ============================================================
// 📅  时光机 — 日程安排 (Schedules)
// ============================================================

let _schedPage = 1;
const _schedPageSize = 20;
let _schedSearchTimer = null;

function _schedTypeLabel(t) {
    return { date: '约会', travel: '旅行', medical: '看诊', document: '证件办理',
             shopping: '购物', dining: '餐厅', movie: '电影/演出',
             errand: '事务', other: '其他' }[t] || t;
}

// ---- 日程日期/时间下拉初始化工具 ----
function _initSchedYearSelect(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const cur = new Date().getFullYear();
    el.innerHTML = `<option value="">年</option>` +
        Array.from({ length: 6 }, (_, i) => cur - 1 + i)
             .map(y => `<option value="${y}">${y}年</option>`).join('');
}
function _initSchedDayOptions(elId, month, year) {
    const el = document.getElementById(elId);
    if (!el) return;
    const cur = el.value;
    const days = (month && year)
        ? new Date(+year, +month, 0).getDate()
        : (month ? new Date(2000, +month, 0).getDate() : 31);
    el.innerHTML = `<option value="">日</option>` +
        Array.from({ length: days }, (_, i) => {
            const d = String(i + 1).padStart(2, '0');
            return `<option value="${d}">${i + 1}日</option>`;
        }).join('');
    if (cur) el.value = cur;
}
function _initSchedHourOptions() {
    const el = document.getElementById('schedHour');
    if (!el || el.children.length > 1) return;
    el.innerHTML = `<option value="">时</option>` +
        Array.from({ length: 24 }, (_, i) => {
            const h = String(i).padStart(2, '0');
            return `<option value="${h}">${i}时</option>`;
        }).join('');
}
function _initSchedMinuteOptions() {
    const el = document.getElementById('schedMinute');
    if (!el || el.children.length > 1) return;
    el.innerHTML = `<option value="">分</option>` +
        [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => {
            const s = String(m).padStart(2, '0');
            return `<option value="${s}">${s}分</option>`;
        }).join('');
}
// 联动：月/年变化时刷新日选项
function _wireSchedDateSelects(yearId, monthId, dayId) {
    const onChg = () => _initSchedDayOptions(dayId,
        document.getElementById(monthId).value,
        document.getElementById(yearId).value);
    document.getElementById(yearId)?.addEventListener('change', onChg);
    document.getElementById(monthId)?.addEventListener('change', onChg);
}
// 从 "YYYY-MM-DD" 回填三个 select
function _setSchedDateSelects(yearId, monthId, dayId, dateStr) {
    _initSchedYearSelect(yearId);
    if (!dateStr) {
        document.getElementById(yearId).value = '';
        document.getElementById(monthId).value = '';
        _initSchedDayOptions(dayId, '', '');
        document.getElementById(dayId).value = '';
        return;
    }
    const [y, m, d] = dateStr.split('-');
    document.getElementById(yearId).value = y;
    document.getElementById(monthId).value = m;
    _initSchedDayOptions(dayId, m, y);
    document.getElementById(dayId).value = d;
}
// 从三个 select 读取 "YYYY-MM-DD"，缺年或月日则返回 ''
function _getSchedDateValue(yearId, monthId, dayId) {
    const y = document.getElementById(yearId)?.value;
    const m = document.getElementById(monthId)?.value;
    const d = document.getElementById(dayId)?.value;
    if (!y || !m || !d) return '';
    return `${y}-${m}-${d}`;
}
// 从时间 select 读取 "HH:MM"，任一空则返回 ''
function _getSchedTimeValue() {
    const h = document.getElementById('schedHour')?.value;
    const min = document.getElementById('schedMinute')?.value;
    if (!h || !min) return '';
    return `${h}:${min}`;
}


const _WEEKDAYS = ['周日','周一','周二','周三','周四','周五','周六'];
function _schedDateLabel(dateStr, timeStr) {
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(dateStr); d.setHours(0,0,0,0);
    const diff = Math.round((d - today) / 86400000);
    const [m, day] = [d.getMonth()+1, d.getDate()];
    let rel = '';
    if (diff === 0)      rel = '今天';
    else if (diff === 1) rel = '明天';
    else if (diff === 2) rel = '后天';
    else if (diff > 0 && diff <= 6) rel = _WEEKDAYS[d.getDay()];
    else                 rel = `${m}月${day}日`;
    const dateLabel = diff >= 0 && diff <= 2 ? `${rel} ${m}月${day}日` : rel;
    const weekLabel = (diff > 2 && diff <= 6) ? ` ${m}月${day}日` : '';
    const full = `${dateLabel}${weekLabel}`;
    return timeStr ? `${full} ${timeStr}` : full;
}

// 富文本辅助（复用 ann-note-editor 样式，id 前缀不同）
const _schedNoteEl = () => document.getElementById('schedNote');
const _SCHED_NOTE_MAX = 500;
function _schedNoteText() { return _schedNoteEl()?.innerText?.trim() || ''; }
function _schedNoteHtml() { return _schedNoteEl()?.innerHTML?.trim() || ''; }
function _setSchedNote(html) {
    const el = _schedNoteEl(); if (!el) return;
    el.innerHTML = html || '';
    _updateSchedNoteCount();
}
function _updateSchedNoteCount() {
    const len = _schedNoteText().length;
    const counter = document.getElementById('schedNoteCount');
    if (!counter) return;
    counter.textContent = len;
    counter.closest('.ann-note-count')?.classList.toggle('warn', len > _SCHED_NOTE_MAX);
}
document.getElementById('schedNote')?.addEventListener('input', _updateSchedNoteCount);

// 备注工具栏（schedModal 里的 ann-note-toolbar）
document.getElementById('schedModal')?.querySelector('.ann-note-toolbar')
    ?.addEventListener('mousedown', e => { e.preventDefault(); });
document.getElementById('schedModal')?.querySelector('.ann-note-toolbar')
    ?.addEventListener('click', e => {
        const btn = e.target.closest('.ann-tb-btn');
        if (!btn) return;
        _schedNoteEl()?.focus();
        document.execCommand(btn.dataset.cmd, false, null);
    });

// ===== 日程图片 =====
let _schedCurrentId = null;
let _schedCurrentImages = [];

function _renderSchedImagesPreview(images) {
    const preview = document.getElementById('schedImagesPreview');
    if (!preview) return;
    _schedCurrentImages = images || [];
    preview.innerHTML = _schedCurrentImages.map(url =>
        `<div class="ann-img-thumb">
            <img src="${url}" onclick="openAnnLightbox('${url}')">
            <button type="button" class="ann-img-del" onclick="deleteSchedImage('${url}')">✕</button>
        </div>`
    ).join('');
    const label = document.getElementById('schedUploadLabel');
    if (label) label.style.display = _schedCurrentImages.length >= 5 ? 'none' : '';
}

document.getElementById('schedImageFile')?.addEventListener('change', async function() {
    if (!_schedCurrentId || !this.files[0]) return;
    const label = document.getElementById('schedUploadLabel');
    label.textContent = '上传中…';
    const fd = new FormData();
    fd.append('file', this.files[0]);
    try {
        const res = await fetch(`/api/timemachine/schedules/${_schedCurrentId}/images`, {
            method: 'POST', credentials: 'include', body: fd
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || '上传失败'); }
        const data = await res.json();
        _renderSchedImagesPreview(data.images);
        showSuccess('图片已上传');
    } catch(e) { showError(e.message || '上传失败'); }
    finally { label.textContent = '+ 添加图片'; this.value = ''; }
});

async function deleteSchedImage(url) {
    if (!_schedCurrentId) return;
    try {
        const res = await fetch(
            `/api/timemachine/schedules/${_schedCurrentId}/images?url=${encodeURIComponent(url)}`,
            { method: 'DELETE', credentials: 'include' }
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        _renderSchedImagesPreview(data.images);
    } catch { showError('删除失败'); }
}


async function schedMarkDone(id) {
    try {
        const res = await fetch(`/api/timemachine/schedules/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: 'done' })
        });
        if (!res.ok) throw new Error();
        showSuccess('已标记完成 ✅');
        loadSchedules();
    } catch { showError('操作失败'); }
}

async function loadSchedules(page) {
    _schedPage = page || _schedPage;
    const search = document.getElementById('schedSearch')?.value.trim() || '';
    const statusFilter = document.getElementById('schedStatusFilter')?.value || '';
    try {
        const res = await fetch(
            `/api/timemachine/schedules?page=${_schedPage}&page_size=${_schedPageSize}&search=${encodeURIComponent(search)}&status_filter=${statusFilter}`,
            { credentials: 'include' }
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        _renderSchedList(data);
    } catch {
        showError('加载日程失败');
    }
}

function _renderSchedList(data) {
    const info = document.getElementById('schedInfo');
    const container = document.getElementById('schedList');
    const pag = document.getElementById('schedPagination');
    if (!container) return;
    info.textContent = `共 ${data.total} 条`;
    if (!data.items.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📅</div><p>还没有日程，快去规划一下~</p></div>';
        pag.innerHTML = '';
        return;
    }
    const today = new Date(); today.setHours(0,0,0,0);
    container.innerHTML = data.items.map(s => {
        const emoji = s.emoji || { date: '💑', travel: '✈️', medical: '🏥', document: '📄',
             shopping: '🛍️', dining: '🍽️', movie: '🎬', errand: '📋', other: '📌' }[s.type] || '📌';
        const targetDate = new Date(s.date); targetDate.setHours(0,0,0,0);
        const days = Math.round((targetDate - today) / 86400000);

        // 日期显示
        const fmtDate = d => {
            const dt = new Date(d); dt.setHours(0,0,0,0);
            return `${dt.getFullYear()}-${dt.getMonth()+1}-${dt.getDate()}`;
        };
        const startStr = fmtDate(s.date);
        const timeStr  = s.time ? ` ${s.time}` : '';
        let metaDate;
        if (s.end_date && s.end_date !== s.date) {
            const endDt = new Date(s.end_date); endDt.setHours(0,0,0,0);
            const spanDays = Math.round((endDt - targetDate) / 86400000) + 1;
            metaDate = `${startStr}${timeStr} → ${fmtDate(s.end_date)}（共 ${spanDays} 天）`;
        } else {
            metaDate = `${startStr}${timeStr}`;
        }

        // 倒计时标签
        let daysTag = '';
        if (s.status === 'done')           daysTag = `<span class="sched-tag sched-done">已完成 ✅</span>`;
        else if (s.status === 'cancelled') daysTag = `<span class="sched-tag sched-cancelled">已取消</span>`;
        else if (days < 0)                 daysTag = `<span class="sched-tag sched-past">已过期</span>`;
        else if (days === 0)               daysTag = `<span class="sched-tag sched-today">就在今天！</span>`;
        else if (days === 1)               daysTag = `<span class="sched-tag sched-today">明天就要到了</span>`;
        else                               daysTag = `<span class="sched-tag sched-upcoming">还有 ${days} 天</span>`;

        const urgentBadge = s.priority === 'urgent' ? `<span class="sched-urgent-badge">紧急</span>` : '';
        // 快捷完成按钮（只对 pending 显示）
        const doneBtn = s.status === 'pending'
            ? `<button class="btn btn-small btn-success" onclick="schedMarkDone(${s.id})" title="标记完成">✓ 完成</button>`
            : '';
        // 备注渲染（直接用 HTML，支持富文本）
        const noteHtml = s.note
            ? `<div class="sched-row-note">${s.note}</div>`
            : '';
        // 图片缩略图
        const imgs = s.images ? JSON.parse(s.images) : [];
        const imgHtml = imgs.length
            ? `<div class="ann-row-images">${imgs.map(u => `<img class="ann-row-img" src="${u}" onclick="openAnnLightbox('${u}')">`).join('')}</div>`
            : '';
        return `<div class="sched-row${s.priority === 'urgent' ? ' sched-urgent' : ''}${s.status === 'done' ? ' sched-row-done' : ''}${s.status === 'cancelled' ? ' sched-row-cancelled' : ''}">
            <div class="sched-row-left">
                <span class="sched-row-emoji">${emoji}</span>
                <div class="sched-row-info">
                    <div class="sched-row-title">${urgentBadge}${escapeHtml(s.title)}</div>
                    <div class="sched-row-meta">
                        ${metaDate}
                        &nbsp;·&nbsp; ${_schedTypeLabel(s.type)}
                    </div>
                    ${noteHtml}
                    ${imgHtml}
                </div>
            </div>
            <div class="sched-row-right">
                ${daysTag}
                ${doneBtn}
                <button class="btn btn-small btn-secondary" onclick="openSchedModal(${s.id})">编辑</button>
                <button class="btn btn-small btn-danger" onclick="deleteSched(${s.id})">删除</button>
            </div>
        </div>`;
    }).join('');
    _renderSchedPagination(data.total_pages);
}

function _renderSchedPagination(pages) {
    const el = document.getElementById('schedPagination');
    if (pages <= 1) { el.innerHTML = ''; return; }
    const cur = _schedPage;
    const range = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || (i >= cur - 2 && i <= cur + 2)) range.push(i);
        else if (range[range.length-1] !== '…') range.push('…');
    }
    let html = `<button class="page-btn" ${cur===1?'disabled':''} onclick="loadSchedules(${cur-1})">‹</button>`;
    range.forEach(p => {
        if (p === '…') html += `<span class="page-btn" style="cursor:default;border:none;opacity:.5">…</span>`;
        else html += `<button class="page-btn${p===cur?' active':''}" onclick="loadSchedules(${p})">${p}</button>`;
    });
    html += `<button class="page-btn" ${cur===pages?'disabled':''} onclick="loadSchedules(${cur+1})">›</button>`;
    el.innerHTML = html;
}

function openSchedModal(id) {
    const modal = document.getElementById('schedModal');
    document.getElementById('schedForm').reset();
    _setSchedNote('');
    document.getElementById('schedId').value = '';
    document.getElementById('schedModalTitle').textContent = id ? '编辑日程' : '添加日程';
    // Wire type-grid once
    _initTypeGrid('schedTypeGrid', 'schedType');
    // Reset to default type
    _setTypeGrid('schedTypeGrid', 'schedType', 'date');
    // Reset emoji picker
    document.getElementById('schedEmoji').value = '';
    _syncEmojiPicker('schedEmoji');
    // 初始化日期/时间下拉
    _initSchedYearSelect('schedYear');
    _initSchedYearSelect('schedEndYear');
    _initSchedHourOptions();
    _initSchedMinuteOptions();
    _wireSchedDateSelects('schedYear', 'schedMonth', 'schedDay');
    _wireSchedDateSelects('schedEndYear', 'schedEndMonth', 'schedEndDay');
    // 默认日期=今天
    if (!id) {
        const today = new Date().toISOString().slice(0, 10);
        _setSchedDateSelects('schedYear', 'schedMonth', 'schedDay', today);
        _initSchedDayOptions('schedEndDay', '', '');
        document.getElementById('schedHour').value = '';
        document.getElementById('schedMinute').value = '';
    }
    // Reset images
    _schedCurrentId = null;
    _renderSchedImagesPreview([]);
    document.getElementById('schedImagesGroup').style.display = 'none';
    if (id) {
        fetch(`/api/timemachine/schedules/${id}`, { credentials: 'include' })
            .then(r => r.json()).then(rec => {
                document.getElementById('schedId').value = rec.id;
                document.getElementById('schedTitle').value = rec.title;
                // 日期回填
                _setSchedDateSelects('schedYear', 'schedMonth', 'schedDay', rec.date);
                // 时间回填
                if (rec.time) {
                    const [h, m] = rec.time.split(':');
                    document.getElementById('schedHour').value = h;
                    document.getElementById('schedMinute').value = m;
                } else {
                    document.getElementById('schedHour').value = '';
                    document.getElementById('schedMinute').value = '';
                }
                // 结束日期回填
                _setSchedDateSelects('schedEndYear', 'schedEndMonth', 'schedEndDay', rec.end_date || '');
                _setTypeGrid('schedTypeGrid', 'schedType', rec.type || 'date');
                document.getElementById('schedPriority').value = rec.priority;
                document.getElementById('schedStatus').value = rec.status;
                document.getElementById('schedEmoji').value = rec.emoji || '';
                _syncEmojiPicker('schedEmoji');
                _setSchedNote(rec.note || '');
                // 图片
                _schedCurrentId = rec.id;
                const imgs = rec.images ? JSON.parse(rec.images) : [];
                _renderSchedImagesPreview(imgs);
                document.getElementById('schedImagesGroup').style.display = '';
            }).catch(() => {});
    } else {
        _setSchedNote('');
    }
    modal.classList.add('show');
}

document.getElementById('schedModalClose')?.addEventListener('click', () => document.getElementById('schedModal').classList.remove('show'));
document.getElementById('schedCancelBtn')?.addEventListener('click', () => document.getElementById('schedModal').classList.remove('show'));
document.getElementById('schedModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });

document.getElementById('schedForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('schedSaveBtn');
    btn.disabled = true;
    const id = document.getElementById('schedId').value;
    const dateVal = _getSchedDateValue('schedYear', 'schedMonth', 'schedDay');
    if (!dateVal) { showError('请选择日期'); btn.disabled = false; return; }
    const body = {
        title:    document.getElementById('schedTitle').value.trim(),
        date:     dateVal,
        time:     _getSchedTimeValue() || null,
        end_date: _getSchedDateValue('schedEndYear', 'schedEndMonth', 'schedEndDay') || null,
        type:     document.getElementById('schedType').value,
        priority: document.getElementById('schedPriority').value,
        status:   document.getElementById('schedStatus').value,
        emoji:    document.getElementById('schedEmoji').value.trim() || null,
        note:     _schedNoteHtml() || null,
    };
    try {
        const url = id ? `/api/timemachine/schedules/${id}` : '/api/timemachine/schedules';
        const method = id ? 'PATCH' : 'POST';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
        if (!res.ok) throw new Error();
        document.getElementById('schedModal').classList.remove('show');
        showSuccess(id ? '已更新' : '已添加');
        loadSchedules();
    } catch {
        showError('保存失败，请重试');
    } finally {
        btn.disabled = false;
    }
});

async function deleteSched(id) {
    showConfirm({ title: '删除日程', message: '确定要删除这条日程吗？', onConfirm: async () => {
        try {
            const res = await fetch(`/api/timemachine/schedules/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error();
            showSuccess('已删除');
            loadSchedules();
        } catch { showError('删除失败'); }
    }});
}

document.getElementById('schedSearch')?.addEventListener('input', () => {
    clearTimeout(_schedSearchTimer);
    _schedSearchTimer = setTimeout(() => loadSchedules(1), 400);
});
document.getElementById('schedStatusFilter')?.addEventListener('change', () => loadSchedules(1));

// ============================================================
// ===== 日记 / 回忆录 =====
// ============================================================

let _diaryPage = 1;
const _diaryPageSize = 10;
let _diarySearchTimer = null;
let _diaryCurrentId = null;
let _diaryCurrentImages = [];   // 已上传到服务器的图片 URL 列表
let _diaryPendingFiles = [];    // 新建时本地暂存的 File 对象列表
const _DIARY_CONTENT_MAX = 5000;

const _DIARY_MOOD_MAP = {
    happy:    { label: '开心',   emoji: '😄' },
    sweet:    { label: '甜蜜',   emoji: '🥰' },
    touched:  { label: '感动',   emoji: '🥹' },
    excited:  { label: '期待',   emoji: '🎉' },
    grateful: { label: '感恩',   emoji: '🙏' },
    calm:     { label: '平静',   emoji: '😌' },
    sad:      { label: '难过',   emoji: '😢' },
    other:    { label: '其他',   emoji: '💭' },
};

// ----- 富文本辅助 -----
const _diaryContentEl = () => document.getElementById('diaryContent');
function _diaryContentText() { return _diaryContentEl()?.innerText?.trim() || ''; }
function _diaryContentHtml() { return _diaryContentEl()?.innerHTML?.trim() || ''; }
function _setDiaryContent(html) {
    const el = _diaryContentEl(); if (!el) return;
    el.innerHTML = html || '';
    _updateDiaryContentCount();
}
function _updateDiaryContentCount() {
    const len = _diaryContentText().length;
    const counter = document.getElementById('diaryContentCount');
    if (!counter) return;
    counter.textContent = len;
    counter.closest('.ann-note-count')?.classList.toggle('warn', len > _DIARY_CONTENT_MAX);
}
document.getElementById('diaryContent')?.addEventListener('input', _updateDiaryContentCount);
document.getElementById('diaryModal')?.querySelector('.ann-note-toolbar')
    ?.addEventListener('mousedown', e => { e.preventDefault(); });
document.getElementById('diaryModal')?.querySelector('.ann-note-toolbar')
    ?.addEventListener('click', e => {
        const btn = e.target.closest('.ann-tb-btn');
        if (!btn) return;
        _diaryContentEl()?.focus();
        document.execCommand(btn.dataset.cmd, false, null);
    });

// ----- 天气按钮 -----
document.getElementById('diaryWeatherRow')?.addEventListener('click', e => {
    const btn = e.target.closest('.diary-weather-btn');
    if (!btn) return;
    const val = btn.dataset.val;
    const cur = document.getElementById('diaryWeather').value;
    const next = cur === val ? '' : val;
    document.getElementById('diaryWeather').value = next;
    document.querySelectorAll('#diaryWeatherRow .diary-weather-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.val === next));
});

// ----- 心情按钮 -----
document.getElementById('diaryMoodRow')?.addEventListener('click', e => {
    const btn = e.target.closest('.diary-mood-btn');
    if (!btn) return;
    const mood = btn.dataset.mood;
    const cur = document.getElementById('diaryMood').value;
    const next = cur === mood ? '' : mood;
    document.getElementById('diaryMood').value = next;
    document.querySelectorAll('#diaryMoodRow .diary-mood-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.mood === next));
});

// ----- 图片 -----

/**
 * 渲染图片九宫格（编辑模态框内）
 * items: Array of { type: 'url'|'pending', value: string|File, previewUrl: string }
 */
function _renderDiaryImagesPreview(serverImages, pendingFiles) {
    _diaryCurrentImages = serverImages || [];
    _diaryPendingFiles  = pendingFiles  || [];

    const grid = document.getElementById('diaryImagesPreview');
    if (!grid) return;

    const total = _diaryCurrentImages.length + _diaryPendingFiles.length;
    const canAdd = total < 9;

    let html = '';

    // 已上传图片
    _diaryCurrentImages.forEach((url, i) => {
        html += `<div class="diary-img-cell" data-idx="${i}" data-type="url">
            <img src="${url}" onclick="openAnnLightbox('${url}')">
            <button type="button" class="diary-img-del" onclick="_removeDiaryImage('url',${i})">✕</button>
        </div>`;
    });

    // 本地待上传预览
    _diaryPendingFiles.forEach((f, i) => {
        const objUrl = f._previewUrl || '';
        html += `<div class="diary-img-cell" data-idx="${i}" data-type="pending">
            <img src="${objUrl}" onclick="openAnnLightbox('${objUrl}')">
            <span class="diary-img-pending-badge">待上传</span>
            <button type="button" class="diary-img-del" onclick="_removeDiaryImage('pending',${i})">✕</button>
        </div>`;
    });

    // 添加按钮（未满9张时显示）
    if (canAdd) {
        html += `<label class="diary-img-add" for="diaryImageFile" title="添加图片">
            <span>+</span>
        </label>`;
    }

    grid.innerHTML = html;
}

// 移除图片（本地操作，不立即删服务器）
async function _removeDiaryImage(type, idx) {
    if (type === 'url') {
        const url = _diaryCurrentImages[idx];
        if (_diaryCurrentId) {
            // 编辑模式：立即从服务器删除
            try {
                const res = await fetch(
                    `/api/timemachine/diaries/${_diaryCurrentId}/images?url=${encodeURIComponent(url)}`,
                    { method: 'DELETE', credentials: 'include' }
                );
                if (!res.ok) throw new Error();
                const data = await res.json();
                _renderDiaryImagesPreview(data.images, _diaryPendingFiles);
            } catch { showError('删除失败'); }
        } else {
            _diaryCurrentImages.splice(idx, 1);
            _renderDiaryImagesPreview(_diaryCurrentImages, _diaryPendingFiles);
        }
    } else {
        // 取消本地待上传文件
        const f = _diaryPendingFiles[idx];
        if (f._previewUrl) URL.revokeObjectURL(f._previewUrl);
        _diaryPendingFiles.splice(idx, 1);
        _renderDiaryImagesPreview(_diaryCurrentImages, _diaryPendingFiles);
    }
}

// 文件选择事件
document.getElementById('diaryImageFile')?.addEventListener('change', async function() {
    if (!this.files || !this.files.length) return;
    const total = _diaryCurrentImages.length + _diaryPendingFiles.length;
    const slots = 9 - total;
    const picked = Array.from(this.files).slice(0, slots);

    if (_diaryCurrentId) {
        // 编辑模式：直接上传
        await _uploadDiaryFiles(_diaryCurrentId, picked);
    } else {
        // 新建模式：暂存到本地预览
        picked.forEach(f => {
            f._previewUrl = URL.createObjectURL(f);
            _diaryPendingFiles.push(f);
        });
        _renderDiaryImagesPreview(_diaryCurrentImages, _diaryPendingFiles);
    }
    this.value = '';
});

// 批量上传文件到服务器
async function _uploadDiaryFiles(diaryId, files) {
    if (!files.length) return;
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    try {
        const res = await fetch(`/api/timemachine/diaries/${diaryId}/images/batch`, {
            method: 'POST', credentials: 'include', body: fd
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || '上传失败'); }
        const data = await res.json();
        // 释放 objectURL
        files.forEach(f => { if (f._previewUrl) URL.revokeObjectURL(f._previewUrl); });
        _renderDiaryImagesPreview(data.images, []);
        if (data.added.length) showSuccess(`已上传 ${data.added.length} 张图片`);
    } catch(e) { showError(e.message || '上传失败'); }
}

// 保留旧接口兼容（纪念日/日程复用 openAnnLightbox）
async function deleteDiaryImage(url) {
    await _removeDiaryImage('url', _diaryCurrentImages.indexOf(url));
}

// ----- 卡片九宫格图片布局 -----
function _buildDiaryCardImgGrid(imgs) {
    const n = imgs.length;
    // 布局类名，根据张数选择合适排列
    let gridClass = 'diary-grid-' + Math.min(n, 9);
    // 超过9张只展示9张
    const show = imgs.slice(0, 9);
    const cells = show.map((u, i) => {
        const isLast = i === show.length - 1 && n > 9;
        return `<div class="diary-grid-cell${isLast ? ' diary-grid-more' : ''}"
                     onclick="openAnnLightbox('${u}')">
            <img src="${u}" loading="lazy">
            ${isLast ? `<span class="diary-grid-more-badge">+${n - 9}</span>` : ''}
        </div>`;
    }).join('');
    return `<div class="diary-img-grid-card ${gridClass}">${cells}</div>`;
}

// ----- 加载列表 -----
async function loadDiaries(page) {
    _diaryPage = page || _diaryPage;
    const search     = document.getElementById('diarySearch')?.value.trim() || '';
    const mood       = document.getElementById('diaryMoodFilter')?.value || '';
    const dateFrom   = document.getElementById('diaryDateFrom')?.value || '';
    const dateTo     = document.getElementById('diaryDateTo')?.value || '';
    try {
        const params = new URLSearchParams({
            page: _diaryPage, page_size: _diaryPageSize,
            search, mood_filter: mood, date_from: dateFrom, date_to: dateTo
        });
        const res = await fetch(`/api/timemachine/diaries?${params}`, { credentials: 'include' });
        if (!res.ok) throw new Error();
        const data = await res.json();
        _renderDiaryTimeline(data);
    } catch { showError('加载日记失败'); }
}

// ----- 渲染时间轴 -----
function _renderDiaryTimeline(data) {
    const info      = document.getElementById('diaryInfo');
    const container = document.getElementById('diaryTimeline');
    const pag       = document.getElementById('diaryPagination');
    if (!container) return;
    info.textContent = `共 ${data.total} 篇`;
    if (!data.items.length) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📖</div><p>还没有日记，快写下今天的故事~</p></div>';
        pag.innerHTML = '';
        return;
    }

    // 按月分组
    const groups = {};
    data.items.forEach(d => {
        const ym = d.date.slice(0, 7); // YYYY-MM
        if (!groups[ym]) groups[ym] = [];
        groups[ym].push(d);
    });

    let html = '';
    for (const [ym, items] of Object.entries(groups)) {
        const [y, m] = ym.split('-');
        html += `<div class="diary-month-group">
            <div class="diary-month-label">${y}年 ${parseInt(m)}月</div>`;
        items.forEach(d => {
            const mood    = d.mood ? _DIARY_MOOD_MAP[d.mood] : null;
            const moodBadge = mood
                ? `<span class="diary-mood-badge diary-mood-${d.mood}">${mood.emoji} ${mood.label}</span>`
                : '';
            const weather = d.weather ? `<span class="diary-weather-badge">${d.weather}</span>` : '';
            const loc     = d.location ? `<span class="diary-location">📍 ${escapeHtml(d.location)}</span>` : '';
            const title   = d.title ? escapeHtml(d.title) : _diaryDateFriendly(d.date);
            const preview = d.content
                ? `<div class="diary-card-preview">${d.content}</div>`
                : '';
            const imgs = d.images ? JSON.parse(d.images) : [];
            const imgHtml = imgs.length ? _buildDiaryCardImgGrid(imgs) : '';
            const dateObj = new Date(d.date + 'T00:00:00');
            const weekDay = ['日','一','二','三','四','五','六'][dateObj.getDay()];
            const dayNum  = dateObj.getDate();

            html += `<div class="diary-timeline-item">
                <div class="diary-dot-col">
                    <div class="diary-day-num">${dayNum}</div>
                    <div class="diary-week-day">周${weekDay}</div>
                    <div class="diary-dot-line"></div>
                </div>
                <div class="diary-card">
                    <div class="diary-card-header">
                        <span class="diary-card-title">${title}</span>
                        <span class="diary-card-meta">${weather}${moodBadge}${loc}</span>
                    </div>
                    ${preview}
                    ${imgHtml}
                    <div class="diary-card-actions">
                        <button class="btn btn-small btn-secondary" onclick="openDiaryModal(${d.id})">编辑</button>
                        <button class="btn btn-small btn-danger" onclick="deleteDiary(${d.id})">删除</button>
                    </div>
                </div>
            </div>`;
        });
        html += `</div>`;
    }
    container.innerHTML = html;
    _renderDiaryPagination(data.total_pages);
}

function _diaryDateFriendly(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}

function _renderDiaryPagination(pages) {
    const el = document.getElementById('diaryPagination');
    if (pages <= 1) { el.innerHTML = ''; return; }
    const cur = _diaryPage;
    const range = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || (i >= cur - 2 && i <= cur + 2)) range.push(i);
        else if (range[range.length-1] !== '…') range.push('…');
    }
    let html = `<button class="page-btn" ${cur===1?'disabled':''} onclick="loadDiaries(${cur-1})">‹</button>`;
    range.forEach(p => {
        if (p === '…') html += `<span class="page-btn" style="cursor:default;border:none;opacity:.5">…</span>`;
        else html += `<button class="page-btn${p===cur?' active':''}" onclick="loadDiaries(${p})">${p}</button>`;
    });
    html += `<button class="page-btn" ${cur===pages?'disabled':''} onclick="loadDiaries(${cur+1})">›</button>`;
    el.innerHTML = html;
}

// ----- 弹窗开关 -----
function openDiaryModal(id) {
    const modal = document.getElementById('diaryModal');
    document.getElementById('diaryForm').reset();
    _setDiaryContent('');
    document.getElementById('diaryId').value = '';
    document.getElementById('diaryModalTitle').textContent = id ? '编辑日记' : '写日记';
    document.getElementById('diaryWeather').value = '';
    document.getElementById('diaryMood').value = '';
    document.querySelectorAll('#diaryWeatherRow .diary-weather-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#diaryMoodRow .diary-mood-btn').forEach(b => b.classList.remove('active'));
    // 初始化年份下拉，联动日选项
    _initSchedYearSelect('diaryYear');
    _wireSchedDateSelects('diaryYear', 'diaryMonth', 'diaryDay');
    // 默认日期为今天
    if (!id) {
        const today = new Date().toISOString().slice(0, 10);
        _setSchedDateSelects('diaryYear', 'diaryMonth', 'diaryDay', today);
    }
    // 图片重置
    _diaryCurrentId = null;
    _diaryPendingFiles = [];
    _renderDiaryImagesPreview([], []);

    if (id) {
        fetch(`/api/timemachine/diaries/${id}`, { credentials: 'include' })
            .then(r => r.json()).then(rec => {
                document.getElementById('diaryId').value = rec.id;
                _setSchedDateSelects('diaryYear', 'diaryMonth', 'diaryDay', rec.date);
                document.getElementById('diaryTitle').value = rec.title || '';
                document.getElementById('diaryLocation').value = rec.location || '';
                // 天气
                if (rec.weather) {
                    document.getElementById('diaryWeather').value = rec.weather;
                    document.querySelectorAll('#diaryWeatherRow .diary-weather-btn')
                        .forEach(b => b.classList.toggle('active', b.dataset.val === rec.weather));
                }
                // 心情
                if (rec.mood) {
                    document.getElementById('diaryMood').value = rec.mood;
                    document.querySelectorAll('#diaryMoodRow .diary-mood-btn')
                        .forEach(b => b.classList.toggle('active', b.dataset.mood === rec.mood));
                }
                _setDiaryContent(rec.content || '');
                // 图片
                _diaryCurrentId = rec.id;
                const imgs = rec.images ? JSON.parse(rec.images) : [];
                _renderDiaryImagesPreview(imgs, []);
            }).catch(() => {});
    }
    modal.classList.add('show');
}

document.getElementById('diaryModalClose')?.addEventListener('click',  () => document.getElementById('diaryModal').classList.remove('show'));
document.getElementById('diaryCancelBtn')?.addEventListener('click',   () => document.getElementById('diaryModal').classList.remove('show'));
document.getElementById('diaryModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });

// ----- 提交 -----
document.getElementById('diaryForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('diarySaveBtn');
    btn.disabled = true;
    const id = document.getElementById('diaryId').value;
    const contentHtml = _diaryContentHtml();
    if (!contentHtml && !id) {
        showError('请写点内容吧~');
        btn.disabled = false;
        return;
    }
    const dateVal = _getSchedDateValue('diaryYear', 'diaryMonth', 'diaryDay');
    if (!dateVal) { showError('请选择日期'); btn.disabled = false; return; }
    const body = {
        title:    document.getElementById('diaryTitle').value.trim() || null,
        date:     dateVal,
        mood:     document.getElementById('diaryMood').value || null,
        location: document.getElementById('diaryLocation').value.trim() || null,
        weather:  document.getElementById('diaryWeather').value || null,
        content:  contentHtml || null,
    };
    try {
        const url    = id ? `/api/timemachine/diaries/${id}` : '/api/timemachine/diaries';
        const method = id ? 'PATCH' : 'POST';
        const res = await fetch(url, {
            method, headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error();
        const saved = await res.json();
        // 上传暂存的本地图片
        if (_diaryPendingFiles.length) {
            await _uploadDiaryFiles(saved.id, [..._diaryPendingFiles]);
            _diaryPendingFiles = [];
        }
        showSuccess(id ? '已更新' : '已保存 ✍️');
        loadDiaries();
        document.getElementById('diaryModal').classList.remove('show');
    } catch { showError('保存失败，请重试'); }
    finally { btn.disabled = false; }
});

// ----- 删除 -----
async function deleteDiary(id) {
    showConfirm({ title: '删除日记', message: '确定要删除这篇日记吗？图片也会一并删除。', onConfirm: async () => {
        try {
            const res = await fetch(`/api/timemachine/diaries/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error();
            showSuccess('已删除');
            loadDiaries();
        } catch { showError('删除失败'); }
    }});
}

// ----- 搜索 / 筛选事件 -----
document.getElementById('diarySearch')?.addEventListener('input', () => {
    clearTimeout(_diarySearchTimer);
    _diarySearchTimer = setTimeout(() => loadDiaries(1), 400);
});
document.getElementById('diaryMoodFilter')?.addEventListener('change', () => loadDiaries(1));



// =============================================
// ===== 婚礼 & 订婚 清单 (WeddingTodo) =====
// =============================================

let _wtPage = { engagement: 1, wedding: 1 };
const _wtPageSize = 50;
let _wtSearchTimer = { engagement: null, wedding: null };

const WT_STATUS_LABEL = { todo: '未开始', doing: '进行中', done: '已完成' };
const WT_STATUS_COLOR = { todo: '#9ca3af', doing: '#6366f1', done: '#10b981' };
const WT_PRIORITY_LABEL = { urgent: '紧急', normal: '普通' };

async function loadWeddingTodos(listType, page) {
    _wtPage[listType] = page || _wtPage[listType];
    const prefix = listType === 'engagement' ? 'engagement' : 'wedding';
    const search = document.getElementById(prefix + 'Search')?.value || '';
    const statusFilter = document.getElementById(prefix + 'StatusFilter')?.value || '';
    const infoEl = document.getElementById(prefix + 'Info');
    const listEl = document.getElementById(prefix + 'List');
    const pageEl = document.getElementById(prefix + 'Pagination');
    const progEl = document.getElementById(prefix + 'Progress');

    if (!listEl) return;
    listEl.innerHTML = '<div class="loading-state">加载中…</div>';

    try {
        const params = new URLSearchParams({
            list_type: listType,
            page: _wtPage[listType],
            page_size: _wtPageSize,
            search,
            status_filter: statusFilter,
        });
        const res = await fetch(`/api/wedding/todos?${params}`, { credentials: 'include' });
        if (!res.ok) throw new Error();
        const data = await res.json();

        if (infoEl) infoEl.textContent = `共 ${data.total} 项`;

        // 进度条（无搜索/过滤时显示）
        if (progEl) {
            if (!search && !statusFilter) {
                const allRes = await fetch(`/api/wedding/todos?list_type=${listType}&page=1&page_size=500`, { credentials: 'include' });
                const allData = await allRes.json();
                const total = allData.total;
                const done = allData.items.filter(i => i.status === 'done').length;
                const pct = total > 0 ? Math.round(done / total * 100) : 0;
                const fillColor = pct === 100 ? '#10b981' : '#6366f1';
                progEl.style.display = 'block';
                progEl.innerHTML = `
                    <div class="wedding-progress-label">
                        <span>完成进度</span>
                        <span>${done} / ${total} 项 (${pct}%)</span>
                    </div>
                    <div class="wedding-progress-track">
                        <div class="wedding-progress-fill" style="width:${pct}%;background:${fillColor}"></div>
                    </div>`;
            } else {
                progEl.style.display = 'none';
            }
        }

        if (data.items.length === 0) {
            const emptyIcon = listType === 'engagement' ? '💍' : '👰';
            listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">${emptyIcon}</div><div>暂无待办项，点击"添加待办"开始规划吧</div></div>`;
        } else {
            listEl.innerHTML = data.items.map(item => renderWeddingTodoCard(item)).join('');
        }

        if (pageEl) {
            pageEl.innerHTML = _buildWtPager(data.page, data.total_pages, listType);
        }
    } catch (err) {
        if (listEl) listEl.innerHTML = '<div class="empty-state">加载失败，请重试</div>';
    }
}

function _buildWtPager(cur, pages, listType) {
    if (pages <= 1) return '';
    const range = [];
    for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || (i >= cur - 2 && i <= cur + 2)) range.push(i);
        else if (range[range.length - 1] !== '…') range.push('…');
    }
    let html = `<button class="page-btn" ${cur===1?'disabled':''} onclick="loadWeddingTodos('${listType}',${cur-1})">‹</button>`;
    range.forEach(p => {
        if (p === '…') html += `<span class="page-btn" style="cursor:default;border:none;opacity:.5">…</span>`;
        else html += `<button class="page-btn${p===cur?' active':''}" onclick="loadWeddingTodos('${listType}',${p})">${p}</button>`;
    });
    html += `<button class="page-btn" ${cur===pages?'disabled':''} onclick="loadWeddingTodos('${listType}',${cur+1})">›</button>`;
    return html;
}

function renderWeddingTodoCard(item) {
    const statusColor = WT_STATUS_COLOR[item.status] || '#9ca3af';
    const statusLabel = WT_STATUS_LABEL[item.status] || item.status;
    const isUrgent = item.priority === 'urgent';
    const isDone = item.status === 'done';

    const overdue = item.due_date && !isDone && (new Date(item.due_date) < new Date(new Date().toDateString()));
    const dueDateHtml = item.due_date
        ? `<span class="wt-due-date${overdue ? ' wt-overdue' : ''}">📅 ${item.due_date}</span>`
        : '';
    const categoryHtml = item.category ? `<span class="wt-tag wt-tag-category">${_escHtml(item.category)}</span>` : '';
    const assigneeHtml = item.assignee ? `<span class="wt-tag wt-tag-assignee">👤 ${_escHtml(item.assignee)}</span>` : '';
    const noteHtml = item.note ? `<div class="wt-note">${_escHtml(item.note)}</div>` : '';
    const urgentBadge = isUrgent && !isDone ? '<span class="wt-priority-badge urgent">⚡ 紧急</span>' : '';
    const lt = item.list_type;

    return `<div class="wt-card${isDone ? ' wt-done' : ''}${isUrgent && !isDone ? ' wt-urgent' : ''}" data-id="${item.id}">
        <div class="wt-card-left">
            <button class="wt-check-btn${isDone ? ' checked' : ''}" onclick="toggleWtStatus(${item.id},'${lt}','${item.status}')" title="${isDone ? '标记未完成' : '标记完成'}">
                ${isDone ? '✓' : ''}
            </button>
        </div>
        <div class="wt-card-body">
            <div class="wt-card-title">${_escHtml(item.title)}</div>
            <div class="wt-card-meta">
                ${categoryHtml}${assigneeHtml}
                <span class="wt-status-badge" style="background:${statusColor}20;color:${statusColor};">${statusLabel}</span>
                ${urgentBadge}${dueDateHtml}
            </div>
            ${noteHtml}
        </div>
        <div class="wt-card-actions">
            <button class="icon-btn" onclick="openWeddingTodoModal('${lt}',${item.id})" title="编辑">✏️</button>
            <button class="icon-btn" onclick="deleteWeddingTodo(${item.id},'${lt}')" title="删除">🗑️</button>
        </div>
    </div>`;
}

function _escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function toggleWtStatus(id, listType, currentStatus) {
    const cycle = { todo: 'doing', doing: 'done', done: 'todo' };
    const newStatus = cycle[currentStatus] || 'todo';
    try {
        const res = await fetch(`/api/wedding/todos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) throw new Error();
        loadWeddingTodos(listType, _wtPage[listType]);
    } catch {
        showError('更新失败');
    }
}

async function deleteWeddingTodo(id, listType) {
    showConfirm({ title: '删除待办', message: '确定要删除这项待办吗？', onConfirm: async () => {
        try {
            const res = await fetch(`/api/wedding/todos/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error();
            showSuccess('已删除');
            loadWeddingTodos(listType, _wtPage[listType]);
        } catch {
            showError('删除失败');
        }
    }});
}

// --- Modal ---
function openWeddingTodoModal(listType, id) {
    const modal = document.getElementById('weddingTodoModal');
    const form  = document.getElementById('weddingTodoForm');
    form.reset();
    document.getElementById('weddingTodoId').value = '';
    document.getElementById('weddingTodoListType').value = listType;
    document.getElementById('weddingTodoModalTitle').textContent =
        id ? '编辑待办' : (listType === 'engagement' ? '💍 添加订婚待办' : '👰 添加婚礼待办');

    if (id) {
        fetch(`/api/wedding/todos?list_type=${listType}&page=1&page_size=500`, { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                const item = data.items.find(i => i.id === id);
                if (!item) return;
                document.getElementById('weddingTodoId').value = item.id;
                document.getElementById('weddingTodoTitle').value = item.title || '';
                document.getElementById('weddingTodoCategory').value = item.category || '';
                document.getElementById('weddingTodoAssignee').value = item.assignee || '';
                document.getElementById('weddingTodoStatus').value = item.status || 'todo';
                document.getElementById('weddingTodoPriority').value = item.priority || 'normal';
                document.getElementById('weddingTodoDueDate').value = item.due_date || '';
                document.getElementById('weddingTodoNote').value = item.note || '';
            });
    }
    modal.classList.add('show');
}

document.getElementById('weddingTodoModalClose')?.addEventListener('click', () => {
    document.getElementById('weddingTodoModal').classList.remove('show');
});
document.getElementById('weddingTodoCancelBtn')?.addEventListener('click', () => {
    document.getElementById('weddingTodoModal').classList.remove('show');
});
document.getElementById('weddingTodoModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('weddingTodoModal'))
        document.getElementById('weddingTodoModal').classList.remove('show');
});

document.getElementById('weddingTodoForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('weddingTodoId').value;
    const listType = document.getElementById('weddingTodoListType').value;
    const payload = {
        list_type: listType,
        title:    document.getElementById('weddingTodoTitle').value.trim(),
        category: document.getElementById('weddingTodoCategory').value.trim() || null,
        assignee: document.getElementById('weddingTodoAssignee').value.trim() || null,
        status:   document.getElementById('weddingTodoStatus').value,
        priority: document.getElementById('weddingTodoPriority').value,
        due_date: document.getElementById('weddingTodoDueDate').value || null,
        note:     document.getElementById('weddingTodoNote').value.trim() || null,
    };
    const saveBtn = document.getElementById('weddingTodoSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';
    try {
        const url = id ? `/api/wedding/todos/${id}` : '/api/wedding/todos';
        const method = id ? 'PATCH' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        document.getElementById('weddingTodoModal').classList.remove('show');
        showSuccess(id ? '已更新' : '已添加');
        loadWeddingTodos(listType, _wtPage[listType]);
    } catch {
        showError('保存失败');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
    }
});

// 搜索防抖
document.getElementById('engagementSearch')?.addEventListener('input', () => {
    clearTimeout(_wtSearchTimer.engagement);
    _wtSearchTimer.engagement = setTimeout(() => loadWeddingTodos('engagement', 1), 400);
});
document.getElementById('weddingSearch')?.addEventListener('input', () => {
    clearTimeout(_wtSearchTimer.wedding);
    _wtSearchTimer.wedding = setTimeout(() => loadWeddingTodos('wedding', 1), 400);
});


// =============================================
// ===== 婚礼预算 (WeddingBudget) =====
// =============================================

let _budgetPage = 1;
const _budgetPageSize = 50;
let _budgetSearchTimer = null;

// 金额：存储用分，展示用元（保留整数）
function _fen2yuan(fen) { return fen != null ? (fen / 100).toFixed(0) : ''; }
function _yuan2fen(yuan) { return yuan !== '' && yuan != null ? Math.round(Number(yuan) * 100) : null; }
function _fmtMoney(fen) {
    if (fen == null || fen === 0) return '¥0';
    return '¥' + (fen / 100).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const BUDGET_CAT_EMOJI = {
    '场地': '🏛️', '婚纱礼服': '👗', '摄影摄像': '📷', '婚宴酒席': '🍽️',
    '酒水饮料': '🍾', '花艺布置': '💐', '婚车': '🚗', '蜜月旅行': '✈️',
    '婚戒珠宝': '💍', '司仪主持': '🎤', '化妆造型': '💄', '喜糖伴手礼': '🎁', '其他': '📦',
};

const PAID_STATUS_LABEL = { unpaid: '未支付', partial: '部分付款', paid: '已付清' };
const PAID_STATUS_COLOR = { unpaid: '#ef4444', partial: '#f59e0b', paid: '#10b981' };

async function loadBudget(page) {
    _budgetPage = page || 1;
    const search = document.getElementById('budgetSearch')?.value || '';
    const category = document.getElementById('budgetCategoryFilter')?.value || '';
    const listEl   = document.getElementById('budgetList');
    const infoEl   = document.getElementById('budgetInfo');
    const pageEl   = document.getElementById('budgetPagination');

    if (!listEl) return;
    listEl.innerHTML = '<div class="loading-state">加载中…</div>';

    try {
        // 并行加载汇总 + 列表
        const [summaryRes, listRes] = await Promise.all([
            fetch('/api/wedding/budget/summary', { credentials: 'include' }),
            fetch(`/api/wedding/budget?page=${_budgetPage}&page_size=${_budgetPageSize}&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`, { credentials: 'include' }),
        ]);
        const summary = await summaryRes.json();
        const data    = await listRes.json();

        // 渲染总览卡片
        renderBudgetSummary(summary);

        if (infoEl) infoEl.textContent = `共 ${data.total} 项`;

        if (data.items.length === 0) {
            listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><div>暂无预算记录，点击"添加预算项"开始规划</div></div>';
        } else {
            listEl.innerHTML = data.items.map(item => renderBudgetRow(item)).join('');
        }

        if (pageEl) {
            if (data.total_pages <= 1) { pageEl.innerHTML = ''; }
            else {
                const cur = data.page, pages = data.total_pages;
                const range = [];
                for (let i = 1; i <= pages; i++) {
                    if (i === 1 || i === pages || (i >= cur - 2 && i <= cur + 2)) range.push(i);
                    else if (range[range.length - 1] !== '…') range.push('…');
                }
                let html = `<button class="page-btn" ${cur===1?'disabled':''} onclick="loadBudget(${cur-1})">‹</button>`;
                range.forEach(p => {
                    if (p === '…') html += `<span class="page-btn" style="cursor:default;border:none;opacity:.5">…</span>`;
                    else html += `<button class="page-btn${p===cur?' active':''}" onclick="loadBudget(${p})">${p}</button>`;
                });
                html += `<button class="page-btn" ${cur===pages?'disabled':''} onclick="loadBudget(${cur+1})">›</button>`;
                pageEl.innerHTML = html;
            }
        }
    } catch {
        if (listEl) listEl.innerHTML = '<div class="empty-state">加载失败，请重试</div>';
    }
}

function renderBudgetSummary(summary) {
    const cardsEl = document.getElementById('budgetSummaryCards');
    const chartEl = document.getElementById('budgetCategoryChart');
    if (!cardsEl) return;

    const overBudget = summary.total_actual > summary.total_budget && summary.total_budget > 0;
    const remaining  = summary.total_budget - summary.total_actual;

    cardsEl.innerHTML = `
        <div class="budget-summary-card">
            <div class="bsc-icon">🎯</div>
            <div class="bsc-body">
                <div class="bsc-label">总预算</div>
                <div class="bsc-value">${_fmtMoney(summary.total_budget)}</div>
            </div>
        </div>
        <div class="budget-summary-card">
            <div class="bsc-icon">💸</div>
            <div class="bsc-body">
                <div class="bsc-label">已花费</div>
                <div class="bsc-value" style="color:${overBudget ? '#ef4444' : '#6366f1'}">${_fmtMoney(summary.total_actual)}</div>
            </div>
        </div>
        <div class="budget-summary-card">
            <div class="bsc-icon">${remaining >= 0 ? '✅' : '⚠️'}</div>
            <div class="bsc-body">
                <div class="bsc-label">${remaining >= 0 ? '剩余' : '超支'}</div>
                <div class="bsc-value" style="color:${remaining >= 0 ? '#10b981' : '#ef4444'}">${_fmtMoney(Math.abs(remaining))}</div>
            </div>
        </div>`;

    // 分类进度条
    if (!chartEl || summary.by_category.length === 0) {
        if (chartEl) chartEl.innerHTML = '';
        return;
    }
    const maxBudget = Math.max(...summary.by_category.map(c => c.budget), 1);
    chartEl.innerHTML = `
        <div class="budget-cat-chart-title">分类预算对比</div>
        ${summary.by_category.map(cat => {
            const emoji = BUDGET_CAT_EMOJI[cat.category] || '📦';
            const budgetPct = cat.budget > 0 ? Math.min(100, Math.round(cat.budget / maxBudget * 100)) : 0;
            const actualPct = cat.budget > 0 ? Math.min(100, Math.round(cat.actual / cat.budget * 100)) : 0;
            const overCat   = cat.actual > cat.budget && cat.budget > 0;
            return `<div class="budget-cat-row">
                <div class="budget-cat-label">${emoji} ${cat.category}</div>
                <div class="budget-cat-bars">
                    <div class="budget-cat-bar-wrap">
                        <div class="budget-cat-bar budget-bar" style="width:${budgetPct}%"></div>
                        <span class="budget-cat-bar-val">${_fmtMoney(cat.budget)}</span>
                    </div>
                    <div class="budget-cat-bar-wrap">
                        <div class="budget-cat-bar actual-bar${overCat ? ' over' : ''}" style="width:${Math.min(100,actualPct)}%"></div>
                        <span class="budget-cat-bar-val" style="color:${overCat?'#ef4444':'inherit'}">${_fmtMoney(cat.actual)}</span>
                    </div>
                </div>
            </div>`;
        }).join('')}
        <div class="budget-cat-legend">
            <span><span class="budget-legend-dot budget-bar"></span> 预算</span>
            <span><span class="budget-legend-dot actual-bar"></span> 实际</span>
        </div>`;
}

function renderBudgetRow(item) {
    const emoji      = BUDGET_CAT_EMOJI[item.category] || '📦';
    const paidColor  = PAID_STATUS_COLOR[item.paid_status] || '#9ca3af';
    const paidLabel  = PAID_STATUS_label_fn(item.paid_status);
    const actualStr  = item.actual_amount != null ? _fmtMoney(item.actual_amount) : '<span style="color:var(--gray-400)">未填</span>';
    const diff       = item.actual_amount != null ? item.actual_amount - item.budget_amount : null;
    const diffHtml   = diff != null
        ? `<span style="color:${diff > 0 ? '#ef4444' : diff < 0 ? '#10b981' : 'var(--gray-400)'}; font-size:0.82rem;">
               ${diff > 0 ? '超' : diff < 0 ? '省' : ''}${diff !== 0 ? _fmtMoney(Math.abs(diff)) : '持平'}
           </span>`
        : '';
    const vendorHtml = item.vendor ? `<span class="wt-tag wt-tag-assignee">🏪 ${_escHtml(item.vendor)}</span>` : '';
    const noteHtml   = item.note ? `<div class="wt-note">${_escHtml(item.note)}</div>` : '';

    return `<div class="budget-item-row" data-id="${item.id}">
        <div class="budget-row-cat">${emoji}</div>
        <div class="budget-row-body">
            <div class="budget-row-title">${_escHtml(item.item_name)}</div>
            <div class="budget-row-sub">
                <span class="wt-tag wt-tag-category">${item.category}</span>
                ${vendorHtml}
                <span class="wt-status-badge" style="background:${paidColor}20;color:${paidColor};">${paidLabel}</span>
            </div>
            ${noteHtml}
        </div>
        <div class="budget-row-amounts">
            <div class="budget-amount-col">
                <div class="budget-amount-label">预算</div>
                <div class="budget-amount-val">${_fmtMoney(item.budget_amount)}</div>
            </div>
            <div class="budget-amount-col">
                <div class="budget-amount-label">实际</div>
                <div class="budget-amount-val">${actualStr}</div>
                ${diffHtml}
            </div>
        </div>
        <div class="wt-card-actions">
            <button class="icon-btn" onclick="openBudgetModal(${item.id})" title="编辑">✏️</button>
            <button class="icon-btn" onclick="deleteBudgetItem(${item.id})" title="删除">🗑️</button>
        </div>
    </div>`;
}

function PAID_STATUS_label_fn(s) {
    return PAID_STATUS_LABEL[s] || s;
}

async function deleteBudgetItem(id) {
    showConfirm({ title: '删除预算项', message: '确定要删除这条预算记录吗？', onConfirm: async () => {
        try {
            const res = await fetch(`/api/wedding/budget/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error();
            showSuccess('已删除');
            loadBudget(_budgetPage);
        } catch {
            showError('删除失败');
        }
    }});
}

// --- Budget Modal ---
function openBudgetModal(id) {
    const modal = document.getElementById('budgetModal');
    const form  = document.getElementById('budgetForm');
    form.reset();
    document.getElementById('budgetItemId').value = '';
    document.getElementById('budgetModalTitle').textContent = id ? '编辑预算项' : '💰 添加预算项';

    if (id) {
        fetch(`/api/wedding/budget?page=1&page_size=500`, { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                const item = data.items.find(i => i.id === id);
                if (!item) return;
                document.getElementById('budgetItemId').value     = item.id;
                document.getElementById('budgetCategory').value   = item.category || '';
                document.getElementById('budgetItemName').value   = item.item_name || '';
                document.getElementById('budgetAmount').value     = _fen2yuan(item.budget_amount);
                document.getElementById('budgetActual').value     = item.actual_amount != null ? _fen2yuan(item.actual_amount) : '';
                document.getElementById('budgetPaidStatus').value = item.paid_status || 'unpaid';
                document.getElementById('budgetVendor').value     = item.vendor || '';
                document.getElementById('budgetNote').value       = item.note || '';
            });
    }
    modal.classList.add('show');
}

document.getElementById('budgetModalClose')?.addEventListener('click', () => {
    document.getElementById('budgetModal').classList.remove('show');
});
document.getElementById('budgetCancelBtn')?.addEventListener('click', () => {
    document.getElementById('budgetModal').classList.remove('show');
});
document.getElementById('budgetModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('budgetModal'))
        document.getElementById('budgetModal').classList.remove('show');
});

document.getElementById('budgetForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id       = document.getElementById('budgetItemId').value;
    const amountEl = document.getElementById('budgetAmount').value;
    const actualEl = document.getElementById('budgetActual').value;
    const payload  = {
        category:      document.getElementById('budgetCategory').value,
        item_name:     document.getElementById('budgetItemName').value.trim(),
        budget_amount: _yuan2fen(amountEl) || 0,
        actual_amount: actualEl !== '' ? _yuan2fen(actualEl) : null,
        paid_status:   document.getElementById('budgetPaidStatus').value,
        vendor:        document.getElementById('budgetVendor').value.trim() || null,
        note:          document.getElementById('budgetNote').value.trim() || null,
    };
    const saveBtn = document.getElementById('budgetSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';
    try {
        const url    = id ? `/api/wedding/budget/${id}` : '/api/wedding/budget';
        const method = id ? 'PATCH' : 'POST';
        const res    = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        document.getElementById('budgetModal').classList.remove('show');
        showSuccess(id ? '已更新' : '已添加');
        loadBudget(_budgetPage);
    } catch {
        showError('保存失败');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
    }
});

// 搜索防抖
document.getElementById('budgetSearch')?.addEventListener('input', () => {
    clearTimeout(_budgetSearchTimer);
    _budgetSearchTimer = setTimeout(() => loadBudget(1), 400);
});


// =============================================
// ===== 角色管理 & 新建账号 (RoleAdmin) =====
// =============================================

// ---- 新建账号 ----
async function openCreateUserModal() {
    // 填充角色下拉
    const select = document.getElementById('newUserRoleId');
    select.innerHTML = '<option value="">不分配角色</option>';
    try {
        const res = await fetch('/api/admin/roles', { credentials: 'include' });
        if (res.ok) {
            const roles = await res.json();
            roles.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id;
                opt.textContent = r.name + (r.description ? ' — ' + r.description : '');
                select.appendChild(opt);
            });
        }
    } catch {}
    document.getElementById('createUserForm').reset();
    document.getElementById('createUserError').style.display = 'none';
    document.getElementById('createUserModal').classList.add('show');
}

document.getElementById('createUserModalClose')?.addEventListener('click', () => {
    document.getElementById('createUserModal').classList.remove('show');
});
document.getElementById('createUserCancelBtn')?.addEventListener('click', () => {
    document.getElementById('createUserModal').classList.remove('show');
});
document.getElementById('createUserModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('createUserModal'))
        document.getElementById('createUserModal').classList.remove('show');
});

document.getElementById('createUserForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl  = document.getElementById('createUserError');
    const saveBtn = document.getElementById('createUserSaveBtn');
    errEl.style.display = 'none';
    const roleIdVal = document.getElementById('newUserRoleId').value;
    const payload = {
        username: document.getElementById('newUsername').value.trim(),
        password: document.getElementById('newPassword').value,
        role:     document.getElementById('newUserRole').value,
        role_id:  roleIdVal ? parseInt(roleIdVal) : null,
    };
    if (!payload.username) { errEl.textContent = '用户名不能为空'; errEl.style.display = 'block'; return; }
    if (payload.password.length < 4) { errEl.textContent = '密码至少4位'; errEl.style.display = 'block'; return; }
    saveBtn.disabled = true; saveBtn.textContent = '创建中…';
    try {
        const res = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.detail || '创建失败'; errEl.style.display = 'block'; return; }
        document.getElementById('createUserModal').classList.remove('show');
        showSuccess(`账号「${payload.username}」已创建`);
        loadUserAdmin();
    } catch {
        errEl.textContent = '网络错误'; errEl.style.display = 'block';
    } finally {
        saveBtn.disabled = false; saveBtn.textContent = '创建账号';
    }
});

// ---- 分配角色 ----
async function openAssignRole(userId, username, currentRoleId) {
    document.getElementById('assignRoleUserId').value = userId;
    document.getElementById('assignRoleDesc').textContent = `为用户「${username}」分配权限角色`;
    const select = document.getElementById('assignRoleSelect');
    select.innerHTML = '<option value="">不分配角色（使用独立权限配置）</option>';
    try {
        const res = await fetch('/api/admin/roles', { credentials: 'include' });
        if (res.ok) {
            const roles = await res.json();
            roles.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.id;
                opt.textContent = r.name + (r.description ? ' — ' + r.description : '');
                if (r.id === currentRoleId) opt.selected = true;
                select.appendChild(opt);
            });
        }
    } catch {}
    document.getElementById('assignRoleModal').classList.add('show');
}

document.getElementById('assignRoleModalClose')?.addEventListener('click', () => {
    document.getElementById('assignRoleModal').classList.remove('show');
});
document.getElementById('assignRoleCancelBtn')?.addEventListener('click', () => {
    document.getElementById('assignRoleModal').classList.remove('show');
});
document.getElementById('assignRoleModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('assignRoleModal'))
        document.getElementById('assignRoleModal').classList.remove('show');
});

document.getElementById('assignRoleSaveBtn')?.addEventListener('click', async () => {
    const userId  = document.getElementById('assignRoleUserId').value;
    const roleVal = document.getElementById('assignRoleSelect').value;
    const btn     = document.getElementById('assignRoleSaveBtn');
    btn.disabled  = true; btn.textContent = '保存中…';
    try {
        const res = await fetch(`/api/admin/users/${userId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ role_id: roleVal ? parseInt(roleVal) : -1 }),
        });
        if (!res.ok) { const d = await res.json(); showError(d.detail || '保存失败'); return; }
        document.getElementById('assignRoleModal').classList.remove('show');
        showSuccess('角色已更新');
        loadUserAdmin();
    } catch { showError('网络错误'); }
    finally { btn.disabled = false; btn.textContent = '保存'; }
});

// ---- 角色管理 ----
async function loadRoleAdmin() {
    const container = document.getElementById('roleAdminContainer');
    if (!container) return;
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const res = await fetch('/api/admin/roles', { credentials: 'include' });
        if (!res.ok) { container.innerHTML = '<div class="error-message">加载失败</div>'; return; }
        const roles = await res.json();
        if (roles.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="empty-icon">🎭</div><div>暂无角色，点击"新建角色"开始创建</div></div>';
            return;
        }
        container.innerHTML = roles.map(r => renderRoleCard(r)).join('');
    } catch {
        container.innerHTML = '<div class="error-message">加载失败</div>';
    }
}

function renderRoleCard(r) {
    let perms = null;
    try { if (r.permissions) perms = JSON.parse(r.permissions); } catch {}
    const isAll = perms === null;
    const tagHtml = PERMISSIONABLE_PAGES.map(pageId => {
        const allowed = isAll || perms.includes(pageId);
        const label   = PAGE_META[pageId]?.label || pageId;
        return `<span class="perm-tag ${allowed ? 'perm-tag-on' : 'perm-tag-off'}">${label}</span>`;
    }).join('');

    return `<div class="role-card" id="roleCard_${r.id}">
        <div class="role-card-header">
            <div>
                <span class="role-card-name">🎭 ${_escHtml(r.name)}</span>
                ${r.description ? `<span class="role-card-desc">${_escHtml(r.description)}</span>` : ''}
                <span class="role-card-perm-count">${isAll ? '全部页面' : `${perms.length} 个页面`}</span>
            </div>
            <div style="display:flex;gap:8px;">
                <button class="btn btn-small btn-secondary" onclick="openRoleModal(${r.id})">编辑</button>
                <button class="btn btn-small btn-danger" onclick="deleteRole(${r.id}, '${_escHtml(r.name)}')">删除</button>
            </div>
        </div>
        <div class="perm-tag-list">${tagHtml}</div>
    </div>`;
}

// ---- 角色 Modal ----
async function openRoleModal(id) {
    document.getElementById('roleId').value = id || '';
    document.getElementById('roleModalTitle').textContent = id ? '编辑角色' : '新建角色';
    document.getElementById('roleForm').reset();
    document.getElementById('roleModalError').style.display = 'none';

    let currentPerms = null;
    if (id) {
        try {
            const res = await fetch('/api/admin/roles', { credentials: 'include' });
            if (res.ok) {
                const roles = await res.json();
                const role  = roles.find(r => r.id === id);
                if (role) {
                    document.getElementById('roleName').value = role.name || '';
                    document.getElementById('roleDesc').value = role.description || '';
                    if (role.permissions) {
                        try { currentPerms = new Set(JSON.parse(role.permissions)); } catch {}
                    }
                }
            }
        } catch {}
    }

    const isAll = currentPerms === null;
    // 按分组渲染复选框
    const groups = {};
    PERMISSIONABLE_PAGES.forEach(pageId => {
        const meta = PAGE_META[pageId];
        if (!groups[meta.group]) groups[meta.group] = [];
        groups[meta.group].push({ pageId, label: meta.label });
    });

    document.getElementById('rolePermGroups').innerHTML = Object.entries(groups).map(([group, pages]) => `
        <div>
            <div style="font-weight:600;font-size:0.78rem;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${group}</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
                ${pages.map(({ pageId, label }) => `
                    <label style="display:flex;align-items:center;gap:6px;padding:6px 12px;border:1.5px solid var(--gray-200);border-radius:var(--radius);cursor:pointer;font-size:0.88rem;background:var(--gray-50);user-select:none;">
                        <input type="checkbox" class="role-perm-checkbox" data-page="${pageId}"
                            style="accent-color:var(--primary);width:14px;height:14px;"
                            ${isAll || currentPerms.has(pageId) ? 'checked' : ''}
                            ${isAll ? 'disabled' : ''}>
                        ${label}
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');

    const allCheck = document.getElementById('rolePermAllCheck');
    const newCheck = allCheck.cloneNode(true);
    allCheck.parentNode.replaceChild(newCheck, allCheck);
    document.getElementById('rolePermAllCheck').checked = isAll;
    document.getElementById('rolePermAllCheck').addEventListener('change', ev => {
        const checked = ev.target.checked;
        document.querySelectorAll('.role-perm-checkbox').forEach(cb => {
            cb.checked = checked; cb.disabled = checked;
        });
    });

    document.getElementById('roleModal').classList.add('show');
}

document.getElementById('roleModalClose')?.addEventListener('click', () => {
    document.getElementById('roleModal').classList.remove('show');
});
document.getElementById('roleModalCancelBtn')?.addEventListener('click', () => {
    document.getElementById('roleModal').classList.remove('show');
});
document.getElementById('roleModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('roleModal'))
        document.getElementById('roleModal').classList.remove('show');
});

document.getElementById('roleForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id      = document.getElementById('roleId').value;
    const errEl   = document.getElementById('roleModalError');
    const saveBtn = document.getElementById('roleModalSaveBtn');
    errEl.style.display = 'none';

    const isAll = document.getElementById('rolePermAllCheck').checked;
    const selectedPerms = isAll
        ? null
        : Array.from(document.querySelectorAll('.role-perm-checkbox:checked')).map(cb => cb.dataset.page);

    const payload = {
        name:        document.getElementById('roleName').value.trim(),
        description: document.getElementById('roleDesc').value.trim() || null,
        permissions: selectedPerms === null ? null : JSON.stringify(selectedPerms),
    };

    saveBtn.disabled = true; saveBtn.textContent = '保存中…';
    try {
        const url    = id ? `/api/admin/roles/${id}` : '/api/admin/roles';
        const method = id ? 'PATCH' : 'POST';
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.detail || '保存失败'; errEl.style.display = 'block'; return; }
        document.getElementById('roleModal').classList.remove('show');
        showSuccess(id ? '角色已更新' : '角色已创建');
        loadRoleAdmin();
    } catch { errEl.textContent = '网络错误'; errEl.style.display = 'block'; }
    finally { saveBtn.disabled = false; saveBtn.textContent = '保存'; }
});

async function deleteRole(id, name) {
    showConfirm({ title: '删除角色', message: `确定要删除角色「${name}」吗？已分配该角色的用户将被解除绑定。`, onConfirm: async () => {
        try {
            const res = await fetch(`/api/admin/roles/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) { const d = await res.json(); showError(d.detail || '删除失败'); return; }
            showSuccess('已删除');
            loadRoleAdmin();
        } catch { showError('删除失败'); }
    }});
}

// =====================================================
// ===== 时间相册 (Photo Album / Timeline) ==========
// =====================================================

let _photoPage = 1;
let _photoSearchTimer;
let _currentAlbumId = null;
let _lbImages = [];
let _lbIndex  = 0;

// ---- Load & render timeline ----
async function loadPhotoAlbum(page) {
    _photoPage = page || _photoPage;
    const search   = document.getElementById('photoSearch')?.value.trim()   || '';
    const dateFrom = document.getElementById('photoDateFrom')?.value || '';
    const dateTo   = document.getElementById('photoDateTo')?.value   || '';
    const params   = new URLSearchParams({ page: _photoPage, page_size: 20, search, date_from: dateFrom, date_to: dateTo });
    try {
        const res = await fetch(`/api/timemachine/photo-album?${params}`, { credentials: 'include' });
        if (!res.ok) throw new Error();
        const data = await res.json();
        document.getElementById('photoInfo').textContent = `共 ${data.total} 组照片`;
        renderPhotoTimeline(data.items);
        renderPhotoPagination(data.page, data.total_pages);
    } catch { showError('加载失败'); }
}

function renderPhotoTimeline(items) {
    const el = document.getElementById('photoTimeline');
    if (!items.length) {
        el.innerHTML = '<div style="padding:60px 0;text-align:center;color:var(--gray-400);font-size:1rem;">📷 还没有照片，点击「新建相册」上传第一张吧</div>';
        return;
    }
    const groups = {};
    items.forEach(item => {
        const [y, m] = item.date.split('-');
        const key = `${y}-${m}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    });

    const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
    let html = '<div class="photo-timeline-wrap">';
    Object.keys(groups).sort((a, b) => b.localeCompare(a)).forEach(key => {
        const [y, m] = key.split('-');
        html += `
        <div class="photo-tl-group">
            <div class="photo-tl-month-label">
                <span class="photo-tl-year">${y}</span>
                <span class="photo-tl-month-name">${monthNames[parseInt(m)-1]}</span>
            </div>
            <div class="photo-tl-items">`;
        groups[key].forEach(item => {
            const imgs = (() => { try { return JSON.parse(item.images || '[]'); } catch { return []; } })();
            const day = item.date.split('-')[2];
            const moodHtml = item.mood ? `<span style="font-size:1.2rem;">${item.mood}</span>` : '';
            const locHtml  = item.location ? `<span class="photo-card-loc">📍 ${item.location}</span>` : '';
            const tagsHtml = item.tags ? item.tags.split(',').map(t => t.trim()).filter(Boolean)
                .map(t => `<span class="photo-card-tag">${t}</span>`).join('') : '';
            const imgCount = imgs.length;
            const previewImgs = imgs.slice(0, 4);
            const gridClass = imgCount === 1 ? 'photo-grid-1' : imgCount === 2 ? 'photo-grid-2' : imgCount === 3 ? 'photo-grid-3' : 'photo-grid-4';

            html += `
            <div class="photo-tl-item">
                <div class="photo-tl-dot-col">
                    <div class="photo-tl-day">${day}</div>
                    <div class="photo-tl-line"></div>
                </div>
                <div class="photo-card">
                    <div class="photo-card-top">
                        <div class="photo-card-meta">
                            ${moodHtml}
                            <span class="photo-card-title">${item.title || item.date}</span>
                            ${locHtml}
                        </div>
                        <div class="photo-card-actions">
                            <button class="icon-btn" title="编辑/上传" onclick="openPhotoAlbumModal(${item.id})">✏️</button>
                            <button class="icon-btn" title="删除" onclick="deletePhotoAlbum(${item.id})">🗑️</button>
                        </div>
                    </div>
                    ${item.description ? `<div class="photo-card-desc">${item.description}</div>` : ''}
                    ${imgCount > 0 ? `
                    <div class="photo-img-grid ${gridClass}">
                        ${previewImgs.map((url, i) => `
                        <div class="photo-img-slot" onclick="openLightbox(${item.id}, ${i}, event)">
                            <img src="${url}" loading="lazy" alt="">
                            ${i === 3 && imgCount > 4 ? `<div class="photo-more-overlay">+${imgCount - 4}</div>` : ''}
                        </div>`).join('')}
                    </div>` : `<div class="photo-no-img" onclick="openPhotoAlbumModal(${item.id})">📷 点击上传照片</div>`}
                    ${tagsHtml ? `<div class="photo-card-tags">${tagsHtml}</div>` : ''}
                </div>
            </div>`;
        });
        html += '</div></div>';
    });
    html += '</div>';
    el.innerHTML = html;
}

function renderPhotoPagination(cur, pages) {
    const el = document.getElementById('photoPagination');
    if (pages <= 1) { el.innerHTML = ''; return; }
    let html = `<button class="page-btn" ${cur===1?'disabled':''} onclick="loadPhotoAlbum(${cur-1})">‹</button>`;
    const start = Math.max(1, cur-2), end = Math.min(pages, cur+2);
    if (start > 1) html += `<button class="page-btn" onclick="loadPhotoAlbum(1)">1</button>${start>2?'<span class="page-ellipsis">…</span>':''}`;
    for (let i = start; i <= end; i++)
        html += `<button class="page-btn${i===cur?' active':''}" onclick="loadPhotoAlbum(${i})">${i}</button>`;
    if (end < pages) html += `${end<pages-1?'<span class="page-ellipsis">…</span>':''}<button class="page-btn" onclick="loadPhotoAlbum(${pages})">${pages}</button>`;
    html += `<button class="page-btn" ${cur===pages?'disabled':''} onclick="loadPhotoAlbum(${cur+1})">›</button>`;
    el.innerHTML = html;
}

document.getElementById('photoSearch')?.addEventListener('input', () => {
    clearTimeout(_photoSearchTimer);
    _photoSearchTimer = setTimeout(() => loadPhotoAlbum(1), 400);
});

// ---- Modal open / close ----

// 初始化年份下拉
(function initPhotoYearSelect() {
    const sel = document.getElementById('photoYear');
    if (!sel) return;
    const cur = new Date().getFullYear();
    sel.innerHTML = '<option value="">年</option>';
    for (let y = cur; y >= 2000; y--)
        sel.innerHTML += `<option value="${y}">${y}年</option>`;
})();

// 月份变化时更新日
function _updatePhotoDays() {
    const y = document.getElementById('photoYear')?.value;
    const m = document.getElementById('photoMonth')?.value;
    const daySel = document.getElementById('photoDay');
    if (!daySel) return;
    const prev = daySel.value;
    const days = (y && m) ? new Date(y, m, 0).getDate() : 31;
    daySel.innerHTML = '<option value="">日</option>';
    for (let d = 1; d <= days; d++) {
        const v = String(d).padStart(2, '0');
        daySel.innerHTML += `<option value="${v}">${d}日</option>`;
    }
    if (prev && parseInt(prev) <= days) daySel.value = prev;
}
document.getElementById('photoYear')?.addEventListener('change', _updatePhotoDays);
document.getElementById('photoMonth')?.addEventListener('change', _updatePhotoDays);

function _getPhotoDate() {
    const y = document.getElementById('photoYear')?.value;
    const m = document.getElementById('photoMonth')?.value;
    const d = document.getElementById('photoDay')?.value;
    return (y && m && d) ? `${y}-${m}-${d}` : '';
}

function _setPhotoDate(dateStr) {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split('-');
    const ySel = document.getElementById('photoYear');
    const mSel = document.getElementById('photoMonth');
    if (ySel) ySel.value = y;
    if (mSel) mSel.value = m;
    _updatePhotoDays();
    const dSel = document.getElementById('photoDay');
    if (dSel) dSel.value = d;
}

async function openPhotoAlbumModal(id) {
    _currentAlbumId = id || null;
    // reset
    document.getElementById('photoAlbumId').value        = id || '';
    document.getElementById('photoAlbumTitle').value     = '';
    document.getElementById('photoAlbumLocation').value  = '';
    document.getElementById('photoAlbumTags').value      = '';
    document.getElementById('photoAlbumDesc').value      = '';
    document.getElementById('photoAlbumMood').value      = '';
    document.getElementById('photoAlbumModalTitle').textContent = id ? '编辑相册' : '新建相册';
    document.querySelectorAll('.photo-mood-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('photoUploadSection').style.display = id ? '' : 'none';
    document.getElementById('photoImagesPreview').innerHTML = '';
    // reset date dropdowns
    if (document.getElementById('photoYear')) document.getElementById('photoYear').value = '';
    if (document.getElementById('photoMonth')) document.getElementById('photoMonth').value = '';
    _updatePhotoDays();

    if (id) {
        try {
            const res = await fetch(`/api/timemachine/photo-album/${id}`, { credentials: 'include' });
            if (!res.ok) throw new Error();
            const d = await res.json();
            document.getElementById('photoAlbumTitle').value    = d.title || '';
            _setPhotoDate(d.date);
            document.getElementById('photoAlbumLocation').value = d.location || '';
            document.getElementById('photoAlbumTags').value     = d.tags || '';
            document.getElementById('photoAlbumDesc').value     = d.description || '';
            document.getElementById('photoAlbumMood').value     = d.mood || '';
            if (d.mood) {
                document.querySelectorAll('.photo-mood-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.mood === d.mood);
                });
            }
            const imgs = (() => { try { return JSON.parse(d.images || '[]'); } catch { return []; } })();
            renderPhotoModalImages(imgs, id);
        } catch { showError('加载失败'); return; }
    }
    document.getElementById('photoAlbumModal').classList.add('show');
}

function renderPhotoModalImages(imgs, albumId) {
    const el = document.getElementById('photoImagesPreview');
    el.innerHTML = imgs.map((url, i) => `
    <div class="photo-modal-thumb" data-url="${url}">
        <img src="${url}" alt="" onclick="openLightboxDirect(${JSON.stringify(imgs)}, ${i})">
        <button class="ann-img-del" onclick="deletePhotoImage('${url}', ${albumId})" title="删除">×</button>
        ${i === 0 ? '<span class="photo-cover-badge">封面</span>' : ''}
    </div>`).join('');
}

document.querySelectorAll('.photo-mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const already = btn.classList.contains('active');
        document.querySelectorAll('.photo-mood-btn').forEach(b => b.classList.remove('active'));
        if (!already) {
            btn.classList.add('active');
            document.getElementById('photoAlbumMood').value = btn.dataset.mood;
        } else {
            document.getElementById('photoAlbumMood').value = '';
        }
    });
});

document.getElementById('photoAlbumModalCancel')?.addEventListener('click', () => {
    document.getElementById('photoAlbumModal').classList.remove('show');
    loadPhotoAlbum();
});
document.getElementById('photoAlbumModalClose')?.addEventListener('click', () => {
    document.getElementById('photoAlbumModal').classList.remove('show');
    loadPhotoAlbum();
});
document.getElementById('photoAlbumModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('photoAlbumModal')) {
        document.getElementById('photoAlbumModal').classList.remove('show');
        loadPhotoAlbum();
    }
});

// ---- Save album ----
document.getElementById('photoAlbumForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id   = document.getElementById('photoAlbumId').value;
    const date = _getPhotoDate();
    if (!date) { showError('请选择拍摄日期'); return; }
    const payload = {
        title:       document.getElementById('photoAlbumTitle').value.trim()    || null,
        date,
        location:    document.getElementById('photoAlbumLocation').value.trim() || null,
        tags:        document.getElementById('photoAlbumTags').value.trim()     || null,
        description: document.getElementById('photoAlbumDesc').value.trim()    || null,
        mood:        document.getElementById('photoAlbumMood').value            || null,
    };
    const btn = document.getElementById('photoAlbumModalSave');
    btn.disabled = true; btn.textContent = '保存中…';
    try {
        const res = await fetch(
            `/api/timemachine/photo-album${id ? '/' + id : ''}`,
            { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload), credentials: 'include', headers: { 'Content-Type': 'application/json' } }
        );
        if (!res.ok) throw new Error();
        const saved = await res.json();
        showSuccess(id ? '已更新' : '已创建，现在可以上传照片了');
        if (!id) {
            document.getElementById('photoAlbumId').value = saved.id;
            _currentAlbumId = saved.id;
            document.getElementById('photoUploadSection').style.display = '';
            document.getElementById('photoAlbumModalTitle').textContent = '编辑相册';
        } else {
            document.getElementById('photoAlbumModal').classList.remove('show');
            loadPhotoAlbum();
        }
    } catch { showError('保存失败'); }
    finally { btn.disabled = false; btn.textContent = '保存'; }
});

// ---- Image upload ----
document.getElementById('photoUploadInput')?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const albumId = document.getElementById('photoAlbumId').value;
    if (!albumId) { showError('请先保存相册信息'); return; }
    const prog = document.getElementById('photoUploadProgress');
    prog.textContent = `上传中…`;
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    try {
        const res = await fetch(`/api/timemachine/photo-album/${albumId}/images/batch`, {
            method: 'POST', body: formData, credentials: 'include'
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.detail || '上传失败'); }
        const data = await res.json();
        renderPhotoModalImages(data.images, albumId);
        prog.textContent = `已上传 ${data.added.length} 张`;
        showSuccess(`上传成功 ${data.added.length} 张`);
    } catch (err) { showError(err.message || '上传失败'); prog.textContent = ''; }
    e.target.value = '';
});

async function deletePhotoImage(url, albumId) {
    try {
        const res = await fetch(`/api/timemachine/photo-album/${albumId}/images?url=${encodeURIComponent(url)}`, {
            method: 'DELETE', credentials: 'include'
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        renderPhotoModalImages(data.images, albumId);
    } catch { showError('删除失败'); }
}

function deletePhotoAlbum(id) {
    showConfirm({ title: '删除相册', message: '确定要删除这组照片吗？所有图片将一并删除，无法恢复。', onConfirm: async () => {
        try {
            const res = await fetch(`/api/timemachine/photo-album/${id}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error();
            showSuccess('已删除');
            loadPhotoAlbum();
        } catch { showError('删除失败'); }
    }});
}

// ---- Lightbox ----
async function openLightbox(albumId, startIndex, event) {
    if (event) event.stopPropagation();
    try {
        const res = await fetch(`/api/timemachine/photo-album/${albumId}`, { credentials: 'include' });
        if (!res.ok) throw new Error();
        const d = await res.json();
        _lbImages = (() => { try { return JSON.parse(d.images || '[]'); } catch { return []; } })();
        if (!_lbImages.length) return;
        _lbIndex = Math.min(startIndex, _lbImages.length - 1);
        updateLightbox();
        const lb = document.getElementById('photoLightbox');
        lb.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    } catch { /* silent */ }
}

function openLightboxDirect(imgs, startIndex) {
    _lbImages = imgs;
    _lbIndex  = startIndex;
    updateLightbox();
    document.getElementById('photoLightbox').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function updateLightbox() {
    document.getElementById('lbImg').src = _lbImages[_lbIndex];
    document.getElementById('lbCounter').textContent = `${_lbIndex + 1} / ${_lbImages.length}`;
    document.getElementById('lbPrev').style.display = _lbImages.length > 1 ? '' : 'none';
    document.getElementById('lbNext').style.display = _lbImages.length > 1 ? '' : 'none';
}

function lightboxNav(dir) {
    _lbIndex = (_lbIndex + dir + _lbImages.length) % _lbImages.length;
    updateLightbox();
}

function closeLightbox() {
    document.getElementById('photoLightbox').style.display = 'none';
    document.body.style.overflow = '';
}

document.addEventListener('keydown', e => {
    const lb = document.getElementById('photoLightbox');
    if (lb && lb.style.display === 'flex') {
        if (e.key === 'ArrowLeft')  lightboxNav(-1);
        if (e.key === 'ArrowRight') lightboxNav(1);
        if (e.key === 'Escape')     closeLightbox();
    }
});
