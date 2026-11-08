# lit-flow-flash

Instead of letting generative content ad infinitum fragment your attention, you flow-read quality literature deliberately for thirty minutes, then flash-write a short piece that echoes its style, borrows its motifs, and reinterprets them in a new context. You choose the form: a **nano-fic** (15-25 words) or a **drabble** (exactly 100 words). **lit-flow-flash** acts as an honest, fact-based coach that scores your prose against the passage you read, tracking clarity trends over time to help transform expansive, dreamlike, evocative reading into concise, precise, poignant writing.

## Why it works

**lit-flow-flash** joins focused reading and deliberate writing into a single practice, and measures the result.

The thirty-minute flow-read is deliberate immersion in public domain prose that has survived over a century of academic and literary scrutiny. You anchor your attention to a specific passage — the one you yourself marked — rather than an infinite feed.

The subsequent piece forces distillation. A nano-fic leaves room for a single image; a drabble leaves room for a turn. Either way, no word is filler. Every word must earn its place by echoing the tone of what you read, by carrying a motif forward, by reinterpreting a concept into something new. This is not a summary. It is a creative transposition.

The coach closes the loop with fact-based feedback: how well did your piece match the passage's style? Which motifs did you recall? Did your reinterpretation feel fresh or derivative? Over time, you see your own clarity trends — whether you are getting better at holding, distilling, and transforming. That feedback loop turns meditative absorption into active cognizance.

## How it works

The app follows a simple three-stage loop:

1. **Read (Un-augmented)** — The user selects a chunk from a public-domain literary work and reads it for about 30 minutes at their own pace (user-enforced; the app does not time it). The user then specifies the start and end sentences and the title of the work, so the engine knows exactly which block of public-domain text to use as the evaluation reference.
2. **Write (Closed-book)** — Immediately after reading, the user chooses a form and writes a piece entirely from memory, with zero assistance from generative AI or text tools. The piece must echo the author's style, reinterpret specific motifs into a novel context, and adhere to the strict word count of the chosen form (see below).
3. **Evaluate (Agentic-AI)** — The agent scores the piece against the marked passage for style alignment, motif recall, and creative transposition, then delivers encouraging, fact-based feedback.

The orchestrator enforces the loop sequentially (a future state machine will make this explicit): it asks for your form, fetches the passage, waits for your piece, then scores and saves. Order is structural — each step completes before the next begins.

## Forms

At startup the app asks which form you want to write:

| Form       | Length            | Notes                                                     |
|------------|-------------------|-----------------------------------------------------------|
| `nano-fic` | 15-25 words       | A single image or turn; hint-fiction scale                |
| `drabble`  | exactly 100 words | A complete miniature story with room for a turn           |

Word counts are enforced: if your piece is outside the allowed range, you are asked to try again. Hyphenated words (e.g. "well-lit") count as one word. The form you chose is passed to the judge, so concision and precision are scored relative to that form's length, and it is saved with each entry so you can compare trends within a form.

## Languages

| Language   | Used for                                                                | Key files                                                    |
|------------|-------------------------------------------------------------------------|--------------------------------------------------------------|
| TypeScript | Orchestrator (form selection, turn loop, Gemini judge, state) and eval harness runner | `orchestrator/src/run.ts`, `eval-harness/run-eval.ts`, `eval-harness/src/metrics.ts` |
| Go         | MCP server (reading tools, history) and utility module                  | `mcp-server/main.go`, `app/main.go`                          |
| Python     | Stylistic scoring engine for the eval harness                           | `eval-harness/engine/evaluator.py`                           |

## Monorepo layout

| Path          | Runtime             | Role                                                             |
|---------------|---------------------|------------------------------------------------------------------|
| orchestrator/ | TypeScript          | Main app: MCP client, Gemini judge, state management             |
| mcp-server/   | Go                  | MCP service layer exposing books.get_chunk and user.read_history |
| eval-harness/ | TypeScript + Python | Legacy batch runner for gold-standard validation                 |
| datasets/     | JSON / text         | Text corpus and gold-standard records                            |
| app/          | Go                  | Utility module (zero external dependencies)                      |

## Quick start

### Prerequisites

- Go 1.27+
- Node.js 18+ with npm
- Google API key (from [Google AI Studio](https://aistudio.google.com))

Step 1 — build the Go MCP server:

```
cd mcp-server && go build -o ../bin/mcp-server.exe . && cd ..
```

Step 2 — install the orchestrator:

```
cd orchestrator && npm install && cd ..
```

Step 3 — set your API key:

```
export GEMINI_API_KEY=your_key_here
```

Step 4 — add reading material to `datasets/texts/`:

```
curl -o datasets/texts/gatsby.txt "https://www.gutenberg.org/files/64317/64317-0.txt"
```

Step 5 — run (you will be asked to choose nano-fic or drabble):

```
cd orchestrator && npm start
```

See the **Configuration** table below for `FORM`, `TEXT_ID`, `CHUNKS`, etc.

## Configuration

| Variable       | Default   | Description                                                                 |
|----------------|-----------|-----------------------------------------------------------------------------|
| `FORM`         | (prompt)  | `nano-fic` or `drabble`. If set, skips the form prompt                      |
| `TEXT_ID`      | `gatsby`  | Filename (without `.txt`) in `datasets/texts/`                              |
| `CHUNKS`       | `3`       | Number of chunks to read                                                    |
| `CHUNK_OFFSET` | `0`       | Start reading from this chunk index                                         |
| `USER_ID`      | `default` | Session identifier for `.state/`                                            |

Examples:

```
# Choose the form interactively
npm start

# Nano-fic practice on the first chunk
FORM=nano-fic TEXT_ID=gatsby CHUNKS=1 npm start

# Read from the middle of the book and write a full drabble
FORM=drabble TEXT_ID=gatsby CHUNKS=2 CHUNK_OFFSET=5 npm start
```

## Scoring

Gemini evaluates each piece on five metrics (0-10 scale):

| Metric            | Description                                                    |
|-------------------|----------------------------------------------------------------|
| `style_alignment` | How closely the prose matches the source author's voice        |
| `motif_reuse`     | Whether you reused images, themes, or symbols from the passage |
| `precision`       | Whether each word is exact and purposeful                      |
| `concision`       | How tight the writing is — no wasted words                     |
| `originality`     | Whether the piece transforms influences into something fresh   |

Each entry includes `notes` with specific, actionable feedback and `word_count`. Concision and precision are judged relative to the form you chose.

All entries are saved to `.state/<USER_ID>.json` (by default `.state/default.json`), each tagged with its `form`.

## Environment Variables

### Orchestrator

- `GEMINI_API_KEY` — Google AI Studio API key (required)
- `FORM` — `nano-fic` or `drabble` (optional; skips the prompt)
- `TEXT_ID` — Filename in `datasets/texts/` (default: gatsby)
- `CHUNKS` — Number of chunks (default: 3)
- `CHUNK_OFFSET` — Starting chunk index (default: 0)
- `USER_ID` — Session identifier for `.state/` (default: default)

### MCP Server

- `LITFLOW_TEXTS` — Path to text corpus (default: ../datasets/texts)
- `LITFLOW_STATE_DIR` — Where reading-history JSON is stored (default: ../.state)

## Conventions

- The orchestrator (`orchestrator/`) speaks MCP as a client to `mcp-server/` and calls Gemini for judging.
- `eval-harness/` is for validating against pre-made examples; it does not score user entries.
- `app/` is a dependency-free Go module for future utility code.
- Public-domain sources only (e.g., Fitzgerald, Radcliffe).
- `.state/` is not committed — it contains personal practice data.

---

## 💡 What Makes This Special

Standard AI chat interfaces are built to be fluid, accommodating, and endlessly polite—they want to please you, keep the conversation moving, and forgive your mistakes. **lit-flow-flash** strips away that conversational cushion and replaces it with **rigorous, unyielding friction**.

It introduces an **agentic-adjacent constraint loop** where the application orchestrates the process—generating dynamic prompts, enforcing strict word boundaries, evaluating your output against hard criteria, and tracking your long-term progression—rather than just waiting passively for your next prompt.

### The 4 Advantages Over a Standard Chat Session

1. **Zero-Context Blindness (The Closed-Book Trap)**  
   In a normal chat, the AI shares your immediate history, letting you lean on safety nets. **lit-flow-flash** enforces a strict closed-book separation: you read the generated passage, and when you draft your response, you do so purely from memory and cognitive imprinting. You cannot peek back at the text, which forces your brain to internalize and hold rhythm, syntax, and motifs rather than parroting or copy-pasting.

2. **Brutal, Non-Flattering Objective Scoring**  
   Standard assistants are hardwired to praise creative twists. This app acts as an uncompromising literary critic. It evaluates your piece on strict structural metrics (`nano-fic` word bounds or exact drabble lengths), computes a total score out of 100, and calls out lazy phrasing or verbatim plagiarism instantly.

3. **Longitudinal Tracking & Accumulating State**  
   Every session is saved locally to `.state/default.json`. Over weeks and months, this builds an unchangeable historical record of your clarity and stylistic trends, turning isolated writing exercises into a quantifiable mastery loop across authors like Ann Radcliffe or F. Scott Fitzgerald.

4. **Habit Architecture & Flow State Protection**  
   A web browser tab is riddled with distractions. Running a dedicated terminal tool (`npm start`) creates an intentional, ritualized loop:  
   $$\text{Choose Form} \longrightarrow \text{Generate Passage} \longrightarrow \text{Read} \longrightarrow \text{Write Under Constraints} \longrightarrow \text{Face Judgment}$$

### A Cognitive Gym for Style Transposition

If your goal is to master literary works so deeply that their cadence alters your natural speech and expression, this app functions as a cognitive gym. Just like lifting weights creates micro-tears that force muscle growth, the combination of strict word boundaries and harsh scoring forces your brain to distill expansive, dreamlike reading into sharp, precise, and resonant prose.
