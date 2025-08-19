import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Check if API key is provided
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY environment variable is not set!');
  process.exit(1);
}

// Initialize Gemini AI client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoint for chat
app.post('/api/chat', async (req, res) => {
  try {
    const { message, media } = req.body;
    
    if (!message && !media) {
      return res.status(400).json({ error: 'Message or media is required' });
    }
    
    // Set headers for streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    // Prepare content parts
    const parts = [];
    
    // Add text part if message exists
    if (message) {
      parts.push({ text: message });
    }
    
    // Add media part if media exists
    if (media) {
      // Validate supported formats
      const supportedFormats = [
        // Images
        'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
        // Videos  
        'video/mp4', 'video/mpeg', 'video/mov', 'video/avi', 'video/x-flv', 
        'video/mpg', 'video/webm', 'video/wmv', 'video/3gpp',
        // Audio
        'audio/wav', 'audio/mp3', 'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac'
      ];
      
      if (!supportedFormats.includes(media.mimeType)) {
        return res.status(400).json({ 
          error: `Unsupported media format: ${media.mimeType}. Supported formats: ${supportedFormats.join(', ')}` 
        });
      }
      
      parts.push({
        inlineData: {
          mimeType: media.mimeType,
          data: media.data
        }
      });
    }
    
    // Generate streaming response from Gemini
    const response = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: parts
        }
      ],
      config: {
        systemInstruction: `You are a helpful AI assistant. You can format your responses using Markdown syntax for better readability:

## Basic Formatting
- Use **bold** for emphasis and *italics* for subtle emphasis
- Use \`inline code\` for short code snippets and code blocks with language specification for longer code
- Use # ## ### for headers and - or * for bullet points
- Use ==highlighted text== for important information (shown with yellow highlighting)
- Use > for blockquotes and create tables, links, and other standard Markdown elements

## Advanced Features (use when helpful)
- **Callouts**: Use > [!NOTE], > [!TIP], > [!WARNING], > [!DANGER], or > [!INFO] for special attention blocks
- **Task Lists**: Use - [x] for completed and - [ ] for incomplete tasks when organizing action items
- **Math**: Use $inline math$ or $$display math$$ for mathematical expressions when relevant
- **Interactive Elements**: 
  - Use ||spoiler text|| for content that should be hidden until clicked
  - Use [[Ctrl+C]] style formatting for keyboard shortcuts
  - Use <details>Section Title</details> for collapsible sections with detailed content
- **Footnotes**: Use [^1] with [^1]: Definition for citations and references when needed

## Code Support
- Code blocks support syntax highlighting for many languages (python, javascript, java, cpp, rust, go, html, css, sql, bash, etc.)
- Choose appropriate formatting based on content - don't feel obligated to use advanced features unless they genuinely improve the response

When analyzing media files (images, videos, audio), describe what you see/hear in detail and answer any questions about the content. Format your responses to be clear and well-structured, using these formatting options naturally where they add value.`
      }
    });
    
    // Stream chunks back to client
    for await (const chunk of response) {
      if (chunk.text) {
        res.write(chunk.text);
      }
    }
    
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
