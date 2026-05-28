'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   GrowOS Frontend — app.js
   Manual-publish only. NO auto-posting logic.
   ═══════════════════════════════════════════════════════════════════════════ */

const API_BASE = window.location.origin;
let sessionId = generateSessionId();
let chatProgress = 0;
let latestPlanData = null;
let acceptedSections = {};
let socialStatus = { facebook: false, instagram: false, twitter: false };
let selectedImageUrl = '';

function generateSessionId() {
  return 'sess_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type) {
  var c = document.getElementById('toast-container');
  var t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = message;
  c.appendChild(t);
  setTimeout(function () { t.remove(); }, 4000);
}

// ── Modal ────────────────────────────────────────────────────────────────────
function closeModal() {
  document.getElementById('confirm-modal').style.display = 'none';
}

function confirmPublish() {
  var caption = document.getElementById('post-caption').value.trim();
  var platforms = getSelectedPlatforms();
  if (!caption) return showToast('Please enter a caption', 'error');
  if (!platforms.length) return showToast('Select at least one platform', 'error');

  var body = document.getElementById('modal-body');
  body.innerHTML = '<strong>Platforms:</strong> ' + platforms.join(', ') +
    '<br><strong>Caption:</strong> ' + caption.substring(0, 120) + (caption.length > 120 ? '...' : '') +
    (selectedImageUrl ? '<br><strong>Image:</strong> attached' : '');
  document.getElementById('confirm-modal').style.display = 'flex';

  var btn = document.getElementById('modal-confirm');
  btn.onclick = function () { closeModal(); publishPost(); };
}

// ── Panel Switching ──────────────────────────────────────────────────────────
var PAGE_TITLES = { chat: 'GrowOS Chat', post: 'Post Manager', history: 'Publish History' };

function switchPanel(id, el) {
  document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
  document.getElementById('panel-' + id).classList.add('active');
  el.classList.add('active');
  document.getElementById('page-title').textContent = PAGE_TITLES[id];
  if (id === 'history') loadPublishHistory();
}

// ── Chat ─────────────────────────────────────────────────────────────────────
function addMessage(role, content, extraHtml) {
  var d = document.createElement('div');
  d.className = 'msg ' + role;
  var av = role === 'ai' ? 'G' : '👤';
  d.innerHTML = '<div class="msg-avatar">' + av + '</div><div class="msg-content">' + content + (extraHtml || '') + '</div>';
  document.getElementById('chat-messages').appendChild(d);
  scrollToBottom();
}

function addTypingIndicator() {
  var d = document.createElement('div');
  d.className = 'msg ai';
  d.id = 'typing-msg';
  d.innerHTML = '<div class="msg-avatar">G</div><div class="msg-content"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div>';
  document.getElementById('chat-messages').appendChild(d);
  scrollToBottom();
}

function removeTypingIndicator() {
  var el = document.getElementById('typing-msg');
  if (el) el.remove();
}

function scrollToBottom() {
  var c = document.getElementById('chat-messages');
  c.scrollTop = c.scrollHeight;
}

function updateProgress(pct) {
  chatProgress = pct;
  var area = document.getElementById('progress-area');
  area.style.display = pct > 0 ? 'flex' : 'none';
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-text').textContent = pct + '%';
}

function handleInputKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

async function sendMessage() {
  var input = document.getElementById('chat-input');
  var msg = input.value.trim();
  var btn = document.getElementById('send-btn');

  if (msg) addMessage('user', msg);
  input.value = '';
  btn.disabled = true;
  addTypingIndicator();

  try {
    var body = { session_id: sessionId };
    if (msg) body.message = msg;
    var res = await fetch(API_BASE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var json = await res.json();
    removeTypingIndicator();

    if (!json.success) {
      addMessage('ai', json.error ? json.error.message : 'Something went wrong.');
      btn.disabled = false;
      return;
    }

    var d = json.data;
    updateProgress(d.progress || 0);

    if (d.type === 'question' || d.type === 'follow_up') {
      addMessage('ai', d.message);
    } else if (d.type === 'full_plan') {
      addMessage('ai', d.message);
      latestPlanData = d.data;
      addPlanCard(d.data);
      activatePostManager(d.data);
    } else if (d.type === 'follow_up_answer') {
      addMessage('ai', d.message);
    } else {
      addMessage('ai', d.message || 'Received response.');
    }
  } catch (err) {
    removeTypingIndicator();
    addMessage('ai', 'Network error. Please check your connection.');
  }
  btn.disabled = false;
  input.focus();
}

// ── Plan Card ────────────────────────────────────────────────────────────────
function addPlanCard(data) {
  var d = document.createElement('div');
  d.className = 'msg ai';
  d.style.maxWidth = '100%';
  var h = '<div class="msg-avatar">G</div><div style="flex:1;min-width:0"><div class="plan-card">';
  h += buildPlanSection('business_analysis', '🎯', 'Business Analysis', renderBizHTML(data.business_analysis));
  h += buildPlanSection('weekly_plan', '📅', '7-Day Content Calendar', renderWeeklyHTML(data.weekly_plan));
  h += buildPlanSection('captions', '✍️', 'Caption Generator', renderCaptionsHTML(data.captions));
  h += buildPlanSection('ad_recommendations', '📊', 'Ad Strategy', renderAdHTML(data.ad_recommendations));
  h += buildPlanSection('festival_trends', '🎪', 'Festival & Trends', renderFestivalHTML(data.festival_trends));
  h += '</div></div>';
  d.innerHTML = h;
  document.getElementById('chat-messages').appendChild(d);
  setTimeout(function () { var fb = d.querySelector('.plan-section-body'); if (fb) fb.classList.add('open'); }, 100);
  scrollToBottom();
}

function buildPlanSection(key, icon, title, bodyHtml) {
  var acc = acceptedSections[key];
  return '<div class="plan-section" data-section="' + key + '"><div class="plan-section-header" onclick="toggleSection(this)"><div class="plan-section-title"><span class="icon">' + icon + '</span>' + title + '</div><div class="plan-section-actions" onclick="event.stopPropagation()"><button class="plan-btn regen" onclick="regenerateSection(\'' + key + '\',this)">🔄 Regen</button><button class="plan-btn ' + (acc ? 'accepted' : 'accept') + '" onclick="acceptSection(\'' + key + '\',this)">' + (acc ? '✅ Accepted' : '✅ Accept') + '</button></div></div><div class="plan-section-body" id="section-body-' + key + '">' + bodyHtml + '</div></div>';
}

function toggleSection(header) { header.nextElementSibling.classList.toggle('open'); }

// ── Renderers ────────────────────────────────────────────────────────────────
function renderBizHTML(d) {
  if (!d) return '<div style="color:var(--muted);font-size:12px">No data</div>';
  return '<div class="result-cards"><div class="result-card"><div class="rc-label">Brand tone</div>' + (d.brand_tone || []).map(function (t) { return '<span class="tag tag-purple">' + t + '</span>'; }).join('') + '</div><div class="result-card"><div class="rc-label">Target persona</div><div style="font-weight:500;margin-bottom:3px;font-size:12px">' + (d.target_persona ? d.target_persona.name : '') + '</div><div style="font-size:11px;color:var(--muted);margin-bottom:6px">' + (d.target_persona ? d.target_persona.age_range : '') + '</div>' + (d.target_persona ? d.target_persona.interests : []).map(function (i) { return '<span class="tag tag-green">' + i + '</span>'; }).join('') + '</div><div class="result-card"><div class="rc-label">Marketing goals</div>' + (d.marketing_goals || []).map(function (g, i) { return '<div style="padding:4px 0;border-bottom:.5px solid var(--border);font-size:11px"><span style="color:var(--accent2);font-family:\'DM Mono\',monospace;font-size:10px;margin-right:5px">0' + (i + 1) + '</span>' + g + '</div>'; }).join('') + '</div><div class="result-card"><div class="rc-label">Content style</div><div style="font-size:11px;color:var(--muted);margin-bottom:4px">' + (d.content_style ? d.content_style.visual_style : '') + '</div>' + (d.content_style ? d.content_style.preferred_formats : []).map(function (f) { return '<span class="tag tag-amber">' + f + '</span>'; }).join('') + '</div></div>' + (d.competitive_edge ? '<div style="margin-top:10px;padding:10px 14px;background:rgba(124,92,252,.06);border:.5px solid rgba(124,92,252,.15);border-radius:var(--radius-xs);font-size:12px;color:var(--accent2)"><strong>Edge:</strong> ' + d.competitive_edge + '</div>' : '');
}

function renderWeeklyHTML(arr) {
  var days = Array.isArray(arr) ? arr : [];
  if (!days.length) return '<div style="color:var(--muted);font-size:12px">No data</div>';
  return '<div class="week-grid">' + days.map(function (d, i) { return '<div class="day-row" style="animation-delay:' + (i * 0.04) + 's"><div><div class="day-name">' + (d.day || '') + '</div></div><div class="day-type">' + (d.content_type || '') + '</div><div class="day-topic">' + (d.topic || '') + '<br><span style="color:var(--muted);font-size:10px;font-style:italic">"' + (d.caption_hint || '') + '"</span></div><div class="day-time">' + (d.best_time || '') + '</div></div>'; }).join('') + '</div>';
}

function renderCaptionsHTML(d) {
  if (!d) return '<div style="color:var(--muted);font-size:12px">No data</div>';
  var cols = ['tag-purple', 'tag-green', 'tag-amber'];
  return '<div class="caption-cards">' + (d.captions || []).map(function (c, i) { return '<div class="caption-card" style="animation-delay:' + (i * 0.06) + 's"><span class="caption-angle">' + (c.angle || '') + '</span><div class="caption-num">CAPTION 0' + (i + 1) + '</div><div class="caption-text">' + (c.text || '') + '</div></div>'; }).join('') + '</div><div style="margin-top:10px"><div class="rc-label" style="margin-bottom:6px">Hashtags</div>' + (d.hashtags || []).map(function (h, i) { return '<span class="tag ' + cols[i % 3] + '">' + h + '</span>'; }).join('') + '</div>' + (d.cta ? '<div class="cta-bar"><span style="font-family:\'DM Mono\',monospace;font-size:9px;color:var(--muted);display:block;margin-bottom:3px">CTA</span>' + d.cta + '</div>' : '');
}

function renderAdHTML(d) {
  if (!d) return '<div style="color:var(--muted);font-size:12px">No data</div>';
  var recs = d.ad_recommendations || [];
  var icons = [['M', 'rgba(24,95,165,.15)', '#85B7EB'], ['G', 'rgba(34,211,165,.1)', 'var(--green)']];
  return '<div class="ad-grid">' + recs.slice(0, 2).map(function (a, i) { return '<div class="ad-card" style="animation-delay:' + (i * 0.06) + 's"><div class="platform-header"><div class="platform-icon" style="background:' + icons[i][1] + ';color:' + icons[i][2] + '">' + icons[i][0] + '</div><div><div class="platform-name">' + (a.platform || '') + '</div><div class="platform-obj">' + (a.objective || '') + '</div></div></div><div class="ad-field"><div class="ad-field-label">Daily budget</div><div class="budget-num">₹' + ((a.budget_suggestion ? a.budget_suggestion.daily_inr : 0) || 0).toLocaleString('en-IN') + '</div><div class="budget-sub">' + (a.budget_suggestion ? a.budget_suggestion.rationale : '') + '</div></div><div class="ad-field"><div class="ad-field-label">Ad copy</div><div style="font-family:\'Syne\',sans-serif;font-weight:700;font-size:12px;margin-bottom:3px">' + (a.ad_copy ? a.ad_copy.headline : '') + '</div><div style="font-size:11px;color:var(--muted)">' + (a.ad_copy ? a.ad_copy.primary_text : '') + '</div></div><span class="tag tag-amber">' + (a.best_format || '') + '</span></div>'; }).join('') + '</div>';
}

function renderFestivalHTML(d) {
  if (!d) return '<div style="color:var(--muted);font-size:12px">No data</div>';
  return '<div style="margin-bottom:12px"><div class="rc-label" style="margin-bottom:8px">Upcoming events</div><div class="festival-grid">' + (d.upcoming_events || []).map(function (e, i) { return '<div class="festival-card" style="animation-delay:' + (i * 0.06) + 's"><div class="festival-name">' + (e.name || '') + '</div><div class="festival-date">' + (e.date || '') + '</div><div style="font-size:10px;color:var(--muted)">Relevance: ' + (e.relevance_score || 0) + '/10</div><div class="relevance-bar"><div class="relevance-fill" style="width:' + ((e.relevance_score || 0) * 10) + '%"></div></div></div>'; }).join('') + '</div></div><div style="margin-bottom:12px"><div class="rc-label" style="margin-bottom:8px">Campaign ideas</div>' + (d.campaign_ideas || []).map(function (c) { return '<div class="campaign-idea"><div class="campaign-event">' + (c.event || '') + '</div><div class="campaign-hook">"' + (c.hook || '') + '"</div><span class="tag tag-amber">' + (c.suggested_offer || '') + '</span></div>'; }).join('') + '</div><div><div class="rc-label" style="margin-bottom:6px">Trending hashtags</div>' + (d.trending_hashtags || []).map(function (h, i) { return '<span class="tag ' + ['tag-purple', 'tag-green', 'tag-amber'][i % 3] + '">' + h + '</span>'; }).join('') + '</div>';
}

// ── Section Actions ──────────────────────────────────────────────────────────
async function regenerateSection(section, btn) {
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> ...';
  var bodyEl = document.getElementById('section-body-' + section);
  bodyEl.classList.add('open');
  bodyEl.innerHTML = '<div class="section-loading"><div class="spinner"></div>Regenerating...</div>';
  try {
    var res = await fetch(API_BASE + '/api/regenerate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, section: section }) });
    var json = await res.json();
    if (json.success && json.data) {
      var data = json.data.data || json.data;
      if (latestPlanData) latestPlanData[section] = data;
      var renderers = { business_analysis: renderBizHTML, weekly_plan: renderWeeklyHTML, captions: renderCaptionsHTML, ad_recommendations: renderAdHTML, festival_trends: renderFestivalHTML };
      bodyEl.innerHTML = renderers[section](data);
      acceptedSections[section] = false;
      var ab = btn.parentElement.querySelector('.accept,.accepted');
      if (ab) { ab.className = 'plan-btn accept'; ab.textContent = '✅ Accept'; }
      showToast('Section regenerated!', 'success');
    } else {
      bodyEl.innerHTML = '<div style="color:var(--red);font-size:12px;padding:12px">Regeneration failed.</div>';
    }
  } catch (err) {
    bodyEl.innerHTML = '<div style="color:var(--red);font-size:12px;padding:12px">Error: ' + err.message + '</div>';
  }
  btn.disabled = false;
  btn.innerHTML = '🔄 Regen';
}

function acceptSection(section, btn) {
  acceptedSections[section] = true;
  btn.className = 'plan-btn accepted';
  btn.textContent = '✅ Accepted';
  showToast(section.replace(/_/g, ' ') + ' accepted', 'success');
}

// ── Post Manager ─────────────────────────────────────────────────────────────
function activatePostManager(data) {
  document.getElementById('empty-post-state').style.display = 'none';
  document.getElementById('post-manager-content').style.display = 'block';
  var qs = document.getElementById('caption-quick-select');
  qs.innerHTML = '';
  if (data.captions && data.captions.captions) {
    data.captions.captions.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'quick-reply';
      b.textContent = (c.angle || '') + ': ' + (c.text || '').substring(0, 60) + '...';
      b.onclick = function () { document.getElementById('post-caption').value = c.text; };
      qs.appendChild(b);
    });
  }
}

function getSelectedPlatforms() {
  var r = [];
  document.querySelectorAll('.platform-toggle.active').forEach(function (el) {
    r.push(el.getAttribute('data-platform'));
  });
  return r;
}

function togglePlatform(el) {
  el.classList.toggle('active');
  el.setAttribute('aria-checked', el.classList.contains('active'));
}

// ── Publish (MANUAL ONLY) ────────────────────────────────────────────────────
async function publishPost() {
  var caption = document.getElementById('post-caption').value.trim();
  var platforms = getSelectedPlatforms();
  var btn = document.getElementById('publish-btn');
  var results = document.getElementById('post-results');
  results.innerHTML = '';
  btn.disabled = true;
  btn.textContent = '⏳ Publishing...';

  for (var i = 0; i < platforms.length; i++) {
    var p = platforms[i];
    try {
      var res = await fetch(API_BASE + '/api/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, platform: p, caption: caption, image_url: selectedImageUrl || undefined }) });
      var json = await res.json();
      if (json.success) {
        results.innerHTML += '<div class="post-result-item success">✅ ' + p + ' — Published!</div>';
        showToast('Posted to ' + p, 'success');
      } else {
        results.innerHTML += '<div class="post-result-item failed">❌ ' + p + ' — ' + (json.error ? json.error.message : 'Failed') + '</div>';
        showToast(p + ' failed', 'error');
      }
    } catch (err) {
      results.innerHTML += '<div class="post-result-item failed">❌ ' + p + ' — ' + err.message + '</div>';
    }
  }
  btn.disabled = false;
  btn.textContent = '🚀 Publish Now';
}

// ── Image Search ─────────────────────────────────────────────────────────────
async function searchImages() {
  var q = document.getElementById('unsplash-query').value.trim();
  if (!q) return;
  var btn = document.getElementById('search-img-btn');
  btn.textContent = '⏳...';
  try {
    var res = await fetch(API_BASE + '/api/unsplash-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
    var json = await res.json();
    var container = document.getElementById('image-results');
    container.innerHTML = '';
    if (json.success && json.data && json.data.images) {
      json.data.images.forEach(function (img) {
        var el = document.createElement('img');
        el.src = img.thumb;
        el.alt = img.alt || q;
        el.onclick = function () { selectImage(img.url); container.querySelectorAll('img').forEach(function (i) { i.classList.remove('selected'); }); el.classList.add('selected'); };
        container.appendChild(el);
      });
    }
  } catch (err) {
    showToast('Image search failed', 'error');
  }
  btn.textContent = '🔍 Search';
}

function selectImage(url) {
  selectedImageUrl = url;
  document.getElementById('selected-image-preview').style.display = 'block';
  document.getElementById('selected-img').src = url;
}

function removeImage() {
  selectedImageUrl = '';
  document.getElementById('selected-image-preview').style.display = 'none';
  document.getElementById('image-results').querySelectorAll('img').forEach(function (i) { i.classList.remove('selected'); });
}

// ── Publish History ──────────────────────────────────────────────────────────
async function loadPublishHistory() {
  var list = document.getElementById('history-list');
  try {
    var res = await fetch(API_BASE + '/api/publish-history/' + sessionId);
    var json = await res.json();
    if (json.success && json.data && json.data.history && json.data.history.length) {
      list.innerHTML = json.data.history.map(function (h) {
        return '<div class="history-item"><div class="history-platform">' + h.platform + '</div><div class="history-caption">' + (h.caption || '') + '</div><span class="history-status ' + (h.success ? 'ok' : 'err') + '">' + (h.success ? 'Success' : 'Failed') + '</span><span class="history-time">' + new Date(h.timestamp).toLocaleTimeString() + '</span></div>';
      }).join('');
    }
  } catch (err) { /* keep existing empty state */ }
}

// ── New Chat ─────────────────────────────────────────────────────────────────
async function startNewChat() {
  try { await fetch(API_BASE + '/api/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId }) }); } catch (e) { /* ignore */ }
  sessionId = generateSessionId();
  latestPlanData = null;
  acceptedSections = {};
  selectedImageUrl = '';
  document.getElementById('chat-messages').innerHTML = '';
  document.getElementById('empty-post-state').style.display = 'block';
  document.getElementById('post-manager-content').style.display = 'none';
  updateProgress(0);
  sendMessage();
}

// ── Health Check ─────────────────────────────────────────────────────────────
async function checkHealth() {
  try {
    var res = await fetch(API_BASE + '/health');
    var json = await res.json();
    if (json.success && json.data && json.data.status === 'ok') {
      document.getElementById('api-dot').classList.remove('disconnected');
      document.getElementById('api-status-text').textContent = 'Gemini connected';
    } else {
      throw new Error('bad');
    }
  } catch (e) {
    document.getElementById('api-dot').classList.add('disconnected');
    document.getElementById('api-status-text').textContent = 'API offline';
  }
}

async function checkSocialStatus() {
  try {
    var res = await fetch(API_BASE + '/api/social-status');
    var json = await res.json();
    if (json.success) socialStatus = json.data;
    document.querySelectorAll('.platform-toggle').forEach(function (el) {
      var p = el.getAttribute('data-platform');
      if (socialStatus[p]) { el.classList.add('connected'); el.classList.remove('disconnected'); }
      else { el.classList.add('disconnected'); el.classList.remove('connected'); }
    });
  } catch (e) { /* ignore */ }
}

// ── Init ─────────────────────────────────────────────────────────────────────
(function init() {
  checkHealth();
  checkSocialStatus();
  sendMessage(); // Trigger welcome
})();
