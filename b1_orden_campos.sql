-- =====================================================================
-- B1 — ORD-1 (orden médica) + CAMPOS-1 (sexo, diagnósticos secundarios,
-- registro profesional del firmante).
-- Aditivo e idempotente: columnas nullable y una tabla nueva. El código
-- actual no las usa; se corre ANTES del lote B1. Re-ejecutable.
-- Corrido en producción el 2026-10-14.
-- =====================================================================
BEGIN;

-- a) patients.sexo — F/M o NULL. La IA deja de escribir "el paciente" para mujeres.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS sexo text;
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_sexo_chk;
ALTER TABLE public.patients ADD CONSTRAINT patients_sexo_chk
  CHECK (sexo IS NULL OR sexo IN ('F','M'));
COMMENT ON COLUMN public.patients.sexo IS 'CAMPOS-1: F/M. NULL = no registrado (el informe no imprime la fila).';

-- b) patients.diag_sec — diagnósticos secundarios del catálogo CIE-10: [{c,d}], 1..5, nunca [].
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS diag_sec jsonb;
ALTER TABLE public.patients DROP CONSTRAINT IF EXISTS patients_diag_sec_chk;
ALTER TABLE public.patients ADD CONSTRAINT patients_diag_sec_chk
  CHECK (diag_sec IS NULL OR (jsonb_typeof(diag_sec) = 'array' AND jsonb_array_length(diag_sec) BETWEEN 1 AND 5));
COMMENT ON COLUMN public.patients.diag_sec IS 'CAMPOS-1: diagnósticos secundarios [{c:"M54.5",d:"Lumbago no especificado"}] del catálogo CIE-10. Sin datos = NULL, nunca [].';

-- c) therapists.registro — registro profesional del firmante (se imprime bajo la firma).
ALTER TABLE public.therapists ADD COLUMN IF NOT EXISTS registro text;
ALTER TABLE public.therapists DROP CONSTRAINT IF EXISTS therapists_registro_chk;
ALTER TABLE public.therapists ADD CONSTRAINT therapists_registro_chk
  CHECK (registro IS NULL OR char_length(registro) BETWEEN 1 AND 40);
COMMENT ON COLUMN public.therapists.registro IS 'CAMPOS-1: registro profesional (ACESS/SENESCYT) del terapeuta; sale bajo la firma del informe.';

-- d) pedidos_medicos — la orden del médico referente (ORD-1).
CREATE TABLE IF NOT EXISTS public.pedidos_medicos (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id           uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id            uuid        REFERENCES public.doctors(id) ON DELETE SET NULL,
  fecha                date        NOT NULL,
  sesiones_autorizadas int         NOT NULL,
  vigencia_hasta       date,
  nota                 text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid        DEFAULT auth.uid()
);
ALTER TABLE public.pedidos_medicos DROP CONSTRAINT IF EXISTS pedidos_sesiones_chk;
ALTER TABLE public.pedidos_medicos ADD CONSTRAINT pedidos_sesiones_chk
  CHECK (sesiones_autorizadas BETWEEN 1 AND 200);
ALTER TABLE public.pedidos_medicos DROP CONSTRAINT IF EXISTS pedidos_vigencia_chk;
ALTER TABLE public.pedidos_medicos ADD CONSTRAINT pedidos_vigencia_chk
  CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= fecha);
ALTER TABLE public.pedidos_medicos DROP CONSTRAINT IF EXISTS pedidos_nota_chk;
ALTER TABLE public.pedidos_medicos ADD CONSTRAINT pedidos_nota_chk
  CHECK (nota IS NULL OR char_length(nota) <= 300);
CREATE INDEX IF NOT EXISTS pedidos_medicos_patient_fecha_idx
  ON public.pedidos_medicos (patient_id, fecha);
COMMENT ON TABLE public.pedidos_medicos IS
  'ORD-1: órdenes del médico referente. El informe cita la más reciente con fecha <= fin del período. Sin vínculo a episodio (se resuelve por fecha). documento_id llega en B2.';

-- e) RLS (mismo patrón que episodios): lectura a todo autenticado; alta/edición admin, secretaria y terapeuta; borrado solo admin.
ALTER TABLE public.pedidos_medicos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pedidos_medicos FROM anon;

DROP POLICY IF EXISTS pedidos_select ON public.pedidos_medicos;
CREATE POLICY pedidos_select ON public.pedidos_medicos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pedidos_insert ON public.pedidos_medicos;
CREATE POLICY pedidos_insert ON public.pedidos_medicos
  FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_secretaria() OR is_terapeuta());

DROP POLICY IF EXISTS pedidos_update ON public.pedidos_medicos;
CREATE POLICY pedidos_update ON public.pedidos_medicos
  FOR UPDATE TO authenticated
  USING (is_admin() OR is_secretaria() OR is_terapeuta())
  WITH CHECK (is_admin() OR is_secretaria() OR is_terapeuta());

DROP POLICY IF EXISTS pedidos_delete ON public.pedidos_medicos;
CREATE POLICY pedidos_delete ON public.pedidos_medicos
  FOR DELETE TO authenticated USING (is_admin());

-- f) Auditoría (mismo trigger que las otras 10 tablas) y REPLICA IDENTITY por si B2 suma realtime.
DROP TRIGGER IF EXISTS trg_audit ON public.pedidos_medicos;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.pedidos_medicos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
ALTER TABLE public.pedidos_medicos REPLICA IDENTITY FULL;

COMMIT;
