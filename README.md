# lit-flow-flash

Instead of letting algorithms fragment your attention, you take back control by reading quality literature deliberately for thirty minutes, then flash-writing a 100-word drabble that echoes its style, borrows its motifs, and reinterprets them in a new context. lit-flow-flash acts as an encouraging, fact-based coach that scores your prose against the passage you read, tracking clarity trends over time to help transform scattered thinking into precise, intentional focus.


## How it works

The app follows a simple three-stage loop:

1. **Read** — The user selects a chunk from a public-domain literary work and
   reads it for about 30 minutes at their own pace (user-enforced; the app
   does not time it). The user then specifies the start and end sentences and
   the title of the work, so the engine knows exactly which block of
   public-domain text to use as the evaluation reference.
2. **Write** — After reading, the user writes a drabble (a short narrative)
   that echoes the author's style, borrows motifs from the passage, and
   reinterprets them into a new context. The drabble must stick to a
   predefined length — usually exactly 100 words.
3. **Evaluate** — The agent scores the drabble against the marked passage for
   style alignment, motif recall, and creative transposition, then delivers
   encouraging, fact-based feedback.

The session state machine enforces the order: a user cannot start writing
until the reading milestone is complete, and the evaluator only runs after a
drabble is submitted.

## Monorepo layout

| Path | Runtime | Role |
| --- | --- | --- |
| app/ | Go | Orchestrator: human-in-the-loop turn loop + session state machine |
| mcp-server/ | Go | MCP service layer exposing books.get_chunk and user.read_history |
| eval-harness/ | TypeScript + Python | Batch runner (run-eval.ts) driving a Python stylistic engine |
| datasets/ | JSON / text | Gold-standard records and local public-domain corpora |

## Quick start

Step 1 - build the Go services:

    cd app && go build ./... && cd ..
    cd mcp-server && go build -o bin/mcp-server . && cd ..

Step 2 - install and run the eval harness:

    cd eval-harness
    npm install
    pip install -r engine/requirements.txt
    npm run eval

## Environment variables

- LITFLOW_TEXTS - override path to the text corpus (default ../datasets/texts)
- LITFLOW_STATE_DIR - where reading-history JSON is stored (default ../.state)
## Conventions

- Two separate Go modules; no shared workspace file yet.
- eval-harness is ESM ("type": "module") and must stay in sync with
  tsconfig.json module setting "NodeNext".
- Public-domain sources only: F. Scott Fitzgerald and Ann Radcliffe.
