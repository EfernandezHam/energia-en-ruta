"""Ejecuta todas las actualizaciones. Si una fuente falla, las demás siguen
y se conservan sus datos anteriores; el proceso acaba con error solo si
fallan las dos fuentes principales (carburantes y recarga), para que GitHub
avise por correo."""
import sys
import traceback

import carburantes
import noticias
import recarga

PASOS = [("Carburantes", carburantes.main, True), ("Recarga", recarga.main, True), ("Noticias", noticias.main, False)]


def main() -> int:
    fallos_principales = 0
    for nombre, paso, principal in PASOS:
        print(f"\n=== {nombre} ===")
        try:
            paso()
        except Exception:  # noqa: BLE001
            traceback.print_exc()
            print(f"!! {nombre}: no se actualizó; se conservan los datos anteriores")
            fallos_principales += principal
    return 1 if fallos_principales == 2 else 0


if __name__ == "__main__":
    sys.exit(main())
