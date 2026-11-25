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
let works = [];
let previewWork;
let visibleProjects = references;
let viewerProjects = [];
let viewerIndex = 0;
let activeCategory = "all";
let returnFocus;

function categoryName(project) {
  return project.category_name || categories[project.category] || project.category;
}

function coverLayout(width, height) {
  if (!width || !height) return "";
  if (width < height) return "portrait";
  return width / height < 1.26 ? "square" : "landscape";
}

function workUrl(work, privatePreview = false) {
  const prefix = privatePreview ? "/api/admin/portfolio" : "/api/portfolio";
  return `${prefix}/${encodeURIComponent(work.id)}`;
}

function itemUrl(work, item, privatePreview = false) {
  return `${workUrl(work, privatePreview)}/items/${encodeURIComponent(item.id)}`;
}

function workCard(work, index) {
  const id = esc(work.id);
  const clip = work.has_cover === false && work.items?.find((item) => item.kind === "video");
  const layout = clip
    ? coverLayout(clip.width, clip.height)
    : coverLayout(work.cover_width, work.cover_height);
  const cover = clip
    ? `<video class="folio-card-video" muted playsinline preload="metadata" aria-hidden="true" tabindex="-1" data-src="${esc(itemUrl(work, clip, work.privatePreview))}#t=0.1"></video>`
    : `<img src="${esc(workUrl(work, work.privatePreview))}/cover" alt="" loading="${index < 2 ? "eager" : "lazy"}" decoding="async">`;
  return `<article class="folio-card"${layout ? ` data-cover-layout="${layout}"` : ""}>
    <button class="folio-card-button" type="button" data-work="${id}" aria-labelledby="work-${id}">
      <span class="folio-image">
        ${cover}
        ${work.has_video ? '<span class="portfolio-play" aria-hidden="true">▶</span>' : ""}
      </span>
      <span class="folio-caption">
        <span id="work-${id}" class="folio-name">${esc(work.title)}</span>
        <span class="folio-kind">${esc(categoryName(work))}</span>
      </span>
    </button>
  </article>`;
}

const videoCovers = new IntersectionObserver((entries, observer) => {
  for (const { target, isIntersecting } of entries) {
    if (!isIntersecting) continue;
    observer.unobserve(target);
    target.src = target.dataset.src;
  }
}, { rootMargin: "360px" });

function renderCovers() {
  videoCovers.disconnect();
  grid.querySelectorAll("video[data-src]").forEach((video) => {
    video.addEventListener("loadedmetadata", () => {
      const layout = coverLayout(video.videoWidth, video.videoHeight);
      if (layout) video.closest(".folio-card").dataset.coverLayout = layout;
    }, { once: true });
    videoCovers.observe(video);
  });
}

function renderFilters(savedCategories) {
  const known = new Set($$("button", filters).map((button) => button.dataset.category));
  const entries = [...savedCategories, ...works.map((work) => ({
    id: work.category,
    name: categoryName(work),
  }))];
  for (const { id, name } of entries) {
    if (known.has(id)) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.category = id;
    button.textContent = name;
    filters.append(button);
    known.add(id);
  }
  filters.toggleAttribute("data-dynamic", known.size > 5);
}

function renderPortfolio() {
  const projects = previewWork ? [previewWork] : works.length ? works : references;
  visibleProjects = projects.filter(
    (project) => activeCategory === "all" || project.category === activeCategory,
  );
  $$("button", filters).forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.category === activeCategory));
  });
  if (works.length || previewWork) {
    grid.innerHTML = visibleProjects.map(workCard).join("");
    renderCovers();
  } else {
    grid.replaceChildren(...visibleProjects.map((project) => project.card));
  }
  const empty = visibleProjects.length === 0;
  grid.hidden = empty;
  $("#portfolio-empty").hidden = !empty;
  $("#portfolio-note").hidden = works.length > 0 || !!previewWork || empty;
}
async function loadPortfolio() {
  try {
    const [response, categoryResponse] = await Promise.all([
      fetch("/api/portfolio", { cache: "no-store" }),
      fetch("/api/portfolio/categories", { cache: "no-store" }).catch(() => null),
    ]);
    if (!response.ok) throw new Error();
    works = await response.json();
    const savedCategories = categoryResponse?.ok ? await categoryResponse.json() : [];
    renderFilters(savedCategories);
    renderPortfolio();
  } catch {
    $("#portfolio-note").textContent =
      "Referencias visuales · El portafolio no pudo cargarse.";
  }
}

function projectMedia(project, item, position) {
  if (project.card) {
    const image = $("img", project.card).cloneNode();
    image.loading = "eager";
    return image;
  }
  const base = workUrl(project, project.privatePreview);
  const label = item
    ? `${item.kind === "image" ? "Foto" : "Video"} ${position + 1} de ${project.title}`
    : project.title;
  const hasImage = item ? item.kind === "image" : !project.has_video;
  if (hasImage) {
    const image = document.createElement("img");
    image.src = item ? itemUrl(project, item, project.privatePreview) : `${base}/cover`;
    image.alt = label;
    image.loading = position > 1 ? "lazy" : "eager";
    image.decoding = "async";
    if (item?.width && item.height) {
      image.width = item.width;
      image.height = item.height;
    }
    return image;
  }
  const video = document.createElement("video");
  video.src = item ? itemUrl(project, item, project.privatePreview) : `${base}/video`;
  if (project.has_cover !== false && position === 0) video.poster = `${base}/cover`;
  video.setAttribute("aria-label", label);
  video.controls = true;
  video.playsInline = true;
  video.preload = position > 0 ? "none" : "metadata";
  video.addEventListener("error", () => {
    if (!video.isConnected) return;
    const message = document.createElement("p");
    message.className = "media-failure";
    message.textContent = "No se pudo reproducir el video.";
    video.after(message);
  }, { once: true });
  return video;
}

function renderProjectMedia(container, project) {
  $$("video", container).forEach((video) => video.pause());
  const items = project.items || [];
  container.classList.toggle("folio-viewer-gallery", items.length > 1);
  if (items.length < 2) {
    container.replaceChildren(projectMedia(project, items[0], 0));
    return;
  }

  const content = document.createDocumentFragment();
  const isPortrait = (item) => item?.kind === "image" && item.width > 0 && item.width < item.height;
  let pairPending = false;
  items.forEach((item, index) => {
    const figure = document.createElement("figure");
    figure.className = "folio-viewer-item";
    const startsPair = !pairPending && isPortrait(item) && isPortrait(items[index + 1]);
    if (startsPair || pairPending) figure.classList.add("folio-viewer-pair");
    pairPending = startsPair;
    figure.append(projectMedia(project, item, index));
    content.append(figure);
  });
  container.replaceChildren(content);
}

function renderProject() {
  const project = viewerProjects[viewerIndex];
  $("#project-title").textContent = project.title;
  const category = categoryName(project);
  const credit = project.card?.hasAttribute("data-generated") ? " · Generada con IA" : "";
  $("#project-category").textContent = project.card
    ? `${category} · Referencia visual${credit}`
    : category;
  $("#project-description").textContent = project.description;
  $("#project-description").hidden = !project.description;
  $("#project-position").textContent = `${viewerIndex + 1} / ${viewerProjects.length}`;
  $(".folio-viewer-nav").hidden = viewerProjects.length < 2;
  $("#project-preview-label").hidden = !project.privatePreview;
  renderProjectMedia($("#project-image"), project);
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

async function loadPreview() {
  const id = new URLSearchParams(window.location.search).get("vista-previa");
  if (!id) return;
  const status = $("#portfolio-preview-status");
  try {
    const response = await fetch(workUrl({ id }, true), { cache: "no-store" });
    if (response.status === 401 || response.status === 403) {
      status.textContent = "Inicia sesión como administrador para abrir la vista previa.";
    } else if (response.ok) {
      const project = await response.json();
      previewWork = { ...project, privatePreview: true };
      activeCategory = "all";
      filters.hidden = true;
      status.textContent = "Vista previa del trabajo";
      status.hidden = false;
      renderPortfolio();
      openViewer(visibleProjects, 0, $("[data-work]", grid));
      return;
    } else {
      status.textContent = "No se encontró el trabajo para esta vista previa.";
    }
  } catch {
    status.textContent = "No se pudo cargar la vista previa.";
  }
  status.hidden = false;
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
  if (event.target.closest("video") || viewerProjects.length < 2) return;
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
  $$("video", projectDialog).forEach((video) => video.pause());
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
});
projectDialog.addEventListener("click", (event) => {
  if (event.target !== projectDialog) return;
  const { left, right, top, bottom } = projectDialog.getBoundingClientRect();
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) {
    projectDialog.close();
  }
});
loadPortfolio().then(loadPreview);
