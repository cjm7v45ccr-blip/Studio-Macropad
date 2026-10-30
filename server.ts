import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // Studio Sense AI analysis endpoint
  app.post('/api/studio-sense/analyze', async (req, res) => {
    try {
      const { macros, userContext } = req.body || {};
      
      const prompt = `You are Studio Sense, an expert macro automation and firmware engineering assistant for the ESP32 Studio MacroPad.
Analyze the following user macros and suggest 3 high-value workflow optimizations, missing steps (such as auto-fill login sequences, 2FA timing delays, clipboard pasting, or multi-step shortcuts), and macro improvements.

User Macros:
${JSON.stringify(macros || [], null, 2)}

User Context:
${userContext || 'No additional context provided.'}

Return valid JSON with the following structure:
{
  "summary": "Short 1-2 sentence assessment of the user's macro suite.",
  "suggestions": [
    {
      "id": "suggestion_1",
      "title": "Short catchy title",
      "category": "Security / Efficiency / Workflow",
      "description": "Detailed explanation of why this optimization helps.",
      "recommendedActions": [
        { "type": "TEXT", "value": "example_value" },
        { "type": "DELAY", "value": "500" }
      ]
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          systemInstruction: 'You are Studio Sense, an expert hardware controller and macro workflow optimization assistant. Always return valid JSON matching the requested schema.'
        }
      });

      const text = response.text || '{}';
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { summary: "Analysis completed.", suggestions: [] };
      }

      res.json(parsed);
    } catch (err: any) {
      console.error('Studio Sense error:', err);
      res.status(500).json({ error: err?.message || 'Failed to generate Studio Sense analysis' });
    }
  });

  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: process.env.DISABLE_HMR !== 'true' }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }
  }

  const port = process.env.PORT || 3000;
  app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Studio MacroPad server running on http://localhost:${port}`);
  });
}

startServer();
