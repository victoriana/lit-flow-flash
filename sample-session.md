# Lit-Flow-Flash — Example Session

**Date:** November 12, 2026
**Work:** This Side of Paradise (1920) — F. Scott Fitzgerald
**Form:** Epigram (15–25 words)
**Result:** Attempt 1: 12 / 100 → Attempt 2: 41 / 100

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

### Step 2: First draft — the platitude

Draft your Epigram:
> Meeting with an older man who is a mentor of great knowledge can be quite eventful.

Evaluating submission...

[503 Busy] gemini-3.8-flash unavailable. Retrying in 1s...
[System] Using model: gemini-3.8-flash (Attempt 2)

==========================================
 SCORE: 12 / 50
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

### Step 3: Revision — applying the feedback

Rewritten using the judge's own fix ("Ground the observation in Fitzgerald's imagery of
brief, unrecoverable warmth and reciprocal light"):

Draft your Epigram:
> Two men made sunlight at lunch — Amory young, Monsignor old; neither lit the other alone, and the glow never came so free again.

Evaluating submission...

==========================================
 SCORE: 41 / 50
==========================================
Style Alignment: 8/10
Motif Reuse:     8.5/10
Precision:       7.5/10
Concision:       9/10
Originality:     8/10

FEEDBACK:
Strengths: Excellent compression into exactly 23 words, deftly capturing Fitzgerald's
bittersweet tone and the mutual nature of their illumination. Translating 'mutually
spontaneous' into 'never came so free again' is evocative and emotionally resonant.

Fixes: 'Two men made sunlight at lunch' leans slightly too blunt and literal for
Fitzgerald's lush, romantic cadence; consider elevating the phrasing (e.g., 'Sunlight
gathered between them at table') to match the elegance of the second clause.
==========================================

Session saved to .state/default.json

## Why this transcript matters

The score tripled (12 → 41) without changing the passage, the form, or the prompt — only
the prose changed. That proves the instrument measures writing quality, not luck.

The judge did not hallucinate a critique on either pass:
- Pass 1 correctly identified the exact motif the passage is built on (the mellow sunshine
  that played between these two) and named the dead word that replaced it ('eventful').
- Pass 2 acknowledged the improvement, quoted the strongest clause back approvingly, and
  still found a specific weakness: the opening clause leaned too blunt for Fitzgerald's
  cadence. A judge that keeps finding real flaws after a big jump is a trustworthy judge.

The revision the second round of feedback implies:

> Sunlight gathered between them at table — Amory young, Monsignor old; neither lit the
> other alone, and the glow never came so free again.

("Sunlight gathered" elevates the cadence while keeping the radiance motif and the
irreversibility.)

## Design takeaways

1. No randomization equals honest evaluation. In the earlier design, a CSPRNG picked the
   excerpt, so scores partly measured luck-of-the-draw context. Here, the user bounds the
   span, so the score measures only the writing against text the user demonstrably located.
2. Uniqueness gating is the integrity check. A fragment matching exactly once across 80k
   words cannot be guessed or pasted from a summary. It forces genuine familiarity with
   the physical reading.
3. Echo-before-write converts a memory claim into a verified contract: fragments confirmed,
   then span revealed, then pen required.
4. Failure modes are informative. Typos re-prompt with the offending string quoted. A 503
   on the model cascade retried once and succeeded transparently without user action.
5. The loop is iterative by design. Both attempts persist to .state/<USER_ID>.json, so the
   before/after pair becomes a tracked clarity trend — the whole point of the practice.
