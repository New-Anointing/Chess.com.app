// UI: home, play, league, quick match, leaderboard, game review.
(function () {
  const $ = s => document.querySelector(s);
  const app = $('#app');
  const GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  // Original flat vector piece set (fill/stroke come from CSS variables).
  const PIECE_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <g id="pc-base"><rect x="22" y="76" width="56" height="12" rx="6"/></g>
    <symbol id="pc-p" viewBox="0 0 100 100"><path d="M36 78 Q37 60 44 53 Q38 49 38 41 a12 12 0 1 1 24 0 Q62 49 56 53 Q63 60 64 78 Z"/><rect x="26" y="74" width="48" height="13" rx="6"/></symbol>
    <symbol id="pc-r" viewBox="0 0 100 100"><path d="M28 18 h11 v8 h6 v-8 h10 v8 h6 v-8 h11 v18 l-6 6 v28 l6 4 h-48 l6 -4 v-28 l-6 -6 Z"/><rect x="22" y="74" width="56" height="13" rx="6"/><path d="M34 42 h32" fill="none" stroke="currentColor"/></symbol>
    <symbol id="pc-n" viewBox="0 0 100 100"><path d="M30 76 Q30 62 44 52 Q46 46 42 46 L30 54 Q22 56 20 48 Q20 40 30 32 L40 20 L44 12 L50 22 Q72 24 76 50 Q79 64 74 76 Z"/><rect x="24" y="74" width="56" height="13" rx="6"/><circle cx="42" cy="32" r="4" fill="currentColor" stroke="none"/></symbol>
    <symbol id="pc-b" viewBox="0 0 100 100"><circle cx="50" cy="14" r="6"/><path d="M50 20 Q32 36 36 54 Q40 62 50 62 Q60 62 64 54 Q68 36 50 20 Z"/><path d="M38 76 Q38 66 44 62 h12 Q62 66 62 76 Z"/><rect x="24" y="74" width="52" height="13" rx="6"/><path d="M56 30 L45 46" fill="none" stroke-width="5"/></symbol>
    <symbol id="pc-q" viewBox="0 0 100 100"><path d="M28 74 L20 34 L36 50 L38 24 L50 46 L62 24 L64 50 L80 34 L72 74 Z"/><circle cx="20" cy="30" r="6"/><circle cx="38" cy="20" r="6"/><circle cx="62" cy="20" r="6"/><circle cx="80" cy="30" r="6"/><rect x="22" y="72" width="56" height="15" rx="7"/></symbol>
    <symbol id="pc-k" viewBox="0 0 100 100"><path d="M46 6 h8 v8 h8 v8 h-8 v12 h-8 v-12 h-8 v-8 h8 Z"/><path d="M28 74 Q16 50 34 42 Q46 38 50 50 Q54 38 66 42 Q84 50 72 74 Z"/><rect x="22" y="72" width="56" height="15" rx="7"/></symbol>
  </defs></svg>`;
  document.body.insertAdjacentHTML('afterbegin', PIECE_DEFS);
  const pieceSVG = p => `<svg class="pcs ${p < 'a' ? 'w' : 'b'}" viewBox="0 0 100 100"><use href="#pc-${p.toLowerCase()}"/></svg>`;
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
    return `<span class="caps" title="${pts} points captured">${list.map(t => `<i>${pieceSVG(color === 'w' ? t : t.toUpperCase())}</i>`).join('')}${pts ? `<em>${pts} pts</em>` : ''}${my > th ? `<b>+${my - th}</b>` : ''}</span>`;
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
    if (pc && /k/i.test(pc.dataset.p) && Math.abs((m.to & 7) - (m.from & 7)) === 2) {
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
  const sndBtn = $('#snd');
  const setSndIcon = () => { sndBtn.textContent = Sound.on ? '🔊' : '🔇'; sndBtn.classList.toggle('off', !Sound.on); };
  sndBtn.onclick = () => { Sound.toggle(); setSndIcon(); }; setSndIcon();

  // ---------- navigation ----------
  function nav(view) {
    R = null;
    document.body.classList.remove('rv-mode');
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
  const ARROW = { best: '#81b64c', alt: '#f0a92b', next: '#4fa8e0', threat: '#e0503c', user: '#f5a623' };
  let marks = { arrows: [], hl: [] }, drawMode = false, drawFrom = null;
  const clearMarks = () => { marks = { arrows: [], hl: [] }; drawFrom = null; };
  function toggleMark(a, b) {
    if (a === b) { const i = marks.hl.indexOf(a); i >= 0 ? marks.hl.splice(i, 1) : marks.hl.push(a); return; }
    const i = marks.arrows.findIndex(x => x.from === a && x.to === b);
    i >= 0 ? marks.arrows.splice(i, 1) : marks.arrows.push({ from: a, to: b, color: ARROW.user });
  }
  // Board input: left click/tap = normal action; right-drag (desktop) or Draw mode (phone) = arrows and highlights.
  function bindBoard(onSquare, rerender) {
    const board = app.querySelector('.board'); if (!board) return;
    const sqAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); const q = el && el.closest('.sq'); return q ? +q.dataset.sq : null; };
    let rs = null;
    board.oncontextmenu = e => e.preventDefault();
    board.onpointerdown = e => { if (e.button === 2) { rs = sqAt(e); e.preventDefault(); } };
    board.onpointerup = e => { if (e.button === 2 && rs != null) { const t = sqAt(e); if (t != null) toggleMark(rs, t); rs = null; rerender(); } };
    app.querySelectorAll('.sq').forEach(el => el.onclick = () => {
      const sq = +el.dataset.sq;
      if (drawMode) { if (drawFrom == null) drawFrom = sq; else { toggleMark(drawFrom, sq); drawFrom = null; } return rerender(); }
      const had = marks.arrows.length || marks.hl.length;
      clearMarks();
      if (onSquare) onSquare(sq); else if (had) rerender();
    });
  }
  function arrowSVG(from, to, color, flip) {
    const c = q => { const v = flip ? 63 - q : q; return [(v & 7) + .5, (v >> 3) + .5]; };
    const A = c(from), B = c(to), dx = B[0] - A[0], dy = B[1] - A[1];
    const pts = [A];
    if (Math.abs(dx) + Math.abs(dy) === 3 && Math.abs(dx) && Math.abs(dy)) pts.push(Math.abs(dy) > Math.abs(dx) ? [A[0], B[1]] : [B[0], A[1]]); // knight: L-shape
    const P = pts[pts.length - 1], L = Math.hypot(B[0] - P[0], B[1] - P[1]), ux = (B[0] - P[0]) / L, uy = (B[1] - P[1]) / L;
    const tip = [B[0] - ux * .1, B[1] - uy * .1], hl = .5, hw = .37, base = [tip[0] - ux * hl, tip[1] - uy * hl];
    const shaft = pts.concat([base]).map(q => q.join(',')).join(' ');
    return `<g opacity=".8"><polyline points="${shaft}" fill="none" stroke="${color}" stroke-width=".27" stroke-linejoin="miter"/>
      <polygon points="${tip.join(',')} ${base[0] - uy * hw},${base[1] + ux * hw} ${base[0] + uy * hw},${base[1] - ux * hw}" fill="${color}"/></g>`;
  }
  function boardHTML(chess, opts) {
    let { flip, sel, targets = [], last, check, arrow, arrows = [], tints = {}, badge } = opts;
    tints = { ...tints }; marks.hl.forEach(q => tints[q] = 'rgba(235,97,80,.8)');
    arrows = arrows.concat(marks.arrows);
    if (drawMode && drawFrom != null) sel = drawFrom;
    let h = '';
    for (let i = 0; i < 64; i++) {
      const sq = flip ? 63 - i : i, r = sq >> 3, f = sq & 7, p = chess.board[sq];
      const cls = ['sq', (r + f) % 2 ? 'dk' : 'lt'];
      if (sel === sq) cls.push('sel');
      if (last && (last.from === sq || last.to === sq) && !tints[sq]) cls.push('last');
      if (check === sq) cls.push('check');
      const t = targets.includes(sq);
      if (t) cls.push(p ? 'cap' : 'dot');
      const coordF = (flip ? r === 0 : r === 7) ? `<i class="cf">${'abcdefgh'[f]}</i>` : '';
      const coordR = (flip ? f === 7 : f === 0) ? `<i class="cr">${8 - r}</i>` : '';
      const tint = tints[sq] ? `<div class="tint" style="background:${tints[sq]}"></div>` : '';
      h += `<div class="${cls.join(' ')}" data-sq="${sq}">${tint}${coordR}${coordF}${p ? `<span class="pc" data-p="${p}">${pieceSVG(p)}</span>` : ''}</div>`;
    }
    const all = arrows.concat(arrow ? [{ ...arrow, color: '#81b64c' }] : []);
    const svg = all.length ? `<svg class="arrows" viewBox="0 0 8 8">${all.map(x => arrowSVG(x.from, x.to, x.color, flip)).join('')}</svg>` : '';
    let bdg = '';
    if (badge) {
      const v = flip ? 63 - badge.sq : badge.sq;
      bdg = `<div class="sqbadge" style="left:${((v & 7) + 1) * 12.5}%;top:${(v >> 3) * 12.5}%;background:${badge.color}">${badge.icon}</div>`;
    }
    return `<div class="board">${h}${svg}${bdg}</div>`;
  }

  // ---------- live game ----------
  function startGame({ bot, color, mode, rated, tc }) {
    R = null;
    document.body.classList.remove('rv-mode');
    window.scrollTo(0, 0);
    const T = TCS.find(t => t.id === tc) || TCS[0];
    clearMarks();
    G = { chess: new Chess(), bot, color, mode, rated, sans: [], moves: [], sel: null, over: false, thinking: false, botElo: League.rating(bot.id),
      tc: T, time: { w: T.base * 1000, b: T.base * 1000 }, turnStart: Date.now() };
    clearInterval(clockTimer);
    if (T.base) clockTimer = setInterval(tick, 100);
    app.classList.add('enter'); setTimeout(() => app.classList.remove('enter'), 700);
    renderGame();
    Sound.play('start');
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
      <div class="boardwrap">${top}${boardHTML(c, { flip: g.color === 'b', sel: g.sel, targets, last, check, arrows: g.assist ? g.assist.arrows : [], tints: g.assist ? g.assist.tints : {} })}${bottom}</div>
      <aside class="card side">
        <h3>${g.mode === 'league' ? `${leagueBadge(S.season.league)} Round ${S.season.round + 1}` : 'Quick match'} <small class="muted">${g.rated ? 'rated' : 'casual'} · ${g.tc.label}</small></h3>
        <div class="moves" id="mvs">${moveList || '<p class="muted">Make your move.</p>'}</div>
        <div class="row">${g.over ? `<button class="btn primary" id="rev">Game review</button><button class="btn" id="back">Continue</button>`
          : `<button class="btn" id="draw">½ Offer draw</button><button class="btn danger" id="resign">Resign</button>`}</div>
        ${g.over ? '' : `<div class="assist">
          <button class="tool" id="aHint" ${g.rated ? 'disabled title="Hints are only available in casual games"' : ''}><span>💡</span>Hint</button>
          <button class="tool" id="aThreat" ${g.rated ? 'disabled title="Only available in casual games"' : ''}><span>⚠️</span>Threat</button>
          <button class="tool ${drawMode ? 'on' : ''}" id="aPen"><span>✏️</span>Draw</button></div>
          ${g.rated ? '<p class="muted small">Hints and threats are off in rated games. Untick “Rated” in Quick match to use them.</p>' : ''}`}
        <p id="msg" class="muted">${g.msg || ''}</p>
      </aside></div>`;
    scrollMoves($('#mvs'), $('#mvs .cur'));
    window.scrollTo(0, keepScroll);
    if (g.anim) { animateMove(g.anim, g.color === 'b'); g.anim = null; }
    bindBoard(clickSq, renderGame);
    const pen = $('#aPen'); if (pen) pen.onclick = () => { drawMode = !drawMode; drawFrom = null; renderGame(); };
    const hint = $('#aHint'); if (hint) hint.onclick = () => showAssist('hint');
    const thr = $('#aThreat'); if (thr) thr.onclick = () => showAssist('threat');
    if (g.over) { $('#rev').onclick = () => review(g.record); $('#back').onclick = () => { G = null; nav(g.mode === 'league' ? 'league' : 'quick'); }; }
    else { $('#resign').onclick = () => confirm('Resign this game?') && resign(); $('#draw').onclick = offerDraw; }
  }

  function showAssist(kind) {
    const g = G; if (!g || g.over || g.rated || g.thinking || g.chess.turn !== g.color) return;
    let c = g.chess, color = ARROW.best;
    if (kind === 'threat') {
      const f = c.fen().split(' '); f[1] = f[1] === 'w' ? 'b' : 'w'; f[3] = '-';
      c = new Chess(f.join(' ')); color = ARROW.threat;
      if (!c.moves().length) { g.msg = 'No threats right now.'; return renderGame(); }
    }
    const a = AI.analyze(c, 2, 800), m = a.best, san = c.san(m);
    g.assist = { arrows: [{ from: m.from, to: m.to, color }], tints: { [m.to]: color + (kind === 'threat' ? 'aa' : '88') } };
    g.msg = kind === 'hint' ? `💡 Try ${san}.` : `⚠️ ${g.bot.name} is threatening ${san}${m.captured ? `, taking your ${({ p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' })[m.captured.toLowerCase()]}` : ''}.`;
    renderGame();
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
    ov.innerHTML = `<div class="card promo">${ms.map((m, i) => `<button data-i="${i}">${pieceSVG(m.promo)}</button>`).join('')}</div>`;
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
      if (col === g.color && col === g.chess.turn && t < 10000 && !g.warned) { g.warned = true; Sound.play('low'); }
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
    g.sans.push(g.chess.play(m)); Sound.forSan(g.sans[g.sans.length - 1]); g.moves.push({ from: m.from, to: m.to, promo: m.promo || null }); g.sel = null; g.anim = m; g.assist = null; clearMarks();
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
    Sound.play(score === 1 ? 'win' : score === 0 ? 'lose' : 'draw');
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
    great: { label: 'Great', color: '#5c8bb0', icon: '!' },
    best: { label: 'Best', color: '#81b64c', icon: '★' },
    excellent: { label: 'Excellent', color: '#96bc4b', icon: '👍' },
    good: { label: 'Good', color: '#77915f', icon: '✓' },
    book: { label: 'Book', color: '#a88865', icon: '📖' },
    inaccuracy: { label: 'Inaccuracy', color: '#f7c045', icon: '?!' },
    mistake: { label: 'Mistake', color: '#e58f2a', icon: '?' },
    blunder: { label: 'Blunder', color: '#ca3431', icon: '??' }
  };
  const BAD = ['inaccuracy', 'mistake', 'blunder'];
  const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  const clampCp = s => AI.isMate(s) ? Math.sign(s) * 2000 : Math.max(-2000, Math.min(2000, s));
  const clsIcon = (k, extra = '') => `<span class="cicon ${extra}" style="background:${CLS[k].color}">${CLS[k].icon}</span>`;
  // SAN with a small piece icon instead of the letter (figurine notation).
  const figSan = (san, color) => /^[KQRBN]/.test(san) ? `<span class="fig">${pieceSVG(color === 'w' ? san[0] : san[0].toLowerCase())}</span>${san.slice(1)}` : san;
  const sameMove = (a, b) => a && b && a.from === b.from && a.to === b.to && (a.promo || null) === (b.promo || null);

  function review(rec) {
    G = null;
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    clearMarks();
    R = { rec, ply: 0, data: [], evals: [], done: false, coach: {}, pending: {}, showArrows: true, bestView: false, retry: null };
    const c = new Chess(); R.fens = [c.fen()];
    for (const m of rec.moves) { const lm = c.moves().find(x => sameMove(x, m)); c.make(lm); R.fens.push(c.fen()); }
    window.scrollTo(0, 0);
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
    const played = a.scores.find(x => sameMove(x.move, m));
    const ps = played ? played.score : a.bestScore;
    r.evals[i] = side * a.bestScore;
    const wpLoss = Math.max(0, winPct(clampCp(a.bestScore)) - winPct(clampCp(ps)));
    const cpLoss = Math.max(0, clampCp(a.bestScore) - clampCp(ps));
    const isBest = sameMove(a.best, m);
    let cls = isBest || cpLoss <= 5 ? 'best' : cpLoss <= 30 ? 'excellent' : cpLoss <= 70 ? 'good' : cpLoss <= 140 ? 'inaccuracy' : cpLoss <= 280 ? 'mistake' : 'blunder';
    if (i < 6 && cpLoss <= 40) cls = 'book';
    // "Great": the only good move in the position.
    if (cls === 'best' && i >= 6 && a.scores.length > 1 && a.scores[1].score < a.bestScore - 150 && clampCp(a.bestScore) < 800 && !m.promo) cls = 'great';
    if ((cls === 'mistake' || cls === 'blunder') && clampCp(ps) > 500) cls = 'inaccuracy';
    r.data[i] = { bestScore: a.bestScore, playedScore: ps, cls, cpLoss, wpLoss, acc: Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * wpLoss) - 3.1669)),
      bestSan: c.san(a.best), best: a.best, color: c.turn,
      scores: a.scores.map(x => ({ from: x.move.from, to: x.move.to, promo: x.move.promo || null, s: x.score })) };
    if (i % 2 === 1 || i === rec.moves.length - 1 || i + 1 === r.ply) renderReview();
    else updateProgress();
    setTimeout(() => analyzeStep(i + 1), 0);
  }
  function updateProgress() { const p = $('#prog'); if (p && R) p.style.width = (100 * R.data.length / R.rec.moves.length) + '%'; }

  function ensureCoach(r, ply) {
    const d = r.data[ply - 1];
    if (!d || r.coach[ply] || r.pending[ply]) return;
    r.pending[ply] = true;
    setTimeout(() => {
      if (R !== r) return;
      try {
        r.coach[ply] = Coach.explain(r.fens[ply - 1], r.rec.moves[ply - 1], { cls: d.cls === 'great' ? 'best' : d.cls, best: d.best, bestScore: d.bestScore, playedScore: d.playedScore, ply: ply - 1, you: d.color === r.rec.color, name: r.rec.opp });
      } catch (e) { r.coach[ply] = { text: [d.cls === 'best' ? 'This is the best move.' : `Best was ${d.bestSan}.`], line: null }; }
      if (R === r && R.ply === ply) renderReview();
    }, 30);
  }

  function renderReview() {
    const r = R, rec = r.rec, n = rec.sans.length, ply = r.ply;
    document.body.classList.add('rv-mode');
    const d = ply > 0 ? r.data[ply - 1] : null;
    const m = ply > 0 ? rec.moves[ply - 1] : null;
    const flip = rec.color === 'b', you = rec.color, opp = you === 'w' ? 'b' : 'w';
    const evNow = r.evals[ply] != null ? r.evals[ply] : (r.evals[ply - 1] ?? 0);
    const sides = { w: { acc: [], cnt: {} }, b: { acc: [], cnt: {} } };
    r.data.forEach(x => { if (!x) return; sides[x.color].acc.push(x.acc); sides[x.color].cnt[x.cls] = (sides[x.color].cnt[x.cls] || 0) + 1; });
    const avg = a => a.length ? (a.reduce((t, v) => t + v, 0) / a.length).toFixed(1) : '—';
    const ex = r.coach[ply];
    if (d) ensureCoach(r, ply);

    // ---- board state ----
    let fen = r.fens[ply], boardOpts = { flip, last: m }, title = '', body = '', icon = '', chip = fmtEval(evNow), chipDark = evNow < 0;
    if (r.retry) {
      const rt = r.retry, cb = new Chess(rt.fen), legal = cb.moves();
      fen = rt.fen;
      boardOpts = { flip, sel: rt.sel, targets: rt.sel != null ? legal.filter(x => x.from === rt.sel).map(x => x.to) : [], last: rt.last };
      title = rt.ok ? 'Correct!' : 'Find a better move';
      icon = rt.ok ? clsIcon('best') : '<span class="cicon" style="background:#5c8bb0">?</span>';
      body = rt.msg || `${d.color === you ? 'You' : esc(rec.opp)} played ${figSan(rec.sans[ply - 1], d.color)}. Can you find something stronger?`;
    } else if (r.bestView && d) {
      const c0 = new Chess(r.fens[ply - 1]), bm = c0.moves().find(x => sameMove(x, d.best));
      c0.make(bm); fen = c0.fen();
      const k = CLS.best;
      boardOpts = { flip, last: d.best, tints: { [d.best.from]: k.color + '99', [d.best.to]: k.color + 'cc' }, badge: { sq: d.best.to, color: k.color, icon: k.icon } };
      title = `${figSan(d.bestSan, d.color)} is best`; icon = clsIcon('best');
      body = ex && ex.line ? `Best line: ${ex.line.map((x, i) => `<b>${figSan(x, i % 2 ? (d.color === 'w' ? 'b' : 'w') : d.color)}</b>`).join(' ')}` : 'This was the strongest move in the position.';
      chip = fmtEval((d.color === 'w' ? 1 : -1) * d.bestScore); chipDark = (d.color === 'w' ? 1 : -1) * d.bestScore < 0;
    } else if (d) {
      const k = CLS[d.cls];
      const arrows = [];
      const tints = { [m.from]: k.color + '66', [m.to]: k.color + 'b3' };
      const mine = d.color === you;
      if (r.showArrows && !['best', 'great', 'book'].includes(d.cls) && !sameMove(d.best, m)) {
        const col = BAD.includes(d.cls) ? ARROW.best : ARROW.alt; // green = what you should have played, orange = slightly better
        arrows.push({ from: d.best.from, to: d.best.to, color: col });
        if (tints[d.best.to] == null) tints[d.best.to] = col + '73';
      }
      if (r.showArrows && BAD.includes(d.cls) && ex && ex.reply) {
        // Red when it punishes you, blue when it's your chance to punish the opponent.
        const col = mine ? ARROW.threat : ARROW.next;
        arrows.push({ from: ex.reply.from, to: ex.reply.to, color: col });
        if (tints[ex.reply.to] == null) tints[ex.reply.to] = col + '80';
      }
      boardOpts = { flip, last: m, arrows, tints, badge: { sq: m.to, color: k.color, icon: k.icon } };
      const lab = d.cls === 'best' ? 'is the best move' : d.cls === 'great' ? 'is a great move' : d.cls === 'book' ? 'is a book move' : `is ${/^[aeiou]/i.test(k.label) ? 'an' : 'a'} ${k.label.toLowerCase()}`;
      title = `${figSan(rec.sans[ply - 1], d.color)} ${lab}`; icon = clsIcon(d.cls);
      const lead = /^\S+ is (the best move here|an? (inaccuracy|mistake|blunder))\.$/;
      body = ex ? ex.text.filter(t => !lead.test(t)).join(' ') : '<span class="muted">Coach is thinking…</span>';
      if (d.cls === 'great') body = (ex ? ex.text.filter(t => !lead.test(t)).join(' ') : '') + ' It was the only move that kept the advantage.';
    } else {
      title = 'Game Review'; icon = '<span class="cicon" style="background:#81b64c">♞</span>';
      body = !r.done && !r.data.length ? 'Analyzing your game…'
        : `${rec.result} · ${esc(rec.reason)}. Your accuracy: <b>${avg(sides[you].acc)}</b>, ${esc(rec.opp)}: <b>${avg(sides[opp].acc)}</b>. Tap <b>Next</b> to walk through the game.`;
    }
    const c = new Chess(fen);
    boardOpts.check = c.inCheck() ? c.kingSq(c.turn) : null;
    const barPct = winPct(clampCp(evNow));

    // ---- move strip ----
    let list = '';
    for (let j = 0; j < n; j++) {
      const col = j % 2 ? 'b' : 'w', dj = r.data[j];
      if (j % 2 === 0) list += `<span class="n">${j / 2 + 1}.</span>`;
      const showIc = dj && (BAD.includes(dj.cls) || dj.cls === 'great' || dj.cls === 'book' && j === ply - 1);
      list += `<span class="rv ${j + 1 === ply ? 'cur' : ''} ${dj ? 'c-' + dj.cls : ''}" data-p="${j + 1}">${showIc ? clsIcon(dj.cls, 'sm') : ''}${figSan(rec.sans[j], col)}</span>`;
    }
    // ---- summary graph ----
    const W = 600, H = 110, pts = [];
    for (let i = 0; i <= n; i++) if (r.evals[i] != null) pts.push(`${(i / Math.max(1, n)) * W},${H - (winPct(clampCp(r.evals[i])) / 100) * H}`);
    const graph = `<svg class="graph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><rect width="${W}" height="${H}" fill="#2b2a28"/>
      ${pts.length > 1 ? `<polygon points="0,${H} ${pts.join(' ')} ${pts[pts.length - 1].split(',')[0]},${H}" fill="#f0f0f0"/>` : ''}
      <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#888" stroke-dasharray="4"/>
      ${r.data.map((x, i) => x && (BAD.includes(x.cls) || x.cls === 'great') ? `<circle cx="${((i + 1) / n) * W}" cy="${H - (winPct(clampCp(r.evals[i + 1] ?? 0)) / 100) * H}" r="5" fill="${CLS[x.cls].color}"/>` : '').join('')}
      <line x1="${(ply / Math.max(1, n)) * W}" y1="0" x2="${(ply / Math.max(1, n)) * W}" y2="${H}" stroke="#81b64c" stroke-width="2"/></svg>`;
    const counts = ['great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'blunder'];
    const canRetry = d && !['best', 'great', 'book'].includes(d.cls);

    app.innerHTML = `<div class="rv-wrap">
      <div class="rv-top"><button class="icbtn" id="rvBack" aria-label="Back">←</button><h2>Game Review</h2><button class="icbtn" id="rvSnd" aria-label="Sound">${Sound.on ? '🔊' : '🔇'}</button></div>
      ${!r.done ? `<div class="progress"><div id="prog" style="width:${100 * r.data.length / Math.max(1, n)}%"></div></div>` : ''}
      <div class="coachrow">
        <div class="coachav">${pieceSVG('N')}</div>
        <div class="bubble" key="${ply}">
          <div class="bh">${icon}<b>${title}</b><span class="evchip ${chipDark ? 'dark' : ''}">${chip}</span></div>
          <p>${body}</p>
          ${!r.retry && !r.bestView && ex && ex.line && d && BAD.includes(d.cls) ? `<p class="line">Best line: ${ex.line.map((x, i) => `<b>${figSan(x, i % 2 ? (d.color === 'w' ? 'b' : 'w') : d.color)}</b>`).join(' ')}</p>` : ''}
        </div>
      </div>
      <div class="evalwrap"><div class="evalbar ${flip ? 'flip' : ''}"><div style="height:${100 - barPct}%"></div><span>${fmtEval(evNow)}</span></div>
        ${boardHTML(c, boardOpts)}</div>
      <div class="strip"><button class="icbtn" data-n="-1" aria-label="Previous">‹</button><div class="moves">${list}</div><button class="icbtn" data-n="1" aria-label="Next move">›</button></div>
      <div class="rv-bottom">
        <button class="tool ${r.showArrows ? 'on' : ''}" id="tShow" ${d ? '' : 'disabled'}><span>👁</span>Show</button>
        <button class="tool ${r.bestView ? 'on' : ''}" id="tBest" ${d && !['best', 'great', 'book'].includes(d.cls) ? '' : 'disabled'}><span>★</span>Best</button>
        <button class="tool ${r.retry ? 'on' : ''}" id="tRetry" ${canRetry || r.retry ? '' : 'disabled'}><span>↻</span>Retry</button>
        <button class="tool ${drawMode ? 'on' : ''}" id="tPen"><span>✏️</span>Draw</button>
        <button class="btn primary nextbtn" data-n="1" ${ply >= n && !r.retry && !r.bestView ? 'disabled' : ''}>${ply === 0 ? 'Start Review' : r.retry || r.bestView ? 'Continue' : 'Next'}</button>
      </div>
      <section class="card rv-sum">
        <h3>Summary <small class="muted">vs ${esc(rec.opp)} · ${rec.result}</small></h3>
        <div class="accrow"><div><b>${avg(sides[you].acc)}</b><span>You</span></div><div><b>${avg(sides[opp].acc)}</b><span>${esc(rec.opp)}</span></div></div>
        ${graph}
        <table class="tbl sum"><thead><tr><th></th><th>You</th><th>${esc(rec.opp)}</th></tr></thead><tbody>
          ${counts.map(k => `<tr><td>${clsIcon(k, 'sm')} ${CLS[k].label}</td><td>${sides[you].cnt[k] || 0}</td><td>${sides[opp].cnt[k] || 0}</td></tr>`).join('')}
        </tbody></table>
      </section></div>`;

    app.querySelectorAll('[data-n]').forEach(b => b.onclick = () => step(+b.dataset.n));
    app.querySelectorAll('.rv').forEach(b => b.onclick = () => { exitModes(); R.ply = +b.dataset.p; renderReview(); });
    $('#rvBack').onclick = () => { document.body.classList.remove('rv-mode'); nav('history'); };
    $('#rvSnd').onclick = () => { Sound.toggle(); setSndIcon(); renderReview(); };
    $('#tShow').onclick = () => { r.showArrows = !r.showArrows; renderReview(); };
    $('#tBest').onclick = () => { r.retry = null; r.bestView = !r.bestView; if (r.bestView) { Sound.forSan(d.bestSan); r.anim = d.best; } renderReview(); };
    $('#tRetry').onclick = () => {
      r.bestView = false;
      r.retry = r.retry ? null : { fen: r.fens[ply - 1], sel: null, msg: '', ok: false, last: ply > 1 ? rec.moves[ply - 2] : null };
      renderReview();
    };
    bindBoard(r.retry ? retryClick : null, renderReview);
    $('#tPen').onclick = () => { drawMode = !drawMode; drawFrom = null; renderReview(); };
    const svg = app.querySelector('.graph');
    svg.onclick = e => { const rc = svg.getBoundingClientRect(); exitModes(); R.ply = Math.round(((e.clientX - rc.left) / rc.width) * n); renderReview(); };
    scrollMoves(app.querySelector('.strip .moves'), app.querySelector('.rv.cur') || app.querySelector('.strip .moves .n'));
    if (r.anim) { animateMove(r.anim, flip); r.anim = null; }
  }

  function retryClick(sq) {
    const r = R, rt = r.retry, d = r.data[r.ply - 1]; if (!rt || rt.ok) return;
    const c = new Chess(rt.fen), p = c.board[sq];
    if (rt.sel != null) {
      const ms = c.moves().filter(x => x.from === rt.sel && x.to === sq);
      if (ms.length) {
        const mv = ms.find(x => !x.promo || x.promo.toLowerCase() === 'q') || ms[0];
        const san = c.san(mv), sc = (d.scores.find(x => sameMove(x, mv)) || {}).s;
        const loss = sc == null ? 999 : clampCp(d.bestScore) - clampCp(sc);
        Sound.forSan(san);
        if (sameMove(mv, d.best) || loss <= 30) {
          c.make(mv);
          r.retry = { fen: c.fen(), sel: null, ok: true, last: mv, msg: `${figSan(san, d.color)} ${sameMove(mv, d.best) ? 'is the best move' : 'is an excellent move'}. Well done!` };
          r.anim = mv;
        } else {
          rt.sel = null;
          rt.msg = `${figSan(san, d.color)} isn't better. ${loss > 140 ? 'That loses material or position.' : 'Close, but there is something stronger.'} Try again, or tap <b>Best</b> to see the answer.`;
        }
        return renderReview();
      }
    }
    rt.sel = p && (p < 'a') === (d.color === 'w') ? sq : null;
    renderReview();
  }
  function exitModes() { if (R) { R.retry = null; R.bestView = false; } }
  function step(k) {
    clearMarks();
    if (!R) return; const n = R.rec.sans.length;
    if (R.retry || R.bestView) { exitModes(); if (k === 1) { renderReview(); return; } }
    const prev = R.ply;
    R.ply = k === 0 ? 0 : k === 9 ? n : Math.max(0, Math.min(n, R.ply + k));
    if (R.ply === prev + 1) { R.anim = R.rec.moves[prev]; Sound.forSan(R.rec.sans[prev]); }
    renderReview();
  }
  document.addEventListener('keydown', e => {
    if (!R || !document.querySelector('.rv-wrap')) return;
    if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1);
    if (e.key === 'Home') step(0); if (e.key === 'End') step(9);
  });

  nav('home');
})();
