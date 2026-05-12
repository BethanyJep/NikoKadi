# NikoKadi

An online version of Kadi.

## Play locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Features implemented

- Supports **2+ players** (comma-separated names)
- Uses full **54-card deck** (standard deck + 2 jokers)
- Tracks **round score totals**
- Implements core Kadi flow from the referenced rules:
  - match suit/rank
  - penalty cards (2/3/Joker)
  - jump (J)
  - kickback (K)
  - question cards (Q/8) with answer follow-up
  - ace suit request
  - Niko Kadi declaration required before winning
- Includes a colorful, game-like interface

## Tests

Run focused tests:

```bash
cd <project-directory>
node --test
```
