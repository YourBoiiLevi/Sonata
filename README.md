# Gemini Web UI

A bare bones web interface for Google's Gemini API using the new `@google/genai` library.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

3. Set your API key as an environment variable:
```bash
export GEMINI_API_KEY=your_api_key_here
```

Or on Windows:
```cmd
set GEMINI_API_KEY=your_api_key_here
```

4. Start the server:
```bash
npm start
```

5. Open http://localhost:3000 in your browser

## Features

- Single message input with streaming response from Gemini 2.5 Flash
- Real-time text streaming as the AI generates the response
- Clean, minimal interface
