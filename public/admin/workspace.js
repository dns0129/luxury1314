const preview = document.documentElement.hasAttribute("data-pages-preview");
const area = document.querySelector("[data-workspace]").dataset.workspace;
const $ = (selector) => document.querySelector(selector);

if (!preview) {
  if (area === "home") await import("./admin.js");
  if (area === "patrol") await import("./patrol/patrol.js");
} else {
  for (const control of document.querySelectorAll("main input, main textarea, main select, main button, dialog input, dialog textarea, dialog select, dialog button")) {
    control.disabled = true;
  }
  if (area === "home") {
    $("#todayLabel").textContent = "";
    $("#updatedLabel").textContent = "未連接門市對話";
    $("#listCount").parentElement.hidden = true;
    $("#emptyDetail h2").textContent = "客戶對話只供店舖查閱";
    $("#emptyDetail h2 + p").textContent = "登入正式工作台後，可查閱留言及跟進記錄。";
    $("#emptyDetail a").textContent = "查看品牌網站 ↗";
    $("#configState").textContent = "設定與試聊僅在正式工作台開放";
    $("#apiKey").placeholder = "";
    $("#debugWelcome p").textContent = "請在正式工作台測試回覆。";
    $(".debug-context").hidden = true;
    const buttons = [...document.querySelectorAll(".side-nav [data-view]")];
    function showView() {
      const studio = location.hash === "#studio";
      $("#conversationsView").hidden = studio;
      $("#studioView").hidden = !studio;
      $("#breadcrumb").textContent = studio ? "AI 調試室" : "客戶對話";
      for (const button of buttons) {
        const current = button.dataset.view === (studio ? "studio" : "conversations");
        button.classList.toggle("active", current);
        if (current) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      }
    }
    for (const button of buttons) {
      button.onclick = () => { location.hash = button.dataset.view; };
    }
    addEventListener("hashchange", showView);
    showView();
  } else if (area === "patrol") {
    $("#mode").textContent = "未連接私訊渠道";
    $("#notice").textContent = "WhatsApp 與同行私訊只供店舖在正式工作台查閱及匯入。";
  }
}
