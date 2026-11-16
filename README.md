# Checkmate Arena

Play chess against AI opponents in leagues, climb the ranks and review every game.
It's a plain HTML/JS app with no dependencies and no build step. Open `index.html` in a browser.

## Features
- **35 AI bots** across 7 leagues (Bronze → Grandmaster), rated about 280 to 2460. A bot's strength comes from its rating: search depth, evaluation noise and blunder rate all scale with it.
- **Elo rating** for the player. K is 40 for the first 20 games, then 24. Bots' ratings also shift as they play.
- **League seasons**: a 6-player round robin (you plus 5 bots), 5 rounds. The bots play each other in simulated games.
  Finish in the top 2 and you're promoted; finish in the bottom 2 and you're relegated. Winning the Grandmaster league makes you champion. Finishing first in any league earns a trophy.
- **Quick match**: pick any bot and a color (or random), and choose rated or casual.
- **Leaderboard**: you ranked against every bot.
- **Game review**: each move is classified (Book, Best, Excellent, Good, Inaccuracy, Mistake, Blunder) and an accuracy score is given for each side. Also includes an eval bar, a clickable eval graph, best-move arrows, and stepping through moves with the arrow keys.
- Progress is saved in `localStorage`.

## Structure
- `js/chess.js`: rules engine (legal moves, SAN, checkmate, stalemate, 50-move rule, repetition, insufficient material). Passes the standard perft tests.
- `js/ai.js`: alpha-beta search with quiescence, piece-square evaluation, skill model and analysis.
- `js/league.js`: bots, ratings, seasons, standings, persistence.
- `js/app.js`: UI.

## Install as a phone app
The app is an installable web app (PWA) and is hosted with GitHub Pages.
1. Open the site in Safari (iPhone) or Chrome (Android).
2. iPhone: Share → **Add to Home Screen**. Android: menu (⋮) → **Install app** / **Add to Home screen**.

It opens full-screen from its icon and works offline.

### How updates work
Push changes to the branch GitHub Pages deploys from. The next time the app opens with internet, the service worker (`sw.js`) loads the newest files and caches them for offline use. Nothing needs to be reinstalled.
If someone already has the app open when an update arrives, a "New version is ready – Refresh" banner appears.
When you add a new file to the app, also add it to the `FILES` list in `sw.js` so it's available offline.
