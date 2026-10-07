const TYPES = {
  shower: { label: '淋浴', venue: 'The Wing First', duration: 30, icon: '♨', reservable: true },
  dining: { label: '晚餐', venue: 'The Wing First Dining Room', duration: 30, icon: '✦', reservable: false },
  massage: { label: '按摩', venue: 'The Wing First Wellness', duration: 15, icon: '✧', reservable: true },
  rest: { label: '休息', venue: 'The Wing First Quiet Area', duration: 20, icon: '☾', reservable: false },
  work: { label: '工作', venue: 'The Wing First Workspace', duration: 20, icon: '⌘', reservable: false },
  gate: { label: '前往 G25 登機口', venue: '步行約 10 分鐘', duration: 10, icon: '✈', reservable: false }
};
const DEFAULT = [
  { id: 1, type: 'shower', start: '17:30', end: '18:00', venue: TYPES.shower.venue, status: 'confirmed' },
  { id: 2, type: 'dining', start: '18:05', end: '18:35', venue: TYPES.dining.venue, status: 'none' },
  { id: 3, type: 'massage', start: '18:40', end: '18:55', venue: TYPES.massage.venue, status: 'pending' },
  { id: 4, type: 'gate', start: '19:05', end: '19:15', venue: TYPES.gate.venue, status: 'none' }
];
const STORAGE = 'cathay-concierge-prototype-v1';
const $ = (selector) => document.querySelector(selector);
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const minutes = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const clock = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
let activities = typeof document === 'undefined' ? [] : readSaved();
let nextId = Math.max(0, ...activities.map((item) => item.id)) + 1;
let selectedTypes = new Set();
let lastOmitted = [];
let editingId = null;
let deleteMode = false;
let toastTimer;
let activeRecognition = null;

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    if (Array.isArray(saved) && saved.every((item) => TYPES[item.type] && item.start && item.end)) return saved;
  } catch (_) {}
  return DEFAULT.map((item) => ({ ...item }));
}
function save() { try { localStorage.setItem(STORAGE, JSON.stringify(activities)); } catch (_) {} }
function toast(message) {
  const node = $('#toast'); node.textContent = message; node.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 3300);
}
function renderChips() {
  $('#chips').innerHTML = Object.entries(TYPES).map(([type, data]) => `<button class="chip ${selectedTypes.has(type) ? 'active' : ''}" type="button" data-type="${type}" aria-pressed="${selectedTypes.has(type)}">+ ${data.label}</button>`).join('');
}
function render() {
  activities.sort((a, b) => minutes(a.start) - minutes(b.start));
  $('#activityList').classList.toggle('delete-mode', deleteMode);
  $('#activityList').innerHTML = activities.length ? activities.map((item) => {
    const type = TYPES[item.type];
    const status = item.status === 'confirmed' ? '<span class="badge confirmed">✓ 已確認</span>' : item.status === 'pending' ? '<span class="badge pending">◷ 待確認</span>' : '<span class="badge none">無需預約</span>';
    return `<article class="activity-row" data-id="${item.id}"><div class="time-column"><strong>${escapeHtml(item.start)}</strong><span>${escapeHtml(item.end)}</span><i class="timeline-dot"></i></div><div class="activity-card"><div class="activity-visual ${item.type}" aria-hidden="true">${type.icon}</div><div class="activity-main"><strong>${escapeHtml(type.label)}</strong><div class="venue">${icon('pin')}<span title="${escapeHtml(item.venue)}">${escapeHtml(item.venue)}</span></div><div class="badges">${type.reservable ? '<span class="badge bookable">可預約</span>' : ''}${status}</div></div><div class="activity-tools"><input class="select-checkbox" type="checkbox" aria-label="選取${escapeHtml(type.label)}" data-id="${item.id}"/><button class="edit" type="button" data-id="${item.id}" aria-label="編輯${escapeHtml(type.label)}">${icon('edit')}</button><button class="remove" type="button" data-id="${item.id}" aria-label="刪除${escapeHtml(type.label)}">${icon('trash')}</button></div></div></article>`;
  }).join('') : '<div class="empty-state">尚未安排活動。輸入計劃或新增活動，即可開始。</div>';
  const pending = activities.filter((item) => item.status === 'pending').length;
  $('#bookingCount').textContent = pending ? `${pending} 項服務待確認` : '預約狀態已更新';
  $('#bookingButton').disabled = !pending;
  const last = activities.at(-1);
  $('#planSummary').textContent = last ? `已安排 ${activities.length} 項活動 · 最後一項於 ${last.end} 結束` : '你的行程仍是空白';
  $('#planWarnings').hidden = lastOmitted.length === 0;
  $('#planWarnings').textContent = lastOmitted.length ? `未能安排：${lastOmitted.map((type) => TYPES[type].label).join('、')}。登機前時間不足，請刪減項目或調整時間。` : '';
  save();
}
function parseTypes(text, selections = selectedTypes) {
  const words = {
    shower: /洗澡|淋浴|沖涼|冲凉|沐浴/,
    dining: /吃飯|吃饭|食飯|食饭|食嘢|用餐|晚餐|晚飯|晚饭|午餐|午飯|午饭|早餐|早飯|早饭|吃東西|吃东西|進食|进食|餐飲|餐饮|餐點|餐点/,
    massage: /按摩|理療|理疗|舒壓|舒压/,
    rest: /休息|睡覺|睡觉|小睡|放鬆|放松/,
    work: /工作|辦公|办公|開會|开会|會議|会议|電腦|电脑/,
    gate: /前往.{0,6}(?:登機|登机)|去(?:登機|登机)口|去閘口|去闸口/
  };
  const found = Object.entries(words).map(([type, regex]) => ({ type, index: text.search(regex) })).filter((item) => item.index >= 0).sort((a, b) => a.index - b.index).map((item) => item.type);
  selections.forEach((type) => { if (TYPES[type] && !found.includes(type)) found.push(type); });
  return found;
}
function planActivities(requested) {
  let cursor = minutes('17:30');
  const limit = minutes('19:00');
  const scheduled = [];
  const omitted = [];
  for (const type of requested) {
    if (type === 'gate') continue;
    const duration = TYPES[type].duration;
    if (cursor + duration > limit) { omitted.push(type); continue; }
    scheduled.push({ type, start: clock(cursor), end: clock(cursor + duration), venue: TYPES[type].venue, status: TYPES[type].reservable ? 'pending' : 'none' });
    cursor += duration + 5;
  }
  if (scheduled.length || requested.includes('gate')) scheduled.push({ type: 'gate', start: '19:05', end: '19:15', venue: TYPES.gate.venue, status: 'none' });
  return { scheduled, omitted };
}
function generatePlan() {
  const requested = parseTypes($('#requestInput').value);
  if (!requested.length) { toast('未識別活動；請輸入「洗澡、吃飯、按摩」等需求，或點選活動標籤。'); return false; }
  const { scheduled, omitted } = planActivities(requested);
  if (!scheduled.length) { toast('目前可用時間不足，請調整活動需求。'); return false; }
  activities = scheduled.map((item) => {
    const confirmed = activities.some((previous) => previous.type === item.type && previous.start === item.start && previous.end === item.end && previous.venue === item.venue && previous.status === 'confirmed');
    return { ...item, id: nextId++, status: confirmed ? 'confirmed' : item.status };
  });
  lastOmitted = omitted;
  deleteMode = false; selectedTypes.clear(); renderChips(); render();
  toast(omitted.length ? `已排入可用時段；${omitted.length} 項活動因時間不足未加入。` : '已產生示範行程，請檢查時間並確認可預約服務。');
  $('#itineraryTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}
function openDialog(item = null) {
  editingId = item?.id ?? null;
  $('#dialogTitle').textContent = item ? '編輯活動' : '新增活動';
  $('#activityType').value = item?.type ?? 'shower';
  $('#activityStart').value = item?.start ?? '17:30';
  $('#activityEnd').value = item?.end ?? '18:00';
  $('#activityVenue').value = item?.venue ?? TYPES.shower.venue;
  $('#dialogError').textContent = '';
  $('#activityDialog').showModal();
}
function validatePlan(candidate) {
  if (minutes(candidate.end) <= minutes(candidate.start)) return '結束時間需晚於開始時間。';
  if (minutes(candidate.start) < minutes('17:30') || minutes(candidate.end) > minutes('19:15')) return '活動請安排在 17:30 至 19:15 之間。';
  const conflict = activities.some((item) => item.id !== editingId && minutes(candidate.start) < minutes(item.end) && minutes(candidate.end) > minutes(item.start));
  return conflict ? '此時段與現有活動重疊，請調整時間。' : '';
}
function setVoiceFeedback(message, kind = '') {
  const status = $('#voiceStatus');
  status.textContent = message;
  status.className = `voice-feedback ${kind}`.trim();
}
function voiceErrorMessage(error) {
  const messages = {
    'not-allowed': '麥克風未獲允許。請在瀏覽器設定中允許本站使用麥克風，再試一次。',
    'NotAllowedError': '麥克風未獲允許。請在瀏覽器設定中允許本站使用麥克風，再試一次。',
    'SecurityError': '語音輸入需要安全連線。請使用 GitHub Pages 的 HTTPS 網址。',
    'InvalidStateError': '語音引擎尚未準備好，請稍後再試一次。',
    'service-not-allowed': '這個瀏覽器不允許使用語音辨識服務。可改用支援的瀏覽器或裝置聽寫。',
    'audio-capture': '未找到可用麥克風。請檢查系統輸入裝置。',
    'no-speech': '未聽到語音，請靠近麥克風再試一次。',
    'network': '無法連接瀏覽器的語音服務。可稍後重試，或使用裝置聽寫。',
    'language-not-supported': '目前語音引擎不支援所選語言。請切換語音語言再試。',
    'aborted': '語音輸入已停止。'
  };
  return messages[error] || '語音辨識未能啟動。請重試，或在輸入框使用裝置聽寫。';
}
function setupVoice() {
  if (window.SpeechRecognition || window.webkitSpeechRecognition) return;
  $('#micButton').classList.add('unavailable');
  $('#speechLang').disabled = true;
  setVoiceFeedback('此瀏覽器沒有語音辨識引擎。可在輸入框使用裝置聽寫，或改用支援語音辨識的瀏覽器。', 'error');
}
function startVoice() {
  if (activeRecognition) { try { activeRecognition.stop(); } catch (_) {} return; }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { $('#requestInput').focus(); setVoiceFeedback('此瀏覽器沒有語音辨識引擎。請使用裝置聽寫或文字輸入。', 'error'); return; }
  if (window.isSecureContext === false) { setVoiceFeedback('語音輸入需要安全連線。請使用 GitHub Pages 的 HTTPS 網址。', 'error'); return; }
  const recognition = new Recognition();
  recognition.lang = $('#speechLang').value;
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  const button = $('#micButton');
  let captured = false;
  let hadError = false;
  activeRecognition = recognition;
  recognition.onstart = () => { button.classList.add('listening'); button.setAttribute('aria-label', '停止語音輸入'); setVoiceFeedback('正在聆聽，請說出你的行程…'); };
  recognition.onresult = (event) => {
    if (captured) return;
    const spoken = Array.from(event.results).filter((result) => result.isFinal).map((result) => result[0]?.transcript?.trim()).filter(Boolean).join('，');
    if (!spoken) return;
    captured = true;
    $('#requestInput').value = [$('#requestInput').value.trim(), spoken].filter(Boolean).join('，');
    const planned = generatePlan();
    setVoiceFeedback(planned ? `已識別：「${spoken}」；行程已更新。` : `已聽到：「${spoken}」，但未能排入活動。請補充需求。`, planned ? 'success' : 'error');
  };
  recognition.onerror = (event) => { hadError = true; setVoiceFeedback(voiceErrorMessage(event.error), 'error'); };
  recognition.onend = () => {
    if (activeRecognition === recognition) activeRecognition = null;
    button.classList.remove('listening');
    button.setAttribute('aria-label', '開始語音輸入');
    if (!captured && !hadError) setVoiceFeedback('未收到語音內容，請再試一次。', 'error');
  };
  try { recognition.start(); }
  catch (error) { activeRecognition = null; setVoiceFeedback(voiceErrorMessage(error.name), 'error'); }
}

if (typeof document !== 'undefined') {
$('#chips').addEventListener('click', (event) => {
  const button = event.target.closest('[data-type]'); if (!button) return;
  const type = button.dataset.type;
  if (selectedTypes.has(type)) selectedTypes.delete(type); else selectedTypes.add(type);
  renderChips();
});
$('#generateButton').addEventListener('click', generatePlan);
$('#replanButton').addEventListener('click', generatePlan);
$('#micButton').addEventListener('click', startVoice);
$('#addButton').addEventListener('click', () => openDialog());
$('#deleteButton').addEventListener('click', () => {
  if (!deleteMode) { deleteMode = true; $('#deleteButton').classList.add('active'); $('#deleteButton').innerHTML = `${icon('trash')}刪除選取`; render(); toast('請勾選要刪除的活動，再按「刪除選取」。'); return; }
  const ids = [...document.querySelectorAll('.select-checkbox:checked')].map((node) => Number(node.dataset.id));
  if (!ids.length) { deleteMode = false; $('#deleteButton').classList.remove('active'); $('#deleteButton').innerHTML = `${icon('trash')}刪除活動`; render(); return; }
  activities = activities.filter((item) => !ids.includes(item.id)); deleteMode = false; lastOmitted = [];
  $('#deleteButton').classList.remove('active'); $('#deleteButton').innerHTML = `${icon('trash')}刪除活動`; render(); toast(`已刪除 ${ids.length} 項活動。`);
});
$('#activityList').addEventListener('click', (event) => {
  const edit = event.target.closest('button.edit'); const remove = event.target.closest('button.remove');
  if (edit) openDialog(activities.find((item) => item.id === Number(edit.dataset.id)));
  if (remove) { activities = activities.filter((item) => item.id !== Number(remove.dataset.id)); lastOmitted = []; render(); toast('活動已刪除。'); }
});
$('#activityType').addEventListener('change', () => { $('#activityVenue').value = TYPES[$('#activityType').value].venue; });
$('#closeDialog').addEventListener('click', () => $('#activityDialog').close());
$('#activityForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const type = $('#activityType').value;
  const candidate = { id: editingId ?? nextId++, type, start: $('#activityStart').value, end: $('#activityEnd').value, venue: $('#activityVenue').value.trim() || TYPES[type].venue, status: TYPES[type].reservable ? 'pending' : 'none' };
  const error = validatePlan(candidate); if (error) { $('#dialogError').textContent = error; return; }
  const existing = activities.find((item) => item.id === editingId);
  if (existing && existing.type === type && existing.start === candidate.start && existing.end === candidate.end && existing.venue === candidate.venue && existing.status === 'confirmed') candidate.status = 'confirmed';
  if (existing) activities = activities.map((item) => item.id === editingId ? candidate : item); else activities.push(candidate);
  lastOmitted = [];
  $('#activityDialog').close(); render(); toast(existing ? '活動已更新。' : '活動已加入行程。');
});
$('#bookingButton').addEventListener('click', () => {
  const count = activities.filter((item) => item.status === 'pending').length;
  if (!count) return;
  activities = activities.map((item) => item.status === 'pending' ? { ...item, status: 'confirmed' } : item);
  render(); toast(`已在原型中確認 ${count} 項服務；正式預約需連接服務系統。`);
});
document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.nav !== '行程') toast(`${button.dataset.nav}頁面尚未加入此客戶端原型。`);
}));
setupVoice(); renderChips(); render();
}

if (typeof module !== 'undefined') module.exports = { parseTypes, planActivities, voiceErrorMessage };
