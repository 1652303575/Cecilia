// API Base URL
const API_BASE = '';

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

function showLoginOverlay() {
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('appLayout').style.display = 'none';
}

function onLoginSuccess(user) {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('appLayout').style.display = '';
    window._currentUser = user;
    // 非 admin 隐藏 admin-only 入口
    if (user.role !== 'admin') {
        document.querySelectorAll('[data-page="feedbackAdmin"]').forEach(el => el.style.display = 'none');
        document.querySelectorAll('[data-page="userAdmin"]').forEach(el => el.style.display = 'none');
    }
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
    feedback:         { group: '其他', label: '意见反馈' },
    feedbackAdmin:    { group: '其他', label: '反馈管理' },
    userAdmin:        { group: '其他', label: '用户管理' },
    profile:          { group: '其他', label: '个人资料' },
    guide:            { group: '其他', label: '使用手册' },
};

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
    if (pageId === 'emailSend')        loadSendCustomerSearch();
    if (pageId === 'emailBulk')        loadBulkCustomers();
    if (pageId === 'emailSentLog')     loadSentLog();
    if (pageId === 'contactStats')     loadContactStats();
    if (pageId === 'emailTemplates')   loadEmailTemplates();
    if (pageId === 'profile')          loadProfile();
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
async function loadTemplates() {
    const container = document.getElementById('templatesContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const response = await fetch(`${API_BASE}/api/templates`, { credentials: 'include' });
        const templates = await response.json();

        if (templates.length === 0) {
            container.innerHTML = '<div class="empty-state"><h3>暂无模板</h3><p>点击"添加新模板"创建您的第一个模板</p></div>';
            return;
        }

        container.innerHTML = '';
        templates.forEach(template => {
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
    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = '<div class="error-message">加载模板失败</div>';
    }
}

// Delete template
async function deleteTemplate(id) {
    if (!confirm('确定要删除这个模板吗？')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/templates/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error('删除失败');
        }

        showSuccess('模板已删除');
        loadTemplates();
    } catch (error) {
        console.error('Error:', error);
        showError('删除失败');
    }
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
async function loadHistory(q = '', customer = '') {
    const container = document.getElementById('historyContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const params = new URLSearchParams({ limit: 50 });
        if (q) params.set('q', q);
        if (customer) params.set('customer', customer);
        const response = await fetch(`${API_BASE}/api/history?${params}`, { credentials: 'include' });
        const history = await response.json();

        if (history.length === 0) {
            container.innerHTML = q || customer
                ? '<div class="empty-state"><h3>未找到匹配记录</h3><p>尝试修改搜索条件</p></div>'
                : '<div class="empty-state"><h3>暂无历史记录</h3><p>开始生成您的第一个邮件回复吧！</p></div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'history-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th style="width:110px">时间</th>
                    <th style="width:90px">场景</th>
                    <th style="width:80px">语气</th>
                    <th style="width:160px">标题</th>
                    <th>生成回复</th>
                    <th style="width:70px">操作</th>
                </tr>
            </thead>
            <tbody id="historyTbody"></tbody>
        `;
        container.innerHTML = '';
        container.appendChild(table);

        const tbody = document.getElementById('historyTbody');
        window._historyData = {};
        window._historyItems = {};

        history.forEach(item => {
            window._historyData[item.id] = {
                zh: item.generated_reply,
                en: item.reply_en || null,
                wechat: item.reply_wechat || null
            };
            window._historyItems[item.id] = item;

            const createdAt = fmtTime(item.created_at);

            const hasTabs = item.reply_en || item.reply_wechat;
            const replyCell = hasTabs ? `
                <div class="reply-tabs">
                    <div class="reply-tab-btns">
                        <button class="reply-tab-btn active" onclick="switchReplyTab(${item.id}, 'zh', this)">中文</button>
                        ${item.reply_en ? `<button class="reply-tab-btn" onclick="switchReplyTab(${item.id}, 'en', this)">英文邮件</button>` : ''}
                        ${item.reply_wechat ? `<button class="reply-tab-btn" onclick="switchReplyTab(${item.id}, 'wechat', this)">微信</button>` : ''}
                    </div>
                    <div id="reply-content-${item.id}" class="cell-text-clamp">${escapeHtml(item.generated_reply)}</div>
                </div>
            ` : `<div class="cell-text-clamp">${escapeHtml(item.generated_reply)}</div>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="cell-time">${createdAt}</td>
                <td><span class="tag">${escapeHtml(item.scenario)}</span></td>
                <td><span class="tag tag-tone">${escapeHtml(item.tone)}</span></td>
                <td class="cell-content">
                    <div class="cell-title">${item.title ? escapeHtml(item.title) : '<span style="color:#bbb">—</span>'}</div>
                </td>
                <td class="cell-content">
                    <div class="cell-text-clamp">${escapeHtml(item.generated_reply)}</div>
                </td>
                <td class="cell-actions">
                    <button class="btn btn-small btn-view" onclick="openHistoryDetail(${item.id})">查看</button>
                    <button class="btn btn-small btn-danger" onclick="deleteHistory(${item.id})">删除</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = '<div class="error-message">加载历史记录失败</div>';
    }
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
    if (!confirm('确定要删除这条记录吗？')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/history/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        });

        if (!response.ok) {
            throw new Error('删除失败');
        }

        showSuccess('记录已删除');
        loadHistory();
    } catch (error) {
        console.error('Error:', error);
        showError('删除失败');
    }
}

refreshHistoryBtn.addEventListener('click', loadHistory);
document.getElementById('historySearchBtn').addEventListener('click', () => {
    const q = document.getElementById('historySearchQ').value.trim();
    const customer = document.getElementById('historySearchCustomer').value;
    loadHistory(q, customer);
});
document.getElementById('historySearchClearBtn').addEventListener('click', () => {
    document.getElementById('historySearchQ').value = '';
    document.getElementById('historySearchCustomer').value = '';
    loadHistory();
});
document.getElementById('historySearchQ').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('historySearchBtn').click();
});
document.getElementById('historySearchCustomer').addEventListener('change', () => {
    document.getElementById('historySearchBtn').click();
});

// Global settings
async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE}/api/settings`, { credentials: 'include' });
        const settings = await response.json();

        document.getElementById('companyName').value = settings.company_name || '';
        document.getElementById('productsInfo').value = settings.products_info || '';
        document.getElementById('contactInfo').value = settings.contact_info || '';
        document.getElementById('companySignature').value = settings.company_signature || '';
        // Email account
        document.getElementById('settingsEmailAddress').value = settings.email_address || '';
        document.getElementById('settingsEmailPassword').value = settings.email_password || '';
        document.getElementById('settingsSmtpHost').value = settings.smtp_host || 'smtp.qiye.aliyun.com';
        document.getElementById('settingsSmtpPort').value = settings.smtp_port || 465;
        document.getElementById('settingsImapHost').value = settings.imap_host || 'imap.qiye.aliyun.com';
        document.getElementById('settingsImapPort').value = settings.imap_port || 993;
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
async function loadFeedbackAdmin() {
    const container = document.getElementById('feedbackAdminContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const response = await fetch(`${API_BASE}/api/feedback`, { credentials: 'include' });
        const list = await response.json();

        if (list.length === 0) {
            container.innerHTML = '<div class="empty-state"><h3>暂无反馈</h3><p>用户提交意见后将在此显示</p></div>';
            return;
        }

        container.innerHTML = '';
        list.forEach(item => {
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
    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = '<div class="error-message">加载反馈失败</div>';
    }
}

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
    if (!confirm('确定要删除这条反馈吗？')) return;
    try {
        const response = await fetch(`${API_BASE}/api/feedback/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!response.ok) throw new Error('删除失败');
        loadFeedbackAdmin();
    } catch (error) {
        console.error('Error:', error);
        showError('删除失败');
    }
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
    if (!confirm(`删除类型「${typeName}」？`)) return;
    _customEmailTypes = _customEmailTypes.filter(t => t !== typeName);
    _renderCustomTypeCards();
    await _saveCustomEmailTypes();
    showSuccess(`已删除「${typeName}」`);
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

async function loadComposeHistory(q = '', customer = '') {
    const container = document.getElementById('composeHistoryContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const params = new URLSearchParams({ limit: 50 });
        if (q) params.set('q', q);
        if (customer) params.set('customer', customer);
        const res = await fetch(`${API_BASE}/api/compose/history?${params}`, { credentials: 'include' });
        const records = await res.json();

        if (!records.length) {
            container.innerHTML = q || customer
                ? '<div class="empty-state"><h3>未找到匹配记录</h3><p>尝试修改搜索条件</p></div>'
                : '<div class="empty-state"><h3>暂无撰写记录</h3><p>生成邮件后自动保存在这里</p></div>';
            return;
        }

        records.forEach(r => { _composeHistoryData[r.id] = r; });

        const typeIcons = { '开发信':'🚀','跟进邮件':'🔄','产品推荐':'🎯','报价跟进':'💰','节后跟进':'🎉','自定义':'✏️' };

        container.innerHTML = records.map(r => {
            const icon = typeIcons[r.email_type] || '✉️';
            const date = fmtTime(r.created_at);

            // Extract subject line and body preview separately
            const lines = (r.reply_en || '').split('\n');
            let subject = '';
            let bodyLines = [];
            for (const line of lines) {
                if (!subject && line.trim().toLowerCase().startsWith('subject:')) {
                    subject = line.trim().replace(/^subject:\s*/i, '');
                } else if (line.trim()) {
                    bodyLines.push(line.trim());
                }
            }
            const bodyPreview = bodyLines.join(' ').substring(0, 100);

            const customerTag = r.customer_name
                ? `<span class="tag tag-customer">👤 ${escapeHtml(r.customer_name)}</span>`
                : '';
            const subjectLine = subject
                ? `<div class="compose-history-subject">📌 ${escapeHtml(subject)}</div>`
                : '';
            const targetLine = r.target_info
                ? `<div class="compose-history-target">要求：${escapeHtml(r.target_info.substring(0, 80))}${r.target_info.length > 80 ? '…' : ''}</div>`
                : '';
            return `
            <div class="compose-history-card" id="compose-card-${r.id}">
                <div class="compose-history-header">
                    <div class="compose-history-meta">
                        <span class="compose-history-type">${icon} ${r.email_type}</span>
                        <span class="tag tag-tone">${r.tone}</span>
                        ${customerTag}
                        <span class="cell-time">${date}</span>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-small btn-view" onclick="toggleComposeDetail(${r.id}, this)">查看</button>
                        <button class="btn btn-small btn-danger" onclick="deleteComposeHistory(${r.id})">删除</button>
                    </div>
                </div>
                ${subjectLine}
                ${targetLine}
                <div class="compose-history-preview">${escapeHtml(bodyPreview)}${bodyPreview ? '…' : ''}</div>
                <div class="compose-history-detail" id="compose-detail-${r.id}" style="display:none;">
                    <div class="compose-detail-tabs">
                        <button class="compose-result-tab-btn active" onclick="switchComposeDetailLang(${r.id},'en',this)">✉️ 英文邮件</button>
                        <button class="compose-result-tab-btn" onclick="switchComposeDetailLang(${r.id},'zh',this)">📝 中文对照</button>
                    </div>
                    <div class="result-content" id="compose-detail-content-${r.id}" style="margin-top:10px;white-space:pre-wrap;">${r.reply_en}</div>
                    <div class="form-actions" style="margin-top:10px;">
                        <button class="btn btn-secondary btn-small" onclick="copyComposeHistory(${r.id})">复制</button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
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
    document.getElementById(`compose-detail-content-${id}`).textContent = record['reply_' + lang] || '';
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
    if (!confirm('确定删除这条撰写记录吗？')) return;
    try {
        const res = await fetch(`${API_BASE}/api/compose/history/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('删除失败');
        loadComposeHistory();
    } catch (e) {
        showError('删除失败');
    }
}

document.getElementById('refreshComposeHistoryBtn').addEventListener('click', loadComposeHistory);
document.getElementById('composeHistorySearchBtn').addEventListener('click', () => {
    const q = document.getElementById('composeHistorySearchQ').value.trim();
    const customer = document.getElementById('composeHistorySearchCustomer').value;
    loadComposeHistory(q, customer);
});
document.getElementById('composeHistorySearchClearBtn').addEventListener('click', () => {
    document.getElementById('composeHistorySearchQ').value = '';
    document.getElementById('composeHistorySearchCustomer').value = '';
    loadComposeHistory();
});
document.getElementById('composeHistorySearchQ').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('composeHistorySearchBtn').click();
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

async function loadComposeTemplates() {
    const container = document.getElementById('composeTemplatesContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
    try {
        const res = await fetch(`${API_BASE}/api/compose/templates`, { credentials: 'include' });
        const list = await res.json();
        if (!list.length) {
            container.innerHTML = '<div class="empty-state"><h3>暂无撰写模板</h3><p>点击「添加撰写模板」创建第一个模板</p></div>';
            return;
        }
        container.innerHTML = list.map(t => `
            <div class="template-card">
                <div class="template-card-header">
                    <div>
                        <h3>${TYPE_ICONS[t.email_type] || '✉️'} ${t.name}</h3>
                        <div class="template-meta">
                            <span class="meta-item">${t.email_type}</span>
                            <span class="meta-item">${t.tone}</span>
                        </div>
                        ${t.description ? `<p style="font-size:0.85rem;color:var(--gray-500);margin-top:6px;">${t.description}</p>` : ''}
                        ${t.fixed_requirements ? `
                        <div style="margin-top:8px;padding:8px 12px;background:var(--primary-light);border-radius:6px;font-size:0.82rem;color:var(--primary);white-space:pre-wrap;">${t.fixed_requirements}</div>
                        ` : ''}
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-small btn-danger" onclick="deleteComposeTemplate(${t.id})">删除</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
    }
}

async function deleteComposeTemplate(id) {
    if (!confirm('确定删除这个撰写模板吗？')) return;
    try {
        const res = await fetch(`${API_BASE}/api/compose/templates/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('删除失败');
        showSuccess('已删除');
        loadComposeTemplates();
    } catch (e) {
        showError('删除失败');
    }
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

async function loadCustomers(statusFilter = '') {
    const container = document.getElementById('customersContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const url = statusFilter
            ? `${API_BASE}/api/customers?status=${encodeURIComponent(statusFilter)}`
            : `${API_BASE}/api/customers`;
        const res = await fetch(url, { credentials: 'include' });
        const customers = await res.json();
        _customerList = customers;
        _refreshCustomerSelectors();

        if (!customers.length) {
            container.innerHTML = '<div class="empty-state"><h3>暂无客户</h3><p>点击「添加客户」创建第一个客户档案</p></div>';
            return;
        }
        container.innerHTML = customers.map(_renderCustomerCard).join('');
    } catch (e) {
        container.innerHTML = '<div class="error-message">加载失败</div>';
    }
}

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
        country:      document.getElementById('customerCountry').value.trim()      || null,
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
        loadCustomers(document.getElementById('customerStatusFilter').value);
    } catch (err) {
        showError(err.message);
    }
}

async function deleteCustomer(id) {
    if (!confirm('确定删除这个客户？相关历史记录的客户关联会被清除，但记录本身保留。')) return;
    try {
        const res = await fetch(`${API_BASE}/api/customers/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) throw new Error('删除失败');
        showSuccess('客户已删除');
        loadCustomers(document.getElementById('customerStatusFilter').value);
    } catch (e) {
        showError('删除失败');
    }
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
    document.getElementById('customerCountry').value      = c.country       || '';
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

document.getElementById('customerStatusFilter').addEventListener('change', function() {
    loadCustomers(this.value);
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
                    loadCustomers(document.getElementById('customerStatusFilter').value);
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
fetch(`${API_BASE}/api/customers`, { credentials: 'include' })
    .then(r => r.json())
    .then(list => { _customerList = list; _refreshCustomerSelectors(); })
    .catch(() => {});

// ===== 用户管理（admin only） =====

async function loadUserAdmin() {
    const container = document.getElementById('userAdminContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const res = await fetch('/api/admin/users', { credentials: 'include' });
        if (!res.ok) {
            container.innerHTML = '<div class="error-message">加载失败</div>';
            return;
        }
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
                            <td><strong>${u.username}</strong></td>
                            <td><span class="role-badge role-${u.role}">${u.role === 'admin' ? '👑 管理员' : '👤 普通用户'}</span></td>
                            <td><span class="status-badge ${u.is_active ? 'status-active' : 'status-closed'}">${u.is_active ? '正常' : '已禁用'}</span></td>
                            <td style="color:var(--gray-400);font-size:0.85rem;">${fmtTime(u.created_at, {year:'numeric',month:'2-digit',day:'2-digit'})}</td>
                            <td class="user-actions">
                                <button class="btn btn-small btn-secondary" onclick="openResetPassword(${u.id}, '${u.username}')">重置密码</button>
                                ${window._currentUser && window._currentUser.id !== u.id
                                    ? `<button class="btn btn-small ${u.is_active ? 'btn-danger' : 'btn-primary'}" onclick="toggleUserActive(${u.id}, ${u.is_active})">${u.is_active ? '禁用' : '启用'}</button>`
                                    : '<span style="color:var(--gray-300);font-size:0.8rem;">（自己）</span>'
                                }
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
    if (!confirm(`确定要${action}该账号吗？`)) return;
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

// ===================================================
//  邮件中心 — Email Center
// ===================================================

// ───── 收件箱 ─────
let _inboxCache = [];

document.getElementById('refreshInboxBtn').addEventListener('click', loadInbox);

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
        const emails = await res.json();
        _inboxCache = emails;
        statusEl.textContent = `共 ${emails.length} 封`;
        renderInbox(emails);
    } catch (e) {
        container.innerHTML = `<div class="error-message">加载失败：${e.message}</div>`;
    }
}

function renderInbox(emails) {
    const container = document.getElementById('inboxContainer');
    if (!emails.length) {
        container.innerHTML = '<div class="empty-state"><h3>收件箱为空</h3><p>暂无邮件</p></div>';
        return;
    }
    const rows = emails.map(m => `
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


// ───── 发邮件（单发） ─────
// 发邮件 — 客户搜索关联
let _sendSelectedCustomerId = null;
let _sendSelectedCustomer = null;

function initSendCustomerSearch() {
    const input    = document.getElementById('sendCustSearchInput');
    const dropdown = document.getElementById('sendCustSearchDropdown');
    const clearBtn = document.getElementById('sendCustSearchClear');
    const hint     = document.getElementById('sendCustomerHint');

    const STATUS_LABEL = { prospect: '潜在客户', active: '活跃客户', paused: '暂停跟进', closed: '已关闭' };
    const STATUS_ORDER = ['active', 'prospect', 'paused', 'closed'];

    function renderTree() {
        if (!_customerList.length) {
            dropdown.innerHTML = '<div class="cust-search-empty">暂无客户，请先在「客户管理」添加</div>';
            dropdown.style.display = 'block';
            return;
        }
        const groups = {};
        _customerList.forEach(c => {
            const s = c.status || 'prospect';
            if (!groups[s]) groups[s] = [];
            groups[s].push(c);
        });
        const order = [...STATUS_ORDER, ...Object.keys(groups).filter(k => !STATUS_ORDER.includes(k))];
        dropdown.innerHTML = order.filter(s => groups[s]).map(s => `
            <div class="cust-tree-group">
                <div class="cust-tree-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
                    <span class="cust-tree-arrow">▾</span>
                    <span class="cust-tree-group-label">${STATUS_LABEL[s] || s}</span>
                    <span class="cust-tree-count">${groups[s].length}</span>
                </div>
                <div class="cust-tree-items">
                    ${groups[s].map(c => `
                        <div class="cust-search-item" data-id="${c.id}">
                            <span class="cust-search-name">${escapeHtml(c.name)}${c.company ? ' · ' + escapeHtml(c.company) : ''}</span>
                            <span class="cust-search-email">${escapeHtml(c.email || '无邮箱')}</span>
                        </div>`).join('')}
                </div>
            </div>`).join('');
        bindItems();
        dropdown.style.display = 'block';
    }

    function renderSearch(q) {
        const matches = _customerList.filter(c =>
            c.name.toLowerCase().includes(q) ||
            (c.company || '').toLowerCase().includes(q) ||
            (c.email || '').toLowerCase().includes(q)
        ).slice(0, 12);
        if (!matches.length) {
            dropdown.innerHTML = '<div class="cust-search-empty">无匹配客户</div>';
        } else {
            dropdown.innerHTML = matches.map(c => `
                <div class="cust-search-item" data-id="${c.id}">
                    <span class="cust-search-name">${escapeHtml(c.name)}${c.company ? ' · ' + escapeHtml(c.company) : ''}</span>
                    <span class="cust-search-email">${escapeHtml(c.email || '无邮箱')}</span>
                </div>`).join('');
            bindItems();
        }
        dropdown.style.display = 'block';
    }

    function bindItems() {
        dropdown.querySelectorAll('.cust-search-item').forEach(el => {
            el.addEventListener('click', () => {
                const c = _customerList.find(x => x.id === parseInt(el.dataset.id));
                if (c) selectSendCustomer(c);
            });
        });
    }

    input.addEventListener('focus', () => {
        if (!input.disabled && !input.value.trim()) renderTree();
    });

    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        if (!q) { renderTree(); return; }
        renderSearch(q);
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') dropdown.style.display = 'none';
    });

    clearBtn.addEventListener('click', () => {
        _sendSelectedCustomerId = null;
        _sendSelectedCustomer = null;
        input.value = '';
        input.disabled = false;
        clearBtn.style.display = 'none';
        hint.style.display = 'none';
        dropdown.style.display = 'none';
    });

    document.addEventListener('click', e => {
        if (!document.getElementById('sendCustSearchWrap').contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
}

function selectSendCustomer(c) {
    _sendSelectedCustomerId = c.id;
    _sendSelectedCustomer = c;
    const input    = document.getElementById('sendCustSearchInput');
    const dropdown = document.getElementById('sendCustSearchDropdown');
    const clearBtn = document.getElementById('sendCustSearchClear');
    const hint     = document.getElementById('sendCustomerHint');
    input.value    = `${c.name}${c.company ? ' · ' + c.company : ''}`;
    input.disabled = true;
    clearBtn.style.display = 'inline-flex';
    dropdown.style.display = 'none';
    if (c.email) {
        document.getElementById('sendToAddress').value = c.email;
        hint.textContent = `已自动填入邮箱：${c.email}`;
        hint.style.display = 'block';
    } else {
        hint.textContent = '该客户未填写邮箱，请手动输入';
        hint.style.display = 'block';
    }
}

function loadSendCustomerSearch() {
    // 复用 _customerList，已由客户模块初始化，无需额外请求
    // 若 _customerList 为空则补充加载
    if (!_customerList.length) {
        fetch('/api/customers', { credentials: 'include' })
            .then(r => r.json())
            .then(list => { _customerList = list; _refreshCustomerSelectors(); })
            .catch(() => {});
    }
    // 重置搜索框状态
    _sendSelectedCustomerId = null;
    _sendSelectedCustomer = null;
    const input    = document.getElementById('sendCustSearchInput');
    const clearBtn = document.getElementById('sendCustSearchClear');
    const hint     = document.getElementById('sendCustomerHint');
    input.value    = '';
    input.disabled = false;
    clearBtn.style.display = 'none';
    hint.style.display     = 'none';
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
    const to = document.getElementById('sendToAddress').value.trim();
    const subject = document.getElementById('sendSubject').value.trim();
    const body = document.getElementById('sendBody').value.trim();

    if (!to || !subject || !body) {
        showError('请填写收件人、主题和正文');
        return;
    }

    // Show preview modal
    document.getElementById('sendPreviewTo').textContent = to;
    document.getElementById('sendPreviewSubject').textContent = subject;
    document.getElementById('sendPreviewBody').textContent = body;

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
    const to = document.getElementById('sendToAddress').value.trim();
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
        formData.append('to_address', to);
        formData.append('subject', subject);
        formData.append('body', body);
        if (customerId) formData.append('customer_id', customerId);
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
            document.getElementById('sendToAddress').value = '';
            document.getElementById('sendSubject').value = '';
            document.getElementById('sendBody').value = '';
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

document.getElementById('loadBulkCustomersBtn').addEventListener('click', loadBulkCustomers);
document.getElementById('bulkStatusFilter').addEventListener('change', () => {
    if (_bulkCustomers.length) {
        loadBulkCustomers();
    }
});

async function loadBulkCustomers() {
    const statusFilter = document.getElementById('bulkStatusFilter').value;
    const url = statusFilter ? `/api/customers?status=${statusFilter}` : '/api/customers';
    try {
        const res = await fetch(url, { credentials: 'include' });
        _bulkCustomers = await res.json();
        renderBulkCustomerList(_bulkCustomers);
    } catch {
        showError('加载客户列表失败');
    }
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

    if (!confirm(`即将向 ${items.length} 位客户发送邮件，确认吗？`)) return;

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
});


// ───── 发送记录 ─────
document.getElementById('refreshSentLogBtn').addEventListener('click', loadSentLog);

async function loadSentLog() {
    const container = document.getElementById('sentLogContainer');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const res = await fetch('/api/email-center/sent-log', { credentials: 'include' });
        const records = await res.json();
        if (!records.length) {
            container.innerHTML = '<div class="empty-state"><h3>暂无发送记录</h3></div>';
            return;
        }
        const rows = records.map(r => `
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
    } catch (e) {
        container.innerHTML = `<div class="error-message">加载失败：${e.message}</div>`;
    }
}


// ───── 联系统计 ─────
document.getElementById('refreshContactStatsBtn').addEventListener('click', loadContactStats);
document.getElementById('contactOverdueDays').addEventListener('change', loadContactStats);

async function loadContactStats() {
    const container = document.getElementById('contactStatsContainer');
    const summary   = document.getElementById('contactStatsSummary');
    const overdueDaysInput = document.getElementById('contactOverdueDays');
    const overdueDays = Math.max(1, parseInt(overdueDaysInput.value) || 30);

    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    summary.innerHTML = '';
    try {
        const res = await fetch('/api/email-center/contact-stats', { credentials: 'include' });
        const stats = await res.json();
        if (!stats.length) {
            container.innerHTML = '<div class="empty-state"><h3>暂无客户数据</h3><p>先在「客户管理」添加客户</p></div>';
            return;
        }

        // 分类计数
        const overdueList  = stats.filter(s => s.days_since_contact !== null && s.days_since_contact >= overdueDays);
        const neverList    = stats.filter(s => s.days_since_contact === null);
        const needFollowUp = overdueList.length + neverList.length;

        if (needFollowUp > 0) {
            summary.innerHTML = `
                <div class="contact-alert-banner">
                    <span class="contact-alert-icon">⚠️</span>
                    <span>共 <strong>${needFollowUp}</strong> 位客户需要跟进：
                        ${overdueList.length ? `<strong>${overdueList.length}</strong> 位超过 ${overdueDays} 天未联系` : ''}
                        ${overdueList.length && neverList.length ? '，' : ''}
                        ${neverList.length ? `<strong>${neverList.length}</strong> 位从未联系` : ''}
                    </span>
                </div>`;
        }

        const rows = stats.map(s => {
            const isOverdue = s.days_since_contact !== null && s.days_since_contact >= overdueDays;
            const isNever   = s.days_since_contact === null;
            const daysClass = isNever    ? 'contact-never'
                            : isOverdue  ? 'contact-overdue'
                            : s.days_since_contact > Math.floor(overdueDays / 2) ? 'contact-warning'
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

        const halfDays = Math.floor(overdueDays / 2);
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
    } catch (e) {
        container.innerHTML = `<div class="error-message">加载失败：${e.message}</div>`;
    }
}


// ───── 邮件模板 ─────
let _editingEmailTemplateId = null;

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
}

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
    document.getElementById('etBody').value = t ? t.body : '';
    document.getElementById('emailTemplateModal').classList.add('show');
}

function closeEmailTemplateModal() {
    document.getElementById('emailTemplateModal').classList.remove('show');
    _editingEmailTemplateId = null;
}

async function loadEmailTemplates() {
    const list = document.getElementById('emailTemplateList');
    list.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    try {
        const res = await fetch('/api/email-templates', { credentials: 'include' });
        const templates = await res.json();
        if (!templates.length) {
            list.innerHTML = '<div class="empty-state"><h3>暂无邮件模板</h3><p>点击「新建模板」创建第一个吧</p></div>';
            return;
        }
        list.innerHTML = `
            <table class="history-table">
                <thead><tr>
                    <th>名称</th><th>备注</th><th>主题</th><th>创建时间</th><th>操作</th>
                </tr></thead>
                <tbody>
                    ${templates.map(t => `
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
    } catch (e) {
        list.innerHTML = `<div class="error-message">加载失败：${e.message}</div>`;
    }
}

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
        const res = await fetch('/api/email-templates', { credentials: 'include' });
        const templates = await res.json();
        const t = templates.find(x => x.id === id);
        if (!t) return;
        openEmailTemplateModal(t);
    } catch (e) {
        showError('加载模板失败');
    }
}

async function deleteEmailTemplate(id) {
    if (!confirm('确认删除此模板？')) return;
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

// 模板选择弹窗（供单发/群发使用）
let _emailTemplateSelectorTarget = null; // 'send' | 'bulk'

async function openEmailTemplateSelector(target) {
    _emailTemplateSelectorTarget = target;
    const modal = document.getElementById('emailTemplateSelectorModal');
    const listEl = document.getElementById('emailTemplateSelectorList');
    listEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modal.classList.add('show');
    try {
        const res = await fetch('/api/email-templates', { credentials: 'include' });
        const templates = await res.json();
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
        const res = await fetch('/api/email-templates', { credentials: 'include' });
        const templates = await res.json();
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
            document.getElementById('sendBody').value = fillPlaceholders(t.body);
        } else if (_emailTemplateSelectorTarget === 'bulk') {
            document.getElementById('bulkSubject').value = t.subject;
            document.getElementById('bulkBody').value = t.body;
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
document.getElementById('profileClearAvatarBtn').addEventListener('click', async () => {
    if (!confirm('移除图片头像，切换回表情头像？')) return;
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
