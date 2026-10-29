# lit-flow-flash

Instead of letting generative content ad infinitum fragment your attention, you flow-read quality literature deliberately for thirty minutes, then flash-write a 100-word drabble that echoes its style, borrows its motifs, and reinterprets them in a new context. **lit-flow-flash** acts as an honest, fact-based coach that scores your prose against the passage you read, tracking clarity trends over time to help transform expansive, dreamlike, evocative reading into concise, precise, poignant writing.

## Why it works

**lit-flow-flash** joins focused reading and deliberate writing into a single practice, and measures the result.

The thirty-minute flow-read is deliberate immersion in public domain prose 
that has survived over a century of academic and literary scrutiny.. You anchor your attention to a specific passage — the one you yourself marked — rather than an infinite feed.

The subsequent drabble forces distillation. A hundred words can carry no filler. Every word must earn its place by echoing the tone of what you read, by carrying a motif forward, by reinterpreting a concept into something new. This is not a summary. It is a creative transposition.

The coach closes the loop with fact-based feedback: how well did your drabble match the passage's style? Which motifs did you recall? Did your reinterpretation feel fresh or derivative? Over time, you see your own clarity trends — whether you are getting better at holding, distilling, and transforming. That feedback loop turns meditative absorption into active cognizance.

## How it works

The app follows a simple three-stage loop:

1. **Read (Un-augmented)** — The user selects a chunk from a public-domain literary work and
   reads it for about 30 minutes at their own pace (user-enforced; the app
   does not time it). The user then specifies the start and end sentences and
   the title of the work, so the engine knows exactly which block of
   public-domain text to use as the evaluation reference.
2. **Write (Closed-book)** — Immediately after reading, the user writes a drabble 
   (a short narrative) entirely from memory, with zero assistance from 
   generative AI or text tools. The piece must echo the author's style, 
   reinterpret specific motifs into a novel context, and adhere to a 
   strict, predefined constraint of exactly 100 words.
3. **Evaluate (Agentic-AI)** — The agent scores the drabble against the marked passage for
   style alignment, motif recall, and creative transposition, then delivers
   encouraging, fact-based feedback.

The session state machine enforces the order: a user cannot start writing
until the reading milestone is complete, and the evaluator only runs after a
drabble is submitted.

## Languages

| Language | Used for | Key files |
| --- | --- | --- |
| Go | Orchestrator + MCP server (session state, turn loop, tool handlers) | `app/main.go`, `app/internal/agent/orchestrator.go`, `mcp-server/main.go` |
| Python | Stylistic scoring engine (style alignment, motif recall, transposition) | `eval-harness/engine/evaluator.py` |
| TypeScript | Eval harness runner (batch execution, metric aggregation, reporting) | `eval-harness/run-eval.ts`, `eval-harness/src/metrics.ts` |

## Monorepo layout

| Path | Runtime | Role |
| --- | --- | --- |
| orchestrator/ | TypeScript | Main app: MCP client, Gemini judge, state management |
| mcp-server/ | Go | MCP service layer exposing books.get_chunk and user.read_history |
| eval-harness/ | TypeScript + Python | Legacy batch runner for gold-standard validation |
| datasets/ | JSON / text | Text corpus and gold-standard records |
| app/ | Go | Utility module (zero external dependencies) |

## Quick start

### Prerequisites

- Go 1.27+
- Node.js 18+ with npm
- Google API key (from [Google AI Studio](https://aistudio.google.com))

Step 1 — build the Go MCP server:

    cd mcp-server && go build -o ../bin/mcp-server.exe . && cd ..

Step 2 — install the orchestrator:

    cd orchestrator && npm install && cd ..

Step 3 — set your API key:

    export GEMINI_API_KEY=your_key_here

Step 4 — add reading material to `datasets/texts/`:

    curl -o datasets/texts/gatsby.txt "https://www.gutenberg.org/files/64317/64317-0.txt"

Step 5 — run:

    cd orchestrator && npm start

See the **Configuration** table below for `TEXT_ID`, `CHUNKS`, `MIN_WORDS`, etc.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `TEXT_ID` | `gatsby` | Filename (without `.txt`) in `datasets/texts/` |
| `CHUNKS` | `3` | Number of chunks to read |
| `CHUNK_OFFSET` | `0` | Start reading from this chunk index |
| `MIN_WORDS` | `15` | Minimum word count for flash piece |
| `MAX_WORDS` | `25` | Maximum word count for flash piece |
| `USER_ID` | `default` | Session identifier for `.state/` |

Examples:

    # Practice on the first chunk
    TEXT_ID=gatsby CHUNKS=1 npm start

    # Read from the middle of the book
    TEXT_ID=gatsby CHUNKS=2 CHUNK_OFFSET=5 npm start

    # Full 100-word drabble practice
    MIN_WORDS=95 MAX_WORDS=105 npm start

## Scoring

Gemini evaluates each flash piece on five metrics (0–10 scale):

| Metric | Description |
|---|---|
| `style_alignment` | How closely the prose matches the source author's voice |
| `motif_reuse` | Whether you reused images, themes, or symbols from the passage |
| `precision` | Whether each word is exact and purposeful |
| `concision` | How tight the writing is — no wasted words |
| `originality` | Whether the piece transforms influences into something fresh |

Each entry includes `notes` with specific, actionable feedback and `word_count`.

All entries are saved to `.state/default.json`.

## Environment Variables

### Orchestrator
- `GEMINI_API_KEY` — Google AI Studio API key (required)
- `TEXT_ID` — Filename in `datasets/texts/` (default: gatsby)
- `CHUNKS` — Number of chunks (default: 3)
- `CHUNK_OFFSET` — Starting chunk index (default: 0)
- `MIN_WORDS` — Minimum flash piece length (default: 15)
- `MAX_WORDS` — Maximum flash piece length (default: 25)

### MCP Server
- `LITFLOW_TEXTS` — Path to text corpus (default: ../datasets/texts)
- `LITFLOW_STATE_DIR` — Where reading-history JSON is stored (default: ../.state)
  
## Conventions

- The orchestrator (`orchestrator/`) speaks MCP as a client to `mcp-server/` and calls Gemini for judging.
- `eval-harness/` is for validating against pre-made examples; it does not score user entries.
- `app/` is a dependency-free Go module for future utility code.
- Public-domain sources only (e.g., Fitzgerald, Radcliffe).
- `.state/` is not committed — it contains personal practice data.
