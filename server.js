import 'dotenv/config';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import fs from 'fs';
import { promisify } from 'util';

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

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// File upload endpoint
app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const supportedTypes = [
      // Text formats
      'text/plain', 'text/markdown', 'text/csv',
      // Document formats
      'application/pdf',
      // Code formats
      'text/html', 'text/css', 'text/javascript', 'application/javascript',
      'text/x-python', 'application/x-python-code', 'text/x-java-source',
      'text/x-c', 'text/x-c++', 'text/x-csharp', 'text/x-go', 'text/x-rust',
      'text/x-php', 'text/x-ruby', 'text/x-shell', 'application/json',
      'application/xml', 'text/xml', 'application/yaml', 'text/yaml',
      // Additional formats
      'application/rtf', 'text/rtf'
    ];

    // Check file extension for additional validation
    const allowedExtensions = [
      '.pdf', '.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml',
      '.html', '.htm', '.css', '.js', '.jsx', '.ts', '.tsx',
      '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs',
      '.php', '.rb', '.sh', '.bash', '.sql', '.rtf'
    ];

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const isValidExtension = allowedExtensions.includes(fileExtension);
    const isValidMimeType = supportedTypes.includes(file.mimetype) || 
                           file.mimetype.startsWith('text/') ||
                           file.mimetype === 'application/octet-stream'; // For files without proper MIME type

    if (!isValidExtension && !isValidMimeType) {
      // Clean up uploaded file
      fs.unlinkSync(file.path);
      return res.status(400).json({ 
        error: `Unsupported file type. Supported formats: PDF, text files, code files, and data files.` 
      });
    }

    try {
      // Upload file to Google AI Files API
      const uploadResult = await ai.files.upload({
        path: file.path,
        displayName: file.originalname,
      });

      // Clean up local file
      fs.unlinkSync(file.path);

      res.json({
        success: true,
        file: {
          name: uploadResult.file.name,
          displayName: uploadResult.file.displayName,
          mimeType: uploadResult.file.mimeType,
          sizeBytes: uploadResult.file.sizeBytes,
          uri: uploadResult.file.uri
        }
      });
    } catch (uploadError) {
      // Clean up local file on error
      fs.unlinkSync(file.path);
      console.error('File upload error:', uploadError);
      res.status(500).json({ error: 'Failed to upload file to Google AI' });
    }

  } catch (error) {
    console.error('Upload error:', error);
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Get uploaded files list
app.get('/api/files', async (req, res) => {
  try {
    const filesResponse = await ai.files.list();
    res.json({ files: filesResponse.files || [] });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Delete uploaded file
app.delete('/api/files/:fileName', async (req, res) => {
  try {
    await ai.files.delete(req.params.fileName);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// API endpoint for chat
app.post('/api/chat', async (req, res) => {
  try {
    const { message, media, uploadedFiles, model, config } = req.body;
    const selectedModel = model || 'gemini-2.5-flash';
    
    if (!message && !media && (!uploadedFiles || uploadedFiles.length === 0)) {
      return res.status(400).json({ error: 'Message, media, or uploaded files are required' });
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
    
    // Add uploaded files if they exist
    if (uploadedFiles && uploadedFiles.length > 0) {
      for (const fileUri of uploadedFiles) {
        parts.push({
          fileData: {
            mimeType: 'application/pdf', // This will be set correctly by the API based on the uploaded file
            fileUri: fileUri
          }
        });
      }
    }
    
    // Generate streaming response from Gemini
    const generationConfig = {
      systemInstruction: `You are a helpful AI assistant. You can format your responses using Markdown syntax for better readability:

## Basic Formatting
- Use **bold** for emphasis and *italics* for subtle emphasis
- Use \`inline code\` for short code snippets and code blocks with language specification for longer code
- Use # ## ### for headers and - or * for bullet points
- Use ==highlighted text== for important information (shown with yellow highlighting)
- Use > for blockquotes and create tables, links, and other standard Markdown elements

## Advanced Features (use only when helpful)
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
    };

    if (config) {
      if (config.thinkingBudget !== undefined) {
        generationConfig.thinkingConfig = {
          thinkingBudget: config.thinkingBudget
        };
      }
      if (config.temperature !== undefined) {
        generationConfig.temperature = config.temperature;
      }
      if (config.topP !== undefined) {
        generationConfig.topP = config.topP;
      }
      if (config.topK !== undefined) {
        generationConfig.topK = config.topK;
      }
      if (config.seed !== undefined) {
        generationConfig.seed = config.seed;
      }
      if (config.presencePenalty !== undefined) {
        generationConfig.presencePenalty = config.presencePenalty;
      }
      if (config.frequencyPenalty !== undefined) {
        generationConfig.frequencyPenalty = config.frequencyPenalty;
      }
      // if (config.responseLogprobs !== undefined) {
      //   generationConfig.responseLogprobs = config.responseLogprobs;
      // }
      // if (config.logprobs !== undefined) {
      //   generationConfig.logprobs = config.logprobs;
      // }
      if (config.mediaResolution) {
        generationConfig.mediaResolution = config.mediaResolution;
      }
    }

    const response = await ai.models.generateContentStream({
      model: selectedModel,
      contents: [
        {
          role: "user",
          parts: parts
        }
      ],
      config: generationConfig
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
