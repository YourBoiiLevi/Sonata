# Sonata

Welcome to Sonata! Sonata is a feature-rich web interface designed to unlock the full potential of Google's Generative AI models. It provides a playground for exploring everything from simple text chats to complex multimodal interactions, with deep configuration options to tailor the experience.

## Features

Sonata is packed with features that go far beyond a basic chat interface.

 - **Multimodal Support:** Interact with the model using a wide variety of inputs:
	- **Images:** Upload and discuss visual content.
	- **Videos:** Analyze video files.
	- **Audio:** Process audio inputs.
	- **Documents:** Supports PDFs, text files, code, and more for analysis and summarization.

- **Advanced Model Configuration:** Fine-tune the model's behavior with a comprehensive set of controls:
	- **Sampling Parameters:** Adjust Temperature, Top-P, and Top-K.
	- **Reproducibility:** Set a random seed for consistent outputs.
	- **Penalty Adjustments:** Control Presence and Frequency penalties to guide the model's responses.
	- **Personality Presets:** Quickly switch between modes like "Helpful Assistant" or "Code Reviewer".
	- **Custom Instructions:** Provide your own system prompts for full control over the AI's persona and task.

- **Rich Content Rendering:**  Sonata beautifully renders a wide range of Markdown and custom syntax, making responses easy to read and understand.
	- **Standard Markdown:** Full support for headers, lists, tables, and blockquotes.
	- **Code Highlighting:** Syntax highlighting for dozens of languages powered by Prism.js.
	- **Math Equations:** Renders LaTeX and mathematical formulas using KaTeX.
	- **Custom Callouts:** Informational blocks for notes, tips, warnings, and dangers.
	- **Spoilers:** Hide content with spoiler tags.
	- **Task Lists:** Interactive checkboxes.
	- **And much more:** Includes support for footnotes, highlights, and collapsible sections. 

## Technology Stack

Sonata is built with:
- **Backend:** [Express.js](https://expressjs.com/) serving a simple and effective API.
- **AI Integration:** Powered by the official [`@google/genai`](https://www.npmjs.com/package/@google/genai) library.
- **Markdown Parsing:** [marked.js](https://marked.js.org/) for fast and extensible Markdown rendering.
- **Syntax Highlighting:** [Prism.js](https://prismjs.com/) for beautiful code blocks.
- **Math Rendering:** [KaTeX](https://katex.org/) for fast and clean mathematical typesetting.

## Setup Instructions

Getting Sonata up and running is simple.

**Prerequisites:**
- [Node.js](https://nodejs.org/) (a recent LTS version is recommended).
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

**Installation:**

1.  **Install dependencies:**
    (Assuming you have already cloned this repository)
    ```bash
    npm install
    ```

2.  **Set up your environment:**
    Create a `.env` file in the root of the project by copying the example file:
    ```bash
    cp .env.example .env
    ```
    Open the `.env` file and add your Gemini API key:
    ```
    GEMINI_API_KEY=your_api_key_here
    ```

3.  **Start the server:**
    ```bash
    npm start
    ```

4.  **Open in your browser:**
    Navigate to `http://localhost:3000`.

## Usage Examples

Here are a few things you can try.

-  **Basic Chat:** Just type a message and hit send!
- **Uploading Media:** Click the "Choose File" button to upload an image, video, audio file, or document. Then, ask the model a question about it. For example, upload a picture of a landmark and ask, "What is this place?"
- **Awesome Markdown:** Ask Sonata to showcase it's Markdown capabilities!

## Roadmap

Sonata is actively being developed. Here are some of the exciting features planned for the future, in no particular order:

-   **Expanded Markdown Support:** Even more custom syntax and rendering features.
-   **Multi-Turn Conversations:** Support for maintaining conversation history and context.
-   **Function Calling:** Allowing the model to interact with external tools and APIs to perform research or actions.
-   **MCP Integration:** Adopting the Model Context Protocol for standardized and extensible tool integration.
-   **Multi-Provider Support:** Adding support for other model providers like OpenRouter, OpenAI, and any OpenAI-compatible endpoints.
- **UI Overhaul:** A massive overhaul to the currently barebones UI to make it more sophisticated and aesthetic.

---
Happy chatting!
