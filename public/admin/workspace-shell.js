(() => {
  const sidebar = document.querySelector(".sidebar[data-workspace]");
  if (!sidebar) return;
  sidebar.innerHTML = `<a href="/" class="side-brand" aria-label="1314 Luxury 主網站"
          ><img src="/img/ai-mark.svg" alt="" /><span
            >1314 <i>Luxury</i></span
          ></a
        >
        <span class="side-subtitle">私人客服工作台</span>
        <nav class="side-nav" aria-label="後台選單">
          <button
            data-view="conversations"
            class="nav-item active"
            aria-current="page"
          >
            <span class="nav-icon" aria-hidden="true">▤</span>客戶對話<span
              id="navUnread"
              class="nav-count"
              hidden
              >0</span
            >
          </button>
          <a href="/admin/products/" data-area="products" class="nav-item" aria-label="商品管理"><span class="nav-icon" aria-hidden="true">▦</span>商品管理</a>
          <a href="/admin/patrol/" data-area="patrol" class="nav-item" aria-label="訊息巡查員"><span class="nav-icon" aria-hidden="true">◎</span>訊息巡查員</a>
          <button data-view="studio" class="nav-item">
            <span class="nav-icon" aria-hidden="true">✧</span>AI 調試室
          </button>
        </nav>
        <div class="side-bottom">
          <div class="side-service">
            <span class="status-dot" id="sideDot"></span>
            <div>
              <strong id="sideStatus">正在連線</strong
              ><span id="sideModel">讀取 AI 狀態</span>
            </div>
          </div>
          <a href="/" target="_blank" rel="noopener" class="side-link"
            >查看品牌網站 <span aria-hidden="true">↗</span></a
          >
          <div class="owner">
            <span class="owner-avatar">K</span>
            <div><strong>店舖管理員</strong><small>Owner</small></div>
            <button id="logoutBtn" aria-label="登出" title="登出">↪</button>
          </div>
        </div>`;
  const area = sidebar.dataset.workspace;
  const preview = document.documentElement.hasAttribute("data-pages-preview");
  if (preview) {
    sidebar.querySelector(".side-subtitle").textContent = "客服工作台預覽";
    sidebar.querySelector(".owner").remove();
    sidebar.querySelector(".side-service").remove();
    document.querySelector(".owner-indicator").textContent = "公開唯讀預覽";
  }
  if (area === "home") return;
  for (const button of sidebar.querySelectorAll("button[data-view]")) {
    const link = document.createElement("a");
    link.href = "/admin/#" + button.dataset.view;
    link.className = "nav-item";
    link.innerHTML = button.innerHTML;
    sidebar.querySelector("#navUnread")?.remove();
    link.querySelector("#navUnread")?.remove();
    button.replaceWith(link);
  }
  const current = sidebar.querySelector(`[data-area="${area}"]`);
  current.classList.add("active");
  current.setAttribute("aria-current", "page");
  sidebar.querySelector(".side-service")?.remove();
  document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat(
    "zh-HK",
    {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  ).format(new Date());
  if (preview) return;
  sidebar.querySelector("#logoutBtn").onclick = async () => {
    try {
      const response = await fetch("/api/admin/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok && response.status !== 401) throw Error();
      location.replace("/admin/");
    } catch {
      document.querySelector("#notice").textContent = "未能登出，請再試一次。";
    }
  };
})();
