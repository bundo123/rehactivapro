-- =====================================================================
-- PULIR-1 — Nota de la sesión pulida con IA: se conserva lo que escribió
-- el terapeuta. session_log.note queda con la versión aceptada;
-- note_original guarda el PRIMER texto propio y note_ia_at cuándo se
-- aceptó la versión de la IA. Sin pulir = las dos NULL.
--
-- Correr UNA vez en el SQL editor de Supabase ANTES de mergear el código de
-- PULIR-1 (sin las columnas, guardar una nota pulida falla; las demás
-- sesiones no las mandan y siguen guardando). Re-ejecutable.
-- `session_log` ya está en el audit_log: cada cambio queda registrado sin
-- tocar el audit_log.
-- =====================================================================
BEGIN;

-- 1. Columnas nullable: ninguna fila existente cambia.
ALTER TABLE public.session_log ADD COLUMN IF NOT EXISTS note_original text;
ALTER TABLE public.session_log ADD COLUMN IF NOT EXISTS note_ia_at timestamptz;

-- 2. Van juntas: las dos NULL o las dos con dato, y el original nunca vacío.
ALTER TABLE public.session_log DROP CONSTRAINT IF EXISTS session_log_note_ia_chk;
ALTER TABLE public.session_log ADD CONSTRAINT session_log_note_ia_chk
  CHECK ((note_original IS NULL AND note_ia_at IS NULL)
      OR (note_original IS NOT NULL AND note_original <> '' AND note_ia_at IS NOT NULL));

-- 3. Tope de largo del original (está en producción desde PULIR-1; agregado al repo en MINI-1).
--    El servidor solo pule notas de hasta 1.500 caracteres; 4.000 es margen.
ALTER TABLE public.session_log DROP CONSTRAINT IF EXISTS session_log_note_original_chk;
ALTER TABLE public.session_log ADD CONSTRAINT session_log_note_original_chk
  CHECK (note_original IS NULL OR length(note_original) <= 4000);

COMMENT ON COLUMN public.session_log.note_original IS
  'PULIR-1: texto del terapeuta antes de aceptar la versión de la IA (el primero). NULL = nota no pulida';
COMMENT ON COLUMN public.session_log.note_ia_at IS
  'PULIR-1: cuándo se aceptó la versión de la IA. NULL = nota no pulida';

COMMIT;

-- Verificación:
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='session_log'
--    AND column_name IN ('note_original','note_ia_at');
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid='public.session_log'::regclass
--    AND conname IN ('session_log_note_ia_chk','session_log_note_original_chk');
