# RehactivaPro

App web de gestión clínica para fisioterapia (Quito, Ecuador). Dominio: rehactivaec.com.

## Stack
- Frontend: Vite + JavaScript vanilla modular (ES6 modules, ~18 módulos en /js).
- Backend: Supabase (PostgreSQL + Auth + Realtime + RLS activado).
- Deploy: Vercel auto-deploy desde GitHub.
- Local: `npm run dev` en localhost:5173 (NO 3000).

## Entorno
- Vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (.env.local + Vercel).
- La anon key es pública por diseño; la seguridad real es la RLS.

## Datos
- 8 tablas: profiles, patients, appointments, therapists, doctors, protocols, cobros, session_log.
- RLS estricta por rol (admin/secretaria/terapeuta); solo usuarios autenticados.
- audit_log: bitácora append-only e INMUTABLE en 7 tablas (LOPDP). No tocar.

## Arquitectura
- Estado global en state.js; helpers compartidos en utils.js (getInitials, getDisplayAge, esc).
- Permisos por rol en permissions.js; toasts en toast.js; realtime en realtime.js.

## Gotchas
- birth_date: type date, nullable. pm-age queda hidden por retrocompatibilidad.
- done es PER-EPISODIO: se resetea a 0 al iniciar nuevo episodio.
- Fin de episodio = fila en session_log con type='Fin de episodio'.

## Decisiones cerradas
- La tabla `protocols` es el banco de diagnósticos; en la UI se llama Diagnósticos y no se renombra
  en la base. `patients.diag` se mantiene sincronizado con `protocols.name` (el diagnóstico se
  elige del catálogo, nunca se escribe).

## Roadmap
- 2FA admins · reemplazo de Reliv (gap = historia clínica/informe; NO requiere SRI, facturan
  con 593 aparte) · rediseño Pacientes · notificaciones a médicos · recálculo de `done` pendiente.