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
let activities = readSaved();
let nextId = Math.max(0, ...activities.map((item) => item.id)) + 1;
let selectedTypes = new Set();
let editingId = null;
let deleteMode = false;
let toastTimer;

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE));
    if (Array.isArray(saved) && saved.every((item) => TYPES[item.type] && item.start && item.end)) return saved;
  } catch (_) {}
  return structuredClone(DEFAULT);
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
  save();
}
function parseTypes(text) {
  const words = {
    shower: /洗澡|淋浴|沖涼|沐浴/,
    dining: /用餐|晚餐|吃飯|吃東西|進食|餐飲/,
    massage: /按摩|理療|舒壓/,
    rest: /休息|睡覺|小睡|放鬆/,
    work: /工作|辦公|開會|會議|電腦/
  };
  const found = Object.entries(words).map(([type, regex]) => ({ type, index: text.search(regex) })).filter((item) => item.index >= 0).sort((a, b) => a.index - b.index).map((item) => item.type);
  selectedTypes.forEach((type) => { if (type !== 'gate' && !found.includes(type)) found.push(type); });
  return found;
}
function generatePlan() {
  const requested = parseTypes($('#requestInput').value);
  if (!requested.length) { toast('請先輸入需求，或點選想做的活動。'); return; }
  let cursor = minutes('17:30');
  const limit = minutes('19:00');
  let omitted = 0;
  const plan = [];
  for (const type of requested) {
    const duration = TYPES[type].duration;
    if (cursor + duration > limit) { omitted++; continue; }
    plan.push({ id: nextId++, type, start: clock(cursor), end: clock(cursor + duration), venue: TYPES[type].venue, status: TYPES[type].reservable ? 'pending' : 'none' });
    cursor += duration + 5;
  }
  if (!plan.length) { toast('目前可用時間不足，請調整活動需求。'); return; }
  plan.push({ id: nextId++, type: 'gate', start: '19:05', end: '19:15', venue: TYPES.gate.venue, status: 'none' });
  activities = plan; deleteMode = false; selectedTypes.clear(); renderChips(); render();
  toast(omitted ? `已產生示範行程；${omitted} 項活動因時間不足未加入。` : '已產生示範行程，請檢查時間並確認可預約服務。');
  $('#itineraryTitle').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
function startVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { toast('此瀏覽器不支援語音輸入，請使用文字輸入。'); return; }
  const recognition = new Recognition(); recognition.lang = 'zh-HK'; recognition.interimResults = false; recognition.maxAlternatives = 1;
  const button = $('#micButton'); const status = $('#voiceStatus');
  recognition.onstart = () => { button.classList.add('listening'); status.textContent = '正在聆聽…'; };
  recognition.onresult = (event) => { const spoken = event.results[0][0].transcript; $('#requestInput').value = [$('#requestInput').value.trim(), spoken].filter(Boolean).join(' '); status.textContent = '已加入語音內容'; };
  recognition.onerror = () => { status.textContent = '未能辨識，請再試一次'; };
  recognition.onend = () => { button.classList.remove('listening'); setTimeout(() => { status.textContent = ''; }, 3500); };
  recognition.start();
}

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
  activities = activities.filter((item) => !ids.includes(item.id)); deleteMode = false;
  $('#deleteButton').classList.remove('active'); $('#deleteButton').innerHTML = `${icon('trash')}刪除活動`; render(); toast(`已刪除 ${ids.length} 項活動。`);
});
$('#activityList').addEventListener('click', (event) => {
  const edit = event.target.closest('button.edit'); const remove = event.target.closest('button.remove');
  if (edit) openDialog(activities.find((item) => item.id === Number(edit.dataset.id)));
  if (remove) { activities = activities.filter((item) => item.id !== Number(remove.dataset.id)); render(); toast('活動已刪除。'); }
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
renderChips(); render();
