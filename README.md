# lit-flow-flash

A reading-coach agent that streams public-domain literary texts to a reader,
tracks milestones through an explicit state machine, and scores generated
prose against a stylistic gold standard.

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
