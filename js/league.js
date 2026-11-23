// Bots, Elo ratings, leagues and persistence.
// All seven leagues run a season at the same time. When the player finishes a league
// round, every league plays that round (bot-vs-bot games are simulated from ratings).
// At the end of a season the top 2 of each league go up and the bottom 2 go down,
// for bots as well as the player.
(function (root) {
  const LEAGUES = [
    { name: 'Bronze', base: 400, color: '#c98a4b', icon: '🥉' },
    { name: 'Silver', base: 700, color: '#b8c4cc', icon: '🥈' },
    { name: 'Gold', base: 1000, color: '#e6b422', icon: '🥇' },
    { name: 'Platinum', base: 1300, color: '#6fd3c7', icon: '💠' },
    { name: 'Diamond', base: 1600, color: '#7aa7ff', icon: '💎' },
    { name: 'Master', base: 1900, color: '#c07aff', icon: '👑' },
    { name: 'Grandmaster', base: 2200, color: '#ff6b6b', icon: '🏆' }
  ];
  const TOP = LEAGUES.length - 1;
  const NAMES = [
    ['Pip', 'Rookie Ray', 'Tilly', 'Bumble', 'Dot'],
    // the higher leagues have 6 bots, so with the player every league has 6 players
    ['Milo', 'Sasha', 'Gus', 'Nova', 'Juniper', 'Hazel'],
    ['Ember', 'Orion', 'Talia', 'Bishop Bo', 'Quill', 'Rune'],
    ['Vega', 'Rook Rana', 'Cyrus', 'Lyra', 'Knightly', 'Solstice'],
    ['Zephyr', 'Indigo', 'Atlas', 'Sable', 'Kestrel', 'Aurora'],
    ['Magnus Bot', 'Valkyrie', 'Oracle', 'Tempest', 'Cipher', 'Phantom'],
    ['Titan', 'Nemesis', 'Paragon', 'Sentinel', 'Omega', 'Zenith']
  ];
  const AVATARS = ['🐣', '🐢', '🦊', '🐼', '🐙', '🦉', '🐺', '🦅', '🐉', '🤖'];
  const BOTS = [];
  LEAGUES.forEach((L, li) => NAMES[li].forEach((name, j) => BOTS.push({
    id: `b${li}_${j}`, name, league: li, elo: L.base - 150 + j * 60, avatar: AVATARS[(li + j * 3) % AVATARS.length]
  })));
  const botById = id => BOTS.find(b => b.id === id);
  const ROUNDS = 5;

  const KEY = 'checkmate-arena-v1';
  let S;
  function fresh() {
    return { player: { name: 'You', rating: 500, peak: 500, games: 0, w: 0, d: 0, l: 0 },
      leagueIdx: 0, trophies: [], history: [], seasonsLog: [],
      botRatings: Object.fromEntries(BOTS.map(b => [b.id, b.elo])) };
  }

  // ---------- persistence & migration ----------
  function load() {
    try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch (e) { S = fresh(); }
    for (const b of BOTS) if (S.botRatings[b.id] == null) S.botRatings[b.id] = b.elo;
    if (!S.members) migrate();
    S.season = S.seasons[S.leagueIdx];
    return S;
  }
  // Older saves only had the player's league: build the others around it.
  function migrate() {
    S.members = {};
    LEAGUES.forEach((L, li) => { S.members[li] = BOTS.filter(b => b.league === li).map(b => b.id); });
    S.members[S.leagueIdx].unshift('me');
    S.leagueHistory = {}; LEAGUES.forEach((L, li) => { S.leagueHistory[li] = []; });
    const old = S.season;
    S.seasonNum = old ? old.num : 1;
    S.seasons = {};
    LEAGUES.forEach((L, li) => {
      if (li === S.leagueIdx && old) { S.seasons[li] = { ...old, ids: Object.keys(old.table), prevPos: null }; return; }
      S.seasons[li] = makeSeason(li);
      // catch up to the same round as the player's league
      for (let r = 0; r < (old ? old.round : 0); r++) playRound(li, null);
    });
    save();
  }
  function save() {
    try { const copy = { ...S }; delete copy.season; localStorage.setItem(KEY, JSON.stringify(copy)); } catch (e) {}
  }
  function reset() { S = fresh(); migrate(); S.season = S.seasons[S.leagueIdx]; save(); }

  // ---------- ratings ----------
  const rating = id => id === 'me' ? S.player.rating : S.botRatings[id];
  const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));
  function ratePlayer(botId, score) {
    const p = S.player, opp = rating(botId);
    const k = p.games < 20 ? 40 : 24;
    const delta = Math.round(k * (score - expected(p.rating, opp)));
    p.rating = Math.max(100, p.rating + delta);
    p.peak = Math.max(p.peak, p.rating);
    S.botRatings[botId] = Math.round(S.botRatings[botId] - delta / 4);
    return delta;
  }
  function recordGame(score) {
    const p = S.player; p.games++;
    if (score === 1) p.w++; else if (score === 0) p.l++; else p.d++;
  }

  // ---------- seasons ----------
  // Round robin by the circle method. Five players get a "bye" so everyone sits out once.
  function makeSeason(li) {
    const ids = S.members[li].slice();
    const arr = ids.length % 2 ? ids.concat('bye') : ids.slice();
    const n = arr.length, rounds = [];
    let a = arr.slice();
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) pairs.push(r % 2 ? [a[n - 1 - i], a[i]] : [a[i], a[n - 1 - i]]);
      rounds.push(pairs);
      a = [a[0], a[n - 1], ...a.slice(1, n - 1)];
    }
    return { num: S.seasonNum, league: li, ids, rounds: rounds.slice(0, ROUNDS), round: 0,
      table: Object.fromEntries(ids.map(id => [id, { p: 0, w: 0, d: 0, l: 0, pts: 0 }])), results: [], prevPos: null };
  }
  function simulate(a, b) {
    const e = expected(S.botRatings[a], S.botRatings[b]);
    const draw = 0.22, r = Math.random();
    const sc = r < e - draw / 2 ? 1 : r < e + draw / 2 ? 0.5 : 0;
    const d = Math.round(10 * (sc - e));
    S.botRatings[a] += d; S.botRatings[b] -= d;
    return sc;
  }
  function applyResult(T, a, b, scoreA) {
    T[a].p++; T[b].p++;
    if (scoreA === 1) { T[a].w++; T[b].l++; T[a].pts += 1; }
    else if (scoreA === 0) { T[b].w++; T[a].l++; T[b].pts += 1; }
    else { T[a].d++; T[b].d++; T[a].pts += 0.5; T[b].pts += 0.5; }
  }
  // Play the current round of league li. playerScore is used for the player's own game.
  function playRound(li, playerScore) {
    const s = S.seasons[li]; if (s.round >= s.rounds.length) return;
    s.prevPos = Object.fromEntries(standings(li).map((r, i) => [r.id, i + 1]));
    const out = [];
    for (const [a, b] of s.rounds[s.round]) {
      if (a === 'bye' || b === 'bye') { out.push({ a, b, bye: true }); continue; }
      let sc;
      if (a === 'me') sc = playerScore; else if (b === 'me') sc = 1 - playerScore; else sc = simulate(a, b);
      applyResult(s.table, a, b, sc); out.push({ a, b, sc });
    }
    s.results.push(out);
    s.round++;
  }
  function nextFixture() {
    const s = S.season; if (s.round >= s.rounds.length) return null;
    const pair = s.rounds[s.round].find(p => p.includes('me'));
    if (!pair || pair.includes('bye')) return null;
    return { botId: pair[0] === 'me' ? pair[1] : pair[0], color: pair[0] === 'me' ? 'w' : 'b' };
  }
  // The player finished their league game: every league plays this round.
  function completeRound(playerScore) {
    LEAGUES.forEach((L, li) => playRound(li, li === S.leagueIdx ? playerScore : null));
    let summary = null;
    if (S.season.round >= S.season.rounds.length) summary = endSeason();
    save();
    return summary;
  }
  function standings(li = S.leagueIdx) {
    const s = S.seasons[li], T = s.table;
    const rows = Object.keys(T).map(id => ({ id, ...T[id] })).sort((x, y) => y.pts - x.pts || y.w - x.w || rating(y.id) - rating(x.id));
    rows.forEach((r, i) => { r.move = s.prevPos && s.prevPos[r.id] ? s.prevPos[r.id] - (i + 1) : 0; });
    return rows;
  }
  function endSeason() {
    const finals = LEAGUES.map((L, li) => standings(li));
    const up = {}, down = {};
    LEAGUES.forEach((L, li) => {
      if (li < TOP) up[li] = finals[li].slice(0, 2).map(r => r.id);
      if (li > 0) down[li] = finals[li].slice(-2).map(r => r.id);
      S.leagueHistory[li].push({ season: S.seasonNum, champion: finals[li][0].id, promoted: up[li] || [], relegated: down[li] || [],
        table: finals[li].map(r => ({ id: r.id, pts: r.pts, w: r.w, d: r.d, l: r.l })) });
    });
    // move everyone
    const next = {};
    LEAGUES.forEach((L, li) => {
      next[li] = S.members[li].filter(id => !(up[li] || []).includes(id) && !(down[li] || []).includes(id))
        .concat(down[li + 1] || [], up[li - 1] || []);
    });
    S.members = next;
    // the player's result
    const li = S.leagueIdx, pos = finals[li].findIndex(r => r.id === 'me') + 1;
    const newLi = +Object.keys(next).find(k => next[k].includes('me'));
    let outcome = newLi > li ? 'promoted' : newLi < li ? 'relegated' : 'stay';
    if (pos === 1 && li === TOP) outcome = 'champion';
    if (pos === 1) S.trophies.push({ league: li, season: S.seasonNum, date: Date.now() });
    const summary = { season: S.seasonNum, league: li, pos, outcome, pts: finals[li][pos - 1].pts, newLeague: newLi };
    S.seasonsLog.push(summary);
    S.leagueIdx = newLi;
    S.seasonNum++;
    LEAGUES.forEach((L, i) => { S.seasons[i] = makeSeason(i); });
    S.season = S.seasons[S.leagueIdx];
    return summary;
  }

  // ---------- leaderboard ----------
  const botLeague = id => +Object.keys(S.members).find(k => S.members[k].includes(id));
  function leaderboard() {
    const rows = BOTS.map(b => ({ id: b.id, name: b.name, avatar: b.avatar, rating: S.botRatings[b.id], league: botLeague(b.id) }));
    rows.push({ id: 'me', name: S.player.name, avatar: '🙂', rating: S.player.rating, league: S.leagueIdx });
    rows.sort((a, b) => b.rating - a.rating || (a.id === 'me' ? -1 : 1));
    rows.forEach((r, i) => { r.move = S.lbPrev && S.lbPrev[r.id] ? S.lbPrev[r.id] - (i + 1) : 0; });
    return rows;
  }
  // Remember everyone's leaderboard position just before ratings change, so arrows show who moved.
  function snapshotRanks() { const lb = leaderboard(); S.lbPrev = Object.fromEntries(lb.map((r, i) => [r.id, i + 1])); }
  // ---------- predictions ----------
  // Recent form, in rating points: how much better/worse than expected a player has scored lately.
  function form(id) {
    let sum = 0, n = 0;
    if (id === 'me') {
      for (const h of S.history.slice(0, 8)) {
        if (h.oppRating == null) continue;
        sum += h.score - expected(h.myRating || S.player.rating, h.oppRating); n++;
      }
    } else {
      for (const li in S.seasons) for (const round of S.seasons[li].results.slice(-8)) for (const g of round) {
        if (g.bye || (g.a !== id && g.b !== id)) continue;
        const opp = g.a === id ? g.b : g.a, sc = g.a === id ? g.sc : 1 - g.sc;
        sum += sc - expected(rating(id), rating(opp)); n++;
      }
    }
    if (!n) return 0;
    // shrink small samples toward zero, cap at ±120 points
    return Math.max(-120, Math.min(120, Math.round(sum / (n + 2) * 400)));
  }
  // Last n results (oldest first) as 'W' / 'D' / 'L'.
  function recent(id, n = 5) {
    const ch = sc => sc === 1 ? 'W' : sc === 0 ? 'L' : 'D';
    if (id === 'me') return S.history.slice(0, n).map(h => ch(h.score)).reverse();
    const out = [];
    for (const li in S.seasons) for (const round of S.seasons[li].results) for (const g of round)
      if (!g.bye && (g.a === id || g.b === id)) out.push(ch(g.a === id ? g.sc : 1 - g.sc));
    return out.slice(-n);
  }
  // Win / draw / loss chances for a vs b, from ratings adjusted by recent form.
  function predict(a, b, bonus = 0, rA, rB) {
    const fa = form(a), fb = form(b);
    const e = expected((rA ?? rating(a)) + fa + bonus, (rB ?? rating(b)) + fb);
    const draw = 0.24 * (1 - Math.min(1, Math.abs(e - 0.5) * 1.8)) + 0.03;
    let win = Math.max(0.01, e - draw / 2), loss = Math.max(0.01, 1 - e - draw / 2);
    const t = win + draw + loss; win /= t; loss /= t;
    const pct = x => Math.round(x * 100);
    const W = pct(win), L = pct(loss);
    return { win: W, draw: 100 - W - L, loss: L, formA: fa, formB: fb };
  }

  function addHistory(g) { S.history.unshift(g); S.history = S.history.slice(0, 40); save(); }

  root.League = { LEAGUES, BOTS, botById, load, save, reset, state: () => S, rating, ratePlayer, recordGame,
    nextFixture, completeRound, standings, leaderboard, snapshotRanks, addHistory, expected, botLeague, predict, form, recent,
    season: li => S.seasons[li], members: li => S.members[li], history: li => S.leagueHistory[li] || [] };
})(typeof window !== 'undefined' ? window : globalThis);
