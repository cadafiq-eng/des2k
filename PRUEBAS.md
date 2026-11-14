# Pruebas realizadas

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
