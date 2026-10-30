# DOE 2ᵏ · versión 1.2.0 — 30 octubre 2026

Se conserva la aplicación original: diseños completos y fraccionados, importación CSV/Excel, bloques, centros, alias, gráficas, diagnósticos y predicción.

## Cambios
- Panel de pooling en Análisis: selección explícita de efectos, protección de términos significativos y de los subefectos requeridos por interacciones, comprobación de jerarquía fuerte, reajuste del modelo, comparación de SC/gl/CM del error y restauración del modelo previo durante la sesión. Bloques y curvatura permanecen incluidos según las opciones del modelo.
- En modelos saturados no hay valores p para decidir; sólo debe agruparse con justificación científica y revisión de Lenth. La interfaz lo indica. Los resultados posteriores a selección son exploratorios.
- Las SC incorporadas al error se calculan como diferencia de SSE entre modelos anidados. No se suman SC ajustadas individuales, lo cual sería incorrecto para diseños no ortogonales.
- Potencia prospectiva para un efecto estimable: F no central con 1 gl, Δ mínimo de interés y σ esperado introducidos por el usuario, α del análisis, tabla de potencia y búsqueda de 1 a 200 repeticiones completas de la matriz actual. Incluye centros y la estructura de bloques actual. No es un planificador de bloques nuevos ni una prueba conjunta de varios términos.
- Fórmula: λ=(Δ/2)²/(σ²·vjj/r), gl error=rN−rango(X). vjj es la diagonal de (XᵀX)⁻¹ para el coeficiente del término. En fracciones, el término representa su combinación de alias.
- Tema sistema/día/noche, preferencia persistente, controles y distribución ajustados para pantallas pequeñas, foco visible y resultados anunciados mediante role=status.
- Caché PWA actualizada a v1.2.0, precarga del nuevo módulo, limpieza limitada a cachés DOE y respuesta de error para recursos ausentes sin conexión, reservando el HTML de respaldo para navegación.
- Corrección numérica: un estadístico t NaN conserva p=NaN en lugar de devolver p=0.

## Foldover
Se explica por separado en el panel. No se implementa un generador nuevo de foldover: añadir corridas requiere analizar la fracción, los generadores y los alias que se quieren separar. Repetir una fracción no rompe sus alias.

## Publicación en GitHub Pages
1. Descomprima el ZIP. Coloque index.html, css/, js/, icons/, manifest.webmanifest y sw.js en la carpeta publicada del repositorio, conservando sus rutas relativas.
2. En Settings → Pages seleccione la rama y carpeta correspondientes. No hay paso de compilación ni dependencias de servidor.
3. Abra la URL HTTPS del sitio. La PWA necesita HTTPS o localhost; abrir index.html como archivo local no comprueba la instalación ni el funcionamiento offline.
4. Si estaba instalada la versión anterior, recargue para activar el nuevo service worker. Si fuera necesario cierre y vuelva a abrir la aplicación.

Las rutas son relativas y funcionan bajo el subdirectorio de un repositorio de GitHub Pages. No se ha publicado ni modificado el repositorio remoto.

## Referencias estadísticas
- R, distribución F y F no central: https://stat.ethz.ch/R-manual/R-devel/library/stats/html/Fdist.html
- NIST, Experimental Statistics, estimación de error por interacciones supuestas nulas: https://nvlpubs.nist.gov/nistpubs/Legacy/hb/nbshandbook91.pdf
- Minitab, métodos de ANOVA factorial: https://support.minitab.com/en-us/minitab/help-and-how-to/statistical-modeling/doe/how-to/factorial/analyze-factorial-design/methods-and-formulas/analysis-of-variance/
