-- =====================================================================
-- B2a — DOC-2: documentos del paciente en Supabase Storage (bucket privado
-- `documentos`) + tabla public.documentos + pedidos_medicos.documento_id.
-- Aditivo e idempotente: el código actual no lo usa. Correr ANTES del lote.
-- Corrido en producción el 2026-10-14 (verificado: bucket, 3+3 policies, trg_audit, documento_id).
-- Si la policy de DELETE falla por `owner_id`, cambiar por `owner = auth.uid()`.
-- =====================================================================
BEGIN;

-- a) Bucket privado. 10 MB por archivo; solo PDF, JPEG y PNG (Pro incluye 100 GB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documentos', 'documentos', false, 10485760, ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- b) Policies sobre storage.objects (RLS ya activa ahí por defecto).
--    Lectura: todo autenticado (misma postura que patients). Subida: admin, secretaria, terapeuta.
--    Borrado del objeto: admin, o quien lo subió (solo para limpiar si falla el INSERT de la fila).
--    Sin UPDATE: no hay upsert ni renombrado desde el cliente.
DROP POLICY IF EXISTS documentos_obj_select ON storage.objects;
CREATE POLICY documentos_obj_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'documentos');
DROP POLICY IF EXISTS documentos_obj_insert ON storage.objects;
CREATE POLICY documentos_obj_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documentos' AND (public.is_admin() OR public.is_secretaria() OR public.is_terapeuta()));
DROP POLICY IF EXISTS documentos_obj_delete ON storage.objects;
CREATE POLICY documentos_obj_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'documentos' AND (public.is_admin() OR owner_id = (SELECT auth.uid())::text));

-- c) Tabla documentos: una fila por archivo; el archivo vive en Storage en storage_path.
CREATE TABLE IF NOT EXISTS public.documentos (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  tipo         text        NOT NULL,
  nombre       text        NOT NULL,
  storage_path text        NOT NULL UNIQUE,
  mime         text        NOT NULL,
  bytes        int         NOT NULL,
  fecha_doc    date,
  nota         text,
  subido_por   uuid        NOT NULL DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted      boolean     NOT NULL DEFAULT false,
  deleted_at   timestamptz,
  deleted_by   uuid
);
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_tipo_chk;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_tipo_chk
  CHECK (tipo IN ('pedido_medico','consentimiento','examen','informe_externo','otro'));
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_nombre_chk;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_nombre_chk
  CHECK (char_length(nombre) BETWEEN 1 AND 120);
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_mime_chk;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_mime_chk
  CHECK (mime IN ('application/pdf','image/jpeg','image/png'));
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_bytes_chk;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_bytes_chk
  CHECK (bytes BETWEEN 1 AND 10485760);
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_nota_chk;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_nota_chk
  CHECK (nota IS NULL OR char_length(nota) <= 300);
-- El objeto va SIEMPRE en la carpeta del paciente: '<patient_id>/<uuid>.<ext>'.
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_path_chk;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_path_chk
  CHECK (storage_path LIKE (patient_id::text || '/%'));
-- Borrado lógico coherente: deleted → deleted_at y deleted_by; no borrado → ninguno.
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_deleted_chk;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_deleted_chk
  CHECK ((deleted AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
      OR (NOT deleted AND deleted_at IS NULL AND deleted_by IS NULL));
CREATE INDEX IF NOT EXISTS documentos_patient_idx ON public.documentos (patient_id, created_at);
COMMENT ON TABLE public.documentos IS
  'DOC-2: documentos del paciente (pedido médico, consentimiento, examen, informe externo, otro). El archivo vive en Storage (bucket privado documentos) en storage_path. Borrado lógico; el objeto no se borra desde la app.';

-- d) RLS
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.documentos FROM anon;
DROP POLICY IF EXISTS documentos_select ON public.documentos;
CREATE POLICY documentos_select ON public.documentos
  FOR SELECT TO authenticated USING (true);
-- Alta: los tres roles; la fila nace a nombre de quien la sube y no borrada.
DROP POLICY IF EXISTS documentos_insert ON public.documentos;
CREATE POLICY documentos_insert ON public.documentos
  FOR INSERT TO authenticated
  WITH CHECK ((is_admin() OR is_secretaria() OR is_terapeuta()) AND subido_por = auth.uid() AND deleted = false);
-- El único UPDATE permitido es el borrado lógico, por el admin o por quien lo subió, firmado por sí
-- mismo. No se puede "resucitar" (WITH CHECK exige deleted = true): lección H-2 de informes.
DROP POLICY IF EXISTS documentos_update ON public.documentos;
CREATE POLICY documentos_update ON public.documentos
  FOR UPDATE TO authenticated
  USING (is_admin() OR subido_por = auth.uid())
  WITH CHECK (deleted = true AND deleted_by = auth.uid());
-- Sin policy de DELETE: nadie borra filas desde el cliente.

-- e) Auditoría (mismo trigger que las otras 12 tablas)
DROP TRIGGER IF EXISTS trg_audit ON public.documentos;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.documentos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- f) La orden médica apunta a su escaneo (B1 lo dejó para acá).
ALTER TABLE public.pedidos_medicos ADD COLUMN IF NOT EXISTS documento_id uuid REFERENCES public.documentos(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.pedidos_medicos.documento_id IS 'DOC-2: documento (tipo pedido_medico) con la orden escaneada; NULL sin adjunto.';

COMMIT;

-- Verificación:
-- SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='documentos';
-- SELECT policyname, cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'documentos_obj_%';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename='documentos' ORDER BY cmd;
-- SELECT tgname FROM pg_trigger WHERE tgrelid='public.documentos'::regclass AND NOT tgisinternal;
-- SELECT column_name FROM information_schema.columns WHERE table_name='pedidos_medicos' AND column_name='documento_id';
