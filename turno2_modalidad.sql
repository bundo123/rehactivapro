-- =====================================================================
-- TURNO-2 — Modalidad del terapeuta: nómina vs porcentaje.
-- 'nomina'     : tiene turno (start_h/end_h). Fuera del turno es extra y,
--                además, todo sábado y domingo es extra a cualquier hora.
-- 'porcentaje' : cobra por porcentaje, NO tiene turno. Nada suyo es extra,
--                su columna no se sombrea y no tiene capacidad (ocupación '—').
-- Es criterio de color y de conteo: nada bloquea ni impide agendar.
-- La lógica vive en js/utils.js (MODALIDADES, turnoDe, esExtra, ...).
--
-- YA APLICADO en producción antes de mergear el código de TURNO-2. Se versiona
-- como registro. Re-ejecutable salvo el ADD CONSTRAINT (no admite IF NOT
-- EXISTS): si la constraint ya existe, falla sin tocar nada.
-- =====================================================================
BEGIN;

-- 1. Columna con default: toda fila existente queda en 'nomina'.
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS modalidad text NOT NULL DEFAULT 'nomina';

-- 2. Espejo de MODALIDADES en js/utils.js.
ALTER TABLE public.therapists ADD CONSTRAINT therapists_modalidad_chk CHECK (modalidad IN ('nomina','porcentaje'));

-- 3. Terapeutas que cobran por porcentaje.
UPDATE public.therapists SET modalidad='porcentaje' WHERE name IN ('Giovanni Berdejo','Sandra Perez','Mariuxi Cuesta','Karina Obando');

COMMIT;

-- Verificación:
-- SELECT name, modalidad FROM public.therapists ORDER BY modalidad, name;
