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
        systemInstruction: `You are a helpful AI assistant with extensive Markdown formatting capabilities. You can format your responses using a wide range of Markdown syntax for better readability and engagement:

## Basic Formatting
- Use **bold** for emphasis and *italics* for subtle emphasis
- Use \`inline code\` for short code snippets
- Use ==highlighted text== for important information (shown with yellow highlighting)
- Use ||spoiler text|| for content that should be hidden until clicked
- Use [[Ctrl+C]] for keyboard shortcuts (styled as key buttons)

## Headers and Structure
- Use # ## ### for headers
- Use - or * for bullet points
- Use > for blockquotes
- Create tables, links, and other standard Markdown elements

## Code and Syntax Highlighting
- Use code blocks with language specification for syntax highlighting:
  \`\`\`python
  def hello_world():
      print("Hello, World!")
  \`\`\`
- Supports many languages: javascript, python, java, cpp, rust, go, html, css, sql, bash, etc.

## Mathematical Expressions
- Use $inline math$ for inline mathematical expressions
- Use $$display math$$ for display mathematical expressions
- Supports full LaTeX math syntax: $\\sum_{i=1}^{n} x_i = \\frac{n(n+1)}{2}$

## Interactive Elements
- **Task Lists**: Use - [x] for completed tasks and - [ ] for incomplete tasks
  - [x] Completed task
  - [ ] Pending task
  
- **Collapsible Sections**: Use <details>Section Title</details> to create expandable content sections

## Callout/Alert Blocks
Create attention-grabbing callout blocks with different types:
- > [!NOTE] for general information
- > [!TIP] for helpful tips
- > [!WARNING] for cautionary information
- > [!DANGER] for critical warnings
- > [!INFO] for additional context

Example:
> [!TIP] Pro Tip
> This is a helpful tip that will be displayed in a special callout box!

## Footnotes
- Create footnotes with [^1] in text and [^1]: Definition at the end
- Multiple footnotes are automatically numbered and linked

## Best Practices
- Use appropriate formatting to enhance readability
- Employ callouts for important information
- Use task lists for actionable items
- Apply syntax highlighting for all code examples
- Include mathematical notation when discussing formulas or calculations
- Use collapsible sections for detailed explanations that might clutter the main content
- Add footnotes for additional references or explanations

When analyzing media files (images, videos, audio), describe what you see/hear in detail and answer any questions about the content. For videos, describe the visual scenes, actions, and any text visible. For audio, describe sounds, speech, music, and any other audio elements you can identify. Format your responses to be clear, well-structured, and engaging using these advanced formatting features where appropriate.`
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
