# NikoKadi

An online multiplayer version of Kadi — play with friends from anywhere.

## How it works

1. Visit the hosted site (GitHub Pages)
2. Enter a display name — no sign-up needed (anonymous auth)
3. **Create a room** to get a 6-character room code, or **join** with a friend's code
4. Once 2+ players are in, the host starts the game
5. Take turns playing cards — the game syncs in real time via Supabase

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS + CSS, hosted on GitHub Pages |
| Auth | Supabase Anonymous Auth |
| Database | Supabase Postgres (rooms, players, game state) |
| Real-time sync | Supabase Realtime (postgres_changes) |
| Deployment | GitHub Actions → GitHub Pages |

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project
2. In **Authentication → Providers**, enable **Anonymous Sign-Ins**
3. Open the **SQL Editor** and run the contents of [`supabase/schema.sql`](supabase/schema.sql)
4. Copy your project **URL** and **anon key** from **Settings → API**

### 2. Configure the app

Edit `config.js` and replace the placeholders:

```javascript
var SUPABASE_URL = 'https://your-project.supabase.co';
var SUPABASE_ANON_KEY = 'your-anon-key-here';
```

The anon key is public by design — Row Level Security policies protect your data.

### 3. Run locally

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

### 4. Deploy to GitHub Pages

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically deploys to GitHub Pages on every push to `main`.

To enable it:
1. Go to **Settings → Pages** in your GitHub repo
2. Set the source to **GitHub Actions**
3. Push to `main` — the site will deploy automatically

## Game rules

- **54-card deck** (standard + 2 jokers)
- Match by **suit or rank** to play a card
- **Penalty cards:** 2 (draw 2), 3 (draw 3), Joker (draw 5) — stackable
- **Jump (J):** Skip the next player
- **Kickback (K):** Reverse play direction
- **Question (Q/8):** Must answer with matching suit/rank or draw
- **Ace:** Request any suit
- **Niko Kadi:** Declare when you have ≤ 2 cards — required before winning
- First player to empty their hand (with declaration) wins the round

## Tests

```bash
node --test
```
