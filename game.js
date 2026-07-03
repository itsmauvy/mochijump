(() => {
  'use strict';

  const W = 400, H = 600;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // 캔버스는 폰트 로딩을 자동 트리거하지 않으므로 점수판에 쓰는 글리프를 미리 로드
  if (document.fonts && document.fonts.load) {
    document.fonts.load("10px 'Jua'", '최고점수');
    document.fonts.load("800 21px 'Baloo 2'", '0123456789');
  }

  function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    // 실제 표시 크기(css px)에 맞춰 백킹 해상도를 잡아 선명하게 렌더
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || W;
    const cssH = rect.height || H;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // 논리 좌표계(400x600)를 캔버스 전체로 스케일
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }
  setupCanvas();
  window.addEventListener('resize', setupCanvas);

  // ---- 상수 ----
  const GRAVITY = 1800;
  const JUMP_VY = -760;       // 스페이스 점프 세기
  const BOOST_VY = -1250;     // 부스터 발판 점프 세기
  const MOVE_ACCEL = 2600;
  const MOVE_MAX = 340;
  const FRICTION = 8;
  const COYOTE_TIME = 0.10;   // 발판을 벗어난 직후에도 잠깐 점프 허용
  const JUMP_BUFFER = 0.12;   // 착지 직전 스페이스를 미리 눌러도 인정
  const DROP_TIME = 0.22;     // ↓ 로 발판을 뚫고 내려가는 시간
  const FASTFALL = 2200;      // ↓ 를 누른 채 공중이면 빠르게 하강
  const CAMERA_LINE = H * 0.45;
  const BEST_KEY = 'mochijump-best';

  // ---- 이미지 로딩 (img/ 폴더) ----
  const IMG = {};
  const SRC = {
    idle:  'img/base mochi.png',
    jump:  'img/base mochi jump.png',
    fall:  'img/mochi fall.png',
    land:  'img/mochi land.png',
    stage: 'img/stage.png',
    boost: 'img/booster stage.png',
    honey: 'img/invulnerable gold mochi.png',
    shop:  'img/monster(mochi shop).png',
    logo:  'img/game logo.png',
    bg:    'img/game loading bg.jpg',
    loadmochi: 'img/game loading mochi jump.png',
    shopui: 'img/shop UI.png',
    skin_strawberry: 'img/strawberry mochi.png',
    skin_strawberry_jump: 'img/strawberry jump.png',
    skin_strawberry_fall: 'img/strawberry fall.png',
    skin_strawberry_land: 'img/strawberry land.png',
    skin_matcha:     'img/matcha.png',
    skin_matcha_jump: 'img/matcha jump.png',
    skin_matcha_fall: 'img/matcha fall.png',
    skin_matcha_land: 'img/matcha land.png',
    skin_injeolmi:   'img/injeolmi.png',
    skin_injeolmi_jump: 'img/injeolmi jump.png',
    skin_injeolmi_fall: 'img/injeolmi fall.png',
    skin_injeolmi_land: 'img/injeolmi land.png',
    skin_sesame:     'img/black sesame.png',
    skin_sesame_jump: 'img/black sesame jump.png',
    skin_sesame_fall: 'img/black sesame fall.png',
    skin_sesame_land: 'img/black sesame land.png',
    skin_tangerine:  'img/tangerine.png',
    skin_tangerine_jump: 'img/tangerine jump.png',
    skin_tangerine_fall: 'img/tangerine fall.png',
    skin_tangerine_land: 'img/tangerine land.png',
    home: 'img/HOME BUTTON.png',
    coin: 'img/mochi coin.png',
    settings: 'img/settings button.png',
    replay: 'img/replay button.png',
    play:    'img/game play button.png',
    shopbtn: 'img/shop button.png',
    scoreboard: 'img/scoreboard ui.png',
    bestboard: 'img/highest score.png',
    failcry: 'img/mochi fail cry.png',
    bg1: 'img/bg1.png', bg2: 'img/bg2.png', bg3: 'img/bg3.png',
    bg4: 'img/bg4.png', bg5: 'img/bg5.png', bg6: 'img/bg6.png',
    setgear: 'img/settings icon.png',
    icoMusic: 'img/bg music icoin.png',
    icoStar: 'img/fx sound effect icon.png',
    icoReset: 'img/record reset icon.png',
    tglKnob: 'img/toggle icon.png'
  };
  // 페이지 로드 시각을 버전으로 붙여 캐시 무효화 (이미지 수정 후 새로고침만 하면 반영)
  const IMGVER = Date.now();
  function u(key) { return encodeURI(SRC[key]) + '?v=' + IMGVER; }
  let imgLoaded = 0;
  const imgTotal = Object.keys(SRC).length;
  let onAllImages = null;
  for (const k in SRC) {
    const im = new Image();
    const done = () => { imgLoaded++; if (imgLoaded >= imgTotal && onAllImages) onAllImages(); };
    im.onload = done;
    im.onerror = done; // 실패해도 진행 (폴백 렌더링)
    im.src = u(k);
    IMG[k] = im;
  }
  function ready(im) { return im && im.complete && im.naturalWidth > 0; }

  // ---- 오디오 (Web Audio: 효과음·배경음악 모두 오실레이터 합성) ----
  let audioCtx = null, sfxGain = null, bgmGain = null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      audioCtx = new AC();                 // 생성 시엔 suspended, 사용자 입력 후 resume
      sfxGain = audioCtx.createGain(); sfxGain.gain.value = 1.0; sfxGain.connect(audioCtx.destination);
      bgmGain = audioCtx.createGain(); bgmGain.gain.value = 0.42; bgmGain.connect(audioCtx.destination);
    }
  } catch (e) { audioCtx = null; }
  // 사운드 on/off (설정에서 토글, localStorage 유지)
  let sfxOn = localStorage.getItem('mochijump-sfx') !== '0';
  let bgmOn = localStorage.getItem('mochijump-bgm') !== '0';
  function resumeAudio() { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }
  function playJump() {   // 점프: 위로 통통 튀는 상승 음
    if (!audioCtx || !sfxOn) return; resumeAudio();
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(360, t0);
    osc.frequency.exponentialRampToValueAtTime(780, t0 + 0.12);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.5, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    osc.connect(g).connect(sfxGain);
    osc.start(t0); osc.stop(t0 + 0.22);
  }
  // 합성 효과음 (오실레이터) — 별도 음원 파일 없이 생성
  function tone(freq, startAt, dur, type, peak) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + startAt;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(sfxGain);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  function playPickup() {   // 아이템 획득: 밝게 상승하는 반짝임
    if (!audioCtx || !sfxOn) return; resumeAudio();
    tone(880, 0, 0.12, 'triangle', 0.30);
    tone(1320, 0.07, 0.13, 'triangle', 0.28);
    tone(1760, 0.15, 0.16, 'sine', 0.22);
  }
  function playLand() {     // 착지: 부드럽고 짧은 통통
    if (!audioCtx || !sfxOn) return; resumeAudio();
    tone(200, 0, 0.09, 'sine', 0.22);
    tone(130, 0.015, 0.11, 'sine', 0.16);
  }
  function playGameOver() { // 게임오버: 아래로 떨어지는 3음
    if (!audioCtx || !sfxOn) return; resumeAudio();
    tone(523, 0, 0.20, 'triangle', 0.30);
    tone(392, 0.17, 0.22, 'triangle', 0.30);
    tone(262, 0.36, 0.45, 'triangle', 0.30);
  }

  // ---- 배경음악 (합성 루프, C장조 펜타토닉의 몽글한 멜로디 + 베이스) ----
  const NOTE = {
    'F2': 87.31, 'G2': 98.00, 'A2': 110.00, 'C3': 130.81,
    'A4': 440.00, 'C5': 523.25, 'D5': 587.33, 'E5': 659.25,
    'G5': 783.99, 'A5': 880.00, 'C6': 1046.50, 0: 0
  };
  const BGM_BPM = 118, BEAT = 60 / BGM_BPM, STEP = BEAT / 2; // 8분음표 스텝
  const MELODY = [
    'E5','G5','A5','G5', 'E5','D5','C5', 0,
    'D5','E5','G5','E5', 'D5','C5','D5', 0,
    'E5','G5','A5','C6', 'A5','G5','E5', 0,
    'D5','E5','D5','C5', 'A4','C5','D5', 0
  ];
  const BASS = ['C3','C3','A2','A2','F2','F2','G2','G2']; // 4스텝마다 (C-Am-F-G)
  let bgmStep = 0, bgmNextTime = 0;
  function bgmNote(freq, t, dur, type, peak) {
    if (!freq || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(bgmGain);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function scheduleBgm() {   // 게임 루프에서 매 프레임 호출 (앞으로 여유분만 예약)
    if (!audioCtx || !bgmOn || audioCtx.state !== 'running') return;
    if (bgmNextTime < audioCtx.currentTime) bgmNextTime = audioCtx.currentTime + 0.05; // 백그라운드 복귀 시 재동기화
    while (bgmNextTime < audioCtx.currentTime + 0.2) {
      const t = bgmNextTime;
      const mel = MELODY[bgmStep % MELODY.length];
      if (mel) bgmNote(NOTE[mel], t, STEP * 0.95, 'triangle', 0.13);
      if (bgmStep % 4 === 0) {
        const b = BASS[Math.floor(bgmStep / 4) % BASS.length];
        if (b) bgmNote(NOTE[b], t, BEAT * 1.7, 'sine', 0.15);
      }
      bgmStep++;
      bgmNextTime += STEP;
    }
  }
  function setBgm(on) { bgmOn = on; localStorage.setItem('mochijump-bgm', on ? '1' : '0'); if (on && audioCtx) { bgmNextTime = audioCtx.currentTime + 0.05; resumeAudio(); } }
  function setSfx(on) { sfxOn = on; localStorage.setItem('mochijump-sfx', on ? '1' : '0'); }
  // 브라우저 자동재생 정책: 어떤 입력(버튼 클릭 포함)에서든 오디오 활성화
  ['pointerdown', 'click', 'keydown', 'touchstart'].forEach(ev =>
    document.addEventListener(ev, resumeAudio, { passive: true }));

  // ---- 높이별 배경 테마 (낮 → 노을 → 밤 → 우주) ----
  const THEMES = [
    { thresh: 0,     top: [253,232,242], mid: [238,240,255], bot: [224,244,255], star: 0    },
    { thresh: 2500,  top: [255,167,140], mid: [255,205,160], bot: [255,236,190], star: 0.1  },
    { thresh: 6000,  top: [38,42,88],    mid: [72,70,122],   bot: [126,102,152], star: 1    },
    { thresh: 10000, top: [8,6,26],      mid: [28,18,58],    bot: [58,38,88],    star: 1    }
  ];
  const BLEND = 1000;

  // ---- 상태 ----
  const INVULN_TIME = 5;      // 무적 지속 시간(초)
  let state = 'loading'; // loading | ready | playing | gameover
  let player, platforms, monsters, items, totalScroll, score, best, isNewBest, deathBy;
  let keys = { left: false, right: false, down: false };
  let coyote = 0, jumpBuffer = 0;
  let lastTime = 0, nowSec = 0;
  let clouds = [], stars = [];
  let loadProgress = 0;
  const LOAD_DUR = 2.4; // 로딩바 채우는 시간(초)

  best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;

  // ---- 스킨 & 코인 ----
  const SKIN_KEY = 'mochijump-skin';
  const COIN_KEY = 'mochijump-coins';
  const OWNED_KEY = 'mochijump-owned';
  const SKINS = [
    { id: 'default',    name: '기본 모찌 스킨', key: null,              price: 0 },
    { id: 'strawberry', name: '딸기 모찌 스킨', key: 'skin_strawberry', price: 1000,
      frames: { idle: 'skin_strawberry', jump: 'skin_strawberry_jump', fall: 'skin_strawberry_fall', land: 'skin_strawberry_land' } },
    { id: 'matcha',     name: '말차 모찌 스킨', key: 'skin_matcha',     price: 1000,
      frames: { idle: 'skin_matcha', jump: 'skin_matcha_jump', fall: 'skin_matcha_fall', land: 'skin_matcha_land' } },
    { id: 'injeolmi',   name: '인절미 모찌 스킨', key: 'skin_injeolmi', price: 1000,
      frames: { idle: 'skin_injeolmi', jump: 'skin_injeolmi_jump', fall: 'skin_injeolmi_fall', land: 'skin_injeolmi_land' } },
    { id: 'sesame',     name: '흑임자 모찌 스킨', key: 'skin_sesame',   price: 1000,
      frames: { idle: 'skin_sesame', jump: 'skin_sesame_jump', fall: 'skin_sesame_fall', land: 'skin_sesame_land' } },
    { id: 'tangerine',  name: '귤 모찌 스킨', key: 'skin_tangerine',   price: 1000,
      frames: { idle: 'skin_tangerine', jump: 'skin_tangerine_jump', fall: 'skin_tangerine_fall', land: 'skin_tangerine_land' } }
  ];
  let equippedSkin = localStorage.getItem(SKIN_KEY) || 'default';
  let coins = parseInt(localStorage.getItem(COIN_KEY) || '0', 10) || 0;
  let ownedSkins;
  try { ownedSkins = new Set(JSON.parse(localStorage.getItem(OWNED_KEY) || '["default"]')); }
  catch (e) { ownedSkins = new Set(['default']); }
  ownedSkins.add('default');
  function saveShop() {
    localStorage.setItem(COIN_KEY, String(coins));
    localStorage.setItem(OWNED_KEY, JSON.stringify([...ownedSkins]));
    localStorage.setItem(SKIN_KEY, equippedSkin);
  }
  function currentSkinImage() {
    const s = SKINS.find(x => x.id === equippedSkin);
    if (!s || !s.key) return null;         // 기본 모찌는 4프레임 세트 사용
    // 프레임 세트가 있는 스킨은 기본 모찌처럼 상태별 스프라이트 사용
    if (s.frames && player) {
      let k = s.frames.idle;
      if (state === 'gameover') k = s.frames.fall;
      else if (player.landTimer > 0) k = s.frames.land;
      else if (!player.onGround && player.vy < 0) k = s.frames.jump;
      else if (!player.onGround && player.vy > 0) k = s.frames.fall;
      const fim = IMG[k];
      if (ready(fim)) return fim;
    }
    const im = IMG[s.key];
    return ready(im) ? im : null;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mixC(c1, c2, t) { return [lerp(c1[0],c2[0],t), lerp(c1[1],c2[1],t), lerp(c1[2],c2[2],t)]; }
  function rgb(c) { return `rgb(${c[0]|0},${c[1]|0},${c[2]|0})`; }

  function themeMix() {
    let top = THEMES[0].top, mid = THEMES[0].mid, bot = THEMES[0].bot, star = THEMES[0].star;
    for (let i = 1; i < THEMES.length; i++) {
      const w = clamp((totalScroll - THEMES[i].thresh) / BLEND, 0, 1);
      if (w <= 0) break;
      top = mixC(top, THEMES[i].top, w);
      mid = mixC(mid, THEMES[i].mid, w);
      bot = mixC(bot, THEMES[i].bot, w);
      star = lerp(star, THEMES[i].star, w);
    }
    const lum = 0.299*top[0] + 0.587*top[1] + 0.114*top[2];
    return { top, mid, bot, star, dark: lum < 140 };
  }

  // ---- 발판 확률 ----
  function platformWidth() { return Math.max(54, 72 - totalScroll / 900); }
  function movingChance()  { return Math.min(0.40, totalScroll / 9000); }
  function boostChance()   { return totalScroll < 300 ? 0 : 0.10; }
  function breakChance()   { return totalScroll < 800 ? 0 : Math.min(0.35, 0.12 + totalScroll / 20000); }
  function monsterChance() { return totalScroll < 1200 ? 0 : Math.min(0.2, 0.06 + (totalScroll - 1200) / 30000); }
  function itemChance()    { return 0.05; }

  function makePlatform(y, forceType) {
    const w = platformWidth();
    let type = forceType;
    if (!type) {
      const r = Math.random();
      if (r < boostChance()) type = 'boost';
      else if (r < boostChance() + movingChance()) type = 'moving';
      else type = 'static';
    }
    return {
      x: rand(0, W - w), y, w, h: 14, type,
      dir: Math.random() < 0.5 ? -1 : 1,
      speed: rand(55, 95) + Math.min(60, totalScroll / 400),
      broken: false, fallVy: 0, dx: 0
    };
  }

  function makeMonster(y) {
    const patrol = totalScroll > 3000 && Math.random() < 0.6;
    return {
      x: rand(50, W - 50), y,
      vx: patrol ? rand(50, 100) * (Math.random() < 0.5 ? -1 : 1) : 0,
      bob: 0, phase: rand(0, Math.PI * 2),
      hue: Math.random() < 0.5 ? 0 : 1
    };
  }

  function spawnAbove() {
    let topY = Math.min(...platforms.map(p => p.y));
    while (topY > -40) {
      const gap = rand(58, 88) + Math.min(38, totalScroll / 500);
      topY -= gap;
      const mp = makePlatform(topY); // 메인 경로 (항상 밟을 수 있음)
      platforms.push(mp);
      if (Math.random() < itemChance()) {
        items.push({ x: clamp(mp.x + mp.w / 2, 28, W - 28), y: topY - rand(34, 46), phase: rand(0, Math.PI * 2), taken: false });
      }
      if (Math.random() < breakChance()) {
        platforms.push(makePlatform(topY + gap * rand(0.35, 0.6), 'break'));
      }
      if (Math.random() < monsterChance()) {
        monsters.push(makeMonster(topY - rand(30, 55)));
      }
    }
  }

  // ---- 초기화 ----
  function reset() {
    totalScroll = 0;
    score = 0;
    isNewBest = false;
    deathBy = '';
    monsters = [];
    items = [];
    platforms = [
      { x: W/2 - 60, y: H - 60, w: 120, h: 14, type: 'static', dir: 1, speed: 0, broken: false, fallVy: 0, dx: 0 }
    ];
    let y = H - 60;
    while (y > -40) {
      y -= rand(58, 85);
      platforms.push(makePlatform(y));
    }
    player = {
      x: W / 2, y: H - 60 - 19,
      vx: 0, vy: 0,
      w: 46, h: 38,
      landTimer: 0,
      onGround: true,
      groundPlatform: platforms[0],
      invuln: 0,
      dropTimer: 0,
      dropThrough: null
    };
    coyote = 0; jumpBuffer = 0;
    clouds = [];
    for (let i = 0; i < 6; i++) clouds.push({ x: rand(0, W), y: rand(0, H), s: rand(0.6, 1.3) });
    stars = [];
    for (let i = 0; i < 60; i++) stars.push({ x: rand(0, W), y: rand(0, H), r: rand(0.6, 1.8), tw: rand(0, Math.PI * 2) });
  }
  reset();

  // ---- 입력 ----
  window.addEventListener('keydown', (e) => {
    resumeAudio(); // 브라우저 자동재생 정책: 첫 사용자 입력에 오디오 활성화
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (state === 'ready' || state === 'gameover') startGame();
      else if (state === 'playing') jumpBuffer = JUMP_BUFFER; // 점프 예약 (버퍼)
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      keys.down = true;
      // 발판 위에 있으면 뚫고 아래로 내려감
      if (state === 'playing' && player.onGround) {
        player.dropThrough = player.groundPlatform;   // 이 발판만 통과 (아래 발판은 정상 착지)
        player.onGround = false;
        player.groundPlatform = null;
        player.dropTimer = DROP_TIME;
        player.vy = Math.max(player.vy, 180);
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') keys.down = false;
  });
  // ---- 모바일 제스처: 좌/우 탭 = 이동+점프, 아래로 스와이프 = 하강 ----
  const SWIPE_DOWN_DIST = 28; // 하강 제스처 인식 거리(논리 px)
  let touchId = null, touchStartY = 0, touchSwiped = false;
  function canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width * W,
      y: (e.clientY - rect.top) / rect.height * H
    };
  }
  canvas.addEventListener('pointerdown', (e) => {
    resumeAudio(); // 첫 사용자 입력에 오디오 활성화
    if (state !== 'playing') { startGame(); return; }
    if (touchId !== null) return; // 첫 손가락만 사용
    touchId = e.pointerId;
    touchSwiped = false;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {} // 캔버스 밖에서 떼도 pointerup 수신
    const p = canvasPos(e);
    touchStartY = p.y;
    if (p.x < W / 2) { keys.left = true; keys.right = false; }
    else { keys.right = true; keys.left = false; }
    jumpBuffer = JUMP_BUFFER;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== touchId || state !== 'playing' || touchSwiped) return;
    const p = canvasPos(e);
    if (p.y - touchStartY > SWIPE_DOWN_DIST) {
      touchSwiped = true;
      jumpBuffer = 0;      // 예약된 점프 취소
      keys.down = true;    // 빠른 하강 (키보드 ↓ 와 동일)
      if (player.onGround) { // 발판 위면 뚫고 내려감
        player.dropThrough = player.groundPlatform;   // 이 발판만 통과
        player.onGround = false;
        player.groundPlatform = null;
        player.dropTimer = DROP_TIME;
        player.vy = Math.max(player.vy, 180);
      }
    }
  });
  function touchRelease(e) {
    if (e.pointerId !== touchId) return;
    touchId = null;
    keys.left = false; keys.right = false; keys.down = false;
  }
  canvas.addEventListener('pointerup', touchRelease);
  canvas.addEventListener('pointercancel', touchRelease);

  function startGame() { reset(); state = 'playing'; updateOverlay(); }

  function endGame(cause) {
    state = 'gameover';
    deathBy = cause;
    playGameOver();
    coins += score; // 점수만큼 코인 획득
    saveShop();
    if (score > best) {
      best = score;
      isNewBest = true;
      localStorage.setItem(BEST_KEY, String(best));
    }
    updateOverlay();
  }

  // ---- 로딩바 진행 ----
  function advanceLoading(dt) {
    let p = loadProgress + (100 / LOAD_DUR) * dt;
    const imgPct = imgLoaded / imgTotal;
    if (p > 95 && imgPct < 1) p = 95; // 이미지 로딩이 덜 끝났으면 95%에서 대기
    loadProgress = Math.min(100, p);
    updateLoadBar(loadProgress);
    if (loadProgress >= 100) { state = 'ready'; updateOverlay(); }
  }

  // ---- 업데이트 ----
  function update(dt) {
    if (state === 'loading') { advanceLoading(dt); return; }
    if (state !== 'playing') return;

    // 좌우 이동
    if (keys.left) player.vx -= MOVE_ACCEL * dt;
    if (keys.right) player.vx += MOVE_ACCEL * dt;
    if (!keys.left && !keys.right) player.vx -= player.vx * Math.min(1, FRICTION * dt);
    player.vx = clamp(player.vx, -MOVE_MAX, MOVE_MAX);

    // 점프 (버퍼 + 코요테 타임)
    if (jumpBuffer > 0 && (player.onGround || coyote > 0)) {
      player.vy = JUMP_VY;
      player.onGround = false;
      player.groundPlatform = null;
      coyote = 0;
      jumpBuffer = 0;
      playJump();
    }

    const prevBottom = player.y + player.h / 2;

    // 중력 + 이동 (공중일 때만 낙하)
    if (!player.onGround) {
      player.vy += GRAVITY * dt;
      if (keys.down) player.vy += FASTFALL * dt; // ↓ 누르면 빠르게 하강
      player.vy = Math.min(player.vy, 1800);
    }
    player.x += player.vx * dt;
    if (!player.onGround) player.y += player.vy * dt;

    // 화면 랩어라운드
    if (player.x < -player.w / 2) player.x = W + player.w / 2;
    if (player.x > W + player.w / 2) player.x = -player.w / 2;

    // 발판 이동/낙하
    for (const p of platforms) {
      p.dx = 0;
      if (p.type === 'moving' && !p.broken) {
        const px = p.x;
        p.x += p.dir * p.speed * dt;
        if (p.x < 0) { p.x = 0; p.dir = 1; }
        if (p.x + p.w > W) { p.x = W - p.w; p.dir = -1; }
        p.dx = p.x - px;
      }
      if (p.broken) { p.fallVy += 1500 * dt; p.y += p.fallVy * dt; }
    }

    // 발판 위에 서 있을 때: 함께 이동 + 가장자리 이탈 체크
    if (player.onGround && player.groundPlatform) {
      const g = player.groundPlatform;
      player.x += g.dx;
      player.y = g.y - player.h / 2;
      const within = player.x + player.w * 0.32 > g.x && player.x - player.w * 0.32 < g.x + g.w;
      if (!within || g.broken) { player.onGround = false; player.groundPlatform = null; coyote = COYOTE_TIME; }
    }

    // 착지 / 부스터 / 함정 (하강 중, 공중, 스윕 체크 — ↓ 로 뚫는 그 발판만 통과)
    if (!player.onGround && player.vy > 0) {
      const newBottom = player.y + player.h / 2;
      for (const p of platforms) {
        if (p.broken) continue;
        if (p === player.dropThrough) continue;   // 뚫고 내려가는 중인 그 발판만 무시
        const withinX = player.x + player.w * 0.32 > p.x && player.x - player.w * 0.32 < p.x + p.w;
        if (withinX && prevBottom <= p.y + 2 && newBottom >= p.y) {
          if (p.type === 'break') { p.broken = true; p.fallVy = 130; continue; }
          if (p.type === 'boost') {
            player.y = p.y - player.h / 2;
            player.vy = BOOST_VY;           // 자동으로 높이 튕김
            player.landTimer = 0.16;
            playJump();
            break;
          }
          // 일반/이동 발판: 착지해서 정지 (스페이스로 점프)
          player.y = p.y - player.h / 2;
          player.vy = 0;
          player.onGround = true;
          player.groundPlatform = p;
          player.landTimer = 0.12;
          playLand();
          break;
        }
      }
    }

    if (player.landTimer > 0) player.landTimer -= dt;
    if (player.dropTimer > 0) player.dropTimer -= dt;
    // 뚫던 발판을 완전히 지나쳤거나 제한 시간이 지나면 다시 충돌 허용
    if (player.dropThrough && (player.dropTimer <= 0 || player.y - player.h / 2 > player.dropThrough.y)) player.dropThrough = null;
    if (!player.onGround && coyote > 0) coyote -= dt;
    if (jumpBuffer > 0) jumpBuffer -= dt;
    if (player.invuln > 0) { player.invuln -= dt; if (player.invuln < 0) player.invuln = 0; }

    // 몬스터 이동
    for (const m of monsters) {
      m.phase += dt * 3.5;
      if (m.vx) {
        m.x += m.vx * dt;
        if (m.x < 26) { m.x = 26; m.vx = Math.abs(m.vx); }
        if (m.x > W - 26) { m.x = W - 26; m.vx = -Math.abs(m.vx); }
      }
      m.bob = Math.sin(m.phase) * 7;
    }

    // 몬스터 충돌 (무적이면 오히려 몬스터를 없앰)
    for (const m of monsters) {
      const dx = player.x - m.x;
      const dy = player.y - (m.y + m.bob);
      if ((dx * dx) / (32 * 32) + (dy * dy) / (26 * 26) < 1) {
        if (player.invuln > 0) { m.dead = true; }
        else { endGame('monster'); break; }
      }
    }
    if (monsters.some(m => m.dead)) monsters = monsters.filter(m => !m.dead);

    // 아이템 (꿀떡): 흔들림 + 획득
    for (const it of items) {
      it.phase += dt * 3;
      const dx = player.x - it.x;
      const dy = player.y - it.y;
      if (dx * dx + dy * dy < 28 * 28) { it.taken = true; player.invuln = INVULN_TIME; playPickup(); }
    }

    // 카메라 스크롤
    if (player.y < CAMERA_LINE) {
      const delta = CAMERA_LINE - player.y;
      player.y = CAMERA_LINE;
      totalScroll += delta;
      for (const p of platforms) p.y += delta;
      for (const m of monsters) m.y += delta;
      for (const it of items) it.y += delta;
      for (const c of clouds) {
        c.y += delta * 0.35 * c.s;
        if (c.y > H + 40) { c.y = -40; c.x = rand(0, W); }
      }
      for (const s of stars) {
        s.y += delta * 0.15;
        if (s.y > H + 5) { s.y = -5; s.x = rand(0, W); }
      }
    }

    platforms = platforms.filter(p => p.y < H + 30);
    monsters = monsters.filter(m => m.y < H + 60);
    items = items.filter(it => !it.taken && it.y < H + 40);
    spawnAbove();

    score = Math.floor(totalScroll / 10);

    if (player.y - player.h / 2 > H + 40 && state === 'playing') endGame('fall');
  }

  // ---- 렌더링 ----
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- 배경 이미지 (높이별 크로스페이드) ----
  const BGIMGS = ['bg1', 'bg2', 'bg3', 'bg4', 'bg5', 'bg6'];
  const BG_THRESH = [0, 1500, 3500, 6000, 9000, 12500]; // 각 배경이 지배적이 되는 높이
  const BG_BLEND = 1200;                                 // 크로스페이드 구간
  function drawBgCover(imgKey, alpha) {
    const im = IMG[imgKey];
    if (!ready(im) || alpha <= 0) return;
    const s = Math.max(W / im.naturalWidth, H / im.naturalHeight); // 화면을 꽉 채우는 cover 스케일
    const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.globalAlpha = 1;
  }
  function drawBackground(theme) {
    // 이미지 로딩 전 대비 기본 하늘색 채움
    ctx.fillStyle = rgb(theme.top);
    ctx.fillRect(0, 0, W, H);
    // 현재 높이 구간 배경
    let i = 0;
    for (let k = 0; k < BG_THRESH.length; k++) { if (totalScroll >= BG_THRESH[k]) i = k; }
    drawBgCover(BGIMGS[i], 1);
    // 다음 배경으로 크로스페이드 (임계값 도달 전 BG_BLEND 구간에서 서서히 겹침)
    if (i < BGIMGS.length - 1) {
      const nextT = BG_THRESH[i + 1];
      const f = clamp((totalScroll - (nextT - BG_BLEND)) / BG_BLEND, 0, 1);
      drawBgCover(BGIMGS[i + 1], f);
    }
  }

  const STAGE_TOP = -8;   // 발판 이미지 상단을 충돌선(p.y)보다 살짝 위로
  function drawStageFallback(p, cx) {
    let body, top;
    if (p.type === 'moving') { body = '#ffb3c8'; top = '#ffd1de'; }
    else if (p.type === 'break') { body = '#d9b98c'; top = '#eed3aa'; }
    else if (p.type === 'boost') { body = '#ffca3a'; top = '#ffe694'; }
    else { body = '#e9d3a8'; top = '#fff3dd'; }
    ctx.fillStyle = 'rgba(80,60,90,0.18)';
    roundRect(p.x + 2, p.y + 4, p.w, p.h, 7); ctx.fill();
    ctx.fillStyle = body;
    roundRect(p.x, p.y, p.w, p.h, 7); ctx.fill();
    ctx.fillStyle = top;
    roundRect(p.x + 3, p.y + 2, p.w - 6, 5, 3); ctx.fill();
  }

  function drawPlatforms() {
    for (const p of platforms) {
      const cx = p.x + p.w / 2;
      const im = p.type === 'boost' ? IMG.boost : IMG.stage;
      ctx.save();
      if (p.broken) ctx.globalAlpha = clamp(1 - p.fallVy / 700, 0, 1);

      if (ready(im)) {
        const dispW = p.w * 1.24;
        const dispH = dispW * (im.naturalHeight / im.naturalWidth);
        ctx.drawImage(im, cx - dispW / 2, p.y + STAGE_TOP, dispW, dispH);
      } else {
        drawStageFallback(p, cx);
      }

      // 이동 발판: 좌우 화살표 표시
      if (p.type === 'moving') {
        ctx.fillStyle = 'rgba(232,110,150,0.9)';
        const ay = p.y + 4;
        ctx.beginPath();
        ctx.moveTo(p.x + 6, ay); ctx.lineTo(p.x + 13, ay - 4); ctx.lineTo(p.x + 13, ay + 4); ctx.closePath();
        ctx.moveTo(p.x + p.w - 6, ay); ctx.lineTo(p.x + p.w - 13, ay - 4); ctx.lineTo(p.x + p.w - 13, ay + 4); ctx.closePath();
        ctx.fill();
      }
      // 함정 발판: 균열 표시
      if (p.type === 'break') {
        ctx.strokeStyle = 'rgba(110,75,35,0.75)';
        ctx.lineWidth = 1.6;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 7, p.y + 1);
        ctx.lineTo(cx - 1, p.y + 6);
        ctx.lineTo(cx - 5, p.y + 9);
        ctx.lineTo(cx + 2, p.y + 13);
        ctx.moveTo(cx + 9, p.y + 2);
        ctx.lineTo(cx + 5, p.y + 8);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawItems() {
    const im = IMG.honey;
    for (const it of items) {
      const y = it.y + Math.sin(it.phase) * 4;
      // 은은한 황금 후광
      const pulse = 0.6 + 0.4 * Math.sin(nowSec * 5 + it.phase);
      const g = ctx.createRadialGradient(it.x, y, 2, it.x, y, 28);
      g.addColorStop(0, `rgba(255,232,140,${(0.6 * pulse).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(it.x, y, 28, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (ready(im)) {
        const w = 40, h = w * (im.naturalHeight / im.naturalWidth);
        ctx.drawImage(im, it.x - w / 2, y - h / 2, w, h);
      } else {
        ctx.fillStyle = '#ffcf3a';
        ctx.beginPath(); ctx.arc(it.x, y, 16, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  const SHOP_W = 74; // 모찌가게 표시 크기
  function drawMonsters() {
    const im = IMG.shop;
    for (const m of monsters) {
      const y = m.y + m.bob;
      if (ready(im)) {
        const w = SHOP_W, h = w * (im.naturalHeight / im.naturalWidth);
        ctx.drawImage(im, m.x - w / 2, y - h / 2, w, h);
      } else {
        // 폴백: 분홍 상자 가게
        ctx.save();
        ctx.translate(m.x, y);
        ctx.fillStyle = '#f6c6b0';
        roundRect(-22, -8, 44, 26, 5); ctx.fill();
        ctx.fillStyle = '#e98a8a';
        roundRect(-26, -16, 52, 12, 4); ctx.fill();
        ctx.restore();
      }
    }
  }

  function pickMochiSprite() {
    const p = player;
    if (state === 'gameover') return IMG.fall;
    if (p.landTimer > 0) return IMG.land;
    if (!p.onGround && p.vy < 0) return IMG.jump;
    if (!p.onGround && p.vy > 0) return IMG.fall;
    return IMG.idle;
  }

  function sparkle(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.3, y - s * 0.3);
    ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.3, y + s * 0.3);
    ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.3, y + s * 0.3);
    ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.3, y - s * 0.3);
    ctx.closePath(); ctx.fill();
  }
  function drawInvulnAura(cx, cy) {
    const pulse = 0.65 + 0.35 * Math.sin(nowSec * 7);
    const R = 46 + 5 * Math.sin(nowSec * 7);
    const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, R);
    g.addColorStop(0, `rgba(255,236,150,${(0.55 * pulse).toFixed(3)})`);
    g.addColorStop(0.55, `rgba(255,205,70,${(0.40 * pulse).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255,255,235,${(0.9 * pulse).toFixed(3)})`;
    for (let i = 0; i < 4; i++) {
      const a = nowSec * 2 + i * Math.PI / 2;
      sparkle(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6), 4.5);
    }
    ctx.restore();
  }

  function drawMochi() {
    const p = player;
    const im = currentSkinImage() || pickMochiSprite(); // 스킨 장착 시 스킨 이미지 사용

    // 무적(발광) 상태: 후광 + 종료 직전 깜빡임
    const inv = p.invuln > 0;
    const nearEnd = inv && p.invuln < 1.4;
    const visible = !nearEnd || Math.sin(nowSec * 22) > -0.2;
    if (inv && visible) drawInvulnAura(p.x, p.y);
    const alpha = visible ? 1 : 0.4;

    if (ready(im)) {
      const dispW = 66;
      const dispH = dispW * (im.naturalHeight / im.naturalWidth);
      const tilt = clamp(p.vx / 2000, -0.26, 0.26);
      // 착지 순간 살짝 눌리는 지밍 효과 (이미지 위에 추가)
      let sx = 1, sy = 1;
      if (p.landTimer > 0) { const t = p.landTimer / 0.16; sy = 1 - 0.12 * t; sx = 1 + 0.12 * t; }
      const footY = p.y + p.h / 2 + 8; // 발판 위에 자연스럽게 얹히도록
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, footY);
      ctx.rotate(tilt);
      ctx.scale(sx, sy);
      ctx.drawImage(im, -dispW / 2, -dispH, dispW, dispH); // 발을 footY에 맞춤
      ctx.restore();
      if (inv && visible) drawInvulnAura(p.x, p.y); // 캐릭터 위에도 반짝임 한 겹
      return;
    }

    // ---- 폴백: 코드로 그린 모찌 ----
    let sy = 1, sx = 1;
    if (p.landTimer > 0) {
      const t = p.landTimer / 0.16;
      sy = 1 - 0.35 * t;
      sx = 1 + 0.3 * t;
    } else if (p.vy < 0) {
      const t = Math.min(1, -p.vy / 800);
      sy = 1 + 0.12 * t;
      sx = 1 - 0.08 * t;
    } else if (!p.onGround) {
      sy = 1 + 0.05 * Math.min(1, p.vy / 900);
    }
    const tilt = clamp(p.vx / 2200, -0.18, 0.18);
    const dead = state === 'gameover';
    const happy = p.vy < 0 || p.onGround || state !== 'playing';

    ctx.save();
    ctx.translate(p.x, p.y + p.h / 2 * (1 - sy));
    ctx.rotate(tilt);
    ctx.scale(sx, sy);

    // 팔
    const armUp = p.vy < 0 ? -6 : 2;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#e8c8d8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(-p.w/2 - 2, armUp, 6, 8, -0.5, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(p.w/2 + 2, armUp, 6, 8, 0.5, 0, Math.PI*2);
    ctx.fill(); ctx.stroke();

    // 몸체
    const bg = ctx.createRadialGradient(-6, -8, 4, 0, 0, p.w * 0.72);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.75, '#fdf3f8');
    bg.addColorStop(1, '#f5dfec');
    ctx.fillStyle = bg;
    ctx.strokeStyle = '#e8c0d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(-9, -9, 7, 4, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // 잎사귀
    ctx.fillStyle = '#8fce8f';
    ctx.beginPath();
    ctx.ellipse(2, -p.h/2 - 2, 5, 3, 0.4, 0, Math.PI * 2);
    ctx.ellipse(-3, -p.h/2 - 1, 4, 2.5, -0.5, 0, Math.PI * 2);
    ctx.fill();

    // 볼터치
    ctx.fillStyle = 'rgba(255,150,180,0.55)';
    ctx.beginPath();
    ctx.ellipse(-13, 4, 5.5, 3.5, 0, 0, Math.PI * 2);
    ctx.ellipse(13, 4, 5.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 눈
    if (dead) {
      ctx.strokeStyle = '#4a3540';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (const ex of [-8, 8]) {
        ctx.beginPath();
        ctx.moveTo(ex - 3, -6); ctx.lineTo(ex + 3, 0);
        ctx.moveTo(ex + 3, -6); ctx.lineTo(ex - 3, 0);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#4a3540';
      ctx.beginPath();
      ctx.arc(-8, -3, 3, 0, Math.PI * 2);
      ctx.arc(8, -3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-7, -4, 1.1, 0, Math.PI * 2);
      ctx.arc(9, -4, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // 입
    ctx.strokeStyle = '#4a3540';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    if (dead) {
      ctx.beginPath();
      ctx.moveTo(-4, 7);
      ctx.quadraticCurveTo(0, 4, 4, 7);
      ctx.stroke();
    } else if (happy) {
      ctx.beginPath();
      ctx.arc(0, 3, 4, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#4a3540';
      ctx.beginPath();
      ctx.ellipse(0, 5, 2.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 점수판/최고판 공통: pill 본체 안에 '라벨 + 숫자'를 중앙 정렬로 그림
  function drawPillText(label, num, cx, bodyTopY, bodyH, labelPx, numPx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9a6234';                        // 라벨 (연갈색)
    ctx.font = labelPx + "px 'Jua', sans-serif";
    ctx.fillText(label, cx, bodyTopY + bodyH * 0.33);
    ctx.fillStyle = '#5f3d1f';                        // 숫자 (진한 초코색)
    ctx.font = "800 " + numPx + "px 'Baloo 2', 'Jua', sans-serif";
    ctx.fillText(num, cx, bodyTopY + bodyH * 0.70);
    ctx.textBaseline = 'alphabetic';
  }

  function drawHUD(theme) {
    // ---- 상단 HUD: 홈(왼쪽·DOM) / 점수(가운데) / 최고(오른쪽) 를 공통 기준선에 정렬 ----
    const CY = 36;               // 세 요소의 세로 중심선(논리)
    const pillH = 40;            // 점수·최고 pill '본체' 높이 (동일하게 맞춤)
    const bodyTop = CY - pillH / 2;
    const margin = 6;
    const homeSide = 44;         // 홈 버튼(DOM)과 동일한 논리 크기

    // 점수판: 이미지 전체가 곧 본체 (스코어보드 비율 2007:565)
    const scW = pillH * (2007 / 565), scH = pillH;
    // 최고판: 왕관이 본체 위로 솟음 → 본체 높이=pillH 가 되도록 이미지 높이 역산 (본체는 이미지의 23.6%~94.4%)
    const beImgH = pillH / 0.708, beImgW = beImgH * (1592 / 877);
    const beX = W - margin - beImgW;                 // 우측 정렬
    const beImgTop = bodyTop - 0.236 * beImgH;       // 본체 상단을 bodyTop 에 맞춤 (왕관은 위로 오버플로우)
    // 점수판을 홈(오른쪽 끝)과 최고판(왼쪽 끝) 사이 중앙에 균등 배치
    const homeRight = margin + homeSide;
    const scX = homeRight + ((beX - homeRight) - scW) / 2;

    if (ready(IMG.scoreboard)) ctx.drawImage(IMG.scoreboard, scX, bodyTop, scW, scH);
    if (ready(IMG.bestboard))  ctx.drawImage(IMG.bestboard, beX, beImgTop, beImgW, beImgH);

    drawPillText('점수', String(score), scX + scW / 2, bodyTop, pillH, 10, 19);
    drawPillText('최고 점수', String(best), beX + beImgW * 0.40, bodyTop, pillH, 8, 14);

    // 무적 게이지 (HUD 아래)
    if (state === 'playing' && player.invuln > 0) {
      const t = player.invuln / INVULN_TIME;
      const bw = 120, bx = (W - bw) / 2, by = CY + pillH / 2 + 26, bh = 9;
      ctx.textAlign = 'center';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#e8a11a';
      ctx.fillText('무적 ' + player.invuln.toFixed(1) + 's', W / 2, by - 5);
      ctx.fillStyle = 'rgba(180,140,60,0.25)';
      roundRect(bx, by, bw, bh, 4); ctx.fill();
      const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grad.addColorStop(0, '#ffd34d'); grad.addColorStop(1, '#ffa62b');
      ctx.fillStyle = grad;
      roundRect(bx, by, Math.max(4, bw * t), bh, 4); ctx.fill();
    }
  }

  function render() {
    const theme = themeMix();
    drawBackground(theme);
    drawPlatforms();
    drawItems();
    drawMonsters();
    drawMochi();
    drawHUD(theme);
  }

  // ---- DOM 오버레이 (로딩 / 타이틀 / 게임오버) ----
  const overlay = document.getElementById('overlay');
  const backBtn = document.getElementById('backBtn');
  backBtn.innerHTML = '<img src="' + u('home') + '" alt="">';
  const bgURL = u('bg');
  const logoTag = '<img class="logo" src="' + u('logo') + '" alt="떡숑!">';

  backBtn.addEventListener('click', () => { state = 'ready'; updateOverlay(); });

  function updateOverlay() {
    // 게임 중에만 상단 '메뉴' 버튼 표시
    backBtn.classList.toggle('hidden', state !== 'playing');
    if (state === 'playing') { overlay.classList.add('hidden'); overlay.innerHTML = ''; return; }
    overlay.classList.remove('hidden');
    overlay.style.backgroundImage = "url('" + bgURL + "')";

    if (state === 'loading') {
      const letters = 'LOADING'.split('').map((c, i) =>
        '<span style="animation-delay:' + (i * 0.09).toFixed(2) + 's">' + c + '</span>').join('');
      overlay.innerHTML =
        '<div class="load-title">' + letters + '</div>' +
        '<div class="loadbar-wrap">' +
          '<div class="loadbar-char" id="loadChar"><img src="' + u('idle') + '" alt=""></div>' +
          '<div class="loadbar-track"><div class="loadbar-fill" id="loadFill"></div></div>' +
          '<div class="loadbar-pct" id="loadPct">0%</div>' +
        '</div>';
      updateLoadBar(loadProgress);
      return;
    }

    if (state === 'ready') {
      overlay.innerHTML =
        logoTag +
        '<button class="settings-hud" id="btnSetting" aria-label="설정"><img src="' + u('settings') + '" alt=""></button>' +
        '<img class="load-center" src="' + u('loadmochi') + '" alt="">' +
        '<div class="menu">' +
          '<button class="btn-img btn-play" id="btnStart" aria-label="게임 시작"><img src="' + u('play') + '" alt=""></button>' +
          '<button class="btn-img btn-shop" id="btnShop" aria-label="상점"><img src="' + u('shopbtn') + '" alt=""></button>' +
        '</div>';
      byId('btnStart').addEventListener('click', () => startGame());
      byId('btnShop').addEventListener('click', () => showPanel('shop'));
      byId('btnSetting').addEventListener('click', () => showPanel('setting'));
      return;
    }

    if (state === 'gameover') {
      const subText = deathBy === 'monster' ? '모찌가게에 홀려버렸어요!' : '떡상이 아쉽게 떨어졌어요!';
      overlay.innerHTML =
        '<div class="go-card">' +
          '<img class="go-char" src="' + u('failcry') + '" alt="">' +
          '<h1 class="go-title"><span class="fl">✿</span>게임 오버<span class="fl">✿</span></h1>' +
          '<p class="go-sub">' + subText + '</p>' +
          (isNewBest ? '<div class="go-newbest">🎉 신기록 달성! 🎉</div>' : '') +
          '<hr class="go-divider">' +
          '<div class="go-stats">' +
            '<div class="go-stat"><div class="ic st">★</div><div class="v">' + score.toLocaleString() + '</div><div class="l">이번 점수</div></div>' +
            '<div class="go-stat"><div class="ic">👑</div><div class="v">' + best.toLocaleString() + '</div><div class="l">최고 점수</div></div>' +
            '<div class="go-stat"><div class="ic"><img src="' + u('coin') + '" alt=""></div><div class="v">+' + score.toLocaleString() + '</div><div class="l">획득 코인</div></div>' +
          '</div>' +
          '<button class="go-retry" id="btnRetry"><span class="ri">↺</span>다시 시작</button>' +
          '<div><button class="go-home" id="btnMenu"><img src="' + u('home') + '" alt="">홈으로</button></div>' +
        '</div>';
      byId('btnRetry').addEventListener('click', () => startGame());
      byId('btnMenu').addEventListener('click', () => { state = 'ready'; updateOverlay(); });
    }
  }

  function byId(id) { return document.getElementById(id); }

  function updateLoadBar(p) {
    const fill = byId('loadFill'), pct = byId('loadPct'), ch = byId('loadChar');
    if (fill) fill.style.width = p + '%';
    if (pct) pct.textContent = Math.round(p) + '%';
    if (ch) ch.style.left = p + '%';
  }

  // SHOP (모찌 스킨 상점) / SETTING
  function showPanel(kind) {
    if (kind === 'shop') { renderShop(); return; }
    overlay.style.backgroundImage = "url('" + bgURL + "')";
    const tgl = (id, on, ico, label) =>
      '<div class="set-row">' +
        '<img class="ico" src="' + u(ico) + '" alt="">' +
        '<span class="label">' + label + '</span>' +
        '<button class="toggle ' + (on ? 'on' : 'off') + '" id="' + id + '">' +
          '<span class="txt">' + (on ? 'ON' : 'OFF') + '</span>' +
          '<img class="knob" src="' + u('tglKnob') + '" alt="">' +
        '</button>' +
      '</div>';
    overlay.innerHTML =
      '<div class="set-card">' +
        '<div class="set-top"><img class="m" src="' + u('idle') + '" alt=""><img class="g" src="' + u('setgear') + '" alt=""></div>' +
        '<h1 class="set-title"><span class="spk">✦</span>설정<span class="spk">✦</span></h1>' +
        tgl('tglBgm', bgmOn, 'icoMusic', '배경음악') +
        tgl('tglSfx', sfxOn, 'icoStar', '효과음') +
        '<hr class="set-divider">' +
        '<button class="set-reset" id="btnReset"><img src="' + u('icoReset') + '" alt="">게임 기록 초기화</button>' +
        '<button class="set-close" id="btnBack"><span class="face">··</span>닫기<span class="face">··</span></button>' +
      '</div>';
    // 토글 동작
    function bindToggle(id, get, set) {
      const el = byId(id);
      el.addEventListener('click', () => {
        const next = !get();
        set(next);
        el.classList.toggle('on', next);
        el.classList.toggle('off', !next);
        el.querySelector('.txt').textContent = next ? 'ON' : 'OFF';
      });
    }
    bindToggle('tglBgm', () => bgmOn, setBgm);
    bindToggle('tglSfx', () => sfxOn, setSfx);
    byId('btnBack').addEventListener('click', () => { state = 'ready'; updateOverlay(); });
    byId('btnReset').addEventListener('click', () => {
      best = 0; isNewBest = false; localStorage.setItem(BEST_KEY, '0');
      playPickup(); // 초기화 확인 사운드
    });
  }

  function renderShop() {
    overlay.style.backgroundImage = "url('" + bgURL + "')";
    let cards = '';
    for (const s of SKINS) {
      const src = s.key ? u(s.key) : u('idle');
      const owned = ownedSkins.has(s.id);
      const equipped = s.id === equippedSkin;
      let btn;
      if (equipped) {
        btn = '<button class="skin-btn equipped" data-skin="' + s.id + '">장착중 ✓</button>';
      } else if (owned) {
        btn = '<button class="skin-btn own" data-skin="' + s.id + '">장착하기</button>';
      } else {
        btn = '<button class="skin-btn" data-skin="' + s.id + '">🪙 ' + s.price.toLocaleString() + '</button>';
      }
      cards +=
        '<div class="skin-card" data-skin="' + s.id + '">' +
          '<div class="ttl">' + s.name + '</div>' +
          '<img src="' + src + '" alt="">' +
          btn +
        '</div>';
    }
    overlay.innerHTML =
      '<div class="shop-frame">' +
        '<img class="shop-bg" src="' + u('shopui') + '" alt="상점">' +
        '<button class="shop-back" id="btnBack" aria-label="뒤로"><img src="' + u('home') + '" alt=""></button>' +
        '<div class="cur-coin">' + coins.toLocaleString() + '</div>' +
        '<div class="shop-grid">' + cards + '</div>' +
        '<div class="shop-caption">새로운 모찌와 함께 더 높이 올라가요</div>' +
        '<div class="shop-modal" id="shopModal">' +
          '<div class="shop-modal-card">' +
            '<img class="icon" src="' + u('coin') + '" alt="">' +
            '<div class="msg">모찌코인이 부족해요</div>' +
            '<button id="shopModalOk">확인</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    byId('btnBack').addEventListener('click', () => { state = 'ready'; updateOverlay(); });
    const shopModal = byId('shopModal');
    function showShopModal() { shopModal.classList.add('show'); }
    function hideShopModal() { shopModal.classList.remove('show'); }
    shopModal.addEventListener('click', (e) => { if (e.target === shopModal) hideShopModal(); });
    byId('shopModalOk').addEventListener('click', hideShopModal);
    overlay.querySelectorAll('.skin-btn').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-skin');
        const s = SKINS.find(x => x.id === id);
        if (!s) return;
        if (ownedSkins.has(id)) {
          equippedSkin = id;          // 보유 → 장착
        } else if (coins >= s.price) {
          coins -= s.price;           // 구매 → 즉시 장착
          ownedSkins.add(id);
          equippedSkin = id;
        } else {
          showShopModal(); // 코인 부족
          return;
        }
        saveShop();
        renderShop();
      });
    });
  }

  // ---- 디버그 훅 (?debug 로 열었을 때만) ----
  if (location.search.includes('debug')) {
    window.__mochi = {
      boost(px) { totalScroll += px; },
      openShop() { showPanel('shop'); return 'shop open'; },
      equip(id) { equippedSkin = id; localStorage.setItem(SKIN_KEY, id); return 'equipped ' + id; },
      getSkin() { return equippedSkin; },
      addCoins(n) { coins += n; saveShop(); return coins; },
      getShop() { return { coins, owned: [...ownedSkins], equipped: equippedSkin }; },
      audioState() { return { ctx: audioCtx ? audioCtx.state : 'none', bgmOn, sfxOn, bgmStep }; },
      setBgm(v) { setBgm(v); return bgmOn; },
      setSfx(v) { setSfx(v); return sfxOn; },
      spawnMonster() { monsters.push({ x: player.x, y: player.y, vx: 0, bob: 0, phase: 0, hue: 0 }); },
      spawnItem() { items.push({ x: player.x, y: player.y - 60, phase: 0, taken: false }); return 'item placed'; },
      giveInvuln() { player.invuln = INVULN_TIME; return 'invuln on'; },
      spawnBreak() {
        const p = makePlatform(420, 'break');
        p.x = clamp(player.x - p.w / 2, 0, W - p.w);
        platforms.push(p);
        player.y = 350; player.vy = 0; player.onGround = false; player.groundPlatform = null;
        return 'break@' + Math.round(p.y);
      },
      spawnBoost() {
        const p = makePlatform(420, 'boost');
        p.x = clamp(player.x - p.w / 2, 0, W - p.w);
        platforms.push(p);
        player.y = 350; player.vy = 0; player.onGround = false; player.groundPlatform = null;
        return 'boost@' + Math.round(p.y);
      },
      forceReady() { state = 'ready'; updateOverlay(); return 'ready'; },
      start() { startGame(); return this.info(); },
      dropKey() { keys.down = true; if (player.onGround) { player.dropThrough = player.groundPlatform; player.onGround = false; player.groundPlatform = null; player.dropTimer = DROP_TIME; player.vy = Math.max(player.vy, 180); } return this.info(); },
      dropRelease() { keys.down = false; },
      tick(n, dt) { dt = dt || 1 / 60; for (let i = 0; i < (n || 1); i++) { nowSec += dt; update(dt); } render(); return this.info(); },
      info() { return { v: 5, state, deathBy, score, totalScroll: Math.round(totalScroll), platforms: platforms.length, monsters: monsters.length, items: items.length, invuln: +player.invuln.toFixed(2), py: Math.round(player.y), vy: Math.round(player.vy), ground: player.onGround, drop: +player.dropTimer.toFixed(2) }; }
    };
  }

  // ---- 초기 로딩 화면 표시 (진행은 게임 루프의 advanceLoading 이 담당) ----
  updateOverlay();

  // ---- 메인 루프 ----
  function loop(time) {
    const dt = Math.min(1 / 30, (time - lastTime) / 1000 || 0);
    lastTime = time;
    nowSec = time / 1000;
    update(dt);
    render();
    scheduleBgm();   // 배경음악 예약
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
