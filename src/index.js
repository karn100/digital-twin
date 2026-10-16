import fs from "fs";
import readline from "readline/promises";
import { BASE, MODES } from "./prompts.js";
import * as db from "./db.js";

// Works with any OpenAI-compatible API (Ollama, Gemini, Groq, OpenRouter...). Configure in .env
const BASE_URL = (process.env.LLM_BASE_URL || "http://localhost:11434/v1").replace(/\/$/, "");
const API_KEY = process.env.LLM_API_KEY || "ollama";
const MODEL = process.env.LLM_MODEL || "llama3.1";

async function complete(system, messages) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let mode = "twin";

const loadProfile = () =>
  fs.existsSync("profile.md")
    ? fs.readFileSync("profile.md", "utf-8")
    : "(No profile.md yet. Copy profile.example.md to profile.md and fill it in.)";

function buildSystem(userInput) {
  const parts = [
    BASE,
    MODES[mode].prompt,
    `Today's date: ${new Date().toDateString()}`,
    `## My profile\n${loadProfile()}`,
  ];

  const journal = db.searchJournal(userInput, mode);
  if (journal.length)
    parts.push("## Relevant journal entries\n" + journal.map((j) => `[${j.created_at}] ${j.content}`).join("\n"));

  if (mode !== "past") {
    const open = db.openDecisions();
    if (open.length)
      parts.push("## Open decisions\n" + open.map((d) => `#${d.id} ${d.decision} (options: ${d.options}; expected: ${d.expected}; confidence ${d.confidence}%)`).join("\n"));
    const done = db.resolvedDecisions();
    if (done.length)
      parts.push("## Past decisions & outcomes (use to calibrate)\n" + done.map((d) => `#${d.id} ${d.decision} | expected: ${d.expected} | confidence ${d.confidence}% | actual: ${d.outcome}`).join("\n"));
  }
  return parts.join("\n\n");
}

async function chat(text) {
  db.saveMessage(mode, "user", text);
  const messages = db.recentMessages(mode, 20);
  try {
    const reply = await complete(buildSystem(text), messages);
    db.saveMessage(mode, "assistant", reply);
    console.log(`\n[${mode}] twin: ${reply}\n`);
  } catch (err) {
    console.log(`\nError: ${err.message}\n`);
  }
}

async function logDecision() {
  const decision = await rl.question("What are you deciding? ");
  const options = await rl.question("Options (comma separated): ");
  const expected = await rl.question("What do you expect to happen? ");
  const confidence = parseInt(await rl.question("Confidence in that expectation (0-100): "), 10) || 50;
  const { lastInsertRowid } = db.addDecision({ decision, options, expected, confidence });
  console.log(`Logged as decision #${lastInsertRowid}. Use /outcome ${lastInsertRowid} later to record what happened.\n`);
}

function help() {
  console.log(`
Commands:
  /mode <name>     switch mode: ${Object.keys(MODES).join(", ")}
  /modes           describe modes
  /journal         write a journal entry (tagged to current mode)
  /decide          log a decision
  /decisions       list decisions
  /outcome <id>    record what actually happened
  /help, /quit
Anything else is sent to your twin.
`);
}

async function handle(line) {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  switch (cmd) {
    case "/help": return help();
    case "/modes":
      return console.log(Object.entries(MODES).map(([k, v]) => `  ${k}: ${v.desc}`).join("\n") + "\n");
    case "/mode":
      if (!MODES[rest[0]]) return console.log("Unknown mode. Try /modes\n");
      mode = rest[0];
      return console.log(`Switched to ${mode} mode.${mode === "past" ? " Go at your own pace. Nothing here is rushed." : ""}\n`);
    case "/journal": {
      const entry = await rl.question("Write your entry: ");
      if (entry.trim()) { db.addJournal(entry, mode === "past" ? "past" : "general"); console.log("Saved.\n"); }
      return;
    }
    case "/decide": return logDecision();
    case "/decisions": {
      const open = db.openDecisions(), done = db.resolvedDecisions(20);
      console.log("Open:\n" + (open.map((d) => `  #${d.id} ${d.decision}`).join("\n") || "  none"));
      console.log("Resolved:\n" + (done.map((d) => `  #${d.id} ${d.decision} -> ${d.outcome}`).join("\n") || "  none") + "\n");
      return;
    }
    case "/outcome": {
      const id = parseInt(rest[0], 10);
      if (!id) return console.log("Usage: /outcome <id>\n");
      const outcome = await rl.question("What actually happened? ");
      console.log(db.resolveDecision(id, outcome) ? "Recorded.\n" : "No such decision.\n");
      return;
    }
    case "/quit": case "/exit": rl.close(); process.exit(0);
    default: return console.log("Unknown command. /help\n");
  }
}

console.log("Digital Twin ready. Type /help for commands.\n");
if (!fs.existsSync("profile.md")) console.log("Tip: copy profile.example.md to profile.md and fill it in first.\n");

while (true) {
  const line = (await rl.question("you: ")).trim();
  if (!line) continue;
  if (line.startsWith("/")) await handle(line);
  else await chat(line);
}
