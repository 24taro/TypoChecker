# Chrome Built-in AI APIs Documentation

## Available APIs

### Stable APIs (Chrome 138+)
1. **Language Model API (Prompt API)**
   - Natural language processing with Gemini Nano
   - Supports text, image, and audio inputs (multimodal)
   - Streaming and non-streaming responses
   - Session management with token tracking

2. **Summarizer API**
   - Text summarization in various formats (bullets, paragraph, sentence)
   - Different length options (short, medium, long)
   - Supports plain text and markdown output

3. **Translator API**
   - Client-side translation between languages
   - No server communication required
   - Streaming translation support

4. **Language Detector API**
   - Automatic language detection
   - Returns confidence scores
   - Privacy-preserving local execution

### Experimental APIs (Origin Trial)
5. **Writer API**
   - Content generation assistance
   - Customizable tone and format

6. **Rewriter API**
   - Text rewriting and style changes
   - Goals: simplify, elaborate, formalize, casual

### Canary Experimental
7. **Proofreader API**
   - Grammar and spell checking

8. **Multimodal Prompt API**
   - Enhanced support for text, image, and audio inputs

## Key Features
- **Local Processing**: All computation happens on-device
- **Privacy**: No data sent to external servers
- **Performance**: Low latency, no network round-trips
- **Offline Support**: Works without internet connection

## System Requirements
- Chrome Canary/Dev/Beta (v127+) or Chrome 138 Stable
- 22GB free storage space
- 4GB+ VRAM GPU
- Windows 10/11, macOS 13+, or Linux
- Non-metered network connection for initial download