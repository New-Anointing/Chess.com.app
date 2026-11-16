// Turns engine output into plain-language explanations for the game review.
(function (root) {
  const Chess = root.Chess, AI = root.AI;
  const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const sq = Chess.sqName, lc = p => p.toLowerCase();
  const join = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || '');
  const same = (a, b) => a && b && a.from === b.from && a.to === b.to && (a.promo || null) === (b.promo || null);
  const find = (g, m) => g.moves().find(x => same(x, m));

  // Tactical and positional facts about move m (g is left unchanged).
  function facts(g, m, ply) {
    const mover = g.turn, opp = mover === 'w' ? 'b' : 'w', t = lc(m.piece);
    const F = { piece: t, to: sq(m.to), threats: [] };
    if (m.captured) F.captures = lc(m.captured);
    if (m.flag === 'k' || m.flag === 'q') F.castle = m.flag === 'k' ? 'kingside' : 'queenside';
    if (m.promo) F.promo = lc(m.promo);
    g.make(m);
    F.check = g.inCheck();
    F.mate = F.check && g.moves().length === 0;
    if (t !== 'k' && !F.mate) {
      const attackers = g.moves(true).filter(x => x.to === m.to);
      if (attackers.length) {
        const minA = Math.min(...attackers.map(x => V[lc(x.piece)]));
        if (!g.attacked(m.to, mover) || minA < V[t]) F.hangs = true;
      }
    }
    g.turn = mover; // look at what the moved piece now attacks
    const caps = g.pseudo(true).filter(x => x.from === m.to && x.flag !== 'e');
    g.turn = opp;
    F.threats = caps.filter(x => lc(x.captured) !== 'k' && (!g.attacked(x.to, opp) || V[lc(x.captured)] > V[t]))
      .map(x => ({ piece: lc(x.captured), sq: sq(x.to) }));
    g.undo(m);
    F.fork = F.threats.length >= 2 || (F.check && F.threats.length >= 1);
    const backRank = mover === 'w' ? 7 : 0;
    if ((t === 'n' || t === 'b') && (m.from >> 3) === backRank && ply < 24) F.develops = true;
    if (t === 'p' && [27, 28, 35, 36].includes(m.to)) F.center = true;
    if (t === 'q' && ply < 10 && !m.captured) F.earlyQueen = true;
    if (t === 'k' && !F.castle && ply < 40 && !m.captured) F.kingWalk = true;
    return F;
  }

  function describe(F) {
    if (F.mate) return ['delivers checkmate'];
    const c = [];
    if (F.castle) c.push(`castles ${F.castle}, tucking the king into safety and connecting the rooks`);
    if (F.captures) c.push(`captures the ${NAME[F.captures]} on ${F.to}`);
    if (F.promo) c.push(`promotes the pawn to a ${NAME[F.promo]}`);
    if (F.fork) {
      const targets = (F.check ? ['the king'] : []).concat(F.threats.map(x => `the ${NAME[x.piece]} on ${x.sq}`));
      c.push(`forks ${join(targets)} at the same time`);
    } else {
      if (F.check) c.push('gives check');
      if (F.threats.length) c.push(`attacks the ${NAME[F.threats[0].piece]} on ${F.threats[0].sq}`);
    }
    if (!c.length) {
      if (F.develops) c.push(`develops the ${NAME[F.piece]} toward the center`);
      else if (F.center) c.push('takes control of the center');
      else if (F.piece === 'p') c.push(`pushes the pawn to ${F.to} to gain space`);
      else c.push(`improves the ${NAME[F.piece]} by bringing it to ${F.to}`);
    }
    return c;
  }

  // info: { cls, best, bestScore, playedScore, ply, you, name }
  function explain(fen, played, info) {
    const g = new Chess(fen), pm = find(g, played), bm = find(g, info.best) || pm;
    const pSan = g.san(pm), bSan = g.san(bm);
    const pF = facts(g, pm, info.ply), bF = facts(g, bm, info.ply);
    const oppN = info.you ? info.name : 'your opponent';
    const own = info.you ? 'your' : 'their';
    // The opponent's best answer to the move actually played.
    let reply = null, replySan = '', rF = null;
    g.make(pm);
    if (g.moves().length) { reply = AI.analyze(g, 2, 600).best; replySan = g.san(reply); rF = facts(g, reply, info.ply + 1); }
    g.undo(pm);
    // Best line (3 plies).
    const line = [bSan];
    g.make(bm);
    for (let i = 0; i < 2 && g.moves().length; i++) { const r = AI.analyze(g, 2, 400).best; line.push(g.san(r)); g.make(r); }

    const mateIn = s => AI.isMate(s) && s > 0 ? AI.mateIn(s) : 0;
    const out = [];
    const cls = info.cls;
    if (pF.mate) out.push(`${pSan} is checkmate. Game over!`);
    else if (cls === 'book') out.push(`${pSan} is a well-known opening move: it ${join(describe(pF))}.`);
    else if (cls === 'best') {
      out.push(`${pSan} is the best move here. It ${join(describe(pF))}.`);
      const m = mateIn(info.playedScore); if (m) out.push(`This sets up a forced checkmate in ${m}.`);
      else if (pF.earlyQueen) out.push('Bringing the queen out early is fine here, but watch out for attacks on her.');
    } else if (cls === 'excellent' || cls === 'good') {
      out.push(`${pSan} is ${cls === 'excellent' ? 'a strong' : 'a reasonable'} move that ${join(describe(pF))}.`);
      if (!same(bm, pm)) out.push(`${bSan} was slightly more precise: it ${join(describe(bF))}.`);
    } else {
      const label = cls === 'inaccuracy' ? 'an inaccuracy' : cls === 'mistake' ? 'a mistake' : 'a blunder';
      out.push(`${pSan} is ${label}.`);
      if (AI.isMate(info.playedScore) && info.playedScore < 0)
        out.push(`It walks into a forced checkmate: ${oppN} can begin with ${replySan}.`);
      else if (reply && reply.captured && reply.to === pm.to && pF.hangs)
        out.push(`It leaves the ${NAME[pF.piece]} on ${pF.to} unprotected, so ${oppN} can simply take it with ${replySan}.`);
      else if (reply && rF && rF.fork)
        out.push(`It allows ${replySan}, which ${join(describe(rF))}.`);
      else if (reply && reply.captured)
        out.push(`It allows ${replySan}, winning ${own} ${NAME[lc(reply.captured)]} on ${sq(reply.to)}.`);
      else if (reply && rF)
        out.push(`It gives ${oppN} the strong reply ${replySan}, which ${join(describe(rF))}.`);
      if (pF.kingWalk) out.push('Moving the king this early also weakens its safety.');
      else if (pF.earlyQueen) out.push('Developing the queen this early lets the opponent gain time by attacking her.');
      const bm8 = mateIn(info.bestScore);
      if (bm8) out.push(`Instead, ${bSan} would have forced checkmate in ${bm8}.`);
      else out.push(`Better was ${bSan}, which ${join(describe(bF))}.`);
      if (bF.captures && !pF.captures && !bm8) out.push('That was a chance to win material.');
    }
    return { reply: reply ? { from: reply.from, to: reply.to } : null, text: out, line: cls === 'best' || cls === 'book' || pF.mate ? null : line };
  }

  root.Coach = { explain };
})(typeof window !== 'undefined' ? window : globalThis);
