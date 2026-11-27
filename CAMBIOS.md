# DOE 2ᵏ · versión 1.4.0 — 26 noviembre 2026

Nueva pestaña **8 · Superficie de respuesta** con tres secciones. El módulo se conecta con el análisis 2ᵏ: toma el modelo de la pestaña 3, los datos de la pestaña 2 y lleva el mejor punto de la trayectoria al diseño de segundo orden.

- **A · Pendiente ascendente / descendente.** Usa los coeficientes de primer orden del modelo de la pestaña 3 o capturados a mano. Se elige el factor base (por omisión, el de mayor |b|), su incremento codificado, el redondeo de los incrementos reales y el número de pasos. La tabla de la trayectoria tiene unidades codificadas y reales, ŷ de primer orden (marca *extrap.* fuera de ±1) y una columna para la respuesta observada. La gráfica identifica el mejor paso, y un botón lo usa como centro del diseño de 2.º orden. Avisa cuando la curvatura o alguna interacción es significativa, cuando la respuesta está transformada o cuando no hay puntos centrales. Incluye el ejemplo 11.1 de Montgomery.
- **B · Diseño de 2.º orden.** Diseño central compuesto (k = 2 a 6): circunscrito, inscrito o centrado en las caras; α rotable, ortogonal, de bloqueo ortogonal o personalizado; porción factorial completa o media fracción (k ≥ 5); sin bloques o con 2 bloques (factorial | axial). Box-Behnken para k = 3 a 7 (Box y Behnken, 1960). Muestra los niveles reales de cada factor, la rotabilidad (varianza de predicción escalada sobre un eje y sobre la diagonal), el bloqueo ortogonal y avisos de niveles axiales negativos. La hoja de trabajo es aleatorizada, con TipoPunto (1, −1, 2, 0) y captura de respuestas, y se exporta a CSV.
- **C · Análisis de 2.º orden.** Acepta datos de la hoja de trabajo, de la pestaña 2, de un archivo (Excel, ODS, CSV) o pegados, y propone la codificación automáticamente (cinco niveles → ±1 en el segundo nivel menor y mayor). Ajusta el modelo cuadrático completo o reducido (eliminación hacia atrás con jerarquía) y quita los términos no estimables con un aviso. Incluye coeficientes con FIV, ANOVA con SC ajustadas (lineal, cuadrático, interacción, falta de ajuste y error puro), S, R², R² ajustado, R² de predicción, PRESS y las ecuaciones en unidades codificadas y reales. También: punto estacionario con IC e IP, análisis canónico (valores y vectores propios; máximo, mínimo, silla o cresta), aviso de extrapolación, análisis de cresta, optimización restringida (esfera o cubo), predicción en un punto, contorno con el dominio completo ±α (corridas, punto estacionario y óptimo superpuestos), superficie 3D giratoria, residuales (probabilidad normal, contra ajustados, Shapiro-Wilk) y exportación CSV.
- Ejemplos: CCD rotable k = 2 (Montgomery 11.2) y Box-Behnken k = 3 con **datos simulados** didácticos.
- `Plots.contour` acepta los parámetros opcionales `dom` (dominio distinto de ±1) y `overlay`; sin ellos la gráfica es idéntica a la anterior.
- Archivos nuevos: `js/rsm.js` (motor), `js/rsm-ui.js` (interfaz) y `tests/rsm.cjs`. Se actualizaron la ayuda y las referencias (Montgomery cap. 11; Myers, Montgomery y Anderson-Cook; Box y Wilson, 1951; Box y Behnken, 1960). Caché PWA v1.4.0.

# DOE 2ᵏ · versión 1.3.1 — 13 noviembre 2026

- La columna **TipoPt** de la hoja de trabajo y del CSV ahora se llama **TipoPunto** (1 = punto factorial, 0 = punto central). Se agregó una nota bajo la hoja de trabajo que explica OrdenEst, OrdenCorrida y TipoPunto, y una entrada en la ayuda.
- Al cargar datos se reconocen ambos nombres (TipoPunto y TipoPt), así que las hojas descargadas con versiones anteriores siguen funcionando.
- Caché PWA v1.3.1.

# DOE 2ᵏ · versión 1.3.0 — 12 noviembre 2026

- Nueva pestaña **7 · Deseabilidad** para decidir con dos o más respuestas (Derringer y Suich, 1980). Para cada respuesta se elige el objetivo (maximizar, minimizar o valor objetivo), los límites L, T y U, los exponentes s y t, la importancia y el modelo.
- **A. Condiciones observadas:** d y D con las medias de cada combinación ensayada (incluye la media de los puntos centrales). Es el criterio recomendado cuando la curvatura es significativa.
- **B. Búsqueda con modelos:** ajusta un modelo por respuesta con las opciones de Análisis (bloques, curvatura, α) y evalúa D en los puntos del diseño, vértices y centro, mallas de 3, 5 u 11 niveles. Avisa si la curvatura es significativa, si un modelo está saturado o si no hay puntos centrales.
- Botón **Ver cálculo** con la sustitución numérica de cada d y de D; exportación a CSV.
- Nuevo ejemplo: 2³⁻¹ con 5 puntos centrales y dos respuestas (extrusión de botana: IE y densidad) con especificaciones precargadas. Resultado en el centro: d(IE) = 0.42, d(densidad) = 0.531, D = 0.472.
- Nueva sección de ayuda sobre deseabilidad y referencia a Derringer y Suich (1980).
- Archivos nuevos: `js/desirability.js` (funciones), `js/desir-ui.js` (interfaz) y `tests/desirability.cjs`. Caché PWA v1.3.0.

# DOE 2ᵏ · versión 1.2.2 — 5 noviembre 2026

- Corrección: la validación de generadores de bloque revisaba cada generador por separado, pero no sus interacciones generalizadas. Aceptaba, por ejemplo, ABC y ABCF en un 2⁶, cuyo producto confunde el efecto principal F con los bloques. Ahora `Design.checkBlockGens` revisa todos los productos de subconjuntos de generadores (con sus alias en diseños fraccionados) y también su independencia; el mensaje indica el producto que causa el problema.
- Nuevas pruebas en `tests/bloques.cjs` (node tests/bloques.cjs). Caché PWA v1.2.2.

# DOE 2ᵏ · versión 1.2.1 — 5 noviembre 2026

- Aviso en "Generadores de bloque" con dos formas de definir los bloques: (1) seleccionar y escribir los generadores, advirtiendo que el botón automático elige una de varias combinaciones equivalentes (p. ej., en 2⁴ en 4 bloques propone ACD, BCD, que confunde AB) y (2) diseño definido por el usuario capturado en la pestaña Datos con columna Bloque y factores codificados.
- Corrección: los factores capturados con signos `+`/`-` (también `−` y `–` tipográficos, y `+1`/`−1`) se leen como +1/−1. Antes se trataban como texto y, por orden alfabético, `+` quedaba como nivel bajo, lo que invertía el signo de todos los efectos sin aviso.
- Indicación en Datos sobre los formatos de codificación aceptados. Caché PWA actualizada a v1.2.1.
- Verificado con el caso 2⁴ en 4 bloques (ABC, ABD) capturado con signos: efectos y confusión con bloques (CD, ABC, ABD) idénticos a la captura con −1/1.

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
