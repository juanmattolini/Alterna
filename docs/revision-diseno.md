# Revisión de diseño (17-10-2026)

Se aplicaron cuatro revisiones sobre la app: tema, accesibilidad, textos y crítica de diseño.

## Tema (theme-factory)

Paleta **Ocean Depths**: azul marino, verde azulado y verde agua, adaptada para que el texto cumpla contraste AA en los dos modos.

| Token | Claro | Oscuro |
|---|---|---|
| Fondo | `#eef4f5` | `#141c28` |
| Superficie | `#ffffff` | `#1c2736` |
| Texto | `#1a2332` | `#eef6f2` |
| Acento | `#1d6f72` | `#8fd3d6` |
| Tu puesto | `#f2c14e` | `#f2c14e` |

La tipografía se mantuvo (Familjen Grotesk y Atkinson Hyperlegible): la del tema (DejaVu Sans) no está en Google Fonts, y Atkinson Hyperlegible está pensada para buena lectura.

## Accesibilidad (WCAG 2.1 AA)

| Problema | Criterio | Arreglo |
|---|---|---|
| El botón de tema no hacía nada en el primer toque si el dispositivo estaba en modo claro | Usabilidad | Ahora alterna entre claro y oscuro según lo que se ve en pantalla |
| Bordes de puestos, días y campos con contraste 1.5:1 | 1.4.11 | Borde `--edge` con 3:1 o más |
| Botones de íconos de 36 px y días ancla de 30 px | 2.5.5 | 44 px en botones, 38 px en chips de días |
| Botones deshabilitados con opacidad 50 % (texto ilegible) | 1.4.3 | Colores propios con contraste 4.8:1 |
| Ventana de confirmación sin Escape ni foco atrapado | 2.1.2 / 2.4.3 | Escape cierra, Tab queda dentro, el foco vuelve al puesto |
| Pestañas sin navegación con flechas ni relación con su panel | 4.1.2 | `aria-controls`, `tabpanel`, flechas, Inicio y Fin |
| Avisos (toasts) no anunciados por lectores de pantalla | 4.1.3 | `role="status"` y `aria-live` |
| Puestos ocupados sin nombre accesible | 1.1.1 | "N-03, ocupado por Ana" |
| Días sin contexto para lectores de pantalla | 1.3.1 | "lunes 19 oct, 37 puestos libres, día ancla de tu equipo" |
| Avatares con texto blanco de 4.1:1 en algunos colores | 1.4.3 | Colores más oscuros, mínimo 4.7:1 |
| Sin enlace para saltar la navegación | 2.4.1 | "Saltar al contenido" |

Queda pendiente probar con VoiceOver o NVDA reales.

## Textos (ux-copy)

- Botones con la acción concreta: "Reservar N-01" en lugar de "Confirmar reserva", "Volver" en lugar de "Cancelar".
- Errores con qué pasó y qué hacer: "No pudimos guardar la reserva. Revisá tu conexión y probá de nuevo."
- Conflictos explicados: "Alguien reservó N-01 recién. Elegí otro puesto libre."
- Confirmaciones con el efecto: "Liberaste el puesto. Ya lo puede reservar otra persona."
- Mismo verbo en todos los errores ("No pudimos…").

## Crítica de diseño

- **Lo que funciona:** el plano por zonas se entiende de un vistazo, el contador de días presenciales es claro y "Tu puesto" se distingue sin depender solo del color (tilde y texto).
- **Arreglado:** el botón principal "Reservar mis días de equipo" aparecía deshabilitado sin explicación. Ahora un aviso arriba invita a elegir equipo y lleva directo al selector.
- **Arreglado:** la tabla de equipos en el celular obligaba a desplazarse de costado. Ahora cada equipo se ve como una tarjeta.
- **Próximos pasos sugeridos:** ver quién de tu equipo va cada día, recordatorio semanal para reservar, y liberar automáticamente puestos sin uso.
