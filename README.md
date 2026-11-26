# 🐎 Cavalaria — Cavalry Chess

**Current version: 1.8** — 7-language switcher (EN / PT / ES / ZH / JA / FR / KO) in the header, on every screen; choice saved in the browser.

**A free browser chess variant where every piece is a cavalryman: a knight fused with a pawn, fighting over river terrain in real cavalry formations.**

The piece art is Henrique's own PNGs: the outline version for white pieces, the solid black version for black pieces — a classic knight with a pawn riding diagonally on the back of its neck. The white background was made transparent (`tools/process_pieces.py`: flood-fill from the edges, so enclosed white — the outline piece's fill — stays opaque) and the PNGs are embedded in `index.html` as data URIs (`PIECE_W` / `PIECE_B`), because the GitHub push path is text-only and corrupts binary files. The artwork sources live as base64 text (`tools/src-white.jpg.b64`, `tools/src-black.jpg.b64`); re-run `python3 tools/process_pieces.py` to regenerate the pieces and re-embed them. `piece.svg` is the retired hand-drawn symbol, kept for reference only.

Play it right now — no sign-up, no download, no cost. PC, mobile, and (probably not) your calculator.

## The game

Every piece on the board is the same: a **Cavalaria**. No kings, no queens, no castling, no promotion. Sixteen riders a side, arranged the way real cavalry rode.

### The piece — knight + pawn

Each Cavalaria moves **both** ways:

- **As a pawn:** 1 square forward; 2 squares forward on its first move (if the path is clear); captures 1 square diagonally forward.
- **As a knight:** 2 squares in one direction and 1 to the side, jumping over pieces, landing on an empty square or capturing an enemy.

### Board size

A **Board size** toggle sits above the play buttons and applies to **all modes** and all ways to play (room, Play Anyone, bot, local). Joining a room uses the host's board.

- **8 × 8 — Classic:** 16 pieces a side, river on ranks 4–5.
- **12 × 12 — Grand:** 28 pieces a side in four ranks, river on ranks 6–7 (files a–l).

### The river

With the river on, ranks 4–5 (8×8) or 6–7 (12×12) hold a band of water — one river square per file:

```
8x8  rank 5: _ _ . . . . _ _
     rank 4: . . _ _ _ _ . .

12x12 rank 7: ~ ~ ~ . . . . . . ~ ~ ~
      rank 6: . . . ~ ~ ~ ~ ~ ~ . . .
```

- **Entering** a river square is a normal move.
- **Leaving** one costs an extra square: a knight's jump from a river square is only **1 forward + 1 to the side** (a single diagonal step) instead of 2 + 1. A pawn leaving the river still steps 1 forward or captures 1 diagonally, but it can't double-step out of the river — the exit cost eats the second square.
- The cost counts **once, at the start of the move**. Jumping *over* the river costs nothing extra, and landing back in the river costs nothing extra either.
- The river penalty applies only to the knight's long leg; an empowered piece's slides are not shortened.
- **Look:** the river is drawn as one flowing illustrated river over the board (a smooth curve through the river squares, grass and sand banks, grass tufts on the water's edge, seaweed and ripples in the water) — it crosses square edges and meanders into neighbouring squares, while the rules still use the squares underneath. The tufts, weed and ripples are placed unevenly from the game's seed, so no two stretches of bank look alike. Selection, last-move and empowered outlines are drawn in the same overlay so they stay visible above the water.

### The formations — 16 pieces a side (8×8) in three ranks, 28 a side (12×12) in four

**Roman** — a solid block, 8 + 6 + 2 (from the player's side, nearest rank first):

```
. . . X X . . .
X . X X X X . X
X X X X X X X X
```

**Mongolian** — horns out wide, 6 + 6 + 4:

```
X X . . . . X X
X X X . . X X X
. X X X X X X .
```

On the 12×12 board the same two shapes grow a rank: Roman is 8 + 10 + 6 + 4, Mongolian is 8 + 8 + 8 + 4.

**Roman 12×12** (nearest rank at the bottom):

```
. . . . X X X X . . . .
. . . X X X X X X . . .
X . X X X X X X X X . X
. X . X X X X X X . X .
```

**Mongolian 12×12** (nearest rank at the bottom):

```
X X . . . . . . . . X X
X X X X . . . . X X X X
. X X X X . . X X X X .
. . X X X X X X X X . .
```

### The modes

| Mode | White | Black | River | Who starts |
|---|---|---|---|---|
| **1 — Choose Formations** | You pick: Roman or Mongolian | You pick: Roman or Mongolian | On (fixed) or off, you pick | White |
| **2 — Main: Mongol vs Roman** | Mongolian | Roman | On (fixed) or off, you pick | White |
| **3 — Random** | Randomly Roman or Mongolian | Randomly Roman or Mongolian | Always on, random shape | White |

**Random river, honestly random.** One river square per file, on rank 4 or 5 (8×8) or rank 6 or 7 (12×12) — so the river is always one connected band across the board, never two squares stacked in the same file (that would trap a pawn trying to step out of the river). Files may share a rank. Both the random formations and the random river come from a visible **seed**, so any setup can be reproduced and verified.

### Last unit standing gets stronger

When a side is down to its very last piece, its player picks an extra power for it: **♜ Rook** (slides along ranks and files) or **♝ Bishop** (slides along diagonals). It keeps its knight and pawn moves too. The choice is part of the game state, so it syncs to the other player in online games; the bot picks by counting enemies on shared ranks/files vs diagonals.

### Winning

- **Capture all of the other side's pieces.** There is no check and no checkmate — a piece under attack just dies if you don't save it.
- There is no promotion and no en passant.
- **No moves? Pass.** If a side has no legal move, the turn simply passes to the other side. If neither side can move, it's a draw. (In practice this never happens: knight moves connect the whole board, so a side with pieces on the board always has a move — the pass rule is kept as a guard and is covered by tests that verify no zero-move position ever appears in play.)

## How to play

| Button | What it does |
|---|---|
| **Create room** | Generates a 4-letter room code. Send it to a friend — they type it in and join. |
| **Join room** | Enter a friend's room code. |
| **Play anyone** | Matchmaking: you either wait in a lobby slot or join a stranger already waiting in one. |
| **Play the bot** | Solo vs a bot (Easy = random, Medium = greedy). |
| **Local 2-player** | Same screen, pass & play. |

A room link also works: open `https://<your-site>/?room=KQ7B` and the code is filled in for you.

## $0 architecture — how multiplayer is free

There is **no game server**. The whole game is one static file (`index.html`):

- **Hosting:** Cloudflare Pages (free tier) serves the static site.
- **Multiplayer:** peer-to-peer WebRTC via [PeerJS](https://peerjs.com/)'s free public broker (`0.peerjs.com`). Room codes are PeerJS peer IDs; moves travel directly between the two browsers. Nothing about your game is stored anywhere.
- **Sync that heals itself:** every move sends the full board state (not just the move), the other side acknowledges it, unacknowledged states are resent automatically, the joiner keeps asking for the board until it arrives, and both sides compare board fingerprints every few seconds — a lost message repairs itself instead of desyncing the game. Proven by `test/sync.test.js`, which runs two copies of the real page script over a fake network that drops messages, and counts only history the other side acknowledged.
- **Cost:** $0. No database, no backend to keep awake, no accounts.

Because the game is fully client-side, it also works offline for bot and local games (once loaded).

## Run it locally

```bash
# any static server works — the game is a single file
python3 -m http.server 8000
# open http://localhost:8000/
```

Tests (engine + sync + i18n, no browser needed):

```bash
node test/engine.test.js   # 98 checks: formations (8x8 + 12x12), both example boards, river, pawn/knight moves, empowerment, win, bot games
node test/sync.test.js     # 16 checks: two page copies over a fake network that drops messages (incl. a 12x12 game)
node test/i18n.test.js     # 47 checks: every key in all 7 languages, switching changes menu + in-game text, choice persists, navigator.language detection, reason translation
```

Languages: a `<select>` in the header (EN | PT | ES | ZH | JA | FR | KO), visible on the menu and in-game. Static text uses `data-i18n` attributes, dynamic strings go through `t()`; the choice is stored in `localStorage` under `lang`, else `navigator.language` is mapped to one of the 7, else English. Engine reason strings stay English in the synced game state and are translated at render time, so online play still syncs.

## Deploy to Cloudflare Pages ($0)

**Option A — dashboard (easiest, 2 minutes)**
1. Push this repo to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Pick this repo. Framework preset: **None**. Build command: *(empty)*. Output directory: `/` (the repo root — `index.html` is there).
4. Deploy. You get `https://cavalaria.pages.dev` free.

**Option B — CLI**
```bash
npm install -g wrangler
wrangler login
wrangler pages deploy . --project-name cavalaria
```

**Custom domain (optional):** Pages → Custom domains → add yours. Still free.

## Files

```
index.html            the whole game (engine + UI + multiplayer), single file
test/engine.test.js   engine unit tests (node)
test/sync.test.js     multiplayer sync tests over a fake dropping network (node)
test/i18n.test.js     7-language switcher tests (node, fake DOM)
README.md             this file
LICENSE               MIT
wrangler.toml         Cloudflare Pages notes (Pages needs no config)
```

## Versions

- **v1.8.1** — mode titles no longer show a literal `&nbsp;`: the translated strings now use a real non-breaking space (`\u00A0`), because the menu sets titles with `textContent`, which never parses HTML entities. A test pins it: no HTML entity may appear in any `data-i18n` string in any language.
- **v1.8** — 7-language switcher (EN/PT/ES/ZH/JA/FR/KO) at the top of the page, choice remembered, browser language auto-detected; formation cards show mini pictures of the real board.

## License

MIT — do what you want with it.
