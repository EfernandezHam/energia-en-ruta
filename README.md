# Energía en Ruta

Observatorio de Hamilton Global Intelligence sobre el precio de los carburantes por gasolinera y los puntos de recarga eléctrica en España. Es una web estática que se publica en GitHub Pages y se actualiza sola cada día con GitHub Actions. No necesita servidor ni base de datos.

## Cómo funciona

```
GitHub Actions (cada día, 05:20 UTC, y repetición de respaldo a las 11:20 UTC)
   │
   ├─ scripts/carburantes.py  → API del MITECO (Geoportal de Gasolineras)
   │                             respaldo: espejo diario IvanAraque/precios-carburantes
   ├─ scripts/recarga.py      → registro oficial de puntos de recarga (DGT, DATEX II)
   └─ scripts/noticias.py     → Google News RSS
   │
   ▼
site/data/*.csv y *.json  →  commit al repositorio  →  publicación en GitHub Pages
```

Si una fuente falla un día, se conservan sus datos del día anterior y el resto se actualiza igual. El proceso solo se marca como fallido (y GitHub te avisa por correo) si fallan a la vez carburantes y recarga. Si algún día no se llega a ejecutar, la serie de carburantes rellena ese hueco en la siguiente ejecución con datos del espejo.

## Puesta en marcha (una sola vez, unos 10 minutos)

1. Crea un repositorio nuevo en GitHub, por ejemplo `energia-en-ruta`. Puede ser público o privado; GitHub Pages en repositorios privados requiere un plan de pago (Team o Enterprise).
2. Sube todo el contenido de esta carpeta a la rama `main`. Lo más sencillo: en la página del repositorio vacío, "uploading an existing file", arrastra todas las carpetas y ficheros, y confirma. Comprueba que aparece la carpeta `.github/workflows` (en macOS las carpetas que empiezan por punto están ocultas: pulsa Cmd+Shift+. en el Finder para verlas).
3. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
4. Settings → Actions → General → Workflow permissions: **Read and write permissions** → Save.
5. Pestaña Actions → "Actualizar datos y publicar" → **Run workflow**. En 3 o 4 minutos tendrás la web en `https://<tu-usuario>.github.io/energia-en-ruta/`.

A partir de ahí se actualiza sola cada mañana. La línea del pie de la web indica cuándo se actualizó cada fuente.

## Estructura

| Ruta | Qué es |
|---|---|
| `site/index.html`, `style.css`, `carb.js`, `ev.js`, `app.js` | La web (las dos vistas: carburantes y recarga) |
| `site/dash.js`, `theme.css` | Motor de datos y estilos base de la versión independiente |
| `site/data/` | Datos que lee la web; los regenera el proceso diario |
| `scripts/` | Descarga y preparación de datos (Python) |
| `ref/municipios.geojson` | Límites municipales (IGN vía es-atlas) para asignar municipio por coordenadas |
| `ref/operadores.csv` | Tabla razón social → marca de los operadores de recarga. **Editable a mano** |
| `ref/recarga_altas.csv` | Primer día en que se vio cada estación (para las "altas del último mes"). Lo genera el proceso |
| `.github/workflows/actualizar.yml` | Programación diaria y publicación |

## Ajustes habituales

- **Cambiar la hora:** edita las líneas `cron` del workflow (hora UTC).
- **Agrupar un operador nuevo bajo su marca:** añade una fila a `ref/operadores.csv`. Si no está en la tabla, el script busca una marca conocida en el nombre y, si no la encuentra, usa la razón social sin "S.L.", "S.A.", etc.
- **Cambiar las búsquedas de noticias:** `BUSQUEDAS` en `scripts/noticias.py`.
- **Probar en local:** `pip install -r requirements.txt`, luego `cd scripts && python actualizar.py`, y para ver la web `cd site && python -m http.server` y abre http://localhost:8000.

## Notas de método

- Precio medio diario: media simple de las gasolineras con precio, descartando precios fuera de 0,80–3,20 €/l. Es el mismo método que la serie de Reposta Hoy con la que arranca el histórico (hasta el 22/10/2026), así que la serie es continua.
- Tipo de recarga según la potencia máxima de la estación: lenta hasta 22 kW, rápida de 23 a 149 kW, ultrarrápida desde 150 kW.
- Las cifras "en 30 días" y las altas netas usan la ventana del último mes de la serie diaria del registro.
- El histórico de recarga empieza el 24/09/2026 y no hay datos entre el 24/10/2026 y la primera ejecución automática (el registro oficial no publica histórico).

## Fuentes y licencias

Precios: Geoportal de Gasolineras, Ministerio para la Transición Ecológica y el Reto Demográfico. Puntos de recarga: MITECO, publicado por la DGT en el Punto de Acceso Nacional (CC BY). Serie histórica inicial de carburantes: Reposta Hoy (CC BY 4.0). Población: INE. Límites: IGN vía es-atlas. Noticias: Google News (solo titular y enlace). d3 v7.9.0 (licencia ISC, en `site/vendor`).
