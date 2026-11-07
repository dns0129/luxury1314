// 1314 Luxury — AI 客服前端
(() => {
  const chat = document.getElementById("chat");
  const log = document.getElementById("chatLog");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const chips = document.getElementById("chatChips");
  const sendBtn = form.querySelector("button[type=submit]");
  const launcher = document.querySelector(".fab--chat");

  const GREETING = "你好呀 💕 我係 1314 小助手！想問新貨推介、寄賣收購、定係門市資料，都可以隨時問我 ✨";
  const history = []; // { role: "user" | "assistant", content: string }
  let busy = false;
  let greeted = false;

  document.getElementById("year").textContent = new Date().getFullYear();

  function addBubble(role, text = "") {
    const el = document.createElement("div");
    el.className = `msg msg--${role === "user" ? "user" : "bot"}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function addTyping() {
    const el = document.createElement("div");
    el.className = "msg msg--bot msg--typing";
    el.setAttribute("aria-label", "小助手輸入中");
    el.innerHTML = "<i></i><i></i><i></i>";
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function openChat() {
    chat.hidden = false;
    document.body.classList.add("chat-open");
    launcher.setAttribute("aria-expanded", "true");
    if (!greeted) {
      addBubble("assistant", GREETING);
      greeted = true;
    }
    setTimeout(() => input.focus(), 50);
  }

  function closeChat() {
    chat.hidden = true;
    document.body.classList.remove("chat-open");
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    chips.hidden = true;

    addBubble("user", text);
    history.push({ role: "user", content: text });
    input.value = "";
    autoGrow();

    const typing = addTyping();
    let bubble = null;
    let reply = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      // 串流讀取：伺服器一邊生成，畫面一邊顯示
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        if (!bubble) {
          typing.remove();
          bubble = addBubble("assistant");
        }
        bubble.textContent = reply;
        log.scrollTop = log.scrollHeight;
      }
      reply += decoder.decode();
      if (!res.ok) throw new Error(reply || `HTTP ${res.status}`);
    } catch (err) {
      reply = "";
      if (bubble) bubble.remove();
      bubble = addBubble("assistant", "網絡好似有啲問題 🙏 可以再試一次，或者直接 WhatsApp +852 9417 7866 搵我哋～");
      console.warn("[chat]", err);
    } finally {
      typing.remove();
    }

    if (reply.trim()) {
      history.push({ role: "assistant", content: reply.trim() });
    } else {
      history.pop(); // 失敗的提問不計入對話紀錄，保持 user/assistant 交替
    }

    busy = false;
    sendBtn.disabled = false;
    input.focus();
  }

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 110) + "px";
  }

  document.querySelectorAll("[data-open-chat]").forEach((b) => b.addEventListener("click", openChat));
  document.querySelector("[data-close-chat]").addEventListener("click", closeChat);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !chat.hidden) closeChat();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send(input.value);
  });
  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", (e) => {
    // Enter 發送，Shift+Enter 換行；中文輸入法選字時不發送
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    }
  });
  chips.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") send(e.target.textContent);
  });
})();
