-- RLS de `protocols` (el BANCO DE DIAGNÓSTICOS; en la UI se llama "Diagnósticos"): el terapeuta
-- pasa a poder dar de ALTA un diagnóstico; editarlo y borrarlo queda solo para el admin. Espeja en
-- la base la partición del permiso de front ('createProtocol' vs 'editProtocol'): la RLS es la
-- defensa real, el front es solo la UI.
--
-- Por qué: desde DIAG-1 el diagnóstico del paciente se ELIGE de esta tabla, nunca se escribe. Si el
-- terapeuta no pudiera crear, un diagnóstico que falta lo dejaría trabado a mitad de la evaluación
-- inicial. Editar SÍ queda en admin: cada fila lleva el `clinical_context` que se le pasa a la IA
-- para redactar el informe, y ese texto se cura, no se improvisa.
--
-- **Aplicado en producción el 2026-09-18** (Jefferson, SQL editor de Supabase). Este archivo es el
-- registro versionado de lo que ya está corriendo — no hace falta volver a ejecutarlo.
--
-- Nota: NO toca la policy de SELECT (`true`) — la lectura de diagnósticos sigue igual para los
-- tres roles (la secretaria también los ve; solo no los crea ni los edita).

BEGIN;

-- 1. Baja las policies de ESCRITURA actuales (la de ALL/manage con is_admin()), sin tocar SELECT.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'protocols' AND cmd <> 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.protocols', p.policyname);
  END LOOP;
END $$;

-- 2. Alta: admin o terapeuta. Es quien tiene el caso delante cuando descubre que falta.
CREATE POLICY admin_terapeuta_insert ON public.protocols
  FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_terapeuta());

-- 3. Edición: solo admin. Acá vive el contexto clínico que consume el informe IA.
CREATE POLICY admin_update_protocols ON public.protocols
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- 4. Baja: solo admin. Borrar un diagnóstico deja sin catálogo a los pacientes enlazados.
CREATE POLICY admin_delete_protocols ON public.protocols
  FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;

-- Verificación (debe devolver 4 filas: SELECT auth_read_protocols = true, INSERT
-- admin_terapeuta_insert = is_admin() OR is_terapeuta(), UPDATE admin_update_protocols = is_admin(),
-- DELETE admin_delete_protocols = is_admin()):
-- SELECT policyname, cmd, qual, with_check FROM pg_policies
--  WHERE schemaname='public' AND tablename='protocols' ORDER BY cmd, policyname;
