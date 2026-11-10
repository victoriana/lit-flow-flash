# lit-flow-flash

Instead of letting generative content ad infinitum fragment your attention, you flow-read quality literature deliberately, then flash-write a short piece that echoes its style, borrows its motifs, and reinterprets them in a new context. You choose the form: an **Epigram** (15-25 words), a **Vignette** (30-50 words), or a **Drabble** (exactly 100 words). **lit-flow-flash** acts as an honest, fact-based coach that scores your prose against the passage you read, tracking clarity trends over time to help transform expansive, dreamlike, evocative reading into concise, precise, poignant writing.

## Why it works

**lit-flow-flash** joins focused reading and deliberate writing into a single practice, and measures the result.

The flow-read is deliberate immersion in public-domain prose or authentic stylistic generation from works that have survived over a century of scrutiny. You anchor your attention to a specific passage—either prompted by author or retrieved from your text corpus—rather than an infinite feed.

The subsequent piece forces distillation:
- An **Epigram** leaves room for a single focused observation delivered in a single breath.
- A **Vignette** leaves room for a short atmospheric scene built across two to four fluid sentences.
- A **Drabble** demands a complete miniature story with sustained prose and a distinct turn.

No word is filler. Every word must earn its place by echoing the tone of what you read, by carrying a motif forward, and by reinterpreting a concept into something new. This is not a summary; it is a creative transposition.

The coach closes the loop with strict, fact-based feedback: how well did your piece match the author's style? Which motifs did you recall? Did your reinterpretation feel fresh or derivative? Over time, you see your clarity trends—whether you are getting better at holding, distilling, and transforming syntax into spoken or written muscle memory.

## Try it yourself

See [sample-session.md](sample-session.md) for a full read→write→judge transcript — a deliberately shoddy epigram scored against Ann Radcliffe.

---
## How it works

The app follows a simple three-stage loop:

1. **Select & Generate/Read** — The user picks a form (**Epigram**, **Vignette**, or **Drabble**) and specifies any public domain work or author (defaulting to *The Mysteries of Udolpho by Ann Radcliffe*). Gemini fetches or generates an authentic 250–300 word passage in that distinct voice.
2. **Write (Closed-book)** — Immediately after reading, the user drafts a piece entirely from memory with zero assistance from text tools. The submission must echo the author's style, reinterpret motifs, and strictly satisfy the word count bounds of the chosen form.
3. **Evaluate (Agentic-AI)** — Gemini scores the piece across five metrics (0–10 each), computes a total score out of 100, formats the feedback cleanly with line-wrapped notes, and saves the entry to \`.state/<USER_ID>.json\`. 

The orchestrator enforces the loop sequentially: it asks for your form, generates/presents the passage, waits for your constrained entry, scores, and saves.


## Forms

At startup, the app prompts you to choose your form:

| Form | Word Count | Purpose & Conversational Equivalent |
|---|---|---|
| **Epigram** | 15–25 words | Single focused observation; 1 spoken breath/remark |
| **Vignette** | 30–50 words | Short atmospheric scene; 2–4 fluid sentences |
| **Drabble** | Exactly 100 words | Sustained prose; complete miniature story |

Word counts are strictly enforced by the CLI before submission to the evaluator. Hyphenated words (e.g., "well-lit") count as one word. The form name and target word count are passed directly to the judge so concision and precision are evaluated relative to that form's specific constraints.

## Architecture & Tech Stack

| Component | Runtime | Role | Key Files |
|---|---|---|---|
| **Orchestrator** | TypeScript (\`tsx\`) | Interactive CLI, form selection, direct Gemini API integration, score formatting, and state saving | \`orchestrator/src/run.ts\` |
| **MCP Server** | Go | MCP service layer exposing reading tools and history | \`mcp-server/main.go\`, \`app/main.go\` |
| **Eval Harness** | TypeScript + Python | Legacy batch runner for gold-standard validation | \`eval-harness/run-eval.ts\`, \`eval-harness/engine/evaluator.py\` |

## Quick Start

### Prerequisites

- Node.js 18+ with \`npm\` (and \`tsx\`)
- Go 1.22+ (optional, if running the Go MCP server)
- Google API key (from Google AI Studio)

### Installation & Run

1. Clone the repository and install dependencies:
```bash
cd orchestrator
npm install
 ```
2. Set your Google Gemini API key:
```bash
export GEMINI_API_KEY="your_api_key_here"

(On Windows PowerShell: $env:GEMINI_API_KEY="your_api_key_here")
```
3. Start the application:
```bash
npm start
```
## Configuration
  
You can bypass CLI prompts or target specific sessions using environment variables:

| Variable | Default | Description |
|---|---|---|
| \`GEMINI_API_KEY\` | *(required)* | Google AI Studio API key |
| \`GEMINI_MODEL\` | \`gemini-3.8-flash\` | Gemini model used for generation and evaluation |
| \`FORM\` | *(prompt)* | Bypasses menu prompt (\`epigram\`, \`vignette\`, or \`drabble\`) |
| \`USER_ID\` | \`default\` | Session identifier for state tracking (\`.state/<USER_ID>.json\`) |

### Example CLI Shortcuts

FORM=epigram npm start

FORM=vignette USER_ID=alex npm start

## Scoring & State

Gemini evaluates each entry on five core metrics (0–10 scale):

| Metric | Description |
|---|---|
| \`style_alignment\` | How closely your prose matches the source author's voice and cadence |
| \`motif_reuse\` | Whether you drew upon symbols, images, or atmospheric cues from the passage |
| \`precision\` | Exactness of word choice and phrasing |
| \`concision\` | Tightness of writing with zero wasted filler relative to form length |
| \`originality\` | How fresh your transformation is (heavily penalizes verbatim copying) |

**Total Score calculation:**  
Total Score = (Style + Motif + Precision + Concision + Originality) x 2 = Score out of 100

All progress is saved to \`.state/<USER_ID>.json\` with full metric breakdowns, timestamps, and target word counts so you can track clarity and style trends over time.

---

## 💡 What Makes This Special

Standard AI chat interfaces are built to be fluid, accommodating, and endlessly polite—they want to please you, keep the conversation moving, and forgive your mistakes. lit-flow-flash strips away that conversational cushion and replaces it with programmatic friction.

Instead of acting as a passive chat prompt, it operates as an automated loop: generating targeted literary passages, enforcing rigid word-count boundaries before evaluation, scoring your output against objective metrics, and persisting your progression locally over time.

If your goal is to master literary works so deeply that their cadence alters your natural speech and expression, this app functions as a cognitive gym. Just like lifting weights creates micro-tears that force muscle growth, the combination of strict word boundaries and harsh scoring forces your brain to distill expansive, dreamlike reading into sharp, precise, and resonant prose.
