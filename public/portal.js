const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  plus: "M12 5v14M5 12h14",
  arrow: "M7 17 17 7M7 7h10v10",
  right: "M5 12h14m-6-6 6 6-6 6",
  left: "M19 12H5m6-6-6 6 6 6",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  image:
    "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm-1 13 5-5 5 5 3-3 5 5M9 7h.01",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 1a4 4 0 0 1 0 8m4 9v-2a4 4 0 0 0-3-3.87",
  lock: "M5 10h14v11H5Zm3 0V6a4 4 0 0 1 8 0v4m-4 5v2",
  upload: "M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5",
  download: "M12 3v13m-5-5 5 5 5-5M3 16v5h18v-5",
  search: "M21 21l-5-5M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z",
  logout: "M9 21H4V3h5m6 4 5 5-5 5m-6-5h11",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-8 4H2m20 0h-2M12 4V2m0 20v-2M6.3 6.3 4.9 4.9m14.2 14.2-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4",
  eye: "M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  copy: "M8 8h13v13H8ZM3 16V3h13",
  key: "M15 8a5 5 0 1 0 5 5 5 5 0 0 0-5-5Zm-4 8-8 5v-4l5-4",
  archive: "M3 3h18v5H3Zm2 5v13h14V8m-10 5h6",
};
const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.image}"/></svg>`;
const state = {
  user: null,
  csrf: null,
  view: "galleries",
  galleries: [],
  portfolio: [],
  clients: [],
  gallery: null,
  filter: "all",
  photoFilter: "all",
  search: "",
  pageSize: 60,
  lightbox: null,
  busy: false,
  uploadBusy: false,
  credentials: null,
};
const statusNames = {
  draft: "Borrador",
  selecting: "En selección",
  confirmed: "Selección confirmada",
  editing: "En edición",
  delivered: "Entrega lista",
  archived: "Archivada",
};
const isAdmin = () => state.user?.role === "admin";
const money = (cents, currency = "BOB") =>
  new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
const shortDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-BO", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(value + "T12:00:00"))
    : "Sin fecha";
const badge = (g) =>
  `<span class="tag ${esc(g.status)}">${statusNames[g.status] || esc(g.status)}</span>`;
const logo = () =>
  '<img class="logo" src="/clientes/assets/fractalx-logo-transparent.svg" alt="FractalX">';
const btn = (label, action, type = "secondary", glyph = "", extra = "") =>
  `<button type="button" class="btn btn-${type}" data-action="${action}" ${extra}>${glyph ? icon(glyph) : ""}${label}</button>`;
async function api(url, { method = "GET", body, raw = false } = {}) {
  const headers = {};
  if (state.csrf) headers["X-CSRF-Token"] = state.csrf;
  if (body && !raw) headers["Content-Type"] = "application/json";
  const response = await fetch("/api" + url, {
    method,
    headers,
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await response
    .json()
    .catch(() => ({ error: "No se pudo leer la respuesta del servidor." }));
  if (!response.ok) {
    if (response.status === 401 && state.user) {
      state.user = null;
      renderAuth(false);
    }
    const error = new Error(data.error || "No se pudo completar la acción.");
    error.status = response.status;
    throw error;
  }
  return data;
}
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("visible");
  toastTimer = setTimeout(() => $("#toast").classList.remove("visible"), 5000);
}
function rememberSession(data) {
  state.user = data.user;
  state.csrf = data.csrf;
}
function modal(html) {
  $("#modal-content").innerHTML = html;
  if (!$("#modal").open) $("#modal").showModal();
}
function closeModal() {
  if (state.uploadBusy) return;
  $("#modal").close();
  $("#modal-content").replaceChildren();
  state.credentials = null;
}
const modalHead = (label, title, description = "") =>
  `<div class="dialog-head"><p class="eyebrow">(${label})</p><h2 id="modal-title">${title}</h2>${description ? `<p>${description}</p>` : ""}</div>`;
const errorBox = '<div class="form-error" role="alert" id="form-error"></div>';
function renderAuth(setup = false, change = false) {
  const title = change
    ? "Una clave<br>solo tuya."
    : setup
      ? "Tu estudio,<br>tu espacio."
      : "Bienvenido<br>a tu espacio.";
  $("#app").innerHTML =
    `<main id="main" class="auth-page"><section class="auth-art">${logo()}<div class="auth-art-copy"><p class="eyebrow">(Tu historia, en cada imagen)</p><h1 class="display">TU MIRADA. <br>EN BUENAS<br><span class="accent">MANOS.</span></h1><p>Un espacio para encontrar tus favoritas.<br>Elige las fotos que cuentan tu historia.<br>Nosotros cuidamos cada detalle.</p><div class="auth-art-bottom"><span>SELECCIONA. CONFIRMA. RECIBE.</span><span class="auth-star">✦</span></div></div></section><section class="auth-form-side"><div class="auth-form-top"><a href="/">← Volver al portafolio</a><i></i> ESPACIO PRIVADO</div><div class="auth-form"><p class="eyebrow">(${change ? "Protege tu cuenta" : setup ? "Configuración inicial" : "El siguiente paso de tu sesión"})</p><h2>${title}</h2><p>${change ? "Antes de entrar, cambia la contraseña temporal que te compartió el estudio." : setup ? "Crea tu cuenta de administrador para comenzar a gestionar clientes, selecciones y entregas." : "Entra con la cuenta que te asignó el estudio para ver tus sesiones y elegir tus favoritas."}</p><form id="auth-form" data-mode="${change ? "password" : setup ? "setup" : "login"}">${errorBox}${setup ? '<label class="field">Tu nombre<input name="name" autocomplete="name" required maxlength="100" placeholder="Tu nombre o el del estudio"></label>' : ""}${!change ? '<label class="field">Correo electrónico<input type="email" name="email" required autocomplete="username" maxlength="254" placeholder="tu@correo.com"></label>' : ""}<label class="field">${change ? "Contraseña temporal" : "Contraseña"}<span class="password-wrap"><input type="password" name="${change ? "currentPassword" : "password"}" required autocomplete="${setup ? "new-password" : "current-password"}" ${setup ? 'minlength="12"' : ""} maxlength="128" placeholder="${setup ? "Mínimo 12 caracteres" : "Tu contraseña"}"><button type="button" data-action="show-password" aria-label="Mostrar contraseña">${icon("eye")}</button></span></label>${change ? '<label class="field">Nueva contraseña<input type="password" name="newPassword" required minlength="12" maxlength="128" autocomplete="new-password" placeholder="Al menos 12 caracteres"><small>Elige una frase larga que puedas recordar.</small></label>' : ""}<button class="btn btn-primary submit" type="submit">${change ? "Guardar y entrar" : setup ? "Crear mi administrador" : "Entrar a mi cuenta"} ${icon("arrow")}</button></form><div class="auth-help">${setup ? "Esta cuenta tendrá acceso a todas las galerías y podrá crear las cuentas de tus clientes." : change ? "Tu contraseña temporal dejará de funcionar al guardar la nueva." : "<b>¿Es tu primera visita?</b><br>Utiliza el acceso que te compartió el estudio. Si olvidaste tu contraseña, pide una nueva al administrador."}</div>${change ? btn("Volver al acceso", "logout", "plain") : ""}</div><div class="auth-footer"><span>© FractalX · Portal fotográfico</span><span>DISEÑO CON INTENCIÓN. ✦</span></div></section></main>`;
}
function navigation() {
  return `<header class="topbar shell"><nav class="nav glass ${isAdmin() ? "admin-nav" : ""}" aria-label="Navegación principal"><div class="nav-left"><a href="/" aria-label="FractalX, sitio web principal">${logo()}</a><div class="nav-links"><button data-action="home" class="${["galleries", "gallery"].includes(state.view) ? "active" : ""}">${isAdmin() ? "Galerías" : "Mis galerías"}</button>${isAdmin() ? `<button data-action="clients" class="${state.view === "clients" ? "active" : ""}">Clientes</button><button data-action="portfolio" class="${state.view === "portfolio" ? "active" : ""}">Portafolio</button>` : ""}</div></div><div class="nav-right"><button class="user-chip" data-action="account" aria-label="Mi cuenta"><span class="avatar">${esc(
    state.user.name
      .split(" ")
      .slice(0, 2)
      .map((v) => v[0])
      .join(""),
  )}</span><span><strong>${esc(state.user.name)}</strong><small>${isAdmin() ? "Administrador" : "Cliente"}</small></span></button><span class="nav-separator"></span><button class="icon-btn" data-action="logout" aria-label="Cerrar sesión">${icon("logout")}</button></div></nav></header>`;
}
function footer() {
  return '<footer class="workspace-footer shell"><span>© FractalX · Tu espacio fotográfico</span><span><a href="/">Volver al sitio web</a> <b>✦</b></span></footer>';
}
function render() {
  if (!state.user) return;
  if (state.user.mustChange) {
    renderAuth(false, true);
    return;
  }
  $("#app").innerHTML =
    navigation() +
    `<main id="main" class="workspace shell">${state.view === "gallery" ? galleryView() : state.view === "clients" ? clientsView() : state.view === "portfolio" ? portfolioView() : galleriesView()}</main>` +
    footer() +
    (state.view === "gallery" &&
    !isAdmin() &&
    state.gallery.status === "selecting"
      ? selectionBar()
      : "");
}
async function loadHome() {
  state.galleries = await api("/galleries");
  if (isAdmin()) state.clients = await api("/clients");
  state.view = "galleries";
  state.gallery = null;
  render();
}
const workCategories = {
  fotografia: "Fotografía",
  social: "Social media",
  video: "Video",
  drones: "Drones",
};
async function loadPortfolioAdmin() {
  state.portfolio = await api("/admin/portfolio");
  state.view = "portfolio";
  state.gallery = null;
  render();
}
function portfolioView() {
  return `<div class="page-head"><div><p class="eyebrow">(Tu escaparate público / 03)</p><h1 class="display">EL TRABAJO<br><span>QUE SE VE.</span></h1><p class="head-copy">Publica fotografías, contenido para social media, videos y tomas con drones en tu sitio web.</p></div><div class="head-actions"><a class="btn btn-secondary" href="/" target="_blank" rel="noopener">Ver sitio web ${icon("arrow")}</a>${btn("Nuevo trabajo", "new-work", "primary", "plus")}</div></div><p class="protected-note">${icon("lock")}Solo aparecen en el sitio los trabajos que publiques aquí. Las galerías de clientes son privadas.</p>${state.portfolio.length ? `<div class="portfolio-admin-grid gallery-grid">${state.portfolio.map((w) => `<article class="gallery-card portfolio-admin-card"><div class="gallery-cover"><img src="/api/admin/portfolio/${w.id}/cover" alt="${esc(w.title)}" loading="lazy"><span class="tag ${w.published ? "selecting" : "draft"}">${w.published ? "Publicado" : "Borrador"}</span></div><div class="gallery-card-body"><h2>${esc(w.title)}</h2><p>${esc(workCategories[w.category])} · ${w.has_video ? "Video MP4" : "Fotografía"}</p><div class="portfolio-admin-actions">${btn("Editar", "edit-work", "secondary", "settings", `data-id="${w.id}"`)}${btn(w.published ? "Retirar del sitio" : "Publicar", "publish-work", w.published ? "secondary" : "primary", w.published ? "archive" : "arrow", `data-id="${w.id}"`)}</div></div></article>`).join("")}</div>` : `<section class="empty"><span class="empty-icon">${icon("image")}</span><h2>Tus trabajos tienen su lugar.</h2><p>Agrega una portada JPG, elige la categoría y sube un MP4 si es un video. Revisa el trabajo y publícalo en el sitio principal.</p>${btn("Crear primer trabajo", "new-work", "primary", "plus")}</section>`}`;
}
function portfolioForm(work = null) {
  modal(
    modalHead(
      "Portafolio público",
      work ? "Editar trabajo" : "Nuevo trabajo",
      "Los archivos de este formulario son para tu sitio web. Publica únicamente material que quieras mostrar de forma pública.",
    ) +
      `<form id="portfolio-form" data-id="${work?.id || ""}">${errorBox}<label class="field">Título del trabajo<input name="title" required maxlength="120" value="${esc(work?.title || "")}" placeholder="Ej. Retratos · Luz natural"></label><label class="field">Categoría<select name="category" required>${Object.entries(
        workCategories,
      )
        .map(
          ([value, label]) =>
            `<option value="${value}" ${work?.category === value ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select></label><label class="field">Descripción<textarea name="description" maxlength="1200" placeholder="Cuenta la idea detrás de este trabajo…">${esc(work?.description || "")}</textarea></label><label class="field">${work ? "Reemplazar portada (opcional)" : "Portada o fotografía"}<input type="file" name="cover" accept="image/jpeg,.jpg,.jpeg" ${work ? "" : "required"}><small>JPG de hasta 35 MB. Se utiliza en las tarjetas del portafolio.</small></label><label class="field">Video MP4 (opcional)<input type="file" name="video" accept="video/mp4,.mp4"><small>Hasta 300 MB. Las categorías Video y Drones requieren un MP4 para publicar.</small></label>${work?.has_video ? '<label class="field-check"><input type="checkbox" name="remove_video">Quitar el video actual</label>' : ""}<p class="dialog-note">Los trabajos nuevos se guardan como borradores. Después puedes pulsar Publicar para mostrarlos en la página principal.</p><div class="dialog-actions">${btn("Cancelar", "close-modal")}<button type="submit" class="btn btn-primary">Guardar trabajo ${icon("check")}</button></div></form>`,
  );
}
function galleriesView() {
  const active = state.galleries.filter((g) => g.status !== "archived");
  const filtered = state.galleries.filter(
    (g) =>
      (state.filter === "all"
        ? g.status !== "archived"
        : state.filter === "editing"
          ? ["confirmed", "editing"].includes(g.status)
          : g.status === state.filter) &&
      (g.title + " " + g.client_name)
        .toLowerCase()
        .includes(state.search.toLowerCase()),
  );
  return `<div class="page-head"><div><p class="eyebrow">(${isAdmin() ? "Tu estudio, en orden" : "Tu espacio, tus recuerdos"} / 01)</p><h1 class="display">${isAdmin() ? "CADA SESIÓN,<br><span>EN SU LUGAR.</span>" : "TUS MEJORES<br><span>MOMENTOS.</span>"}</h1><p class="head-copy">${isAdmin() ? "De la primera selección a la entrega final. Todo, en un mismo espacio." : "Encuentra tu sesión, elige tus favoritas y deja el resto en nuestras manos."}</p></div>${isAdmin() ? `<div class="head-actions">${btn("Nuevo cliente", "new-client", "secondary", "users")}${btn("Nueva galería", "new-gallery", "primary", "plus")}</div>` : ""}</div><div class="stats-row">${[
    [active.length, "Galerías activas"],
    [active.filter((g) => g.status === "selecting").length, "En selección"],
    [
      active.filter((g) => ["confirmed", "editing"].includes(g.status)).length,
      "Para editar",
    ],
    [active.filter((g) => g.status === "delivered").length, "Entregas listas"],
  ]
    .map(
      ([n, label], i) =>
        `<div class="stat"><b class="${i === 0 ? "accent" : ""}">${String(n).padStart(2, "0")}</b><small>${label}</small></div>`,
    )
    .join(
      "",
    )}</div><div class="toolbar"><div class="filters">${[["all", "Todas"], ["selecting", "En selección"], ["editing", "En edición"], ["delivered", "Entregadas"], ...(isAdmin() ? [["archived", "Archivadas"]] : [])].map(([value, label]) => `<button data-action="filter" data-value="${value}" class="${state.filter === value ? "active" : ""}">${label}</button>`).join("")}</div><label class="search">${icon("search")}<input id="gallery-search" type="search" aria-label="Buscar galería" placeholder="Buscar una sesión…" value="${esc(state.search)}"></label></div><div id="gallery-results">${galleryResults(filtered)}</div>${
    !state.galleries.length
      ? `<div class="workflow-hints">${[
          ["01", "Crea una cuenta", "Asigna un acceso privado a cada cliente."],
          [
            "02",
            "Prepara su galería",
            "Sube los JPG y define cuántas fotos incluye.",
          ],
          [
            "03",
            "Recibe su selección",
            "El cliente confirma sus favoritas y los extras.",
          ],
          [
            "04",
            "Entrega las editadas",
            "Publica las fotos listas para descargar.",
          ],
        ]
          .map(
            ([n, title, copy]) =>
              `<div><span>${n} / ${title}</span><p>${copy}</p></div>`,
          )
          .join("")}</div>`
      : ""
  }`;
}
function galleryResults(rows) {
  return rows.length
    ? `<div class="gallery-grid">${rows.map((g) => `<button class="gallery-card" data-action="open-gallery" data-id="${g.id}" aria-label="Abrir ${esc(g.title)}"><div class="gallery-cover">${g.cover ? `<img src="/api/photos/${g.cover}/preview" alt="Vista previa de ${esc(g.title)}" loading="lazy" draggable="false">` : `<span class="cover-icon">${icon("image")}</span>`}${badge(g)}</div><div class="gallery-card-body"><h2>${esc(g.title)}</h2><p>${esc(g.client_name)} <span>·</span> ${shortDate(g.event_date)}</p><div class="gallery-card-meta"><span>${g.photo_count} fotos <span>·</span> ${g.selected_count} elegidas</span><span class="arrow">${icon("arrow")}</span></div></div></button>`).join("")}</div>`
    : `<section class="empty"><span class="empty-icon">${icon("image")}</span><h2>${state.galleries.length ? "No encontramos esa sesión." : isAdmin() ? "Aquí empieza la próxima sesión." : "Tus recuerdos llegarán aquí."}</h2><p>${state.galleries.length ? "Prueba con otro nombre o cambia el filtro." : isAdmin() ? "Crea una cuenta para tu cliente y prepara su primera galería. Tú decides el cupo, los extras y cuándo publicar." : "El estudio está preparando tu galería. En cuanto esté abierta, podrás empezar a elegir tus fotos."}</p>${isAdmin() && !state.galleries.length ? btn(state.clients.length ? "Crear primera galería" : "Crear primer cliente", state.clients.length ? "new-gallery" : "new-client", "primary", "plus") : ""}</section>`;
}
function clientsView() {
  return `<div class="page-head"><div><p class="eyebrow">(Personas, no solo cuentas / 02)</p><h1 class="display">BUENAS<br><span>CONEXIONES.</span></h1><p class="head-copy">Un acceso privado para cada cliente. Una experiencia cuidada para todos.</p></div>${btn("Nuevo cliente", "new-client", "primary", "plus")}</div>${state.clients.length ? `<div class="table-wrap"><table><thead><tr><th>Cliente</th><th class="table-email">Correo</th><th>Galerías</th><th>Cuenta</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${state.clients.map((c) => `<tr><td><div class="client-identity"><span class="avatar">${esc(c.name[0])}</span><span><strong>${esc(c.name)}</strong><small>${c.must_change ? "Contraseña temporal" : "Acceso configurado"}</small></span></div></td><td class="table-email">${esc(c.email)}</td><td>${c.gallery_count}</td><td><span class="tag ${c.active ? "selecting" : "archived"}">${c.active ? "Activa" : "Inactiva"}</span></td><td><div class="row-actions"><button class="btn btn-secondary btn-small" data-action="reset-client" data-id="${c.id}" aria-label="Restablecer contraseña de ${esc(c.name)}">${icon("key")}<span>Nueva contraseña</span></button><button class="icon-btn" data-action="toggle-client" data-id="${c.id}" aria-label="${c.active ? "Desactivar" : "Activar"} cuenta de ${esc(c.name)}">${icon(c.active ? "lock" : "check")}</button></div></td></tr>`).join("")}</tbody></table></div><span class="count-label">${state.clients.length} cuentas de clientes. Las contraseñas solo se muestran al crearlas o restablecerlas.</span>` : `<section class="empty"><span class="empty-icon">${icon("users")}</span><h2>Tu próximo cliente empieza aquí.</h2><p>Asigna una cuenta y comparte su contraseña temporal de forma privada. Al entrar, podrá crear su propia contraseña.</p>${btn("Crear cliente", "new-client", "primary", "plus")}</section>`}`;
}
async function openGallery(id) {
  state.gallery = await api("/galleries/" + id);
  state.view = "gallery";
  state.photoFilter = "all";
  state.pageSize = 60;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
const chosen = () => state.gallery.photos.filter((p) => p.selected);
const extraCount = () =>
  Math.max(0, chosen().length - state.gallery.included_count);
function workflow(g) {
  const current = {
    draft: 0,
    selecting: 1,
    confirmed: 2,
    editing: 2,
    delivered: 3,
    archived: -1,
  }[g.status];
  return `<div class="workflow" aria-label="Estado de la sesión">${["Preparación", "Selección", "Edición", "Entrega"].map((label, i) => `${i ? '<span class="workflow-line"></span>' : ""}<span class="workflow-step ${i < current ? "done" : i === current ? "current" : ""}"><span>${i < current ? "✓" : i + 1}</span>${label}</span>`).join("")}</div>`;
}
function galleryView() {
  const g = state.gallery,
    selected = chosen(),
    extras = extraCount(),
    admin = isAdmin(),
    editing = ["confirmed", "editing"].includes(g.status);
  return `<div class="breadcrumb"><button data-action="home">${admin ? "Galerías" : "Mis galerías"}</button><span>/</span><span>${esc(g.title)}</span></div><div class="gallery-detail-head"><div>${badge(g)}<h1>${esc(g.title)}</h1><div class="detail-sub"><span>${esc(g.client_name)}</span><span>${shortDate(g.event_date)}</span><span>${!admin && g.status === "delivered" ? selected.length : g.photo_count} fotografías</span></div></div><div class="detail-actions">${admin && ["draft", "selecting"].includes(g.status) ? btn("Subir fotos", "upload", "primary", "upload") : ""}${admin && editing ? btn("Subir editadas", "upload-delivery", "primary", "upload") : ""}${admin && ["draft", "selecting"].includes(g.status) ? `<button class="icon-btn" data-action="edit-gallery" aria-label="Configurar galería">${icon("settings")}</button>` : ""}${admin ? `<button class="icon-btn" data-action="gallery-menu" aria-label="Más opciones de galería">${icon("archive")}</button>` : ""}${!admin && g.status === "delivered" ? `<a class="btn btn-primary" href="/api/galleries/${g.id}/download.zip">${icon("download")}Descargar todas</a>` : ""}</div></div>${workflow(g)}${g.description ? `<p class="gallery-note">${esc(g.description)}</p>` : ""}<section class="gallery-info"><div><h2>${g.status === "draft" ? "Todo listo para empezar." : g.status === "selecting" ? (admin ? "El cliente está eligiendo." : "Las que te hacen sentir algo.") : g.status === "confirmed" ? "La selección está confirmada." : g.status === "editing" ? "Cada detalle cuenta." : g.status === "delivered" ? "Tu historia, lista para guardar." : "Esta galería está archivada."}</h2><p>${g.status === "draft" ? "Sube las fotos y abre la selección cuando esté lista." : g.status === "selecting" ? `La sesión incluye ${g.included_count} fotos editadas.${g.allow_extras ? ` Puedes ampliar la selección con un costo extra${g.extra_price ? " de " + money(g.extra_price, g.currency) + " por foto" : " a cotizar con el estudio"}.` : ""}` : g.status === "confirmed" ? (admin ? "Descarga los originales elegidos y empieza la edición." : "Gracias por elegir. El estudio ya puede empezar a editar tus fotos.") : g.status === "editing" ? (admin ? "Carga una editada por cada foto elegida. Publica la entrega cuando estén todas." : "El estudio está trabajando en tus fotos. Aquí encontrarás la entrega final.") : g.status === "delivered" ? "Tus fotos editadas ya están disponibles, sin marca de agua y en su resolución de entrega." : "Las fotografías siguen guardadas de forma privada."}</p></div><div class="info-numbers"><div><b>${g.included_count}</b>Incluidas</div><div><b>${selected.length}</b>Elegidas</div><div><b>${g.status === "editing" || g.status === "delivered" ? g.delivered_count : extras}</b>${g.status === "editing" || g.status === "delivered" ? "Editadas listas" : "Adicionales"}</div></div></section>${admin ? `<div class="detail-actions" style="justify-content:flex-start;margin-bottom:25px">${g.status === "draft" ? btn("Abrir selección", "publish-selection", "primary", "arrow", g.photo_count ? "" : "disabled") : ""}${g.status === "confirmed" ? btn("Empezar edición", "start-editing", "primary", "check") : ""}${selected.length && ["confirmed", "editing", "delivered"].includes(g.status) ? `<a class="btn btn-secondary" href="/api/galleries/${g.id}/download.zip?originals=1">${icon("download")}Originales elegidos</a>` : ""}${editing ? btn("Publicar entrega", "publish-delivery", "secondary", "arrow", g.delivered_count === selected.length && selected.length ? "" : "disabled") : ""}${g.status === "delivered" ? `<a class="btn btn-secondary" href="/api/galleries/${g.id}/download.zip">${icon("download")}Descargar entrega</a>` : ""}${g.extra_consent ? `<p class="small">${extras} fotos extra aceptadas ${g.extra_price ? "· " + money(g.quoted_extra, g.currency) : "· costo por cotizar"}</p>` : ""}</div>` : ""}${g.notes ? `<p class="gallery-note"><strong>Notas para edición:</strong> ${esc(g.notes)}</p>` : ""}<div class="toolbar"><div class="filters">${[["all", "Todas", !admin && g.status === "delivered" ? selected.length : g.photo_count], ["selected", admin ? "Selección" : "Mis elegidas", selected.length], ...(admin || g.status === "delivered" ? [["delivery", "Editadas", g.delivered_count]] : [])].map(([v, l, n]) => `<button class="${state.photoFilter === v ? "active" : ""}" data-action="photo-filter" data-value="${v}">${l} <span>${n}</span></button>`).join("")}</div><p class="small">${g.status === "selecting" && !admin ? "Elige con un clic en el círculo." : admin ? "Haz clic en una foto para ampliarla." : "Haz clic para ver cada fotografía."}</p></div><p class="protected-note">${icon("lock")}${g.status === "delivered" ? "Entrega privada · Solo tu cuenta puede descargar estas fotos." : "Vistas de selección con marca de agua. Los originales permanecen privados."}</p><div id="photo-results">${photoResults()}</div>`;
}
function visiblePhotos() {
  let list = state.gallery.photos;
  if (state.photoFilter === "selected") list = list.filter((p) => p.selected);
  if (state.photoFilter === "delivery")
    list = list.filter((p) => p.selected && p.has_delivery);
  if (!isAdmin() && state.gallery.status === "delivered")
    list = list.filter((p) => p.selected);
  return list;
}
function photoResults() {
  const all = visiblePhotos(),
    g = state.gallery;
  return all.length
    ? `<div class="photo-grid">${all
        .slice(0, state.pageSize)
        .map((p, i) => photoCard(p, i))
        .join(
          "",
        )}</div>${all.length > state.pageSize ? `<div class="load-more">${btn("Ver más fotos", "load-more", "secondary", "plus")}</div>` : ""}`
    : `<section class="empty"><span class="empty-icon">${icon("image")}</span><h2>${!g.photo_count ? "Esta galería está por comenzar." : state.photoFilter === "selected" ? "Todavía no hay fotos elegidas." : "Aún no hay editadas aquí."}</h2><p>${!g.photo_count ? "Sube los JPG de la sesión para preparar las vistas de selección." : "Las fotos aparecerán aquí a medida que avance tu sesión."}</p>${isAdmin() && !g.photo_count ? btn("Subir primeras fotos", "upload", "primary", "upload") : ""}</section>`;
}
function previewUrl(p) {
  const delivery =
    state.photoFilter === "delivery" ||
    (!isAdmin() && state.gallery.status === "delivered");
  return `/api/photos/${p.id}/preview${delivery && p.has_delivery ? "?delivery=1" : ""}`;
}
function photoCard(p, i) {
  const g = state.gallery,
    editable = !isAdmin() && g.status === "selecting";
  return `<article class="photo-card ${p.selected ? "selected" : ""}" data-photo="${p.id}"><button class="photo-visual" data-action="lightbox" data-id="${p.id}" aria-label="Ampliar ${esc(p.filename)}"><img src="${previewUrl(p)}" alt="${esc(p.filename)}" loading="lazy" draggable="false"><span class="photo-index">${String(i + 1).padStart(3, "0")}</span></button>${editable ? `<button class="photo-choice" data-action="select-photo" data-id="${p.id}" aria-label="${p.selected ? "Quitar" : "Elegir"} ${esc(p.filename)}" aria-pressed="${p.selected}" ${state.busy ? "disabled" : ""}>${p.selected ? icon("check") : icon("plus")}</button>` : p.selected ? `<span class="photo-choice" aria-label="Seleccionada">${icon("check")}</span>` : ""}<div class="photo-caption"><span title="${esc(p.filename)}">${esc(p.filename)}</span>${p.has_delivery ? "<small>EDITADA</small>" : ""}</div>${isAdmin() ? `<div class="photo-edit">${p.selected && ["confirmed", "editing"].includes(g.status) ? `<button class="btn btn-plain" data-action="photo-delivery" data-id="${p.id}">${icon("upload")}${p.has_delivery ? "Reemplazar" : "Subir editada"}</button>` : `<span class="small">${p.selected ? "Elegida" : "Vista de selección"}</span>`}${["draft", "selecting"].includes(g.status) ? `<button class="icon-btn" data-action="delete-photo" data-id="${p.id}" aria-label="Eliminar ${esc(p.filename)}">${icon("trash")}</button>` : ""}</div>` : g.status === "delivered" && p.has_delivery ? `<div class="photo-edit"><a class="btn btn-plain" href="/api/photos/${p.id}/download">${icon("download")}Descargar JPG</a></div>` : ""}</article>`;
}
function selectionBar() {
  const g = state.gallery,
    n = chosen().length,
    extra = extraCount();
  return `<aside class="selection-bar glass" aria-label="Resumen de selección"><div class="selection-copy"><strong>${n}</strong> de ${g.included_count} incluidas${state.busy ? '<span class="saving-dot" aria-label="Guardando"></span>' : ""}<small>${extra ? `${extra} ${extra === 1 ? "adicional" : "adicionales"} · ${g.extra_price ? money(extra * g.extra_price, g.currency) + " extra" : "con costo extra a cotizar"}` : state.busy ? "Guardando tu selección…" : "Tu selección se guarda automáticamente."}</small></div>${btn("Confirmar selección", "confirm-selection", "primary", "arrow", n && !state.busy ? "" : "disabled")}</aside>`;
}
async function selectPhoto(id) {
  if (state.busy) return;
  const p = state.gallery.photos.find((p) => p.id === id);
  if (!p || state.gallery.status !== "selecting" || isAdmin()) return;
  if (
    !p.selected &&
    !state.gallery.allow_extras &&
    chosen().length >= state.gallery.included_count
  ) {
    toast("Ya elegiste todas las fotos incluidas en esta sesión.");
    return;
  }
  state.busy = true;
  const old = p.selected;
  p.selected = !p.selected;
  render();
  if ($("#lightbox").open) renderLightbox();
  try {
    const result = await api(`/galleries/${state.gallery.id}/selection`, {
      method: "PUT",
      body: {
        photo_ids: chosen().map((p) => p.id),
        version: state.gallery.version,
      },
    });
    state.gallery.version = result.version;
    state.gallery.selected_count = result.selected_count;
  } catch (error) {
    p.selected = old;
    toast(error.message);
    if (error.status === 409)
      state.gallery = await api("/galleries/" + state.gallery.id);
  } finally {
    state.busy = false;
    render();
    if ($("#lightbox").open) renderLightbox();
  }
}
function newClient() {
  modal(
    modalHead(
      "Un acceso, una persona",
      "Nuevo cliente",
      "La contraseña temporal se generará de forma segura y se mostrará una sola vez. Compártela directamente con tu cliente.",
    ) +
      `<form id="client-form">${errorBox}<label class="field">Nombre del cliente<input name="name" required maxlength="100" placeholder="Nombre y apellido" autocomplete="off"></label><label class="field">Correo de acceso<input name="email" type="email" required maxlength="254" placeholder="cliente@correo.com" autocomplete="off"></label><div class="dialog-actions">${btn("Cancelar", "close-modal")}<button class="btn btn-primary" type="submit">Crear cuenta ${icon("arrow")}</button></div></form>`,
  );
}
function showCredentials(data) {
  state.credentials = data;
  modal(
    modalHead(
      "Acceso creado",
      "Listo para compartir.",
      "Copia estos datos y envíalos por un canal privado. El cliente cambiará la contraseña en su primer acceso.",
    ) +
      `<dl class="credentials-box"><dt>Enlace de acceso</dt><dd>${esc(new URL("/clientes/", location.origin).href)}</dd><dt>Correo</dt><dd>${esc(data.user.email)}</dd><dt>Contraseña temporal</dt><dd>${esc(data.temporaryPassword)}</dd></dl><p class="small">Esta contraseña no volverá a mostrarse. Si la pierdes, puedes crear otra desde Clientes.</p><div class="dialog-actions">${btn("Copiar acceso", "copy-credentials", "primary", "copy")}${btn("Listo", "close-modal")}</div>`,
  );
}
function galleryForm(edit = false) {
  if (!edit && !state.clients.some((c) => c.active)) {
    newClient();
    toast("Primero crea la cuenta del cliente.");
    return;
  }
  const g = edit
    ? state.gallery
    : {
        title: "",
        description: "",
        event_date: "",
        included_count: 20,
        extra_price: 0,
        currency: "BOB",
        allow_extras: true,
      };
  modal(
    modalHead(
      edit ? "Ajustes de la sesión" : "Un nuevo comienzo",
      edit ? "Configurar galería" : "Nueva galería",
      "Tú defines qué incluye la sesión y cuánto cuesta ampliar la selección.",
    ) +
      `<form id="gallery-form" data-edit="${edit}">${errorBox}${
        !edit
          ? `<label class="field">Cliente<select name="client_id" required><option value="">Selecciona un cliente</option>${state.clients
              .filter((c) => c.active)
              .map(
                (c) =>
                  `<option value="${c.id}">${esc(c.name)} · ${esc(c.email)}</option>`,
              )
              .join("")}</select></label>`
          : ""
      }<label class="field">Nombre de la sesión<input name="title" required maxlength="120" placeholder="Ej. Retratos · María" value="${esc(g.title)}"></label><div class="field-row"><label class="field">Fecha de la sesión<input name="event_date" type="date" value="${esc(g.event_date)}"></label><label class="field">Fotos incluidas<input name="included_count" type="number" min="1" max="10000" required value="${g.included_count}"></label></div><label class="field">Mensaje para el cliente<textarea name="description" maxlength="1000" placeholder="Unas palabras sobre su sesión…">${esc(g.description)}</textarea></label><label class="field-check"><input name="allow_extras" type="checkbox" ${g.allow_extras ? "checked" : ""}>Permitir fotos adicionales con costo extra</label><div class="field-row"><label class="field">Precio por foto adicional<input name="extra_price" type="number" min="0" max="1000000" step=".01" required value="${g.extra_price / 100}"><small>Si dejas 0, se mostrará «costo extra a cotizar».</small></label><label class="field">Moneda<select name="currency"><option value="BOB" ${g.currency === "BOB" ? "selected" : ""}>BOB · Bolivianos</option><option value="USD" ${g.currency === "USD" ? "selected" : ""}>USD · Dólares</option></select></label></div><div class="dialog-actions">${btn("Cancelar", "close-modal")}<button type="submit" class="btn btn-primary">${edit ? "Guardar cambios" : "Crear galería"} ${icon("arrow")}</button></div></form>`,
  );
}
function uploadModal(delivery = false, photoId = null) {
  state.uploadContext = { delivery, photoId };
  modal(
    modalHead(
      delivery ? "El último toque" : "Prepara la selección",
      delivery ? "Subir fotos editadas" : "Subir fotografías",
      delivery
        ? photoId
          ? "Esta editada se asociará a la foto que elegiste."
          : "Conserva el nombre de cada original. También se reconocen sufijos como _editada o _final."
        : "Los originales quedan privados. El cliente verá una copia reducida con marca de agua.",
    ) +
      `<label class="upload-zone" id="drop-zone" tabindex="0">${icon("upload")}<strong>Arrastra tus fotos aquí</strong><small>o haz clic para elegir archivos<br>Solo JPG / JPEG · Hasta 35 MB por foto</small><input id="photo-files" type="file" accept="image/jpeg,.jpg,.jpeg" ${photoId ? "" : "multiple"} aria-label="Elegir fotografías JPG"></label><div id="upload-progress" class="upload-progress" aria-live="polite"></div><div class="dialog-actions">${btn("Cerrar", "close-modal")}</div>`,
  );
  const zone = $("#drop-zone");
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("dragover");
    uploadPhotos([...e.dataTransfer.files]);
  });
  zone.addEventListener("keydown", (e) => {
    if (["Enter", " "].includes(e.key)) {
      e.preventDefault();
      $("#photo-files").click();
    }
  });
}
async function uploadPhotos(files) {
  if (state.uploadBusy || !files.length) return;
  const invalid = files.filter(
    (f) => !/\.jpe?g$/i.test(f.name) || f.size > 35 * 1024 * 1024,
  );
  if (invalid.length) {
    $("#upload-progress").innerHTML =
      `<div class="form-error">${esc(invalid.map((f) => f.name).join(", "))}: utiliza JPG de hasta 35 MB.</div>`;
    return;
  }
  if (state.uploadContext.photoId && files.length > 1) {
    toast("Elige una sola editada para esta tarjeta.");
    return;
  }
  state.uploadBusy = true;
  $$('[data-action="close-modal"]', $("#modal")).forEach(
    (b) => (b.disabled = true),
  );
  $("#photo-files").disabled = true;
  const errors = [];
  let uploaded = 0;
  try {
    for (let i = 0; i < files.length; i += 5) {
      $("#upload-progress").innerHTML =
        `<p class="small">Procesando ${i + 1}–${Math.min(i + 5, files.length)} de ${files.length}…</p><div class="progress-track"><span style="width:${Math.round((i / files.length) * 100)}%"></span></div>`;
      const form = new FormData();
      if (state.uploadContext.photoId)
        form.append("photo_id", state.uploadContext.photoId);
      files.slice(i, i + 5).forEach((f) => form.append("photos", f));
      const result = await api(
        `/galleries/${state.gallery.id}/${state.uploadContext.delivery ? "deliveries" : "photos"}`,
        { method: "POST", body: form, raw: true },
      );
      uploaded += result.uploaded.length;
      errors.push(...result.errors);
    }
    $("#upload-progress").innerHTML =
      `<p class="small accent">${uploaded} ${uploaded === 1 ? "fotografía lista" : "fotografías listas"}.</p><div class="progress-track"><span style="width:100%"></span></div>${errors.length ? `<ul class="upload-errors">${errors.map((e) => `<li>${esc(e.filename)}: ${esc(e.error)}</li>`).join("")}</ul>` : ""}`;
    state.gallery = await api("/galleries/" + state.gallery.id);
    render();
    toast(
      `${uploaded} fotos ${state.uploadContext.delivery ? "editadas" : "subidas"} correctamente.`,
    );
  } catch (error) {
    $("#upload-progress").innerHTML =
      `<div class="form-error">${esc(error.message)} Las fotos ya procesadas se conservan.</div>`;
    state.gallery = await api("/galleries/" + state.gallery.id);
    render();
  } finally {
    state.uploadBusy = false;
    $$('[data-action="close-modal"]', $("#modal")).forEach(
      (b) => (b.disabled = false),
    );
    if ($("#photo-files")) $("#photo-files").disabled = false;
  }
}
function confirmSelection() {
  const g = state.gallery,
    selected = chosen(),
    extra = extraCount();
  modal(
    modalHead(
      "Tu selección final",
      "Estas son tus favoritas.",
      "Revisa tu selección antes de enviarla. Una vez confirmada, el estudio podrá comenzar a editar.",
    ) +
      `<form id="confirm-form">${errorBox}<div class="confirm-summary"><div><b>${selected.length}</b><span>Fotos elegidas</span></div><div><b>${Math.min(selected.length, g.included_count)}</b><span>Incluidas en tu sesión</span></div><div><b>${extra}</b><span>Adicionales</span></div></div><div class="selected-names">${selected.map((p) => esc(p.filename)).join(" · ")}</div>${extra ? `<div class="extras-notice">Tu selección tiene <strong>${extra} ${extra === 1 ? "foto adicional" : "fotos adicionales"}</strong>. ${g.extra_price ? `Costo adicional: <strong>${money(extra * g.extra_price, g.currency)}</strong> (${money(g.extra_price, g.currency)} por foto).` : "Tienen un costo adicional que el estudio te cotizará por separado."}<br>No se realiza ningún cobro automático.</div><label class="field-check"><input name="accept_extras" type="checkbox" required>Acepto ampliar la selección y el costo adicional${g.extra_price ? " de " + money(extra * g.extra_price, g.currency) : " por cotizar con el estudio"}.</label>` : ""}<label class="field">Indicaciones para la edición (opcional)<textarea name="notes" maxlength="1000" placeholder="¿Hay algún detalle que te gustaría que cuidemos?"></textarea></label><p class="dialog-note">Al confirmar, la selección se cierra. Si necesitas cambiarla después, pide al estudio que la vuelva a abrir.</p><div class="dialog-actions">${btn("Seguir eligiendo", "close-modal")}<button type="submit" class="btn btn-primary">Confirmar mis fotos ${icon("check")}</button></div></form>`,
  );
}
function confirmAction(title, description, action, label = "Confirmar") {
  modal(
    modalHead("Confirmación", esc(title), esc(description)) +
      `<div class="dialog-actions">${btn("Cancelar", "close-modal")}${btn(label, action, "primary", "check")}</div>`,
  );
}
function showAccount() {
  modal(
    modalHead("Tu cuenta", esc(state.user.name), esc(state.user.email)) +
      `<form id="account-form">${errorBox}<label class="field">Contraseña actual<input type="password" name="currentPassword" autocomplete="current-password" required maxlength="128"></label><label class="field">Nueva contraseña<input type="password" name="newPassword" autocomplete="new-password" required minlength="12" maxlength="128"><small>Mínimo 12 caracteres. Una frase larga es una buena opción.</small></label><div class="dialog-actions">${btn("Cancelar", "close-modal")}<button class="btn btn-primary" type="submit">Cambiar contraseña</button></div></form>`,
  );
}
function showLightbox(id) {
  state.lightbox = id;
  renderLightbox();
  if (!$("#lightbox").open) $("#lightbox").showModal();
}
function renderLightbox() {
  const list = visiblePhotos(),
    index = list.findIndex((p) => p.id === state.lightbox),
    p = list[index];
  if (!p) {
    $("#lightbox").close();
    return;
  }
  const g = state.gallery;
  $("#lightbox-content").innerHTML =
    `<div class="lightbox-head"><span><strong>${esc(p.filename)}</strong><small>${index + 1} / ${list.length}</small></span><button class="icon-btn" data-action="close-lightbox" aria-label="Cerrar fotografía">${icon("close")}</button></div><div class="lightbox-image"><button class="icon-btn prev" data-action="prev-photo" aria-label="Foto anterior" ${index === 0 ? "disabled" : ""}>${icon("left")}</button><img src="${previewUrl(p)}" alt="${esc(p.filename)}" draggable="false"><button class="icon-btn next" data-action="next-photo" aria-label="Foto siguiente" ${index === list.length - 1 ? "disabled" : ""}>${icon("right")}</button></div><div class="lightbox-footer"><p>${g.status === "delivered" ? "Fotografía editada · Tu entrega final" : "Vista de selección · Marca de agua protectora"}</p>${!isAdmin() && g.status === "selecting" ? btn(p.selected ? "Elegida · Quitar" : "Elegir esta foto", "select-photo", p.selected ? "primary" : "secondary", p.selected ? "check" : "plus", `data-id="${p.id}" ${state.busy ? "disabled" : ""}`) : g.status === "delivered" && p.has_delivery ? `<a class="btn btn-primary" href="/api/photos/${p.id}/download">${icon("download")}Descargar JPG</a>` : p.selected ? '<span class="tag selecting">Seleccionada</span>' : ""}</div>`;
}
async function setState(status) {
  await api(`/galleries/${state.gallery.id}/state`, {
    method: "POST",
    body: { status },
  });
  state.gallery = await api("/galleries/" + state.gallery.id);
  closeModal();
  render();
  toast("Estado de la galería actualizado.");
}
const actions = {
  portfolio: loadPortfolioAdmin,
  "new-work": () => portfolioForm(),
  "edit-work": (b) =>
    portfolioForm(state.portfolio.find((w) => w.id === b.dataset.id)),
  "publish-work": async (b) => {
    const work = state.portfolio.find((w) => w.id === b.dataset.id);
    await api(`/admin/portfolio/${work.id}/publication`, {
      method: "PATCH",
      body: { published: !work.published },
    });
    await loadPortfolioAdmin();
    toast(
      work.published
        ? "Trabajo retirado del portafolio público."
        : "Trabajo publicado en tu sitio web.",
    );
  },
  home: async () => {
    state.search = "";
    state.filter = "all";
    await loadHome();
  },
  clients: async () => {
    state.clients = await api("/clients");
    state.view = "clients";
    render();
  },
  "new-client": newClient,
  "new-gallery": () => galleryForm(false),
  "edit-gallery": () => galleryForm(true),
  "open-gallery": (b) => openGallery(b.dataset.id),
  "close-modal": closeModal,
  account: showAccount,
  logout: async () => {
    await api("/logout", { method: "POST" });
    state.user = null;
    state.csrf = null;
    state.gallery = null;
    state.clients = [];
    state.portfolio = [];
    state.galleries = [];
    state.search = "";
    state.filter = "all";
    state.lightbox = null;
    $("#lightbox").close();
    closeModal();
    renderAuth(false);
  },
  "show-password": (b) => {
    const input = $("input", b.closest(".password-wrap"));
    input.type = input.type === "password" ? "text" : "password";
    b.setAttribute(
      "aria-label",
      input.type === "password" ? "Mostrar contraseña" : "Ocultar contraseña",
    );
  },
  filter: (b) => {
    state.filter = b.dataset.value;
    render();
  },
  "photo-filter": (b) => {
    state.photoFilter = b.dataset.value;
    state.pageSize = 60;
    render();
  },
  "load-more": () => {
    state.pageSize += 60;
    $("#photo-results").innerHTML = photoResults();
  },
  "select-photo": (b) => selectPhoto(b.dataset.id),
  lightbox: (b) => showLightbox(b.dataset.id),
  "close-lightbox": () => $("#lightbox").close(),
  "prev-photo": () => {
    const list = visiblePhotos(),
      i = list.findIndex((p) => p.id === state.lightbox);
    if (i > 0) showLightbox(list[i - 1].id);
  },
  "next-photo": () => {
    const list = visiblePhotos(),
      i = list.findIndex((p) => p.id === state.lightbox);
    if (i < list.length - 1) showLightbox(list[i + 1].id);
  },
  upload: () => uploadModal(false),
  "upload-delivery": () => uploadModal(true),
  "photo-delivery": (b) => uploadModal(true, b.dataset.id),
  "confirm-selection": confirmSelection,
  "publish-selection": () =>
    confirmAction(
      "¿Abrir la selección?",
      "El cliente podrá ver la galería y elegir sus fotos.",
      "state-selecting",
      "Abrir selección",
    ),
  "state-selecting": () => setState("selecting"),
  "start-editing": () => setState("editing"),
  "publish-delivery": () =>
    confirmAction(
      "¿Publicar la entrega?",
      "El cliente podrá descargar todas sus fotos editadas, sin marca de agua y en resolución de entrega.",
      "state-delivered",
      "Publicar entrega",
    ),
  "state-delivered": () => setState("delivered"),
  "gallery-menu": () =>
    modal(
      modalHead(
        "Gestionar sesión",
        "Opciones de galería",
        "La galería y sus archivos permanecen guardados al archivarla.",
      ) +
        `<div class="dialog-actions">${state.gallery.status !== "selecting" ? btn("Reabrir selección", "ask-reopen", "secondary", "image") : ""}${state.gallery.status !== "archived" ? btn("Archivar", "ask-archive", "secondary", "archive") : ""}</div>`,
    ),
  "ask-reopen": () =>
    confirmAction(
      "¿Reabrir la selección?",
      "Se habilitarán cambios en las fotos elegidas. Las descargas se ocultarán hasta que vuelvas a publicar la entrega.",
      "state-selecting",
      "Reabrir selección",
    ),
  "ask-archive": () =>
    confirmAction(
      "¿Archivar esta galería?",
      "El cliente dejará de verla. Sus archivos se conservarán.",
      "state-archived",
      "Archivar",
    ),
  "state-archived": () => setState("archived"),
  "reset-client": (b) => {
    state.targetClient = b.dataset.id;
    confirmAction(
      "¿Crear una contraseña temporal?",
      "La contraseña actual dejará de funcionar y se cerrarán las sesiones de este cliente.",
      "do-reset-client",
      "Crear contraseña",
    );
  },
  "do-reset-client": async () => {
    const data = await api(`/clients/${state.targetClient}/reset`, {
      method: "POST",
    });
    state.clients = await api("/clients");
    render();
    showCredentials(data);
  },
  "toggle-client": (b) => {
    state.targetClient = b.dataset.id;
    const c = state.clients.find((c) => c.id === b.dataset.id);
    confirmAction(
      c.active ? "¿Desactivar esta cuenta?" : "¿Activar esta cuenta?",
      c.active
        ? "Se cerrarán sus sesiones. Sus galerías y fotos permanecerán guardadas."
        : "El cliente podrá volver a entrar con su contraseña.",
      "do-toggle-client",
      c.active ? "Desactivar" : "Activar",
    );
  },
  "do-toggle-client": async () => {
    const c = state.clients.find((c) => c.id === state.targetClient);
    await api(`/clients/${c.id}`, {
      method: "PATCH",
      body: { active: !c.active },
    });
    state.clients = await api("/clients");
    closeModal();
    render();
  },
  "delete-photo": (b) => {
    state.targetPhoto = b.dataset.id;
    confirmAction(
      "¿Eliminar esta fotografía?",
      "Se quitará de la galería y de la selección. La copia subida a este portal se eliminará.",
      "do-delete-photo",
      "Eliminar foto",
    );
  },
  "do-delete-photo": async () => {
    await api("/photos/" + state.targetPhoto, { method: "DELETE" });
    state.gallery = await api("/galleries/" + state.gallery.id);
    closeModal();
    render();
  },
  "copy-credentials": async () => {
    const d = state.credentials;
    try {
      await navigator.clipboard.writeText(
        `FractalX — Acceso a tu galería\nEnlace: ${new URL("/clientes/", location.origin).href}\nCorreo: ${d.user.email}\nContraseña temporal: ${d.temporaryPassword}\nCambia tu contraseña al entrar por primera vez.`,
      );
      toast("Acceso copiado. Compártelo de forma privada.");
    } catch {
      toast("Selecciona y copia los datos que aparecen en pantalla.");
    }
  },
};
document.addEventListener("click", async (event) => {
  const b = event.target.closest("[data-action]");
  if (!b || b.disabled) return;
  const fn = actions[b.dataset.action];
  if (!fn) return;
  event.preventDefault();
  try {
    await fn(b);
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "gallery-search") {
    state.search = event.target.value;
    const rows = state.galleries.filter(
      (g) =>
        (state.filter === "all"
          ? g.status !== "archived"
          : state.filter === "editing"
            ? ["confirmed", "editing"].includes(g.status)
            : g.status === state.filter) &&
        (g.title + " " + g.client_name)
          .toLowerCase()
          .includes(state.search.toLowerCase()),
    );
    $("#gallery-results").innerHTML = galleryResults(rows);
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "photo-files") uploadPhotos([...event.target.files]);
});
document.addEventListener("contextmenu", (event) => {
  if (event.target.closest(".photo-visual,.lightbox-image"))
    event.preventDefault();
});
document.addEventListener("keydown", (event) => {
  if ($("#lightbox").open && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    actions[event.key === "ArrowLeft" ? "prev-photo" : "next-photo"]();
  }
});
$("#modal").addEventListener("cancel", (event) => {
  if (state.uploadBusy) event.preventDefault();
});
$("#modal").addEventListener("close", () => {
  state.credentials = null;
});
for (const dialog of [$("dialog#modal"), $("dialog#lightbox")])
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    ) {
      if (dialog.id === "modal") closeModal();
      else dialog.close();
    }
  });
document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (
    ![
      "auth-form",
      "client-form",
      "gallery-form",
      "confirm-form",
      "account-form",
      "portfolio-form",
    ].includes(form.id)
  )
    return;
  event.preventDefault();
  const submit = $('[type="submit"]', form);
  if (submit.disabled) return;
  submit.disabled = true;
  const error = $("#form-error", form);
  if (error) error.textContent = "";
  const data = Object.fromEntries(new FormData(form));
  try {
    if (form.id === "auth-form") {
      const result = await api("/" + form.dataset.mode, {
        method: "POST",
        body: data,
      });
      rememberSession(result);
      if (state.user.mustChange) renderAuth(false, true);
      else await loadHome();
    }
    if (form.id === "client-form") {
      const result = await api("/clients", { method: "POST", body: data });
      state.clients = await api("/clients");
      render();
      showCredentials(result);
    }
    if (form.id === "gallery-form") {
      const body = {
        ...data,
        included_count: Number(data.included_count),
        extra_price: Math.round(Number(data.extra_price) * 100),
        allow_extras: data.allow_extras === "on",
      };
      const edit = form.dataset.edit === "true";
      const result = await api(
        "/galleries" + (edit ? "/" + state.gallery.id : ""),
        { method: edit ? "PATCH" : "POST", body },
      );
      closeModal();
      await openGallery(result.id);
      toast(
        edit
          ? "Configuración guardada."
          : "Galería creada. Ahora puedes subir las fotos.",
      );
    }
    if (form.id === "confirm-form") {
      await api(`/galleries/${state.gallery.id}/confirm`, {
        method: "POST",
        body: {
          version: state.gallery.version,
          notes: data.notes,
          accept_extras: data.accept_extras === "on",
        },
      });
      state.gallery = await api("/galleries/" + state.gallery.id);
      closeModal();
      render();
      toast("Selección confirmada. ¡Gracias por elegir!");
    }
    if (form.id === "portfolio-form") {
      const cover = form.elements.cover.files[0],
        video = form.elements.video.files[0];
      if (cover && cover.size > 35 * 1024 * 1024)
        throw new Error("La portada puede pesar hasta 35 MB.");
      if (video && video.size > 300 * 1024 * 1024)
        throw new Error("El video puede pesar hasta 300 MB.");
      state.uploadBusy = true;
      $$('[data-action="close-modal"]', $("#modal")).forEach(
        (b) => (b.disabled = true),
      );
      submit.textContent = "Guardando archivos…";
      try {
        await api(
          "/admin/portfolio" + (form.dataset.id ? "/" + form.dataset.id : ""),
          {
            method: form.dataset.id ? "PUT" : "POST",
            body: new FormData(form),
            raw: true,
          },
        );
        state.uploadBusy = false;
        closeModal();
        await loadPortfolioAdmin();
        toast("Trabajo guardado. Puedes publicarlo cuando esté listo.");
      } finally {
        state.uploadBusy = false;
        $$('[data-action="close-modal"]', $("#modal")).forEach(
          (b) => (b.disabled = false),
        );
        if (submit.isConnected) submit.textContent = "Guardar trabajo";
      }
    }
    if (form.id === "account-form") {
      rememberSession(await api("/password", { method: "POST", body: data }));
      closeModal();
      render();
      toast("Tu contraseña se actualizó.");
    }
  } catch (err) {
    if (error?.isConnected) error.textContent = err.message;
    else toast(err.message);
  } finally {
    if (submit.isConnected) submit.disabled = false;
  }
});
async function start() {
  try {
    const status = await api("/status");
    if (status.setupRequired) {
      renderAuth(true);
      return;
    }
    try {
      rememberSession(await api("/me"));
    } catch {
      renderAuth(false);
      return;
    }
    if (state.user.mustChange) renderAuth(false, true);
    else await loadHome();
  } catch (error) {
    $("#app").innerHTML =
      `<main class="shell workspace"><div class="empty"><h1>No pudimos abrir el portal.</h1><p>${esc(error.message)}</p><a class="btn btn-primary" href="/clientes/">Volver a intentar</a></div></main>`;
  }
}
start();
