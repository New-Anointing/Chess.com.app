// Minimal, complete chess rules engine: legal moves, SAN, check/mate/draws.
(function (root) {
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const N = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  const K = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const BD = [[-1,-1],[-1,1],[1,-1],[1,1]];
  const RD = [[-1,0],[1,0],[0,-1],[0,1]];
  const sqName = s => 'abcdefgh'[s & 7] + (8 - (s >> 3));
  const sqIdx = n => (8 - +n[1]) * 8 + (n.charCodeAt(0) - 97);
  const isW = p => p < 'a';

  class Chess {
    constructor(fen) { this.load(fen || START); }

    load(fen) {
      const [b, t, c, e, h, f] = fen.trim().split(/\s+/);
      this.board = new Array(64).fill(null);
      let i = 0;
      for (const ch of b) {
        if (ch === '/') continue;
        if (ch >= '1' && ch <= '8') i += +ch; else this.board[i++] = ch;
      }
      this.turn = t || 'w';
      this.castling = !c || c === '-' ? '' : c;
      this.ep = !e || e === '-' ? -1 : sqIdx(e);
      this.half = +h || 0;
      this.full = +f || 1;
      this.stack = [];
      this.keys = [this.key()];
    }

    key() {
      let s = '', empty = 0;
      for (let i = 0; i < 64; i++) {
        const p = this.board[i];
        if (!p) empty++; else { if (empty) { s += empty; empty = 0; } s += p; }
        if ((i & 7) === 7) { if (empty) { s += empty; empty = 0; } if (i < 63) s += '/'; }
      }
      return `${s} ${this.turn} ${this.castling || '-'} ${this.ep < 0 ? '-' : sqName(this.ep)}`;
    }
    fen() { return `${this.key()} ${this.half} ${this.full}`; }

    attacked(sq, by) {
      const r = sq >> 3, f = sq & 7, b = this.board, w = by === 'w';
      const at = (rr, ff) => (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) ? b[rr * 8 + ff] : undefined;
      const P = w ? 'P' : 'p', pr = w ? r + 1 : r - 1;
      if (at(pr, f - 1) === P || at(pr, f + 1) === P) return true;
      const Nn = w ? 'N' : 'n', Kk = w ? 'K' : 'k', Bb = w ? 'B' : 'b', Rr = w ? 'R' : 'r', Qq = w ? 'Q' : 'q';
      for (const [dr, df] of N) if (at(r + dr, f + df) === Nn) return true;
      for (const [dr, df] of K) if (at(r + dr, f + df) === Kk) return true;
      for (const [dr, df] of BD) {
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
          const p = b[rr * 8 + ff];
          if (p) { if (p === Bb || p === Qq) return true; break; }
          rr += dr; ff += df;
        }
      }
      for (const [dr, df] of RD) {
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
          const p = b[rr * 8 + ff];
          if (p) { if (p === Rr || p === Qq) return true; break; }
          rr += dr; ff += df;
        }
      }
      return false;
    }

    kingSq(c) { return this.board.indexOf(c === 'w' ? 'K' : 'k'); }
    inCheck(c = this.turn) { return this.attacked(this.kingSq(c), c === 'w' ? 'b' : 'w'); }

    pseudo(capturesOnly) {
      const moves = [], b = this.board, w = this.turn === 'w', them = w ? 'b' : 'w';
      for (let s = 0; s < 64; s++) {
        const p = b[s];
        if (!p || isW(p) !== w) continue;
        const r = s >> 3, f = s & 7, t = p.toLowerCase();
        if (t === 'p') {
          const d = w ? -1 : 1, r1 = r + d, start = w ? 6 : 1, last = w ? 0 : 7;
          const push = (to, cap, flag) => {
            if ((to >> 3) === last) for (const pr of 'qnrb') moves.push({ from: s, to, piece: p, captured: cap, promo: w ? pr.toUpperCase() : pr, flag });
            else moves.push({ from: s, to, piece: p, captured: cap, flag });
          };
          if (r1 < 0 || r1 > 7) continue;
          const to = r1 * 8 + f;
          if (!b[to] && (!capturesOnly || r1 === last)) {
            push(to, null, 'n');
            if (!capturesOnly && r === start && !b[(r1 + d) * 8 + f]) moves.push({ from: s, to: (r1 + d) * 8 + f, piece: p, captured: null, flag: 'b' });
          }
          for (const df of [-1, 1]) {
            const ff = f + df; if (ff < 0 || ff > 7) continue;
            const t2 = r1 * 8 + ff, q = b[t2];
            if (q && isW(q) !== w) push(t2, q, 'c');
            else if (t2 === this.ep) moves.push({ from: s, to: t2, piece: p, captured: w ? 'p' : 'P', flag: 'e' });
          }
        } else if (t === 'n' || t === 'k') {
          for (const [dr, df] of (t === 'n' ? N : K)) {
            const rr = r + dr, ff = f + df;
            if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
            const to = rr * 8 + ff, q = b[to];
            if (!q) { if (!capturesOnly) moves.push({ from: s, to, piece: p, captured: null, flag: 'n' }); }
            else if (isW(q) !== w) moves.push({ from: s, to, piece: p, captured: q, flag: 'c' });
          }
          if (t === 'k' && !capturesOnly && this.castling) {
            const c = this.castling;
            if (w && s === 60) {
              if (c.includes('K') && !b[61] && !b[62] && b[63] === 'R' && !this.attacked(60, them) && !this.attacked(61, them) && !this.attacked(62, them))
                moves.push({ from: 60, to: 62, piece: p, captured: null, flag: 'k' });
              if (c.includes('Q') && !b[59] && !b[58] && !b[57] && b[56] === 'R' && !this.attacked(60, them) && !this.attacked(59, them) && !this.attacked(58, them))
                moves.push({ from: 60, to: 58, piece: p, captured: null, flag: 'q' });
            } else if (!w && s === 4) {
              if (c.includes('k') && !b[5] && !b[6] && b[7] === 'r' && !this.attacked(4, them) && !this.attacked(5, them) && !this.attacked(6, them))
                moves.push({ from: 4, to: 6, piece: p, captured: null, flag: 'k' });
              if (c.includes('q') && !b[3] && !b[2] && !b[1] && b[0] === 'r' && !this.attacked(4, them) && !this.attacked(3, them) && !this.attacked(2, them))
                moves.push({ from: 4, to: 2, piece: p, captured: null, flag: 'q' });
            }
          }
        } else {
          const dirs = t === 'b' ? BD : t === 'r' ? RD : BD.concat(RD);
          for (const [dr, df] of dirs) {
            let rr = r + dr, ff = f + df;
            while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
              const to = rr * 8 + ff, q = b[to];
              if (!q) { if (!capturesOnly) moves.push({ from: s, to, piece: p, captured: null, flag: 'n' }); }
              else { if (isW(q) !== w) moves.push({ from: s, to, piece: p, captured: q, flag: 'c' }); break; }
              rr += dr; ff += df;
            }
          }
        }
      }
      return moves;
    }

    moves(capturesOnly) {
      const us = this.turn, them = us === 'w' ? 'b' : 'w', out = [];
      for (const m of this.pseudo(capturesOnly)) {
        this.make(m);
        if (!this.attacked(this.kingSq(us), them)) out.push(m);
        this.undo(m);
      }
      return out;
    }

    make(m) {
      const b = this.board;
      this.stack.push([this.castling, this.ep, this.half, this.full]);
      b[m.to] = m.promo || m.piece; b[m.from] = null;
      if (m.flag === 'e') b[m.to + (this.turn === 'w' ? 8 : -8)] = null;
      else if (m.flag === 'k') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
      else if (m.flag === 'q') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }
      let c = this.castling;
      if (c) {
        for (const s of [m.from, m.to]) {
          if (s === 60) c = c.replace(/[KQ]/g, '');
          else if (s === 4) c = c.replace(/[kq]/g, '');
          else if (s === 63) c = c.replace('K', '');
          else if (s === 56) c = c.replace('Q', '');
          else if (s === 7) c = c.replace('k', '');
          else if (s === 0) c = c.replace('q', '');
        }
        this.castling = c;
      }
      this.ep = m.flag === 'b' ? (m.from + m.to) >> 1 : -1;
      this.half = (m.piece === 'p' || m.piece === 'P' || m.captured) ? 0 : this.half + 1;
      if (this.turn === 'b') this.full++;
      this.turn = this.turn === 'w' ? 'b' : 'w';
    }

    undo(m) {
      const b = this.board;
      [this.castling, this.ep, this.half, this.full] = this.stack.pop();
      this.turn = this.turn === 'w' ? 'b' : 'w';
      b[m.from] = m.piece;
      if (m.flag === 'e') { b[m.to] = null; b[m.to + (this.turn === 'w' ? 8 : -8)] = m.captured; }
      else b[m.to] = m.captured;
      if (m.flag === 'k') { b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = null; }
      else if (m.flag === 'q') { b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = null; }
    }

    san(m, legal = this.moves()) {
      let s;
      if (m.flag === 'k') s = 'O-O';
      else if (m.flag === 'q') s = 'O-O-O';
      else {
        const t = m.piece.toUpperCase();
        if (t === 'P') {
          s = (m.captured ? 'abcdefgh'[m.from & 7] + 'x' : '') + sqName(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
        } else {
          const others = legal.filter(o => o.piece === m.piece && o.to === m.to && o.from !== m.from);
          let d = '';
          if (others.length) {
            const sameF = others.some(o => (o.from & 7) === (m.from & 7));
            const sameR = others.some(o => (o.from >> 3) === (m.from >> 3));
            d = !sameF ? sqName(m.from)[0] : !sameR ? sqName(m.from)[1] : sqName(m.from);
          }
          s = t + d + (m.captured ? 'x' : '') + sqName(m.to);
        }
      }
      this.make(m);
      if (this.inCheck()) s += this.moves().length ? '+' : '#';
      this.undo(m);
      return s;
    }

    // Public move for real games (tracks repetition).
    play(m) { const san = this.san(m); this.make(m); this.keys.push(this.key()); return san; }

    insufficient() {
      const pcs = this.board.filter(p => p && p.toLowerCase() !== 'k');
      if (pcs.length === 0) return true;
      if (pcs.length === 1 && 'nNbB'.includes(pcs[0])) return true;
      return false;
    }

    status() {
      const legal = this.moves();
      if (!legal.length) {
        if (this.inCheck()) return { over: true, result: this.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
        return { over: true, result: '1/2-1/2', reason: 'stalemate' };
      }
      if (this.half >= 100) return { over: true, result: '1/2-1/2', reason: '50-move rule' };
      if (this.insufficient()) return { over: true, result: '1/2-1/2', reason: 'insufficient material' };
      const k = this.keys[this.keys.length - 1];
      if (this.keys.filter(x => x === k).length >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold repetition' };
      return { over: false };
    }
  }

  Chess.START = START; Chess.sqName = sqName; Chess.sqIdx = sqIdx; Chess.isW = isW;
  root.Chess = Chess;
  if (typeof module !== 'undefined') module.exports = Chess;
})(typeof window !== 'undefined' ? window : globalThis);
