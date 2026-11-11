#!/usr/bin/env bash
# verify-corpus.sh — run from orchestrator/
d=".corpus/cache"

check() {
  local label="$1" slug="$2" pattern="$3"
  local f="$d/$slug.clean.txt"
  echo "=== $label ==="
  if [ -f "$f" ]; then
    echo "words: $(wc -w < "$f")"
    echo "signature hits: $(grep -c -i -E "$pattern" "$f")"
    head -c 400 "$f"; echo; echo
  else
    echo "MISSING"; echo
  fi
}

check "A Sicilian Romance (#2542)"        a-sicilian-romance        "Louissac|Emilia|Falconara|Sicily"
check "The Romance of the Forest (#64701)" the-romance-of-the-forest "Adeline|St\. Foix|La Motte|Deville"
check "The Mysteries of Udolpho (#3268)"   the-mysteries-of-udolpho  "Emily|Udolpho|St\. Aubert|Montoni"
check "This Side of Paradise (#805)"       this-side-of-paradise     "Amory|Blaine|Beatrice|Princeton"
check "The Beautiful and Damned (#9830)"   the-beautiful-and-damned  "Anthony Patch|Gloria|Gilbert"
check "The Great Gatsby (#64317)"          the-great-gatsby          "Gatsby|Carraway|West Egg|Daisy"
