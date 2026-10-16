# Digital Twin

Local-first CLI twin that works with free LLMs (Ollama, Gemini, Groq). Your data lives in `twin.db` and `profile.md` on your machine (both git-ignored).
Note: with Ollama everything stays on your PC. With Gemini/Groq, your chat text is sent to that provider.

## Setup
```bash
cp profile.example.md profile.md   # fill it in honestly
cp .env.example .env               # then pick ONE provider inside .env
npm start
```

Requires Node 22.13+ (uses built-in SQLite, so no npm install needed). For Ollama: install it from ollama.com and run `ollama pull llama3.1`.

## Usage
- Just type to talk. `/mode debate|predict|reflect|past|twin` switches modes.
- `/decide` logs a decision with your expectation and confidence; `/outcome <id>` records the result later.
  Predict mode uses this to tell you if you're over/under-confident.
- `/journal` saves entries. Entries written in `past` mode stay in `past` mode only.