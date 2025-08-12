import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

const { GEMINI_API_KEY, PORT, GEMINI_MODEL } = process.env;
if (!GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY env var.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const app = express();
app.use(cors());
app.use(express.json());

app.get('/healthz', (req, res) => res.send('ok'));

app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL || 'gemini-2.5-flash',
      contents: prompt
    });

    res.json({ output: result.text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'Unknown error' });
  }
});

const port = Number(PORT) || 10000; // Render가 PORT를 지정해 줍니다.
app.listen(port, '0.0.0.0', () =>
  console.log(`listening on http://0.0.0.0:${port}`)
);
