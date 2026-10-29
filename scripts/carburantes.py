"""Precios de carburantes: foto del día por gasolinera + series diarias (España y provincias).

Fuente principal: API REST del Geoportal de Gasolineras (MITECO).
Respaldo si la API falla: la foto diaria del repositorio público
IvanAraque/precios-carburantes, que copia esa misma API.

Las series se calculan como media simple de las gasolineras con precio
(descartando precios fuera de 0,80-3,20 €/l), el mismo método que la serie
histórica de Reposta Hoy con la que arranca el dashboard.
"""
import io
import json
from datetime import datetime

import pandas as pd

from comun import DATOS, REF, descargar, escribir_csv, hoy_madrid, marcar_actualizado, provincias

URL_MITECO = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/"
URL_ESPEJO = "https://raw.githubusercontent.com/IvanAraque/precios-carburantes/main/data/latest/estaciones.csv"
URL_ESPEJO_SERIES = "https://raw.githubusercontent.com/IvanAraque/precios-carburantes/main/docs/data/"

PRECIO_MIN, PRECIO_MAX = 0.80, 3.20
MIN_ESTACIONES = 8000  # España ronda las 11.500: menos es una descarga a medias
COMBUSTIBLES = ["gasolina_95", "gasolina_98", "diesel", "diesel_premium"]

CAMPOS_MITECO = {
    "Precio Gasolina 95 E5": "gasolina_95",
    "Precio Gasolina 98 E5": "gasolina_98",
    "Precio Gasoleo A": "diesel",
    "Precio Gasoleo Premium": "diesel_premium",
}
CAMPOS_ESPEJO = {
    "gasolina_95_e5": "gasolina_95",
    "gasolina_98_e5": "gasolina_98",
    "gasoleo_a": "diesel",
    "gasoleo_premium": "diesel_premium",
}


def num(serie: pd.Series) -> pd.Series:
    return pd.to_numeric(serie.astype(str).str.replace(",", ".", regex=False).str.strip(), errors="coerce")


def desde_miteco() -> pd.DataFrame:
    print("Descargando precios del MITECO…")
    js = json.loads(descargar(URL_MITECO, accept="application/json"))
    fecha = datetime.strptime(js["Fecha"].split()[0], "%d/%m/%Y").strftime("%Y-%m-%d")
    df = pd.DataFrame(js["ListaEESSPrecio"]).rename(columns={"Longitud (WGS 84)": "Longitud (WGS84)"})
    out = pd.DataFrame({
        "id": df["IDEESS"].astype(str),
        "fecha_precio": fecha,
        "municipio": df["Municipio"].astype(str).str.strip(),
        "cod_prov": df["IDProvincia"].astype(str).str.zfill(2),
        "rotulo": df["Rótulo"].astype(str).str.strip().str.upper(),
        "direccion": df["Dirección"].astype(str).str.strip(),
        "lat": num(df["Latitud"]),
        "lon": num(df["Longitud (WGS84)"]),
    })
    for campo, col in CAMPOS_MITECO.items():
        out[col] = num(df[campo])
    return out


def leer_espejo(nombre: str) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(descargar(URL_ESPEJO_SERIES + nombre, intentos=2, espera=20)), dtype=str)


def mapa_provincias_miteco() -> pd.Series:
    return pd.read_csv(REF / "provincias_miteco.csv", dtype=str).set_index("provincia_miteco").cod_prov


def desde_espejo() -> pd.DataFrame:
    print("Usando el espejo diario en GitHub (IvanAraque/precios-carburantes)…")
    df = pd.read_csv(io.BytesIO(descargar(URL_ESPEJO)), dtype=str)
    try:  # la foto del espejo es la del último día de su serie nacional
        fecha = leer_espejo("nacional.csv").fecha.max()
    except Exception:  # noqa: BLE001
        fecha = hoy_madrid()
    cod = df["provincia"].map(mapa_provincias_miteco()).fillna(df["cp"].str.zfill(5).str[:2])
    out = pd.DataFrame({
        "id": df["id"],
        "fecha_precio": fecha,
        "municipio": df["municipio"].str.strip(),
        "cod_prov": cod,
        "rotulo": df["rotulo"].str.strip().str.upper(),
        "direccion": df["direccion"].str.strip(),
        "lat": num(df["lat"]),
        "lon": num(df["lon"]),
    })
    for campo, col in CAMPOS_ESPEJO.items():
        out[col] = num(df[campo])
    return out


def limpiar(df: pd.DataFrame) -> pd.DataFrame:
    prov = provincias()
    df = df.merge(prov[["cod_prov", "provincia", "ccaa"]], on="cod_prov", how="inner")
    for c in COMBUSTIBLES:
        df.loc[~df[c].between(PRECIO_MIN, PRECIO_MAX), c] = pd.NA
    df = df.dropna(subset=["lat", "lon"])
    df = df[(df.lat != 0) & (df.lon != 0)]
    df = df.dropna(subset=COMBUSTIBLES, how="all")
    df = df.sort_values(["provincia", "municipio", "rotulo"]).reset_index(drop=True)
    df["lat"], df["lon"] = df.lat.round(4), df.lon.round(4)
    return df[["id", "fecha_precio", "municipio", "provincia", "cod_prov", "ccaa", "rotulo", "direccion",
               "lat", "lon", *COMBUSTIBLES]]


def anexar(nombre: str, nuevas: pd.DataFrame, claves: list[str]) -> None:
    """Añade las filas del día a una serie; si el día ya estaba, lo reemplaza."""
    ruta = DATOS / nombre
    previa = pd.read_csv(ruta, dtype={"cod_prov": str}) if ruta.exists() else nuevas.iloc[0:0]
    fechas = set(nuevas.fecha)
    serie = pd.concat([previa[~previa.fecha.isin(fechas)], nuevas], ignore_index=True)
    escribir_csv(serie.sort_values(claves).reset_index(drop=True), nombre)


def series(df: pd.DataFrame) -> None:
    fecha = df.fecha_precio.iloc[0]
    largo = df.melt(id_vars=["provincia", "cod_prov", "ccaa"], value_vars=COMBUSTIBLES,
                    var_name="combustible", value_name="precio").dropna(subset=["precio"])
    esp = largo.groupby("combustible", as_index=False).precio.mean()
    esp = pd.DataFrame({"fecha": fecha, "combustible": esp.combustible, "precio_medio": esp.precio.round(3)})
    anexar("c_historico_espana.csv", esp, ["fecha", "combustible"])
    pv = largo.groupby(["provincia", "cod_prov", "ccaa", "combustible"], as_index=False).precio.mean()
    pv.insert(0, "fecha", fecha)
    pv = pv.rename(columns={"precio": "precio_medio"})
    pv["precio_medio"] = pv.precio_medio.round(3)
    anexar("c_historico_provincias.csv", pv, ["fecha", "provincia", "combustible"])


def rellenar_huecos() -> None:
    """Si algún día no se ejecutó la actualización, completa esos días con las
    medias del espejo (mismo método: media simple por gasolinera)."""
    ruta = DATOS / "c_historico_espana.csv"
    if not ruta.exists():
        return
    esp = pd.read_csv(ruta)
    tenemos, desde = set(esp.fecha), esp.fecha.min()
    try:
        nac = leer_espejo("nacional.csv")
        prov = leer_espejo("provincias.csv")
    except Exception as e:  # noqa: BLE001
        print(f"  sin espejo para rellenar huecos ({e})")
        return
    faltan = sorted(f for f in set(nac.fecha) if f >= desde and f not in tenemos)
    if not faltan:
        return
    print(f"  rellenando {len(faltan)} día(s) sin datos: {', '.join(faltan)}")
    nac = nac[nac.fecha.isin(faltan) & nac.producto.isin(CAMPOS_ESPEJO)]
    anexar("c_historico_espana.csv", pd.DataFrame({
        "fecha": nac.fecha, "combustible": nac.producto.map(CAMPOS_ESPEJO),
        "precio_medio": num(nac.media).round(3)}), ["fecha", "combustible"])
    prov = prov[prov.fecha.isin(faltan) & prov.producto.isin(CAMPOS_ESPEJO)].copy()
    prov["cod_prov"] = prov.provincia.map(mapa_provincias_miteco())
    pv = prov.drop(columns="provincia").merge(provincias()[["cod_prov", "provincia", "ccaa"]], on="cod_prov")
    anexar("c_historico_provincias.csv", pd.DataFrame({
        "fecha": pv.fecha, "provincia": pv.provincia, "cod_prov": pv.cod_prov, "ccaa": pv.ccaa,
        "combustible": pv.producto.map(CAMPOS_ESPEJO), "precio_medio": num(pv.media).round(3)}),
        ["fecha", "provincia", "combustible"])


def main() -> None:
    fuente = "MITECO"
    try:
        crudo = desde_miteco()
        if len(crudo) < MIN_ESTACIONES:
            raise RuntimeError(f"Solo {len(crudo)} gasolineras en la respuesta")
    except Exception as e:  # noqa: BLE001
        print(f"  MITECO no disponible ({e}).")
        crudo, fuente = desde_espejo(), "espejo GitHub"
    df = limpiar(crudo)
    if len(df) < MIN_ESTACIONES:
        raise RuntimeError(f"Solo {len(df)} gasolineras válidas: no se sobrescriben los datos.")
    escribir_csv(df, "c_estaciones.csv")
    series(df)
    rellenar_huecos()
    marcar_actualizado("carburantes", fecha_datos=df.fecha_precio.iloc[0], fuente=fuente, gasolineras=len(df))


if __name__ == "__main__":
    main()
