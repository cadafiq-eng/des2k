# DOE 2ᵏ — Diseño y análisis de experimentos factoriales (PWA)

Aplicación web progresiva, sin dependencias externas, para diseñar y analizar experimentos factoriales 2ᵏ (k = 2 a 8). Funciona sin conexión una vez instalada; todos los cálculos se hacen en el dispositivo.

## Funciones

**Diseño**
- Factorial completo 2ᵏ y fraccionado 2ᵏ⁻ᵖ con generadores estándar de máxima resolución o definidos por el usuario (incluye fracciones alternas, p. ej. `D=-ABC`).
- Relación definidora, resolución, patrón de longitud de palabras y estructura de alias completa.
- Bloqueo: sin bloques, réplicas como bloques, o confusión de efectos con 2, 4, 8 o 16 bloques (generadores manuales o búsqueda automática que minimiza la confusión de efectos de bajo orden).
- Réplicas, puntos centrales por bloque, aleatorización con semilla dentro de bloques.
- Hoja de trabajo editable y exportable a CSV.

**Datos**: carga de Excel (.xlsx, .xls, .xlsm), OpenDocument (.ods), CSV/TXT o celdas pegadas; selección de hoja y detección de la fila de encabezados.

**Análisis**
- Detección automática de efectos estimables, alias, efectos confundidos con bloques y relación definidora a partir de los datos.
- Mínimos cuadrados con SC ajustadas: ANOVA con bloques, efectos agrupados por orden, curvatura, falta de ajuste y error puro.
- Coeficientes, efectos, errores estándar, pruebas t, IC y FIV; S, R², R² ajustado, R² de predicción y PRESS.
- Método de Lenth (PSE, ME, SME) para diseños sin réplica.
- Selección de modelo: por orden, por Lenth (con cierre jerárquico) y eliminación hacia atrás respetando jerarquía.
- Ecuación en unidades codificadas y reales.

**Gráficas**: Pareto, normal y semi-normal de efectos, efectos principales (con media de centros), interacciones, cubo y contorno.

**Supuestos**: Shapiro-Wilk, Anderson-Darling, Levene/Brown-Forsythe por factor, Breusch-Pagan, prueba de rachas, Durbin-Watson, residuales estudentizados (Bonferroni), apalancamiento, distancia de Cook y transformación de Box-Cox.

**Predicción**: valor ajustado con IC e IP; búsqueda de la combinación óptima (maximizar, minimizar o valor meta).

## Publicar en GitHub Pages

1. Cree un repositorio y suba todo el contenido de esta carpeta (respetando las subcarpetas `css/`, `js/`, `icons/`).
2. En *Settings → Pages*, elija la rama `main` y la carpeta raíz.
3. Abra la URL publicada; el navegador ofrecerá **Instalar app** (Chrome/Edge) o *Agregar a pantalla de inicio* (Safari/Android).

El service worker requiere HTTPS (o `localhost`). Al abrir `index.html` directamente desde el disco la app funciona, pero no se instala ni trabaja sin conexión. Si modifica archivos, cambie la constante `CACHE` en `sw.js` para forzar la actualización.

## Licencias

La lectura de Excel usa SheetJS Community Edition 0.18.5 (`js/xlsx.full.min.js`), licencia Apache 2.0.

## Validación

Los resultados reproducen los ejemplos de Montgomery, *Design and Analysis of Experiments* (incluidos como conjuntos de ejemplo): 6.1 (2³ replicado), 6.2 (2⁴ sin réplica, Lenth), 6.7 (puntos centrales y curvatura), 7.2 (2⁴ en dos bloques) y 8.1 (2⁴⁻¹). Las distribuciones y la prueba de Shapiro-Wilk coinciden con SciPy.
