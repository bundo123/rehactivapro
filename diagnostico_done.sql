-- ============================================================
-- DIAGNÓSTICO READ-ONLY del contador patients.done (POR EPISODIO)
-- Bug B1: done solo se decrementaba, nunca se incrementaba.
--
-- done es PER-EPISODIO: se resetea a 0 al iniciar nuevo episodio
-- (pacientes.js -> nuevoEpisodio). La frontera del episodio actual
-- es la fecha del ÚLTIMO session_log con type='Fin de episodio'.
--
-- Por paciente compara:
--   done_stored            = patients.done (valor actual en DB)
--   episodios              = nº de marcadores 'Fin de episodio' (episodios previos)
--   inicio_episodio_actual = MAX(date) de esos marcadores; si no hay,
--                            la fecha más antigua del paciente
--   conf_episodio_actual   = appointments status='conf' con date >= inicio  <- lo que done DEBERÍA valer
--   asistio_clinico        = session_log status='asistió' (excluye el marcador) con date >= inicio
--   diff                   = conf_episodio_actual - done_stored
--
-- BORDE: date = inicio_episodio_actual CUENTA como episodio actual (>=, inclusive).
-- (Ojo: informes.js usa > estricto; acá es >= por pedido explícito.)
--
-- NO MODIFICA NADA. Solo SELECT. Seguro de correr en prod.
-- ============================================================

-- ----------------------------------------------------------------
-- (1) Detalle por paciente, ordenado por mayor ABS(diff).
-- ----------------------------------------------------------------
WITH fin_ep AS (
  SELECT patient_id, COUNT(*) AS episodios, MAX(date) AS ultimo_fin
  FROM session_log
  WHERE type = 'Fin de episodio'
  GROUP BY patient_id
),
primera_act AS (
  SELECT patient_id, MIN(date) AS primera_fecha
  FROM (
    SELECT patient_id, date FROM appointments
    UNION ALL
    SELECT patient_id, date FROM session_log
  ) t
  GROUP BY patient_id
),
base AS (
  SELECT
    p.id,
    p.name,
    p.done AS done_stored,
    COALESCE(fe.episodios, 0)                       AS episodios,
    COALESCE(fe.ultimo_fin, pa.primera_fecha)       AS inicio_episodio_actual
  FROM patients p
  LEFT JOIN fin_ep      fe ON fe.patient_id = p.id
  LEFT JOIN primera_act pa ON pa.patient_id = p.id
)
SELECT
  b.id,
  b.name,
  b.done_stored,
  b.episodios,
  b.inicio_episodio_actual,
  COALESCE(c.cnt, 0)                  AS conf_episodio_actual,
  COALESCE(s.cnt, 0)                  AS asistio_clinico,
  COALESCE(c.cnt, 0) - b.done_stored  AS diff
FROM base b
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS cnt
  FROM appointments a
  WHERE a.patient_id = b.id
    AND a.status = 'conf'
    AND (b.inicio_episodio_actual IS NULL OR a.date >= b.inicio_episodio_actual)
) c ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS cnt
  FROM session_log sl
  WHERE sl.patient_id = b.id
    AND sl.status = 'asistió'
    AND sl.type <> 'Fin de episodio'
    AND (b.inicio_episodio_actual IS NULL OR sl.date >= b.inicio_episodio_actual)
) s ON true
ORDER BY ABS(COALESCE(c.cnt, 0) - b.done_stored) DESC, b.name;

-- ----------------------------------------------------------------
-- (2) Resumen: cuántos pacientes difieren (conf_episodio_actual vs
--     done_stored) y suma total del desvío absoluto. Un solo row.
-- ----------------------------------------------------------------
WITH fin_ep AS (
  SELECT patient_id, COUNT(*) AS episodios, MAX(date) AS ultimo_fin
  FROM session_log
  WHERE type = 'Fin de episodio'
  GROUP BY patient_id
),
primera_act AS (
  SELECT patient_id, MIN(date) AS primera_fecha
  FROM (
    SELECT patient_id, date FROM appointments
    UNION ALL
    SELECT patient_id, date FROM session_log
  ) t
  GROUP BY patient_id
),
base AS (
  SELECT
    p.id,
    p.done AS done_stored,
    COALESCE(fe.ultimo_fin, pa.primera_fecha) AS inicio_episodio_actual
  FROM patients p
  LEFT JOIN fin_ep      fe ON fe.patient_id = p.id
  LEFT JOIN primera_act pa ON pa.patient_id = p.id
),
detalle AS (
  SELECT
    b.done_stored,
    COALESCE(c.cnt, 0) AS conf_episodio_actual
  FROM base b
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM appointments a
    WHERE a.patient_id = b.id
      AND a.status = 'conf'
      AND (b.inicio_episodio_actual IS NULL OR a.date >= b.inicio_episodio_actual)
  ) c ON true
)
SELECT
  COUNT(*)                                                              AS total_pacientes,
  COUNT(*) FILTER (WHERE conf_episodio_actual <> done_stored)           AS pacientes_diff,
  COALESCE(SUM(ABS(conf_episodio_actual - done_stored)), 0)            AS suma_abs_desvio
FROM detalle;
