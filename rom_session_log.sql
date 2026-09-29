-- =====================================================================
-- ROM-1 — Goniometría estructurada en session_log.
-- Cada fila (sesión o 'Evaluación inicial') puede llevar sus mediciones como
-- array jsonb de {j, m, l, v}: articulación, movimiento, lado ('D'|'I'|null)
-- y valor (grados; cm en Schober). Los normales NO se guardan: viven en el
-- catálogo de js/rom.js. Sin mediciones = NULL, nunca [].
--
-- YA APLICADO en producción antes de mergear el código de ROM-1. Se versiona
-- como registro. Re-ejecutable salvo el ADD CONSTRAINT (no admite IF NOT
-- EXISTS): si la constraint ya existe, falla sin tocar nada.
-- =====================================================================
BEGIN;

-- 1. Columna nullable: ninguna fila existente cambia.
ALTER TABLE public.session_log ADD COLUMN IF NOT EXISTS rom jsonb;

-- 2. Forma mínima garantizada por la base: array de 1 a 120 elementos.
--    El contenido de cada elemento lo valida romNormalizar (js/rom.js) al
--    escribir y al leer.
ALTER TABLE public.session_log ADD CONSTRAINT session_log_rom_chk
  CHECK (rom IS NULL OR (jsonb_typeof(rom) = 'array' AND jsonb_array_length(rom) BETWEEN 1 AND 120));

COMMENT ON COLUMN public.session_log.rom IS
  'ROM-1: goniometría [{j,m,l,v}] (j=articulación, m=movimiento, l=D|I|null, v=grados o cm en Schober). Normales AAOS en js/rom.js';

COMMIT;

-- Verificación:
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='session_log' AND column_name='rom';
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid='public.session_log'::regclass AND conname='session_log_rom_chk';

-- =====================================================================
-- ROM-1b (2026-09-29): tope 80 → 120 (el catálogo tiene 107 mediciones posibles).
-- YA APLICADO en producción. Re-ejecutable.
-- =====================================================================
BEGIN;
ALTER TABLE public.session_log DROP CONSTRAINT IF EXISTS session_log_rom_chk;
ALTER TABLE public.session_log ADD CONSTRAINT session_log_rom_chk
  CHECK (rom IS NULL OR (jsonb_typeof(rom) = 'array' AND jsonb_array_length(rom) BETWEEN 1 AND 120));
COMMIT;
