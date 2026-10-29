"""Noticias: últimos titulares de prensa española sobre carburantes y sobre recarga.

Fuente: Google News RSS (búsqueda en español, edición España). Solo titular,
medio, fecha y enlace: no hay resúmenes porque el RSS no los trae.
Si la descarga falla se conservan las noticias que ya había.
"""
import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus

from comun import MADRID, descargar, escribir_json, marcar_actualizado

BUSQUEDAS = {
    "c_noticias.json": '(precio gasolina OR precio diésel OR precio carburantes OR gasolineras) when:14d',
    "e_noticias.json": '("puntos de recarga" OR electrolineras OR "coche eléctrico" OR "coches eléctricos") when:14d',
}
MAX_NOTICIAS = 6
MAX_POR_MEDIO = 2
# Titulares repetitivos que no aportan (las piezas diarias "precio de la gasolina hoy 24 de octubre").
EXCLUIR = re.compile(r"\bhoy,? \d{1,2} de [a-z]+|\bhoy (lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b", re.I)


def url_rss(q: str) -> str:
    return f"https://news.google.com/rss/search?q={quote_plus(q)}&hl=es&gl=ES&ceid=ES:es"


def parsear(rss: bytes) -> list[dict]:
    raiz = ET.fromstring(rss)
    filas = []
    for item in raiz.iter("item"):
        titulo = (item.findtext("title") or "").strip()
        enlace = (item.findtext("link") or "").strip()
        medio = (item.findtext("source") or "").strip()
        if medio and titulo.endswith(" - " + medio):
            titulo = titulo[: -len(medio) - 3].strip()
        elif not medio and " - " in titulo:
            titulo, medio = titulo.rsplit(" - ", 1)
        try:
            fecha = parsedate_to_datetime(item.findtext("pubDate")).astimezone(MADRID).strftime("%Y-%m-%d")
        except Exception:  # noqa: BLE001
            continue
        if titulo and enlace.startswith("https://"):
            filas.append({"fecha": fecha, "medio": medio or "Prensa", "titular": titulo, "resumen": "", "url": enlace})
    return filas


def clave(t: str) -> str:
    return re.sub(r"\W+", " ", t.lower()).strip()[:60]


def seleccionar(filas: list[dict]) -> list[dict]:
    filas.sort(key=lambda r: r["fecha"], reverse=True)
    vistas, por_medio, out = set(), {}, []
    for r in filas:
        k = clave(r["titular"])
        if EXCLUIR.search(r["titular"]) or k in vistas or por_medio.get(r["medio"], 0) >= MAX_POR_MEDIO:
            continue
        vistas.add(k)
        por_medio[r["medio"]] = por_medio.get(r["medio"], 0) + 1
        out.append(r)
        if len(out) == MAX_NOTICIAS:
            break
    return out


def main() -> None:
    hechas = 0
    for fichero, q in BUSQUEDAS.items():
        try:
            filas = seleccionar(parsear(descargar(url_rss(q), intentos=3, espera=20, timeout=60)))
            if len(filas) < 3:
                raise RuntimeError(f"solo {len(filas)} noticias")
            escribir_json(filas, fichero)
            print(f"  {fichero}: {len(filas)} noticias")
            hechas += 1
        except Exception as e:  # noqa: BLE001
            print(f"  {fichero}: se mantienen las anteriores ({e})")
    if hechas:
        marcar_actualizado("noticias")
    else:
        raise RuntimeError("No se pudo actualizar ninguna sección de noticias")


if __name__ == "__main__":
    main()
