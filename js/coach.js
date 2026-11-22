// Game-review coach: turns engine output into plain-language explanations.
// It looks a few moves ahead to see what is really won or lost, and spots common
// tactics (forks, pins, skewers, discovered attacks, mate threats) and ideas
// (development, center, open files, batteries, king safety).
(function (root) {
  const Chess = root.Chess, AI = root.AI;
  const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const V = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const K8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const CENTER = [27, 28, 35, 36]; // d5 e5 d4 e4
  const sq = Chess.sqName, lc = p => p.toLowerCase(), isW = p => p < 'a';
  const join = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : (a[0] || '');
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const two = a => a.length > 1 ? `${a[0]}, and it also ${a[1]}` : (a[0] || '');
  const an = w => (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w;
  const same = (a, b) => a && b && a.from === b.from && a.to === b.to && (a.promo || null) === (b.promo || null);
  const find = (g, m) => g.moves().find(x => same(x, m));
  const colorOf = p => isW(p) ? 'w' : 'b';

  // Squares attacked by the piece standing on `s`.
  function attacks(b, s) {
    const p = b[s]; if (!p) return [];
    const t = lc(p), r = s >> 3, f = s & 7, out = [];
    const add = (rr, ff) => { if (rr < 0 || rr > 7 || ff < 0 || ff > 7) return false; out.push(rr * 8 + ff); return !b[rr * 8 + ff]; };
    if (t === 'p') { const d = isW(p) ? -1 : 1; add(r + d, f - 1); add(r + d, f + 1); return out; }
    if (t === 'n' || t === 'k') { for (const [a, c] of (t === 'n' ? KN : K8)) add(r + a, f + c); return out; }
    for (const [a, c] of (t === 'b' ? DIAG : t === 'r' ? ORTH : DIAG.concat(ORTH))) { let rr = r + a, ff = f + c; while (add(rr, ff)) { rr += a; ff += c; } }
    return out;
  }
  const material = (b, c) => b.reduce((s, p) => s + (p && colorOf(p) === c && lc(p) !== 'k' ? V[lc(p)] : 0), 0);
  const balance = (b, c) => material(b, c) - material(b, c === 'w' ? 'b' : 'w');

  // Slider rays from s: pins / skewers (enemy piece with a more/less valuable enemy piece behind it).
  function lineTactics(b, s, g) {
    const p = b[s], t = lc(p), c = colorOf(p), out = [];
    if (!'brq'.includes(t)) return out;
    for (const [a, d] of (t === 'b' ? DIAG : t === 'r' ? ORTH : DIAG.concat(ORTH))) {
      let rr = (s >> 3) + a, ff = (s & 7) + d, first = null;
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
        const q = b[rr * 8 + ff];
        if (q) {
          if (colorOf(q) === c) break;
          if (!first) {
            first = { p: lc(q), s: rr * 8 + ff };
            if (attacks(b, first.s).includes(s) && (!g || !g.attacked(s, c) || V[first.p] <= V[t])) break; // it can just capture us
          }
          else {
            const second = lc(q);
            if ((second === 'k' || V[second] > V[first.p]) && first.p !== 'k' && first.p !== 'p' && (second === 'k' || V[second] >= 5)) out.push({ kind: 'pin', a: first.p, b: second, s: first.s });
            else if ((first.p === 'k' || first.p === 'q') && V[second] >= 3) out.push({ kind: 'skewer', a: first.p, b: second, s: first.s });
            break;
          }
        }
        rr += a; ff += d;
      }
    }
    return out;
  }
  // Another friendly slider directly behind the piece on s, aiming the same way (a battery).
  function battery(b, s) {
    const p = b[s], t = lc(p), c = colorOf(p);
    if (!'brq'.includes(t)) return null;
    for (const [a, d] of (t === 'b' ? DIAG : t === 'r' ? ORTH : DIAG.concat(ORTH))) {
      const diag = a && d;
      let rr = (s >> 3) - a, ff = (s & 7) - d; // look behind
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
        const q = b[rr * 8 + ff];
        if (q) {
          if (colorOf(q) === c && (diag ? 'bq' : 'rq').includes(lc(q))) {
            // the line must aim at something of the opponent's
            let r2 = (s >> 3) + a, f2 = (s & 7) + d;
            while (r2 >= 0 && r2 < 8 && f2 >= 0 && f2 < 8) { const z = b[r2 * 8 + f2]; if (z) { if (colorOf(z) !== c) return lc(q); break; } r2 += a; f2 += d; }
          }
          break;
        }
        rr -= a; ff -= d;
      }
    }
    return null;
  }
  const mobility = (b, c, type) => b.reduce((n, p, s) => n + (p && colorOf(p) === c && lc(p) === type ? attacks(b, s).filter(x => !b[x] || colorOf(b[x]) !== c).length : 0), 0);

  // Everything worth saying about move m (g is left unchanged).
  function facts(g, m, ply, prevMove) {
    const b = g.board, mover = g.turn, opp = mover === 'w' ? 'b' : 'w', t = lc(m.piece);
    const F = { piece: t, to: sq(m.to), threats: [], tactics: [] };
    if (m.captured) {
      F.captures = lc(m.captured);
      F.free = !g.attacked(m.to, opp);                          // the captured piece was undefended
      F.recapture = prevMove && prevMove.to === m.to && !!prevMove.captured;
      F.trade = !F.free && V[F.captures] === V[t];
    }
    if (m.flag === 'k' || m.flag === 'q') F.castle = true;
    if (m.promo) F.promo = lc(m.promo);
    const bishopsBefore = t === 'p' ? mobility(b, mover, 'b') : 0;
    // attacks on valuable enemy pieces by our *other* pieces before the move (for discovered attacks)
    const hitBy = (exclude) => { const set = new Set(); b.forEach((p, s) => { if (p && colorOf(p) === mover && s !== exclude) attacks(b, s).forEach(x => { const q = b[x]; if (q && colorOf(q) === opp && (lc(q) === 'k' || V[lc(q)] >= 3)) set.add(x); }); }); return set; };
    const before = hitBy(m.from);

    g.make(m);
    F.check = g.inCheck();
    F.mate = F.check && g.moves().length === 0;
    if (!F.mate) {
      // is the moved piece now loose?
      if (t !== 'k') {
        const att = g.moves(true).filter(x => x.to === m.to);
        if (att.length) {
          const minA = Math.min(...att.map(x => V[lc(x.piece)]));
          if (!g.attacked(m.to, mover) || minA < V[t]) F.hangs = true;
          if (F.captures && V[F.captures] >= V[t]) F.hangs = false;
        }
      }
      // what the moved piece now threatens
      F.threats = attacks(b, m.to).filter(x => b[x] && colorOf(b[x]) === opp && lc(b[x]) !== 'k' && (!g.attacked(x, opp) || V[lc(b[x])] > V[t]))
        .map(x => ({ piece: lc(b[x]), sq: sq(x) }));
      const big = F.threats.filter(x => V[x.piece] >= 3);
      F.fork = big.length >= 2 || (F.check && big.length >= 1);
      F.forkTargets = big;
      F.tactics = lineTactics(b, m.to, g);
      F.battery = battery(b, m.to);
      // discovered attack: a different piece of ours now hits something big
      const after = hitBy(m.to);
      const disc = [...after].filter(x => !before.has(x));
      if (disc.length) { const q = lc(b[disc[0]]); F.discovered = q === 'k' ? 'check' : q; }
      if (t === 'p') { F.opensBishop = mobility(b, mover, 'b') - bishopsBefore >= 2; }
      F.centerHits = attacks(b, m.to).filter(x => CENTER.includes(x)).length;
      if (t === 'p' && 'cdef'.includes(F.to[0]) && attacks(b, m.to).some(x => b[x] && colorOf(b[x]) === opp && lc(b[x]) === 'p')) F.centerStrike = true;
      if (t === 'r') { const f = m.to & 7; const pawns = [0, 1, 2, 3, 4, 5, 6, 7].map(r => b[r * 8 + f]).filter(p => p && lc(p) === 'p'); F.openFile = !pawns.some(p => colorOf(p) === mover) ? (pawns.length ? 'half-open' : 'open') : null; }
      // does the mover now threaten mate in one?
      if (!F.check) {
        const fen = g.fen().split(' '); fen[1] = mover; fen[3] = '-';
        try { const h = new Chess(fen.join(' ')); F.mateThreat = h.moves().some(x => { h.make(x); const mt = h.inCheck() && h.moves().length === 0; h.undo(x); return mt; }); } catch (e) {}
      }
    }
    g.undo(m);
    const home = mover === 'w' ? 7 : 0;
    if ((t === 'n' || t === 'b') && (m.from >> 3) === home && ply < 24) F.develops = true;
    if (t === 'p' && CENTER.includes(m.to)) F.center = true;
    if (t === 'q' && ply < 10 && !m.captured) F.earlyQueen = true;
    if (t === 'k' && !F.castle && ply < 40 && !m.captured) F.kingWalk = true;
    if (t === 'p' && ply < 20 && 'abgh'.includes(F.to[0]) && !m.captured) F.flankPawn = true;
    // pawn moves in front of our own castled king
    const ks = g.kingSq(mover), kf = ks & 7;
    if (t === 'p' && (ks >> 3) === home && (kf >= 6 || kf <= 2) && Math.abs((m.from & 7) - kf) <= 1 && !m.captured) F.weakensKing = true;
    return F;
  }

  // Play `first` and then the engine's best replies; report material change for the mover.
  function line(fen, first, plies, prev, ply) {
    const g = new Chess(fen), mover = g.turn, start = balance(g.board, mover);
    const moves = [find(g, first)], sans = [g.san(moves[0])], fx = [facts(g, moves[0], ply, prev)];
    g.make(moves[0]);
    let mated = g.inCheck() && !g.moves().length ? mover : null;
    for (let i = 1; i < plies && !mated && g.moves().length; i++) {
      const m = AI.analyze(g, 1, 150).best;
      fx.push(i < 3 ? facts(g, m, ply + i, moves[i - 1]) : null);
      moves.push(m); sans.push(g.san(m)); g.make(m);
      if (g.inCheck() && !g.moves().length) mated = g.turn === mover ? 'them' : mover;
    }
    return { moves, sans, fx, delta: balance(g.board, mover) - start, matedMover: mated === 'them' };
  }
  // How to describe a material swing: 'a queen', 'a rook', 'a piece', 'a pawn', or just 'material'.
  const matPhrase = (d, tactic) => tactic ? 'material' : d >= 8 ? 'a queen' : d >= 5 ? 'a rook' : d >= 3 ? 'a piece' : d === 1 ? 'a pawn' : 'material';

  // Short verb phrases describing the main idea of a move, most important first.
  function ideas(F, P) {
    const out = [];
    if (F.mate) return ['delivers checkmate'];
    const bigCapture = F.captures && V[F.captures] >= 3;
    const capturePhrase = () => {
      if (F.recapture) return `recaptures the ${NAME[F.captures]}`;
      if (F.free) return `takes the undefended ${NAME[F.captures]}`;
      if (F.trade) return F.captures === F.piece ? `trades ${NAME[F.piece]}s` : `trades the ${NAME[F.piece]} for the ${NAME[F.captures]}`;
      return `captures the ${NAME[F.captures]} on ${F.to}`;
    };
    if (bigCapture) out.push(capturePhrase());
    if (F.mateThreat) out.push('threatens checkmate');
    if (F.fork) out.push(`forks ${join((F.check ? ['the king'] : []).concat(F.forkTargets.map(x => `the ${NAME[x.piece]}`)))}`);
    const pinned = new Set();
    for (const tc of F.tactics) {
      pinned.add(tc.a);
      if (tc.kind === 'pin') out.push(tc.b === 'k' ? `pins the ${NAME[tc.a]} so it can't move` : `pins the ${NAME[tc.a]} to the ${NAME[tc.b]}`);
      else out.push(`skewers the ${NAME[tc.a]}, winning the ${NAME[tc.b]} behind it`);
    }
    if (F.discovered) out.push(F.discovered === 'check' ? 'unleashes a discovered check' : `unleashes a discovered attack on the ${NAME[F.discovered]}`);
    if (F.captures && !bigCapture) out.push(capturePhrase());
    if (F.promo) out.push(`promotes to ${an(NAME[F.promo])}`);
    if (F.castle) out.push('castles, getting the king to safety and connecting the rooks');
    if (!F.fork) {
      if (F.check && !F.discovered) out.push('gives check');
      const th = F.threats.find(x => x.piece !== 'p' && !pinned.has(x.piece));
      if (th && !F.captures) out.push(`threatens to capture the ${NAME[th.piece]}`);
    }
    if (F.battery) out.push(`lines up the ${NAME[F.piece]} and ${NAME[F.battery]} on the same attacking line`);
    if (F.opensBishop) out.push('opens the path for the bishop to enter the game');
    if (F.develops) out.push(`develops the ${NAME[F.piece]}${F.centerHits ? ' and supports the center' : ''}`);
    if (F.centerStrike) out.push('strikes at the center with a pawn');
    else if (F.center) out.push('takes space in the center');
    if (F.openFile) out.push(`puts the rook on the ${F.openFile} file`);
    if (!F.fork && !F.captures && !F.centerStrike && F.threats.length && F.threats[0].piece === 'p') out.push('attacks a pawn');
    if (!out.length) {
      if (F.piece === 'p') out.push(`gains space on the ${'abcd'.includes(F.to[0]) ? 'queenside' : 'kingside'}`);
      else if (F.piece === 'k') out.push(`brings the king to ${F.to}`);
      else out.push(`improves the ${NAME[F.piece]}'s position`);
    }
    return out;
  }
  const generic = a => !a.length || /^(improves|gains space|brings the king|attacks a pawn)/.test(a[0]);
  const tacticName = fx => { for (const F of fx) { if (!F) continue; if (F.fork) return 'a fork'; if (F.tactics.some(t => t.kind === 'pin')) return 'a pin'; if (F.tactics.some(t => t.kind === 'skewer')) return 'a skewer'; if (F.discovered) return 'a discovered attack'; } return ''; };

  // info: { cls, best, bestScore, playedScore, ply, you, name, prev }
  function explain(fen, played, info) {
    const g = new Chess(fen), pm = find(g, played), bm = find(g, info.best) || pm;
    const pSan = g.san(pm), bSan = g.san(bm), cls = info.cls, same_ = same(bm, pm);
    const you = info.you, opp = you ? info.name : 'you', Opp = cap(opp), own = you ? 'your' : 'their';
    const P = line(fen, pm, 4, info.prev, info.ply), B = same_ ? P : line(fen, bm, 4, info.prev, info.ply);
    const pF = P.fx[0], bF = B.fx[0];
    const reply = P.moves[1] || null, replySan = P.sans[1] || '', rF = P.fx[1] || null;
    const mateIn = s => AI.isMate(s) && s > 0 ? AI.mateIn(s) : 0;
    const pIdeas = ideas(pF), bIdeas = ideas(bF);
    const out = [];

    if (pF.mate) out.push(`${pSan} is checkmate. Game over!`);
    else if (cls === 'book') {
      out.push(`${cap(two(pIdeas))}.`);
      out.push(you ? 'This is a well-known opening move.' : `${info.name} is still following opening theory.`);
    } else if (cls === 'best' || cls === 'great') {
      const m = mateIn(info.playedScore);
      out.push(`${cap(two(pIdeas))}.`);
      if (m) out.push(you ? `This sets up a forced checkmate in ${m}.` : `${info.name} now has a forced checkmate in ${m}.`);
      else if (P.delta >= 1 && !pF.captures) out.push(you ? `This wins ${matPhrase(P.delta, tacticName(P.fx.slice(0, 1)))}${tacticName(P.fx.slice(0, 1)) ? ` through ${tacticName(P.fx.slice(0, 1))}` : ''}.` : `${info.name} is winning material here.`);
      if (cls === 'great') out.push('It was the only move that kept the advantage.');
      else if (pF.earlyQueen) out.push('Bringing the queen out early works here, but keep an eye on attacks against her.');
    } else if (cls === 'excellent' || cls === 'good') {
      out.push(`${cap(two(pIdeas))}.`);
      if (!same_) out.push(generic(bIdeas) || bIdeas[0] === pIdeas[0] ? `${bSan} was ${cls === 'excellent' ? 'a touch' : 'a bit'} more accurate.` : `${bSan} was ${cls === 'excellent' ? 'a touch' : 'a bit'} stronger: it ${two(bIdeas)}.`);
    } else {
      // ----- inaccuracy / mistake / blunder -----
      const loses = Math.max(0, -P.delta), bestGain = B.delta;
      const how = tacticName(P.fx.slice(1, 3));
      if (AI.isMate(info.playedScore) && info.playedScore < 0)
        out.push(you ? `This allows a forced checkmate, starting with ${replySan}.` : `This gives you a forced checkmate, starting with ${replySan}!`);
      else if (bestGain >= 1 && bestGain > P.delta) {
        const bhow = tacticName(B.fx.slice(0, 3));
        out.push(you ? `You missed a chance to win ${matPhrase(bestGain, bhow)}${bhow ? ` through ${bhow}` : ''}.` : `${info.name} missed a chance to win ${matPhrase(bestGain, bhow)}${bhow ? ` through ${bhow}` : ''}.`);
      } else if (loses >= 1 && P.delta < bestGain) {
        const what = matPhrase(loses, pF.hangs ? '' : how);
        if (pF.hangs && reply && reply.to === pm.to) out.push(you ? `This move loses ${what}: the ${NAME[pF.piece]} on ${pF.to} is left unprotected and ${opp} can take it with ${replySan}.` : `This move loses ${what}. The ${NAME[pF.piece]} on ${pF.to} is left hanging, and you can take it with ${replySan}.`);
        else out.push(you ? `This move loses ${what}${how ? ` to ${how}` : ''} after ${replySan}.` : `This gives you a chance to win ${what}${how ? ` through ${how}` : ''}, starting with ${replySan}.`);
      } else if (pF.weakensKing) out.push(you ? 'This weakens the pawn shield in front of your king.' : `This weakens the pawns around ${info.name}'s king, which you may be able to attack.`);
      else if (pF.flankPawn) out.push(you ? 'This spends time on a side pawn move instead of developing your pieces.' : `${info.name} spends time on a pawn move, giving you more time to develop.`);
      else if (pF.kingWalk) out.push(you ? 'Moving the king this early leaves it exposed.' : `${info.name}'s king is now exposed.`);
      else if (pF.earlyQueen) out.push(you ? 'Bringing the queen out this early lets your opponent gain time by attacking her.' : `${info.name}'s queen came out early, so you can gain time by attacking her.`);
      else if (pF.trade && reply && reply.to === pm.to) out.push(you ? `This trades pieces, but it releases the pressure and lets ${opp} off the hook.` : 'This trade releases the pressure and gives you some breathing room.');
      else if (rF && reply) {
        const ri = ideas(rF).filter(x => !/^(brings the king|improves|gains space)/.test(x));
        out.push(ri.length ? (you ? `This allows ${replySan}, which ${two(ri)}.` : `This gives you the chance to play ${replySan}, which ${two(ri)}.`)
          : (you ? `This is a little passive; ${opp} gets time to improve with ${replySan}.` : `This is a little passive, giving you time to improve with ${replySan}.`));
      } else out.push(you ? 'This lets your advantage slip a little.' : 'This gives you a little more room to work with.');

      // what the opponent's answer does (if it adds something new)
      if (rF && reply && !(AI.isMate(info.playedScore) && info.playedScore < 0)) {
        const ri = ideas(rF).filter(x => !/^(brings the king|improves|gains space)/.test(x));
        if (ri.length && !out.some(x => x.includes(replySan))) out.push(you ? `${Opp} can answer with ${replySan}, which ${two(ri)}.` : `You can answer with ${replySan}, which ${two(ri)}.`);
      }
      const bm8 = mateIn(info.bestScore);
      if (bm8) out.push(you ? `Your best option was ${bSan}, leading to checkmate in ${bm8}.` : `Their best option was ${bSan}, with checkmate in ${bm8}.`);
      else if (generic(bIdeas) || bIdeas[0] === pIdeas[0]) out.push(`${you ? 'Your' : 'Their'} better option was ${bSan}.`);
      else out.push(`${you ? 'Your' : 'Their'} better option was ${bSan}, which ${two(bIdeas)}${B.delta > P.delta + 1 && B.delta >= 1 && !bF.captures ? ` and wins ${matPhrase(B.delta)}` : ''}.`);
    }
    return { reply: reply ? { from: reply.from, to: reply.to } : null, text: out, line: cls === 'best' || cls === 'book' || cls === 'great' || pF.mate ? null : B.sans.slice(0, 3) };
  }

  root.Coach = { explain };
  if (typeof module !== 'undefined') module.exports = root.Coach;
})(typeof window !== 'undefined' ? window : globalThis);
