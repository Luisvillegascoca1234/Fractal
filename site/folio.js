const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const categories = {
  fotografia: "Fotografía",
  social: "Social media",
  video: "Video",
  drones: "Drones",
};
const grid = $("#portfolio-grid");
const projectDialog = $("#project-dialog");
const references = [...grid.children].map((card) => {
  const button = $("[data-reference]", card);
  return {
    card,
    id: button.getAttribute("aria-labelledby"),
    category: card.dataset.referenceCategory,
    title: $(".folio-name", button).textContent,
    description: button.dataset.description,
  };
});
for (const project of references) {
  $("[data-reference]", project.card).dataset.work = project.id;
}
let works = [];
let visibleProjects = references;
let viewerProjects = [];
let viewerIndex = 0;
let activeCategory = "all";
let returnFocus;
function workCard(work, index) {
  const id = esc(work.id);
  return `<article class="folio-card">
    <button class="folio-card-button" type="button" data-work="${id}" aria-labelledby="work-${id}">
      <span class="folio-image">
        <img src="/api/portfolio/${id}/cover" alt="" loading="${index < 2 ? "eager" : "lazy"}" decoding="async">
        ${work.has_video ? '<span class="portfolio-play" aria-hidden="true">▶</span>' : ""}
      </span>
      <span class="folio-caption">
        <span id="work-${id}" class="folio-name">${esc(work.title)}</span>
        <span class="folio-kind">${esc(categories[work.category])}</span>
      </span>
    </button>
  </article>`;
}
function renderPortfolio() {
  visibleProjects = (works.length ? works : references).filter(
    (project) => activeCategory === "all" || project.category === activeCategory,
  );
  $$(".portfolio-filters button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.category === activeCategory));
  });
  if (works.length) {
    grid.innerHTML = visibleProjects.map(workCard).join("");
  } else {
    grid.replaceChildren(...visibleProjects.map((project) => project.card));
  }
  const empty = visibleProjects.length === 0;
  grid.hidden = empty;
  $("#portfolio-empty").hidden = !empty;
  $("#portfolio-note").hidden = works.length > 0 || empty;
}
async function loadPortfolio() {
  try {
    const response = await fetch("/api/portfolio", { cache: "no-store" });
    if (!response.ok) throw new Error();
    works = await response.json();
    if (works.length) renderPortfolio();
  } catch {
    $("#portfolio-note").textContent =
      "Referencias visuales · El portafolio no pudo cargarse.";
  }
}
function projectMedia(project) {
  if (project.card) {
    const image = $("img", project.card).cloneNode();
    image.loading = "eager";
    return image;
  }
  if (!project.has_video) {
    const image = document.createElement("img");
    image.src = `/api/portfolio/${project.id}/cover`;
    image.alt = project.title;
    return image;
  }
  const video = document.createElement("video");
  video.src = `/api/portfolio/${project.id}/video`;
  video.poster = `/api/portfolio/${project.id}/cover`;
  video.controls = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.addEventListener("error", () => {
    if (!video.isConnected) return;
    const message = document.createElement("p");
    message.className = "media-failure";
    message.textContent = "No se pudo reproducir el video.";
    video.after(message);
  }, { once: true });
  return video;
}
function renderProject() {
  const project = viewerProjects[viewerIndex];
  $("#project-title").textContent = project.title;
  const category = categories[project.category];
  const credit = project.card?.hasAttribute("data-generated") ? " · Generada con IA" : "";
  $("#project-category").textContent = project.card
    ? `${category} · Referencia visual${credit}`
    : category;
  $("#project-description").textContent = project.description;
  $("#project-description").hidden = !project.description;
  $("#project-position").textContent = `${viewerIndex + 1} / ${viewerProjects.length}`;
  $(".folio-viewer-nav").hidden = viewerProjects.length < 2;
  const media = $("#project-image");
  $("video", media)?.pause();
  media.replaceChildren(projectMedia(project));
  projectDialog.scrollTop = 0;
}
function showWork(button) {
  const index = visibleProjects.findIndex((project) => project.id === button.dataset.work);
  if (index === -1) return;
  viewerProjects = visibleProjects;
  viewerIndex = index;
  renderProject();
  returnFocus = button;
  projectDialog.showModal();
}
function stepProject(direction) {
  const count = viewerProjects.length;
  if (count < 2) return;
  viewerIndex = (viewerIndex + direction + count) % count;
  renderProject();
}
$$("[data-project-step]", projectDialog).forEach((button) => {
  button.addEventListener("click", () => stepProject(Number(button.dataset.projectStep)));
});
projectDialog.addEventListener("keydown", (event) => {
  if (event.target.closest("video")) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    stepProject(event.key === "ArrowLeft" ? -1 : 1);
  }
});

grid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-work]");
  if (button) showWork(button);
});
$(".portfolio-filters").addEventListener("click", (event) => {
  const filter = event.target.closest("[data-category]");
  if (!filter) return;
  activeCategory = filter.dataset.category;
  renderPortfolio();
});
$("[data-close]", projectDialog).addEventListener("click", () => projectDialog.close());
projectDialog.addEventListener("close", () => {
  $("video", projectDialog)?.pause();
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
});
projectDialog.addEventListener("click", (event) => {
  if (event.target !== projectDialog) return;
  const { left, right, top, bottom } = projectDialog.getBoundingClientRect();
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) {
    projectDialog.close();
  }
});
loadPortfolio();
