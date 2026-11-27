// 1314 Luxury — 互動與 AI 對話
(() => {
  const pagesPreview = document.documentElement.hasAttribute("data-pages-preview");
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  $("#year").textContent = new Date().getFullYear();

  /* ---------- 開場動畫：每個瀏覽階段只播一次 ---------- */
  let seen = false;
  try { seen = sessionStorage.getItem("intro") === "1"; sessionStorage.setItem("intro", "1"); } catch {}
  const introDelay = calm || seen ? 0 : 1900;
  setTimeout(() => {
    document.body.classList.remove("is-loading");
    setTimeout(typeGreeting, calm ? 0 : 1300);
  }, introDelay);

  /* ---------- 導覽列：捲動後變實色，向下捲時收起 ---------- */
  const nav = $("#nav");
  let lastY = scrollY;
  function onNav() {
    const y = scrollY;
    nav.classList.toggle("is-scrolled", y > 40);
    nav.classList.toggle("is-hidden", y > 400 && y > lastY + 4);
    if (y < lastY - 4 || y < 400) nav.classList.remove("is-hidden");
    // 捲過一半後，回彈露出的底色改成頁腳的深莓色
    document.documentElement.classList.toggle("at-end", y > (document.documentElement.scrollHeight - innerHeight) / 2);
    lastY = y;
  }

  /* ---------- 滾動顯現 ---------- */
  const revealer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("is-in");
      revealer.unobserve(e.target);
      const n = e.target.querySelector("[data-count]");
      if (n) countUp(n);
    }
  }, { rootMargin: "0px 0px -12% 0px" });
  // 同一組內的元素依序延遲出現
  for (const group of [".facts", ".products", ".service-list", ".steps"]) {
    $$(`${group} > [data-reveal]`).forEach((el, i) => el.style.setProperty("--d", `${i * 0.12}s`));
  }
  $$("[data-reveal]").forEach((el) => revealer.observe(el));

  function countUp(el) {
    const end = Number(el.dataset.count);
    if (calm) return;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 1600);
      el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- 品牌宣言：隨捲動逐字點亮 ---------- */
  const manifesto = $("#manifesto");
  const accentFrom = manifesto.textContent.indexOf("奢侈品。", 12);
  let idx = 0;
  const chars = [];
  manifesto.innerHTML = manifesto.innerHTML
    .split(/(<br\s*\/?>)/)
    .map((part) => {
      if (part.startsWith("<br")) return part;
      return [...part].map((c) => {
        const accent = idx >= accentFrom && idx < accentFrom + 3;
        idx++;
        return `<span class="ch${accent ? " is-accent" : ""}">${c}</span>`;
      }).join("");
    })
    .join("");
  chars.push(...$$(".ch", manifesto));
  manifesto.setAttribute("aria-label", "不只是包包奢侈，而是讓你整個人變成奢侈品。");

  function onManifesto() {
    const r = manifesto.getBoundingClientRect();
    const start = innerHeight * 0.85, end = innerHeight * 0.3;
    const p = Math.min(1, Math.max(0, (start - r.top) / (start - end + r.height * 0.5)));
    const lit = Math.round(p * chars.length);
    chars.forEach((c, i) => c.classList.toggle("is-lit", i < lit));
  }

  /* ---------- 跑馬燈：基本速度 + 捲動速度加成 ---------- */
  const track = $("#marquee");
  let mx = 0, boost = 0, prevScroll = scrollY;
  function marqueeLoop() {
    const dy = scrollY - prevScroll;
    prevScroll = scrollY;
    boost += (Math.min(40, Math.abs(dy)) * 0.08 - boost) * 0.1;
    mx -= 0.45 + boost;
    const half = track.scrollWidth / 2;
    if (-mx >= half) mx += half;
    track.style.transform = `translate3d(${mx}px,0,0)`;
    requestAnimationFrame(marqueeLoop);
  }
  if (!calm) requestAnimationFrame(marqueeLoop);

  /* ---------- 視差 ---------- */
  const parallax = $$("[data-parallax]");
  function onParallax() {
    for (const el of parallax) {
      const r = el.getBoundingClientRect();
      const offset = (r.top + r.height / 2 - innerHeight / 2) * Number(el.dataset.parallax);
      el.style.transform = `translate3d(0,${offset.toFixed(1)}px,0)`;
    }
  }

  let ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      onNav();
      onManifesto();
      if (!calm) onParallax();
      ticking = false;
    });
  }, { passive: true });
  onNav();
  onManifesto();

  /* =========================================================
     AI 對話
     ========================================================= */
  const stage = $("#concierge");
  const log = $("#chatLog");
  const form = $("#chatForm");
  const input = $("#chatInput");
  const sendBtn = $("#sendBtn");
  const chips = $("#chips");
  const resetBtn = $("#newChat");
  const launcher = $("#aiLauncher");
  if (pagesPreview) {
    input.placeholder = "輸入想向門市查詢的問題…";
    input.dataset.short = "輸入門市查詢…";
    sendBtn.setAttribute("aria-label", "準備 WhatsApp 查詢");
    launcher.setAttribute("aria-label", "聯絡門市");
    $(".fab__label", launcher).textContent = "聯絡門市";
    stage.setAttribute("aria-label", "1314 門市查詢");
    $(".stage__note").replaceChildren("門市查詢經 ", $(".stage__note a"), " 跟進。");
  }

  // 窄螢幕用較短的提示文字，避免換行被裁切
  const longHint = input.placeholder;
  const narrow = matchMedia("(max-width: 560px)");
  const syncHint = () => { input.placeholder = narrow.matches ? input.dataset.short : longHint; };
  narrow.addEventListener("change", syncHint);
  syncHint();

  const GREETING = pagesPreview
    ? "你好，歡迎來到 1314 Luxury。想查詢手袋、寄賣或門市資料？可以用 WhatsApp 搵我哋。"
    : "你好，我係 1314 小助手。想了解精選手袋、寄賣收購，定係門市資料？隨時問我。";
  let history = [];
  let conversationId = null;
  let busy = false;

  function typeGreeting() {
    const typed = $("#greetingTyped");
    $("#greetingFull").textContent = GREETING;
    if (calm) {
      typed.textContent = GREETING;
      $("#greeting").classList.add("is-done");
      return;
    }
    let i = 0;
    const tick = () => {
      typed.textContent = GREETING.slice(0, ++i);
      if (i < GREETING.length) setTimeout(tick, /[，。？]/.test(GREETING[i - 1]) ? 260 : 55);
      else setTimeout(() => $("#greeting").classList.add("is-done"), 1400);
    };
    tick();
  }

  function addMsg(role, text = "") {
    const el = document.createElement("div");
    el.className = `msg msg--${role === "user" ? "user" : "bot"}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  // 用 View Transition 包住版面切換；若過渡被中止（例如分頁在背景），仍確保狀態已套用
  function transition(apply) {
    if (!document.startViewTransition || calm || document.hidden) return apply();
    let done = false;
    const run = () => { if (!done) { done = true; apply(); } };
    const vt = document.startViewTransition(run);
    vt.ready.catch(() => {});
    vt.updateCallbackDone.catch(run);
    vt.finished.catch(run);
  }

  function enterChat() {
    // 確保對話舞台完整在畫面內（導覽列不會遮住標題）
    if (Math.abs(stage.getBoundingClientRect().top) > 4) {
      scrollTo({ top: stage.offsetTop, behavior: calm ? "auto" : "smooth" });
    }
    if (stage.classList.contains("is-chat")) return;
    const apply = () => {
      stage.classList.add("is-chat");
      log.hidden = false;
      resetBtn.hidden = false;
    };
    transition(apply); // 支援 View Transitions 的瀏覽器會有平滑的版面過渡
  }

  function resetChat() {
    if (busy) return;
    conversationId = null;
    history = [];
    log.innerHTML = "";
    const apply = () => {
      stage.classList.remove("is-chat");
      log.hidden = true;
      resetBtn.hidden = true;
    };
    transition(apply);
    input.focus();
  }

  function setThinking(on) {
    stage.classList.toggle("is-thinking", on);
    resetBtn.disabled = on;
    window.fluid?.setEnergy(on ? 1 : 0);
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    if (pagesPreview) {
      enterChat();
      addMsg("user", text);
      const contact = $(".stage__note a").cloneNode(false);
      const destination = new URL(contact.href);
      destination.searchParams.set("text", text);
      contact.href = destination.href;
      contact.textContent = "前往 WhatsApp";
      addMsg("assistant", "查詢內容已準備好。你可以在 WhatsApp 確認後發送給門市。 ").append(contact);
      input.value = "";
      autoGrow();
      updateSend();
      return;
    }
    busy = true;
    updateSend();
    enterChat();

    addMsg("user", text);
    history.push({ role: "user", content: text });
    input.value = "";
    autoGrow();

    const typing = document.createElement("div");
    typing.className = "msg msg--bot msg--typing";
    typing.setAttribute("aria-label", "小助手輸入中");
    typing.innerHTML = "<i></i><i></i><i></i>";
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;
    setThinking(true);

    let bubble = null;
    let reply = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-20), conversationId }),
      });
      if (res.headers.get("X-Conversation-Id")) conversationId = res.headers.get("X-Conversation-Id");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        if (!bubble) {
          typing.remove();
          bubble = addMsg("assistant");
        }
        bubble.textContent = reply;
        log.scrollTop = log.scrollHeight;
      }
      reply += decoder.decode();
      if (!res.ok) throw new Error(reply || `HTTP ${res.status}`);
    } catch (err) {
      reply = "";
      bubble?.remove();
      addMsg("assistant", "網絡好似有啲問題，可以再試一次，或者直接 WhatsApp +852 9417 7866 搵我哋。");
      console.warn("[chat]", err);
    } finally {
      typing.remove();
      setThinking(false);
    }

    if (reply.trim()) history.push({ role: "assistant", content: reply.trim() });
    else history.pop(); // 保持 user / assistant 交替

    busy = false;
    updateSend();
    input.focus({ preventScroll: true });
  }

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
  }
  function updateSend() {
    sendBtn.disabled = busy || !input.value.trim();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(input.value);
  });
  input.addEventListener("input", () => { autoGrow(); updateSend(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    }
  });
  chips.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") send(e.target.textContent);
  });
  resetBtn.addEventListener("click", resetChat);

  // 浮動 AI 按鈕：離開首屏後出現，按下返回對話舞台
  new IntersectionObserver(([e]) => {
    document.body.classList.toggle("at-stage", e.intersectionRatio > 0.35);
  }, { threshold: [0, 0.35, 1] }).observe(stage);
  launcher.addEventListener("click", () => {
    stage.scrollIntoView({ behavior: calm ? "auto" : "smooth" });
    setTimeout(() => input.focus({ preventScroll: true }), calm ? 0 : 700);
  });

  /* =========================================================
     精選展示：展台（桌面）／滑動畫廊（手機）＋ 大圖
     ========================================================= */
  const showcase = $("#showcase");
  const rail = $("#products");
  const pad = (n) => String(n).padStart(2, "0");
  // 由 HTML 內的產品卡讀取資料 —— 新增產品只需複製一個 <article class="product">
  const items = $$(".product", rail).map((el, i) => ({
    el,
    no: pad(i + 1),
    label: $(".product__no", el).textContent,
    name: $("h3", el).textContent,
    spec: $(".product__spec", el).textContent,
    cond: $(".product__cond", el)?.textContent || "",
    wa: el.dataset.wa,
    imgs: $$(".product__media img", el).map((img) => ({ src: img.getAttribute("src"), alt: img.alt })),
  }));
  // 所有相片攤平成一個序列，展台圖層及大圖都用同一個索引
  const shots = items.flatMap((it, p) => it.imgs.map((im, v) => ({ ...im, p, v })));
  const firstShot = (p) => shots.findIndex((s) => s.p === p);

  const plate = $("#plate");
  const stack = $("#plateLayers");
  // 每張相預先解碼一次；換圖時複製這個節點，瀏覽器會直接用已解碼的結果，不會卡在第一幀
  const sources = shots.map((s) => {
    const img = new Image();
    img.decoding = "sync";
    img.alt = "";
    img.draggable = false;
    img.src = s.src;
    img.decode?.().catch(() => {});
    return img;
  });
  const ghost = $("#plateNo");
  const views = $("#plateViews");
  let activeP = -1, activeShot = -1, painted = -1, shotTimer = 0;

  // 換圖 = 在最上面疊一張新圖層，由下而上揭開；揭完才清走下面的舊圖層。
  // 無論切換得幾快，新圖層永遠蓋在當下畫面之上，所以不會跳格或露底。
  function paintShot(k) {
    if (k === painted) return;
    const instant = painted < 0 || calm;
    painted = k;
    const layer = document.createElement("span");
    layer.className = `plate__layer${instant ? " is-static" : ""}`;
    layer.appendChild(sources[k].cloneNode());
    stack.appendChild(layer);
    const prune = () => {
      while (stack.firstChild !== layer) stack.removeChild(stack.firstChild);
    };
    if (instant) prune();
    else layer.addEventListener("animationend", (e) => e.target === layer && prune());
  }

  // now = false 時稍等一下才換圖：快速捲過幾行時，只會換到最後停低的那一件
  function showShot(k, now = false) {
    if (k !== activeShot) {
      activeShot = k;
      $$("button", views).forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.shot) === k)));
    }
    clearTimeout(shotTimer);
    if (now) paintShot(k);
    else shotTimer = setTimeout(() => paintShot(k), 110);
  }

  function activate(p, shot, now = false) {
    if (p === activeP) {
      // 同一件貨：只有明確指定某張相先換，否則保留客人揀緊的角度
      if (shot !== undefined) showShot(shot, now);
      return;
    }
    shot ??= firstShot(p);
    activeP = p;
    const it = items[p];
    items.forEach((x, i) => x.el.classList.toggle("is-active", i === p));
    $("#plateIdx").textContent = it.no;
    $("#plateCond").textContent = it.cond;
    $("#plateCond").hidden = !it.cond;
    $("#plateSeal").href = it.wa;
    plate.setAttribute("aria-label", `放大睇 ${it.name}`);
    // 大號數字：先收起，下一幀再帶動畫出現
    ghost.classList.add("is-swap");
    ghost.textContent = it.no;
    requestAnimationFrame(() => requestAnimationFrame(() => ghost.classList.remove("is-swap")));
    // 多角度相片的小圖切換
    views.innerHTML = "";
    if (it.imgs.length > 1) {
      shots.forEach((s, k) => {
        if (s.p !== p) return;
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.shot = k;
        b.setAttribute("aria-label", `第 ${s.v + 1} 張相`);
        b.innerHTML = `<img src="${s.src}" alt="" />`;
        b.setAttribute("aria-pressed", String(k === shot));
        b.addEventListener("click", () => showShot(k, true));
        views.appendChild(b);
      });
    }
    showShot(shot, now);
  }

  if (items.length) {
    $("#stage").hidden = false;
    showcase.classList.add("is-enhanced");
    $("#railBar").parentElement.style.setProperty("--n", items.length);
    $(".showcase__count").lastChild.textContent = pad(items.length);
    activate(0, 0, true);

    const wide = matchMedia("(min-width: 1081px)");
    items.forEach((it, p) => {
      it.el.addEventListener("focusin", () => wide.matches && activate(p));
      it.el.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        if (e.target.closest(".product__media")) return openLightbox(firstShot(p));
        if (wide.matches) activate(p);
      });
    });

    // 桌面：滑鼠真正移動到哪一行，哪一行就成為主角。
    // 捲動時瀏覽器會補發座標不變的「假」滑鼠事件，要忽略，否則會同捲動搶控制權。
    let mx0 = -1, my0 = -1, hoverY = null;
    rail.addEventListener("mousemove", (e) => {
      if (e.clientX === mx0 && e.clientY === my0) return;
      mx0 = e.clientX;
      my0 = e.clientY;
      const row = e.target.closest(".product");
      if (!row || !wide.matches) return;
      hoverY = scrollY;
      activate(items.findIndex((it) => it.el === row));
    });
    rail.addEventListener("mouseleave", () => (hoverY = null));

    // 捲動：最接近畫面中間的那一行成為主角；剛用滑鼠揀過的話，要再捲一段先交還控制權
    let showcaseTick = false;
    function onShowcaseScroll() {
      showcaseTick = false;
      if (!wide.matches) return;
      if (hoverY !== null && Math.abs(scrollY - hoverY) < 90) return;
      hoverY = null;
      const mid = innerHeight * 0.5;
      let best = 0, dist = Infinity;
      items.forEach((it, p) => {
        const r = it.el.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < dist) { dist = d; best = p; }
      });
      activate(best);
    }
    addEventListener("scroll", () => {
      if (showcaseTick) return;
      showcaseTick = true;
      requestAnimationFrame(onShowcaseScroll);
    }, { passive: true });

    // 手機：滑動進度條
    rail.addEventListener("scroll", () => {
      const max = rail.scrollWidth - rail.clientWidth;
      $("#railBar").parentElement.style.setProperty("--p", max > 0 ? (rail.scrollLeft / max).toFixed(3) : 0);
    }, { passive: true });

    // 展台：相片跟隨游標輕微位移＋自訂游標
    plate.addEventListener("pointermove", (e) => {
      const r = plate.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      plate.style.setProperty("--cx", `${e.clientX - r.left}px`);
      plate.style.setProperty("--cy", `${e.clientY - r.top}px`);
      if (!calm) {
        plate.style.setProperty("--px", (x - 0.5).toFixed(3));
        plate.style.setProperty("--py", (y - 0.5).toFixed(3));
      }
    });
    plate.addEventListener("pointerleave", () => {
      plate.style.setProperty("--px", 0);
      plate.style.setProperty("--py", 0);
    });
    plate.addEventListener("click", () => openLightbox(activeShot));
  }

  /* ---------- 大圖：點一下放大，移動睇細節 ---------- */
  const lb = $("#lightbox");
  const lbView = $("#lbView");
  const lbImg = $("#lbImg");
  let lbAt = 0, lbMoved = false;

  function renderLightbox(k) {
    lbAt = (k + shots.length) % shots.length;
    const s = shots[lbAt], it = items[s.p];
    lbView.classList.remove("is-zoomed");
    lbView.classList.add("is-swap");
    const swap = () => {
      lbImg.src = s.src;
      lbImg.alt = s.alt || it.name;
      lbView.classList.remove("is-swap");
    };
    calm || !lb.open ? swap() : setTimeout(swap, 220);
    $("#lbNo").textContent = it.label;
    $("#lbName").textContent = it.name;
    $("#lbSpec").textContent = it.spec;
    $("#lbCount").textContent = `${lbAt + 1} / ${shots.length}`;
    $("#lbAsk").href = it.wa;
  }
  function openLightbox(k) {
    if (!lb.showModal) return window.open(items[shots[k].p].wa, "_blank", "noopener");
    renderLightbox(k);
    lb.showModal();
  }
  function aim(e) {
    const r = lbImg.getBoundingClientRect();
    if (lbView.classList.contains("is-zoomed")) return pan(e);
    lbImg.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  }
  // 放大後：按游標在視窗內的位置決定顯示相片哪一部分
  function pan(e) {
    const r = lbView.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    lbImg.style.transformOrigin = `${x * 100}% ${y * 100}%`;
  }
  lbView.addEventListener("pointerdown", () => (lbMoved = false));
  lbView.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" && e.buttons) lbMoved = true; // 觸控拖動 = 平移，不當成點擊
    aim(e);
  });
  lbView.addEventListener("click", (e) => {
    if (lbMoved) return;
    if (!lbView.classList.contains("is-zoomed")) aim(e);
    lbView.classList.toggle("is-zoomed");
  });
  $("#lbPrev").addEventListener("click", () => renderLightbox(lbAt - 1));
  $("#lbNext").addEventListener("click", () => renderLightbox(lbAt + 1));
  $("#lbClose").addEventListener("click", () => lb.close());
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") renderLightbox(lbAt - 1);
    if (e.key === "ArrowRight") renderLightbox(lbAt + 1);
  });
  lb.addEventListener("close", () => {
    // 關閉後展台停留在剛才睇緊的那一件
    if (items.length) activate(shots[lbAt].p, lbAt, true);
  });

  /* =========================================================
     直播間：Facebook 專頁直播（狀態由 /api/live 提供）
     ========================================================= */
  const player = $("#player");
  const replayList = $("#replays");
  const FB_PAGE = "https://www.facebook.com/1314LuxuryForLady/live_videos";
  let liveState = { live: false, liveUrl: "", pageUrl: FB_PAGE, replays: [] };
  let playing = "";

  const isFb = (u) => { try { const x = new URL(u); return x.protocol === "https:" && /(^|\.)facebook\.com$/.test(x.hostname); } catch { return false; } };

  // 按下才載入 Facebook 播放器：未睇片的客人不會被第三方追蹤，首屏亦更快
  function play(url) {
    if (!isFb(url)) return;
    playing = url;
    const f = document.createElement("iframe");
    f.src = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true&mute=0`;
    f.title = "1314 Luxury Facebook 直播";
    f.allow = "autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share";
    f.allowFullscreen = true;
    f.referrerPolicy = "origin-when-cross-origin";
    player.querySelector("iframe")?.remove();
    player.appendChild(f);
    $("#playerPoster").hidden = true;
    $$("a", replayList).forEach((a) => a.classList.toggle("is-playing", a.href === url));
  }

  function renderLive(d) {
    liveState = d;
    document.body.classList.toggle("is-live", d.live);
    $("#navLive span").textContent = d.live ? "Live · 直播中" : "Live";
    $("#liveStatus span").textContent = d.live ? "直播進行中 · 立即收睇" : "目前未開播 · 可重溫最近直播";
    $("#playerLabel").textContent = d.live ? "直播進行中 — 立即收睇" : "播放最近一場直播重溫";
    $("#liveGo").href = d.live ? d.liveUrl : d.pageUrl;
    $("#liveGo span").textContent = d.live ? "去 Facebook 留言互動" : "進入 Facebook 直播間";
    const toast = $("#liveToast");
    toast.hidden = !d.live || toast.dataset.seen === d.liveUrl;
    toast.href = "#live";

    replayList.innerHTML = "";
    d.replays.forEach((v, i) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = v.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML = `<span>N°${pad(i + 1)}</span><b></b><em></em><i aria-hidden="true">▶</i>`;
      $("b", a).textContent = v.title || "直播重溫";
      $("em", a).textContent = v.duration || "";
      a.classList.toggle("is-playing", v.url === playing);
      a.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return; // 保留「新分頁開啟」
        e.preventDefault();
        play(v.url);
        player.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "nearest" });
      });
      li.appendChild(a);
      replayList.appendChild(li);
    });
  }

  $("#playerPoster").addEventListener("click", () => {
    const url = liveState.live ? liveState.liveUrl : liveState.replays[0]?.url;
    url ? play(url) : window.open(liveState.pageUrl, "_blank", "noopener");
  });
  $("#liveToast").addEventListener("click", (e) => {
    e.currentTarget.dataset.seen = liveState.liveUrl;
    e.currentTarget.hidden = true;
  });

  async function pollLive() {
    if (document.hidden) return;
    try {
      const r = await fetch(pagesPreview ? "./live.json" : "/api/live");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const changed = d.live !== liveState.live || d.liveUrl !== liveState.liveUrl || d.replays.length !== liveState.replays.length;
      if (changed) renderLive(d);
    } catch (err) {
      console.warn("[live]", err);
    }
  }
  // 已經身處直播區時，毋須再顯示浮動提示
  new IntersectionObserver(([e]) => document.body.classList.toggle("at-live", e.isIntersecting)).observe($("#live"));
  pollLive();
  if (pagesPreview) return;
  setInterval(pollLive, 90_000);
  document.addEventListener("visibilitychange", pollLive);
})();
