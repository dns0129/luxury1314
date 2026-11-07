// 1314 Luxury — 互動與 AI 對話
(() => {
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

  // 窄螢幕用較短的提示文字，避免換行被裁切
  const longHint = input.placeholder;
  const narrow = matchMedia("(max-width: 560px)");
  const syncHint = () => { input.placeholder = narrow.matches ? input.dataset.short : longHint; };
  narrow.addEventListener("change", syncHint);
  syncHint();

  const GREETING = "你好，我係 1314 小助手。想了解精選手袋、寄賣收購，定係門市資料？隨時問我。";
  let history = [];
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
    window.fluid?.setEnergy(on ? 1 : 0);
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
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
        body: JSON.stringify({ messages: history }),
      });
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
})();
