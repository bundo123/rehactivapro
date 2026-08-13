-- RLS de `therapists`: la secretaria pasa a gestionar el equipo (alta + edición); la BAJA queda
-- solo para el admin. Espeja en la base la partición del permiso de front
-- ('createTherapist' vs 'deleteTherapist'): la RLS es la defensa real, el front es solo la UI.
--
-- Correr UNA vez en el SQL editor de Supabase. Sin esto, la secretaria ve el botón "Agregar
-- terapeuta" y al guardar recibe "new row violates row-level security policy".
--
-- Nota: NO toca la policy de SELECT (`true`) — la lectura de terapeutas sigue igual.

BEGIN;

-- 1. Baja las policies de ESCRITURA actuales (la de ALL/manage con is_admin()), sin tocar SELECT.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'therapists' AND cmd <> 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.therapists', p.policyname);
  END LOOP;
END $$;

-- 2. Alta y edición: admin o secretaria.
CREATE POLICY admin_secretaria_insert_therapists ON public.therapists
  FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_secretaria());

CREATE POLICY admin_secretaria_update_therapists ON public.therapists
  FOR UPDATE TO authenticated
  USING (is_admin() OR is_secretaria())
  WITH CHECK (is_admin() OR is_secretaria());

-- 3. Baja: solo admin. Es la única acción irreversible de la pantalla.
CREATE POLICY admin_delete_therapists ON public.therapists
  FOR DELETE TO authenticated
  USING (is_admin());

COMMIT;

-- Verificación:
-- SELECT policyname, cmd, qual, with_check FROM pg_policies
--  WHERE schemaname='public' AND tablename='therapists' ORDER BY cmd, policyname;
