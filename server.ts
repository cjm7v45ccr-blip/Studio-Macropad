import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { buildPublicFirmwareCatalogJson } from './serverFirmwareCatalog.ts';

dotenv.config();

function getGenAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Studio Sense AI requires GEMINI_API_KEY to be configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const rootDir = import.meta.dirname;
  const publicDir = path.resolve(rootDir, 'public');
  const distDir = path.resolve(rootDir, 'dist');

  app.get('/firmware-catalog.json', (_req, res) => {
    const scanDir = fs.existsSync(publicDir) ? publicDir : distDir;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.send(buildPublicFirmwareCatalogJson(scanDir));
  });

  // Studio Sense AI analysis endpoint
  app.post('/api/studio-sense/analyze', async (req, res) => {
    try {
      const ai = getGenAiClient();
      const { macros, userContext } = req.body || {};

      const prompt = `You are Studio Sense, an expert macro automation and firmware engineering assistant for the ESP32 Studio MacroPad.
Analyze the following user macros and suggest 3 high-value workflow optimizations, missing steps (such as auto-fill login sequences, 2FA timing delays, clipboard pasting, or multi-step shortcuts), and macro improvements.

User Macros:
${JSON.stringify(macros || [], null, 2)}

User Context:
${userContext || 'No additional context provided.'}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          systemInstruction:
            'You are Studio Sense, an expert hardware controller and macro workflow optimization assistant. Return concise, practical macro automation recommendations matching the requested schema.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: "Short 1-2 sentence assessment of the user's macro suite."
              },
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    category: { type: Type.STRING },
                    description: { type: Type.STRING },
                    recommendedActions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          type: { type: Type.STRING },
                          value: { type: Type.STRING }
                        },
                        required: ['type', 'value']
                      }
                    }
                  },
                  required: ['id', 'title', 'category', 'description', 'recommendedActions']
                }
              }
            },
            required: ['summary', 'suggestions']
          }
        }
      });

      const text = (response.text || '{}').trim();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { summary: 'Analysis completed.', suggestions: [] };
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
    if (fs.existsSync(publicDir)) {
      app.use(express.static(publicDir));
    }
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/') || /\.bin$/i.test(req.path)) {
          next();
          return;
        }
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  const port = process.env.PORT || 3000;
  app.listen(Number(port), '0.0.0.0', () => {
    console.log(`Studio MacroPad server running on http://localhost:${port}`);
  });
}

startServer();
