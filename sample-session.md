# Example Session: Epigram (Radcliffe)

A deliberately shoddy epigram was submitted to test the read→write→judge loop.
The system reads a passage, internalizes it, then scores the submission against
five rubric dimensions.

## Input

**Form:** Epigram (15–25 words)
**Source work:** The Mysteries of Udolpho by Ann Radcliffe
**Submission:**

> sometimes sitting in solitude in the still of the night small things changing brings one chills.

## Passage Read & Internalized (closed-book)

> The evening gloom deepened swiftly over the wild solitude of the Apennines, whose jagged
> pinnacles now faded into an indistinct and awful majesty. Adeline sat alone by the narrow
> gothic casement of her turret chamber, resigning her spirit to that tender melancholy which
> the sublime spectacles of nature ever awakened in her heart. Below, the dark pines of the
> forest sighed in mournful cadence with the rising blast, while the distant torrent, murmuring
> over rocky precipices, seemed the voice of a deserted world. The pale orb of the moon,
> partially obscured by the drifting masses of vapor that traversed the horizon, cast a
> tremulous and uncertain beam across the vast pavement of the courtyard far below, where the
> heavy shadows of the ramparts lay stretched like colossal spectres.
>
> In such moments, her thoughts wandered with renewed anguish to the beloved scenes of her
> youth—to the peaceful valleys of the Garonne, and the gentle virtues of her departed father.
> But this luxury of grief was soon interrupted by a chill of terror. The dying taper upon the
> marble console flickered in the sudden draught, and a low, mysterious sound, like the rustling
> of heavy drapery, crept through the adjoining gallery. Adeline started, her breath suspended
> by an apprehension she could neither explain nor subdue. She listened; all was hushed in the
> profound stillness of the night, yet her beating heart refused to be reassured. It was the hour
> when superstition exerts her darkest empire over the trembling soul, and as she fixed her gaze
> upon the arched door, she perceived, with a sickening shudder, the latch slowly, noiselessly rise.

## Judge Output

SCORE: 28 / 100

Style Alignment: 2/10
Motif Reuse:     3/10
Precision:       2/10
Concision:       4/10
Originality:     3/10

Feedback:

> The submission reduces Radcliffe's lush, sublime Gothic terror to a flat, pedestrian truism.
> Syntactically limp and grammatically ungraceful ('small things changing brings one chills'),
> the line displays none of the source's atmospheric cadence or lexical elevation. While the
> motifs of nocturnal isolation and the ominous motion of the latch are vaguely gestured at, they
> are drained of dread. To fix, replace conversational filler ('sometimes sitting in', 'small
> things') with sharp, evocative diction that captures Gothic suspense—for instance: 'In
> midnight's solitary stillness, the silent lifting of an iron latch commands the trembling soul.'

## What This Demonstrates

- **Read phase:** Go MCP server fetches and exposes the source passage.
- **Write phase:** Human drafts against the internalized style (not visible text — closed-book).
- **Judge phase:** Python orchestrator calls Gemini, which scores against five rubric axes
  and returns actionable revision guidance.
- **Resilience:** [503 Busy] retry logic handled transparently; model fallback on attempt 2.
- **State persistence:** Session saved to .state/default.json for multi-turn iteration.

The loop is not "AI writes for you" — it's AI trains your ear. The judge's suggested rewrite
is a teaching artifact, not a replacement draft.
