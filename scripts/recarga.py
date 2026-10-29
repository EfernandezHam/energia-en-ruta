"""Puntos de recarga: foto diaria del registro oficial + serie diaria por provincia.

Fuente: registro de puntos de recarga del MITECO publicado por la DGT en el
Punto de Acceso Nacional (DATEX II v3, CC BY, se actualiza cada 24 h).

Por estación: operador (agrupado por marca), potencia máxima, tipo de carga
según esa potencia (lenta hasta 22 kW, rápida de 23 a 149, ultra de 150 en
adelante), conectores y número de puntos. Municipio, provincia y comunidad se
asignan por coordenadas. La fecha de alta es el primer día en que la estación
aparece en el registro (se guarda en ref/recarga_altas.csv).
"""
import re
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from comun import DATOS, REF, Municipios, descargar, escribir_csv, hoy_madrid, marcar_actualizado, provincias

URL_DGT = "https://nap.dgt.es/datex2/v3/miterd/EnergyInfrastructureTablePublication/electrolineras.xml"
MIN_ESTACIONES = 8000      # el registro ronda las 12.000
DIAS_ALTAS = 30            # la web muestra las altas del último mes
INICIO_REGISTRO = "2026-09-24"  # primer día de la serie: lo anterior cuenta como "ya estaba"
ESTADO_ALTAS = REF / "recarga_altas.csv"

ESPANA = dict(lat_min=26.0, lat_max=44.5, lon_min=-19.0, lon_max=5.5)


def texto(patron: str, s: str) -> str:
    m = re.search(patron, s, re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""


def conector(raw: str) -> str:
    t = raw.upper().replace("_", "").replace("-", "")
    if "CHADEMO" in t:
        return "CHAdeMO"
    if "COMBO" in t or "CCS" in t:
        return "CCS"
    if "TESLA" in t:
        return "Tesla"
    if "62196T3" in t or "TYPE3" in t:
        return "T3"
    if "62196T2" in t or "TYPE2" in t:
        return "T2"
    if "62196T1" in t or "TYPE1" in t:
        return "T1"
    if t.startswith("DOMESTIC") or "SCHUKO" in t:
        return "Schuko"
    if "60309" in t or "CEE" in t:
        return "CEE"
    return raw.strip()[:10]


def tipo_carga(kw: int) -> str:
    return "ultra" if kw >= 150 else "rapida" if kw >= 23 else "lenta"


def parsear(xml: str) -> tuple[str, pd.DataFrame]:
    """Trocea el XML por estación (sitio) y extrae sus campos con expresiones regulares."""
    pub = texto(r"<com:publicationTime>([^<]+)<", xml[:5000])
    fecha = pub[:10] if pub else hoy_madrid()
    filas = []
    for trozo in xml.split("<egi:energyInfrastructureSite")[1:]:
        try:
            lat = float(texto(r"<loc:latitude>([-\d.]+)<", trozo))
            lon = float(texto(r"<loc:longitude>([-\d.]+)<", trozo))
        except ValueError:
            continue
        if not (ESPANA["lat_min"] <= lat <= ESPANA["lat_max"] and ESPANA["lon_min"] <= lon <= ESPANA["lon_max"]):
            continue
        operador = texto(r"<fac:operator\b.*?<com:value(?:\s[^>]*)?>([^<]+)<", trozo.split("<egi:energyInfrastructureStation")[0])
        potencias = [float(p.replace(",", ".")) for p in re.findall(r"<egi:maxPowerAtSocket>([\d.,]+)<", trozo)]
        kw = round(max((p / 1000 if p >= 400 else p) for p in potencias)) if potencias else 0
        conns = []
        for c in re.findall(r"<egi:connectorType>([^<]+)<", trozo):
            c = conector(c)
            if c and c not in conns:
                conns.append(c)
        filas.append({
            "site_id": texto(r'^\s+id="([^"]+)"', trozo),
            "nombre": texto(r"<fac:name>.*?<com:value(?:\s[^>]*)?>([^<]*)<", trozo) or "Punto de recarga",
            "razon_social": operador,
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            "kw": kw,
            "conectores": " · ".join(conns),
            "puntos": max(1, len(re.findall(r"<egi:refillPoint\b", trozo))),
        })
    return fecha, pd.DataFrame(filas)


# ---------- operador agrupado por marca ----------
SUFIJO = re.compile(r"[\s,]+(S\.?\s?L\.?\s?U\.?|S\.?\s?A\.?\s?U\.?|S\.?\s?R\.?\s?L\.?|S\.?\s?L\.?|S\.?\s?A\.?|S\.?\s?C\.?\s?L\.?)\s*$", re.I)
GENERICAS = {"ayuntamiento", "ajuntament", "concello", "diputación", "diputacion", "gobierno", "consejo"}


def normal(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


class Operadores:
    """razón social -> marca: primero la tabla ref/operadores.csv (editable a mano),
    después una marca conocida que aparezca en el nombre, y si no, el nombre limpio."""

    def __init__(self):
        t = pd.read_csv(REF / "operadores.csv", dtype=str).dropna()
        self.tabla = dict(zip(t.razon_social.str.strip(), t.operador))
        marcas = t.operador.value_counts()
        self.marcas = []
        for marca in marcas.index:
            clave = normal(re.sub(r"\(.*?\)", "", marca)).split(" ")[0]
            if len(clave) >= 4 and clave not in GENERICAS:
                self.marcas.append((clave, marca))
        self.marcas.append(("cepsa", "Moeve (Cepsa)"))
        self.marcas.append(("moeve", "Moeve (Cepsa)"))

    def __call__(self, razon: str) -> str:
        razon = str(razon or "").strip()
        if not razon:
            return "Sin operador"
        if razon in self.tabla:
            return self.tabla[razon]
        palabras = set(normal(razon).split())
        for clave, marca in self.marcas:
            if clave in palabras:
                return marca
        limpio = SUFIJO.sub("", razon).strip(" ,.")
        return limpio.title() if limpio.isupper() else limpio


# ---------- fecha de alta ----------
def altas(df: pd.DataFrame, fecha: str) -> pd.Series:
    """Primer día en el registro de cada estación; se devuelve solo si es del último mes."""
    if ESTADO_ALTAS.exists():
        estado = pd.read_csv(ESTADO_ALTAS, dtype=str)
    else:
        estado = estado_inicial(df, fecha)
    vistas = dict(zip(estado.site_id, estado.primera_vez))
    nuevas = [s for s in df.site_id if s not in vistas]
    for s in nuevas:
        vistas[s] = fecha
    if nuevas:
        print(f"  {len(nuevas)} estación(es) nueva(s) en el registro")
    pd.DataFrame({"site_id": list(vistas), "primera_vez": list(vistas.values())}) \
        .sort_values("site_id").to_csv(ESTADO_ALTAS, index=False, lineterminator="\n")
    limite = (date.fromisoformat(fecha) - timedelta(days=DIAS_ALTAS)).isoformat()
    primera = df.site_id.map(vistas)
    return primera.where((primera > INICIO_REGISTRO) & (primera > limite), "")


def estado_inicial(df: pd.DataFrame, fecha: str) -> pd.DataFrame:
    """Primera ejecución: hereda las altas de la foto anterior (casando por nombre y coordenadas)."""
    previa_ruta = DATOS / "e_estaciones.csv"
    alta_previa = {}
    if previa_ruta.exists():
        p = pd.read_csv(previa_ruta, dtype=str)
        clave = p.nombre.str.strip() + "|" + p.lat.astype(float).round(4).astype(str) + "|" + p.lon.astype(float).round(4).astype(str)
        alta_previa = dict(zip(clave, p.alta.fillna("")))
    clave = df.nombre.str.strip() + "|" + df.lat.round(4).astype(str) + "|" + df.lon.round(4).astype(str)
    prim = []
    for k in clave:
        if k in alta_previa:
            prim.append(alta_previa[k] or INICIO_REGISTRO)
        else:
            prim.append(fecha if alta_previa else INICIO_REGISTRO)
    return pd.DataFrame({"site_id": df.site_id, "primera_vez": prim})


def main(xml_local: Path | None = None) -> None:
    if xml_local:
        xml = Path(xml_local).read_text(encoding="utf-8")
    else:
        print("Descargando el registro de puntos de recarga (DGT / MITECO)…")
        xml = descargar(URL_DGT, accept="application/xml").decode("utf-8")
    fecha, df = parsear(xml)
    print(f"  {len(df):,} estaciones en el registro del {fecha}")
    if len(df) < MIN_ESTACIONES and not xml_local:
        raise RuntimeError(f"Solo {len(df)} estaciones: no se sobrescriben los datos.")

    df["operador"] = df.razon_social.map(Operadores())
    df["tipo"] = df.kw.map(tipo_carga)
    df["cod_ine"], df["municipio"] = Municipios().asignar(df.lat, df.lon)
    df["cod_prov"] = df.cod_ine.str[:2]
    df = df.merge(provincias()[["cod_prov", "provincia", "ccaa"]], on="cod_prov", how="left")
    df["alta"] = altas(df, fecha).values
    df["fecha"] = fecha
    df.insert(0, "id", df.site_id)
    cols = ["id", "nombre", "operador", "razon_social", "lat", "lon", "kw", "tipo", "conectores", "puntos",
            "municipio", "cod_ine", "cod_prov", "provincia", "ccaa", "alta", "fecha"]
    escribir_csv(df[cols], "e_estaciones.csv")

    dia = df.groupby(["cod_prov", "provincia", "ccaa", "tipo"], as_index=False) \
        .agg(estaciones=("id", "count"), puntos=("puntos", "sum"))
    dia.insert(0, "fecha", fecha)
    ruta = DATOS / "e_historico_provincias.csv"
    previa = pd.read_csv(ruta, dtype={"cod_prov": str}) if ruta.exists() else dia.iloc[0:0]
    serie = pd.concat([previa[previa.fecha != fecha], dia], ignore_index=True)
    escribir_csv(serie.sort_values(["fecha", "cod_prov", "tipo"]).reset_index(drop=True), "e_historico_provincias.csv")
    marcar_actualizado("recarga", fecha_datos=fecha, estaciones=len(df), puntos=int(df.puntos.sum()))


if __name__ == "__main__":
    import sys
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else None)
