const $ = (sel, el = document) => el.querySelector(sel);
const chatArea = $('#chatArea');
const form = $('#chatForm');
const input = $('#input');
const sendBtn = $('#sendBtn');
const clearBtn = $('#clearBtn');

const STORAGE_KEY = 'tsundere_chat_history_v1';

// 안전한 텍스트 주입
function addMessage({ role, text, timestamp = Date.now() }) {
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${role === 'user' ? '나' : '봇'} · ${formatTime(timestamp)}`;
  const body = document.createElement('div');
  body.className = 'text';
  body.textContent = text; // XSS 방지 (필요하면 마크다운 파서 도입)
  wrap.appendChild(meta);
  wrap.appendChild(body);
  chatArea.appendChild(wrap);
  scrollToBottom();
}

function addTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg assistant';
  wrap.dataset.typing = '1';
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = '봇 · 입력 중…';
  const dots = document.createElement('div');
  dots.className = 'typing';
  dots.innerHTML = '<span></span><span></span><span></span>';
  wrap.appendChild(meta);
  wrap.appendChild(dots);
  chatArea.appendChild(wrap);
  scrollToBottom();
}

function removeTyping() {
  const node = chatArea.querySelector('.msg.assistant[data-typing="1"]');
  if (node) node.remove();
}

function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

function formatTime(ts) {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

// 로컬스토리지
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function renderFromHistory() {
  chatArea.innerHTML = '';
  const history = loadHistory();
  history.forEach(m => addMessage(m));
}

function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
  renderFromHistory();
  // 시작 인사 (선택)
  addMessage({
    role: 'assistant',
    text: '왔네? …뭐, 반가워서 그런 건 아니고. 도움이 필요하면 말해.',
    timestamp: Date.now()
  });
  const h = loadHistory();
  h.push({ role: 'assistant', text: '왔네? …뭐, 반가워서 그런 건 아니고. 도움이 필요하면 말해.', timestamp: Date.now() });
  saveHistory(h);
}

// 초기 로드
renderFromHistory();
if (loadHistory().length === 0) {
  clearHistory();
}

// 입력창 자동 높이 조절
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
});

// Shift+Enter 줄바꿈, Enter 전송
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

// 전송 처리
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = (input.value || '').trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';

  const history = loadHistory();
  const userMsg = { role: 'user', text, timestamp: Date.now() };
  history.push(userMsg);
  saveHistory(history);
  addMessage(userMsg);

  setSending(true);
  addTyping();

  try {
  const reply = await sendToServer(text, history.slice(0, -1));
    removeTyping();

    const botMsg = {
      role: 'assistant',
      text: reply,
      timestamp: Date.now()
    };
    addMessage(botMsg);

    const updated = loadHistory();
    updated.push(botMsg);
    saveHistory(updated);
  } catch (err) {
    removeTyping();
    const botMsg = {
      role: 'assistant',
      text: '에휴… 잠깐 오류 났어. 네 탓은 아니고, 재시도해 봐.',
      timestamp: Date.now()
    };
    addMessage(botMsg);
    const updated = loadHistory();
    updated.push(botMsg);
    saveHistory(updated);
  } finally {
    setSending(false);
  }
});

// 서버로 전송
async function sendToServer(message, history) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || '서버 응답 오류');
  }
  const data = await res.json();
  return data.reply;
}

function setSending(is) {
  form.ariaBusy = String(is);
  input.disabled = is;
  sendBtn.disabled = is;
}

// 대화 초기화 버튼
clearBtn.addEventListener('click', () => {
  const ok = confirm('정말 대화 내용을 전부 삭제할까? …별로 아쉬운 건 아니지만.');
  if (!ok) return;
  clearHistory();
});
