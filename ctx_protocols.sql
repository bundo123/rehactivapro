-- =====================================================================
-- CTX-1 — El contexto clínico se CURA: solo el admin lo escribe, queda
-- VALIDADO (quién y cuándo) y todo cambio en `protocols` va al audit_log.
--
-- Correr UNA vez en el SQL editor de Supabase ANTES de mergear el código
-- de CTX-1. Re-ejecutable (IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS).
-- =====================================================================
BEGIN;

-- 1. Validación del contexto clínico (nullable: nada existente se rompe).
ALTER TABLE public.protocols
  ADD COLUMN IF NOT EXISTS ctx_validado_por text,
  ADD COLUMN IF NOT EXISTS ctx_validado_at  timestamptz;

-- 2. La validación se cae sola si:
--    a) en un UPDATE cambia el texto y NO se re-valida en ese mismo UPDATE, o
--    b) el texto queda vacío.
--    Así ningún texto editado llega a la IA con un "validado" viejo.
CREATE OR REPLACE FUNCTION public.protocols_ctx_invalida()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.clinical_context IS DISTINCT FROM OLD.clinical_context
     AND NEW.ctx_validado_at IS NOT DISTINCT FROM OLD.ctx_validado_at THEN
    NEW.ctx_validado_at  := NULL;
    NEW.ctx_validado_por := NULL;
  END IF;
  IF coalesce(btrim(NEW.clinical_context), '') = '' THEN
    NEW.ctx_validado_at  := NULL;
    NEW.ctx_validado_por := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.protocols_ctx_invalida() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protocols_ctx_invalida ON public.protocols;
CREATE TRIGGER trg_protocols_ctx_invalida
  BEFORE INSERT OR UPDATE ON public.protocols
  FOR EACH ROW EXECUTE FUNCTION public.protocols_ctx_invalida();

-- 3. El terapeuta sigue pudiendo dar de ALTA un diagnóstico a mitad de la
--    evaluación, pero SIN contexto clínico ni validación: eso lo cura el admin.
DROP POLICY IF EXISTS admin_terapeuta_insert ON public.protocols;
CREATE POLICY admin_terapeuta_insert ON public.protocols
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR (is_terapeuta()
        AND coalesce(btrim(clinical_context), '') = ''
        AND ctx_validado_at  IS NULL
        AND ctx_validado_por IS NULL)
  );

-- 4. `protocols` entra al audit_log (antes quedaba FUERA): desde hoy queda
--    registrado quién crea un diagnóstico y quién cambia su contexto clínico.
DROP TRIGGER IF EXISTS trg_audit ON public.protocols;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.protocols
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

COMMIT;

-- Verificación (4 policies; INSERT con la condición nueva; 2 triggers propios):
-- SELECT policyname, cmd, with_check FROM pg_policies
--  WHERE schemaname='public' AND tablename='protocols' ORDER BY cmd, policyname;
-- SELECT tgname FROM pg_trigger
--  WHERE tgrelid='public.protocols'::regclass AND NOT tgisinternal ORDER BY tgname;
