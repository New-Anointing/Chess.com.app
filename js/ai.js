// Alpha-beta engine with quiescence search, plus skill-limited bot play and analysis for reviews.
(function (root) {
  const Chess = root.Chess || (typeof require !== 'undefined' && require('./chess.js'));
  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const MATE = 100000, INF = 1e9;
  const PST = {
    p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
    ke: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50]
  };

  // Static evaluation from the side to move's perspective.
  function evaluate(g) {
    const b = g.board;
    let s = 0, nonPawn = 0;
    for (let i = 0; i < 64; i++) { const p = b[i]; if (p && 'nbrqNBRQ'.includes(p)) nonPawn += VAL[p.toLowerCase()]; }
    const endgame = nonPawn <= 1300;
    for (let i = 0; i < 64; i++) {
      const p = b[i]; if (!p) continue;
      const t = p.toLowerCase(), w = p < 'a';
      const idx = w ? i : ((7 - (i >> 3)) * 8 + (i & 7));
      const v = VAL[t] + (t === 'k' ? (endgame ? PST.ke : PST.k)[idx] : PST[t][idx]);
      s += w ? v : -v;
    }
    return g.turn === 'w' ? s : -s;
  }

  const mvv = m => (m.captured ? VAL[m.captured.toLowerCase()] * 10 - VAL[m.piece.toLowerCase()] / 10 : 0) + (m.promo ? 800 : 0);
  function order(moves, first) {
    for (const m of moves) m._o = mvv(m) + (first && m.from === first.from && m.to === first.to && m.promo === first.promo ? 1e6 : 0);
    return moves.sort((a, b) => b._o - a._o);
  }

  function quiesce(g, alpha, beta, ctx, qd) {
    ctx.nodes++;
    const stand = evaluate(g);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (qd > 6) return stand;
    for (const m of order(g.moves(true))) {
      g.make(m); const sc = -quiesce(g, -beta, -alpha, ctx, qd + 1); g.undo(m);
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  function search(g, depth, alpha, beta, ply, ctx) {
    if ((++ctx.nodes & 2047) === 0 && Date.now() > ctx.deadline) ctx.stop = true;
    if (ctx.stop) return 0;
    if (g.half >= 100) return 0;
    const moves = g.moves();
    if (!moves.length) return g.inCheck() ? -MATE + ply : 0;
    if (depth <= 0) return quiesce(g, alpha, beta, ctx, 0);
    let best = -INF;
    for (const m of order(moves)) {
      g.make(m); const sc = -search(g, depth - 1, -beta, -alpha, ply + 1, ctx); g.undo(m);
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }

  // Score every root move. window>0 => moves worse than (best-window) only get an upper bound.
  function rootScores(g, maxDepth, timeMs, window) {
    const ctx = { nodes: 0, deadline: Date.now() + timeMs, stop: false };
    let moves = g.moves(), results = null, bestMove = null;
    for (let d = 1; d <= maxDepth; d++) {
      const cur = [];
      let best = -INF;
      for (const m of order(moves.slice(), bestMove)) {
        const alpha = window != null && best > -INF ? best - window : -INF;
        g.make(m); const sc = -search(g, d - 1, -INF, -alpha, 1, ctx); g.undo(m);
        if (ctx.stop) break;
        cur.push({ move: m, score: sc });
        if (sc > best) { best = sc; bestMove = m; }
      }
      if (ctx.stop && results) break;
      if (cur.length === moves.length || !results) results = cur;
      if (ctx.stop) break;
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  // Skill model derived from a bot's Elo.
  function skill(elo) {
    return {
      depth: elo < 700 ? 1 : elo < 1100 ? 2 : elo < 1700 ? 3 : 4,
      noise: Math.max(0, Math.round((2500 - elo) / 7)),
      blunder: Math.max(0, (1400 - elo) / 2600),
      time: elo < 1100 ? 400 : elo < 1700 ? 900 : 1800
    };
  }

  function chooseMove(g, elo) {
    const sk = skill(elo);
    const legal = g.moves();
    if (legal.length === 1) return legal[0];
    if (Math.random() < sk.blunder) return legal[Math.floor(Math.random() * legal.length)];
    const scored = rootScores(g, sk.depth, sk.time, sk.noise ? sk.noise * 2 + 50 : 30);
    let best = null, bestV = -INF;
    for (const { move, score } of scored) {
      // Bots never miss forced mates they've seen.
      const v = score > MATE - 1000 ? score : score + (Math.random() * 2 - 1) * sk.noise;
      if (v > bestV) { bestV = v; best = move; }
    }
    return best;
  }

  // Full-width analysis for reviews: exact score of every move.
  function analyze(g, depth = 2, timeMs = 1500) {
    const r = rootScores(g, depth, timeMs, null);
    return { best: r[0].move, bestScore: r[0].score, scores: r };
  }

  const isMate = s => Math.abs(s) > MATE - 1000;
  const mateIn = s => Math.ceil((MATE - Math.abs(s)) / 2) * Math.sign(s);

  const AI = { evaluate, chooseMove, analyze, skill, MATE, isMate, mateIn };
  root.AI = AI;
  if (typeof module !== 'undefined') module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
