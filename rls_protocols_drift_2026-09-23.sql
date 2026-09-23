-- =====================================================================
-- YA APLICADO en producción el 2026-09-23 por Jefferson — solo registro,
-- no volver a correr sin revisar.
--
-- Deriva de RLS en `protocols`: producción tenía dos policies creadas
-- FUERA del repo (no aparecen en ningún commit):
--   admin_terapeuta_insert_protocols (INSERT, is_admin() OR is_terapeuta())
--     -> por el OR entre policies permisivas, anulaba la condición de
--        contexto de admin_terapeuta_insert (ctx_protocols.sql, CTX-1).
--   admin_terapeuta_update_protocols (UPDATE, is_admin() OR is_terapeuta())
--     -> dejaba al terapeuta editar diagnósticos y AUTO-VALIDAR contexto
--        clínico vía API.
-- Y faltaba admin_update_protocols, aunque rls_protocols_terapeuta.sql
-- dice que se aplicó el 2026-09-18.
--
-- Estado final verificado: 4 policies (DELETE is_admin · INSERT
-- admin_terapeuta_insert con condición ctx · SELECT true · UPDATE is_admin).
-- =====================================================================
BEGIN;
DROP POLICY IF EXISTS admin_terapeuta_insert_protocols ON public.protocols;
DROP POLICY IF EXISTS admin_terapeuta_update_protocols ON public.protocols;
DROP POLICY IF EXISTS admin_update_protocols ON public.protocols;
CREATE POLICY admin_update_protocols ON public.protocols
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
COMMIT;

-- Verificación (deben quedar exactamente 4 policies):
-- SELECT policyname, cmd, qual, with_check FROM pg_policies
--  WHERE schemaname='public' AND tablename='protocols' ORDER BY cmd, policyname;
