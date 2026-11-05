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
const CONTACT_EMAIL = "fractal@gmail.com";
let works = [],
  activeCategory = "all",
  returnFocus;
const referenceMarkup = $("#portfolio-grid").innerHTML;
const clientCard = $(".archive-card").outerHTML;
const marquee = $(".marquee"),
  groups = $$(".marquee-group", marquee),
  sequence = [...groups[0].children].map((n) => n.cloneNode(true));
function fillMarquee() {
  groups[0].replaceChildren(...sequence.map((n) => n.cloneNode(true)));
  const width = groups[0].getBoundingClientRect().width;
  if (!width) return;
  const repeats = Math.max(
    2,
    Math.ceil($(".marquee-band").clientWidth / width) + 1,
  );
  for (let i = 1; i < repeats; i++)
    groups[0].append(...sequence.map((n) => n.cloneNode(true)));
  groups[1].replaceChildren(
    ...[...groups[0].children].map((n) => n.cloneNode(true)),
  );
  marquee.style.animationDuration = `${groups[0].getBoundingClientRect().width / 40}s`;
}
fillMarquee();
if ("ResizeObserver" in window)
  new ResizeObserver(fillMarquee).observe($(".marquee-band"));
else window.addEventListener("resize", fillMarquee);
document.fonts?.ready.then(fillMarquee);
document.fonts?.addEventListener("loadingdone", fillMarquee);
function openDialog(dialog) {
  if (!document.querySelector("dialog[open]"))
    returnFocus = document.activeElement;
  $$("dialog[open]").forEach((d) => d.close());
  dialog.showModal();
}
$$("dialog").forEach((dialog) => {
  $("[data-close]", dialog).addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    $$("video", dialog).forEach((v) => v.pause());
    if (!document.querySelector("dialog[open]") && returnFocus?.isConnected)
      returnFocus.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  });
});
function workCard(work, index) {
  const wide = index === 2;
  return `<button type="button" class="work-card group ${wide ? "wide-card md:col-span-2" : ""}" data-work="${work.id}" aria-label="Ver ${esc(work.title)}"><div class="work-visual"><img class="card-img" src="/api/portfolio/${work.id}/cover" alt="${esc(work.title)}" loading="lazy">${work.has_video ? '<span class="portfolio-play" aria-hidden="true">▶</span>' : ""}<div class="card-meta"><div><h3>${esc(work.title)}</h3><p>${esc(categories[work.category])}</p></div><span class="arrow-circle"><iconify-icon icon="lucide:arrow-up-right" aria-hidden="true"></iconify-icon></span></div></div><div class="card-caption"><div><h3>${esc(work.title)}</h3><span>${esc(categories[work.category])}</span></div><span class="tag">${work.has_video ? "Video" : "Fotografía"}</span></div></button>`;
}
function renderPortfolio() {
  const filtered = works.filter(
    (w) => activeCategory === "all" || w.category === activeCategory,
  );
  $$("[data-category]").forEach((button) => {
    const active = button.dataset.category === activeCategory;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (!works.length) {
    $("#portfolio-grid").innerHTML = referenceMarkup;
    $$("[data-reference]", $("#portfolio-grid")).forEach(
      (card) =>
        (card.hidden =
          activeCategory !== "all" &&
          card.dataset.reference !== activeCategory),
    );
    $("#portfolio-note").hidden = false;
    $("#portfolio-more").hidden = true;
    return;
  }
  $("#portfolio-note").hidden = true;
  $("#portfolio-grid").innerHTML = filtered.length
    ? filtered.slice(0, 5).map(workCard).join("") + clientCard
    : `<div class="portfolio-empty"><h3>Esta selección está en preparación.</h3><p>Pronto encontrarás aquí nuestros trabajos de ${esc(categories[activeCategory] || "imagen")}.<br>Mientras tanto, hablemos de lo que tienes en mente.</p><button class="pill-btn pill-lime" data-contact>Cuéntanos tu idea ↗</button></div>`;
  $("#portfolio-more").hidden = filtered.length <= 5;
}
async function loadPortfolio() {
  try {
    const response = await fetch("/api/portfolio", { cache: "no-store" });
    if (!response.ok) throw new Error();
    works = await response.json();
    renderPortfolio();
  } catch {
    $("#portfolio-note").textContent =
      "No pudimos cargar la selección en este momento. Puedes escribirnos para conocer nuestros trabajos.";
  }
}
function showWork(id) {
  const work = works.find((w) => w.id === id);
  if (!work) return;
  $("#project-title").textContent = work.title;
  $("#project-category").textContent = categories[work.category];
  $("#project-description").textContent = work.description;
  $("#project-description").hidden = !work.description;
  const media = work.has_video
    ? document.createElement("video")
    : document.createElement("img");
  if (work.has_video) {
    media.src = `/api/portfolio/${work.id}/video`;
    media.poster = `/api/portfolio/${work.id}/cover`;
    media.controls = true;
    media.playsInline = true;
    media.preload = "metadata";
    media.addEventListener(
      "error",
      () => {
        const p = document.createElement("p");
        p.className = "media-failure";
        p.textContent =
          "No se pudo reproducir el video. Inténtalo de nuevo o consulta al estudio.";
        $("#project-image").append(p);
      },
      { once: true },
    );
  } else {
    media.src = `/api/portfolio/${work.id}/cover`;
    media.alt = work.title;
  }
  $("#project-image").replaceChildren(media);
  openDialog($("#project-dialog"));
}
function showArchive() {
  const list = works.filter(
    (w) => activeCategory === "all" || w.category === activeCategory,
  );
  $("#archive-list").innerHTML = list
    .map(
      (w, i) =>
        `<button data-work="${w.id}"><span class="archive-item-index">${String(i + 1).padStart(2, "0")}</span><span class="archive-item-title">${esc(w.title)}</span><span class="archive-item-category">${esc(categories[w.category])}</span><span class="archive-item-arrow">↗</span></button>`,
    )
    .join("");
  openDialog($("#archive-dialog"));
}
function setService(row, expanded) {
  row.setAttribute("aria-expanded", String(expanded));
  document.getElementById(row.getAttribute("aria-controls")).hidden = !expanded;
}
$$(".svc-row").forEach((row) =>
  row.addEventListener("click", () => {
    const expanded = row.getAttribute("aria-expanded") !== "true";
    $$(".svc-row").forEach((item) =>
      setService(item, item === row && expanded),
    );
  }),
);
$$("[data-service-link]").forEach((link) =>
  link.addEventListener("click", () => {
    const row = $(".svc-row", $(link.getAttribute("href")));
    $$(".svc-row").forEach((item) => setService(item, item === row));
  }),
);
document.addEventListener("click", (event) => {
  const work = event.target.closest("[data-work]");
  if (work) {
    showWork(work.dataset.work);
    return;
  }
  const filter = event.target.closest("[data-category]");
  if (filter) {
    activeCategory = filter.dataset.category;
    renderPortfolio();
    return;
  }
  if (event.target.closest("#open-archive")) {
    showArchive();
    return;
  }
  const contact = event.target.closest("[data-contact]");
  if (contact) {
    if (contact.dataset.intro)
      $("#contact-form select").value = "Una primera conversación";
    else {
      const service = contact.closest(".service-item");
      if (service)
        $("#contact-form select").value = $(".svc-title", service).textContent;
    }
    openDialog($("#contact-dialog"));
  }
});
const form = $("#contact-form");
function inquiry() {
  const d = new FormData(form);
  return `FRACTALX — NUEVO PROYECTO\n\nNombre: ${d.get("name")}\nCorreo: ${d.get("email")}\nServicio: ${d.get("service") || "Por definir"}\n\nLa idea:\n${d.get("message")}\n\nContacto: ${CONTACT_EMAIL}\n`;
}
function downloadText(content, name) {
  const url = URL.createObjectURL(
    new Blob(["\ufeff", content], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 4500);
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const d = new FormData(form);
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Nuevo proyecto FractalX — " + d.get("name"))}&body=${encodeURIComponent(inquiry())}`;
  $(".form-disclaimer", form).textContent =
    `Si no se abrió tu correo, descarga la consulta y envíala a ${CONTACT_EMAIL}.`;
});
$("#download-inquiry").addEventListener("click", () => {
  if (!form.reportValidity()) return;
  downloadText(inquiry(), "mi-proyecto-fractalx.txt");
  toast("Tu consulta está lista para compartir.");
});
$("#newsletter-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const email = $("#newsletter-email").value;
  downloadText(
    `FRACTALX — EL PRIMER ENFOQUE\n\nGuía para ${email}\n\n01 — TU HISTORIA\n¿Qué quieres mostrar o contar?\n\n02 — EL FORMATO\n¿Fotografía, contenido para redes, video o drones?\n\n03 — EL LUGAR Y LA FECHA\n¿Dónde y cuándo imaginas la producción?\n\n04 — TU AUDIENCIA\n¿Quién verá las imágenes y dónde las publicarás?\n\n05 — REFERENCIAS\nComparte tres referencias visuales y qué te gusta de ellas.\n\n06 — EL ALCANCE\n¿Cuántas piezas necesitas y cuál es tu presupuesto?\n\nHablemos: ${CONTACT_EMAIL}\n`,
    "guia-proyecto-fractalx.txt",
  );
  toast("Tu guía está lista. Démosle forma a esa idea.");
});
const legal = {
  privacy: {
    title: "Privacidad",
    paragraphs: [
      "El portafolio muestra únicamente los trabajos que el estudio decide publicar. Las fotografías de las galerías de clientes no se incorporan automáticamente al sitio público.",
      "El apartado de clientes utiliza una cookie de sesión necesaria para el acceso. Las cuentas, selecciones y archivos se gestionan de forma privada en el servidor. Las vistas para selección tienen marca de agua; las descargas finales se habilitan al publicar la entrega.",
      "El formulario público prepara un borrador en tu aplicación de correo o un archivo en tu dispositivo. La guía se descarga localmente y no genera una suscripción. Las fuentes se cargan desde Google Fonts.",
      "Para consultas sobre tus datos, escribe a " + CONTACT_EMAIL + ".",
    ],
  },
  terms: {
    title: "Sobre este espacio",
    paragraphs: [
      "Este es el sitio de presentación y portafolio de FractalX. El alcance, las fechas y los importes de cada proyecto se acuerdan directamente con el estudio.",
      "Mientras se prepara el portafolio, las imágenes indicadas como referencias visuales provienen de Unsplash y no se presentan como trabajos realizados por FractalX.",
      "Los trabajos publicados pertenecen a sus respectivos titulares. Los originales de las sesiones de clientes se mantienen en su apartado privado. El logotipo es el archivo proporcionado para este proyecto.",
    ],
  },
};
$$("[data-legal]").forEach((button) =>
  button.addEventListener("click", () => {
    const info = legal[button.dataset.legal];
    $("#legal-title").textContent = info.title;
    $("#legal-content").replaceChildren(
      ...info.paragraphs.map((value) => {
        const p = document.createElement("p");
        p.textContent = value;
        return p;
      }),
    );
    openDialog($("#legal-dialog"));
  }),
);
loadPortfolio();
