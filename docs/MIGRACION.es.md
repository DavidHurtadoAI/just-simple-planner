# De las notas clásicas a Bases

[English guide](MIGRATION.md) · [README](../README.md)

## Vista clásica retirada en 0.6.0

Just Simple Planner funciona ahora mediante el layout **Simple Planner dentro de Bases de Obsidian**. Se mantiene el mismo identificador de plugin y las mismas notas Markdown. Las Bases existentes siguen funcionando.

Se han retirado el tablero clásico y su controlador e índice globales. Las pestañas antiguas muestran una página **Planner migration** y conservan su estado para importarlo. El icono y **Open planner** abren una Base o un selector si hay varias. Los identificadores antiguos de comandos se conservan; crear notas y cambiar su pertenencia se realiza en la Base elegida.

## Migrar

1. Actualiza el mismo plugin. Conserva las notas, las Bases existentes y el archivo `data.json`.
2. Activa **Bases** en Core plugins y recarga Just Simple Planner si es necesario. Just Simple Calendar es independiente.
3. Ejecuta **Just Simple Planner: Create Bases planner from classic notes**, o pulsa **Review migration** en los ajustes o en la página de una pestaña antigua.
4. Revisa cantidades de entradas, hilos, conexiones y notas inválidas; también el mapeo guardado, el ancho de día y los destinos de creación antiguos.
5. Elige una ruta nueva para el archivo `.base` dentro de la bóveda y pulsa **Create Base**. Nunca se sobrescribe un archivo existente.
6. Espera a **Migration verified** antes de personalizar los filtros. Se comparan títulos, fechas, pertenencia a hilos, destinos de conexiones, metadatos de hilos, filas vacías y notas inválidas.
7. Comprueba edición, conexiones, Tasks, Notebook y Undo/Redo en la nueva Base.

El migrador lee las notas marcadas cuando se solicita. Solo crea la Base y las carpetas padre que falten. No mueve, renombra, duplica ni reescribe las notas, ni sustituye los ajustes guardados. Si cambian las notas o los ajustes mientras está abierta la revisión, debes pulsar **Refresh review** antes de crear.

## Qué se conserva

- Las rutas antiguas de carpeta padre y subcarpetas se combinan al cargar sin mover archivos. Quedan como información de migración; no son filtros ni destinos de las nuevas notas.
- Se importan el mapeo guardado de fecha, título, hilo y conexiones y el ancho de día.
- Los hilos vacíos se mantienen como filas explícitas.
- Puede importarse el estado de una pestaña clásica restaurada. No se transfiere su historial de Undo/Redo.
- Los campos desconocidos de los ajustes guardados se conservan al editar. Los ajustes globales de migración solo afectan a futuras importaciones, nunca a una Base existente.

La consulta inicial selecciona `planner_type: entry` O `planner_type: thread` en toda la bóveda. Tras la verificación puedes filtrar cada Base por separado. El aviso registra la comparación inicial; no es una copia de seguridad ni una comparación continua.

## Trabajar en Bases

Cada Base tiene sus filtros, límite de resultados, propiedades, ancho de día e historial. La creación nativa de Bases decide dónde guardar notas nuevas. Un filtro restrictivo puede excluir una nota recién creada; el plugin no amplía la consulta automáticamente.

**Thread notes** permite mantener filas vacías, incluso con notas de hilo fuera de la consulta. Quitar una referencia no borra la nota. Una misma nota en varias Bases sigue siendo un solo archivo: editar su fecha o los metadatos de su hilo cambia el mismo dato compartido.

Las propiedades opcionales se eligen expresamente en **Configure view**: End date, Repeat, Repeat until, Repeat except y Additional dates. La fecha final es inclusiva. Las apariciones repetidas comparten nota; los movimientos ambiguos de una programación se rechazan.

**Remove note from planner…** quita únicamente `planner_type: entry`, conserva el archivo y el resto de los datos y admite Undo/Redo. Afecta a todas las Bases que filtran por esa marca. Una consulta más amplia puede seguir mostrando la nota.

## Resolver dudas

- **Sigue en Checking migration:** espera a la carga y revisa filtros, límite de resultados, propiedad Date y notas inválidas. Resuelve las diferencias antes de dar la migración por verificada.
- **No aparece Simple Planner en Layout:** activa Bases y recarga el plugin. El tablero clásico ya no está disponible como alternativa.
- **Hay varios planners:** elige la Base de destino. Los comandos globales no escriben silenciosamente con el mapeo de otro planner.
- **Cambian las rutas de los ajustes antiguos:** se han combinado padre y subcarpetas; los archivos originales no se han movido. Configura cada planner dentro de su Base.
- **Necesitas el tablero antiguo:** puedes usar una versión anterior con las notas y ajustes conservados. 0.6.0 mantiene la migración, no su interfaz.

Consulta [TESTING.md](../TESTING.md) para las pruebas y sus límites.
