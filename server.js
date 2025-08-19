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

// File upload endpoint using direct REST API
app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const allowedExtensions = [
      '.pdf', '.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml',
      '.html', '.htm', '.css', '.js', '.jsx', '.ts', '.tsx',
      '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs',
      '.php', '.rb', '.sh', '.bash', '.sql', '.rtf'
    ];

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const isValidExtension = allowedExtensions.includes(fileExtension);

    if (!isValidExtension) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ 
        error: `Unsupported file type. Supported formats: ${allowedExtensions.join(', ')}` 
      });
    }

    try {
      console.log(`Uploading file: ${file.originalname}`);
      console.log(`File path: ${file.path}`);
      console.log(`File size: ${file.size} bytes`);
      
      // Determine MIME type based on file extension
      const mimeTypes = {
        '.pdf': 'application/pdf',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.yaml': 'application/yaml',
        '.yml': 'application/yaml',
        '.html': 'text/html',
        '.htm': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.jsx': 'application/javascript',
        '.ts': 'application/typescript',
        '.tsx': 'application/typescript',
        '.py': 'text/x-python',
        '.java': 'text/x-java-source',
        '.c': 'text/x-c',
        '.cpp': 'text/x-c++',
        '.h': 'text/x-c',
        '.hpp': 'text/x-c++',
        '.cs': 'text/x-csharp',
        '.go': 'text/x-go',
        '.rs': 'text/x-rust',
        '.php': 'text/x-php',
        '.rb': 'text/x-ruby',
        '.sh': 'text/x-shell',
        '.bash': 'text/x-shell',
        '.sql': 'text/x-sql',
        '.rtf': 'application/rtf'
      };
      
      const mimeType = mimeTypes[fileExtension] || 'text/plain';
      const fileStats = fs.statSync(file.path);
      const fileBuffer = fs.readFileSync(file.path);
      
      console.log(`Determined MIME type: ${mimeType}`);
      console.log(`File stats size: ${fileStats.size}`);
      
      // Upload using REST API directly
      const uploadUrl = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
      
      // Step 1: Start resumable upload
      const startResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'X-Goog-API-Key': process.env.GEMINI_API_KEY,
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': fileStats.size.toString(),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          file: {
            display_name: file.originalname
          }
        })
      });
      
      if (!startResponse.ok) {
        const errorText = await startResponse.text();
        console.error('Start upload error:', errorText);
        throw new Error(`Failed to start upload: ${startResponse.status} - ${errorText}`);
      }
      
      const uploadSessionUrl = startResponse.headers.get('X-Goog-Upload-URL');
      if (!uploadSessionUrl) {
        throw new Error('No upload URL received from Google');
      }
      
      console.log('Upload session started, uploading file data...');
      
      // Step 2: Upload the actual file data
      const uploadResponse = await fetch(uploadSessionUrl, {
        method: 'POST',
        headers: {
          'Content-Length': fileStats.size.toString(),
          'X-Goog-Upload-Offset': '0',
          'X-Goog-Upload-Command': 'upload, finalize'
        },
        body: fileBuffer
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('Upload error:', errorText);
        throw new Error(`Failed to upload file: ${uploadResponse.status} - ${errorText}`);
      }
      
      const uploadResult = await uploadResponse.json();
      console.log('Upload successful:', uploadResult.file.name);
      
      // Clean up local file
      fs.unlinkSync(file.path);
      
      res.json({
        success: true,
        file: {
          name: uploadResult.file.name,
          displayName: uploadResult.file.display_name,
          mimeType: uploadResult.file.mime_type,
          sizeBytes: uploadResult.file.size_bytes,
          uri: uploadResult.file.uri
        }
      });
      
    } catch (uploadError) {
      // Clean up local file on error
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      console.error('File upload error:', uploadError);
      res.status(500).json({ 
        error: `Failed to upload file: ${uploadError.message}` 
      });
    }

  } catch (error) {
    console.error('Upload error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Get uploaded files list using REST API
app.get('/api/files', async (req, res) => {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/files', {
      method: 'GET',
      headers: {
        'X-Goog-API-Key': process.env.GEMINI_API_KEY
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('List files error:', errorText);
      throw new Error(`Failed to list files: ${response.status}`);
    }
    
    const result = await response.json();
    res.json({ files: result.files || [] });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

// Delete uploaded file using REST API
app.delete('/api/files/:fileName', async (req, res) => {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${encodeURIComponent(req.params.fileName)}`, {
      method: 'DELETE',
      headers: {
        'X-Goog-API-Key': process.env.GEMINI_API_KEY
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Delete file error:', errorText);
      throw new Error(`Failed to delete file: ${response.status}`);
    }
    
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
