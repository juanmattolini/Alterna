# Alterna

Reserva y gestión de puestos de oficina para el esquema híbrido de **3 días presenciales y 2 de home office**. Funciona en el navegador de la computadora y del celular (se puede instalar como app desde el navegador).

**App:** https://juanmattolini.github.io/Alterna/

## Qué hace

- **Reservar:** semana con puestos libres por día y plano por zonas. Un toque reserva o libera. Contador de días presenciales de la semana.
- **Reservar mis días de equipo:** reserva tus 3 días ancla, con el mismo puesto si es posible.
- **Equipos:** cada equipo tiene 3 días ancla. El optimizador los reparte para que el día más cargado use la menor cantidad de puestos.
- **Vista de mes:** en Reservar y en Mis reservas, con los feriados y días no laborables de Argentina 2026-2027 marcados. Los días que todavía no se pueden reservar muestran cuándo se abren.
- **Reserva recurrente:** elegís hasta 3 días fijos y un puesto, y la app los reserva sola cada noche hasta el horizonte. Si liberás un día, no se vuelve a reservar. Si tu puesto está ocupado, te toca otro de la misma zona.
- **Ocupación:** reservas por día frente a la capacidad.
- **Oficina** (administradores): zonas, puestos, puestos fuera de servicio, reglas, roles de las personas y **feriados y cierres** (al cargar un cierre se cancelan las reservas de ese día y nadie puede reservarlo).

## Cómo está armada

| Parte | Dónde |
|---|---|
| Frontend estático | `index.html`, `app.js`, `config.js` — publicado con GitHub Pages |
| Backend | Supabase (proyecto `alterna`): Postgres + Auth + Realtime |
| Esquema y permisos | `supabase/migrations/` |
| Íconos | `icons.js` (sprite de [Lucide](https://lucide.dev), licencia ISC) |
| Librería de Supabase | `vendor/supabase-2.117.2.js` (copia local de `@supabase/supabase-js`) |

No hay paso de build: cualquier cambio en `main` se publica solo.

### Seguridad

La clave de `config.js` es la clave **publicable** de Supabase y puede estar en el código. Los permisos los aplican las políticas RLS de la base:

- Solo usuarios con sesión iniciada leen datos.
- Cada persona reserva solo a su nombre, un puesto por día, de lunes a viernes, dentro del período de reserva.
- Un puesto no se puede reservar dos veces el mismo día.
- Los feriados nacionales y días no laborables de Argentina 2026-2027 vienen cargados como cierres (migración `feriados_argentina`). Si un feriado deja menos días hábiles que el esquema, la meta semanal baja sola.
- Los días cerrados no se pueden reservar (lo valida la base, no solo la pantalla).
- La reserva recurrente corre en la base con `pg_cron` todos los días a las 03:15 UTC (función `materialize_recurring`).
- La primera persona que se registra queda como administradora. Solo los administradores cambian la oficina, los equipos y los roles, y borran reservas ajenas.

## Configuración de Supabase (una vez)

En el panel de Supabase, **Authentication → URL Configuration**:

- **Site URL:** `https://juanmattolini.github.io/Alterna/`
- **Redirect URLs:** agregar `https://juanmattolini.github.io/Alterna/**`

Así los correos de confirmación y de recuperación de contraseña vuelven a la app.

El servidor de correo incluido en Supabase manda pocos correos por hora. Para sumar a todo un equipo conviene configurar un SMTP propio (**Authentication → SMTP Settings**) o desactivar la confirmación por correo (**Authentication → Providers → Email → Confirm email**).

## Desarrollo local

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

Para probar el login en local, agregar `http://localhost:8000/**` a las Redirect URLs.
