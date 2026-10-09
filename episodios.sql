-- =====================================================================
-- EPI-2a — Episodios como tabla: editables, con nombre, diagnóstico y
-- "sesiones previas a RehactivaPro".
--
-- Hasta hoy un episodio era una fila type='Fin de episodio' en session_log
-- con el diagnóstico y las sesiones DENTRO del texto de note. Desde EPI-2a:
--   · episodio = rango de fechas [desde, desde del siguiente). desde NULL =
--     desde el inicio (el primero de cada paciente). Actual = el de mayor desde.
--   · En el episodio ACTUAL diag/cie10/cie10_desc/protocol_id/sesiones_plan
--     van en NULL: valen los del paciente (como hoy). Al cerrarlo se llenan
--     con una foto (snapshot) de patients.
--   · Un corte no puede caer dentro de un mismo día (limitación aceptada).
--   · Los marcadores 'Fin de episodio' NO se borran: quedan inertes y el
--     código deja de usarlos como frontera.
--
-- Correr en el SQL editor de Supabase ANTES de mergear EPI-2a: el código
-- nuevo lee episodios(*) en la carga inicial y sin la tabla no carga.
-- Re-ejecutable: si entre la primera corrida y el merge alguien inicia un
-- episodio con el código viejo (crea un marcador), volver a correrlo lo migra.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- a) Tabla
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.episodios (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id       uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  desde            date,
  nombre           text,
  diag             text,
  cie10            text,
  cie10_desc       text,
  protocol_id      uuid        REFERENCES public.protocols(id) ON DELETE SET NULL,
  sesiones_plan    int,
  sesiones_previas int         NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        DEFAULT auth.uid()
);

ALTER TABLE public.episodios DROP CONSTRAINT IF EXISTS episodios_nombre_chk;
ALTER TABLE public.episodios ADD CONSTRAINT episodios_nombre_chk
  CHECK (nombre IS NULL OR char_length(nombre) BETWEEN 1 AND 80);
ALTER TABLE public.episodios DROP CONSTRAINT IF EXISTS episodios_plan_chk;
ALTER TABLE public.episodios ADD CONSTRAINT episodios_plan_chk
  CHECK (sesiones_plan IS NULL OR sesiones_plan BETWEEN 0 AND 200);
ALTER TABLE public.episodios DROP CONSTRAINT IF EXISTS episodios_previas_chk;
ALTER TABLE public.episodios ADD CONSTRAINT episodios_previas_chk
  CHECK (sesiones_previas BETWEEN 0 AND 200);

-- Un solo episodio por fecha de inicio y paciente (y un solo "desde el inicio").
CREATE UNIQUE INDEX IF NOT EXISTS episodios_patient_desde_uq
  ON public.episodios (patient_id, coalesce(desde, '0001-01-01'::date));

COMMENT ON TABLE public.episodios IS
  'EPI-2a: episodios de tratamiento. Rango [desde, desde del siguiente); desde NULL = desde el inicio; actual = mayor desde. Snapshot (diag, cie10, protocol_id, sesiones_plan) solo en los cerrados.';
COMMENT ON COLUMN public.episodios.sesiones_previas IS
  'EPI-2a: sesiones hechas antes de RehactivaPro. Solo se SUMAN en lo que se muestra (badge X/N, informe, prompt IA); nunca en facturación ni en pendientes.';

-- ---------------------------------------------------------------------
-- b) RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.episodios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.episodios FROM anon;

DROP POLICY IF EXISTS episodios_select ON public.episodios;
CREATE POLICY episodios_select ON public.episodios
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS episodios_insert ON public.episodios;
CREATE POLICY episodios_insert ON public.episodios
  FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_secretaria() OR is_terapeuta());

DROP POLICY IF EXISTS episodios_update ON public.episodios;
CREATE POLICY episodios_update ON public.episodios
  FOR UPDATE TO authenticated
  USING (is_admin() OR is_secretaria() OR is_terapeuta())
  WITH CHECK (is_admin() OR is_secretaria() OR is_terapeuta());

-- El primero (desde NULL) no se borra: sin él, lo anterior al primer corte quedaría sin episodio.
DROP POLICY IF EXISTS episodios_delete ON public.episodios;
CREATE POLICY episodios_delete ON public.episodios
  FOR DELETE TO authenticated
  USING ((is_admin() OR is_secretaria() OR is_terapeuta()) AND desde IS NOT NULL);

-- ---------------------------------------------------------------------
-- c) Auditoría (mismo trigger que las otras 9 tablas) y realtime
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit ON public.episodios;
CREATE TRIGGER trg_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.episodios
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

-- FULL: el evento DELETE de realtime trae patient_id (el cliente sabe qué paciente repintar).
ALTER TABLE public.episodios REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'episodios') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.episodios';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- d) Paciente nuevo → su primer episodio (desde NULL)
--    SECURITY DEFINER: la fila se crea siempre, la inserte quien la inserte
--    (solo escribe el episodio inicial de NEW.id; nada que el usuario controle).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.episodio_inicial_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.episodios (patient_id, desde)
  VALUES (NEW.id, NULL)
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.episodio_inicial_fn() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_episodio_inicial ON public.patients;
CREATE TRIGGER trg_episodio_inicial
  AFTER INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.episodio_inicial_fn();

-- ---------------------------------------------------------------------
-- e) Backfill (idempotente)
-- ---------------------------------------------------------------------
-- e1) Un episodio "desde el inicio" por paciente.
INSERT INTO public.episodios (patient_id, desde)
SELECT p.id, NULL
  FROM public.patients p
 WHERE NOT EXISTS (SELECT 1 FROM public.episodios e WHERE e.patient_id = p.id AND e.desde IS NULL);

-- e2) Cada marcador (por paciente y fecha) cierra el episodio vigente a esa fecha con la foto que
--     guarda su nota y abre el siguiente el día después. Nota: "Episodio anterior: <diag> · <N>
--     sesiones completadas" → diag y sesiones_plan = N (lo que el informe ya mostraba como "de N").
--     Si el episodio que abre ya existe, el marcador ya se migró: se salta.
DO $$
DECLARE
  m        record;
  v_cierra uuid;
  v_diag   text;
  v_n      int;
BEGIN
  FOR m IN
    SELECT s.patient_id, s.date, s.note
      FROM public.session_log s
     WHERE s.type = 'Fin de episodio' AND s.date IS NOT NULL
     ORDER BY s.patient_id, s.date, s.id
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.episodios e
                           WHERE e.patient_id = m.patient_id AND e.desde = m.date + 1);
    SELECT e.id INTO v_cierra
      FROM public.episodios e
     WHERE e.patient_id = m.patient_id AND (e.desde IS NULL OR e.desde <= m.date)
     ORDER BY e.desde DESC NULLS LAST
     LIMIT 1;
    v_diag := nullif(btrim(split_part(split_part(coalesce(m.note, ''), 'Episodio anterior: ', 2), ' · ', 1)), '');
    v_n    := substring(coalesce(m.note, '') FROM '(\d+) sesiones')::int;
    UPDATE public.episodios
       SET diag = coalesce(v_diag, 'Tratamiento anterior'),
           sesiones_plan = v_n
     WHERE id = v_cierra;
    INSERT INTO public.episodios (patient_id, desde) VALUES (m.patient_id, m.date + 1);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- f) Funciones (SECURITY INVOKER: respetan la RLS de episodios y patients; atómicas).
--    Un lock por paciente evita que dos clics simultáneos creen dos episodios a la vez.
-- ---------------------------------------------------------------------

-- Inicia un episodio nuevo el día p_desde: foto del actual desde patients, fila nueva y el paciente
-- con el diagnóstico/plan nuevos. El CIE-10 se limpia: era del diagnóstico anterior.
CREATE OR REPLACE FUNCTION public.crear_episodio(
  p_patient     uuid,
  p_desde       date,
  p_protocol_id uuid,
  p_diag        text,
  p_sesiones    int,
  p_nombre      text DEFAULT NULL,
  p_previas     int  DEFAULT 0
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_pat public.patients%ROWTYPE;
  v_act public.episodios%ROWTYPE;
  v_id  uuid;
BEGIN
  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'Falta la fecha de inicio del episodio';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('episodios:' || p_patient::text));

  SELECT * INTO v_pat FROM public.patients WHERE id = p_patient;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente no encontrado';
  END IF;

  SELECT * INTO v_act FROM public.episodios
   WHERE patient_id = p_patient
   ORDER BY desde DESC NULLS LAST
   LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO public.episodios (patient_id, desde) VALUES (p_patient, NULL) RETURNING * INTO v_act;
  END IF;
  IF v_act.desde IS NOT NULL AND p_desde <= v_act.desde THEN
    RAISE EXCEPTION 'El episodio nuevo tiene que empezar después del % (inicio del episodio actual)', v_act.desde;
  END IF;

  UPDATE public.episodios
     SET diag = v_pat.diag, cie10 = v_pat.cie10, cie10_desc = v_pat.cie10_desc,
         protocol_id = v_pat.protocol_id, sesiones_plan = v_pat.sessions
   WHERE id = v_act.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo cerrar el episodio actual (permiso)';
  END IF;

  INSERT INTO public.episodios (patient_id, desde, nombre, sesiones_previas)
  VALUES (p_patient, p_desde, nullif(btrim(coalesce(p_nombre, '')), ''), coalesce(p_previas, 0))
  RETURNING id INTO v_id;

  UPDATE public.patients
     SET diag = p_diag, protocol_id = p_protocol_id, sessions = p_sesiones, status = 'active',
         cie10 = NULL, cie10_desc = NULL
   WHERE id = p_patient;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo actualizar el paciente (permiso)';
  END IF;

  RETURN v_id;
END;
$$;

-- Borra el episodio (nunca el primero): su tramo pasa al anterior. Si era el ACTUAL, el paciente
-- vuelve al diagnóstico/plan/CIE-10 de la foto del anterior y esa foto se limpia (vuelve a ser el actual).
CREATE OR REPLACE FUNCTION public.unir_con_anterior(p_episodio uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_ep        public.episodios%ROWTYPE;
  v_prev      public.episodios%ROWTYPE;
  v_es_actual boolean;
BEGIN
  SELECT * INTO v_ep FROM public.episodios WHERE id = p_episodio;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Episodio no encontrado';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('episodios:' || v_ep.patient_id::text));
  IF v_ep.desde IS NULL THEN
    RAISE EXCEPTION 'El primer episodio no tiene uno anterior con el que unirse';
  END IF;

  SELECT * INTO v_prev FROM public.episodios
   WHERE patient_id = v_ep.patient_id AND (desde IS NULL OR desde < v_ep.desde)
   ORDER BY desde DESC NULLS LAST
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay episodio anterior';
  END IF;
  v_es_actual := NOT EXISTS (SELECT 1 FROM public.episodios
                              WHERE patient_id = v_ep.patient_id AND desde > v_ep.desde);

  DELETE FROM public.episodios WHERE id = v_ep.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo unir el episodio (permiso)';
  END IF;

  IF v_es_actual THEN
    UPDATE public.patients
       SET diag = coalesce(v_prev.diag, diag),
           sessions = coalesce(v_prev.sesiones_plan, sessions),
           protocol_id = v_prev.protocol_id,
           cie10 = v_prev.cie10,
           cie10_desc = v_prev.cie10_desc
     WHERE id = v_ep.patient_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No se pudo actualizar el paciente (permiso)';
    END IF;
    UPDATE public.episodios
       SET diag = NULL, cie10 = NULL, cie10_desc = NULL, protocol_id = NULL, sesiones_plan = NULL
     WHERE id = v_prev.id;
  END IF;
END;
$$;

-- Mueve el inicio de un episodio (nunca el primero): tiene que quedar estrictamente después del
-- inicio del anterior y antes del inicio del siguiente.
CREATE OR REPLACE FUNCTION public.mover_inicio(p_episodio uuid, p_desde date)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_ep         public.episodios%ROWTYPE;
  v_prev_desde date;
  v_hay_prev   boolean;
  v_next_desde date;
BEGIN
  IF p_desde IS NULL THEN
    RAISE EXCEPTION 'Falta la fecha de inicio';
  END IF;
  SELECT * INTO v_ep FROM public.episodios WHERE id = p_episodio;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Episodio no encontrado';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('episodios:' || v_ep.patient_id::text));
  IF v_ep.desde IS NULL THEN
    RAISE EXCEPTION 'El primer episodio empieza desde el inicio: no tiene fecha que mover';
  END IF;

  SELECT e.desde, true INTO v_prev_desde, v_hay_prev
    FROM public.episodios e
   WHERE e.patient_id = v_ep.patient_id AND (e.desde IS NULL OR e.desde < v_ep.desde)
   ORDER BY e.desde DESC NULLS LAST
   LIMIT 1;
  SELECT min(e.desde) INTO v_next_desde
    FROM public.episodios e
   WHERE e.patient_id = v_ep.patient_id AND e.desde > v_ep.desde;

  IF v_hay_prev AND v_prev_desde IS NOT NULL AND p_desde <= v_prev_desde THEN
    RAISE EXCEPTION 'El inicio tiene que quedar después del %', v_prev_desde;
  END IF;
  IF v_next_desde IS NOT NULL AND p_desde >= v_next_desde THEN
    RAISE EXCEPTION 'El inicio tiene que quedar antes del %', v_next_desde;
  END IF;

  UPDATE public.episodios SET desde = p_desde WHERE id = v_ep.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo mover el inicio (permiso)';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_episodio(uuid, date, uuid, text, int, text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unir_con_anterior(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mover_inicio(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_episodio(uuid, date, uuid, text, int, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unir_con_anterior(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mover_inicio(uuid, date) TO authenticated;

COMMIT;

-- =====================================================================
-- g) Verificación (correr después; cada una dice qué tiene que dar)
-- =====================================================================
-- 1. Filas = pacientes + marcadores (hoy: pacientes + 4).
-- SELECT (SELECT count(*) FROM public.episodios) AS episodios,
--        (SELECT count(*) FROM public.patients) AS pacientes,
--        (SELECT count(*) FROM public.session_log WHERE type = 'Fin de episodio') AS marcadores;
--
-- 2. Por paciente, los cortes nuevos (desde − 1 día) = fechas de sus marcadores. Tiene que dar 0 filas.
-- WITH c AS (SELECT patient_id, array_agg(desde - 1 ORDER BY desde) AS f
--              FROM public.episodios WHERE desde IS NOT NULL GROUP BY patient_id),
--      m AS (SELECT patient_id, array_agg(date ORDER BY date) AS f
--              FROM public.session_log WHERE type = 'Fin de episodio' GROUP BY patient_id)
-- SELECT coalesce(c.patient_id, m.patient_id) AS patient_id, c.f AS cortes, m.f AS marcadores
--   FROM c FULL JOIN m ON m.patient_id = c.patient_id
--  WHERE c.f IS DISTINCT FROM m.f;
--
-- 3. Ningún paciente sin su episodio "desde el inicio". Tiene que dar 0.
-- SELECT count(*) FROM public.patients p
--  WHERE NOT EXISTS (SELECT 1 FROM public.episodios e WHERE e.patient_id = p.id AND e.desde IS NULL);
--
-- 4. Los episodios cerrados y su foto (hoy: 4 filas, diag 'Sin diagnóstico', plan 0/21/0/12).
-- SELECT e.patient_id, e.desde, e.diag, e.sesiones_plan, n.desde AS cierra_antes_de
--   FROM public.episodios e
--   JOIN LATERAL (SELECT min(x.desde) AS desde FROM public.episodios x
--                  WHERE x.patient_id = e.patient_id AND x.desde > coalesce(e.desde, '0001-01-01')) n ON true
--  WHERE n.desde IS NOT NULL ORDER BY e.patient_id, e.desde NULLS FIRST;
--
-- 5. Funciones creadas (3 INVOKER + el trigger DEFINER).
-- SELECT proname, prosecdef AS security_definer, pg_get_function_identity_arguments(oid) AS args
--   FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--    AND proname IN ('crear_episodio','unir_con_anterior','mover_inicio','episodio_inicial_fn');
--
-- 6. Policies (4), triggers (trg_audit en episodios, trg_episodio_inicial en patients) y realtime.
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'episodios';
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname IN ('trg_audit','trg_episodio_inicial')
--    AND tgrelid IN ('public.episodios'::regclass, 'public.patients'::regclass);
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'episodios';
