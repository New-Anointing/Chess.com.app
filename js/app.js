// UI: home, play, league, quick match, leaderboard, game review.
(function () {
  const $ = s => document.querySelector(s);
  const app = $('#app');
  const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const { LEAGUES, BOTS } = League;
  let S = League.load();
  let G = null;        // live game
  let R = null;        // review state
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtEval = s => AI.isMate(s) ? `M${Math.abs(AI.mateIn(s))}` : (s > 0 ? '+' : '') + (s / 100).toFixed(1);

  const VALS = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const TCS = [
    { id: 'none', label: '∞ No timer', base: 0, inc: 0 }, { id: '1', label: '⚡ 1 min', base: 60, inc: 0 },
    { id: '3|2', label: '⚡ 3 | 2', base: 180, inc: 2 }, { id: '5', label: '⏱ 5 min', base: 300, inc: 0 },
    { id: '10', label: '⏱ 10 min', base: 600, inc: 0 }, { id: '30', label: '🕰 30 min', base: 1800, inc: 0 }];
  let tcId = 'none';
  try { tcId = localStorage.getItem('ca-tc') || 'none'; } catch (e) {}
  const tcPicker = () => `<div class="seg wrap" id="tc">${TCS.map(t => `<button data-v="${t.id}" class="${t.id === tcId ? 'on' : ''}">${t.label}</button>`).join('')}</div>`;
  function bindTc(root) {
    root.querySelectorAll('#tc button').forEach(b => b.onclick = () => {
      tcId = b.dataset.v; try { localStorage.setItem('ca-tc', tcId); } catch (e) {}
      root.querySelectorAll('#tc button').forEach(x => x.classList.toggle('on', x === b));
    });
  }
  const fmtClock = ms => {
    ms = Math.max(0, ms); const s = ms / 1000;
    if (s < 10) return s.toFixed(1);
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };
  // Pieces `color` has captured, plus material lead.
  function captured(board, color) {
    const start = { p: 8, n: 2, b: 2, r: 2, q: 1 }, mine = {}, theirs = {};
    let my = 0, th = 0;
    for (const p of board) {
      if (!p || p === 'k' || p === 'K') continue;
      const t = p.toLowerCase(), own = (p < 'a') === (color === 'w');
      if (own) { mine[t] = (mine[t] || 0) + 1; my += VALS[t]; } else { theirs[t] = (theirs[t] || 0) + 1; th += VALS[t]; }
    }
    const list = [];
    for (const t of ['q', 'r', 'b', 'n', 'p']) for (let i = 0; i < Math.max(0, start[t] - (theirs[t] || 0)); i++) list.push(t);
    const pts = list.reduce((a, t) => a + VALS[t], 0);
    const glyph = t => GLYPH[color === 'w' ? t : t.toUpperCase()];
    return `<span class="caps" title="${pts} points captured">${list.map(t => `<i>${glyph(t)}</i>`).join('')}${pts ? `<em>${pts} pts</em>` : ''}${my > th ? `<b>+${my - th}</b>` : ''}</span>`;
  }
  function animateMove(m, flip) {
    if (!m) return;
    const board = app.querySelector('.board'); if (!board || !board.animate) return;
    const size = board.clientWidth / 8, pos = s => { const v = flip ? 63 - s : s; return [v & 7, v >> 3]; };
    const slide = (from, to) => {
      const el = board.querySelector(`[data-sq="${to}"] .pc`); if (!el) return;
      const [fx, fy] = pos(from), [tx, ty] = pos(to);
      el.animate([{ transform: `translate(${(fx - tx) * size}px,${(fy - ty) * size}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.3,1)' });
    };
    slide(m.from, m.to);
    const pc = board.querySelector(`[data-sq="${m.to}"] .pc`);
    if (pc && /♔|♚/.test(pc.textContent) && Math.abs((m.to & 7) - (m.from & 7)) === 2) {
      if (m.to > m.from) slide(m.to + 1, m.to - 1); else slide(m.to - 2, m.to + 1);
    }
    const toSq = board.querySelector(`[data-sq="${m.to}"]`); toSq && toSq.classList.add('landed');
  }
  // Keep the current move visible inside the move list without scrolling the page.
  function scrollMoves(box, el) {
    if (!box) return;
    if (!el) { box.scrollTop = box.scrollHeight; box.scrollLeft = box.scrollWidth; return; }
    box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2;
    box.scrollTop = el.offsetTop - box.clientHeight / 2;
  }
  function confetti() {
    const cols = ['#81b64c', '#f7c045', '#7aa7ff', '#ff6b6b', '#c07aff', '#fff'];
    for (let i = 0; i < 70; i++) {
      const d = document.createElement('div'); d.className = 'confetti';
      d.style.cssText = `left:${Math.random() * 100}vw;background:${cols[i % cols.length]};animation-delay:${Math.random() * .6}s;animation-duration:${1.8 + Math.random() * 1.6}s;transform:rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(d); setTimeout(() => d.remove(), 4200);
    }
  }
  let clockTimer = null;

  // ---------- navigation ----------
  function nav(view) {
    R = null;
    window.scrollTo(0, 0);
    app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter'); setTimeout(() => app.classList.remove('enter'), 700);
    document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    ({ home, league, quick, leaderboard, history })[view]();
  }
  document.querySelectorAll('.nav button').forEach(b => b.onclick = () => {
    if (G && !G.over && !confirm('Leave the current game? It will count as a resignation.')) return;
    if (G && !G.over) resign(true);
    G = null; nav(b.dataset.view);
  });

  const leagueBadge = li => `<span class="badge" style="--c:${LEAGUES[li].color}">${LEAGUES[li].icon} ${LEAGUES[li].name}</span>`;

  // ---------- home ----------
  function home() {
    S = League.state();
    const p = S.player, fx = League.nextFixture(), bot = fx && League.botById(fx.botId);
    const lb = League.leaderboard(), rank = lb.findIndex(r => r.id === 'me') + 1;
    app.innerHTML = `
      <section class="hero card">
        <div>
          <h1>Welcome back</h1>
          <p class="muted">Climb seven leagues against AI opponents. Finish top 2 to get promoted, bottom 2 get relegated.</p>
        </div>
        <div class="stats">
          <div><b>${p.rating}</b><span>Rating</span></div>
          <div><b>#${rank}</b><span>Global rank</span></div>
          <div><b>${p.w}/${p.d}/${p.l}</b><span>W / D / L</span></div>
          <div><b>${S.trophies.length}</b><span>Trophies</span></div>
        </div>
      </section>
      <div class="grid2">
        <section class="card">
          <h2>League</h2>
          <p>${leagueBadge(S.leagueIdx)} Season ${S.season.num} · Round ${S.season.round + 1} of 5</p>
          ${bot ? `<p>Next: ${bot.avatar} <b>${esc(bot.name)}</b> (${League.rating(bot.id)}) · you play ${fx.color === 'w' ? 'White' : 'Black'}</p>` : ''}
          <div class="row"><button class="btn primary" id="playLeague">Play league match</button><button class="btn" id="seeLeague">Standings</button></div>
        </section>
        <section class="card">
          <h2>Quick match</h2>
          <p class="muted">Pick any opponent from 300 to 2400 strength. Rated or casual.</p>
          <div class="row"><button class="btn primary" id="goQuick">Quick match</button><button class="btn" id="goLb">Leaderboard</button></div>
        </section>
      </div>
      <section class="card"><h2>League ladder</h2><div class="ladder">${LEAGUES.map((L, i) => `
        <div class="rung ${i === S.leagueIdx ? 'cur' : ''} ${i < S.leagueIdx ? 'past' : ''}" style="--c:${L.color}">
          <div class="ic">${L.icon}</div><div>${L.name}</div><small>${L.base - 120}–${L.base + 120}</small></div>`).join('')}</div></section>`;
    $('#playLeague').onclick = playLeague;
    $('#seeLeague').onclick = () => nav('league');
    $('#goQuick').onclick = () => nav('quick');
    $('#goLb').onclick = () => nav('leaderboard');
  }

  // ---------- league ----------
  function league() {
    S = League.state();
    const st = League.standings(), s = S.season, fx = League.nextFixture();
    const last = s.results[s.results.length - 1];
    const nm = id => id === 'me' ? '<b>You</b>' : esc(League.botById(id).name);
    app.innerHTML = `
      <section class="card">
        <div class="row between"><h2>${leagueBadge(s.league)} Season ${s.num}</h2><span class="muted">Round ${Math.min(s.round + 1, 5)} / 5</span></div>
        <table class="tbl"><thead><tr><th>#</th><th>Player</th><th>Rating</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr></thead><tbody>
        ${st.map((r, i) => {
          const b = r.id === 'me' ? null : League.botById(r.id);
          const zone = i < 2 && s.league < LEAGUES.length - 1 ? 'up' : i >= 4 && s.league > 0 ? 'down' : (i === 0 ? 'up' : '');
          return `<tr class="${r.id === 'me' ? 'me' : ''} ${zone}"><td>${i + 1}</td><td>${b ? b.avatar + ' ' + esc(b.name) : '🙂 You'}</td><td>${League.rating(r.id)}</td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td><b>${r.pts}</b></td></tr>`;
        }).join('')}</tbody></table>
        <p class="legend"><span class="up">■</span> ${s.league === LEAGUES.length - 1 ? 'Champion' : 'Promotion'} <span class="down">■</span> Relegation</p>
        ${fx ? `<button class="btn primary" id="playLeague">Play round ${s.round + 1} vs ${esc(League.botById(fx.botId).name)}</button>` : ''}
      </section>
      ${last ? `<section class="card"><h3>Last round results</h3>${last.map(r => `<div class="res">${nm(r.a)} <span>${r.sc === 1 ? '1 – 0' : r.sc === 0 ? '0 – 1' : '½ – ½'}</span> ${nm(r.b)}</div>`).join('')}</section>` : ''}
      <section class="card"><h3>Season history & trophies</h3>
        ${S.seasonsLog.length ? S.seasonsLog.slice().reverse().map(l => `<div class="res">Season ${l.season} ${leagueBadge(l.league)} finished #${l.pos} (${l.pts} pts) — <b>${l.outcome}</b></div>`).join('') : '<p class="muted">No completed seasons yet.</p>'}
        <p>${S.trophies.map(t => `<span title="${LEAGUES[t.league].name} S${t.season}" class="trophy">${LEAGUES[t.league].icon}</span>`).join('') || ''}</p>
      </section>`;
    const b = $('#playLeague'); if (b) b.onclick = playLeague;
  }
  function playLeague() {
    const fx = League.nextFixture(), bot = League.botById(fx.botId);
    modal(`<div class="vs"><span>🙂</span><b>VS</b><span>${bot.avatar}</span></div>
      <h2>Round ${S.season.round + 1}: ${esc(bot.name)} <small class="muted">(${League.rating(bot.id)})</small></h2>
      <p class="muted">You play ${fx.color === 'w' ? '♔ White' : '♚ Black'}</p>
      <h4>Time control</h4>${tcPicker()}
      <div class="row"><button class="btn primary" data-a="go">Start match</button><button class="btn" data-a="x">Cancel</button></div>`,
      a => a === 'go' && startGame({ bot, color: fx.color, mode: 'league', rated: true, tc: tcId }));
    bindTc(document.querySelector('.overlay'));
  }

  // ---------- quick match ----------
  function quick() {
    let color = 'w', rated = true, sel = BOTS[0].id;
    app.innerHTML = `<section class="card"><h2>Quick match</h2>
      <div class="row"><label>Color</label><div class="seg" id="col"><button data-v="w" class="on">♔ White</button><button data-v="r">🎲 Random</button><button data-v="b">♚ Black</button></div>
      <label class="chk"><input type="checkbox" id="rated" checked> Rated</label></div>
      <div class="row tcrow"><label>Time</label>${tcPicker()}</div>
      <div class="bots">${LEAGUES.map((L, li) => `<div class="botgrp"><h4 style="color:${L.color}">${L.icon} ${L.name}</h4>${BOTS.filter(b => b.league === li).map(b =>
        `<button class="bot ${b.id === sel ? 'on' : ''}" data-id="${b.id}"><span>${b.avatar}</span><b>${esc(b.name)}</b><small>${League.rating(b.id)}</small></button>`).join('')}</div>`).join('')}</div>
      <button class="btn primary big" id="start">Play</button></section>`;
    app.querySelectorAll('#col button').forEach(b => b.onclick = () => { color = b.dataset.v; app.querySelectorAll('#col button').forEach(x => x.classList.toggle('on', x === b)); });
    app.querySelectorAll('.bot').forEach(b => b.onclick = () => { sel = b.dataset.id; app.querySelectorAll('.bot').forEach(x => x.classList.toggle('on', x === b)); });
    bindTc(app);
    $('#rated').onchange = e => rated = e.target.checked;
    $('#start').onclick = () => startGame({ bot: League.botById(sel), color: color === 'r' ? (Math.random() < .5 ? 'w' : 'b') : color, mode: 'quick', rated, tc: tcId });
  }

  // ---------- leaderboard ----------
  function leaderboard() {
    const lb = League.leaderboard();
    app.innerHTML = `<section class="card"><h2>Global leaderboard</h2><table class="tbl"><thead><tr><th>#</th><th>Player</th><th>League</th><th>Rating</th></tr></thead><tbody>
      ${lb.map((r, i) => `<tr class="${r.id === 'me' ? 'me' : ''}"><td>${i + 1}</td><td>${r.avatar} ${esc(r.id === 'me' ? 'You' : r.name)}</td><td>${leagueBadge(r.league)}</td><td><b>${r.rating}</b></td></tr>`).join('')}
      </tbody></table></section>`;
  }

  // ---------- history ----------
  function history() {
    S = League.state();
    app.innerHTML = `<section class="card"><h2>Recent games</h2>${S.history.length ? S.history.map((h, i) => `
      <div class="hist"><span class="r ${h.score === 1 ? 'win' : h.score === 0 ? 'loss' : 'draw'}">${h.score === 1 ? 'W' : h.score === 0 ? 'L' : 'D'}</span>
      <div><b>vs ${esc(h.opp)}</b> (${h.oppRating}) · ${h.mode === 'league' ? 'League' : 'Quick'} · ${h.color === 'w' ? 'White' : 'Black'} · ${h.reason}<br>
      <small class="muted">${new Date(h.date).toLocaleString()} · ${h.sans.length} plies ${h.delta != null ? `· ${h.delta >= 0 ? '+' : ''}${h.delta}` : ''}</small></div>
      <button class="btn" data-i="${i}">Review</button></div>`).join('') : '<p class="muted">No games yet.</p>'}
      <hr><button class="btn danger" id="reset">Reset all progress</button></section>`;
    app.querySelectorAll('.hist button').forEach(b => b.onclick = () => review(S.history[+b.dataset.i]));
    $('#reset').onclick = () => { if (confirm('Reset rating, leagues and history?')) { League.reset(); S = League.state(); home(); } };
  }

  // ---------- board rendering ----------
  function boardHTML(chess, opts) {
    const { flip, sel, targets = [], last, check, arrow } = opts;
    let h = '';
    for (let i = 0; i < 64; i++) {
      const sq = flip ? 63 - i : i, r = sq >> 3, f = sq & 7, p = chess.board[sq];
      const cls = ['sq', (r + f) % 2 ? 'dk' : 'lt'];
      if (sel === sq) cls.push('sel');
      if (last && (last.from === sq || last.to === sq)) cls.push('last');
      if (check === sq) cls.push('check');
      const t = targets.includes(sq);
      if (t) cls.push(p ? 'cap' : 'dot');
      const coordF = (flip ? r === 0 : r === 7) ? `<i class="cf">${'abcdefgh'[f]}</i>` : '';
      const coordR = (flip ? f === 7 : f === 0) ? `<i class="cr">${8 - r}</i>` : '';
      h += `<div class="${cls.join(' ')}" data-sq="${sq}">${coordR}${coordF}${p ? `<span class="pc ${p < 'a' ? 'w' : 'b'}">${GLYPH[p]}</span>` : ''}</div>`;
    }
    let svg = '';
    if (arrow) {
      const c = s => { const v = flip ? 63 - s : s; return [(v & 7) + .5, (v >> 3) + .5]; };
      const [x1, y1] = c(arrow.from), [x2, y2] = c(arrow.to);
      svg = `<svg class="arrows" viewBox="0 0 8 8"><defs><marker id="ah" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto"><path d="M0,0 L3,1.5 L0,3z" fill="#7fc97f"/></marker></defs>
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#7fc97f" stroke-width=".18" stroke-opacity=".85" marker-end="url(#ah)"/></svg>`;
    }
    return `<div class="board">${h}${svg}</div>`;
  }

  // ---------- live game ----------
  function startGame({ bot, color, mode, rated, tc }) {
    R = null;
    window.scrollTo(0, 0);
    const T = TCS.find(t => t.id === tc) || TCS[0];
    G = { chess: new Chess(), bot, color, mode, rated, sans: [], moves: [], sel: null, over: false, thinking: false, botElo: League.rating(bot.id),
      tc: T, time: { w: T.base * 1000, b: T.base * 1000 }, turnStart: Date.now() };
    clearInterval(clockTimer);
    if (T.base) clockTimer = setInterval(tick, 100);
    app.classList.add('enter'); setTimeout(() => app.classList.remove('enter'), 700);
    renderGame();
    if (G.chess.turn !== color) setTimeout(botMove, 400);
  }

  function renderGame() {
    const keepScroll = window.scrollY;
    const g = G, c = g.chess, legal = g.over ? [] : c.moves();
    const targets = g.sel != null ? legal.filter(m => m.from === g.sel).map(m => m.to) : [];
    const last = g.moves[g.moves.length - 1];
    const check = c.inCheck() ? c.kingSq(c.turn) : null;
    const pl = S.player, b = g.bot;
    const botC = g.color === 'w' ? 'b' : 'w';
    const clock = col => g.tc.base ? `<div class="clock ${c.turn === col && !g.over ? 'active' : ''}" id="clk-${col}">${fmtClock(remaining(col))}</div>` : '';
    const top = `<div class="pbar"><span class="av">${b.avatar}</span><div class="who"><div><b>${esc(b.name)}</b> <small>(${g.botElo})</small>${g.thinking ? '<span class="think">thinking<i>.</i><i>.</i><i>.</i></span>' : ''}</div>${captured(c.board, botC)}</div>${clock(botC)}</div>`;
    const bottom = `<div class="pbar"><span class="av">🙂</span><div class="who"><div><b>You</b> <small>(${pl.rating})</small></div>${captured(c.board, g.color)}</div>${clock(g.color)}</div>`;
    let moveList = '';
    g.sans.forEach((san, i) => { if (i % 2 === 0) moveList += `<span class="n">${i / 2 + 1}.</span>`; moveList += `<span class="mi ${i === g.sans.length - 1 ? 'cur' : ''}">${san}</span>`; });
    app.innerHTML = `<div class="play">
      <div class="boardwrap">${top}${boardHTML(c, { flip: g.color === 'b', sel: g.sel, targets, last, check })}${bottom}</div>
      <aside class="card side">
        <h3>${g.mode === 'league' ? `${leagueBadge(S.season.league)} Round ${S.season.round + 1}` : 'Quick match'} <small class="muted">${g.rated ? 'rated' : 'casual'} · ${g.tc.label}</small></h3>
        <div class="moves" id="mvs">${moveList || '<p class="muted">Make your move.</p>'}</div>
        <div class="row">${g.over ? `<button class="btn primary" id="rev">Game review</button><button class="btn" id="back">Continue</button>`
          : `<button class="btn" id="draw">½ Offer draw</button><button class="btn danger" id="resign">Resign</button>`}</div>
        <p id="msg" class="muted">${g.msg || ''}</p>
      </aside></div>`;
    scrollMoves($('#mvs'), $('#mvs .cur'));
    window.scrollTo(0, keepScroll);
    if (g.anim) { animateMove(g.anim, g.color === 'b'); g.anim = null; }
    app.querySelectorAll('.sq').forEach(el => el.onclick = () => clickSq(+el.dataset.sq));
    if (g.over) { $('#rev').onclick = () => review(g.record); $('#back').onclick = () => { G = null; nav(g.mode === 'league' ? 'league' : 'quick'); }; }
    else { $('#resign').onclick = () => confirm('Resign this game?') && resign(); $('#draw').onclick = offerDraw; }
  }

  function clickSq(sq) {
    const g = G; if (!g || g.over || g.thinking || g.chess.turn !== g.color) return;
    const c = g.chess, p = c.board[sq];
    if (g.sel != null) {
      const ms = c.moves().filter(m => m.from === g.sel && m.to === sq);
      if (ms.length) {
        if (ms.length > 1) return choosePromo(ms);
        return userMove(ms[0]);
      }
    }
    g.sel = p && (p < 'a') === (g.color === 'w') ? sq : null;
    renderGame();
  }

  function choosePromo(ms) {
    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = `<div class="card promo">${ms.map((m, i) => `<button data-i="${i}">${GLYPH[m.promo]}</button>`).join('')}</div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('button').forEach(b => b.onclick = () => { ov.remove(); userMove(ms[+b.dataset.i]); });
  }

  function remaining(col) {
    const g = G; return g.time[col] - (col === g.chess.turn && !g.over && g.tc.base ? Date.now() - g.turnStart : 0);
  }
  function tick() {
    const g = G; if (!g || g.over || !g.tc.base) { clearInterval(clockTimer); return; }
    for (const col of ['w', 'b']) {
      const el = document.getElementById('clk-' + col); if (!el) continue;
      const t = remaining(col); el.textContent = fmtClock(t); el.classList.toggle('low', t < 20000);
    }
    if (remaining(g.chess.turn) <= 0) flag(g.chess.turn);
  }
  function flag(col) {
    const other = col === 'w' ? 'b' : 'w';
    const onlyKing = !G.chess.board.some(p => p && p.toLowerCase() !== 'k' && (p < 'a') === (other === 'w'));
    G.time[col] = 0;
    if (onlyKing) finish('1/2-1/2', 'timeout vs insufficient material');
    else finish(col === 'w' ? '0-1' : '1-0', 'timeout');
  }
  function applyMove(m) {
    const g = G, mover = g.chess.turn;
    if (g.tc.base) {
      g.time[mover] -= Date.now() - g.turnStart;
      if (g.time[mover] <= 0) { flag(mover); return false; }
      g.time[mover] += g.tc.inc * 1000; g.turnStart = Date.now();
    }
    g.sans.push(g.chess.play(m)); g.moves.push({ from: m.from, to: m.to, promo: m.promo || null }); g.sel = null; g.anim = m;
    return true;
  }
  function userMove(m) {
    if (!applyMove(m)) return;
    renderGame();
    if (!checkEnd()) setTimeout(botMove, 250);
  }
  function botMove() {
    const g = G; if (!g || g.over) return;
    g.thinking = true; renderGame();
    setTimeout(() => {
      if (G !== g) return;
      const budget = g.tc.base ? Math.max(80, remaining(g.chess.turn) / 30) : undefined;
      const m = AI.chooseMove(g.chess, g.botElo, budget);
      if (G !== g || g.over) return;
      g.thinking = false; if (!applyMove(m)) return; renderGame(); checkEnd();
    }, 60);
  }
  function checkEnd() {
    const st = G.chess.status();
    if (st.over) { finish(st.result, st.reason); return true; }
    return false;
  }
  function offerDraw() {
    const g = G; if (g.thinking) return;
    const ev = AI.evaluate(g.chess) * (g.chess.turn === g.color ? -1 : 1); // from bot's view
    if (g.sans.length >= 20 && ev < 40) finish('1/2-1/2', 'draw agreed');
    else { g.msg = `${g.bot.name} declines the draw.`; renderGame(); }
  }
  function resign(silent) {
    const g = G; finish(g.color === 'w' ? '0-1' : '1-0', 'resignation', silent);
  }

  function finish(result, reason, silent) {
    const g = G; if (g.over) return; g.over = true; g.thinking = false; clearInterval(clockTimer);
    if (g.tc.base) g.time[g.chess.turn] = remaining(g.chess.turn);
    const score = result === '1/2-1/2' ? 0.5 : (result === '1-0') === (g.color === 'w') ? 1 : 0;
    let delta = null, summary = null;
    if (g.rated) { delta = League.ratePlayer(g.bot.id, score); }
    League.recordGame(score);
    if (g.mode === 'league') summary = League.completeRound(score);
    g.record = { id: Date.now(), opp: g.bot.name, oppRating: g.botElo, color: g.color, mode: g.mode, result, reason, score, delta, sans: g.sans, moves: g.moves, date: Date.now() };
    League.addHistory(g.record);
    S = League.state();
    if (silent) return;
    g.msg = `${result} · ${reason}`;
    renderGame();
    if (score === 1) confetti();
    const title = score === 1 ? 'You won! 🎉' : score === 0 ? `${g.bot.name} won` : 'Draw';
    let extra = '';
    if (summary) {
      const L = LEAGUES[summary.league], NL = LEAGUES[summary.newLeague];
      extra = `<div class="season"><h3>Season ${summary.season} complete</h3><p>${L.icon} ${L.name}: finished <b>#${summary.pos}</b> with ${summary.pts} pts</p>
        <p class="big">${summary.outcome === 'champion' ? '🏆 GRANDMASTER LEAGUE CHAMPION!' : summary.outcome === 'promoted' ? `⬆️ Promoted to ${NL.icon} ${NL.name}!` : summary.outcome === 'relegated' ? `⬇️ Relegated to ${NL.icon} ${NL.name}` : `Staying in ${NL.icon} ${NL.name}`}</p></div>`;
    }
    modal(`<h2>${title}</h2><p class="muted">${result} by ${reason}</p>
      ${delta != null ? `<p class="delta ${delta >= 0 ? 'pos' : 'neg'}">Rating ${S.player.rating} (${delta >= 0 ? '+' : ''}${delta})</p>` : '<p class="muted">Casual game — rating unchanged</p>'}
      ${extra}
      <div class="row"><button class="btn primary" data-a="rev">Game review</button>
      ${g.mode === 'league' ? '<button class="btn" data-a="league">League table</button>' : '<button class="btn" data-a="again">Rematch</button>'}
      <button class="btn" data-a="close">Close</button></div>`, a => {
      if (a === 'rev') review(g.record);
      else if (a === 'league') { G = null; nav('league'); }
      else if (a === 'again') startGame({ bot: g.bot, color: g.color === 'w' ? 'b' : 'w', mode: 'quick', rated: g.rated });
    });
  }

  function modal(html, onAction) {
    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = `<div class="card modal">${html}</div>`;
    document.body.appendChild(ov);
    ov.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { ov.remove(); onAction && onAction(b.dataset.a); });
  }

  // ---------- game review ----------
  const CLS = {
    book: { label: 'Book', color: '#a88865', icon: '📖' },
    best: { label: 'Best', color: '#81b64c', icon: '★' },
    excellent: { label: 'Excellent', color: '#96bc4b', icon: '👍' },
    good: { label: 'Good', color: '#77915f', icon: '✓' },
    inaccuracy: { label: 'Inaccuracy', color: '#f7c045', icon: '?!' },
    mistake: { label: 'Mistake', color: '#e58f2a', icon: '?' },
    blunder: { label: 'Blunder', color: '#ca3431', icon: '??' }
  };
  const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  const clampCp = s => AI.isMate(s) ? Math.sign(s) * 2000 : Math.max(-2000, Math.min(2000, s));

  function review(rec) {
    G = null;
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    R = { rec, ply: rec.sans.length, data: [], evals: [], done: false };
    // Rebuild positions
    const c = new Chess(); R.fens = [c.fen()];
    for (const m of rec.moves) { const lm = c.moves().find(x => x.from === m.from && x.to === m.to && (x.promo || null) === (m.promo || null)); c.make(lm); R.fens.push(c.fen()); }
    renderReview();
    analyzeStep(0);
  }

  function analyzeStep(i) {
    if (!R) return;
    const r = R, rec = r.rec;
    if (i >= rec.moves.length) {
      const c = new Chess(r.fens[i]), st = c.status();
      r.evals[i] = st.over ? (st.result === '1-0' ? AI.MATE - 1 : st.result === '0-1' ? -AI.MATE + 1 : 0) : (c.turn === 'w' ? 1 : -1) * AI.analyze(c, 2, 800).bestScore;
      r.done = true; renderReview(); return;
    }
    const c = new Chess(r.fens[i]), side = c.turn === 'w' ? 1 : -1;
    const a = AI.analyze(c, 2, 1200), m = rec.moves[i];
    const played = a.scores.find(x => x.move.from === m.from && x.move.to === m.to && (x.move.promo || null) === (m.promo || null));
    const ps = played ? played.score : a.bestScore;
    r.evals[i] = side * a.bestScore;
    const wpLoss = Math.max(0, winPct(clampCp(a.bestScore)) - winPct(clampCp(ps)));
    const cpLoss = Math.max(0, clampCp(a.bestScore) - clampCp(ps));
    const isBest = a.best.from === m.from && a.best.to === m.to;
    let cls = isBest || cpLoss <= 5 ? 'best' : cpLoss <= 30 ? 'excellent' : cpLoss <= 70 ? 'good' : cpLoss <= 140 ? 'inaccuracy' : cpLoss <= 280 ? 'mistake' : 'blunder';
    if (i < 6 && cpLoss <= 40) cls = 'book';
    // Missing a win you are already completely winning by is softened.
    if ((cls === 'mistake' || cls === 'blunder') && clampCp(ps) > 500) cls = 'inaccuracy';
    const bestSan = c.san(a.best);
    r.data[i] = { cls, cpLoss, wpLoss, acc: Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * wpLoss) - 3.1669)), bestSan, best: a.best, color: c.turn };
    if (i % 2 === 1 || i === rec.moves.length - 1) renderReview();
    else updateProgress();
    setTimeout(() => analyzeStep(i + 1), 0);
  }
  function updateProgress() { const p = $('#prog'); if (p && R) p.style.width = (100 * R.data.length / R.rec.moves.length) + '%'; }

  function renderReview() {
    const keepScroll = window.scrollY;
    const r = R, rec = r.rec, n = rec.sans.length, ply = r.ply;
    const c = new Chess(r.fens[ply]);
    const d = ply > 0 ? r.data[ply - 1] : null;
    const m = ply > 0 ? rec.moves[ply - 1] : null;
    const evNow = r.evals[ply] != null ? r.evals[ply] : (r.evals[ply - 1] ?? 0);
    const flip = rec.color === 'b';
    const barPct = winPct(clampCp(evNow));
    // summary per side
    const sides = { w: { acc: [], cnt: {} }, b: { acc: [], cnt: {} } };
    r.data.forEach(x => { if (!x) return; sides[x.color].acc.push(x.acc); sides[x.color].cnt[x.cls] = (sides[x.color].cnt[x.cls] || 0) + 1; });
    const avg = a => a.length ? (a.reduce((s, v) => s + v, 0) / a.length).toFixed(1) : '—';
    const you = rec.color, opp = you === 'w' ? 'b' : 'w';
    // graph
    const W = 600, H = 120, pts = [];
    for (let i = 0; i <= n; i++) if (r.evals[i] != null) pts.push(`${(i / Math.max(1, n)) * W},${H - (winPct(clampCp(r.evals[i])) / 100) * H}`);
    const graph = `<svg class="graph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <rect width="${W}" height="${H}" fill="#2b2a28"/>
      ${pts.length > 1 ? `<polygon points="0,${H} ${pts.join(' ')} ${pts[pts.length - 1].split(',')[0]},${H}" fill="#f0f0f0"/>` : ''}
      <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#888" stroke-dasharray="4"/>
      ${r.data.map((x, i) => x && ['mistake', 'blunder', 'inaccuracy'].includes(x.cls) ? `<circle cx="${((i + 1) / n) * W}" cy="${H - (winPct(clampCp(r.evals[i + 1] ?? 0)) / 100) * H}" r="4" fill="${CLS[x.cls].color}"/>` : '').join('')}
      <line x1="${(ply / Math.max(1, n)) * W}" y1="0" x2="${(ply / Math.max(1, n)) * W}" y2="${H}" stroke="#81b64c" stroke-width="2"/></svg>`;
    let list = '';
    for (let j = 0; j < n; j++) {
      if (j % 2 === 0) list += `<span class="n">${j / 2 + 1}.</span>`;
      list += `<span class="rv ${j + 1 === ply ? 'cur' : ''}" data-p="${j + 1}">${r.data[j] ? `<i style="color:${CLS[r.data[j].cls].color}">${CLS[r.data[j].cls].icon}</i>` : ''}${rec.sans[j]}</span>`;
    }
    const counts = ['best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'blunder'];
    let coach = '<p class="muted">Starting position. Use ← → to step through the game.</p>';
    if (d) {
      const who = d.color === you ? 'You' : rec.opp, k = CLS[d.cls];
      coach = `<p><b style="color:${k.color}">${k.icon} ${rec.sans[ply - 1]} is ${/^[aeiou]/i.test(k.label) ? 'an' : 'a'} ${k.label.toLowerCase()} move</b> <span class="muted">(${who})</span></p>
        ${d.cls !== 'best' && d.cls !== 'book' ? `<p>Best was <b>${d.bestSan}</b>${d.cpLoss ? ` — you lost about ${(Math.min(d.cpLoss, 2000) / 100).toFixed(1)} pawns of advantage` : ''}.</p>` : ''}`;
    } else if (!r.done && !r.data.length) coach = '<p class="muted">Analyzing…</p>';
    app.innerHTML = `<div class="play">
      <div class="boardwrap"><div class="evalwrap"><div class="evalbar ${flip ? 'flip' : ''}"><div style="height:${100 - barPct}%"></div><span>${fmtEval(evNow)}</span></div>
        <div class="boardcol"><div class="pbar sm"><b>${rec.color === 'w' ? esc(rec.opp) : 'You'}</b>${captured(c.board, flip ? 'w' : 'b')}</div>
        ${boardHTML(c, { flip, last: m, check: c.inCheck() ? c.kingSq(c.turn) : null, arrow: d && d.cls !== 'best' && d.cls !== 'book' ? d.best : null })}
        <div class="pbar sm"><b>${rec.color === 'w' ? 'You' : esc(rec.opp)}</b>${captured(c.board, flip ? 'b' : 'w')}</div></div></div>
        <div class="navbtns"><button class="btn" data-n="0">⏮</button><button class="btn" data-n="-1">◀</button><button class="btn" data-n="1">▶</button><button class="btn" data-n="9">⏭</button></div></div>
      <aside class="card side">
        <h3>Game review <small class="muted">vs ${esc(rec.opp)} · ${rec.result}</small></h3>
        ${!r.done ? `<div class="progress"><div id="prog" style="width:${100 * r.data.length / Math.max(1, n)}%"></div></div>` : ''}
        <div class="moves">${list}</div>
        <div class="coach">${coach}</div>
        ${graph}
        <table class="tbl sum"><thead><tr><th></th><th>You</th><th>${esc(rec.opp)}</th></tr></thead><tbody>
          <tr><td>Accuracy</td><td><b>${avg(sides[you].acc)}</b></td><td><b>${avg(sides[opp].acc)}</b></td></tr>
          ${counts.map(k => `<tr><td style="color:${CLS[k].color}">${CLS[k].icon} ${CLS[k].label}</td><td>${sides[you].cnt[k] || 0}</td><td>${sides[opp].cnt[k] || 0}</td></tr>`).join('')}
        </tbody></table>
      </aside></div>`;
    app.querySelectorAll('[data-n]').forEach(b => b.onclick = () => step(+b.dataset.n));
    app.querySelectorAll('.rv').forEach(b => b.onclick = () => { R.ply = +b.dataset.p; renderReview(); });
    const svg = app.querySelector('.graph');
    svg.onclick = e => { const rc = svg.getBoundingClientRect(); R.ply = Math.round(((e.clientX - rc.left) / rc.width) * n); renderReview(); };
    scrollMoves(app.querySelector('.side .moves'), app.querySelector('.rv.cur') || app.querySelector('.side .moves .n'));
    window.scrollTo(0, keepScroll);
    if (r.anim) { animateMove(r.anim, flip); r.anim = null; }
  }
  function step(k) {
    if (!R) return; const n = R.rec.sans.length;
    const prev = R.ply;
    R.ply = k === 0 ? 0 : k === 9 ? n : Math.max(0, Math.min(n, R.ply + k));
    if (R.ply === prev + 1) R.anim = R.rec.moves[prev];
    renderReview();
  }
  document.addEventListener('keydown', e => {
    if (!R || !document.querySelector('.navbtns')) return;
    if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1);
    if (e.key === 'Home') step(0); if (e.key === 'End') step(9);
  });

  nav('home');
})();
