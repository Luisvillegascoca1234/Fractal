{
  const menu = document.querySelector(".nav-disclosure");
  const toggle = menu.querySelector("summary");
  const desktop = window.matchMedia("(min-width: 1024px)");

  function syncMenu() {
    menu.open = desktop.matches;
  }

  syncMenu();
  desktop.addEventListener("change", syncMenu);

  function closeOutside(event) {
    if (!desktop.matches && menu.open && !menu.contains(event.target)) {
      menu.open = false;
    }
  }

  document.addEventListener("pointerdown", closeOutside);
  document.addEventListener("focusin", closeOutside);

  menu.addEventListener("click", (event) => {
    if (!desktop.matches && event.target.closest(".nav-links a")) {
      menu.open = false;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || desktop.matches || !menu.open) return;
    event.preventDefault();
    menu.open = false;
    toggle.focus();
  });
}
