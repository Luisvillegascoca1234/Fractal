import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createPortal } from "../lib/portal.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("flujo completo, persistencia y aislamiento de fotografías", async (t) => {
  const qaRoot = path.join(root, "qa");
  await fs.mkdir(qaRoot, { recursive: true });
  const dataDir = await fs.mkdtemp(path.join(qaRoot, "api-"));
  const base = "http://127.0.0.1:4187";
  let portal = createPortal({ dataDir, origin: base });
  let server = portal.app.listen(4187, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  async function stop() {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    portal.close();
  }
  t.after(async () => {
    await stop();
    const target = path.resolve(dataDir);
    assert.ok(target.startsWith(path.resolve(qaRoot) + path.sep));
    await fs.rm(target, { recursive: true, force: true });
  });
  function actor() {
    return { cookie: "", csrf: "" };
  }
  const admin = actor(),
    client = actor(),
    other = actor();
  async function request(
    who,
    url,
    {
      method = "GET",
      body,
      form,
      csrf = true,
      origin = base,
      binary = false,
    } = {},
  ) {
    const headers = { Origin: origin, Connection: "close" };
    if (who?.cookie) headers.Cookie = who.cookie;
    if (who?.csrf && csrf) headers["X-CSRF-Token"] = who.csrf;
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(base + url, {
      method,
      headers,
      body: form || (body ? JSON.stringify(body) : undefined),
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie && who) who.cookie = cookie.split(";")[0];
    const result = binary
      ? Buffer.from(await response.arrayBuffer())
      : await response.json().catch(() => null);
    if (result?.csrf && who) who.csrf = result.csrf;
    return { status: response.status, data: result, headers: response.headers };
  }
  const photo = await fs.readFile(path.join(root, "dist/assets/halcyon.jpg"));
  const form = (files, photoId) => {
    const data = new FormData();
    if (photoId) data.append("photo_id", photoId);
    for (const [name, bytes = photo] of files)
      data.append("photos", new Blob([bytes], { type: "image/jpeg" }), name);
    return data;
  };
  let gallery, ids;
  await t.test(
    "web principal pública y acceso de clientes independiente",
    async () => {
      const web = await request(null, "/", { binary: true });
      assert.equal(web.status, 200);
      assert.ok(web.data.toString().includes("Acceso clientes"));
      assert.ok(web.data.toString().includes("Social media"));
      assert.match(
        web.headers.get("content-security-policy"),
        /script-src 'self'/,
      );
      const portal = await request(null, "/clientes/", { binary: true });
      assert.equal(portal.status, 200);
      assert.ok(portal.data.toString().includes("/clientes/portal.js"));
      assert.equal(
        (await request(null, "/clientes/portal.js", { binary: true })).status,
        200,
      );
      assert.deepEqual((await request(null, "/api/portfolio")).data, []);
      assert.equal((await request(null, "/api/admin/portfolio")).status, 401);
    },
  );
  await t.test("configuración única, sesión privada y CSRF", async () => {
    assert.equal((await request(null, "/api/status")).data.setupRequired, true);
    assert.equal(
      (
        await request(null, "/api/setup", {
          method: "POST",
          origin: "https://evil.example",
          body: {},
        })
      ).status,
      403,
    );
    const result = await request(admin, "/api/setup", {
      method: "POST",
      body: {
        name: "Estudio de prueba",
        email: "admin@test.local",
        password: "Administrador-prueba-2026",
      },
    });
    assert.equal(result.status, 201);
    assert.equal(result.data.user.role, "admin");
    assert.match(result.headers.get("set-cookie"), /HttpOnly/);
    assert.match(result.headers.get("set-cookie"), /SameSite=Strict/);
    assert.equal(
      (await request(null, "/api/setup", { method: "POST", body: {} })).status,
      409,
    );
    assert.equal(
      (
        await request(admin, "/api/clients", {
          method: "POST",
          body: { name: "No permitido", email: "no@test.local" },
          csrf: false,
        })
      ).status,
      403,
    );
    for (const url of [
      "/data/fractalx.sqlite",
      "/.git/config",
      "/dist/index.html",
      "/originals/test.jpg",
    ])
      assert.equal((await request(null, url, { binary: true })).status, 404);
  });
  let clientId;
  await t.test(
    "portafolio: borradores privados, publicación explícita y video por rangos",
    async () => {
      const workForm = (category = "fotografia", includeVideo = false) => {
        const f = new FormData();
        f.append("title", "Trabajo público de prueba");
        f.append("category", category);
        f.append("description", "Una historia visual de prueba.");
        f.append(
          "cover",
          new Blob([photo], { type: "image/jpeg" }),
          "portada.jpg",
        );
        if (includeVideo) {
          const mp4 = Buffer.alloc(32);
          mp4.writeUInt32BE(32, 0);
          mp4.write("ftypisom", 4, "ascii");
          mp4.write("isom", 16, "ascii");
          f.append(
            "video",
            new Blob([mp4], { type: "video/mp4" }),
            "video.mp4",
          );
        }
        return f;
      };
      const created = await request(admin, "/api/admin/portfolio", {
        method: "POST",
        form: workForm(),
      });
      assert.equal(created.status, 201);
      const id = created.data.id;
      assert.equal(created.data.published, false);
      assert.equal(
        (await request(null, `/api/portfolio/${id}/cover`)).status,
        404,
      );
      assert.equal(
        (
          await request(admin, `/api/admin/portfolio/${id}/cover`, {
            binary: true,
          })
        ).status,
        200,
      );
      assert.deepEqual((await request(null, "/api/portfolio")).data, []);
      assert.equal(
        (
          await request(admin, `/api/admin/portfolio/${id}/publication`, {
            method: "PATCH",
            body: { published: true },
          })
        ).status,
        200,
      );
      const visible = (await request(null, "/api/portfolio")).data;
      assert.equal(visible.length, 1);
      assert.equal(visible[0].id, id);
      assert.equal(visible[0].cover_key, undefined);
      assert.equal(
        (await request(null, `/api/portfolio/${id}/cover`, { binary: true }))
          .status,
        200,
      );
      await request(admin, `/api/admin/portfolio/${id}/publication`, {
        method: "PATCH",
        body: { published: false },
      });
      assert.equal(
        (await request(null, `/api/portfolio/${id}/cover`)).status,
        404,
      );
      const draft = await request(admin, "/api/admin/portfolio", {
        method: "POST",
        form: workForm("drones"),
      });
      assert.equal(
        (
          await request(
            admin,
            `/api/admin/portfolio/${draft.data.id}/publication`,
            { method: "PATCH", body: { published: true } },
          )
        ).status,
        400,
      );
      const updated = await request(
        admin,
        `/api/admin/portfolio/${draft.data.id}`,
        { method: "PUT", form: workForm("drones", true) },
      );
      assert.equal(updated.status, 200);
      assert.equal(updated.data.has_video, true);
      await request(
        admin,
        `/api/admin/portfolio/${draft.data.id}/publication`,
        { method: "PATCH", body: { published: true } },
      );
      const partial = await fetch(
        `${base}/api/portfolio/${draft.data.id}/video`,
        { headers: { Range: "bytes=0-15", Connection: "close" } },
      );
      assert.equal(partial.status, 206);
      assert.match(partial.headers.get("content-type"), /video\/mp4/);
      assert.equal((await partial.arrayBuffer()).byteLength, 16);
      const noVideo = workForm("drones");
      noVideo.append("remove_video", "on");
      assert.equal(
        (
          await request(admin, `/api/admin/portfolio/${draft.data.id}`, {
            method: "PUT",
            form: noVideo,
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "cuentas asignadas y cambio obligatorio de clave temporal",
    async () => {
      const created = await request(admin, "/api/clients", {
        method: "POST",
        body: { name: "María · Prueba", email: "maria@test.local" },
      });
      clientId = created.data.user.id;
      assert.equal(created.status, 201);
      assert.ok(created.data.temporaryPassword.length >= 12);
      assert.equal(
        (
          await request(client, "/api/login", {
            method: "POST",
            body: {
              email: "maria@test.local",
              password: created.data.temporaryPassword,
            },
          })
        ).data.user.mustChange,
        true,
      );
      assert.equal((await request(client, "/api/galleries")).status, 403);
      assert.equal(
        (
          await request(client, "/api/password", {
            method: "POST",
            body: {
              currentPassword: created.data.temporaryPassword,
              newPassword: "Mi-nueva-clave-2026",
            },
          })
        ).data.user.mustChange,
        false,
      );
      assert.equal(
        (
          await request(null, "/api/login", {
            method: "POST",
            body: {
              email: "maria@test.local",
              password: created.data.temporaryPassword,
            },
          })
        ).status,
        401,
      );
      const c2 = await request(admin, "/api/clients", {
        method: "POST",
        body: { name: "Otro cliente", email: "otro@test.local" },
      });
      await request(other, "/api/login", {
        method: "POST",
        body: { email: "otro@test.local", password: c2.data.temporaryPassword },
      });
      await request(other, "/api/password", {
        method: "POST",
        body: {
          currentPassword: c2.data.temporaryPassword,
          newPassword: "Otra-clave-nueva-2026",
        },
      });
      assert.equal(
        (
          await request(client, "/api/clients", {
            method: "POST",
            body: { name: "Intruso", email: "intruso@test.local" },
          })
        ).status,
        403,
      );
      assert.equal((await request(client, "/api/admin/portfolio")).status, 403);
      const createdGallery = await request(admin, "/api/galleries", {
        method: "POST",
        body: {
          client_id: clientId,
          title: "Retratos · María",
          event_date: "2026-11-05",
          description: "Sesión de prueba",
          included_count: 1,
          extra_price: 2500,
          currency: "BOB",
          allow_extras: true,
        },
      });
      assert.equal(createdGallery.status, 201);
      gallery = createdGallery.data;
      assert.equal(
        (await request(client, `/api/galleries/${gallery.id}`)).status,
        404,
      );
      assert.deepEqual((await request(client, "/api/galleries")).data, []);
    },
  );
  await t.test(
    "JPG verificados, previsualización reducida y originales privados",
    async () => {
      const upload = await request(
        admin,
        `/api/galleries/${gallery.id}/photos`,
        {
          method: "POST",
          form: form([["FOTO_001.jpg"], ["FOTO_002.JPG"], ["FOTO_003.jpg"]]),
        },
      );
      assert.equal(upload.status, 200);
      assert.equal(upload.data.uploaded.length, 3);
      ids = upload.data.uploaded.map((p) => p.id);
      assert.equal(
        (await request(null, `/api/portfolio/${ids[0]}/cover`)).status,
        404,
      );
      assert.ok(
        (await request(null, "/api/portfolio")).data.every(
          (work) => !ids.includes(work.id),
        ),
      );
      assert.equal(
        (
          await request(admin, `/api/galleries/${gallery.id}/photos`, {
            method: "POST",
            form: form([["falso.jpg", Buffer.from("<script>fake</script>")]]),
          })
        ).data.errors.length,
        1,
      );
      assert.equal(
        (
          await request(admin, `/api/galleries/${gallery.id}/photos`, {
            method: "POST",
            form: form([["FOTO_001.jpg"]]),
          })
        ).data.errors.length,
        1,
      );
      assert.equal(
        (
          await request(admin, `/api/galleries/${gallery.id}/state`, {
            method: "POST",
            body: { status: "selecting" },
          })
        ).status,
        200,
      );
      assert.equal(
        (await request(null, `/api/photos/${ids[0]}/preview`)).status,
        401,
      );
      assert.equal(
        (await request(other, `/api/photos/${ids[0]}/preview`)).status,
        404,
      );
      assert.equal(
        (await request(other, `/api/galleries/${gallery.id}`)).status,
        404,
      );
      const preview = await request(client, `/api/photos/${ids[0]}/preview`, {
        binary: true,
      });
      assert.equal(preview.status, 200);
      assert.match(preview.headers.get("cache-control"), /no-store/);
      const metadata = await sharp(preview.data).metadata();
      assert.ok(Math.max(metadata.width, metadata.height) <= 1400);
      assert.equal(metadata.exif, undefined);
      assert.notDeepEqual(preview.data, photo);
      const unmarked = await sharp(photo)
        .rotate()
        .resize({
          width: 1400,
          height: 1400,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 72 })
        .toBuffer();
      assert.notDeepEqual(
        preview.data,
        unmarked,
        "la vista debe contener una marca de agua real",
      );
      assert.equal(
        (await request(client, `/api/photos/${ids[0]}/original`)).status,
        403,
      );
      assert.deepEqual(
        (
          await request(admin, `/api/photos/${ids[0]}/original`, {
            binary: true,
          })
        ).data,
        photo,
      );
      gallery = (await request(client, `/api/galleries/${gallery.id}`)).data;
    },
  );
  await t.test(
    "cupo, extras aceptados, conflictos entre ventanas y cierre de selección",
    async () => {
      assert.equal(
        (
          await request(client, `/api/galleries/${gallery.id}/selection`, {
            method: "PUT",
            body: { photo_ids: ids.slice(0, 2), version: -1 },
          })
        ).status,
        409,
      );
      const selected = await request(
        client,
        `/api/galleries/${gallery.id}/selection`,
        {
          method: "PUT",
          body: { photo_ids: ids.slice(0, 2), version: gallery.version },
        },
      );
      assert.equal(selected.status, 200);
      gallery.version = selected.data.version;
      assert.equal(
        (
          await request(client, `/api/galleries/${gallery.id}/confirm`, {
            method: "POST",
            body: { version: gallery.version, accept_extras: false },
          })
        ).status,
        400,
      );
      const confirmed = await request(
        client,
        `/api/galleries/${gallery.id}/confirm`,
        {
          method: "POST",
          body: {
            version: gallery.version,
            accept_extras: true,
            quoted_extra: 0,
            notes: "Cuidar los detalles.",
          },
        },
      );
      assert.equal(confirmed.data.status, "confirmed");
      assert.equal(confirmed.data.quoted_extra, 2500);
      assert.ok(confirmed.data.extra_consent);
      assert.equal(
        (
          await request(client, `/api/galleries/${gallery.id}/selection`, {
            method: "PUT",
            body: { photo_ids: [], version: confirmed.data.version },
          })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(admin, `/api/galleries/${gallery.id}`, {
            method: "PATCH",
            body: {
              title: "Cambio",
              included_count: 10,
              extra_price: 0,
              currency: "BOB",
              allow_extras: true,
            },
          })
        ).status,
        409,
      );
    },
  );
  await t.test(
    "entrega solo cuando están todas las editadas, ZIP y autorización",
    async () => {
      assert.equal(
        (
          await request(admin, `/api/galleries/${gallery.id}/state`, {
            method: "POST",
            body: { status: "delivered" },
          })
        ).status,
        409,
      );
      assert.equal(
        (await request(client, `/api/galleries/${gallery.id}/download.zip`))
          .status,
        403,
      );
      const originals = await request(
        admin,
        `/api/galleries/${gallery.id}/download.zip?originals=1`,
        { binary: true },
      );
      assert.equal(originals.status, 200);
      assert.equal(originals.data.subarray(0, 2).toString(), "PK");
      const uploaded = await request(
        admin,
        `/api/galleries/${gallery.id}/deliveries`,
        {
          method: "POST",
          form: form([["FOTO_001_editada.jpg"], ["FOTO_002_final.jpg"]]),
        },
      );
      assert.equal(uploaded.data.uploaded.length, 2);
      assert.equal(
        (await request(client, `/api/photos/${ids[0]}/download`)).status,
        403,
      );
      assert.equal(
        (await request(client, `/api/photos/${ids[0]}/preview?delivery=1`))
          .status,
        403,
      );
      assert.equal(
        (
          await request(admin, `/api/galleries/${gallery.id}/state`, {
            method: "POST",
            body: { status: "delivered" },
          })
        ).status,
        200,
      );
      const delivery = await request(client, `/api/photos/${ids[0]}/download`, {
        binary: true,
      });
      assert.equal(delivery.status, 200);
      assert.deepEqual(delivery.data, photo);
      assert.match(delivery.headers.get("content-disposition"), /attachment/);
      assert.equal(
        (await request(other, `/api/photos/${ids[0]}/download`)).status,
        404,
      );
      assert.equal(
        (await request(client, `/api/photos/${ids[2]}/download`)).status,
        403,
      );
      assert.equal(
        (
          await request(
            client,
            `/api/galleries/${gallery.id}/download.zip?originals=1`,
          )
        ).status,
        403,
      );
      const zip = await request(
        client,
        `/api/galleries/${gallery.id}/download.zip`,
        { binary: true },
      );
      assert.equal(zip.status, 200);
      assert.equal(zip.data.subarray(0, 2).toString(), "PK");
      assert.ok(zip.data.includes(Buffer.from("FOTO_001_editada.jpg")));
    },
  );
  await t.test(
    "reabrir oculta la entrega y un cambio de cupo no elude la validación",
    async () => {
      await request(admin, `/api/galleries/${gallery.id}/state`, {
        method: "POST",
        body: { status: "selecting" },
      });
      assert.equal(
        (await request(client, `/api/photos/${ids[0]}/download`)).status,
        403,
      );
      await request(admin, `/api/galleries/${gallery.id}`, {
        method: "PATCH",
        body: {
          title: "Retratos · María",
          included_count: 1,
          extra_price: 2500,
          currency: "BOB",
          allow_extras: false,
        },
      });
      let g = (await request(client, `/api/galleries/${gallery.id}`)).data;
      assert.equal(
        (
          await request(client, `/api/galleries/${gallery.id}/confirm`, {
            method: "POST",
            body: { version: g.version, accept_extras: true },
          })
        ).status,
        400,
      );
      await request(admin, `/api/galleries/${gallery.id}`, {
        method: "PATCH",
        body: {
          title: "Retratos · María",
          included_count: 1,
          extra_price: 2500,
          currency: "BOB",
          allow_extras: true,
        },
      });
      g = (await request(client, `/api/galleries/${gallery.id}`)).data;
      assert.equal(
        (
          await request(client, `/api/galleries/${gallery.id}/confirm`, {
            method: "POST",
            body: { version: g.version, accept_extras: true },
          })
        ).status,
        200,
      );
      await request(admin, `/api/galleries/${gallery.id}/state`, {
        method: "POST",
        body: { status: "delivered" },
      });
    },
  );
  await t.test(
    "cuenta desactivada pierde acceso y los datos sobreviven al reinicio",
    async () => {
      await request(admin, `/api/clients/${clientId}`, {
        method: "PATCH",
        body: { active: false },
      });
      assert.equal(
        (await request(client, `/api/photos/${ids[0]}/preview`)).status,
        401,
      );
      await request(admin, `/api/clients/${clientId}`, {
        method: "PATCH",
        body: { active: true },
      });
      await stop();
      portal = createPortal({ dataDir, origin: base });
      server = portal.app.listen(4187, "127.0.0.1");
      await new Promise((resolve) => server.once("listening", resolve));
      assert.equal(
        (
          await request(client, "/api/login", {
            method: "POST",
            body: {
              email: "maria@test.local",
              password: "Mi-nueva-clave-2026",
            },
          })
        ).status,
        200,
      );
      assert.equal(
        (await request(client, `/api/galleries/${gallery.id}`)).data.status,
        "delivered",
      );
      assert.deepEqual(
        (
          await request(client, `/api/photos/${ids[0]}/download`, {
            binary: true,
          })
        ).data,
        photo,
      );
      const reset = await request(admin, `/api/clients/${clientId}/reset`, {
        method: "POST",
      });
      assert.equal(reset.status, 200);
      assert.equal((await request(client, "/api/galleries")).status, 401);
      assert.equal(
        (
          await request(client, "/api/login", {
            method: "POST",
            body: {
              email: "maria@test.local",
              password: reset.data.temporaryPassword,
            },
          })
        ).data.user.mustChange,
        true,
      );
    },
  );
});
