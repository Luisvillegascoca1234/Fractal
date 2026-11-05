import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import sharp from "sharp";
import yazl from "yazl";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installPortfolio } from "./portfolio.mjs";
const scrypt = promisify(scryptCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  mustChange: !!u.must_change,
  active: !!u.active,
});
const digest = (value) => createHash("sha256").update(value).digest("hex");
const xml = (value) =>
  value.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};
const cleanName = (value) =>
  String(value || "")
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    .replace(/[\x00-\x1f<>:"|?*]/g, "_")
    .slice(0, 160);
const text = (value, max = 200) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const integer = (v, max = 1000000) =>
  Number.isSafeInteger(v) && v >= 0 && v <= max;
const emailOf = (value) => {
  const email = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail(400, "Escribe un correo válido.");
  return email;
};
async function hashPassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  )
    fail(400, "La contraseña debe tener entre 12 y 128 caracteres.");
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `${salt}:${key.toString("hex")}`;
}
async function verifyPassword(password, stored) {
  if (typeof password !== "string" || password.length > 128) return false;
  const [salt, expected] = stored.split(":");
  const actual = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
export function createPortal({
  dataDir = process.env.DATA_DIR || path.join(root, "data"),
  origin = "http://127.0.0.1:4173",
} = {}) {
  dataDir = path.resolve(dataDir);
  for (const folder of [
    "originals",
    "previews",
    "deliveries",
    "delivery-previews",
    "tmp",
  ])
    fs.mkdirSync(path.join(dataDir, folder), { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "fractalx.sqlite"));
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','client')),must_change INTEGER NOT NULL DEFAULT 1,active INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS galleries(id TEXT PRIMARY KEY,client_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',event_date TEXT NOT NULL DEFAULT '',included_count INTEGER NOT NULL DEFAULT 20,extra_price INTEGER NOT NULL DEFAULT 0,currency TEXT NOT NULL DEFAULT 'BOB',allow_extras INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'draft',version INTEGER NOT NULL DEFAULT 0,confirmed_at TEXT,extra_consent TEXT,quoted_extra INTEGER NOT NULL DEFAULT 0,notes TEXT NOT NULL DEFAULT '',created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY,gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,filename TEXT NOT NULL COLLATE NOCASE,selected INTEGER NOT NULL DEFAULT 0,delivery_name TEXT,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(gallery_id,filename));
  CREATE INDEX IF NOT EXISTS gallery_client ON galleries(client_id); CREATE INDEX IF NOT EXISTS photo_gallery ON photos(gallery_id); CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);`);
  const one = (sql, ...args) => db.prepare(sql).get(...args),
    all = (sql, ...args) => db.prepare(sql).all(...args),
    run = (sql, ...args) => db.prepare(sql).run(...args);
  const transaction = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const privateFile = (folder, id) => path.join(dataDir, folder, `${id}.jpg`);
  const origins = new Set([origin, origin.replace("127.0.0.1", "localhost")]);
  const hosts = new Set([...origins].map((v) => new URL(v).host));
  const cookieName = "fractalx_session",
    cookieSettings = {
      httpOnly: true,
      sameSite: "strict",
      secure: origin.startsWith("https:"),
      path: "/",
    };
  function newSession(res, user) {
    const token = randomBytes(32).toString("base64url"),
      csrf = randomBytes(32).toString("base64url");
    run("DELETE FROM sessions WHERE expires<?", Date.now());
    run(
      "INSERT INTO sessions(token_hash,user_id,csrf,expires) VALUES(?,?,?,?)",
      digest(token),
      user.id,
      csrf,
      Date.now() + 8 * 60 * 60 * 1000,
    );
    res.cookie(cookieName, token, {
      ...cookieSettings,
      maxAge: 8 * 60 * 60 * 1000,
    });
    return { user: publicUser(user), csrf };
  }
  function auth(req, res, next) {
    const cookie = (req.headers.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(cookieName + "="));
    const token = cookie?.slice(cookieName.length + 1);
    const session =
      token &&
      one(
        "SELECT * FROM sessions WHERE token_hash=? AND expires>?",
        digest(token),
        Date.now(),
      );
    const user =
      session &&
      one("SELECT * FROM users WHERE id=? AND active=1", session.user_id);
    if (!user)
      return res
        .status(401)
        .json({ error: "Tu sesión terminó. Vuelve a entrar." });
    req.user = user;
    req.session = session;
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.get("x-csrf-token") !== session.csrf
    )
      return res.status(403).json({
        error: "La sesión de seguridad no es válida. Recarga la página.",
      });
    next();
  }
  const changed = (req, res, next) =>
    req.user.must_change
      ? res.status(403).json({
          error: "Cambia tu contraseña temporal para continuar.",
          code: "PASSWORD_CHANGE_REQUIRED",
        })
      : next();
  const admin = (req, res, next) =>
    req.user.role === "admin"
      ? next()
      : res
          .status(403)
          .json({ error: "Esta acción es solo para el administrador." });
  function galleryAccess(req, id) {
    const g = one(
      "SELECT g.*,u.name AS client_name,u.email AS client_email FROM galleries g JOIN users u ON u.id=g.client_id WHERE g.id=?",
      id,
    );
    if (
      !g ||
      (req.user.role !== "admin" &&
        (g.client_id !== req.user.id ||
          ["draft", "archived"].includes(g.status)))
    )
      fail(404, "No se encontró esta galería.");
    return g;
  }
  function photoAccess(req, id) {
    const photo = one("SELECT * FROM photos WHERE id=?", id);
    if (!photo) fail(404, "No se encontró esta foto.");
    return { photo, gallery: galleryAccess(req, photo.gallery_id) };
  }
  function galleryJson(g) {
    return {
      ...g,
      allow_extras: !!g.allow_extras,
      ...one(
        "SELECT COUNT(*) AS photo_count,COALESCE(SUM(selected),0) AS selected_count,COALESCE(SUM(CASE WHEN selected=1 AND delivery_name IS NOT NULL THEN 1 ELSE 0 END),0) AS delivered_count FROM photos WHERE gallery_id=?",
        g.id,
      ),
      cover:
        one(
          "SELECT id FROM photos WHERE gallery_id=? ORDER BY filename COLLATE NOCASE,id LIMIT 1",
          g.id,
        )?.id || null,
    };
  }
  async function makePreview(input, output, watermark) {
    const buffer = await sharp(input, { limitInputPixels: 100000000 })
      .rotate()
      .resize({
        width: 1400,
        height: 1400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 72 })
      .toBuffer();
    if (!watermark) return fsp.writeFile(output, buffer);
    const { width, height } = await sharp(buffer).metadata();
    const label = xml(`FRACTALX · SOLO SELECCIÓN · ${watermark}`.toUpperCase());
    const overlay = Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="w" width="520" height="170" patternUnits="userSpaceOnUse" patternTransform="rotate(-27)"><text x="15" y="85" fill="white" fill-opacity=".39" stroke="black" stroke-opacity=".24" stroke-width=".7" font-family="sans-serif" font-size="20" font-weight="bold">${label}</text></pattern></defs><rect width="100%" height="100%" fill="url(#w)"/></svg>`,
    );
    await sharp(buffer)
      .composite([{ input: overlay }])
      .jpeg({ quality: 72 })
      .toFile(output);
  }
  const upload = multer({
    storage: multer.diskStorage({
      destination: path.join(dataDir, "tmp"),
      filename: (req, file, cb) => cb(null, randomUUID()),
    }),
    limits: { files: 10, fileSize: 35 * 1024 * 1024, fields: 2, parts: 12 },
    fileFilter: (req, file, cb) =>
      cb(
        null,
        /^image\/jpeg$/i.test(file.mimetype) &&
          /\.jpe?g$/i.test(file.originalname),
      ),
  }).array("photos", 10);
  const uploadFiles = (req, res, next) =>
    upload(req, res, async (error) => {
      if (error) {
        for (const file of req.files || [])
          await fsp.unlink(file.path).catch(() => {});
        return next(error);
      }
      next();
    });
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:"],
          mediaSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: origin.startsWith("https:") ? undefined : false,
    }),
  );
  app.use((req, res, next) => {
    if (!hosts.has(req.get("host")))
      return res.status(403).json({ error: "Host no permitido." });
    if (req.path.startsWith("/api/")) {
      res.set("Cache-Control", "no-store, private");
      res.set("X-Robots-Tag", "noindex, nofollow");
      if (
        !["GET", "HEAD"].includes(req.method) &&
        !origins.has(req.get("origin"))
      )
        return res.status(403).json({ error: "Origen no permitido." });
    }
    next();
  });
  app.use(express.json({ limit: "128kb" }));
  app.use((req, res, next) => {
    req.body ??= {};
    next();
  });
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Demasiados intentos. Espera 15 minutos antes de volver a entrar.",
    },
  });
  app.get("/api/status", (req, res) =>
    res.json({
      setupRequired: !one("SELECT id FROM users WHERE role='admin' LIMIT 1"),
    }),
  );
  app.post("/api/setup", loginLimit, async (req, res) => {
    if (one("SELECT id FROM users WHERE role='admin' LIMIT 1"))
      fail(409, "El administrador ya está creado.");
    const name = text(req.body.name, 100),
      email = emailOf(req.body.email);
    if (!name) fail(400, "Escribe tu nombre.");
    const hash = await hashPassword(req.body.password),
      id = randomUUID();
    transaction(() => {
      if (one("SELECT id FROM users WHERE role='admin' LIMIT 1"))
        fail(409, "El administrador ya está creado.");
      run(
        "INSERT INTO users(id,name,email,password_hash,role,must_change) VALUES(?,?,?,?,'admin',0)",
        id,
        name,
        email,
        hash,
      );
    });
    res
      .status(201)
      .json(newSession(res, one("SELECT * FROM users WHERE id=?", id)));
  });
  const dummyHash = hashPassword(randomBytes(24).toString("base64url"));
  app.post("/api/login", loginLimit, async (req, res) => {
    const user = one(
      "SELECT * FROM users WHERE email=?",
      text(req.body.email, 254).toLowerCase(),
    );
    const valid = await verifyPassword(
      req.body.password,
      user?.password_hash || (await dummyHash),
    );
    if (!user || !user.active || !valid)
      fail(401, "Correo o contraseña incorrectos.");
    res.json(newSession(res, user));
  });
  app.get("/api/me", auth, (req, res) =>
    res.json({ user: publicUser(req.user), csrf: req.session.csrf }),
  );
  app.post("/api/logout", auth, (req, res) => {
    run("DELETE FROM sessions WHERE token_hash=?", req.session.token_hash);
    res.clearCookie(cookieName, cookieSettings);
    res.json({ ok: true });
  });
  app.post("/api/password", auth, async (req, res) => {
    if (
      !(await verifyPassword(req.body.currentPassword, req.user.password_hash))
    )
      fail(400, "La contraseña actual no es correcta.");
    if (req.body.currentPassword === req.body.newPassword)
      fail(400, "Usa una contraseña diferente.");
    const hash = await hashPassword(req.body.newPassword);
    transaction(() => {
      run(
        "UPDATE users SET password_hash=?,must_change=0 WHERE id=?",
        hash,
        req.user.id,
      );
      run("DELETE FROM sessions WHERE user_id=?", req.user.id);
    });
    res.json(
      newSession(res, one("SELECT * FROM users WHERE id=?", req.user.id)),
    );
  });
  installPortfolio(app, { db, dataDir, auth, changed, admin });
  app.use("/api", auth, changed);
  app.get("/api/clients", admin, (req, res) =>
    res.json(
      all(
        "SELECT u.id,u.name,u.email,u.active,u.must_change,u.created,COUNT(g.id) AS gallery_count FROM users u LEFT JOIN galleries g ON g.client_id=u.id WHERE u.role='client' GROUP BY u.id ORDER BY u.created DESC",
      ),
    ),
  );
  app.post("/api/clients", admin, async (req, res) => {
    const name = text(req.body.name, 100),
      email = emailOf(req.body.email);
    if (!name) fail(400, "Escribe el nombre del cliente.");
    if (one("SELECT id FROM users WHERE email=?", email))
      fail(409, "Este correo ya tiene una cuenta.");
    const temporaryPassword =
        req.body.password || `Fx-${randomBytes(12).toString("base64url")}!`,
      hash = await hashPassword(temporaryPassword),
      id = randomUUID();
    run(
      "INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,'client')",
      id,
      name,
      email,
      hash,
    );
    res.status(201).json({
      user: publicUser(one("SELECT * FROM users WHERE id=?", id)),
      temporaryPassword,
    });
  });
  app.post("/api/clients/:id/reset", admin, async (req, res) => {
    const client = one(
      "SELECT * FROM users WHERE id=? AND role='client'",
      req.params.id,
    );
    if (!client) fail(404, "No se encontró este cliente.");
    const temporaryPassword = `Fx-${randomBytes(12).toString("base64url")}!`,
      hash = await hashPassword(temporaryPassword);
    transaction(() => {
      run(
        "UPDATE users SET password_hash=?,must_change=1 WHERE id=?",
        hash,
        client.id,
      );
      run("DELETE FROM sessions WHERE user_id=?", client.id);
    });
    res.json({ user: publicUser(client), temporaryPassword });
  });
  app.patch("/api/clients/:id", admin, (req, res) => {
    if (typeof req.body.active !== "boolean")
      fail(400, "Estado de cuenta inválido.");
    const result = run(
      "UPDATE users SET active=? WHERE id=? AND role='client'",
      req.body.active ? 1 : 0,
      req.params.id,
    );
    if (!result.changes) fail(404, "No se encontró este cliente.");
    run("DELETE FROM sessions WHERE user_id=?", req.params.id);
    res.json({ ok: true });
  });
  app.get("/api/galleries", (req, res) => {
    const rows =
      req.user.role === "admin"
        ? all(
            "SELECT g.*,u.name AS client_name,u.email AS client_email FROM galleries g JOIN users u ON u.id=g.client_id ORDER BY g.created DESC,g.id",
          )
        : all(
            "SELECT g.*,u.name AS client_name FROM galleries g JOIN users u ON u.id=g.client_id WHERE g.client_id=? AND g.status NOT IN ('draft','archived') ORDER BY g.created DESC,g.id",
            req.user.id,
          );
    res.json(rows.map(galleryJson));
  });
  function galleryInput(body) {
    const title = text(body.title, 120),
      description = text(body.description, 1000);
    if (!title) fail(400, "Escribe un nombre para la galería.");
    if (!integer(body.included_count, 10000) || body.included_count < 1)
      fail(400, "El cupo debe ser entre 1 y 10.000 fotos.");
    if (
      !integer(body.extra_price, 100000000) ||
      !["BOB", "USD"].includes(body.currency) ||
      typeof body.allow_extras !== "boolean"
    )
      fail(400, "Revisa el precio y la moneda de los extras.");
    const date = text(body.event_date, 10);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(400, "Fecha inválida.");
    return [
      title,
      description,
      date,
      body.included_count,
      body.extra_price,
      body.currency,
      body.allow_extras ? 1 : 0,
    ];
  }
  app.post("/api/galleries", admin, (req, res) => {
    const values = galleryInput(req.body);
    if (
      !one(
        "SELECT id FROM users WHERE id=? AND role='client' AND active=1",
        req.body.client_id,
      )
    )
      fail(400, "Selecciona un cliente activo.");
    const id = randomUUID();
    run(
      "INSERT INTO galleries(id,client_id,title,description,event_date,included_count,extra_price,currency,allow_extras) VALUES(?,?,?,?,?,?,?,?,?)",
      id,
      req.body.client_id,
      ...values,
    );
    res.status(201).json(galleryJson(galleryAccess(req, id)));
  });
  app.get("/api/galleries/:id", (req, res) => {
    const g = galleryAccess(req, req.params.id);
    res.json({
      ...galleryJson(g),
      photos: all(
        "SELECT id,filename,selected,delivery_name FROM photos WHERE gallery_id=? ORDER BY filename COLLATE NOCASE,id",
        g.id,
      ).map((p) => ({
        ...p,
        selected: !!p.selected,
        has_delivery: !!p.delivery_name,
      })),
    });
  });
  app.patch("/api/galleries/:id", admin, (req, res) => {
    const g = galleryAccess(req, req.params.id);
    if (!["draft", "selecting"].includes(g.status))
      fail(
        409,
        "Reabre la selección antes de modificar el cupo o los precios.",
      );
    run(
      "UPDATE galleries SET title=?,description=?,event_date=?,included_count=?,extra_price=?,currency=?,allow_extras=?,version=version+1 WHERE id=?",
      ...galleryInput(req.body),
      g.id,
    );
    res.json(galleryJson(galleryAccess(req, g.id)));
  });
  app.post("/api/galleries/:id/state", admin, (req, res) => {
    const g = galleryAccess(req, req.params.id),
      status = req.body.status;
    if (!["selecting", "editing", "delivered", "archived"].includes(status))
      fail(400, "Estado inválido.");
    const counts = galleryJson(g);
    if (status === "selecting" && !counts.photo_count)
      fail(400, "Sube al menos una foto antes de abrir la selección.");
    if (status === "editing" && g.status !== "confirmed")
      fail(409, "El cliente debe confirmar su selección primero.");
    if (
      status === "delivered" &&
      (!["confirmed", "editing"].includes(g.status) ||
        !counts.selected_count ||
        counts.selected_count !== counts.delivered_count)
    )
      fail(
        409,
        "Sube la versión editada de cada foto seleccionada antes de publicar la entrega.",
      );
    run(
      "UPDATE galleries SET status=?,version=version+1,confirmed_at=CASE WHEN ?='selecting' THEN NULL ELSE confirmed_at END,extra_consent=CASE WHEN ?='selecting' THEN NULL ELSE extra_consent END WHERE id=?",
      status,
      status,
      status,
      g.id,
    );
    res.json(galleryJson(galleryAccess(req, g.id)));
  });
  app.put("/api/galleries/:id/selection", (req, res) => {
    if (req.user.role !== "client")
      fail(403, "La selección la realiza el cliente.");
    const g = galleryAccess(req, req.params.id),
      ids = req.body.photo_ids;
    if (g.status !== "selecting") fail(409, "Esta selección está cerrada.");
    if (
      !Array.isArray(ids) ||
      ids.length > 10000 ||
      ids.some((id) => typeof id !== "string") ||
      new Set(ids).size !== ids.length
    )
      fail(400, "Selección inválida.");
    const valid = new Set(
      all("SELECT id FROM photos WHERE gallery_id=?", g.id).map((p) => p.id),
    );
    if (ids.some((id) => !valid.has(id)))
      fail(400, "La selección contiene fotos de otra galería.");
    if (!g.allow_extras && ids.length > g.included_count)
      fail(400, "Esta galería no permite fotos extra.");
    transaction(() => {
      if (
        !run(
          "UPDATE galleries SET version=version+1 WHERE id=? AND version=?",
          g.id,
          req.body.version ?? -1,
        ).changes
      )
        fail(
          409,
          "La galería cambió en otra ventana. Recárgala para continuar.",
        );
      run("UPDATE photos SET selected=0 WHERE gallery_id=?", g.id);
      const select = db.prepare(
        "UPDATE photos SET selected=1 WHERE id=? AND gallery_id=?",
      );
      for (const id of ids) select.run(id, g.id);
    });
    res.json({ version: g.version + 1, selected_count: ids.length });
  });
  app.post("/api/galleries/:id/confirm", (req, res) => {
    if (req.user.role !== "client")
      fail(403, "La confirmación la realiza el cliente.");
    const g = galleryAccess(req, req.params.id),
      counts = galleryJson(g);
    if (g.status !== "selecting" || g.version !== req.body.version)
      fail(409, "La galería cambió. Actualízala antes de confirmar.");
    if (!counts.selected_count) fail(400, "Selecciona al menos una foto.");
    const extra = Math.max(0, counts.selected_count - g.included_count);
    if (extra && !g.allow_extras)
      fail(400, "Ajusta tu selección al cupo incluido.");
    if (extra && req.body.accept_extras !== true)
      fail(400, "Confirma que las fotos adicionales tienen un costo extra.");
    run(
      "UPDATE galleries SET status='confirmed',confirmed_at=?,extra_consent=?,quoted_extra=?,notes=?,version=version+1 WHERE id=?",
      new Date().toISOString(),
      extra ? new Date().toISOString() : null,
      extra * g.extra_price,
      text(req.body.notes, 1000),
      g.id,
    );
    res.json(galleryJson(galleryAccess(req, g.id)));
  });
  app.post(
    "/api/galleries/:id/photos",
    admin,
    (req, res, next) => {
      const g = galleryAccess(req, req.params.id);
      if (!["draft", "selecting"].includes(g.status))
        fail(409, "Reabre la selección para subir fotos.");
      req.gallery = g;
      next();
    },
    uploadFiles,
    async (req, res) => {
      const uploaded = [],
        errors = [];
      try {
        for (const file of req.files || []) {
          const id = randomUUID(),
            filename = cleanName(file.originalname);
          try {
            const metadata = await sharp(file.path, {
              limitInputPixels: 100000000,
            }).metadata();
            if (metadata.format !== "jpeg")
              fail(400, "El archivo no es un JPG válido.");
            if (
              one(
                "SELECT id FROM photos WHERE gallery_id=? AND filename=?",
                req.gallery.id,
                filename,
              )
            )
              fail(409, "Ya existe una foto con este nombre.");
            await makePreview(
              file.path,
              privateFile("previews", id),
              req.gallery.client_name,
            );
            await fsp.copyFile(file.path, privateFile("originals", id));
            run(
              "INSERT INTO photos(id,gallery_id,filename) VALUES(?,?,?)",
              id,
              req.gallery.id,
              filename,
            );
            uploaded.push({ id, filename });
          } catch (error) {
            errors.push({
              filename,
              error: error.status
                ? error.message
                : "No se pudo procesar este JPG.",
            });
            await Promise.all(
              ["previews", "originals"].map((folder) =>
                fsp.unlink(privateFile(folder, id)).catch(() => {}),
              ),
            );
          }
        }
        if (!req.files?.length)
          fail(400, "Selecciona archivos JPG de hasta 35 MB.");
        if (uploaded.length)
          run(
            "UPDATE galleries SET version=version+1 WHERE id=?",
            req.gallery.id,
          );
        res.json({ uploaded, errors });
      } finally {
        for (const file of req.files || [])
          await fsp.unlink(file.path).catch(() => {});
      }
    },
  );
  const stem = (filename) =>
    filename
      .replace(/\.jpe?g$/i, "")
      .replace(/[-_ ](editad[ao]|edited|edit|final)$/i, "")
      .toLowerCase();
  app.post(
    "/api/galleries/:id/deliveries",
    admin,
    (req, res, next) => {
      const g = galleryAccess(req, req.params.id);
      if (!["confirmed", "editing"].includes(g.status))
        fail(409, "La selección debe estar confirmada para subir editadas.");
      req.gallery = g;
      next();
    },
    uploadFiles,
    async (req, res) => {
      const uploaded = [],
        errors = [],
        selected = all(
          "SELECT * FROM photos WHERE gallery_id=? AND selected=1",
          req.gallery.id,
        );
      try {
        for (const file of req.files || []) {
          const filename = cleanName(file.originalname);
          try {
            const matches = req.body.photo_id
              ? selected.filter((p) => p.id === req.body.photo_id)
              : selected.filter((p) => stem(p.filename) === stem(filename));
            if (matches.length !== 1)
              fail(
                400,
                "El nombre debe coincidir con una foto seleccionada. También puedes cargarla desde su tarjeta.",
              );
            const photo = matches[0],
              metadata = await sharp(file.path, {
                limitInputPixels: 100000000,
              }).metadata();
            if (metadata.format !== "jpeg")
              fail(400, "El archivo no es un JPG válido.");
            await makePreview(
              file.path,
              privateFile("delivery-previews", photo.id),
              null,
            );
            await fsp.copyFile(file.path, privateFile("deliveries", photo.id));
            run(
              "UPDATE photos SET delivery_name=? WHERE id=?",
              filename,
              photo.id,
            );
            uploaded.push({ id: photo.id, filename });
          } catch (error) {
            errors.push({
              filename,
              error: error.status
                ? error.message
                : "No se pudo procesar este JPG.",
            });
          }
        }
        if (!req.files?.length) fail(400, "Selecciona fotos JPG editadas.");
        if (uploaded.length)
          run(
            "UPDATE galleries SET status='editing',version=version+1 WHERE id=?",
            req.gallery.id,
          );
        res.json({ uploaded, errors });
      } finally {
        for (const file of req.files || [])
          await fsp.unlink(file.path).catch(() => {});
      }
    },
  );
  app.delete("/api/photos/:id", admin, async (req, res) => {
    const { photo, gallery } = photoAccess(req, req.params.id);
    if (!["draft", "selecting"].includes(gallery.status))
      fail(409, "Reabre la selección para eliminar una foto.");
    run("DELETE FROM photos WHERE id=?", photo.id);
    run("UPDATE galleries SET version=version+1 WHERE id=?", gallery.id);
    await Promise.all(
      ["originals", "previews", "deliveries", "delivery-previews"].map(
        (folder) => fsp.unlink(privateFile(folder, photo.id)).catch(() => {}),
      ),
    );
    res.json({ ok: true });
  });
  app.get("/api/photos/:id/preview", (req, res) => {
    const { photo, gallery } = photoAccess(req, req.params.id),
      delivery = req.query.delivery === "1";
    if (
      delivery &&
      (!photo.delivery_name ||
        (req.user.role !== "admin" && gallery.status !== "delivered"))
    )
      fail(403, "La entrega aún no está disponible.");
    res
      .type("jpeg")
      .set("Content-Disposition", "inline")
      .sendFile(
        privateFile(delivery ? "delivery-previews" : "previews", photo.id),
      );
  });
  app.get("/api/photos/:id/original", admin, (req, res) => {
    const { photo } = photoAccess(req, req.params.id);
    res.download(privateFile("originals", photo.id), photo.filename);
  });
  app.get("/api/photos/:id/download", (req, res) => {
    const { photo, gallery } = photoAccess(req, req.params.id);
    if (
      !photo.selected ||
      !photo.delivery_name ||
      (req.user.role !== "admin" && gallery.status !== "delivered")
    )
      fail(403, "Esta foto todavía no está disponible para descargar.");
    res.download(privateFile("deliveries", photo.id), photo.delivery_name);
  });
  app.get("/api/galleries/:id/download.zip", (req, res) => {
    const gallery = galleryAccess(req, req.params.id),
      originals = req.query.originals === "1";
    if (originals && req.user.role !== "admin")
      fail(403, "Los originales son privados.");
    if (
      !originals &&
      gallery.status !== "delivered" &&
      req.user.role !== "admin"
    )
      fail(403, "La entrega todavía no está publicada.");
    const photos = all(
      `SELECT * FROM photos WHERE gallery_id=? AND selected=1 ${originals ? "" : "AND delivery_name IS NOT NULL"} ORDER BY filename`,
      gallery.id,
    );
    if (!photos.length) fail(400, "No hay fotos disponibles para descargar.");
    res
      .type("application/zip")
      .attachment(
        `${cleanName(gallery.title)}-${originals ? "seleccion" : "editadas"}.zip`,
      );
    const zip = new yazl.ZipFile();
    zip.on("error", () => {
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    res.on("close", () => zip.outputStream.destroy());
    zip.outputStream.pipe(res);
    photos.forEach((p) =>
      zip.addFile(
        privateFile(originals ? "originals" : "deliveries", p.id),
        `${p.id.slice(0, 6)}-${originals ? p.filename : p.delivery_name}`,
        { compress: false },
      ),
    );
    zip.end();
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "No se encontró esta acción." }),
  );
  // Public portfolio and client interface share the origin, not their files.
  app.get(/^\/clientes$/, (req, res) => res.redirect(308, "/clientes/"));
  app.use("/clientes", (req, res, next) => {
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/clientes",
    express.static(path.join(root, "public"), {
      dotfiles: "deny",
      etag: false,
      maxAge: 0,
    }),
  );
  app.use(
    express.static(path.join(root, "site"), {
      dotfiles: "deny",
      etag: false,
      maxAge: 0,
    }),
  );
  app.use((req, res) => res.status(404).send("No encontrado"));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const isUpload = error instanceof multer.MulterError,
      status = error.status || (isUpload ? 400 : 500);
    const message = isUpload
      ? error.code === "LIMIT_FILE_SIZE"
        ? "Cada JPG puede pesar hasta 35 MB."
        : "Sube hasta 10 JPG por lote."
      : status < 500
        ? error.message
        : "No se pudo completar la acción. Inténtalo de nuevo.";
    if (status >= 500)
      console.error("Error del portal:", error.code || error.name);
    res.status(status).json({ error: message });
  });
  return { app, close: () => db.close() };
}
