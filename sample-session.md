# Lit-Flow-Flash — Example Session

**Date:** November 12, 2026
**Work:** This Side of Paradise (1920) — F. Scott Fitzgerald
**Form:** Epigram (15–25 words)
**Result:** 12 / 100

## The Workflow

Lit-Flow-Flash enforces a closed-book writing exercise against verbatim public-domain text. The app never displays source prose until you have proven you know where your section begins and ends. You read on paper; the machine only verifies.

### Step 1: Title selection
All six works:
  1) "A Sicilian Romance" (1790) — Ann Radcliffe
  2) "The Romance of the Forest" (1791) — Ann Radcliffe
  3) "The Mysteries of Udolpho" (1794) — Ann Radcliffe
  4) "This Side of Paradise" (1920) — F. Scott Fitzgerald
  5) "The Beautiful and Damned" (1922) — F. Scott Fitzgerald
  6) "The Great Gatsby" (1925) — F. Scott Fitzgerald

Select exact title: 4

Loading "This Side of Paradise" (1920)...
✓ Corpus loaded (80,829 words). No text will be displayed.

Paste opening sentence of the section you read (a few words that appear exactly once): Their first luncheon was one

Paste closing sentence of the section you read (a few words that appear exactly once): never again was it quite so mutually spontaneous.

--- BOUNDARY CONFIRMATION ---
Opening: "Their first luncheon was one"
Closing: "never again was it quite so mutually spontaneous."
-----------------------------
Confirm these boundaries? [Y/n]: Y

--- YOUR SECTION (127 words) ---
Their first luncheon was one of the memorable events of Amory's early life. He was quite radiant and gave off a peculiar brightness and charm. Monsignor called out the best that he had thought by question and suggestion, and Amory talked with an ingenious brilliance of a thousand impulses and desires and repulsions and faiths and fears. He and Monsignor held the floor, and the older man, with his less receptive, less accepting, yet certainly not colder mentality, seemed content to listen and bask in the mellow sunshine that played between these two. Monsignor gave the effect of sunlight to many people; Amory gave it in his youth and, to some extent, when he was very much older, but never again was it quite so mutually spontaneous.
--------------------------------------

Choose your writing form:
  1) Epigram  - 15–25 words (single focused observation)
  2) Vignette - 30–50 words (short atmospheric scene)
  3) Drabble  - Exactly 100 words (complete miniature story)

Select [1-3] (default: 2): 1

Form selected: Epigram (15–25 words (single focused observation))

Draft your Epigram:
> Meeting with an older man who is a mentor of great knowledge can be quite eventful.

Evaluating submission...

[503 Busy] gemini-3.8-flash unavailable. Retrying in 1s...
[System] Using model: gemini-3.8-flash (Attempt 2)

==========================================
 SCORE: 12 / 100
==========================================
Style Alignment: 2/10
Motif Reuse:     2/10
Precision:       2/10
Concision:       3/10
Originality:     3/10

FEEDBACK:
While you met the minimum 15-word threshold, the submission read as a dry, pedestrian
platitude rather than an incisive Fitzgeraldian epigram.
- Style: Fitzgerald's lyric, bittersweet romanticism is entirely flattened into bureaucratic prose.
- Motifs: The central motif of mutual radiance—the rare, unrepeatable sunshine between
  youth and age—is neglected in favor of a vague label ('eventful').
- Fix: Discard clunky padding like 'who is a mentor of great knowledge.' Ground the
  observation in Fitzgerald's imagery of brief, unrecoverable warmth and reciprocal light.
==========================================

Session saved to .state/default.json

## Why the score was low (and why that is good)

The judge did not hallucinate a critique. It correctly identified the exact motif the passage is built on: the mellow sunshine that played between these two. It correctly noted that the epigram replaced it with the dead word eventful. The feedback even quotes the original padding back at the writer. A rubric-graded platitude getting 12/100 means the instrument has teeth.

The rewrite the feedback implies:

> Two men made sunlight at lunch — Amory young, Monsignor old; neither lit the other alone, and the glow never came so free again.

This is 24 words, within epigram range, keeps the radiance motif, and keeps the irreversibility.

## Design takeaways

1. No randomization equals honest evaluation. In the earlier design, a CSPRNG picked the excerpt, so scores partly measured luck-of-the-draw context. Here, the user bounds the span, so the score measures only the writing against text the user demonstrably located.
2. Uniqueness gating is the integrity check. A fragment matching exactly once across 80k words cannot be guessed or pasted from a summary. It forces genuine familiarity with the physical reading.
3. Echo-before-write converts a memory claim into a verified contract: fragments confirmed, then span revealed, then pen required.
4. Failure modes are informative. Typos re-prompt with the offending string quoted. A 503 on the model cascade retried once and succeeded transparently without user action.

