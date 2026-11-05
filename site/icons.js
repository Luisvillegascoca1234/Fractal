// Small local icon set for the saved site; no third-party JavaScript runs here.
const studioIcons = {
  "arrow-up-right": "M7 17 17 7M7 7h10v10",
  "arrow-right": "M5 12h14m-6-6 6 6-6 6",
  calendar: "M4 5h16v16H4ZM16 3v4M8 3v4M4 11h16",
  x: "m6 6 12 12M6 18 18 6",
  award: "M12 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm-4 12-1 7 5-3 5 3-1-7",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L2 9.6l6.2-.9Z",
};
customElements.define(
  "iconify-icon",
  class extends HTMLElement {
    connectedCallback() {
      const name = (this.getAttribute("icon") || "").split(":").pop();
      this.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${studioIcons[name] || studioIcons["arrow-up-right"]}"/></svg>`;
    }
  },
);
