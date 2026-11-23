# Simulador CCSA R82 · Entrenamiento Check Point

Aplicación web de práctica para el examen **Check Point Certified Security Administrator (CCSA) R82**.
Se abre desde un enlace, no requiere instalar nada y guarda tu progreso en el navegador.

> **Acceso privado.** El sitio pide usuario y contraseña. Las credenciales las entrega quien
> administra el simulador; no están escritas en este repositorio.

**Sitio publicado:** <https://mrcastillof.github.io/ccsa-r82-simulador/>

---

## 1. Qué incluye

| Función | Detalle |
| --- | --- |
| Banco de preguntas | **132 preguntas** de los **10 módulos** del curso |
| Tipos de pregunta | Selección única (99) y selección múltiple (33), con aviso cuando hay que marcar varias |
| Tamaño de sesión | Eliges cuántas preguntas practicar, hasta el total disponible |
| Sin repetición | Dentro de una sesión cada pregunta aparece una sola vez, en orden aleatorio |
| Dos modos | *Práctica guiada* (corrección y explicación al instante) y *Simulacro real* (resultado al final) |
| Retroalimentación | Explicación escrita de cada respuesta + módulo y página exacta del material |
| Puntaje | Aciertos sobre total, porcentaje y umbral de referencia del 70 % |
| Revisión | Lista de todas las preguntas con tu respuesta, la correcta y la explicación |
| Progreso | Historial de sesiones, promedio, evolución por sesión y cobertura del banco |
| Almacenamiento | `localStorage` + cookies (el historial se conserva entre sesiones y equipos) |
| Imágenes | Figuras extraídas del material, referenciadas por página y ampliables |
| Diseño | Interfaz oscura tipo plataforma de cursos, animaciones suaves, barra de progreso y mapa de sesión |

---

## 2. Cómo se usa

1. Abre el enlace del sitio publicado.
2. Escribe el **usuario** y la **contraseña** que te compartieron.
3. Elige el número de preguntas y el modo de práctica.
4. Responde: en *Práctica guiada* verás de inmediato si acertaste y por qué.
5. Al terminar verás tu puntaje, el desglose por módulo y la revisión completa.
6. Con **Nueva sesión** empiezas de cero con preguntas nuevas.

Atajos: teclas `1`–`5` para elegir opción, `Enter` para comprobar o pasar a la siguiente.

### Sobre el acceso

La contraseña **no se guarda** en el servidor ni en el repositorio. Con ella se deriva una clave
(AES-256-GCM + PBKDF2-SHA256, 310 000 iteraciones) que descifra el banco de preguntas en tu navegador.
Si la contraseña es incorrecta, el contenido no se puede descifrar.

### Sobre el progreso

- Cada sesión nueva empieza desde cero: no arrastra respuestas anteriores.
- Se guardan el historial y las preguntas vistas (localStorage + cookies) para que puedas
  retomar el estudio y ver tu evolución.
- Puedes borrarlo todo desde **Mi progreso → Borrar mi progreso**.

---

## 3. Probar en local

El sitio necesita servirse por HTTP (el navegador bloquea `fetch` y las cookies en `file://`):

```bash
cd checkpoint-ccsa
python -m http.server 8080
# abre http://localhost:8080
```

También vale `npx serve .` o la extensión *Live Server* de VS Code.

---

## 4. Publicar en GitHub Pages (gratis)

Este proyecto ya está publicado: **<https://mrcastillof.github.io/ccsa-r82-simulador/>**.
GitHub Pages sirve el contenido de la rama **`gh-pages`**.

Para recrearlo desde cero:

1. Crea un repositorio (puede ser público) y sube el contenido de esta carpeta:

   ```bash
   git init
   git add .
   git commit -m "Simulador CCSA R82"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   git push origin main:gh-pages    # esta rama activa GitHub Pages
   ```

2. En GitHub: **Settings → Pages** → *Deploy from a branch*, rama **`gh-pages`**, carpeta `/ (root)` → **Save**.
   (Si la rama `gh-pages` ya existe, GitHub suele activarlo automáticamente.)
3. En 1–2 minutos el sitio queda en `https://TU_USUARIO.github.io/TU_REPO/`.

### Actualizar el sitio

```bash
git add -A && git commit -m "Cambios" && git push origin main
git push origin main:gh-pages        # publica la última versión
```

> El repositorio contiene únicamente el contenido **cifrado** (`assets/data/content.enc.json`)
> y la huella del usuario (`assets/data/auth.json`). El banco en claro no se publica.

---

## 5. Cambiar usuario y contraseña

Necesitas el banco de preguntas en claro (`contenido/preguntas.json`) y los scripts de `tools/`.
Desde la carpeta que contiene `contenido/` y `checkpoint-ccsa/`:

```bash
# 1) Une los módulos en un solo archivo (si editaste alguno)
node tools/merge-content.mjs

# 2) Vuelve a cifrar con las credenciales nuevas
node tools/build-content.mjs --user "nuevoUsuario" --pass "NuevaClaveSegura" \
  --in contenido/preguntas.json --out checkpoint-ccsa

# 3) Comprueba que se descifra bien
node tools/verify-decrypt.mjs checkpoint-ccsa "nuevoUsuario" "NuevaClaveSegura"
```

Después haz commit y push de `assets/data/*.json`. La contraseña nunca se escribe en disco:
solo se guarda su huella derivada (sal + hash del usuario) y el contenido cifrado.

Recomendaciones: contraseña larga (16+ caracteres), cambiarla si se filtra y no reutilizarla.

---

## 6. Estructura del proyecto

```
checkpoint-ccsa/
├── index.html                  Interfaz completa (login + inicio + examen + resultados + progreso)
├── assets/
│   ├── css/styles.css          Diseño, animaciones y adaptación a móvil
│   ├── js/auth.js              Login, derivación de clave y descifrado del banco
│   ├── js/app.js               Motor de sesiones, corrección, puntaje y persistencia
│   ├── data/content.enc.json   Banco de preguntas cifrado (AES-256-GCM)
│   ├── data/auth.json          Sal, iteraciones y huella del usuario
│   └── img/                    Figuras extraídas del material + favicon
├── tools/
│   ├── merge-content.mjs       Une los módulos en preguntas.json
│   ├── build-content.mjs       Cifra el banco y genera auth.json
│   └── verify-decrypt.mjs      Comprueba credenciales y descifrado
├── .nojekyll
└── README.md
```

---

## 7. Origen del contenido y trazabilidad

Todo el contenido proviene del material del curso **Check Point Certified Security Administrator
(CCSA) R82** (guía del estudiante *Security Administrator*, 521 páginas).

- Se trabajó sobre **474 capturas de página** del material (OCR con Tesseract y verificación visual).
- Cada pregunta guarda su **módulo** y su **página** de origen, y la interfaz los muestra
  (por ejemplo: *Módulo 4 · página 197*).
- Las explicaciones parafrasean lo que dice el material; no se añadieron conceptos externos.
- Las figuras adjuntas se recortaron de las páginas correspondientes y se referencian con su página.

### Cobertura por módulo

| Módulo | Nombre | Preguntas | Páginas |
| --- | --- | --- | --- |
| 1 | Introduction to Quantum Security | 24 | 19–49 |
| 2 | Administrator Account Management | 14 | 105–121 |
| 3 | Object Management | 12 | 157–166 |
| 4 | Security Policy Management | 21 | 191–220 |
| 5 | Policy Layers | 9 | 247–256 |
| 6 | Security Operations Monitoring | 14 | 287–313 |
| 7 | Identity Awareness | 12 | 361–372 |
| 8 | HTTPS Inspection | 11 | 423–435 |
| 9 | Application Control and URL Filtering | 7 | 465–471 |
| 10 | Threat Prevention Fundamentals | 8 | 497–504 |

Las páginas intermedias del material son laboratorios guiados (pasos de clics en el entorno),
por eso no generan preguntas de examen.

---

## 8. Limitaciones y puntos ambiguos (importante)

1. **No se recibió el archivo `examen_checkpoint.pdf`.** La carpeta entregada contenía las
   capturas de página del material del curso CCSA R82, no un banco de preguntas con respuestas.
   Por eso las preguntas se redactaron a partir de las afirmaciones conceptuales del material,
   **no** se copiaron de una clave de respuestas oficial.
2. **No es un examen oficial.** Es material de estudio. La formulación del examen real y su
   puntaje de aprobación pueden variar.
3. **Páginas de laboratorio.** Los módulos incluyen decenas de páginas de prácticas con
   credenciales y direcciones IP del entorno de laboratorio (por ejemplo `Chkp!234`);
   no se incluyeron como preguntas para no evaluar detalles efímeros del laboratorio.
4. **Transcripción.** El texto se extrajo por OCR de capturas de pantalla. Se revisó visualmente
   lo usado en las preguntas, pero puede haber diferencias menores de formato en las figuras.
5. **Preguntas de selección múltiple.** En el material, la mayoría de los conceptos se presentan
   como listas. Cuando la respuesta natural es un conjunto de elementos, la pregunta se marcó como
   múltiple y la interfaz indica cuántas opciones hay que marcar. La corrección exige la
   coincidencia exacta del conjunto.
6. **Temas fuera del alcance del curso.** Custom Threat Prevention, Smart-1 Cloud, API y funciones
   avanzadas se mencionan en el material pero se remiten a otros cursos; solo se preguntó lo que
   el CCSA R82 desarrolla.

---

## 9. Seguridad: qué protege y qué no

- **Protege:** el banco de preguntas está cifrado; sin credenciales válidas no se puede leer,
  ni siquiera mirando el código fuente o el repositorio.
- **No protege:** al ser un sitio estático, la página de inicio de sesión y el código son públicos,
  y una contraseña débil podría ser atacada por fuerza bruta *offline* sobre el archivo cifrado.
  Usa una contraseña larga y exclusiva.
- Si necesitas autenticación real del lado del servidor (por ejemplo, cuentas por correo o
  Google), publica la misma carpeta en **Cloudflare Pages** y protégela con **Cloudflare Access**
  (plan gratuito para equipos pequeños). La app funciona igual: solo cambia dónde se aloja.

---

## 10. Aviso legal

Material de estudio independiente, elaborado a partir del contenido del curso CCSA R82.
Check Point, Quantum y SmartConsole son marcas de Check Point Software Technologies Ltd.
Este proyecto no está afiliado ni avalado por Check Point.
