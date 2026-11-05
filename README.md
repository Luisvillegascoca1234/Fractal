# FractalX — Portafolio audiovisual y portal de clientes

Sitio público de fotografía, social media, producción de video y drones, basado en el diseño original guardado. El apartado privado de clientes conserva la selección y entrega de fotografías. Ambos comparten el logo, la paleta negra/lima y la navegación liquid glass.

## Iniciar

Requiere Node.js 24.18 o superior.

```powershell
npm ci
npm run dev
```

La web principal está en http://127.0.0.1:4173/. El acceso privado está en http://127.0.0.1:4173/clientes/. El servidor escucha únicamente en esta computadora. En la primera visita al apartado de clientes, crea tu administrador con tu nombre, correo y una contraseña de al menos 12 caracteres. No hay contraseñas predeterminadas.

## Web principal y portafolio

La página principal recupera la estructura del sitio original: menú flotante, gran titular, franja continua, estudio, tarjetas de trabajos, servicios y contacto. Los textos se adaptaron a fotografía, social media, video y drones. El botón **Acceso clientes** abre `/clientes/`. El logo del portal y sus enlaces de regreso vuelven a la web principal.

Para publicar trabajos, entra como administrador y abre **Portafolio**:

1. Pulsa **Nuevo trabajo**, indica título, categoría y descripción, y elige una portada JPG de hasta 35 MB.
2. Si es un video, agrega un MP4 de hasta 300 MB. Video y Drones requieren el MP4 antes de publicar. Social media puede mostrar una fotografía o un video.
3. Guarda el trabajo como borrador y pulsa **Publicar** cuando quieras mostrarlo. **Retirar del sitio** lo oculta sin borrar sus archivos.
4. La web pública filtra por categoría, amplía las fotografías y reproduce los videos. El reproductor admite consultas por rangos para cargar y buscar dentro del MP4.

El portafolio se gestiona separado de las galerías privadas: una foto de un cliente no se publica automáticamente. Los borradores tampoco tienen una ruta de archivo pública. Mientras no haya trabajos publicados se muestran referencias visuales identificadas como tales, heredadas del sitio original; no son trabajos reales del estudio.

Los archivos del portafolio se guardan en `data/portfolio/`, y solo se sirven a visitantes cuando el trabajo está publicado. Las vistas de administración requieren sesión de administrador.

## Flujo del administrador

1. En **Clientes**, crea la cuenta del cliente. El sistema genera una contraseña temporal y la muestra una sola vez. Comparte el correo, la clave y el enlace por un canal privado. Al entrar, el cliente debe cambiarla.
2. Crea una **galería**, asigna el cliente, la cantidad de fotos incluidas y el precio por foto adicional. Puedes elegir BOB o USD. Con precio 0, los extras se muestran como «costo extra a cotizar»; no se presentan como gratuitos.
3. Sube los JPG/JPEG y pulsa **Abrir selección**. Cada archivo puede pesar hasta 35 MB. Las subidas se procesan en lotes de cinco y se informa cualquier error por archivo. Los nombres duplicados se rechazan.
4. Cuando el cliente confirme, revisa sus notas y extras aceptados. Descarga **Originales elegidos** para editar fuera del sistema. El portal no edita fotografías.
5. Sube las editadas usando los nombres originales. Se reconocen sufijos como `_editada`, `_final` y `_edited`. Si un nombre no coincide, usa **Subir editada** en la tarjeta de la foto elegida para asociarla manualmente.
6. **Publicar entrega** solo se habilita cuando cada foto seleccionada tiene su editada. El cliente podrá descargar los JPG individuales o un ZIP completo.

Las galerías nuevas son borradores y no aparecen al cliente hasta abrir su selección. Puedes reabrir una selección confirmada si el cliente necesita cambiarla. Al reabrir, se ocultan las descargas hasta volver a publicar. Archivar una galería la oculta al cliente y conserva los archivos. Desactivar una cuenta cierra sus sesiones sin borrar sus fotos. Restablecer una clave también invalida sus sesiones.

## Flujo del cliente

Entra con la cuenta asignada, cambia la contraseña temporal y abre tu sesión. Usa el círculo de cada foto para elegirla, o ábrela en grande. La selección se guarda en el servidor. Si supera el cupo, verás el costo extra y deberás aceptarlo expresamente al confirmar. No se realiza ningún cobro automático. Una selección confirmada queda cerrada hasta que el administrador la reabra. La entrega final permite descargar solo las editadas publicadas.

Para probar ambos roles en la misma computadora, deja el administrador en una ventana normal y abre http://127.0.0.1:4173/clientes/ en una ventana de incógnito para el cliente. Dos pestañas de la misma ventana comparten sesión.

## Protección y límites

- Los originales y las entregas se guardan fuera de la carpeta pública. Todas las rutas de fotos y ZIP comprueban la sesión, el propietario de la galería y su estado en el servidor.
- Para seleccionar se muestran copias JPEG de hasta 1400 px, sin EXIF, con marca de agua incrustada. No se envían los originales al navegador del cliente.
- Ninguna web puede impedir completamente guardar una imagen visible o hacer una captura de pantalla. La protección reduce el valor de esas copias y reserva las descargas de alta resolución para la entrega final.
- Contraseñas derivadas con scrypt y sal aleatoria. Sesiones revocables en SQLite, cookies HttpOnly/SameSite, protección CSRF/origen, límites de intentos y cabeceras de seguridad. La cookie se configura Secure si se usa un origen HTTPS.
- Solo JPG/JPEG: se verifica tanto el tipo de archivo como su decodificación, con límites de tamaño y píxeles. Los nombres físicos son aleatorios y no dependen del archivo subido.
- No hay pagos, envío de correos, registro público, cuentas de prueba predeterminadas ni integraciones externas. Los accesos se comparten manualmente.

Esta versión es para pruebas locales. Todavía no se ha desplegado en internet. Para una publicación futura hará falta un servidor Node con disco persistente y HTTPS, además de configurar copias de seguridad y revisar almacenamiento. El alojamiento estático anterior de Sites no ejecuta este backend Node/SQLite.

## Archivos y respaldo

- `site/`: web principal restaurada desde el respaldo, con los estilos originales, textos audiovisuales y portafolio conectado.
- `public/`: interfaz privada de acceso, servida en `/clientes/`.
- `lib/portal.mjs`: acceso, cuentas, galerías, selección, archivos y entregas.
- `lib/portfolio.mjs`: trabajos públicos, borradores, portadas y videos del portafolio.
- `data/`: SQLite, originales, vistas con marca de agua y editadas. Se crea al iniciar y está excluida de Git. No borres esta carpeta para actualizar el código.
- `dist/`: fuentes del sitio anterior, conservadas y fuera de la superficie pública del portal.
- `tests/portal.test.mjs`: pruebas de integración con datos temporales independientes.

Se guardó una copia completa y verificada del sitio original, incluido su historial Git, en:

`D:/Documentos de Lucho/Portafolio Luis Villegas/respaldo-fractalx-web-2026-11-05`

Para volver a ver esa copia sin modificarla, detén el portal y ejecuta:

```powershell
node "D:/Documentos de Lucho/Portafolio Luis Villegas/respaldo-fractalx-web-2026-11-05/server.mjs"
```

Para respaldar los datos del portal, detén el servidor y copia la carpeta `data/` completa. El código y los archivos de datos deben respaldarse por separado. En `data/` conviven carpetas distintas para las galerías privadas y el material del portafolio; no hay un montaje estático público de esa carpeta. No publiques esa carpeta ni contraseñas en GitHub.

## Verificación

```powershell
npm run check
npm test
npm audit --omit=dev
```

Las pruebas cubren la configuración inicial, claves temporales, separación entre clientes, bloqueo de originales, marcas de agua, selección, consentimiento de extras, bloqueo de cambios confirmados, publicación de entregas, ZIP, revocación y persistencia tras reiniciar. La interfaz se verificó en 320, 390, 768 y 1440 px, incluida la creación de cuentas, el cambio de clave, la selección, la aceptación de extras y la entrega. También se verificaron las rutas independientes de la web y el acceso privado, los borradores, la publicación del portafolio, la separación de archivos y la reproducción de MP4.

Referencias utilizadas: [seguridad de Express](https://expressjs.com/en/advanced/best-practice-security/), [Multer](https://github.com/expressjs/multer), [Sharp](https://sharp.pixelplumbing.com/api-output/), [SQLite de Node](https://nodejs.org/api/sqlite.html) y [ZIP con yazl](https://github.com/thejoshwolfe/yazl).
