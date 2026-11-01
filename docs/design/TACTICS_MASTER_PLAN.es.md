# PLAN MAESTRO DE ARQUITECTURA Y DESARROLLO (V2 TÁCTICAS Y SISTEMAS)

Este documento es la guía de diseño e implementación que debe seguir el agente autónomo OpenCode. Define las modificaciones lógicas, de negocio y de interfaz para evolucionar el simulador hacia la arquitectura de Tácticas V2 (estilo Soccer Manager 2026 / EA FC 26) y completar los sistemas pendientes sobre el código ya existente.

---

## 0. ESTADO ACTUAL DEL PROYECTO (NO REHACER)
El agente DEBE respetar el stack y código ya construido. Prohibido duplicar o refactorizar archivos core sin autorización.
- **Arquitectura:** Monorepo con TypeScript puro en `packages/core` (motores de juego y lógica sin backend) y React 18 / Vite / Zustand en `apps/web`.
- **Persistencia:** Guardado en IndexedDB con compresión GZIP (`apps/web/src/store/idb.ts`). El esquema completo reside en el objeto único `GameState` (`state.ts`).
- **Base de Datos:** Datos estáticos de FC26 + Wikidata cargados desde `apps/web/public/data/world-db.json` (211 países, ~133k jugadores).
- **Internacionalización:** Localización en `packages/core/src/i18n` (en/es/pt/ru) con scripts de verificación de claves (`npx tsx scripts/checkUiKeys.ts`).
- **Sistemas ya implementados:** Motor por minutos (`MatchSim` y `quickMatch` en `matchEngine.ts`), procesamiento por ligas (`fullDetail` en `gameLoop.ts`), mercado, cesiones, ojeadores, staff, cantera, finanzas (`clubOps.ts`, `finance.ts`), modo carrera, torneos continentales/mundiales, premios, red social y calendario.
- **Tests existentes:** 19 suites de prueba en `packages/core/test/*`.

---

## 1. MAPA DE ARCHIVOS Y ESTRUCTURA DE DATOS RESTANTE
Todas las nuevas entidades deben mapearse mediante colecciones indexadas por ID en `Record<Id, T>` dentro de `GameState`. Prohibido anidar objetos para evitar dependencias cíclicas y optimizar el tamaño del JSON de guardado.

### 1.1 Tácticas V2 (`packages/core/src/tactics.ts`)
- **Ampliación de Posiciones (`TacticalPosition`):** Pasar de los 10 slots genéricos a un enumerado estricto de 26 posiciones:
  `POR, LIB, LI, DFC-I, DFC, DFC-D, LD, CRI, CRD, MCD-I, MCD, MCD-D, MI, MC-I, MC, MC-D, MD, MCO-I, MCO, MCO-D, EI, ED, SDI, DC, SDD, DC-I, DC-D`.
- **Mapeo de Valoración:** Implementar la función `positionFromSlot(slot) -> Position` y `zoneFromSlot(slot) -> Zone` para que los atributos nativos del jugador sigan calculando su media en esa demarcación (ej: un `MCO-I` se valora bajo la fórmula base de `MCO`).
- **Rejilla con Snap (5 carriles x 7 alturas):** Definir una matriz lógica que represente las zonas del campo visual. Cada posición táctica pertenecerá a una coordenada fija en esta rejilla.
- **Configuración por Jugador (Hueco Táctico):**
  - `role`: Rol asignado (ej: Organizador, Extremo interior, Pivote de contención).
  - `focus`: Nivel de mentalidad (`Ataque`, `Equilibrado`, `Defensa`).
  - `instructions`: Array de instrucciones individuales elegibles (`subir al ataque`, `quedarse atrás`, `marcar al hombre`, `presionar más`, `tirar de lejos`, `regatear más`, `centros tempranos`, `quedarse abierto`).
- **Instrucciones de Equipo:** Añadir al objeto táctico:
  - `estiloSalida`: `equilibrado` | `pase_corto` | `balon_largo` | `contra`.
  - `enfoqueDefensivo`: `bloque_bajo` | `equilibrado` | `bloque_alto` | `presion_agresiva`.
  - `amplitud`: Valor numérico (1-100).
  - `profundidad`: Valor numérico (1-100).
- **Migración de Partidas:** Incrementar a `version: 3` en el sistema de guardado. Escribir una función de migración que convierta los slots antiguos y roles básicos a los nuevos enumerados de la V2 sin corromper el `GameState`.

### 1.2 Historial de Lesiones, Contratos y Cachés
- **Lesiones:** Modificar la interfaz `Player` reemplazando o extendiendo el estado actual con `injuryHistory: InjuryRecord[]`, donde cada registro guarde `type: string`, `durationDays: number`, `season: string`.
- **Contratos:** Extender la estructura de contratos de jugadores incluyendo cláusulas avanzadas: `appearanceBonus: number`, `loyaltyBonus: number`, `releaseClauseDomestic: number`, `releaseClauseForeign: number`.
- **Optimización de Clasificaciones:** Añadir un objeto de caché invalidable en `GameState` para las tablas de las ligas. En lugar de procesar `League.fixtures` de manera síncrona en cada iteración del bucle, la tabla se recalcula y cachea únicamente al finalizar un partido (`Fixture`). Añadir la propiedad `round: number` en `Fixture` para dar soporte nativo a fases eliminatorias de copas.
- **Índices Auxiliares:** Crear arrays de búsqueda rápida en memoria (como `prospectIds: Id[]`) para evitar operaciones `Object.values(state.players)` sobre los 133k jugadores durante el procesamiento diario.

---

## 2. MOTOR DE SIMULACIÓN (INTEGRACIÓN TÁCTICA V2)
El motor de partidos debe asimilar la nueva matriz de 26 posiciones sin alterar los algoritmos base de calibración de goles (rango esperado: 2.1 a 3.4 goles por partido en promedio).

- **MatchSim.step() (`packages/core/src/matchEngine.ts`):**
  - **Cálculo de Líneas:** En lugar de promediar posiciones genéricas, el dominio del mediocampo, ataque y defensa se calculará sumando la presencia de jugadores en los 5 carriles y 7 alturas. Cada zona de la Táctica V2 aportará un peso específico a su línea correspondiente.
  - **Modificadores de Estilo (`StyleMods`):** El `focus` ("Ataque" aumenta la probabilidad de generar una ocasión pero penaliza la transición defensiva) y las `instructions` individuales aplicarán multiplicadores directos sobre los atributos del jugador en cada minuto (ej: "presionar más" incrementa los robos pero acelera el desgaste de la `fatiga`).
  - **Emparejamientos Geográficos:** El motor cruzará los carriles de forma inversa en las transiciones (el extremo en el carril izquierdo atacará directamente la zona del lateral en el carril derecho rival).
- **quickMatch ():** Mantener la distribución de Poisson con $\lambda = 1.22 \cdot e^{(qA - qB)/11}$. Ajustar los valores de calidad de equipo ($qA$ y $qB$) para que incluyan una penalización si el equipo tiene posiciones de la rejilla V2 vacías o jugadores con un `styleFit` drásticamente opuesto a la táctica grupal.

---

## 3. INTELIGENCIA ARTIFICIAL DE MERCADO (`packages/core/src/transfers.ts`)
Dotar a los clubes de la IA de herramientas para responder a la complejidad del nuevo sistema táctico.

- **Detección de Necesidades:** Modificar `aiTransferActivity` para que evalúe las 26 posiciones de la Táctica V2. El club de la IA identificará su `weakestSlot` (el hueco de la rejilla con menor media o sin jugador asignado).
- **Filtros de Fichaje:** Para evitar caídas de rendimiento, la IA aplicará primero un filtro rápido por rango de media global y valor de mercado antes de verificar si el perfil del jugador cumple con el `styleFit` de su formación favorita.
- **Lógicas de Negociación (`evaluateClubBid`):**
  - **Renovaciones Explícitas (Pendiente):** La IA debe ejecutar procesos de renovación automática si a un jugador clave le quedan menos de 12 meses de contrato, ofreciendo salarios escalonados por estatus.
  - **Venta de Descontentos:** Si la brecha de prestigio (`playerExpectations`) o la falta de minutos genera descontento, la IA debe listar al jugador obligatoriamente si está por encima de los límites de plantilla (>30 jugadores).
  - **Día de Pánico:** En el último día de la ventana de transferencias, reducir en un 15% las exigencias económicas de aceptación de ofertas de clubes controlados por la IA para forzar un flujo dinámico de fichajes de última hora.
  - **Adaptabilidad Táctica:** Implementar `aiChooseTactic(clubId)` para que la IA cambie su dibujo táctico predeterminado (elegido entre los presets ampliados) si su plantilla no cuenta con jugadores naturales para mantener su formación actual.

---

## 4. FLUJO DE PANTALLAS PENDIENTES (`apps/web/src/views/`)

### 4.1 Pantalla de Tácticas V2 (`Tactics.tsx` - Prioridad 1)
- **El Campo Dinámico:** Renderizar un lienzo verde estructurado bajo la rejilla lógica de 5x7. Mostrar visualmente las cajas de colisión para las 26 posiciones válidas.
- **Interacción Drag & Drop:** Permitir arrastrar la tarjeta de un jugador desde el listado lateral hacia una zona activa de la rejilla haciendo *snap* automático en las coordenadas del slot táctico.
- **Panel de Configuración de Instrucciones:** Al hacer clic en un jugador posicionado, se desplegará un menú lateral interactivo para seleccionar el Rol, el Enfoque (FC26-style) y conmutar los interruptores de sus instrucciones individuales.
- **Instrucciones de Equipo:** Pestaña secundaria con selectores de tipo *dropdown* para el estilo de salida, enfoque defensivo y deslizadores visuales (sliders) para modular la amplitud y la profundidad del bloque.
- **Presets de Formaciones:** Añadir botones de acceso rápido para aplicar dibujos tácticos complejos de forma automática: `3-4-2-1`, `4-3-1-2`, `4-4-1-1`, `5-2-1-2`, `4-2-2-2`.
- **Feedback Visual:** Mostrar un mapa de calor o indicador numérico flotante que refleje la valoración de fortaleza por cada zona del campo según los jugadores posicionados.

### 4.2 Actualizaciones de Vistas Complementarias
- **Partido en Directo:** Integrar un botón de gestión rápida para abrir una versión compacta de la rejilla táctica V2, permitiendo cambiar enfoques e instrucciones individuales en tiempo real sin salir de la simulación del encuentro.
- **Perfil del Jugador (`PlayerProfile.tsx`):** Añadir una pestaña de "Historial Médico" que pinte la lista de lesiones pasadas. Incluir un minigráfico del campo de fútbol que resalte con colores (verde, amarillo, rojo) el nivel de adaptabilidad y media final del jugador en cada una de las 26 posiciones tácticas de la V2.
- **Fin de Temporada:** Crear la vista de transición de año que simule una gala de premios (Bota de Oro, Balón de Oro de la liga, Once Ideal basado en las posiciones de la rejilla V2) y el reporte financiero/operativo de la directiva.

---

## 5. HOJA DE RUTA Y REGLAS DE EJECUCIÓN PARA OPENCODE

### 5.1 Estado real (actualizado tras la revisión de la sesión de OpenCode + Táctica V3)
Las secciones 1–4 **ya están implementadas**; lo que sigue describe qué existe y dónde, para no rehacerlo.

| Fase | Contenido | Estado |
|---|---|---|
| 1 | 27 posiciones tácticas, rejilla 5×7, `positionFromSlot` / `zoneFromSlot`, pesos por línea | Hecho (`tactics.ts`) |
| 2 | Motor: recorte ±18 %, `geographicMatchupMult`, intención táctica, calibración | Hecho (`matchEngine.ts`, tests `tacticsV2`) |
| 3 | Historial de lesiones, migración de partidas (`CURRENT_SAVE_VERSION = 3`) | Hecho (`save.ts`) |
| 4 | Pizarra, equipo, tácticas guardadas, mapa de adaptabilidad, táctica rápida en directo | Hecho y **reescrito en V3** |
| 5 | Tests unitarios y E2E | Hecho (`tacticsV2`, `tacticsV3`, `e2e/tactics-v3.spec.ts`) |

**Táctica V3 (Soccer Manager 26):**
- 33 roles con `ROLE_DEFS` (efecto en líneas, rematador/asistente, intención, desgaste, equipo y atributos clave) y `roleFit` 0-100 / `roleMultiplier` 0,95–1,04.
- Por jugador: `channels` (carril de ataque: auto / izq / interior izq / centro / interior der / der), `passing` (seguro / mixto / arriesgado), enfoque e instrucciones (12).
- Por equipo: `attackSide`, `marking`, `transition`, `cornerStyle`, `freeKickStyle` además de salida, bloque, amplitud y profundidad.
- Etiquetas por **filas** (`tacticalPositionsOf`): nunca dos «DFC» iguales; 5-4-1 = LI/DFC-I/LIB/DFC-D/LD + CRI/MC-I/MC-D/CRD.
- 8 plantillas (`TACTIC_TEMPLATES` + `applyTemplate`) y ayudante `suggestRoles`; la IA de los clubes lo usa.
- Informe de amenaza/cobertura por carril (`laneProfile`) en la pizarra y análisis previo al partido del rival (con botón «dirigir mi ataque ahí»), y corner chain (córner corto/cerca/lejos).
- Calibración: `CHANCE_BASE = 0.212`, `COUNTER_BASE = 0.0075` (la variedad por carriles sube la varianza; si se tocan pesos, re-medir goles por preset).

**Interfaz:** pizarra vertical con marcadores en sus (x, y) reales, modos «intercambiar» / «mover posiciones», panel por jugador, pestañas Equipo / Balón parado / Plantillas / Guardadas. Los **temas** (Clásico, EA FC, PES 6), estilo de campo, marcadores, densidad y animaciones viven en **Configuración** (`views/Settings.tsx`, `lib/prefs.ts`, `themes.css`) y se aplican a todo el juego vía `<html data-*>`. Tailwind se eliminó: todo es CSS plano.

**Fase 4 (QA + jugabilidad) — hecha:**
- Roles que pesan: `roleMultiplier` −12 %…+7 %, `roleEffectScale(fit)` escala el efecto del rol, los roles *redistribuyen* líneas (suma cero) y los aportes de equipo se amortiguan (×0.4). Test emparejado `roles.test.ts`.
- Cambiar de formación vuelve a elegir once y roles; aviso y botón para sustituir no disponibles (`unavailableInLineup` / `replaceUnavailable`).
- Datos: la media oficial manda al importar (porteros ya no salen infravalorados); Configuración accesible desde el menú.
- Entrenamiento por grupos + sesión semanal (`training.ts`), eventos con decisión, familiaridad con el rol (`roleFamiliarity`) y entrenadores que aprenden.
- Árbol de instalaciones (gimnasio, vídeo, piscina, residencia juvenil, red de ojeadores, césped técnico) con prerrequisitos y efectos reales (`facilities.ts`).
- Misiones semanales y de temporada, XP y puntos de habilidad del mánager (`objectives.ts`).
- Momentos clave interactivos en directo (penaltis y faltas): lanzador y estilo.
- Esquema de guardado v4.

### 5.2 Reglas de ejecución
1. No introducir `Math.random` en `packages/core`; toda aleatoriedad por `Rng`.
2. Cualquier clave `ui.*` nueva debe existir en en/es/pt/ru (`en.v3.ts`… para V3) y pasar `npx tsx scripts/checkUiKeys.ts` y `i18n.test.ts`.
3. Cambios de esquema ⇒ subir `CURRENT_SAVE_VERSION` y extender `migrateState` de forma idempotente.
4. Tras tocar pesos de rol/zona o `CHANCE_BASE`/`COUNTER_BASE`, ejecutar `engines.test.ts` y `liveTactics.test.ts` (media de goles por preset < 3,8; liga 2,0–3,4).
5. La puerta es `npm run typecheck` + `npm test`; para la UI, `npm run e2e -w @pitchside/web`.

### 5.3 Hoja de ruta (próximos pasos sugeridos)
- **Instrucciones de equipo por situación:** táctica distinta ganando / perdiendo / con 10 hombres (disparadores automáticos).
- **Roles con progresión:** familiaridad con el rol que sube con los partidos (`roleFamiliarity` por jugador) y bonificación en `roleMultiplier`.
- **Pizarra de balón parado ampliada:** barreras, rematadores designados en córners, marcaje al hombre en defensa de córners.
- **Informe post-partido táctico:** mapa de calor de ocasiones por carril y duelos ganados por rol.
- **Fin de temporada:** gala de premios + Once Ideal sobre las posiciones V2 (pendiente de la sección 4.2).

