// Theme comes from ?theme=, then localStorage, then the OS. The switcher at the
// bottom right flips it and steps between prototypes.
(() => {
  const params = new URLSearchParams(location.search);
  const saved = params.get("theme") || localStorage.getItem("proto-theme");
  const theme = saved === "light" || saved === "dark"
    ? saved
    : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.dataset.theme = theme;

  const list = ["spectrum", "tiers", "harvest", "board", "timeline"];
  const here = location.pathname.split("/").pop().replace(".html", "");
  const index = list.indexOf(here);
  const link = (n) => `${list[(index + n + list.length) % list.length]}.html`;

  addEventListener("DOMContentLoaded", () => {
    if (params.get("bare") === "1") return;
    const bar = document.createElement("div");
    bar.className = "proto-bar";
    bar.innerHTML = `
      <a href="index.html" title="All prototypes">Gallery</a>
      <a href="${link(-1)}">‹</a>
      <span class="name">${index + 1} / ${list.length} ${here}</span>
      <a href="${link(1)}">›</a>
      <button data-set="light">Light</button>
      <button data-set="dark">Dark</button>`;
    const sync = () => bar.querySelectorAll("button").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.set === document.documentElement.dataset.theme)));
    bar.addEventListener("click", (e) => {
      const set = e.target.dataset && e.target.dataset.set;
      if (!set) return;
      document.documentElement.dataset.theme = set;
      localStorage.setItem("proto-theme", set);
      sync();
    });
    sync();
    document.body.appendChild(bar);
  });
})();
