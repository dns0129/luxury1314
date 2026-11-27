(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const state = {
    filter: "all",
    query: "",
    items: [],
    selected: null,
    detail: null,
    settings: null,
    dirty: false,
    total: 0,
    listRequest: 0,
    detailRequest: 0,
    debugging: false,
    debugHistory: [],
  };
  let toastTimer;
  let searchTimer;
  const statusLabels = {
    responding: "AI 回覆中",
    completed: "已回覆",
    error: "回覆異常",
    interrupted: "回覆未完成",
    disabled: "引導真人跟進",
  };
  const dateTime = (value) =>
    new Intl.DateTimeFormat("zh-HK", {
      timeZone: "Asia/Hong_Kong",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  const time = (value) =>
    new Intl.DateTimeFormat("zh-HK", {
      timeZone: "Asia/Hong_Kong",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function toast(message) {
    $("#toast").textContent = message;
    $("#toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      $("#toast").hidden = true;
    }, 4000);
  }
  async function api(route, options = {}) {
    const res = await fetch(`/api/admin${route}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    const body = await res.json();
    if (!res.ok) {
      if (res.status === 401 && route !== "/login") showLogin();
      throw new Error(body.error || "操作未完成，請稍後再試。");
    }
    return body;
  }
  function showLogin() {
    $("#workspace").hidden = true;
    $("#loginView").hidden = false;
    $("#password").value = "";
  }
  async function openWorkspace() {
    $("#loginView").hidden = true;
    $("#workspace").hidden = false;
    $("#todayLabel").textContent = new Intl.DateTimeFormat("zh-HK", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date());
    await Promise.all([loadList(), loadSettings()]);
    switchView(location.hash === "#studio" ? "studio" : "conversations");
  }
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#loginError").textContent = "";
    $("#loginBtn").disabled = true;
    $("#loginBtn").textContent = "正在登入…";
    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify({
          username: $("#username").value,
          password: $("#password").value,
        }),
      });
      $("#password").value = "";
      await openWorkspace();
    } catch (error) {
      $("#loginError").textContent = error.message;
    } finally {
      $("#loginBtn").disabled = false;
      $("#loginBtn").textContent = "登入工作台 ↗";
    }
  });
  $("#logoutBtn").addEventListener("click", async () => {
    if (state.dirty && !confirm("有尚未儲存的 AI 設定。確定登出？")) return;
    try {
      await api("/logout", { method: "POST", body: "{}" });
      state.settings = null;
      state.dirty = false;
      state.selected = null;
      state.detail = null;
      state.debugHistory = [];
      $("#chatMessages").replaceChildren();
      $("#debugMessages").replaceChildren();
      $("#conversationItems").replaceChildren();
      $("#systemPrompt").value = "";
      $("#apiKey").value = "";
      showLogin();
    } catch (error) {
      toast(error.message);
    }
  });
  function switchView(view) {
    const studio = view === "studio";
    $("#conversationsView").hidden = studio;
    $("#studioView").hidden = !studio;
    $("#breadcrumb").textContent = studio ? "AI 調試室" : "客戶對話";
    $$(".nav-item[data-view]").forEach((button) => {
      const selected = button.dataset.view === view;
      button.classList.toggle("active", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    history.replaceState(null, "", studio ? "#studio" : "#conversations");
  }
  $$(".nav-item[data-view]").forEach((button) =>
    button.addEventListener("click", () => switchView(button.dataset.view)),
  );
  function serviceState(service) {
    $("#sideStatus").textContent = service.connected
      ? "AI 客服已啟用"
      : "AI 客服待設定 / 暫停";
    $("#sideModel").textContent = service.model || "尚未指定模型";
    $("#sideDot").classList.toggle("off", !service.connected);
  }
  async function loadList(append = false) {
    const request = ++state.listRequest;
    const offset = append ? state.items.length : 0;
    try {
      const params = new URLSearchParams({
        q: state.query,
        filter: state.filter,
        offset: String(offset),
      });
      const data = await api(`/conversations?${params}`);
      if (request !== state.listRequest) return;
      state.items = append ? [...state.items, ...data.items] : data.items;
      state.total = data.total;
      $("#statToday").textContent = data.stats.today;
      $("#statMessages").textContent = data.stats.messages;
      $("#statTotal").textContent = `來自 ${data.stats.total} 段對話`;
      $("#statUnread").textContent = data.stats.unread;
      $("#statFollowUp").textContent = data.stats.followUp;
      $("#navUnread").textContent = data.stats.unread;
      $("#navUnread").hidden = !data.stats.unread;
      $("#updatedLabel").textContent = `${time(new Date())} 已更新`;
      serviceState(data.service);
      renderList();
    } catch (error) {
      $("#updatedLabel").textContent = "更新失敗";
      if (!state.items.length)
        $("#conversationItems").textContent = error.message;
      throw error;
    }
  }
  function renderList() {
    const container = $("#conversationItems");
    const scroll = container.scrollTop;
    container.replaceChildren();
    $("#listCount").textContent = `${state.total} 段對話`;
    $("#loadMore").hidden = state.items.length >= state.total;
    if (!state.items.length) {
      const empty = node(
        "div",
        "list-empty",
        state.query
          ? "找不到符合的對話"
          : state.filter === "unread"
            ? "目前沒有未讀對話"
            : state.filter === "followup"
              ? "目前沒有待跟進對話"
              : "等待第一位客戶的留言",
      );
      empty.append(
        node(
          "p",
          "",
          state.query
            ? "試試其他關鍵字。"
            : "客戶在網站發送訊息後，會在這裡出現。",
        ),
      );
      container.append(empty);
    }
    for (const chat of state.items) {
      const button = node(
        "button",
        `conversation-row${chat.id === state.selected ? " selected" : ""}`,
      );
      button.type = "button";
      button.setAttribute(
        "aria-label",
        `${chat.visitor}${chat.unread ? "，未讀" : ""}，${chat.title}`,
      );
      button.setAttribute("aria-pressed", String(chat.id === state.selected));
      button.append(node("span", "visitor-avatar", chat.visitor.slice(-2)));
      const body = node("div", "row-body");
      const top = node("div", "row-top");
      top.append(node("strong", "", chat.visitor));
      if (chat.unread) {
        const dot = node("span", "unread-dot");
        dot.setAttribute("aria-label", "未讀");
        top.append(dot);
      }
      const date = node("time", "", dateTime(chat.updatedAt));
      date.dateTime = chat.updatedAt;
      top.append(date);
      body.append(
        top,
        node("p", "row-title", chat.title),
        node("p", "row-preview", chat.preview),
      );
      if (chat.followUp) body.append(node("span", "row-tag", "待跟進"));
      button.append(body);
      button.addEventListener("click", () =>
        selectConversation(chat.id).catch((error) => toast(error.message)),
      );
      container.append(button);
    }
    container.scrollTop = scroll;
  }
  async function selectConversation(id, refresh = false) {
    if (
      !refresh &&
      state.selected !== id &&
      $("#internalNotes").value !== (state.detail?.notes || "") &&
      state.selected &&
      !confirm("內部備註尚未儲存。確定切換對話？")
    )
      return;
    const request = ++state.detailRequest;
    if (!refresh) state.selected = id;
    const chat = await api(`/conversations/${id}`);
    if (request !== state.detailRequest || state.selected !== id) return;
    const changed =
      !state.detail ||
      state.detail.id !== id ||
      state.detail.messages.length !== chat.messages.length ||
      state.detail.status !== chat.status;
    const notesDirty =
      state.detail?.id === id &&
      $("#internalNotes").value !== state.detail.notes;
    state.detail = chat;
    $("#emptyDetail").hidden = true;
    $("#detailContent").hidden = false;
    if (!refresh) $("#inbox").classList.add("has-selection");
    $("#detailAvatar").textContent = chat.visitor.slice(-2);
    $("#detailTitle").textContent = chat.visitor;
    $("#detailMeta").textContent =
      `${chat.source} · ${chat.userVersion} 則客戶訊息`;
    $("#detailState").textContent = statusLabels[chat.status] || chat.status;
    $("#detailTime").textContent = `開始於 ${dateTime(chat.createdAt)}`;
    $("#followUpBtn").setAttribute(
      "aria-pressed",
      String(Boolean(chat.followUp)),
    );
    $("#followUpBtn").textContent = chat.followUp ? "已標記跟進 ✓" : "標記跟進";
    if (!notesDirty) $("#internalNotes").value = chat.notes || "";
    const info = $("#visitorInfo");
    info.replaceChildren();
    for (const [label, value] of [
      ["訪客", chat.visitor],
      ["來源", chat.source],
      ["裝置", chat.device],
      ["瀏覽器語言", chat.language || "未提供"],
      ["開始時間", dateTime(chat.createdAt)],
      ["最後更新", dateTime(chat.updatedAt)],
      ["對話編號", chat.id],
    ])
      info.append(node("dt", "", label), node("dd", "", value));
    if (changed || !refresh) renderMessages(chat);
    if (!refresh) showDetailTab("messages");
    renderList();
    if (
      chat.userVersion > chat.readVersion &&
      $("#inbox").classList.contains("has-selection")
    ) {
      await api(`/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ readVersion: chat.userVersion }),
      });
      await loadList();
    }
  }
  function messageElement(message, visitor = "你") {
    const wrapper = node("article", `chat-message ${message.role}`);
    const author = node("div", "message-author");
    author.append(
      node("strong", "", message.role === "user" ? visitor : "1314 小助手"),
    );
    if (message.createdAt)
      author.append(node("time", "", time(message.createdAt)));
    wrapper.append(
      author,
      node("div", "message-bubble", message.content || "這次回覆未完成。"),
    );
    if (message.model)
      wrapper.append(
        node(
          "div",
          "message-meta",
          `${message.model} · ${((message.durationMs || 0) / 1000).toFixed(1)} 秒${message.revision ? ` · 設定 v${message.revision}` : ""}`,
        ),
      );
    return wrapper;
  }
  function renderMessages(chat) {
    const panel = $("#messagesPanel");
    const atBottom =
      panel.scrollHeight - panel.scrollTop - panel.clientHeight < 100;
    const oldScroll = panel.scrollTop;
    const container = $("#chatMessages");
    container.replaceChildren();
    container.append(node("div", "date-divider", dateTime(chat.createdAt)));
    for (const message of chat.messages)
      container.append(messageElement(message, chat.visitor));
    if (chat.error) container.append(node("div", "chat-error", chat.error));
    if (chat.status === "responding")
      container.append(
        node("div", "message-meta", "小助手正在回覆，完成後會自動更新。"),
      );
    panel.scrollTop = atBottom ? panel.scrollHeight : oldScroll;
  }
  function showDetailTab(tab) {
    const messages = tab === "messages";
    $("#messagesPanel").hidden = !messages;
    $("#infoPanel").hidden = messages;
    $("#messagesTab").setAttribute("aria-selected", String(messages));
    $("#infoTab").setAttribute("aria-selected", String(!messages));
    $("#messagesTab").tabIndex = messages ? 0 : -1;
    $("#infoTab").tabIndex = messages ? -1 : 0;
  }
  $("#messagesTab").addEventListener("click", () => showDetailTab("messages"));
  $("#infoTab").addEventListener("click", () => showDetailTab("info"));
  for (const tab of [$("#messagesTab"), $("#infoTab")]) {
    tab.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const messages =
        event.key === "Home" ||
        (event.key !== "End" && tab.id !== "messagesTab");
      showDetailTab(messages ? "messages" : "info");
      $(messages ? "#messagesTab" : "#infoTab").focus();
    });
  }
  $("#backToList").addEventListener("click", () => {
    $("#inbox").classList.remove("has-selection");
  });
  $("#followUpBtn").addEventListener("click", async () => {
    if (!state.detail) return;
    const id = state.detail.id;
    $("#followUpBtn").disabled = true;
    try {
      const marked = !state.detail.followUp;
      await api(`/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ followUp: marked }),
      });
      await selectConversation(id, true);
      await loadList();
      toast(marked ? "已標記跟進" : "已取消跟進標記");
    } catch (error) {
      toast(error.message);
    } finally {
      $("#followUpBtn").disabled = false;
    }
  });
  $("#notesForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = state.selected;
    if (!id) return;
    const notes = $("#internalNotes").value;
    $("#saveNoteBtn").disabled = true;
    try {
      await api(`/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes }),
      });
      if (state.selected === id) state.detail.notes = notes;
      toast("備註已儲存");
    } catch (error) {
      toast(error.message);
    } finally {
      $("#saveNoteBtn").disabled = false;
    }
  });
  $("#refreshBtn").addEventListener("click", async () => {
    $("#refreshBtn").disabled = true;
    try {
      await loadList();
      if (state.selected && $("#inbox").classList.contains("has-selection"))
        await selectConversation(state.selected, true);
    } catch (error) {
      toast(error.message);
    } finally {
      $("#refreshBtn").disabled = false;
    }
  });
  $$(".filters button").forEach((button) =>
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      $$(".filters button").forEach((el) => {
        el.classList.toggle("selected", el === button);
        el.setAttribute("aria-pressed", String(el === button));
      });
      loadList().catch((error) => toast(error.message));
    }),
  );
  $("#searchInput").addEventListener("input", () => {
    clearTimeout(searchTimer);
    state.query = $("#searchInput").value;
    searchTimer = setTimeout(
      () => loadList().catch((error) => toast(error.message)),
      250,
    );
  });
  $("#loadMore").addEventListener("click", async () => {
    $("#loadMore").disabled = true;
    try {
      await loadList(true);
    } catch (error) {
      toast(error.message);
    } finally {
      $("#loadMore").disabled = false;
    }
  });
  async function loadSettings() {
    const config = await api("/settings");
    state.settings = config;
    $("#systemPrompt").value = config.systemPrompt;
    $("#model").value = config.model;
    $("#baseURL").value = config.baseURL;
    $("#temperature").value = config.temperature;
    $("#maxTokens").value = config.maxTokens;
    $("#extraParams").value = JSON.stringify(config.extraParams, null, 2);
    $("#aiEnabled").checked = config.enabled;
    $("#apiKey").value = "";
    $("#keyState").textContent = config.hasApiKey
      ? "現有 API key 已設定，留空即可沿用。"
      : "尚未設定 API key。";
    $("#settingsSavedAt").textContent = config.updatedAt
      ? `上次儲存 ${dateTime(config.updatedAt)} · 版本 ${config.revision}`
      : "目前沿用網站原有設定。";
    serviceState(config);
    state.dirty = false;
    $("#configState").textContent = "已儲存的設定";
  }
  function collectSettings() {
    let extraParams;
    try {
      extraParams = JSON.parse($("#extraParams").value || "{}");
    } catch {
      throw new Error("額外參數需要有效的 JSON 格式。");
    }
    return {
      revision: state.settings?.revision,
      enabled: $("#aiEnabled").checked,
      systemPrompt: $("#systemPrompt").value,
      model: $("#model").value,
      baseURL: $("#baseURL").value,
      apiKey: $("#apiKey").value,
      temperature: Number($("#temperature").value),
      maxTokens: Number($("#maxTokens").value),
      extraParams,
    };
  }
  $("#settingsForm").addEventListener("input", () => {
    state.dirty = true;
    $("#configState").textContent = "有尚未儲存的修改";
  });
  $("#settingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("#settingsError").textContent = "";
    $("#saveSettingsBtn").disabled = true;
    try {
      const config = collectSettings();
      await api("/settings", { method: "PUT", body: JSON.stringify(config) });
      await loadSettings();
      toast("AI 設定已儲存，新的客服回覆即時生效。");
    } catch (error) {
      $("#settingsError").textContent = error.message;
      toast(error.message);
    } finally {
      $("#saveSettingsBtn").disabled = false;
    }
  });
  function clearDebug() {
    if (state.debugging) return;
    state.debugHistory = [];
    $("#debugMessages").replaceChildren(
      node("div", "debug-welcome", "輸入問題，開始新的試聊。"),
    );
    $("#debugResult").hidden = true;
  }
  $("#clearDebug").addEventListener("click", clearDebug);
  $$(".debug-suggestions button").forEach((button) =>
    button.addEventListener("click", () => {
      $("#debugInput").value = button.dataset.question;
      $("#debugForm").requestSubmit();
    }),
  );
  async function runDebug(event) {
    event.preventDefault();
    if (state.debugging || !$("#debugInput").value.trim()) return;
    let config;
    try {
      config = collectSettings();
    } catch (error) {
      toast(error.message);
      return;
    }
    const text = $("#debugInput").value.trim();
    state.debugging = true;
    $("#debugSend").disabled = true;
    $("#clearDebug").disabled = true;
    $("#debugSend").textContent = "正在回覆…";
    $("#debugWelcome")?.remove();
    const box = $("#debugMessages");
    if (!state.debugHistory.length) box.replaceChildren();
    const user = { role: "user", content: text };
    box.append(messageElement(user));
    const pending = node("p", "message-meta", "正在使用目前設定生成回覆…");
    box.append(pending);
    box.scrollTop = box.scrollHeight;
    $("#debugInput").value = "";
    try {
      const messages = [...state.debugHistory, user].slice(-19);
      while (messages[0]?.role === "assistant") messages.shift();
      const result = await api("/debug", {
        method: "POST",
        body: JSON.stringify({ settings: config, messages }),
      });
      const answer = {
        role: "assistant",
        content: result.reply,
        model: result.model,
        durationMs: result.durationMs,
      };
      box.append(messageElement(answer));
      if (result.error) box.append(node("div", "chat-error", result.error));
      state.debugHistory = [...messages, answer];
      $("#debugResult").hidden = false;
      $("#debugResult").textContent =
        `${result.status === "completed" ? "回覆完成" : statusLabels[result.status] || "測試完成"} · ${(result.durationMs / 1000).toFixed(1)} 秒 · ${result.model}${result.usage?.total_tokens ? ` · ${result.usage.total_tokens} tokens` : ""}`;
    } catch (error) {
      box.append(node("div", "chat-error", error.message));
    } finally {
      pending.remove();
      state.debugging = false;
      $("#debugSend").disabled = false;
      $("#clearDebug").disabled = false;
      $("#debugSend").textContent = "測試回覆 ↗";
      box.scrollTop = box.scrollHeight;
    }
  }
  $("#debugForm").addEventListener("submit", runDebug);
  $("#debugInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      $("#debugForm").requestSubmit();
    }
  });
  addEventListener("beforeunload", (event) => {
    if (
      state.dirty ||
      (state.selected &&
        $("#internalNotes").value !== (state.detail?.notes || ""))
    ) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  setInterval(async () => {
    if (
      document.hidden ||
      $("#workspace").hidden ||
      $("#conversationsView").hidden
    )
      return;
    try {
      await loadList();
      if (state.selected && $("#inbox").classList.contains("has-selection"))
        await selectConversation(state.selected, true);
    } catch {}
  }, 15000);
  api("/session")
    .then(openWorkspace)
    .catch(() => showLogin());
})();
