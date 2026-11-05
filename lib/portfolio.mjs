import express from "express";
import multer from "multer";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const categories = new Set(["fotografia", "social", "video", "drones"]);
const fail = (status, message) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const text = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

// Only explicitly published portfolio assets have an anonymous route.
// Client galleries remain in their separate, authenticated media routes.
export function installPortfolio(app, { db, dataDir, auth, changed, admin }) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS portfolio(id TEXT PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',cover_key TEXT NOT NULL,video_key TEXT,published INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
  );
  const directory = path.join(dataDir, "portfolio");
  const ready = fs.mkdir(directory, { recursive: true });
  const one = (id) => db.prepare("SELECT * FROM portfolio WHERE id=?").get(id);
  const json = (row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    published: !!row.published,
    has_video: !!row.video_key,
    created: row.created,
    updated: row.updated,
  });
  const file = (key) => path.join(directory, key);
  function serve(req, res, privateAccess = false) {
    const row = one(req.params.id);
    if (!row || (!privateAccess && !row.published))
      fail(404, "No se encontró este trabajo.");
    const video = req.params.kind === "video";
    if (
      !["cover", "video"].includes(req.params.kind) ||
      (video && !row.video_key)
    )
      fail(404, "No se encontró este archivo.");
    res.set("Cache-Control", "no-store");
    res
      .type(video ? "video/mp4" : "image/jpeg")
      .sendFile(file(video ? row.video_key : row.cover_key));
  }
  app.get("/api/portfolio", (req, res) => {
    const rows = db
      .prepare(
        "SELECT * FROM portfolio WHERE published=1 ORDER BY created DESC,id",
      )
      .all();
    res.json(rows.map(json));
  });
  app.get("/api/portfolio/:id/:kind", (req, res) => serve(req, res));
  const router = express.Router();
  router.use(auth, changed, admin);
  router.get("/", (req, res) =>
    res.json(
      db
        .prepare("SELECT * FROM portfolio ORDER BY created DESC,id")
        .all()
        .map(json),
    ),
  );
  router.get("/:id/:kind", (req, res) => serve(req, res, true));
  const upload = multer({
    storage: multer.diskStorage({
      destination: path.join(dataDir, "tmp"),
      filename: (req, file, cb) => cb(null, randomUUID()),
    }),
    limits: { files: 2, fileSize: 300 * 1024 * 1024, fields: 8, parts: 10 },
    fileFilter: (req, file, cb) => {
      const valid =
        file.fieldname === "cover"
          ? file.mimetype === "image/jpeg" &&
            /\.jpe?g$/i.test(file.originalname)
          : file.fieldname === "video" &&
            file.mimetype === "video/mp4" &&
            /\.mp4$/i.test(file.originalname);
      if (!valid) {
        const error = new Error(
          "Usa una portada JPG y, si corresponde, un video MP4.",
        );
        error.status = 400;
        return cb(error);
      }
      cb(null, true);
    },
  }).fields([
    { name: "cover", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]);
  const multipart = (req, res, next) =>
    upload(req, res, async (error) => {
      if (!error) return next();
      for (const entry of Object.values(req.files || {}).flat())
        await fs.unlink(entry.path).catch(() => {});
      const e = new Error(
        error instanceof multer.MulterError
          ? "El video puede pesar hasta 300 MB y la portada hasta 35 MB."
          : error.message,
      );
      e.status = error.status || 400;
      next(e);
    });
  async function save(req, res) {
    await ready;
    const existing = req.params.id ? one(req.params.id) : null;
    const uploads = Object.values(req.files || {}).flat();
    const generated = [];
    try {
      if (req.params.id && !existing) fail(404, "No se encontró este trabajo.");
      const title = text(req.body.title, 120),
        category = text(req.body.category, 30),
        description = text(req.body.description, 1200);
      if (!title || !categories.has(category))
        fail(400, "Escribe un título y elige una categoría válida.");
      const cover = req.files?.cover?.[0],
        video = req.files?.video?.[0];
      if (!existing && !cover)
        fail(400, "Agrega una portada JPG para este trabajo.");
      let coverKey = existing?.cover_key,
        videoKey = req.body.remove_video === "on" ? null : existing?.video_key;
      if (cover) {
        if (cover.size > 35 * 1024 * 1024)
          fail(400, "La portada JPG puede pesar hasta 35 MB.");
        const image = sharp(cover.path, { limitInputPixels: 100000000 });
        if ((await image.metadata()).format !== "jpeg")
          fail(400, "La portada no es un JPG válido.");
        coverKey = randomUUID() + ".jpg";
        generated.push(coverKey);
        await image
          .rotate()
          .resize({
            width: 2400,
            height: 2400,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 87 })
          .toFile(file(coverKey));
      }
      if (video) {
        const handle = await fs.open(video.path, "r");
        const header = Buffer.alloc(32);
        try {
          await handle.read(header, 0, 32, 0);
        } finally {
          await handle.close();
        }
        if (video.size < 24 || header.toString("ascii", 4, 8) !== "ftyp")
          fail(400, "El archivo no tiene un contenedor MP4 válido.");
        videoKey = randomUUID() + ".mp4";
        generated.push(videoKey);
        await fs.copyFile(video.path, file(videoKey));
      }
      if (
        existing?.published &&
        ["video", "drones"].includes(category) &&
        !videoKey
      )
        fail(400, "Agrega el MP4 antes de publicar un trabajo de video.");
      const id = existing?.id || randomUUID();
      if (existing)
        db.prepare(
          "UPDATE portfolio SET title=?,category=?,description=?,cover_key=?,video_key=?,updated=? WHERE id=?",
        ).run(
          title,
          category,
          description,
          coverKey,
          videoKey || null,
          new Date().toISOString(),
          id,
        );
      else
        db.prepare(
          "INSERT INTO portfolio(id,title,category,description,cover_key,video_key) VALUES(?,?,?,?,?,?)",
        ).run(id, title, category, description, coverKey, videoKey || null);
      for (const key of [existing?.cover_key, existing?.video_key].filter(
        (key) => key && key !== coverKey && key !== videoKey,
      ))
        await fs.unlink(file(key)).catch(() => {});
      res.status(existing ? 200 : 201).json(json(one(id)));
    } catch (error) {
      for (const key of generated) await fs.unlink(file(key)).catch(() => {});
      throw error;
    } finally {
      for (const entry of uploads) await fs.unlink(entry.path).catch(() => {});
    }
  }
  router.post("/", multipart, save);
  router.put("/:id", multipart, save);
  router.patch("/:id/publication", (req, res) => {
    const row = one(req.params.id);
    if (!row) fail(404, "No se encontró este trabajo.");
    if (typeof req.body.published !== "boolean")
      fail(400, "Estado de publicación inválido.");
    if (
      req.body.published &&
      ["video", "drones"].includes(row.category) &&
      !row.video_key
    )
      fail(400, "Este trabajo necesita un archivo MP4 para publicarse.");
    db.prepare("UPDATE portfolio SET published=?,updated=? WHERE id=?").run(
      req.body.published ? 1 : 0,
      new Date().toISOString(),
      row.id,
    );
    res.json(json(one(row.id)));
  });
  app.use("/api/admin/portfolio", router);
}
