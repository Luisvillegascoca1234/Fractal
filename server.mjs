import { createPortal } from "./lib/portal.mjs";
const port = Number(process.env.PORT || 4173);
const { app, close } = createPortal({ origin: `http://127.0.0.1:${port}` });
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`FractalX · Portal local: http://127.0.0.1:${port}`),
);
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `El puerto ${port} ya está ocupado.`
      : error.message,
  );
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      close();
      process.exit(0);
    }),
  );
