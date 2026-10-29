"""Utilidades compartidas por los scripts de actualización de Energía en Ruta."""
import json
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "site" / "data"
REF = RAIZ / "ref"
MADRID = ZoneInfo("Europe/Madrid")
USER_AGENT = "energia-en-ruta/1.0 (Hamilton Global Intelligence; actualizacion diaria)"


def hoy_madrid() -> str:
    return datetime.now(MADRID).strftime("%Y-%m-%d")


def ahora_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def descargar(url: str, intentos: int = 4, espera: int = 60, timeout: int = 180, accept: str = "*/*") -> bytes:
    """Descarga con reintentos, alternando requests y curl (huellas TLS distintas).

    Algunos servidores públicos (MITECO, DGT) cortan a ratos las conexiones
    desde los runners de GitHub; cambiar de cliente suele bastar.
    """
    cabeceras = {"User-Agent": USER_AGENT, "Accept": accept}

    def con_requests():
        r = requests.get(url, headers=cabeceras, timeout=timeout)
        r.raise_for_status()
        return r.content

    def con_curl():
        orden = ["curl", "-sS", "--fail", "-L", "--max-time", str(timeout)]
        for k, v in cabeceras.items():
            orden += ["-H", f"{k}: {v}"]
        return subprocess.run(orden + [url], capture_output=True, check=True).stdout

    metodos = [con_requests] + ([con_curl] if shutil.which("curl") else [])
    ultimo = None
    for i in range(intentos):
        metodo = metodos[i % len(metodos)]
        try:
            return metodo()
        except Exception as e:  # noqa: BLE001
            ultimo = e
            print(f"  intento {i + 1}/{intentos} con {metodo.__name__} fallido: {type(e).__name__}: {str(e)[:160]}")
            if i < intentos - 1:
                time.sleep(espera)
    raise RuntimeError(f"No se pudo descargar {url}") from ultimo


def provincias() -> pd.DataFrame:
    """cod_prov (2 dígitos), provincia, ccaa, poblacion: nombres que usa el mapa."""
    return pd.read_csv(REF / "provincias.csv", dtype={"cod_prov": str})


def escribir_csv(df: pd.DataFrame, nombre: str) -> None:
    ruta = DATOS / nombre
    tmp = ruta.with_suffix(".tmp")
    df.to_csv(tmp, index=False, lineterminator="\n")
    tmp.replace(ruta)
    print(f"  escrito {nombre}: {len(df):,} filas")


def escribir_json(obj, nombre: str) -> None:
    ruta = DATOS / nombre
    tmp = ruta.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(ruta)


def marcar_actualizado(clave: str, **extra) -> None:
    """Guarda en data/meta.json cuándo se actualizó cada fuente (lo lee la web)."""
    ruta = DATOS / "meta.json"
    meta = json.loads(ruta.read_text(encoding="utf-8")) if ruta.exists() else {}
    meta[clave] = {"actualizado": ahora_iso(), **extra}
    escribir_json(meta, "meta.json")


class Municipios:
    """Asigna municipio (código INE y nombre) a coordenadas, con los límites de es-atlas (IGN)."""

    def __init__(self):
        from shapely.geometry import shape
        from shapely.strtree import STRtree

        fc = json.loads((REF / "municipios.geojson").read_text(encoding="utf-8"))
        self.geoms = [shape(f["geometry"]) for f in fc["features"]]
        self.ids = [str(f["id"]).zfill(5) for f in fc["features"]]
        self.nombres = [f["properties"]["name"] for f in fc["features"]]
        self.arbol = STRtree(self.geoms)

    def asignar(self, lats, lons):
        """Devuelve listas (cod_ine, municipio). Puntos en costa o puerto: municipio más cercano."""
        from shapely.geometry import Point

        puntos = [Point(float(x), float(y)) for x, y in zip(lons, lats)]
        dentro = {}
        for p, g in zip(*self.arbol.query(puntos, predicate="within")):
            dentro.setdefault(int(p), int(g))
        cods, noms = [], []
        for i, pt in enumerate(puntos):
            g = dentro.get(i)
            if g is None:
                g = int(self.arbol.nearest(pt))
            cods.append(self.ids[g])
            noms.append(self.nombres[g])
        return cods, noms
