# Pruebas realizadas

## Versión 1.4.0 — superficie de respuesta (26 noviembre 2026)
`node tests/rsm.cjs`: 108 comprobaciones correctas.
- Ejemplo 11.2 de Montgomery (CCD, k = 2): coeficientes 79.94, 0.995, 0.515, −1.376, −1.001 y 0.25; SSE = 0.4964; F de falta de ajuste = 1.79 (3 y 4 gl); punto estacionario (0.389, 0.306) = 86.95 min y 176.53 °F, ŷ = 80.21; λ = −0.963 y −1.414 (máximo). Ecuación en unidades reales −1430.69 + 7.809ξ₁ + 13.272ξ₂ − 0.05506ξ₁² − 0.04005ξ₂² + 0.01ξ₁ξ₂, igual a la codificada en un punto arbitrario. La optimización restringida y la cresta pasan por el punto estacionario.
- Ejemplo 11.1 de Montgomery: Δ = 5 min y 2 °F; el paso 10 cae en 85 min y 175 °F. Pendiente descendente con signos invertidos y rechazo de un factor base con b = 0.
- Diseños: α rotable (√2 para k = 2, 2 para k = 4 y para 2⁵⁻¹), α ortogonal (√2 para k = 2 con 8 centros), bloqueo ortogonal k = 3 (α = 1.633, correlación bloque-términos = 0), varianza de predicción igual sobre eje y diagonal en el CCD rotable, ortogonalidad de los términos cuadráticos con α ortogonal, CCI dentro de ±1, CCF α = 1. Box-Behnken k = 3 a 7 con 12, 24, 40, 48 y 56 corridas no centrales; en k = 7 cada par de factores aparece una vez.
- Box-Behnken k = 4 con dos bloques contra `numpy.linalg.lstsq` (cálculo independiente): coeficientes, SSE, PRESS, punto estacionario y valores propios con error < 1×10⁻⁷. Cada vector propio cumple Bv = λv.
- Rechazo de términos no estimables (cuadráticos en un 2ᵏ con centros), detección de modelos no jerárquicos y reducción hacia atrás (en 11.2 sólo elimina A·B).
- `node tests/numerical.cjs`, `desirability.cjs` y `bloques.cjs` siguen correctas (33, 32 y 17). `tests/browser.html`: PASS.

Interfaz en Chrome headless (1280 px y 390 px): flujo 2ᵏ con centros → pestaña 8 A (trayectoria idéntica a Montgomery 11.1) → mejor paso → B (CCD rotable k = 2 centrado en 85 min/175 °F) → BBD k = 4 → CCD k = 3 en dos bloques → C con ambos ejemplos, reducción, optimización y recarga de la sesión. Sin errores en consola. A 390 px el documento no se desborda horizontalmente (las tablas anchas se desplazan dentro de su marco). Los contornos de la pestaña 4 se generan igual que antes con los ejemplos existentes. No se probó en un dispositivo físico ni el ciclo sin conexión del service worker publicado.

## Versión 1.3.0 — deseabilidad (12 noviembre 2026)
`node tests/desirability.cjs`: 32 comprobaciones correctas. Casos límite de maximizar, minimizar y valor objetivo; exponentes distintos de 1; ponderación por importancia; caso de la botana (centro: d(IE) = 0.42, d(densidad) = 0.531, D = 0.472; corrida 3: D = 0.071; corrida con IE fuera de especificación: D = 0); efectos y p de curvatura de ambos modelos (IE p = 0.0102; densidad p = 0.0046), y predicción en el centro igual a la media de los centros. `node tests/numerical.cjs` sigue en 33 comprobaciones correctas.
Interfaz en Chrome headless con el ejemplo de la botana: tablas A y B, aviso de curvatura, cálculo detallado y cambio de región sin errores en consola.

Fecha: 30 octubre 2026. Entorno: Windows, Node 24.14.1 y Chrome headless.

## Numéricas — 33 comprobaciones correctas
Ejecutar `node tests/numerical.cjs` desde la carpeta de la aplicación.
- Cuantiles t y F frente a valores de referencia; potencia bajo Δ=0 igual a α.
- F no central con gl de error 2, 8 y 30 y λ=0, 1, 10, 100 y 1500 frente a integración numérica independiente de la representación t no central. Error absoluto menor de 3×10⁻⁷. La integración utiliza la función log-gamma común, pero una aproximación normal independiente y cuadratura Simpson en lugar de la mezcla beta/Poisson.
- Factorial 2³ con dos réplicas: efecto A=4, SSE=4 y 8 gl; al agrupar ABC, incremento SSE=0.16 y un gl adicional.
- Rechazo de pooling que rompe jerarquía; reajuste con datos desbalanceados; obtención de un gl de error desde un modelo saturado; rechazo de σ=0.
- Todos los archivos JavaScript pasan `node --check`.

## Interfaz
`tests/browser.html` carga los módulos locales y ejecuta automáticamente potencia, bloqueo por jerarquía, selección y aplicación de pooling, comparación del error, restauración y cambio de tema. Resultado en Chrome: PASS.

Prueba adicional sobre la aplicación completa con su primer conjunto de ejemplo: análisis cargado, paneles integrados y potencia calculada; resultado APP PASS. A un ancho de viewport de 500 px no se detectó desbordamiento horizontal del documento (las tablas y pestañas disponen de desplazamiento propio). Se inspeccionó una captura de pantalla. Chrome impuso 500 px al viewport headless solicitado de 390 px: no se afirma validación visual a 390 px ni en dispositivo físico.

## Límites de la verificación
No se ha probado el despliegue remoto de GitHub Pages, instalación en móvil ni ciclo offline del service worker. No se auditó exhaustivamente cada diagnóstico estadístico preexistente. No se contrastó con SciPy/R ejecutados en este entorno; se incluyen referencias cerradas e integración independiente reproducible. El módulo de potencia cubre pruebas de un término, no pruebas conjuntas.
