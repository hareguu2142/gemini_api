import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 1) server.js와 같은 폴더의 .env를 확실히 로드 (작업 디렉터리 불일치 방지)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 8080;

// 2) 키 정리: 공백/제로폭 문자 제거, 따옴표 제거
const pick = (v) => (v ?? '').replace(/\u200B|\uFEFF/g, '').trim().replace(/^["']|["']$/g, '');
const API_KEY = pick(process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY);

if (!API_KEY) {
  console.error('[ERROR] GEMINI_API_KEY 가 .env 에 없습니다.');
  process.exit(1);
}

// 간단 검증(형식 점검). 실패해도 강제 종료하진 않지만 경고 남김.
if (!/^AIza[0-9A-Za-z_\-]{10,}$/.test(API_KEY)) {
  console.warn('[WARN] API 키 형태가 일반적(AIza...)과 다릅니다. AI Studio 키인지 확인하세요.');
}

const genAI = new GoogleGenerativeAI(API_KEY);

// 살짝 츤데레 톤 시스템 프롬프트 (과하지 않게, 항상 유익하게)
const TSUNDERE_SYSTEM_PROMPT = `
너는 한국어로 답하는 '츤데레' 스타일의 도우미야.
- 기본은 다정하지만 약간 새침하고 툴툴대는 톤을 1~2문장 정도만 섞어. (예: "별거 아니니까 착각하지 마.", "고마워할 필요까진 없는데?")
- 그러나 무례하거나 공격적이면 안 돼. 항상 친절하고 유익해야 해.
- 답변은 명확하고 간결하게. 필요하면 단계별/목록/코드블록(~~~ 혹은 \`\`\`)을 활용해.
- 사용자 말투를 따라가되, 처음엔 반말로 시작하되 과한 반말은 피하고 자연스럽게.
- 민감/유해한 내용은 정책적으로 안전하게 거절하되, 대체 방법을 제시해.
`;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Gemini 챗 엔드포인트
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message 가 필요합니다.' });
    }

    // history: [{ role: 'user'|'assistant', text: '...' }, ...]
    // Gemini 형식으로 매핑 (최근 N개만 전송)
    const MAX_TURNS = 24;

    // 1) 클라이언트 히스토리 -> Gemini 형식으로 매핑
    const mappedHistory = (history || [])
      .slice(-MAX_TURNS)
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text ?? '' }]
      }));

    // 2) Gemini 요구사항에 맞게 정규화
    const cleanedHistory = normalizeForGemini(mappedHistory, message);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: TSUNDERE_SYSTEM_PROMPT
    });

    const chat = model.startChat({ history: cleanedHistory });

    const result = await chat.sendMessage(message);
    const reply = result.response.text();

    return res.json({ reply });
  } catch (err) {
    console.error('[Chat Error]', err);
    return res.status(500).json({
      error: '서버 오류가 발생했어. 잠깐 삐진 거 아니거든? (조금 뒤에 다시 시도해봐)'
    });
  }
});

// ▼ 파일 하단 어딘가에 헬퍼 추가
function normalizeForGemini(mappedHistory, currentMessage) {
  let h = Array.isArray(mappedHistory) ? [...mappedHistory] : [];

  // (A) 맨 앞이 model(assistant)이면 첫 user가 나올 때까지 버림
  const firstUserIdx = h.findIndex(m => m.role === 'user');
  if (firstUserIdx > 0) h = h.slice(firstUserIdx);
  if (firstUserIdx === -1) h = []; // 전부 assistant면 전부 제거

  // (B) 마지막이 user이고 그 텍스트가 이번에 보낼 message와 같으면(중복) 제거
  if (h.length) {
    const last = h[h.length - 1];
    const lastText = (last.parts?.map(p => p.text).join(' ') || '').trim();
    if (last.role === 'user' && currentMessage && lastText === currentMessage.trim()) {
      h = h.slice(0, -1);
    }
  }

  // (C) role이 user→model→user→model 순으로 교차되도록 정리
  const normalized = [];
  for (const m of h) {
    if (normalized.length === 0) {
      if (m.role === 'user') normalized.push(m);
    } else {
      if (m.role !== normalized[normalized.length - 1].role) {
        normalized.push(m);
      }
    }
  }
  return normalized;
}

// SPA 라우팅(필요시)
// 진단용 핑 엔드포인트
app.get('/api/diag', async (req, res) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const r = await model.generateContent('ping');
    res.json({ ok: true, text: r.response.text(), keyTail: API_KEY.slice(-6) });
  } catch (e) {
    res.status(500).json({
      ok: false,
      message: e?.message || String(e),
      details: e?.errorDetails || null,
      keyTail: API_KEY.slice(-6) // 전체 키는 절대 노출 금지
    });
  }
});

// SPA 라우팅(필요시)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Tsundere chat running: http://localhost:${PORT}`);
});
