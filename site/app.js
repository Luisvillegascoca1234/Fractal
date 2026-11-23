const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
function redirectLegacyPortfolioLink() {
  if (window.location.hash === "#work") window.location.replace("/portafolio/");
}
redirectLegacyPortfolioLink();
window.addEventListener("hashchange", redirectLegacyPortfolioLink);

const CONTACT_EMAIL = "fractal@gmail.com";
let returnFocus;
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
      "Mientras se prepara el portafolio, las referencias visuales pueden incluir imágenes de Unsplash y muestras generadas con IA. No se presentan como trabajos realizados por FractalX.",
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
