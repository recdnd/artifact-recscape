// player.js -- 兩站共用播放器(dfr.rec.ooo / recscape.rec.ooo). 正本在 site-src/, tools/site.py 複製進 sites/<brand>/.
// 頁面 <body data-brand="dfr|recscape" data-root="./">; 曲目來自 data.js 的 window.TRACKS.
(() => {
  const B = document.body.dataset.brand;
  const ROOT = document.body.dataset.root || './';
  const ALL = window.TRACKS || [];
  const LIST = ALL.filter(t => t.brand === B);
  const lang = (navigator.language || 'en').slice(0, 2);
  const L = lang === 'ja' ? 'ja' : lang === 'zh' ? 'zh' : 'en';
  const $ = (s, el = document) => el.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('recscape.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('recscape.' + k, JSON.stringify(v)); } catch {} },
  };
  const hms = s => {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
  };
  const name = t => t.names[L] || t.names.en || t.id;
  // 狀態字跟著介面語言走(跟 tools/ambmeta.py 的 STATE 同一份字)
  const STATE = { night: { en: 'Night', ja: '夜', zh: '夜' }, rain: { en: 'Rain', ja: '雨', zh: '雨' },
    wind: { en: 'Wind', ja: '風', zh: '風' }, empty: { en: 'Empty', ja: '無人', zh: '空' }, torch: { en: 'Torchlit', ja: '松明', zh: '火把' } };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- 清單 ----------
  const list = $('#list');
  for (const t of LIST) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = t.id;
    const st = t.state.length ? ' ' + t.state.map(x => (STATE[x] || {})[L] || x).join(L === 'en' ? ' ' : '') : '';
    el.innerHTML =
      (t.cover ? `<img src="${ROOT}${t.cover}" alt="">` : '<div class="nocov"></div>') +
      `<div class="meta">` +
      (t.floor ? `<span class="fl">${t.floor}</span>` : '') +
      `<span class="nm">${esc(name(t))}${esc(st)}</span>` +
      `<span class="du">${hms(t.seconds)}</span></div>` +
      `<button class="info" aria-label="sounds and sources" title="sounds and sources">📜</button>`;
    el.addEventListener('click', e => { if (!e.target.closest('.info')) play(t); });
    list.appendChild(el);
  }

  // ---------- 音層 / 來源 hover 窗(跟著游標, 離開就關) ----------
  const tip = $('#tip');
  list.addEventListener('mousemove', e => {
    const b = e.target.closest('.info');
    if (!b) { tip.hidden = true; return; }
    const t = LIST.find(x => x.id === b.parentElement.dataset.id);
    if (tip.dataset.id !== t.id) {
      tip.dataset.id = t.id;
      tip.innerHTML = '<b>' + t.layers.map(esc).join(' / ') + '</b>' + t.credits.map(c =>
        `<div>${esc(c.title)} - ${esc(c.author)}${c.license === 'own' ? '' : ' (CC0)'}</div>`).join('');
    }
    tip.hidden = false;
    const x = Math.min(e.clientX + 12, innerWidth - tip.offsetWidth - 4);
    const y = Math.min(e.clientY + 12, innerHeight - tip.offsetHeight - 4);
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  });
  list.addEventListener('mouseleave', () => { tip.hidden = true; });

  // ---------- 播放 ----------
  const au = new Audio();
  au.preload = 'none';
  let cur = null;
  let loop = store.get('loop', true);
  let timerMin = 0, timerEnd = 0;
  const bar = $('#bar'), bPlay = $('#play'), bLoop = $('#loop'), bTimer = $('#timer');
  const prog = $('#prog'), progFill = $('#prog i'), vol = $('#vol'), volFill = $('#vol i');
  const now = $('#now'), time = $('#time'), tleft = $('#tleft');
  au.volume = store.get('vol', 0.8);

  function play(t) {
    if (cur && cur.id === t.id) { toggle(); return; }
    cur = t;
    au.src = ROOT + t.audio;
    au.loop = loop;
    au.play().catch(() => {});
    now.textContent = (t.floor ? t.floor + '  ' : '') + name(t);
    bar.hidden = false;
    store.set('last.' + B, t.id);
    for (const c of list.children) c.classList.toggle('on', c.dataset.id === t.id);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title[L] || t.title.en,
        artist: document.title,
        artwork: t.cover ? [{ src: ROOT + t.cover, sizes: '600x600', type: 'image/jpeg' }] : [],
      });
    }
  }
  function toggle() { if (!cur) return; au.paused ? au.play().catch(() => {}) : au.pause(); }
  const face = () => { bPlay.textContent = au.paused ? '▶️' : '⏸️'; };
  au.addEventListener('play', face);
  au.addEventListener('pause', face);
  au.addEventListener('ended', () => {        // 只有關掉 loop 才會走到這: 接下一支
    const i = LIST.findIndex(x => x.id === cur.id);
    if (LIST.length > 1) play(LIST[(i + 1) % LIST.length]);
  });
  au.addEventListener('timeupdate', () => {
    const d = au.duration || (cur && cur.seconds) || 1;
    progFill.style.width = (au.currentTime / d * 100) + '%';
    time.textContent = hms(au.currentTime) + ' / ' + hms(d);
    if (timerEnd) {
      const left = timerEnd - Date.now();
      if (left <= 0) { au.pause(); setTimer(0); }
      else tleft.textContent = Math.ceil(left / 60000) + 'm';
    }
  });
  bPlay.addEventListener('click', toggle);

  const loopFace = () => { bLoop.textContent = loop ? '🔂' : '⏭️'; bLoop.title = loop ? 'repeat this one' : 'continue to next'; };
  bLoop.addEventListener('click', () => { loop = !loop; au.loop = loop; store.set('loop', loop); loopFace(); });
  loopFace();

  // 睡眠計時: 關 -> 30 -> 60 -> 90 -> 關
  function setTimer(m) {
    timerMin = m;
    timerEnd = m ? Date.now() + m * 60000 : 0;
    bTimer.textContent = m ? '⏲️' : '⏱️';
    bTimer.title = m ? 'stop in ' + m + ' min' : 'sleep timer off';
    tleft.textContent = m ? m + 'm' : '';
  }
  bTimer.addEventListener('click', () => setTimer({ 0: 30, 30: 60, 60: 90, 90: 0 }[timerMin]));
  setTimer(0);

  // 細條: 點哪裡跳哪裡(進度 / 音量)
  const frac = (el, e) => Math.min(1, Math.max(0, (e.clientX - el.getBoundingClientRect().left) / el.offsetWidth));
  prog.addEventListener('click', e => { if (au.duration) au.currentTime = frac(prog, e) * au.duration; });
  const setVol = v => { au.volume = v; volFill.style.width = v * 100 + '%'; store.set('vol', v); };
  let dragging = false;
  vol.addEventListener('mousedown', e => { dragging = true; setVol(frac(vol, e)); });
  addEventListener('mousemove', e => { if (dragging) setVol(frac(vol, e)); });
  addEventListener('mouseup', () => { dragging = false; });
  setVol(au.volume);

  addEventListener('keydown', e => {
    if (e.code === 'Space' && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); toggle(); }
  });
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => au.play());
    navigator.mediaSession.setActionHandler('pause', () => au.pause());
  }
})();
