// Bots, Elo ratings, leagues (seasons with promotion/relegation) and persistence.
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
  const NAMES = [
    ['Pip', 'Rookie Ray', 'Tilly', 'Bumble', 'Dot'],
    ['Milo', 'Sasha', 'Gus', 'Nova', 'Juniper'],
    ['Ember', 'Orion', 'Talia', 'Bishop Bo', 'Quill'],
    ['Vega', 'Rook Rana', 'Cyrus', 'Lyra', 'Knightly'],
    ['Zephyr', 'Indigo', 'Atlas', 'Sable', 'Kestrel'],
    ['Magnus Bot', 'Valkyrie', 'Oracle', 'Tempest', 'Cipher'],
    ['Titan', 'Nemesis', 'Paragon', 'Sentinel', 'Omega']
  ];
  const AVATARS = ['🐣','🐢','🦊','🐼','🐙','🦉','🐺','🦅','🐉','🤖'];
  const BOTS = [];
  LEAGUES.forEach((L, li) => NAMES[li].forEach((name, j) => BOTS.push({
    id: `b${li}_${j}`, name, league: li, elo: L.base - 120 + j * 60, avatar: AVATARS[(li + j * 3) % AVATARS.length]
  })));
  const botById = id => BOTS.find(b => b.id === id);

  const KEY = 'checkmate-arena-v1';
  let S;
  function fresh() {
    return { player: { name: 'You', rating: 500, peak: 500, games: 0, w: 0, d: 0, l: 0 },
      leagueIdx: 0, season: null, trophies: [], history: [], seasonsLog: [],
      botRatings: Object.fromEntries(BOTS.map(b => [b.id, b.elo])) };
  }
  function load() {
    try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch (e) { S = fresh(); }
    for (const b of BOTS) if (S.botRatings[b.id] == null) S.botRatings[b.id] = b.elo;
    if (!S.season) newSeason();
    return S;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function reset() { S = fresh(); newSeason(); save(); }
  const rating = id => id === 'me' ? S.player.rating : S.botRatings[id];

  const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));
  // score: 1 win, 0.5 draw, 0 loss (player perspective). Returns delta.
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

  // Round robin among 6 (player + 5 bots) via the circle method: 5 rounds x 3 games.
  function newSeason() {
    const li = S.leagueIdx;
    const ids = ['me', ...BOTS.filter(b => b.league === li).map(b => b.id)];
    const rounds = [];
    let arr = ids.slice();
    for (let r = 0; r < 5; r++) {
      const pairs = [];
      for (let i = 0; i < 3; i++) pairs.push(r % 2 ? [arr[5 - i], arr[i]] : [arr[i], arr[5 - i]]);
      rounds.push(pairs);
      arr = [arr[0], arr[5], ...arr.slice(1, 5)];
    }
    const table = Object.fromEntries(ids.map(id => [id, { p: 0, w: 0, d: 0, l: 0, pts: 0 }]));
    S.season = { num: (S.seasonsLog.length + 1), league: li, rounds, round: 0, table, results: [], done: false };
    save();
  }
  function nextFixture() {
    const s = S.season; if (s.round >= 5) return null;
    const pair = s.rounds[s.round].find(p => p.includes('me'));
    return { botId: pair[0] === 'me' ? pair[1] : pair[0], color: pair[0] === 'me' ? 'w' : 'b' };
  }
  function applyResult(a, b, scoreA) {
    const T = S.season.table;
    T[a].p++; T[b].p++;
    if (scoreA === 1) { T[a].w++; T[b].l++; T[a].pts += 1; }
    else if (scoreA === 0) { T[b].w++; T[a].l++; T[b].pts += 1; }
    else { T[a].d++; T[b].d++; T[a].pts += 0.5; T[b].pts += 0.5; }
  }
  function simulate(a, b) {
    const e = expected(S.botRatings[a], S.botRatings[b]);
    const draw = 0.22, r = Math.random();
    const sc = r < e - draw / 2 ? 1 : r < e + draw / 2 ? 0.5 : 0;
    const d = Math.round(10 * (sc - e));
    S.botRatings[a] += d; S.botRatings[b] -= d;
    return sc;
  }
  // Player finished their league game; also simulate the round's other games.
  function completeRound(playerScore) {
    const s = S.season, rnd = s.rounds[s.round], out = [];
    for (const [a, b] of rnd) {
      let sc;
      if (a === 'me') sc = playerScore; else if (b === 'me') sc = 1 - playerScore; else sc = simulate(a, b);
      applyResult(a, b, sc); out.push({ a, b, sc });
    }
    s.results.push(out);
    s.round++;
    let summary = null;
    if (s.round >= 5) summary = endSeason();
    save();
    return summary;
  }
  function standings() {
    const T = S.season.table;
    return Object.keys(T).map(id => ({ id, ...T[id] })).sort((x, y) => y.pts - x.pts || y.w - x.w || rating(y.id) - rating(x.id));
  }
  function endSeason() {
    const st = standings(), pos = st.findIndex(r => r.id === 'me') + 1, li = S.leagueIdx;
    let outcome = 'stay';
    if (pos === 1 && li === LEAGUES.length - 1) { outcome = 'champion'; S.trophies.push({ league: li, season: S.season.num, date: Date.now() }); }
    else if (pos <= 2 && li < LEAGUES.length - 1) { outcome = 'promoted'; if (pos === 1) S.trophies.push({ league: li, season: S.season.num, date: Date.now() }); S.leagueIdx++; }
    else if (pos >= 5 && li > 0) { outcome = 'relegated'; S.leagueIdx--; }
    else if (pos === 1) S.trophies.push({ league: li, season: S.season.num, date: Date.now() });
    const summary = { season: S.season.num, league: li, pos, outcome, pts: st[pos - 1].pts, newLeague: S.leagueIdx };
    S.seasonsLog.push(summary);
    newSeason();
    return summary;
  }
  function leaderboard() {
    const rows = BOTS.map(b => ({ id: b.id, name: b.name, avatar: b.avatar, rating: S.botRatings[b.id], league: b.league }));
    rows.push({ id: 'me', name: S.player.name, avatar: '🙂', rating: S.player.rating, league: S.leagueIdx });
    return rows.sort((a, b) => b.rating - a.rating);
  }
  function addHistory(g) { S.history.unshift(g); S.history = S.history.slice(0, 40); save(); }

  root.League = { LEAGUES, BOTS, botById, load, save, reset, state: () => S, rating, ratePlayer, recordGame,
    nextFixture, completeRound, standings, leaderboard, addHistory, expected };
})(typeof window !== 'undefined' ? window : globalThis);
