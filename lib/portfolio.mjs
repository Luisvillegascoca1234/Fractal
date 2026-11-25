import express from "express";
import multer from "multer";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const defaults = [
  ["fotografia", "Fotografía", 0],
  ["social", "Social media", 0],
  ["video", "Video", 1],
  ["drones", "Drones", 1],
];
const maxPhotoSize = 35 * 1024 * 1024;
const maxVideoSize = 300 * 1024 * 1024;
const maxGroupFiles = 10;
const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};
const text = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const normalizeName = (name) =>
  name.normalize("NFD").replace(/\p{Mark}/gu, "").toLocaleLowerCase("es");
const categoryJson = (row) => ({
  id: row.id,
  name: row.name,
  requires_video: !!row.requires_video,
});

function uploadKind(entry) {
  if (entry.mimetype === "image/jpeg" && /\.jpe?g$/i.test(entry.originalname))
    return "image";
  if (entry.mimetype === "video/mp4" && /\.mp4$/i.test(entry.originalname))
    return "video";
}

function removalIds(value) {
  if (value === undefined) return new Set();
  let ids;
  try {
    ids = JSON.parse(value);
  } catch {
    fail(400, "La lista de archivos para quitar no es válida.");
  }
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
    fail(400, "La lista de archivos para quitar no es válida.");
  return new Set(ids);
}

// Access to each portfolio file follows the project's publication status.
export function installPortfolio(
  app,
  { db, dataDir, auth, changed, admin, transaction },
) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio(
      id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', cover_key TEXT NOT NULL,
      video_key TEXT, published INTEGER NOT NULL DEFAULT 0,
      created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS portfolio_categories(
      id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized_name TEXT NOT NULL UNIQUE,
      requires_video INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS portfolio_items(
      id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES portfolio(id) ON DELETE CASCADE,
      file_key TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('image','video')),
      name TEXT NOT NULL, width INTEGER, height INTEGER, position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS portfolio_items_order ON portfolio_items(work_id, position);
  `);
  const workColumns = new Set(
    db.prepare("PRAGMA table_info(portfolio)").all().map((column) => column.name),
  );
  for (const column of ["cover_width", "cover_height"]) {
    if (!workColumns.has(column))
      db.exec(`ALTER TABLE portfolio ADD COLUMN ${column} INTEGER`);
  }

  const seedCategory = db.prepare(
    "INSERT OR IGNORE INTO portfolio_categories(id,name,normalized_name,requires_video) VALUES (?,?,?,?)",
  );
  for (const [id, name, requiresVideo] of defaults)
    seedCategory.run(id, name, normalizeName(name), requiresVideo);

  const directory = path.join(dataDir, "portfolio");
  const ready = fs.mkdir(directory, { recursive: true });
  const file = (key) => path.join(directory, key);
  const one = (id) => db.prepare("SELECT * FROM portfolio WHERE id=?").get(id);
  const categoryById = db.prepare("SELECT * FROM portfolio_categories WHERE id=?");
  const workItems = db.prepare(
    "SELECT * FROM portfolio_items WHERE work_id=? ORDER BY position",
  );

  function getWork(id, privateAccess) {
    const row = one(id);
    if (!row || (!privateAccess && !row.published))
      fail(404, "No se encontró este trabajo.");
    return row;
  }

  function mediaFor(row, extras = workItems.all(row.id)) {
    const cover = row.cover_key
      ? {
          id: "cover",
          kind: "image",
          file_key: row.cover_key,
          width: row.cover_width,
          height: row.cover_height,
        }
      : extras.find((item) => item.kind === "image");
    const legacyVideo = row.video_key
      ? { id: "video", kind: "video", file_key: row.video_key }
      : null;
    const items = legacyVideo ? [legacyVideo, ...extras] : extras;
    if (!items.length && cover) return { cover, items: [cover] };
    return { cover, items };
  }

  function json(row, privateAccess = false) {
    const { cover, items } = mediaFor(row);
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      category_name: categoryById.get(row.category)?.name || row.category,
      description: row.description,
      published: !!row.published,
      has_cover: !!cover,
      cover_width: cover?.width ?? null,
      cover_height: cover?.height ?? null,
      has_video: items.some((item) => item.kind === "video"),
      items: items.map((item, index) => ({
        id: item.id,
        kind: item.kind,
        name:
          (privateAccess && item.name) ||
          `${item.kind === "image" ? "Foto" : "Video"} ${index + 1}`,
        width: item.width ?? null,
        height: item.height ?? null,
        removable: privateAccess && !!item.work_id,
      })),
      created: row.created,
      updated: row.updated,
    };
  }

  function serve(req, res, privateAccess = false) {
    const row = getWork(req.params.id, privateAccess);
    const { cover, items } = mediaFor(row);
    let asset;
    if (req.params.itemId) {
      asset = items.find((item) => item.id === req.params.itemId);
    } else if (req.params.kind === "cover") {
      asset = cover;
    } else if (req.params.kind === "video") {
      asset = items.find((item) => item.kind === "video");
    }
    if (!asset) fail(404, "No se encontró este archivo.");
    res.set("Cache-Control", privateAccess ? "no-store, private" : "no-store");
    res
      .type(asset.kind === "video" ? "video/mp4" : "image/jpeg")
      .sendFile(file(asset.file_key));
  }

  app.get("/api/portfolio", (req, res) => {
    const rows = db
      .prepare("SELECT * FROM portfolio WHERE published=1 ORDER BY created DESC,id")
      .all();
    res.json(rows.map((row) => json(row)));
  });
  app.get("/api/portfolio/categories", (req, res) => {
    const rows = db.prepare(`
      SELECT c.* FROM portfolio_categories c
      WHERE c.id IN ('fotografia','social','video','drones')
        OR EXISTS (SELECT 1 FROM portfolio p WHERE p.category=c.id AND p.published=1)
      ORDER BY c.rowid
    `).all();
    res.json(rows.map(categoryJson));
  });
  app.get("/api/portfolio/:id/items/:itemId", (req, res) => serve(req, res));
  app.get("/api/portfolio/:id/:kind", (req, res) => serve(req, res));

  const router = express.Router();
  router.use(auth, changed, admin);
  router.get("/categories", (req, res) =>
    res.json(
      db.prepare("SELECT * FROM portfolio_categories ORDER BY rowid")
        .all()
        .map(categoryJson),
    ),
  );
  router.post("/categories", (req, res) => {
    const name = text(req.body.name, 61).replace(/\s+/g, " ");
    const key = normalizeName(name);
    if (!key || name.length > 60)
      fail(400, "Escribe un nombre de hasta 60 caracteres para la categoría.");
    const id = randomUUID();
    const result = db.prepare(`
      INSERT INTO portfolio_categories(id,name,normalized_name) VALUES (?,?,?)
      ON CONFLICT(normalized_name) DO NOTHING
    `).run(id, name, key);
    if (!result.changes) fail(409, "Ya hay una categoría con ese nombre.");
    res.status(201).json(categoryJson(categoryById.get(id)));
  });
  router.get("/", (req, res) =>
    res.json(
      db.prepare("SELECT * FROM portfolio ORDER BY created DESC,id")
        .all()
        .map((row) => json(row, true)),
    ),
  );
  router.get("/:id", (req, res) =>
    res.json(json(getWork(req.params.id, true), true)),
  );
  router.get("/:id/items/:itemId", (req, res) => serve(req, res, true));
  router.get("/:id/:kind", (req, res) => serve(req, res, true));

  const upload = multer({
    storage: multer.diskStorage({
      destination: path.join(dataDir, "tmp"),
      filename: (req, entry, cb) => cb(null, randomUUID()),
    }),
    limits: {
      files: maxGroupFiles + 2,
      fileSize: maxVideoSize,
      fieldSize: 64 * 1024,
      fields: 8,
      parts: maxGroupFiles + 12,
    },
    fileFilter: (req, entry, cb) => {
      const kind = uploadKind(entry);
      const singleField = kind === "image" ? "cover" : "video";
      if (kind && (entry.fieldname === "media" || entry.fieldname === singleField))
        return cb(null, true);
      const error = new Error("Usa fotos JPG y videos MP4. La portada personalizada debe ser JPG.");
      error.status = 400;
      cb(error);
    },
  }).fields([
    { name: "cover", maxCount: 1 },
    { name: "video", maxCount: 1 },
    { name: "media", maxCount: maxGroupFiles },
  ]);
  const multipart = (req, res, next) => {
    upload(req, res, async (error) => {
      if (!error) return next();
      for (const entry of Object.values(req.files || {}).flat())
        await fs.unlink(entry.path).catch(() => {});
      if (!(error instanceof multer.MulterError)) return next(error);
      const message = error.code === "LIMIT_FILE_SIZE"
        ? "Cada video puede pesar hasta 300 MB y cada foto hasta 35 MB."
        : `Sube hasta ${maxGroupFiles} archivos por lote.`;
      next(Object.assign(new Error(message), { status: 400 }));
    });
  };

  async function store(entry, generated) {
    const kind = uploadKind(entry);
    const id = randomUUID();
    const fileKey = id + (kind === "image" ? ".jpg" : ".mp4");
    generated.push(fileKey);
    const data = {
      id,
      kind,
      file_key: fileKey,
      name: text(entry.originalname, 160),
      width: null,
      height: null,
    };
    if (kind === "image") {
      if (entry.size > maxPhotoSize)
        fail(400, "Cada foto JPG puede pesar hasta 35 MB.");
      const image = sharp(entry.path, { limitInputPixels: 100000000 });
      const metadata = await image.metadata().catch(() => null);
      if (metadata?.format !== "jpeg")
        fail(400, "Uno de los archivos no es un JPG válido.");
      const processed = await image
        .rotate()
        .resize({
          width: 2400,
          height: 2400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 87 })
        .toBuffer({ resolveWithObject: true })
        .catch(() => null);
      if (!processed) fail(400, "No se pudo leer una de las fotos JPG.");
      await fs.writeFile(file(fileKey), processed.data);
      return { ...data, width: processed.info.width, height: processed.info.height };
    }

    const handle = await fs.open(entry.path, "r");
    const header = Buffer.alloc(32);
    try {
      await handle.read(header, 0, header.length, 0);
    } finally {
      await handle.close();
    }
    if (entry.size < 24 || header.toString("ascii", 4, 8) !== "ftyp")
      fail(400, "El archivo no tiene un contenedor MP4 válido.");
    await fs.rename(entry.path, file(fileKey));
    return data;
  }

  async function save(req, res) {
    const uploads = Object.values(req.files || {}).flat();
    const generated = [];
    const obsolete = [];
    let result;
    try {
      await ready;
      const title = text(req.body.title, 120);
      const category = categoryById.get(text(req.body.category, 60));
      const description = text(req.body.description, 1200);
      const remove = removalIds(req.body.remove_items);
      if (!title || !category)
        fail(400, "Escribe un nombre y elige una categoría válida.");
      if (req.params.id) getWork(req.params.id, true);

      const coverUpload = req.files?.cover?.[0];
      const videoUpload = req.files?.video?.[0];
      const cover = coverUpload && (await store(coverUpload, generated));
      const video = videoUpload && (await store(videoUpload, generated));
      const added = [];
      for (const entry of req.files?.media || [])
        added.push(await store(entry, generated));

      result = transaction(() => {
        // Re-read after processing files so overlapping edits use the latest saved media.
        const existing = req.params.id ? getWork(req.params.id, true) : null;
        const id = existing?.id || randomUUID();
        const current = existing ? workItems.all(id) : [];
        const retained = current.filter((item) => !remove.has(item.id));
        const coverKey = cover?.file_key || existing?.cover_key || "";
        const coverWidth = cover?.width ?? existing?.cover_width ?? null;
        const coverHeight = cover?.height ?? existing?.cover_height ?? null;
        const videoKey =
          video?.file_key ||
          (req.body.remove_video === "on" ? null : existing?.video_key) ||
          null;
        if (!coverKey && !videoKey && !retained.length && !added.length)
          fail(400, "Agrega al menos una foto JPG o un video MP4 para este trabajo.");
        if (
          existing?.published &&
          category.requires_video &&
          !videoKey &&
          !retained.concat(added).some((item) => item.kind === "video")
        )
          fail(400, "Agrega un MP4 para mantener publicado este trabajo.");

        if (existing) {
          db.prepare(`
            UPDATE portfolio SET title=?,category=?,description=?,cover_key=?,cover_width=?,
              cover_height=?,video_key=?,updated=? WHERE id=?
          `).run(
            title, category.id, description, coverKey, coverWidth, coverHeight,
            videoKey, new Date().toISOString(), id,
          );
        } else {
          db.prepare(`
            INSERT INTO portfolio(id,title,category,description,cover_key,cover_width,cover_height,video_key)
            VALUES(?,?,?,?,?,?,?,?)
          `).run(id, title, category.id, description, coverKey, coverWidth, coverHeight, videoKey);
        }

        const removeItem = db.prepare("DELETE FROM portfolio_items WHERE id=?");
        for (const item of current.filter((item) => remove.has(item.id))) {
          removeItem.run(item.id);
          obsolete.push(item.file_key);
        }
        if (existing?.cover_key && existing.cover_key !== coverKey)
          obsolete.push(existing.cover_key);
        if (existing?.video_key && existing.video_key !== videoKey)
          obsolete.push(existing.video_key);
        const insert = db.prepare(`
          INSERT INTO portfolio_items (id,work_id,file_key,kind,name,width,height,position)
          VALUES (?,?,?,?,?,?,?,?)
        `);
        let position = (retained.at(-1)?.position ?? -1) + 1;
        for (const item of added)
          insert.run(item.id, id, item.file_key, item.kind, item.name, item.width, item.height, position++);
        return { status: existing ? 200 : 201, work: json(one(id), true) };
      });
    } catch (error) {
      for (const key of generated) await fs.unlink(file(key)).catch(() => {});
      throw error;
    } finally {
      for (const entry of uploads) await fs.unlink(entry.path).catch(() => {});
    }
    for (const key of obsolete) await fs.unlink(file(key)).catch(() => {});
    res.status(result.status).json(result.work);
  }

  router.post("/", multipart, save);
  router.put("/:id", multipart, save);
  router.patch("/:id/publication", (req, res) => {
    const row = getWork(req.params.id, true);
    if (typeof req.body.published !== "boolean")
      fail(400, "Estado de publicación inválido.");
    const work = json(row, true);
    if (
      req.body.published &&
      categoryById.get(row.category)?.requires_video &&
      !work.has_video
    )
      fail(400, "Este trabajo necesita un archivo MP4 para publicarse.");
    db.prepare("UPDATE portfolio SET published=?,updated=? WHERE id=?").run(
      req.body.published ? 1 : 0,
      new Date().toISOString(),
      row.id,
    );
    res.json(json(one(row.id), true));
  });
  app.use("/api/admin/portfolio", router);
}
