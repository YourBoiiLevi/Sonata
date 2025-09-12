import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY environment variable is not set!');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/chat', async (req, res) => {
  try {
    const { model, config, systemInstruction, history, message } = req.body || {};
    const selectedModel = model || 'gemini-2.5-flash';

    if (!message || !message.role || !message.parts) {
      return res.status(400).json({ error: 'Invalid payload: message with role and parts is required' });
    }

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    let baseSystemInstruction = `You are a helpful AI assistant. You can format your responses using Markdown syntax for better readability: 

## Basic Formatting
- Use **bold** for emphasis and *italics* for subtle emphasis
- Use \`inline code\` for short code snippets and code blocks with language specification for longer code
- Use # ## ### for headers and - or * for bullet points
- Use ==highlighted text== for important information (shown with yellow highlighting)
- Use > for blockquotes and create tables, links, and other standard Markdown elements

## Advanced Features (use only when helpful)
- **Callouts**: Use > [!NOTE], > [!TIP], > [!WARNING], > [!DANGER], or > [!INFO]
- **Task Lists**: Use - [x] and - [ ] for tasks
- **Math**: Use $inline$ or $$display$$ math
- **Interactive Elements**: ||spoiler||, [[Ctrl+C]], <details>Section</details>
- **Footnotes**: Use [^1] and footnote definitions

## Code Support
- Use fenced code blocks with language tags
- Only use advanced features when they help clarity

When analyzing media files (images, videos, audio), describe what you see/hear and answer questions clearly.`;

    baseSystemInstruction += '\n\n## Diagram and code fence tags\n- Mermaid: use mermaid\n- Raw SVG: use svg\n\nExamples:\n```mermaid\ngraph TD\n  A-->B\n```\n```svg\n<svg viewBox=\"0 0 10 10\"><circle cx=\"5\" cy=\"5\" r=\"4\"/></svg>\n```\n';

    if (!systemInstruction) {
      if (config && config.customInstructions && config.personalityPreset === 'custom') {
        baseSystemInstruction = config.customInstructions + '\n\n' + baseSystemInstruction;
      }
      if (config && config.personalityPreset && config.personalityPreset !== '' && config.personalityPreset !== 'custom') {
        const personalities = {
          helpful: "You are a helpful and friendly assistant who provides clear, accurate, and useful information. Always be polite and supportive.",
          code_reviewer: "You are an experienced code reviewer. Focus on code quality, best practices, security, performance, and maintainability. Provide constructive feedback and suggestions for improvement.",
          creative_writer: "You are a creative writer with expertise in storytelling, poetry, and creative expression. Help with writing projects, brainstorming ideas, and improving narrative techniques."
        };
        if (personalities[config.personalityPreset]) {
          baseSystemInstruction = personalities[config.personalityPreset] + '\n\n' + baseSystemInstruction;
        }
      }
    }

    const generationConfig = {};
    if (config) {
      if (config.temperature !== undefined) generationConfig.temperature = config.temperature;
      if (config.topP !== undefined) generationConfig.topP = config.topP;
      if (config.topK !== undefined) generationConfig.topK = config.topK;
      if (config.seed !== undefined) generationConfig.seed = config.seed;
      if (config.presencePenalty !== undefined) generationConfig.presencePenalty = config.presencePenalty;
      if (config.frequencyPenalty !== undefined) generationConfig.frequencyPenalty = config.frequencyPenalty;
      if (config.mediaResolution) generationConfig.mediaResolution = config.mediaResolution;
      if (config.thinkingBudget !== undefined) generationConfig.thinkingBudget = config.thinkingBudget;
      if (config.responseLogprobs !== undefined) generationConfig.responseLogprobs = config.responseLogprobs;
      if (config.logprobs !== undefined) generationConfig.logprobs = config.logprobs;
    }

    const contents = [...(history || []), message];

    const response = await ai.models.generateContentStream({
      model: selectedModel,
      contents,
      config: generationConfig,
      systemInstruction: systemInstruction || baseSystemInstruction
    });

    let usage = null;
    let finishReason = 'unknown';

    for await (const chunk of response) {
      if (chunk.text) res.write(chunk.text);
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
      if (chunk.finishReason) finishReason = chunk.finishReason;
    }

    res.write(`\n\n[[SONATA_FINAL]]${JSON.stringify({ usageMetadata: usage, finishReason })}[[/SONATA_FINAL]]`);
    res.end();
  } catch (error) {
    console.error('Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate response' });
    } else {
      res.write('\n\n[Error: Failed to generate response]');
      res.end();
    }
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Make sure to set GEMINI_API_KEY environment variable');
});
