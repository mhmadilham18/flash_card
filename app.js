"use strict";

const Core = (() => {
  const LETTERS = ["A", "B", "C", "D", "E", "F"];
  const MAX_PTS = 1000;

  const norm = (s) =>
    String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const cellOf = (row, idx) =>
    idx == null || row[idx] == null ? "" : String(row[idx]).trim();

  const T_TF = ["tf", "truefalse", "benarsalah", "bs", "boolean", "tof"];
  const T_MULTI = ["multi", "multijawaban", "dua", "2", "banyak", "checkbox"];
  const T_SINGLE = [
    "single",
    "tunggal",
    "satu",
    "1",
    "pilgan",
    "pilihan",
    "pilihanganda",
    "radio",
    "mcq",
    "multiplechoice",
  ];
  const TF_TRUE = ["BENAR", "BENER", "TRUE", "T", "B", "YA", "1"];
  const TF_FALSE = ["SALAH", "FALSE", "F", "S", "TIDAK", "0"];

  function typeFrom(raw) {
    const n = norm(raw);
    if (!n) return null;
    if (T_TF.includes(n)) return "tf";
    if (T_MULTI.includes(n)) return "multi";
    if (T_SINGLE.includes(n)) return "single";
    return undefined; // tidak dikenali
  }

  function findCols(header) {
    const map = { opts: [] };
    header.forEach((h, i) => {
      const n = norm(h);
      if (!n) return;
      if (/^(tipe|type|jenis)/.test(n)) map.type = i;
      else if (/^(soal|pertanyaan|question)/.test(n)) map.text = i;
      else if (/^(opsi|pilihan|option)?[a-f]$/.test(n))
        map.opts[n.charCodeAt(n.length - 1) - 97] = i;
      else if (/^(jawaban|kunci|answer)/.test(n)) map.answer = i;
      else if (/^(waktu|detik|time|durasi)/.test(n)) map.time = i;
      else if (/^(penjelasan|pembahasan|explanation|catatan)/.test(n))
        map.explain = i;
    });
    return map;
  }

  /** rows: array (baris pertama = header). */
  function parseRows(rows) {
    const out = { questions: [], errors: [], warnings: [] };
    const hi = rows.findIndex(
      (r) =>
        Array.isArray(r) &&
        r.some((c) => String(c == null ? "" : c).trim() !== ""),
    );
    if (hi < 0) {
      out.errors.push({ row: 0, msg: "File kosong." });
      return out;
    }

    const map = findCols(rows[hi]);
    if (map.text == null || map.answer == null) {
      out.errors.push({
        row: hi + 1,
        msg: 'Kolom "Soal" dan/atau "Jawaban" tidak ditemukan di baris header. Pakai template yang disediakan.',
      });
      return out;
    }

    for (let ri = hi + 1; ri < rows.length; ri++) {
      const r = rows[ri] || [];
      const rowNo = ri + 1;
      const text = cellOf(r, map.text);
      const meaningful = [map.type, map.answer, ...map.opts].some(
        (i) => i != null && cellOf(r, i) !== "",
      );
      if (!text && !meaningful) continue; // baris kosong / hanya nomor
      if (!text) {
        out.errors.push({ row: rowNo, msg: "Kolom Soal kosong." });
        continue;
      }

      // opsi (huruf -> index baru)
      const options = [];
      const letterToIdx = {};
      for (let l = 0; l < 6; l++) {
        const ci = map.opts[l];
        if (ci == null) continue;
        const v = cellOf(r, ci);
        if (v !== "") {
          letterToIdx[LETTERS[l]] = options.length;
          options.push(v);
        }
      }

      let type = typeFrom(cellOf(r, map.type));
      const rawType = cellOf(r, map.type);
      if (type === undefined) {
        out.warnings.push({
          row: rowNo,
          msg: `Tipe "${rawType}" tidak dikenali, ditebak dari jawaban.`,
        });
        type = null;
      }

      const ans = cellOf(r, map.answer).toUpperCase();
      if (!ans) {
        out.errors.push({ row: rowNo, msg: "Kolom Jawaban kosong." });
        continue;
      }

      if (
        type === null &&
        options.length < 2 &&
        (TF_TRUE.includes(ans) || TF_FALSE.includes(ans))
      )
        type = "tf";

      let q;
      if (type === "tf") {
        let correct;
        if (TF_TRUE.includes(ans)) correct = [0];
        else if (TF_FALSE.includes(ans)) correct = [1];
        else {
          out.errors.push({
            row: rowNo,
            msg: `Jawaban "${ans}" tidak valid untuk tipe tf. Isi BENAR atau SALAH.`,
          });
          continue;
        }
        q = { type: "tf", text, options: ["Benar", "Salah"], correct };
      } else {
        if (options.length < 2) {
          out.errors.push({ row: rowNo, msg: "Minimal 2 opsi harus terisi." });
          continue;
        }
        const cleaned = ans
          .replace(/\bDAN\b/g, " ")
          .replace(/[\s,;&+\/.\-]+/g, "");
        if (!/^[A-F]+$/.test(cleaned)) {
          out.errors.push({
            row: rowNo,
            msg: `Jawaban "${ans}" harus berupa huruf opsi (mis. B atau A,C).`,
          });
          continue;
        }
        const letters = [...new Set(cleaned.split(""))];
        const missing = letters.filter((l) => !(l in letterToIdx));
        if (missing.length) {
          out.errors.push({
            row: rowNo,
            msg: `Jawaban ${missing.join(",")} mengacu ke opsi yang kosong.`,
          });
          continue;
        }
        const correct = letters
          .map((l) => letterToIdx[l])
          .sort((a, b) => a - b);
        if (type === null) type = correct.length > 1 ? "multi" : "single";
        if (type === "single" && correct.length > 1) {
          out.warnings.push({
            row: rowNo,
            msg: "Tipe single tapi jawaban lebih dari satu — otomatis dijadikan multi.",
          });
          type = "multi";
        }
        q = { type, text, options, correct };
      }

      const t = parseInt(cellOf(r, map.time), 10);
      q.time =
        Number.isFinite(t) && t > 0 ? Math.min(300, Math.max(5, t)) : null;
      q.explain = cellOf(r, map.explain);
      q.id = "q" + (out.questions.length + 1);
      out.questions.push(q);
    }

    if (!out.questions.length && !out.errors.length)
      out.errors.push({ row: 0, msg: "Tidak ada soal ditemukan." });
    return out;
  }

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  function shuffleOptions(q) {
    if (q.type === "tf") return q;
    const idx = shuffle(q.options.map((_, i) => i));
    return {
      ...q,
      options: idx.map((i) => q.options[i]),
      correct: q.correct.map((c) => idx.indexOf(c)).sort((a, b) => a - b),
    };
  }

  function buildPlaylist(deck, cfg) {
    let qs = deck.map((q) => ({
      ...q,
      options: q.options.slice(),
      correct: q.correct.slice(),
    }));
    if (cfg.shuffleQ) qs = shuffle(qs);
    if (cfg.limit > 0) qs = qs.slice(0, cfg.limit);
    if (cfg.shuffleO) qs = qs.map(shuffleOptions);
    return qs;
  }

  /** 1000 poin kalau instan, turun linear sampai 500 di detik terakhir. */
  function calcPoints(ms, limitSec) {
    const frac = Math.min(1, Math.max(0, ms / (limitSec * 1000)));
    return Math.round(MAX_PTS * (1 - frac / 2));
  }

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    return b.every((x) => s.has(x));
  }

  return {
    LETTERS,
    MAX_PTS,
    parseRows,
    calcPoints,
    sameSet,
    shuffle,
    shuffleOptions,
    buildPlaylist,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Core;

if (typeof document !== "undefined")
  (() => {
    const {
      LETTERS,
      MAX_PTS,
      parseRows,
      calcPoints,
      sameSet,
      shuffle,
      buildPlaylist,
    } = Core;
    const PEER_PREFIX = "flashquest-v1-";

    /* ---------- util ---------- */
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const esc = (s) =>
      String(s == null ? "" : s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
    const rich = (s) => esc(s).replace(/\n/g, "<br>");
    const fmt = (n) => Number(n).toLocaleString("id-ID");
    const store = {
      get(k, d) {
        try {
          const v = localStorage.getItem(k);
          return v === null ? d : JSON.parse(v);
        } catch (e) {
          return d;
        }
      },
      set(k, v) {
        try {
          localStorage.setItem(k, JSON.stringify(v));
        } catch (e) {
          /* ignore */
        }
      },
      del(k) {
        try {
          localStorage.removeItem(k);
        } catch (e) {
          /* ignore */
        }
      },
    };

    /* ---------- pixel sprites ---------- */
    const SPRITES = {
      star: {
        pal: { k: "#141414", y: "#FFE14D" },
        rows: [
          "...kk...",
          "..kyyk..",
          "kkkyykkk",
          "kyyyyyyk",
          ".kyyyyk.",
          ".kyyyyk.",
          "kyykkyyk",
          "kkk..kkk",
        ],
      },
      trophy: {
        pal: { k: "#141414", y: "#FFD23F" },
        rows: [
          "kkkkkkkk",
          "kyyyyyyk",
          "kyyyyyyk",
          ".kyyyyk.",
          "..kyyk..",
          "...kk...",
          "..kyyk..",
          ".kkkkkk.",
        ],
      },
      flame: {
        pal: { k: "#141414", r: "#FF5A5F", o: "#FFA34D", y: "#FFE14D" },
        rows: [
          "....k...",
          "...kok..",
          "..koyok.",
          ".kooyook",
          ".koyyyok",
          ".koyyyok",
          "..kooook",
          "...kkkk.",
        ],
      },
      clock: {
        pal: { k: "#141414", w: "#ffffff" },
        rows: [
          "..kkkk..",
          ".kwwwwk.",
          "kwwwkwwk",
          "kwwwkwwk",
          "kwwwkkwk",
          "kwwwwwwk",
          ".kwwwwk.",
          "..kkkk..",
        ],
      },
      cross: {
        pal: { r: "#FF5A5F" },
        rows: [
          "rr....rr",
          "rrr..rrr",
          ".rrrrrr.",
          "..rrrr..",
          "..rrrr..",
          ".rrrrrr.",
          "rrr..rrr",
          "rr....rr",
        ],
      },
      check: {
        pal: { k: "#141414", g: "#ffffff" },
        rows: [
          "........",
          "......kk",
          ".....kgk",
          "kk..kgk.",
          "kgkkgk..",
          ".kggk...",
          "..kk....",
          "........",
        ],
      },
      card: {
        pal: { k: "#141414", b: "#4DDCFF", w: "#ffffff" },
        rows: [
          "kkkkkkkk",
          "kbbbbbbk",
          "kbwwwbbk",
          "kbwbbbbk",
          "kbwbbbbk",
          "kbbbbbbk",
          "kbbbbbbk",
          "kkkkkkkk",
        ],
      },
    };
    function sprite(name, px = 4) {
      const s = SPRITES[name];
      const h = s.rows.length,
        w = s.rows[0].length;
      let r = "";
      s.rows.forEach((row, y) =>
        [...row].forEach((c, x) => {
          if (c !== ".")
            r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${s.pal[c]}"/>`;
        }),
      );
      return `<svg class="sprite" viewBox="0 0 ${w} ${h}" width="${w * px}" height="${h * px}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
    }
    function hash(str) {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }
    const AV = [
      "#FF7EB6",
      "#4DDCFF",
      "#FFE14D",
      "#5BEF8A",
      "#B794FF",
      "#FFA34D",
      "#5B8CFF",
      "#FF5A5F",
    ];
    function avatar(name, px = 5) {
      const h1 = hash(String(name || "?")),
        h2 = hash(String(name || "?") + "#");
      const col = AV[h1 % AV.length];
      const bg =
        AV[(h2 >>> 3) % AV.length] === col
          ? "#ffffff"
          : AV[(h2 >>> 3) % AV.length];
      let r = `<rect width="7" height="7" fill="${bg}" opacity=".35"/>`;
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 3; x++) {
          if ((h1 >>> (y * 3 + x)) & 1) {
            r += `<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="${col}"/>`;
            if (x < 2)
              r += `<rect x="${5 - x}" y="${y + 1}" width="1" height="1" fill="${col}"/>`;
          }
        }
      r += `<rect x="3" y="3" width="1" height="1" fill="${col}"/>`;
      return `<span class="avatar"><svg viewBox="0 0 7 7" width="${7 * px}" height="${7 * px}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg></span>`;
    }
    function paintSprites(root = document) {
      $$("[data-sprite]", root).forEach((n) => {
        n.innerHTML = sprite(n.dataset.sprite, +n.dataset.px || 4);
      });
    }

    const SOUND_DIR = "sounds/";
    const SOUND_EXT = ".mp3"; 
    const SFX_NAMES = [
      "click",
      "benar",
      "salah",
      "timeout",
      "start",
      "lock",
      "tick",
      "streak",
      "join",
      "reveal",
      "win",
      "lose",
    ];
    const BGM_NAMES = ["menu", "game"];

    let muted = store.get("fq_mute", false);
    let musicOn = store.get("fq_music", true);

    // fallback kalau suara null
    let actx = null;
    function tone(freq, dur, type = "square", vol = 0.05, delay = 0) {
      try {
        actx = actx || new (window.AudioContext || window.webkitAudioContext)();
        const o = actx.createOscillator(),
          g = actx.createGain();
        o.type = type;
        o.frequency.value = freq;
        o.connect(g);
        g.connect(actx.destination);
        const t = actx.currentTime + delay;
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.start(t);
        o.stop(t + dur + 0.02);
      } catch (e) {
        /* ignore */
      }
    }
    const SYNTH = {
      click: () => tone(520, 0.05),
      benar: () => {
        tone(660, 0.1);
        tone(880, 0.18, "square", 0.05, 0.1);
      },
      salah: () => tone(200, 0.28, "sawtooth", 0.05),
      timeout: () => {
        tone(180, 0.18, "sawtooth", 0.05);
        tone(130, 0.3, "sawtooth", 0.05, 0.2);
      },
      start: () => {
        tone(440, 0.08);
        tone(660, 0.12, "square", 0.05, 0.09);
      },
      lock: () => {
        tone(300, 0.05);
        tone(450, 0.07, "square", 0.05, 0.06);
      },
      tick: () => tone(900, 0.03, "square", 0.03),
      streak: () =>
        [660, 880, 1100].forEach((f, i) =>
          tone(f, 0.09, "square", 0.05, i * 0.07),
        ),
      join: () => tone(740, 0.08, "triangle", 0.06),
      reveal: () => {
        tone(330, 0.1);
        tone(494, 0.15, "square", 0.05, 0.1);
      },
      win: () =>
        [523, 659, 784, 1047].forEach((f, i) =>
          tone(f, 0.16, "square", 0.05, i * 0.12),
        ),
      lose: () =>
        [400, 350, 300, 220].forEach((f, i) =>
          tone(f, 0.22, "sawtooth", 0.05, i * 0.2),
        ),
    };

    /* --- efek suara --- */
    const sfxCache = {};
    const sfxMissing = new Set();
    SFX_NAMES.forEach((n) => {
      try {
        const a = new Audio(SOUND_DIR + "sfx_" + n + SOUND_EXT);
        a.preload = "auto";
        a.addEventListener("error", () => sfxMissing.add(n));
        sfxCache[n] = a;
      } catch (e) {
        sfxMissing.add(n);
      }
    });
    function play(name, vol = 1) {
      if (muted) return;
      const a = sfxCache[name];
      if (!a || sfxMissing.has(name)) {
        SYNTH[name] && SYNTH[name]();
        return;
      }
      try {
        const c = a.cloneNode();
        c.volume = vol;
        const p = c.play();
        if (p && p.catch)
          p.catch((err) => {
            if (err && err.name === "NotSupportedError") {
              sfxMissing.add(name);
              SYNTH[name] && SYNTH[name]();
            }
          });
      } catch (e) {
        /* ignore */
      }
    }
    const sfx = {
      click: () => play("click", 0.8),
      ok: () => play("benar"),
      bad: () => play("salah"),
      timeout: () => play("timeout"),
      start: () => play("start"),
      lock: () => play("lock"),
      tick: () => play("tick", 0.6),
      streak: () => play("streak"),
      join: () => play("join"),
      reveal: () => play("reveal"),
      win: () => play("win"),
      lose: () => play("lose"),
    };

    /* sfx */
    const bgm = {};
    BGM_NAMES.forEach((n) => {
      try {
        const a = new Audio(SOUND_DIR + "bgm_" + n + SOUND_EXT);
        a.loop = true;
        a.volume = 0.3;
        a.preload = "auto";
        bgm[n] = a;
      } catch (e) {
        /* ignore */
      }
    });
    let wantTrack = null,
      curTrack = null,
      audioUnlocked = false;
    function applyMusic() {
      const target =
        musicOn && audioUnlocked && !document.hidden ? wantTrack : null;
      if (target === curTrack) return;
      if (curTrack && bgm[curTrack]) bgm[curTrack].pause();
      curTrack = target;
      if (target && bgm[target]) {
        try {
          const p = bgm[target].play();
          if (p && p.catch)
            p.catch(() => {
              if (curTrack === target) curTrack = null;
            });
        } catch (e) {
          curTrack = null;
        }
      }
    }
    function setMusic(name) {
      wantTrack = name;
      applyMusic();
    }
    document.addEventListener("pointerdown", () => {
      if (audioUnlocked) return;
      audioUnlocked = true;
      applyMusic();
    });
    function renderMute() {
      $("#btn-mute").textContent = muted ? "SFX: OFF" : "SFX: ON";
      $("#btn-music").textContent = musicOn ? "MUSIK: ON" : "MUSIK: OFF";
    }

    /* toast / modal / screens  */
    let toastT = null;
    function toast(msg, ms = 2600) {
      const t = $("#toast");
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(toastT);
      toastT = setTimeout(() => t.classList.remove("show"), ms);
    }
    function confirmBox(msg) {
      return new Promise((res) => {
        const m = $("#modal");
        $("#modal-msg").textContent = msg;
        m.hidden = false;
        const done = (v) => {
          m.hidden = true;
          $("#modal-ok").onclick = $("#modal-cancel").onclick = null;
          res(v);
        };
        $("#modal-ok").onclick = () => done(true);
        $("#modal-cancel").onclick = () => done(false);
        $("#modal-ok").focus();
      });
    }
    const MUSIC_BY_SCREEN = {
      "screen-home": "menu",
      "screen-setup": "menu",
      "screen-join": "menu",
      "screen-solo": "game",
      "screen-solo-result": null,
    };
    function show(id) {
      $$(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
      window.scrollTo(0, 0);
      if (id in MUSIC_BY_SCREEN) setMusic(MUSIC_BY_SCREEN[id]);
    }
    function setConnDot(state) {
      const d = $("#conn-dot");
      if (!state) {
        d.hidden = true;
        return;
      }
      d.hidden = false;
      d.className = "conn-dot " + (state === "ok" ? "" : state);
    }
    function confetti() {
      const wrap = document.createElement("div");
      wrap.className = "confetti";
      for (let i = 0; i < 50; i++) {
        const s = document.createElement("i");
        const sz = 8 + Math.floor(Math.random() * 3) * 4;
        s.style.cssText = `left:${Math.random() * 100}%;width:${sz}px;height:${sz}px;background:${AV[i % AV.length]};animation-delay:${Math.random() * 0.8}s;animation-duration:${2 + Math.random() * 2}s`;
        wrap.appendChild(s);
      }
      document.body.appendChild(wrap);
      setTimeout(() => wrap.remove(), 5200);
    }
    let wake = null;
    async function keepAwake() {
      try {
        if ("wakeLock" in navigator)
          wake = await navigator.wakeLock.request("screen");
      } catch (e) {
        /* ignore */
      }
    }
    function releaseAwake() {
      try {
        wake && wake.release();
      } catch (e) {
        /* ignore */
      }
      wake = null;
    }
    async function copyText(txt) {
      try {
        await navigator.clipboard.writeText(txt);
        toast("Tersalin!");
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
          toast("Tersalin!");
        } catch (e2) {
          toast("Gagal menyalin");
        }
        ta.remove();
      }
    }

    /* timer */
    function runTimer(limit, startAt, fill, num, onEnd, tick = false) {
      let ended = false;
      let lastSec = -1;
      const tickFn = () => {
        const left = Math.max(0, limit - (performance.now() - startAt) / 1000);
        const f = left / limit;
        if (fill) {
          fill.style.width = (f * 100).toFixed(1) + "%";
          fill.className =
            "timer-fill " + (f > 0.5 ? "" : f > 0.25 ? "warn" : "danger");
        }
        if (num) num.textContent = Math.ceil(left);
        if (tick && left > 0 && left <= 5) {
          const s = Math.ceil(left);
          if (s !== lastSec) {
            lastSec = s;
            sfx.tick();
          }
        }
        if (left <= 0 && !ended) {
          ended = true;
          clearInterval(id);
          onEnd && onEnd();
        }
      };
      const id = setInterval(tickFn, 100);
      tickFn();
      return {
        stop() {
          ended = true;
          clearInterval(id);
        },
      };
    }

    /* -markup soal, jawaban, penjelasan */
    const OPT_COLORS = [
      "c-pink",
      "c-cyan",
      "c-yellow",
      "c-green",
      "c-purple",
      "c-orange",
    ];
    const typeLabel = (q) =>
      q.type === "multi"
        ? "PILIH SEMUA YANG BENAR"
        : q.type === "tf"
          ? "BENAR ATAU SALAH"
          : "PILIH 1 JAWABAN";
    const keyOf = (q, i) => (q.type === "tf" ? (i === 0 ? "O" : "X") : LETTERS[i]);

    /** isi kartu soal (flashcard) */
    function cardInner(q, label) {
      return `<div class="fc-head"><span class="fc-dots"><i></i><i></i><i></i></span><span class="fc-num">${esc(label)}</span><span class="tag">${typeLabel(q)}</span></div>
      <div class="fc-body"><h2 class="q-text">${rich(q.text)}</h2></div>`;
    }
    /** chip jawaban (untuk jawaban benar / jawabanmu) */
    function chips(q, idxs, cls = "") {
      return `<div class="achips">${idxs
        .map(
          (i) =>
            `<span class="achip ${cls}"><span class="k">${keyOf(q, i)}</span>${rich(q.type === "tf" ? q.options[i].toUpperCase() : q.options[i])}</span>`,
        )
        .join("")}</div>`;
    }
    /** kotak penjelasan */
    function explainHTML(text) {
      return text
        ? `<div class="explain"><div class="explain-h"><span class="explain-ico">i</span>PENJELASAN</div><div class="explain-b">${rich(text)}</div></div>`
        : "";
    }

    function optionsMarkup(q, { interactive = false, big = false } = {}) {
      const tf = q.type === "tf";
      const cls = ["options", tf ? "is-tf" : "", big ? "is-big" : ""]
        .join(" ")
        .trim();
      const items = q.options
        .map((o, i) => {
          const key = keyOf(q, i);
          const color = tf
            ? i === 0
              ? "c-green"
              : "c-pink"
            : OPT_COLORS[i % OPT_COLORS.length];
          const tag = interactive ? "button" : "div";
          const attrs = interactive ? 'type="button" data-act="pick"' : "";
          return `<${tag} class="opt ${color}" data-i="${i}" ${attrs}>
        <span class="opt-key${q.type === "multi" ? " is-check" : ""}">${key}</span>
        <span class="opt-text">${rich(tf ? o.toUpperCase() : o)}</span>
        <span class="opt-badge"></span>
      </${tag}>`;
        })
        .join("");
      return `<div class="${cls}">${items}</div>`;
    }
    function markOptions(root, correct, selected) {
      $$(".opt", root).forEach((n) => {
        const i = +n.dataset.i;
        const isC = correct.includes(i),
          isS = selected.includes(i);
        n.classList.remove("selected");
        n.classList.toggle("is-correct", isC);
        n.classList.toggle("is-wrong", isS && !isC);
        n.classList.toggle("is-dim", !isC && !isS);
        if ("disabled" in n) n.disabled = true;
        const b = $(".opt-badge", n);
        if (b) b.textContent = isC ? "BENAR" : isS ? "SALAH" : "";
      });
    }

    /* config & deck */
    const cfg = Object.assign(
      { shuffleQ: true, shuffleO: true, time: 20, timed: true, limit: 0 },
      store.get("fq_cfg", {}),
    );
    const Deck = {
      name: "",
      questions: [],
      issues: { errors: [], warnings: [] },
    };
    const S = { mode: "solo" };

    function loadSavedDeck() {
      const d = store.get("fq_deck", null);
      if (d && Array.isArray(d.questions) && d.questions.length) {
        Deck.name = d.name || "Soal tersimpan";
        Deck.questions = d.questions;
      }
    }
    function renderSaved() {
      const box = $("#saved-deck");
      if (!Deck.questions.length) {
        box.hidden = true;
        return;
      }
      box.hidden = false;
      box.innerHTML = `Soal aktif: <b>${esc(Deck.name)}</b> (${Deck.questions.length} soal) — bisa langsung dipakai, atau import file baru untuk menggantinya.`;
    }

    /* template excel */
    function downloadTemplate() {
      if (typeof XLSX === "undefined") {
        toast("Library Excel belum termuat. Cek internet lalu muat ulang.");
        return;
      }
      const header = [
        "No",
        "Tipe",
        "Soal",
        "Opsi A",
        "Opsi B",
        "Opsi C",
        "Opsi D",
        "Opsi E",
        "Opsi F",
        "Jawaban",
        "Waktu (detik)",
        "Penjelasan",
      ];
      const rows = [
        header,
        [
          1,
          "single",
          "Persamaan dasar akuntansi adalah ...",
          "Aset = Liabilitas + Ekuitas",
          "Aset = Liabilitas - Ekuitas",
          "Ekuitas = Aset + Liabilitas",
          "Liabilitas = Aset + Ekuitas",
          "",
          "",
          "A",
          20,
          "Seluruh aset dibiayai oleh liabilitas (utang) dan ekuitas (modal).",
        ],
        [
          2,
          "multi",
          "Yang termasuk aset lancar adalah (pilih 2):",
          "Kas",
          "Piutang usaha",
          "Gedung kantor",
          "Utang usaha",
          "",
          "",
          "A,B",
          25,
          "Kas dan piutang mudah dicairkan dalam satu siklus operasi. Gedung = aset tetap, utang usaha = liabilitas.",
        ],
        [
          3,
          "tf",
          "Bertambahnya piutang usaha dicatat di sisi kredit.",
          "",
          "",
          "",
          "",
          "",
          "",
          "SALAH",
          15,
          "Piutang adalah aset: bertambah di debit, berkurang di kredit.",
        ],
        [
          4,
          "single",
          "(hapus baris contoh ini lalu isi soalmu sendiri)",
          "Opsi 1",
          "Opsi 2",
          "Opsi 3",
          "Opsi 4",
          "",
          "",
          "C",
          "",
          "",
        ],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [
        { wch: 5 },
        { wch: 9 },
        { wch: 52 },
        { wch: 24 },
        { wch: 24 },
        { wch: 24 },
        { wch: 24 },
        { wch: 14 },
        { wch: 14 },
        { wch: 10 },
        { wch: 13 },
        { wch: 52 },
      ];
      const guide = [
        ["PETUNJUK PENGISIAN"],
        [""],
        ["Kolom", "Cara isi"],
        [
          "Tipe",
          "single = 1 jawaban benar | multi = 2+ jawaban benar | tf = benar/salah. Kalau dikosongkan, tipe ditebak dari kolom Jawaban.",
        ],
        [
          "Soal",
          "Teks pertanyaan atau pernyataan (untuk tf). Boleh pakai Alt+Enter untuk baris baru.",
        ],
        [
          "Opsi A–F",
          "Isi minimal 2 opsi untuk single/multi. Kosongkan untuk tf. Opsi yang kosong dilewati.",
        ],
        [
          "Jawaban",
          "single: satu huruf (B). multi: beberapa huruf dipisah koma (A,C). tf: BENAR atau SALAH.",
        ],
        [
          "Waktu (detik)",
          "Opsional. Kalau kosong, memakai waktu default di pengaturan (5–300 detik).",
        ],
        ["Penjelasan", "Opsional. Muncul setelah soal dijawab."],
        [""],
        [
          "Skor",
          "Jawaban benar = 500–1000 poin tergantung kecepatan. Soal multi harus benar semua (semua opsi benar dipilih, tanpa yang salah).",
        ],
        [
          "Catatan",
          'Sheet pertama ("Soal") yang dibaca. Jangan ubah nama kolom di baris pertama.',
        ],
      ];
      const wg = XLSX.utils.aoa_to_sheet(guide);
      wg["!cols"] = [{ wch: 16 }, { wch: 110 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Soal");
      XLSX.utils.book_append_sheet(wb, wg, "Petunjuk");
      XLSX.writeFile(wb, "template-soal-flashquest.xlsx");
    }

    /* import */
    async function handleFile(file) {
      if (!file) return;
      try {
        if (typeof XLSX === "undefined")
          throw new Error(
            "Library Excel belum termuat. Cek internet lalu muat ulang halaman.",
          );
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sn =
          wb.SheetNames.find((n) => n.toLowerCase() === "soal") ||
          wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], {
          header: 1,
          defval: "",
          raw: false,
        });
        const res = parseRows(rows);
        Deck.issues = { errors: res.errors, warnings: res.warnings };
        if (res.questions.length) {
          Deck.name = file.name.replace(/\.[^.]+$/, "");
          Deck.questions = res.questions;
          store.set("fq_deck", { name: Deck.name, questions: Deck.questions });
          toast(`${res.questions.length} soal berhasil diimpor`);
        } else {
          toast("Tidak ada soal valid di file ini");
        }
      } catch (e) {
        console.error(e);
        Deck.issues = {
          errors: [{ row: 0, msg: e.message || "Gagal membaca file." }],
          warnings: [],
        };
        toast("Gagal membaca file");
      }
      renderDeckInfo();
      renderSaved();
      $("#file-input").value = "";
    }
    function issuesBlock(list, cls, title) {
      if (!list.length) return "";
      const items = list
        .slice(0, 8)
        .map((i) => `<li>${i.row ? `Baris ${i.row}: ` : ""}${esc(i.msg)}</li>`)
        .join("");
      const more =
        list.length > 8 ? `<li>…dan ${list.length - 8} lainnya</li>` : "";
      return `<div class="issues ${cls}"><b>${title} (${list.length})</b><ul>${items}${more}</ul></div>`;
    }
    function renderDeckInfo() {
      const info = $("#deck-info"),
        iss = $("#deck-issues");
      const qs = Deck.questions;
      iss.innerHTML =
        issuesBlock(Deck.issues.errors, "err", "Baris dilewati / error") +
        issuesBlock(Deck.issues.warnings, "warn", "Catatan");
      $("#deck-clear").hidden = !qs.length;
      if (!qs.length) {
        info.innerHTML =
          '<p class="muted mt">Belum ada soal. Import file dulu ya.</p>';
        $("#btn-start").disabled = true;
        return;
      }
      const c = { single: 0, multi: 0, tf: 0 };
      qs.forEach((q) => c[q.type]++);
      info.innerHTML = `<div class="deck-ok"><b>${esc(Deck.name)}</b>
      <div class="chips"><span class="tag bg-white">${qs.length} SOAL</span><span class="tag bg-pink">${c.single} PILIH 1</span><span class="tag bg-cyan">${c.multi} MULTI</span><span class="tag bg-yellow">${c.tf} BENAR/SALAH</span></div></div>`;
      $("#btn-start").disabled = false;
    }
    function openSetup(mode) {
      S.mode = mode;
      $("#setup-title").textContent =
        mode === "solo" ? "MAIN SENDIRI" : "JADI HOST";
      $("#btn-start").textContent =
        mode === "solo" ? "MULAI ▶" : "BUAT RUANGAN ▶";
      $("#row-timed").hidden = mode === "host";
      $("#cfg-shuffleq").checked = cfg.shuffleQ;
      $("#cfg-shuffleo").checked = cfg.shuffleO;
      $("#cfg-timed").checked = cfg.timed;
      $("#cfg-time").value = cfg.time;
      $("#cfg-limit").value = cfg.limit;
      Deck.issues = { errors: [], warnings: [] };
      renderDeckInfo();
      show("screen-setup");
    }
    function bindCfg() {
      const save = () => store.set("fq_cfg", cfg);
      $("#cfg-shuffleq").onchange = (e) => {
        cfg.shuffleQ = e.target.checked;
        save();
      };
      $("#cfg-shuffleo").onchange = (e) => {
        cfg.shuffleO = e.target.checked;
        save();
      };
      $("#cfg-timed").onchange = (e) => {
        cfg.timed = e.target.checked;
        save();
      };
      $("#cfg-time").onchange = (e) => {
        cfg.time = Math.min(
          300,
          Math.max(5, parseInt(e.target.value, 10) || 20),
        );
        e.target.value = cfg.time;
        save();
      };
      $("#cfg-limit").onchange = (e) => {
        cfg.limit = Math.max(0, parseInt(e.target.value, 10) || 0);
        e.target.value = cfg.limit;
        save();
      };
      const fi = $("#file-input"),
        drop = $("#drop");
      fi.onchange = (e) => handleFile(e.target.files[0]);
      ["dragenter", "dragover"].forEach((ev) =>
        drop.addEventListener(ev, (e) => {
          e.preventDefault();
          drop.classList.add("over");
        }),
      );
      ["dragleave", "drop"].forEach((ev) =>
        drop.addEventListener(ev, (e) => {
          e.preventDefault();
          drop.classList.remove("over");
        }),
      );
      drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
    }

  // solo mode
    const R = {
      qs: [],
      i: 0,
      score: 0,
      streak: 0,
      best: 0,
      results: [],
      timed: true,
      locked: false,
      sel: new Set(),
      timer: null,
      active: false,
    };

    function soloStart(list) {
      R.qs = list;
      R.i = 0;
      R.score = 0;
      R.streak = 0;
      R.best = 0;
      R.results = [];
      R.timed = cfg.timed;
      R.active = true;
      show("screen-solo");
      soloShow();
    }
    function soloShow() {
      const q = R.qs[R.i];
      R.locked = false;
      R.sel = new Set();
      R.limit = q.time || cfg.time;
      $("#solo-progress").textContent = `${R.i + 1}/${R.qs.length}`;
      $("#solo-score").textContent = fmt(R.score);
      $("#solo-streak").textContent = R.streak;
      $("#solo-bar-fill").style.width = (R.i / R.qs.length) * 100 + "%";
      const card = $("#solo-card");
      card.classList.remove("flip");
      card.innerHTML = cardInner(q, `SOAL ${R.i + 1} DARI ${R.qs.length}`);
      card.style.animation = "none";
      void card.offsetWidth;
      card.style.animation = "";
      $("#solo-options").innerHTML = optionsMarkup(q, { interactive: true });
      const lock = $("#solo-lock");
      lock.hidden = q.type !== "multi";
      lock.disabled = true;
      $("#solo-feedback").hidden = true;
      $("#solo-timer").hidden = !R.timed;
      if (R.timer) R.timer.stop();
      if (R.timed) {
        R.startAt = performance.now();
        R.timer = runTimer(
          R.limit,
          R.startAt,
          $("#solo-timer-fill"),
          $("#solo-timer-num"),
          () => soloSubmit(true),
          true,
        );
      }
      sfx.start();
      window.scrollTo(0, 0);
    }
    function soloSubmit(timedOut = false) {
      if (R.locked) return;
      R.locked = true;
      if (R.timer) R.timer.stop();
      const q = R.qs[R.i];
      const ms = R.timed
        ? Math.min(performance.now() - R.startAt, R.limit * 1000)
        : 0;
      const sel = [...R.sel].sort((a, b) => a - b);
      const ok = sel.length > 0 && sameSet(sel, q.correct);
      const pts = ok ? (R.timed ? calcPoints(ms, R.limit) : MAX_PTS) : 0;
      R.score += pts;
      R.streak = ok ? R.streak + 1 : 0;
      R.best = Math.max(R.best, R.streak);
      R.results.push({ q, sel, ok, ms, pts });
      $("#solo-score").textContent = fmt(R.score);
      $("#solo-streak").textContent = R.streak;
      $("#solo-lock").hidden = true;
      markOptions($("#solo-options"), q.correct, sel);
      $("#solo-card").classList.add("flip");

      if (ok) {
        sfx.ok();
        if (R.streak >= 3) setTimeout(sfx.streak, 450);
      } else if (!sel.length) sfx.timeout();
      else sfx.bad();

      const last = R.i === R.qs.length - 1;
      const state = ok ? "good" : sel.length ? "bad" : "none";
      const head = ok ? "BENAR!" : sel.length ? "SALAH!" : "WAKTU HABIS!";
      const icon = ok ? "check" : sel.length ? "cross" : "clock";
      const fb = $("#solo-feedback");
      fb.className = "feedback " + state;
      fb.hidden = false;
      fb.innerHTML = `
      <div class="fb-top">
        ${sprite(icon, 5)}
        <div class="fb-title">${head}</div>
        ${ok ? `<span class="pts">+${fmt(pts)}</span>` : ""}
        ${R.streak >= 2 ? `<span class="pts alt">${sprite("flame", 2)} x${R.streak}</span>` : ""}
      </div>
      <div class="fb-body">
        ${!ok && sel.length ? `<div><div class="fb-label">JAWABANMU</div>${chips(q, sel, "bad")}</div>` : ""}
        <div><div class="fb-label">JAWABAN BENAR</div>${chips(q, q.correct)}</div>
        ${explainHTML(q.explain)}
        <button class="btn btn-lg bg-yellow btn-block" data-act="solo-next">${last ? "LIHAT HASIL" : "LANJUT"} ▶</button>
      </div>`;
      fb.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    function soloNext() {
      if (!R.locked) return;
      if (R.i >= R.qs.length - 1) return soloFinish();
      R.i++;
      soloShow();
    }

    /** satu item riwayat jawaban */
    function historyItem(r, n) {
      const q = r.q;
      const status = r.ok ? "BENAR" : r.sel.length ? "SALAH" : "WAKTU HABIS";
      const opts = q.options
        .map((o, i) => {
          const isC = q.correct.includes(i),
            isS = r.sel.includes(i);
          const tag =
            isC && isS
              ? "✔ KUNCI • PILIHANMU"
              : isC
                ? "✔ KUNCI"
                : isS
                  ? "✖ PILIHANMU"
                  : "";
          return `<li class="ho${isC ? " c" : ""}${isS && !isC ? " w" : ""}${isS ? " s" : ""}">
          <span class="ho-key">${keyOf(q, i)}</span>
          <span class="ho-t">${rich(q.type === "tf" ? o.toUpperCase() : o)}</span>
          ${tag ? `<span class="ho-tag">${tag}</span>` : ""}
        </li>`;
        })
        .join("");
      const meta = `${r.pts ? "+" + fmt(r.pts) : "0"} poin${R.timed ? " • " + (r.ms / 1000).toFixed(1) + " dtk" : ""}`;
      return `<article class="hi ${r.ok ? "ok" : "bad"}">
        <header class="hi-top">
          <span class="hi-n">${n}</span>
          <span class="hi-status">${status}</span>
          <span class="tag bg-white">${typeLabel(q)}</span>
          <span class="hi-meta">${meta}</span>
        </header>
        <div class="hi-body">
          <div class="hi-q">${rich(q.text)}</div>
          <ul class="hi-opts">${opts}</ul>
          ${explainHTML(q.explain)}
        </div>
      </article>`;
    }

    function soloFinish() {
      R.active = false;
      if (R.timer) R.timer.stop();
      const n = R.results.length,
        ok = R.results.filter((r) => r.ok).length;
      const acc = n ? Math.round((ok / n) * 100) : 0;
      const timedRes = R.results.filter(() => R.timed);
      const avg = timedRes.length
        ? (
            timedRes.reduce((s, r) => s + r.ms, 0) /
            timedRes.length /
            1000
          ).toFixed(1) + " dtk"
        : "—";
      const wrong = R.results.filter((r) => !r.ok);
      const rating =
        acc >= 90
          ? "LEGENDA!"
          : acc >= 75
            ? "KEREN BANGET!"
            : acc >= 50
              ? "LUMAYAN, GAS LAGI!"
              : "AYO ULANGI LAGI!";
      $("#res-body").innerHTML = `
      <div class="card res-hero">
        <div>${sprite(acc >= 75 ? "trophy" : "star", 8)}</div>
        <div class="res-title">${rating}</div>
        <div class="res-score">${fmt(R.score)}</div>
        <div class="stat-grid">
          <div class="stat"><small>BENAR</small><b>${ok}/${n}</b></div>
          <div class="stat"><small>AKURASI</small><b>${acc}%</b></div>
          <div class="stat"><small>RATA-RATA WAKTU</small><b>${avg}</b></div>
          <div class="stat"><small>STREAK TERBAIK</small><b>${R.best}</b></div>
        </div>
        <div class="btn-row" style="justify-content:center">
          <button class="btn bg-green" data-act="solo-again">MAIN LAGI</button>
          ${wrong.length ? `<button class="btn bg-pink" data-act="solo-redo">ULANGI YANG SALAH (${wrong.length})</button>` : ""}
          <button class="btn bg-cyan" data-act="solo-change">GANTI SOAL</button>
        </div>
      </div>
      <div class="hist-head">
        <h2 class="h2">RIWAYAT SOAL &amp; JAWABAN</h2>
        <div class="seg" role="group" aria-label="Filter riwayat">
          <button class="seg-btn on" data-act="hist-filter" data-f="all">SEMUA ${n}</button>
          <button class="seg-btn" data-act="hist-filter" data-f="ok">BENAR ${ok}</button>
          <button class="seg-btn" data-act="hist-filter" data-f="bad">SALAH ${wrong.length}</button>
        </div>
      </div>
      <div class="hist" id="hist" data-f="all">${R.results.map((r, i) => historyItem(r, i + 1)).join("")}</div>`;
      show("screen-solo-result");
      if (acc >= 75) {
        sfx.win();
        confetti();
      } else if (acc < 50) sfx.lose();
    }

    /* option picking (solo & player) */
    function onPick(btn) {
      const i = +btn.dataset.i;
      const inSolo = !!btn.closest("#screen-solo");
      const st = inSolo ? R : P;
      if (st.locked) return;
      const q = inSolo ? R.qs[R.i] : P.q;
      sfx.click();
      if (q.type === "multi") {
        st.sel.has(i) ? st.sel.delete(i) : st.sel.add(i);
        btn.classList.toggle("selected", st.sel.has(i));
        const lock = inSolo ? $("#solo-lock") : $("#p-lock");
        if (lock) lock.disabled = st.sel.size === 0;
      } else {
        st.sel = new Set([i]);
        btn.classList.add("selected");
        inSolo ? soloSubmit() : playerSubmit();
      }
    }

    // host mode
    const H = {
      peer: null,
      code: "",
      players: new Map(),
      qs: [],
      qi: -1,
      phase: "idle",
      answers: new Map(),
      startAt: 0,
      limit: 0,
      timer: null,
      opened: false,
    };

    const genCode = () => {
      const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let c = "";
      for (let i = 0; i < 5; i++) c += a[Math.floor(Math.random() * a.length)];
      return c;
    };
    const setHost = (html) => {
      $("#host-body").innerHTML = `<div class="host-wrap">${html}</div>`;
      paintSprites($("#host-body"));
    };
    const joinUrl = () =>
      `${location.origin === "null" ? location.href.split("?")[0] : location.origin + location.pathname}?room=${H.code}`;

    function hostCreate() {
      H.qs = buildPlaylist(Deck.questions, cfg);
      H.qi = -1;
      H.phase = "lobby";
      H.players = new Map();
      H.answers = new Map();
      H.opened = false;
      show("screen-host");
      setMusic("menu");
      setHost(
        `<div class="center-box"><span data-sprite="clock" data-px="8"></span><h2>Membuat ruangan…</h2></div>`,
      );
      openRoom(0);
    }
    function openRoom(attempt) {
      if (H.peer) {
        try {
          H.peer.destroy();
        } catch (e) {
          /* ignore */
        }
      }
      if (typeof Peer === "undefined") {
        setHost(
          `<div class="center-box"><span data-sprite="cross" data-px="8"></span><h2>Library multiplayer gagal dimuat</h2><p>Cek koneksi internet lalu muat ulang halaman.</p><button class="btn bg-white" data-act="home">KEMBALI</button></div>`,
        );
        return;
      }
      H.code = genCode();
      const peer = new Peer(PEER_PREFIX + H.code, { debug: 0 });
      H.peer = peer;
      peer.on("open", () => {
        if (H.peer !== peer) return;
        H.opened = true;
        setConnDot("ok");
        keepAwake();
        renderHostLobby();
      });
      peer.on("connection", (conn) => hostAccept(conn));
      peer.on("disconnected", () => {
        if (H.peer !== peer || peer.destroyed) return;
        setConnDot("warn");
        try {
          peer.reconnect();
        } catch (e) {
          /* ignore */
        }
      });
      peer.on("error", (err) => {
        if (H.peer !== peer) return;
        if (err.type === "unavailable-id" && attempt < 6) {
          openRoom(attempt + 1);
          return;
        }
        if (!H.opened) {
          setHost(
            `<div class="center-box"><span data-sprite="cross" data-px="8"></span><h2>Gagal membuat ruangan</h2><p>${esc(err.type || "error")} — pastikan internet aktif.</p><button class="btn bg-green" data-act="h-retry">COBA LAGI</button><button class="btn bg-white" data-act="home">KEMBALI</button></div>`,
          );
          return;
        }
        setConnDot("warn");
        toast("Koneksi ke server sinyal bermasalah: " + err.type);
      });
    }

    function sendTo(p, msg) {
      try {
        if (p.conn && p.conn.open) p.conn.send(msg);
      } catch (e) {
        /* ignore */
      }
    }
    function broadcast(msg) {
      H.players.forEach((p) => sendTo(p, msg));
    }
    const sortedPlayers = () =>
      [...H.players.values()].sort(
        (a, b) =>
          b.score - a.score || a.totalMs - b.totalMs || a.joinedAt - b.joinedAt,
      );
    const rankMap = () => {
      const m = new Map();
      sortedPlayers().forEach((p, i) => m.set(p.pid, i + 1));
      return m;
    };

    function hostAccept(conn) {
      conn.on("data", (m) => hostOnMsg(conn, m));
      conn.on("close", () => hostConnClosed(conn));
      conn.on("error", () => hostConnClosed(conn));
    }
    function hostConnClosed(conn) {
      const p = [...H.players.values()].find((x) => x.conn === conn);
      if (!p) return;
      p.connected = false;
      broadcastLobby();
      updateLobbyPlayers();
      updateHostCounters();
      checkAllAnswered();
    }
    function hostOnMsg(conn, m) {
      if (!m || typeof m !== "object") return;
      if (m.t === "join") return hostJoin(conn, m);
      const p = [...H.players.values()].find((x) => x.conn === conn);
      if (!p) return;
      if (m.t === "answer") hostAnswer(p, m);
    }
    function hostJoin(conn, m) {
      const name = String(m.name || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 16);
      const pid = String(m.pid || "").slice(0, 24);
      const safeSend = (obj) => {
        try {
          conn.send(obj);
        } catch (e) {
          /* ignore */
        }
      };
      if (!name || !pid) {
        safeSend({ t: "err", msg: "Nama tidak valid.", fatal: true });
        return;
      }
      let p = H.players.get(pid);
      if (p) {
        if (p.conn && p.conn !== conn) {
          const old = p.conn;
          p.conn = conn;
          try {
            old.close();
          } catch (e) {
            /* ignore */
          }
        }
        p.conn = conn;
        p.connected = true;
      } else {
        const dup = [...H.players.values()].some(
          (x) => x.name.toLowerCase() === name.toLowerCase(),
        );
        if (dup) {
          safeSend({
            t: "err",
            msg: "Nama itu sudah dipakai. Coba nama lain.",
            fatal: true,
          });
          return;
        }
        p = {
          pid,
          name,
          conn,
          connected: true,
          score: 0,
          totalMs: 0,
          correct: 0,
          streak: 0,
          joinedAt: Date.now(),
          last: null,
        };
        H.players.set(pid, p);
        if (H.phase === "lobby") sfx.join();
      }
      sendTo(p, { t: "joined", name: p.name, phase: H.phase });
      if (H.phase === "question") sendTo(p, qPayload(p));
      else if (H.phase === "final") sendFinal(p);
      else if (H.phase === "reveal")
        sendTo(p, { t: "hold", msg: "Menunggu soal berikutnya…" });
      broadcastLobby();
      updateLobbyPlayers();
      updateHostCounters();
    }
    function broadcastLobby(reset = false) {
      broadcast({
        t: "lobby",
        names: [...H.players.values()]
          .filter((p) => p.connected)
          .map((p) => p.name),
        reset,
      });
    }
    function hostAnswer(p, m) {
      if (H.phase !== "question" || m.qi !== H.qi || H.answers.has(p.pid))
        return;
      const q = H.qs[H.qi];
      const ms = performance.now() - H.startAt;
      if (ms > H.limit * 1000 + 1200) return;
      const sel = [
        ...new Set(
          (Array.isArray(m.sel) ? m.sel : [])
            .map(Number)
            .filter(
              (i) => Number.isInteger(i) && i >= 0 && i < q.options.length,
            ),
        ),
      ].sort((a, b) => a - b);
      if (!sel.length || (q.type !== "multi" && sel.length > 1)) return;
      H.answers.set(p.pid, { sel, ms: Math.min(ms, H.limit * 1000) });
      sendTo(p, { t: "ack", qi: H.qi });
      updateHostCounters();
      checkAllAnswered();
    }
    function checkAllAnswered() {
      if (H.phase !== "question") return;
      const online = [...H.players.values()].filter((p) => p.connected);
      if (online.length && online.every((p) => H.answers.has(p.pid))) {
        const tk = H.qi;
        setTimeout(() => {
          if (H.qi === tk) hostReveal();
        }, 400);
      }
    }
    function qPayload(p) {
      const q = H.qs[H.qi];
      const left = Math.max(
        0,
        H.limit - (performance.now() - H.startAt) / 1000,
      );
      return {
        t: "q",
        qi: H.qi,
        total: H.qs.length,
        type: q.type,
        text: q.text,
        options: q.options,
        limit: H.limit,
        left,
        answered: !!(p && H.answers.has(p.pid)),
      };
    }

    /* host views */
    function renderHostLobby() {
      const url = joinUrl();
      const local = location.protocol === "file:";
      setHost(`
      <div class="host-lobby">
        <div class="card code-card bg-yellow">
          <small class="lbl">KODE RUANGAN</small>
          <div class="code">${H.code}</div>
          <div class="btn-row" style="justify-content:center">
            <button class="btn btn-sm bg-white" data-act="copy-code">SALIN KODE</button>
            <button class="btn btn-sm bg-white" data-act="copy-link">SALIN LINK</button>
          </div>
        </div>
        <div class="card qr-card"><div id="qr"></div><small class="lbl">SCAN UNTUK GABUNG</small></div>
      </div>
      ${local ? `<div class="warn-box"><b>Halaman ini dibuka dari file lokal.</b> HP pemain tidak bisa membuka link-nya. Upload semua file (index.html, style.css, app.js, folder sounds/) ke hosting statis (Netlify Drop, GitHub Pages, dll) lalu buka dari alamat itu.</div>` : ""}
      <div class="card mt">
        <div class="between"><h2 class="h2">PEMAIN <span class="tag" id="h-count">0</span></h2>
          <span class="muted small">Total ${H.qs.length} soal dengan waktu menjawab ${cfg.time} dtk/soal</span></div>
        <div class="player-grid" id="h-players"></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-lg bg-green" id="h-start" data-act="h-next" disabled>MULAI GAME ▶</button>
        <button class="btn bg-pink" data-act="h-close">TUTUP RUANGAN</button>
      </div>`);
      try {
        const qr = $("#qr");
        if (typeof QRCode !== "undefined")
          new QRCode(qr, {
            text: url,
            width: 176,
            height: 176,
            colorDark: "#141414",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M,
          });
        else qr.textContent = "QR tidak tersedia";
      } catch (e) {
        /* ignore */
      }
      updateLobbyPlayers();
    }
    function updateLobbyPlayers() {
      if (H.phase !== "lobby") return;
      const box = $("#h-players");
      if (!box) return;
      const list = [...H.players.values()];
      $("#h-count").textContent = list.filter((p) => p.connected).length;
      box.innerHTML = list.length
        ? list
            .map(
              (p) =>
                `<span class="pchip ${p.connected ? "" : "off"}">${avatar(p.name, 4)}${esc(p.name)}<button data-act="kick" data-pid="${esc(p.pid)}" title="Keluarkan" aria-label="Keluarkan ${esc(p.name)}">✕</button></span>`,
            )
            .join("")
        : '<span class="muted">Menunggu pemain bergabung…</span>';
      const st = $("#h-start");
      if (st) st.disabled = !list.some((p) => p.connected);
    }
    function updateHostCounters() {
      const a = $("#h-answered");
      if (a && H.phase === "question") {
        const online = [...H.players.values()].filter(
          (p) => p.connected,
        ).length;
        a.textContent = `${[...H.answers.keys()].filter((pid) => (H.players.get(pid) || {}).connected).length}/${online}`;
      }
    }

    function hostAdvance() {
      if (
        H.phase === "lobby" &&
        ![...H.players.values()].some((p) => p.connected)
      ) {
        toast("Belum ada pemain");
        return;
      }
      H.qi++;
      if (H.qi >= H.qs.length) {
        hostFinish();
        return;
      }
      const q = H.qs[H.qi];
      H.limit = q.time || cfg.time;
      H.phase = "question";
      H.answers = new Map();
      H.startAt = performance.now();
      setMusic("game");
      sfx.start();
      setHost(`
      <div class="host-top">
        <div class="chip">SOAL ${H.qi + 1}/${H.qs.length}</div>
        <div class="chip bg-cyan">TERJAWAB <b id="h-answered">0/0</b></div>
        <div class="chip">KODE ${H.code}</div>
        <button class="btn btn-sm bg-white" data-act="h-skip">LEWATI WAKTU</button>
      </div>
      <div class="timer"><div class="timer-fill" id="h-fill"></div><span id="h-num"></span></div>
      <div class="flashcard q-big">${cardInner(q, `SOAL ${H.qi + 1} DARI ${H.qs.length}`)}</div>
      ${optionsMarkup(q, { big: true })}`);
      updateHostCounters();
      H.players.forEach((p) => sendTo(p, qPayload(p)));
      const tk = H.qi;
      H.timer = runTimer(
        H.limit,
        H.startAt,
        $("#h-fill"),
        $("#h-num"),
        () =>
          setTimeout(() => {
            if (H.qi === tk) hostReveal();
          }, 700),
        true,
      );
    }

    function hostReveal() {
      if (H.phase !== "question") return;
      if (H.timer) H.timer.stop();
      H.phase = "reveal";
      const q = H.qs[H.qi];
      const before = rankMap();
      const dist = new Array(q.options.length).fill(0);
      H.players.forEach((p) => {
        const a = H.answers.get(p.pid);
        let pts = 0,
          ok = false;
        if (a) {
          ok = sameSet(a.sel, q.correct);
          a.sel.forEach((i) => dist[i]++);
          if (ok) pts = calcPoints(a.ms, H.limit);
          p.totalMs += a.ms;
        } else {
          p.totalMs += H.limit * 1000;
        }
        p.score += pts;
        p.streak = ok ? p.streak + 1 : 0;
        if (ok) p.correct++;
        p.last = { ok, pts, answered: !!a };
      });
      const sorted = sortedPlayers();
      const after = rankMap();
      const trackDelta = H.qi > 0;
      const boardData = sorted.map((p, i) => ({
        name: p.name,
        score: p.score,
        rank: i + 1,
        gain: p.last ? p.last.pts : 0,
        connected: p.connected,
        delta: trackDelta ? before.get(p.pid) - after.get(p.pid) : 0,
      }));
      const top = boardData
        .slice(0, 5)
        .map((b) => ({
          name: b.name,
          score: b.score,
          rank: b.rank,
          delta: b.delta,
        }));
      sorted.forEach((p, i) => {
        const prev = i > 0 ? sorted[i - 1] : null;
        sendTo(p, {
          t: "reveal",
          qi: H.qi,
          correct: q.correct,
          explain: q.explain || "",
          ok: p.last.ok,
          answered: p.last.answered,
          pts: p.last.pts,
          score: p.score,
          rank: i + 1,
          total: sorted.length,
          streak: p.streak,
          delta: trackDelta ? before.get(p.pid) - after.get(p.pid) : 0,
          behind: prev ? prev.score - p.score : 0,
          behindName: prev ? prev.name : "",
          top,
        });
      });
      const last = H.qi >= H.qs.length - 1;
      const answered = H.answers.size;
      const okCount = [...H.players.values()].filter(
        (p) => p.last && p.last.ok,
      ).length;
      sfx.reveal();
      setHost(`
      <div class="host-top">
        <div class="chip">SOAL ${H.qi + 1}/${H.qs.length}</div>
        <div class="chip bg-green">BENAR <b>${okCount}/${H.players.size}</b></div>
        <div class="chip">MENJAWAB <b>${answered}/${H.players.size}</b></div>
      </div>
      <div class="host-split">
        <div>
          <div class="flashcard">${cardInner(q, `SOAL ${H.qi + 1} DARI ${H.qs.length}`)}</div>
          <div id="h-opts">${optionsMarkup(q, { big: false })}</div>
          ${q.explain ? `<div style="margin-top:18px">${explainHTML(q.explain)}</div>` : ""}
        </div>
        <div>
          <h2 class="h2">POSISI TERKINI</h2>
          ${boardHTML(boardData, { limit: 8, deltas: trackDelta, gain: true })}
        </div>
      </div>
      <div class="btn-row"><button class="btn btn-lg bg-green" data-act="h-next">${last ? "HASIL AKHIR" : "NEXT"} ▶</button></div>`);
      const opts = $("#h-opts");
      markOptions(opts, q.correct, []);
      $$(".opt", opts).forEach((n) => {
        const i = +n.dataset.i;
        n.classList.remove("is-dim");
        if (!q.correct.includes(i)) n.classList.add("is-dim");
        const b = $(".opt-badge", n);
        b.innerHTML = `<span class="cnt">${dist[i]}</span>`;
      });
    }

    function boardHTML(
      list,
      { limit = null, deltas = false, gain = false, meName = null } = {},
    ) {
      const shown = limit ? list.slice(0, limit) : list;
      const rows = shown
        .map((b) => {
          const d = b.delta || 0;
          const dcls = d > 0 ? "up" : d < 0 ? "down" : "same";
          const dtxt = d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : "–";
          return `<li class="row ${meName && b.name === meName ? "me" : ""} ${b.connected === false ? "off" : ""}">
        <span class="rank ${b.rank <= 3 ? "r" + b.rank : ""}">${b.rank}</span>
        ${avatar(b.name, 4)}
        <span class="name">${esc(b.name)}</span>
        ${deltas ? `<span class="delta ${dcls}">${dtxt}</span>` : ""}
        <span class="score">${fmt(b.score)}${gain && b.gain ? `<span class="gain">+${fmt(b.gain)}</span>` : ""}</span>
      </li>`;
        })
        .join("");
      const more =
        limit && list.length > limit
          ? `<p class="more">+${list.length - limit} pemain lainnya</p>`
          : "";
      return `<ol class="board">${rows}</ol>${more}`;
    }

    function sendFinal(p) {
      const sorted = sortedPlayers();
      const rank = sorted.findIndex((x) => x.pid === p.pid) + 1;
      sendTo(p, {
        t: "final",
        rank,
        score: p.score,
        correct: p.correct,
        questions: H.qs.length,
        players: sorted.length,
        top: sorted
          .slice(0, 5)
          .map((x, i) => ({ name: x.name, score: x.score, rank: i + 1 })),
      });
    }
    function hostFinish() {
      H.phase = "final";
      if (H.timer) H.timer.stop();
      const sorted = sortedPlayers();
      sorted.forEach((p) => sendFinal(p));
      const data = sorted.map((p, i) => ({
        name: p.name,
        score: p.score,
        rank: i + 1,
        connected: p.connected,
      }));
      const pod = [data[1], data[0], data[2]]
        .map((b, idx) => {
          if (!b) return `<div class="pod"></div>`;
          const place = [2, 1, 3][idx];
          return `<div class="pod p${place}">${avatar(b.name, 6)}<div class="pname">${esc(b.name)}</div><div class="pscore">${fmt(b.score)}</div><div class="block">${place}</div></div>`;
        })
        .join("");
      setHost(`
      <div class="center-box" style="padding-bottom:0"><span data-sprite="trophy" data-px="8"></span><h2>HASIL AKHIR</h2></div>
      <div class="podium">${pod}</div>
      <h2 class="h2">LEADERBOARD</h2>
      ${boardHTML(data)}
      <div class="btn-row">
        <button class="btn bg-cyan" data-act="h-export">⬇ UNDUH HASIL (.XLSX)</button>
        <button class="btn bg-green" data-act="h-rematch">MAIN LAGI (PEMAIN SAMA)</button>
        <button class="btn bg-pink" data-act="h-close">TUTUP RUANGAN</button>
      </div>`);
      setMusic(null);
      sfx.win();
      confetti();
    }
    function hostRematch() {
      H.qs = buildPlaylist(Deck.questions, cfg);
      H.qi = -1;
      H.phase = "lobby";
      H.answers = new Map();
      [...H.players.entries()].forEach(([pid, p]) => {
        if (!p.connected) {
          H.players.delete(pid);
          return;
        }
        Object.assign(p, {
          score: 0,
          totalMs: 0,
          correct: 0,
          streak: 0,
          last: null,
        });
      });
      setMusic("menu");
      renderHostLobby();
      broadcastLobby(true);
    }
    function hostExport() {
      if (typeof XLSX === "undefined") {
        toast("Library Excel belum termuat");
        return;
      }
      const rows = [
        [
          "Peringkat",
          "Nama",
          "Skor",
          "Benar",
          "Jumlah Soal",
          "Total Waktu Jawab (detik)",
        ],
      ];
      sortedPlayers().forEach((p, i) =>
        rows.push([
          i + 1,
          p.name,
          p.score,
          p.correct,
          H.qs.length,
          Math.round(p.totalMs / 100) / 10,
        ]),
      );
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [
        { wch: 10 },
        { wch: 22 },
        { wch: 10 },
        { wch: 8 },
        { wch: 12 },
        { wch: 26 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leaderboard");
      XLSX.writeFile(wb, "hasil-flashquest.xlsx");
    }
    function hostKick(pid) {
      const p = H.players.get(pid);
      if (!p) return;
      sendTo(p, { t: "kicked" });
      const c = p.conn;
      H.players.delete(pid);
      setTimeout(() => {
        try {
          c && c.close();
        } catch (e) {
          /* ignore */
        }
      }, 200);
      broadcastLobby();
      updateLobbyPlayers();
    }
    function hostShutdown() {
      if (H.timer) H.timer.stop();
      broadcast({ t: "end" });
      const peer = H.peer;
      H.peer = null;
      H.phase = "idle";
      H.players = new Map();
      setTimeout(() => {
        try {
          peer && peer.destroy();
        } catch (e) {
          /* ignore */
        }
      }, 300);
      setConnDot(null);
      releaseAwake();
    }

  //  player mode
    const P = {
      peer: null,
      conn: null,
      pid: "",
      name: "",
      code: "",
      phase: "idle",
      q: null,
      qi: -1,
      sel: new Set(),
      locked: false,
      timer: null,
      startAt: 0,
      limit: 0,
      joined: false,
      leaving: false,
      retries: 0,
      active: false,
      last: null,
    };

    const setPlayer = (html) => {
      $("#player-body").innerHTML = html;
      paintSprites($("#player-body"));
      window.scrollTo(0, 0);
    };

    function playerJoin() {
      const code = $("#join-code").value.trim().toUpperCase();
      const name = $("#join-name").value.replace(/\s+/g, " ").trim();
      const msg = $("#join-msg");
      msg.hidden = true;
      if (code.length !== 5) {
        msg.textContent = "Kode ruangan harus 5 karakter.";
        msg.className = "join-msg";
        msg.hidden = false;
        return;
      }
      if (!name) {
        msg.textContent = "Isi nama dulu ya.";
        msg.className = "join-msg";
        msg.hidden = false;
        return;
      }
      if (typeof Peer === "undefined") {
        msg.textContent = "Library multiplayer gagal dimuat. Cek internet.";
        msg.className = "join-msg";
        msg.hidden = false;
        return;
      }
      store.set("fq_name", name);
      P.code = code;
      P.name = name;
      P.leaving = false;
      P.joined = false;
      P.retries = 0;
      P.active = true;
      let pid = store.get("fq_pid_" + code, null);
      if (!pid) {
        pid =
          Math.random().toString(36).slice(2, 10) +
          Date.now().toString(36).slice(-4);
        store.set("fq_pid_" + code, pid);
      }
      P.pid = pid;
      msg.textContent = "Menghubungkan ke ruangan…";
      msg.className = "join-msg ok";
      msg.hidden = false;
      playerConnect();
    }
    function joinFail(text) {
      P.active = false;
      playerCleanup();
      show("screen-join");
      const msg = $("#join-msg");
      msg.textContent = text;
      msg.className = "join-msg";
      msg.hidden = false;
    }
    function playerCleanup() {
      P.leaving = true;
      if (P.timer) P.timer.stop();
      try {
        P.conn && P.conn.close();
      } catch (e) {
        /* ignore */
      }
      try {
        P.peer && P.peer.destroy();
      } catch (e) {
        /* ignore */
      }
      P.peer = null;
      P.conn = null;
      setConnDot(null);
      releaseAwake();
    }
    function playerConnect() {
      try {
        P.conn && P.conn.close();
      } catch (e) {
        /* ignore */
      }
      try {
        P.peer && P.peer.destroy();
      } catch (e) {
        /* ignore */
      }
      P.leaving = false;
      const peer = new Peer({ debug: 0 });
      P.peer = peer;
      peer.on("open", () => {
        if (P.peer === peer) openConn();
      });
      peer.on("disconnected", () => {
        if (P.peer === peer && !peer.destroyed) {
          try {
            peer.reconnect();
          } catch (e) {
            /* ignore */
          }
        }
      });
      peer.on("error", (err) => {
        if (P.peer !== peer || P.leaving) return;
        if (err.type === "peer-unavailable") {
          if (!P.joined)
            joinFail(
              "Ruangan tidak ditemukan. Cek kodenya, atau minta host membuat ulang.",
            );
          else scheduleReconnect();
          return;
        }
        if (!P.joined) {
          joinFail(
            "Gagal terhubung (" +
              (err.type || "error") +
              "). Pastikan internet aktif.",
          );
          return;
        }
        scheduleReconnect();
      });
    }
    function openConn() {
      const conn = P.peer.connect(PEER_PREFIX + P.code, {
        reliable: true,
        serialization: "json",
      });
      P.conn = conn;
      let opened = false;
      conn.on("open", () => {
        opened = true;
        P.retries = 0;
        conn.send({ t: "join", name: P.name, pid: P.pid });
      });
      conn.on("data", onPlayerMsg);
      conn.on("close", () => {
        if (P.conn === conn && !P.leaving && P.joined) scheduleReconnect();
      });
      conn.on("error", () => {
        if (P.conn === conn && !P.leaving && P.joined) scheduleReconnect();
      });
      setTimeout(() => {
        if (!opened && P.conn === conn && !P.leaving) {
          if (!P.joined)
            joinFail(
              "Tidak bisa terhubung ke host. Pastikan kode benar dan host masih membuka ruangan.",
            );
          else scheduleReconnect();
        }
      }, 10000);
    }
    let reconTimer = null;
    function scheduleReconnect() {
      if (P.leaving || reconTimer) return;
      setConnDot("warn");
      if (P.retries++ >= 10) {
        P.active = false;
        playerCleanup();
        setPlayer(
          `<div class="center-box"><span data-sprite="cross" data-px="8"></span><h2>Terputus dari host</h2><p>Koneksi hilang dan tidak berhasil tersambung lagi.</p><button class="btn bg-green" data-act="p-rejoin">COBA GABUNG LAGI</button><button class="btn bg-white" data-act="home">BERANDA</button></div>`,
        );
        return;
      }
      toast("Koneksi terputus, menyambung ulang…", 2000);
      reconTimer = setTimeout(() => {
        reconTimer = null;
        if (!P.leaving) playerConnect();
      }, 1800);
    }
    function sendHost(msg) {
      try {
        if (P.conn && P.conn.open) {
          P.conn.send(msg);
          return true;
        }
      } catch (e) {
        /* ignore */
      }
      return false;
    }

    function onPlayerMsg(m) {
      if (!m || typeof m !== "object") return;
      switch (m.t) {
        case "joined":
          P.joined = true;
          P.name = m.name || P.name;
          setConnDot("ok");
          keepAwake();
          if (P.phase === "idle" || m.phase === "lobby") {
            P.phase = "wait";
            pWait("Kamu masuk!", "Menunggu host memulai game…", []);
            setMusic("menu");
          }
          $("#join-msg").hidden = true;
          show("screen-player");
          break;
        case "err":
          if (m.fatal) joinFail(m.msg || "Gagal bergabung.");
          else toast(m.msg || "Terjadi kesalahan");
          break;
        case "lobby":
          if (m.reset || P.phase === "final" || P.phase === "idle") {
            P.phase = "wait";
            pWait("Ronde baru!", "Menunggu host memulai…", m.names || []);
            setMusic("menu");
          } else if (P.phase === "wait") pLobbyChips(m.names || []);
          break;
        case "q":
          P.phase = "question";
          setMusic("game");
          pShowQuestion(m);
          break;
        case "ack":
          break;
        case "hold":
          if (P.phase === "idle" || P.phase === "wait") {
            P.phase = "wait";
            pWait("Sebentar…", m.msg || "", []);
          }
          break;
        case "reveal":
          P.phase = "reveal";
          pShowReveal(m);
          break;
        case "final":
          P.phase = "final";
          pShowFinal(m);
          break;
        case "kicked":
          P.active = false;
          playerCleanup();
          setPlayer(
            `<div class="center-box"><span data-sprite="cross" data-px="8"></span><h2>Kamu dikeluarkan oleh host</h2><button class="btn bg-white" data-act="home">BERANDA</button></div>`,
          );
          break;
        case "end":
          P.active = false;
          playerCleanup();
          setPlayer(
            `<div class="center-box"><span data-sprite="flame" data-px="8"></span><h2>Host menutup ruangan</h2><p>Makasih sudah main!</p><button class="btn bg-white" data-act="home">BERANDA</button></div>`,
          );
          break;
        default:
          break;
      }
    }

    function pWait(title, sub, names) {
      setPlayer(`<div class="center-box pop"><span data-sprite="clock" data-px="8"></span><h2>${esc(title)}</h2><p>${esc(sub)}</p>
      <div class="chips" id="p-lobby" style="justify-content:center"></div></div>`);
      pLobbyChips(names);
    }
    function pLobbyChips(names) {
      const box = $("#p-lobby");
      if (!box) return;
      box.innerHTML = names
        .map((n) => `<span class="pchip">${avatar(n, 3)}${esc(n)}</span>`)
        .join("");
    }

    function pShowQuestion(m) {
      if (P.timer) P.timer.stop();
      P.q = { type: m.type, text: m.text, options: m.options };
      P.qi = m.qi;
      P.sel = new Set();
      P.locked = false;
      P.limit = m.limit;
      P.startAt = performance.now() - (m.limit - m.left) * 1000;
      setPlayer(`
      <div class="hud"><div class="chip">SOAL ${m.qi + 1}/${m.total}</div><div class="chip bg-cyan">${esc(P.name)}</div></div>
      <div class="timer"><div class="timer-fill" id="p-fill"></div><span id="p-num"></span></div>
      <div class="flashcard">${cardInner(P.q, `SOAL ${m.qi + 1} DARI ${m.total}`)}</div>
      ${optionsMarkup(P.q, { interactive: true })}
      ${m.type === "multi" ? '<button class="btn btn-lg bg-green btn-block mt" id="p-lock" data-act="p-lock" disabled>KUNCI JAWABAN</button>' : ""}
      <div class="p-status" id="p-status" hidden></div>`);
      sfx.start();
      P.timer = runTimer(
        m.limit,
        P.startAt,
        $("#p-fill"),
        $("#p-num"),
        pTimeout,
        true,
      );
      if (m.answered) pLockUI("Jawaban terkunci! Menunggu pemain lain…");
    }
    function pLockUI(text) {
      P.locked = true;
      $$("#player-body .opt").forEach((b) => {
        b.disabled = true;
      });
      const lock = $("#p-lock");
      if (lock) lock.hidden = true;
      const st = $("#p-status");
      if (st) {
        st.textContent = text;
        st.hidden = false;
      }
    }
    function playerSubmit() {
      if (P.locked || !P.sel.size) return;
      if (
        !sendHost({
          t: "answer",
          qi: P.qi,
          sel: [...P.sel].sort((a, b) => a - b),
        })
      ) {
        toast("Koneksi terputus, jawaban belum terkirim. Coba lagi.");
        return;
      }
      pLockUI("Jawaban terkunci! Menunggu pemain lain…");
    }
    function pTimeout() {
      if (P.locked) return;
      if (P.q && P.q.type === "multi" && P.sel.size) playerSubmit();
      else pLockUI("Waktu habis!");
    }

    function pShowReveal(m) {
      if (P.timer) P.timer.stop();
      const q = P.q && P.q.options ? P.q : null;
      const cls = m.ok ? "good" : m.answered ? "bad" : "none";
      const title = m.ok ? "BENAR!" : m.answered ? "SALAH!" : "TIDAK MENJAWAB";
      const icon = m.ok
        ? sprite("check", 10)
        : m.answered
          ? sprite("cross", 10)
          : sprite("clock", 10);
      const dtxt =
        m.delta > 0
          ? `▲ naik ${m.delta}`
          : m.delta < 0
            ? `▼ turun ${-m.delta}`
            : "posisi tetap";
      const topList = (m.top || []).map((t) => ({ ...t, delta: 0 }));
      const meInTop = topList.some((t) => t.name === P.name);
      const board = topList.slice();
      if (!meInTop)
        board.push({ name: P.name, score: m.score, rank: m.rank, delta: 0 });
      setPlayer(`
      <div class="result ${cls} pop">
        ${icon}
        <div class="res-title">${title}</div>
        ${m.ok ? `<div class="gain-big">+${fmt(m.pts)}</div>` : ""}
        ${!m.ok && q ? `<div class="fb-label" style="margin-top:12px">JAWABAN BENAR</div>${chips(q, m.correct || [])}` : ""}
        ${m.streak >= 2 ? `<p style="margin-top:12px"><span data-sprite="flame" data-px="3"></span> Streak <b>${m.streak}</b>!</p>` : ""}
        ${explainHTML(m.explain)}
      </div>
      <div class="pstats">
        <div class="stat"><small>SKOR</small><b>${fmt(m.score)}</b></div>
        <div class="stat"><small>POSISI</small><b>#${m.rank}<small> / ${m.total}</small></b></div>
      </div>
      <p class="muted" style="text-align:center">${dtxt}</p>
      ${m.rank > 1 ? `<div class="gap-msg">Kurang <b>${fmt(m.behind)}</b> poin dari <b>${esc(m.behindName)}</b></div>` : `<div class="gap-msg">Kamu memimpin! 👑</div>`}
      <h2 class="h2 mt">POSISI TERKINI</h2>
      ${boardHTML(board, { meName: P.name })}
      <p class="muted" style="text-align:center;margin-top:18px">Menunggu host menekan NEXT…</p>`);
      paintSprites($("#player-body"));
      if (m.ok) {
        sfx.ok();
        if (m.streak >= 3) setTimeout(sfx.streak, 450);
      } else if (m.answered) sfx.bad();
      else sfx.timeout();
      try {
        navigator.vibrate && navigator.vibrate(m.ok ? [60] : [40, 60, 40]);
      } catch (e) {
        /* ignore */
      }
    }
    function pShowFinal(m) {
      if (P.timer) P.timer.stop();
      const board = (m.top || []).slice();
      if (!board.some((t) => t.name === P.name))
        board.push({ name: P.name, score: m.score, rank: m.rank });
      setPlayer(`
      <div class="center-box pop" style="padding-bottom:0"><span data-sprite="${m.rank <= 3 ? "trophy" : "star"}" data-px="8"></span><h2>GAME SELESAI!</h2>
        <div class="rankbig">#${m.rank}</div><p>dari ${m.players} pemain</p></div>
      <div class="pstats">
        <div class="stat"><small>SKOR AKHIR</small><b>${fmt(m.score)}</b></div>
        <div class="stat"><small>BENAR</small><b>${m.correct}/${m.questions}</b></div>
      </div>
      <h2 class="h2">LEADERBOARD</h2>
      ${boardHTML(
        board.map((b) => ({ ...b, delta: 0 })),
        { meName: P.name },
      )}
      <p class="muted" style="text-align:center;margin-top:18px">Tunggu host kalau mau main lagi.</p>
      <div class="btn-row" style="justify-content:center"><button class="btn bg-white" data-act="home">KELUAR</button></div>`);
      setMusic(null);
      if (m.rank <= 3) {
        sfx.win();
        confetti();
      }
    }

    const inGame = () => R.active || (H.peer && H.phase !== "idle") || P.active;
    async function goHome(force = false) {
      if (!force && inGame()) {
        const ok = await confirmBox(
          "Keluar dari game? Progres sekarang akan hilang.",
        );
        if (!ok) return;
      }
      if (R.timer) R.timer.stop();
      R.active = false;
      if (H.peer) hostShutdown();
      if (P.active || P.peer) {
        P.active = false;
        playerCleanup();
      }
      clearTimeout(reconTimer);
      reconTimer = null;
      P.phase = "idle";
      P.joined = false;
      renderSaved();
      show("screen-home");
    }

    const actions = {
      home: () => goHome(),
      mute: () => {
        muted = !muted;
        store.set("fq_mute", muted);
        renderMute();
        sfx.click();
      },
      music: () => {
        musicOn = !musicOn;
        store.set("fq_music", musicOn);
        renderMute();
        applyMusic();
      },
      template: () => downloadTemplate(),
      "go-solo": () => openSetup("solo"),
      "go-host": () => openSetup("host"),
      "go-join": () => {
        $("#join-name").value = store.get("fq_name", "");
        $("#join-msg").hidden = true;
        show("screen-join");
      },
      "deck-clear": () => {
        Deck.name = "";
        Deck.questions = [];
        Deck.issues = { errors: [], warnings: [] };
        store.del("fq_deck");
        renderDeckInfo();
        renderSaved();
        toast("Soal tersimpan dihapus");
      },
      start: () => {
        if (!Deck.questions.length) return;
        if (S.mode === "solo") soloStart(buildPlaylist(Deck.questions, cfg));
        else hostCreate();
      },
      pick: (btn) => onPick(btn),
      "solo-lock": () => {
        sfx.lock();
        soloSubmit();
      },
      "solo-next": () => soloNext(),
      "solo-quit": () => goHome(),
      "solo-again": () => soloStart(buildPlaylist(Deck.questions, cfg)),
      "solo-redo": () => {
        const wrong = R.results.filter((r) => !r.ok).map((r) => r.q);
        if (!wrong.length) return;
        const list = Core.shuffle(wrong).map((q) =>
          cfg.shuffleO ? Core.shuffleOptions(q) : q,
        );
        soloStart(list);
      },
      "solo-change": () => openSetup("solo"),
      "hist-filter": (btn) => {
        const hist = $("#hist");
        if (!hist) return;
        hist.dataset.f = btn.dataset.f;
        $$(".seg-btn").forEach((b) => b.classList.toggle("on", b === btn));
        sfx.click();
      },
      "p-lock": () => {
        sfx.lock();
        playerSubmit();
      },
      "p-rejoin": () => {
        P.retries = 0;
        P.active = true;
        P.leaving = false;
        playerConnect();
        show("screen-join");
        const m = $("#join-msg");
        m.textContent = "Menghubungkan ulang…";
        m.className = "join-msg ok";
        m.hidden = false;
      },
      "copy-code": () => copyText(H.code),
      "copy-link": () => copyText(joinUrl()),
      "h-next": () => {
        if (H.phase === "lobby" || H.phase === "reveal") hostAdvance();
      },
      "h-skip": () => hostReveal(),
      "h-retry": () => {
        H.opened = false;
        openRoom(0);
      },
      "h-export": () => hostExport(),
      "h-rematch": () => hostRematch(),
      "h-close": async () => {
        if (await confirmBox("Tutup ruangan? Semua pemain akan keluar."))
          goHome(true);
      },
      kick: (btn) => hostKick(btn.dataset.pid),
    };

    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b || b.disabled) return;
      const fn = actions[b.dataset.act];
      if (fn) fn(b);
    });

    $("#join-form").addEventListener("submit", (e) => {
      e.preventDefault();
      playerJoin();
    });
    $("#join-code").addEventListener("input", (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.matches("input,textarea,select")) return;
      const active = $(".screen.active");
      if (!active || active.id !== "screen-solo") return;
      const k = e.key.toUpperCase();
      const q = R.qs[R.i];
      if (!q) return;
      if (!R.locked) {
        let idx = -1;
        if (q.type === "tf") {
          if (["1", "T", "B"].includes(k)) idx = 0;
          else if (["2", "F", "S"].includes(k)) idx = 1;
        } else {
          idx = LETTERS.indexOf(k);
          if (idx < 0 && /^[1-6]$/.test(k)) idx = +k - 1;
        }
        if (idx >= 0) {
          const b = $(`#solo-options .opt[data-i="${idx}"]`);
          if (b) {
            b.click();
            e.preventDefault();
          }
        } else if (
          k === "ENTER" &&
          q.type === "multi" &&
          R.sel.size &&
          e.target.tagName !== "BUTTON"
        ) {
          e.preventDefault();
          sfx.lock();
          soloSubmit();
        }
      } else if (
        (k === "ENTER" || k === " ") &&
        e.target.tagName !== "BUTTON"
      ) {
        e.preventDefault();
        soloNext();
      }
    });

    document.addEventListener("visibilitychange", () => {
      applyMusic();
      if (
        document.visibilityState === "visible" &&
        (H.phase !== "idle" || P.active)
      )
        keepAwake();
    });
    window.addEventListener("beforeunload", (e) => {
      if (inGame()) {
        e.preventDefault();
        e.returnValue = "";
      }
    });

    // init
    function init() {
      paintSprites();
      renderMute();
      bindCfg();
      loadSavedDeck();
      renderSaved();
      setMusic("menu");
      const room = (new URLSearchParams(location.search).get("room") || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 5);
      if (room) {
        $("#join-code").value = room;
        $("#join-name").value = store.get("fq_name", "");
        show("screen-join");
        setTimeout(() => $("#join-name").focus(), 150);
      }
    }
    init();
  })();
