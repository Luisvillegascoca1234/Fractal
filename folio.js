const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const categories = {
  fotografia: "Fotografía",
  social: "Social media",
  video: "Video",
  drones: "Drones",
};
const grid = $("#portfolio-grid");
const filters = $(".portfolio-filters");
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
let visibleProjects = references;
let viewerProjects = [];
let viewerIndex = 0;
let activeCategory = "all";
let returnFocus;

function renderPortfolio() {
  visibleProjects = references.filter(
    (project) => activeCategory === "all" || project.category === activeCategory,
  );
  $$("button", filters).forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.category === activeCategory));
  });
  grid.replaceChildren(...visibleProjects.map((project) => project.card));
  const empty = visibleProjects.length === 0;
  grid.hidden = empty;
  $("#portfolio-empty").hidden = !empty;
  $("#portfolio-note").hidden = empty;
}

function renderProject() {
  const project = viewerProjects[viewerIndex];
  $("#project-title").textContent = project.title;
  const credit = project.card.hasAttribute("data-generated") ? " · Generada con IA" : "";
  $("#project-category").textContent = categories[project.category] + " · Referencia visual" + credit;
  $("#project-description").textContent = project.description;
  $("#project-description").hidden = !project.description;
  $("#project-position").textContent = (viewerIndex + 1) + " / " + viewerProjects.length;
  $(".folio-viewer-nav").hidden = viewerProjects.length < 2;
  const image = $("img", project.card).cloneNode();
  image.loading = "eager";
  $("#project-image").replaceChildren(image);
  projectDialog.scrollTop = 0;
}

function openViewer(projects, index, button) {
  viewerProjects = projects;
  viewerIndex = index;
  returnFocus = button;
  renderProject();
  projectDialog.showModal();
}

function showWork(button) {
  const index = visibleProjects.findIndex((project) => project.id === button.dataset.work);
  if (index === -1) return;
  openViewer(visibleProjects, index, button);
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
  if (viewerProjects.length < 2) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    stepProject(event.key === "ArrowLeft" ? -1 : 1);
  }
});

grid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-work]");
  if (button) showWork(button);
});
filters.addEventListener("click", (event) => {
  const filter = event.target.closest("[data-category]");
  if (!filter) return;
  activeCategory = filter.dataset.category;
  renderPortfolio();
});
$("[data-close]", projectDialog).addEventListener("click", () => projectDialog.close());
projectDialog.addEventListener("close", () => {
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
});
projectDialog.addEventListener("click", (event) => {
  if (event.target !== projectDialog) return;
  const { left, right, top, bottom } = projectDialog.getBoundingClientRect();
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) {
    projectDialog.close();
  }
});
renderPortfolio();
