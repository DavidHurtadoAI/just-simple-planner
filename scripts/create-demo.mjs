import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shiftDay } from '../model.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const vault = path.join(root, '@Nexus-dev');
if (await realpath(vault) !== path.join(await realpath(root), '@Nexus-dev')) throw Error('Only the canonical @Nexus-dev vault is allowed.');
const base = 'Pruebas/Just Simple Planner';
const anchor = '2026-10-30';
const threads = [
  ['Curso de inteligencia artificial', 'cyan', 'active'],
  ['Publicaciones y contenidos', 'purple', 'active'],
  ['Desarrollo del planificador', 'orange', 'active'],
  ['Gestiones personales', 'green', 'parked']
];
const content = [
  ['Definir el objetivo del curso', 'Acordamos que el curso debe ayudar a aplicar la IA en el trabajo cotidiano.\n\n- [x] Delimitar el público y el nivel inicial.'],
  ['Preparar los ejemplos del taller', 'Elegimos casos ficticios para practicar sin utilizar datos reales.\n\n- [x] Diseñar tres ejercicios progresivos.'],
  ['Ensayar la sesión completa', 'Comprobar el ritmo y dejar margen para las preguntas.\n\n- [ ] Cronometrar las demostraciones.'],
  ['Impartir el taller piloto', 'Sesión de prueba con un grupo reducido.\n\n- [ ] Recoger las dudas que se repiten.'],
  ['Revisar lo aprendido en el curso', 'Convertir el feedback del piloto en cambios concretos.\n\n- [ ] Ajustar el material y los ejercicios.'],
  ['Elegir el tema del artículo', 'Explorar cómo cambia la planificación cuando conservamos el contexto.\n\n- [x] Escribir la idea central en una frase.'],
  ['Preparar la estructura del artículo', 'Organizar el texto en problema, ejemplo y aplicación práctica.\n\n- [x] Seleccionar un ejemplo cercano.'],
  ['Redactar el primer borrador', 'Desarrollar la explicación con frases sencillas y ejemplos concretos.\n\n- [ ] Revisar las afirmaciones y sus fuentes.'],
  ['Revisar el texto con calma', 'Eliminar repeticiones y comprobar que cada párrafo aporta algo.\n\n- [ ] Leer el texto completo en voz alta.'],
  ['Preparar la publicación', 'Dejar el contenido y los recursos listos para una revisión final.\n\n- [ ] Comprobar los enlaces del artículo.'],
  ['Definir el modelo del planificador', 'Una nota por entrada. La carpeta de almacenamiento no determina el hilo.\n\n- [x] Elegir propiedades en inglés.'],
  ['Dibujar el tablero temporal', 'Proyectos en filas y fechas en columnas, con colores que ayuden a orientarse.\n\n- [x] Mantener visibles los nombres de los hilos.'],
  ['Probar conexiones entre entradas', 'Las flechas muestran cómo continúa un asunto, incluso si cambia de proyecto.\n\n- [ ] Revisar la conexión con el artículo.'],
  ['Comprobar el movimiento de un flujo', 'Mover varios pasos conservando la separación entre sus fechas.\n\n- [ ] Probar deshacer y rehacer.'],
  ['Recoger observaciones del prototipo', 'Anotar qué resulta cómodo y qué interrumpe el trabajo.\n\n- [ ] Revisar la vista de cuaderno.'],
  ['Ordenar las gestiones de la semana', 'Agrupar los asuntos pendientes para evitar revisarlos de uno en uno.\n\n- [x] Separar lo urgente de lo aplazable.'],
  ['Consultar opciones para una escapada', 'Anotar ideas sin hacer reservas ni asumir ningún gasto.\n\n- [x] Comparar dos destinos posibles.'],
  ['Revisar los recados pendientes', 'Elegir un momento para resolver varios asuntos juntos.\n\n- [ ] Preparar una lista breve.'],
  ['Preparar el fin de semana', 'Reservar tiempo para descansar y dejar margen para improvisar.\n\n- [ ] Comprobar el tiempo disponible.'],
  ['Hacer la revisión semanal', 'Mirar lo que ocurrió, recoger lo pendiente y decidir el siguiente paso.\n\n- [ ] Elegir tres prioridades para la próxima semana.']
];
const offsets = [-4, -2, 0, 2, 4];
const names = content.map(([title], index) => `${shiftDay(anchor, offsets[index % 5])} - ${title}`);
const quote = value => JSON.stringify(value);
const planned = [];
for (let index = 0; index < threads.length; index++) {
  const [title, color, status] = threads[index];
  planned.push([`${base}/Hilos/${title}.md`, `---\nplanner_type: thread\nstatus: ${status}\ncolor: ${color}\norder: ${index}\n---\n# ${title}\n\nHilo ficticio para probar Just Simple Planner. Sus entradas pueden estar en cualquier carpeta.\n`]);
}
for (let index = 0; index < content.length; index++) {
  const thread = threads[Math.floor(index / 5)][0];
  const next = [];
  if (index % 5 !== 4) next.push(index + 1);
  if (index === 12) next.push(8);
  if (index === 2) next.push(7);
  const links = next.length ? `\n${next.map(target => `  - ${quote(`[[${base}/Entradas/${names[target]}]]`)}`).join('\n')}` : ' []';
  const text = `---\nplanner_type: entry\ntitle: ${quote(content[index][0])}\ndate: ${shiftDay(anchor, offsets[index % 5])}\nthread: ${quote(`[[${base}/Hilos/${thread}]]`)}\nnext:${links}\n---\n${content[index][1]}\n`;
  planned.push([`${base}/Entradas/${names[index]}.md`, text]);
}
planned.push([`${base}/Lee primero - Prueba del planificador.md`, `# Prueba de Just Simple Planner\n\nVeinte entradas y cuatro hilos ficticios. Las notas están en castellano; las propiedades y la interfaz del plugin están en inglés.\n\nAbre la paleta de comandos y ejecuta **Just Simple Planner: Open planner**. Usa **Go to date** para ir al **30 de octubre de 2026**.\n\n## Qué probar\n\n1. Crear una entrada con **New entry** o doble clic en una celda vacía.\n2. Editarla con doble clic o Enter; abrir el Markdown desde su menú.\n3. Seleccionarla y pulsar Tab para crear el siguiente paso conectado.\n4. Usar **Connect to…** para relacionar dos entradas existentes.\n5. Arrastrar una tarjeta a otra fecha o a otro hilo.\n6. Seleccionar **Select connected flow** y arrastrar para mover el recorrido completo.\n7. Probar **Undo** y **Redo**, **Spotlight**, los filtros y **Notebook**.\n8. Completar una tarea en **Tasks** y comprobar la casilla en el Markdown.\n9. Mover una nota a otra carpeta y comprobar que permanece en su hilo.\n\nLa carpeta no organiza el tablero. La propiedad \`thread\` enlaza con la nota del hilo y \`next\` guarda los siguientes pasos.\n\nLas tareas se agrupan por la fecha de su entrada; esa fecha no es un vencimiento independiente. No se envían avisos ni se conectan calendarios.\n\nNo modificar otras notas para esta prueba. El generador conserva las fixtures existentes y rechaza sobrescribir una versión distinta.\n`]);

// Preflight all files before writing anything. Re-running never resets a user's test edits.
for (const [relative, text] of planned) {
  try { if (await readFile(path.join(vault, relative), 'utf8') !== text) throw Error(`Existing fixture differs; preserving it: ${relative}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
let created = 0;
for (const [relative, text] of planned) {
  const file = path.join(vault, relative);
  await mkdir(path.dirname(file), { recursive: true });
  try { await writeFile(file, text, { flag: 'wx' }); created++; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}
console.log(`Demo ready: 20 entries, 4 threads, 1 guide; ${created} files created in ${path.join(vault, base)}.`);
