-- =====================================================================
-- RESP-1 — Registro estructurado de la sesión en session_log.soap (jsonb).
-- Empieza con Terapia respiratoria: cómo llega el paciente, signos antes y
-- después (SatO2, FC, FR, Borg), oxígeno, secreciones, medicación,
-- tolerancia y qué sigue en la próxima sesión. Las técnicas siguen en `tags`
-- y el dolor en pain_before/pain_after. La forma del objeto la valida
-- soapNormalizar (js/soap.js) al escribir y al leer; la nota SOAPIE NO se
-- guarda, se arma al vuelo. Sin datos = NULL, nunca {}.
--
-- Correr UNA vez en el SQL editor de Supabase ANTES de mergear el código de
-- RESP-1 (sin la columna, guardar una sesión respiratoria falla; las de
-- fisioterapia no se tocan: no mandan `soap`). Re-ejecutable.
-- `session_log` ya está en el audit_log: cada cambio de `soap` queda
-- registrado sin tocar el audit_log.
-- =====================================================================
BEGIN;

-- 1. Columna nullable: ninguna fila existente cambia.
ALTER TABLE public.session_log ADD COLUMN IF NOT EXISTS soap jsonb;

-- 2. Forma mínima garantizada por la base: objeto no vacío.
ALTER TABLE public.session_log DROP CONSTRAINT IF EXISTS session_log_soap_chk;
ALTER TABLE public.session_log ADD CONSTRAINT session_log_soap_chk
  CHECK (soap IS NULL OR (jsonb_typeof(soap) = 'object' AND soap <> '{}'::jsonb));

COMMENT ON COLUMN public.session_log.soap IS
  'RESP-1: registro estructurado de la sesión {v,llega,tol,inc,prox,casa,resp:{o2,sv,nomed,sec,med}}. Ver js/soap.js. Sin datos = NULL, nunca {}';

COMMIT;

-- Verificación:
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='session_log' AND column_name='soap';
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid='public.session_log'::regclass AND conname='session_log_soap_chk';
