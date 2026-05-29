-- =====================================================================
-- RehactivaPro — Audit Log (LOPDP Ecuador)
-- Migracion append-only / inmutable. Correr en el SQL editor de Supabase.
--
-- Alcance: solo escrituras (INSERT/UPDATE/DELETE). Lecturas -> fase posterior.
-- Tablas auditadas (7): patients, session_log, appointments, cobros,
--                       profiles, therapists, doctors.  (protocols queda FUERA)
-- Re-ejecutable: usa IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS.
--
-- Inmutabilidad garantizada por 3 capas:
--   1) RLS (SELECT solo admin)        -> bloquea a roles de la app
--   2) REVOKE UPDATE/DELETE/TRUNCATE  -> quita el privilegio base
--   3) Triggers bloqueadores          -> RAISE EXCEPTION para TODOS (incl. owner)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tabla de auditoria
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key, -- monotonico = orden natural del log
  at          timestamptz not null default now(),
  actor_id    uuid,                       -- auth.uid(); NULL si no hay sesion (service_role/SQL editor)
  actor_name  text,                       -- profiles.full_name; 'system' si no resuelve
  actor_role  text,                       -- profiles.role;      'system' si no resuelve
  action      text not null check (action in ('INSERT','UPDATE','DELETE')),
  table_name  text not null,
  record_id   text,                       -- extraido genericamente de ->>'id' (TEXT)
  old_data    jsonb,                      -- NULL en INSERT
  new_data    jsonb                       -- NULL en DELETE
);

comment on table public.audit_log is
  'Bitacora inmutable (append-only) de cambios en datos sensibles. LOPDP. Solo escritura via trigger; solo lectura admin.';


-- ---------------------------------------------------------------------
-- 2. Indices
-- ---------------------------------------------------------------------
create index if not exists idx_audit_log_table_record on public.audit_log (table_name, record_id);
create index if not exists idx_audit_log_at           on public.audit_log (at);


-- ---------------------------------------------------------------------
-- 3. RLS + privilegios
--    Nota: usamos ENABLE (NO force) a proposito. La funcion de trigger es
--    SECURITY DEFINER y corre como owner; el owner DEBE bypassear RLS para
--    poder insertar. Con FORCE ROW LEVEL SECURITY el INSERT del trigger se
--    bloquearia. La inmutabilidad real la da el trigger bloqueador (paso 5),
--    no el RLS.
-- ---------------------------------------------------------------------
alter table public.audit_log enable row level security;

-- 3a. Quitar TODO privilegio directo a los roles de la app.
revoke all on public.audit_log from anon, authenticated, public;

-- 3b. REVOKE explicito de las operaciones mutables (defensa redundante y legible).
--     TRUNCATE no respeta RLS ni privilegios fila-a-fila, por eso se revoca aqui
--     ademas de bloquearse por trigger en el paso 5.
revoke update, delete, truncate on public.audit_log from public, anon, authenticated;

-- 3c. Devolver SOLO el privilegio base de SELECT a authenticated.
--     GOTCHA: la policy RLS filtra (solo admin), pero sin este GRANT base ni el
--     admin puede leer el log via PostgREST. Hacen falta los DOS: GRANT + policy.
grant select on public.audit_log to authenticated;

-- 3d. Policy de lectura: unicamente admins.
drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin
  on public.audit_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- No se crean policies de INSERT/UPDATE/DELETE: con RLS activo y sin policy,
-- quedan denegadas para roles normales. El INSERT entra solo via el
-- SECURITY DEFINER (owner) del paso 4, que bypassea RLS.


-- ---------------------------------------------------------------------
-- 4. Funcion de auditoria (SECURITY DEFINER, robusta)
--    search_path = '' + nombres calificados = blindaje anti-hijack.
-- ---------------------------------------------------------------------
create or replace function public.audit_trigger_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id  uuid := auth.uid();
  v_name      text;
  v_role      text;
  v_old       jsonb;
  v_new       jsonb;
  v_record_id text;
begin
  -- Resolver actor desde profiles. Por ser SECURITY DEFINER bypassea la RLS
  -- de profiles, asi que funciona aunque el usuario no pueda leer otras filas.
  if v_actor_id is not null then
    select p.full_name, p.role
      into v_name, v_role
      from public.profiles p
     where p.id = v_actor_id;
  end if;

  -- Fallback robusto: sin sesion (auth.uid() NULL) o sin fila en profiles.
  -- Nunca falla: marca 'system' y deja actor_id como este (NULL o el uid).
  if v_name is null then v_name := 'system'; end if;
  if v_role is null then v_role := 'system'; end if;

  if (tg_op = 'INSERT') then
    v_new := to_jsonb(new);
  elsif (tg_op = 'UPDATE') then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
  elsif (tg_op = 'DELETE') then
    v_old := to_jsonb(old);
  end if;

  -- Extraccion uniforme del id para las 7 tablas (TEXT).
  v_record_id := coalesce(v_new ->> 'id', v_old ->> 'id');

  insert into public.audit_log (
    actor_id, actor_name, actor_role, action, table_name, record_id, old_data, new_data
  ) values (
    v_actor_id, v_name, v_role, tg_op, tg_table_name, v_record_id, v_old, v_new
  );

  return null;  -- AFTER trigger: el valor de retorno se ignora.
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Inmutabilidad: bloquear UPDATE/DELETE (row-level) y TRUNCATE
--    (statement-level) para TODOS, incluido el owner.
--    Esta es la garantia real "append-only".
-- ---------------------------------------------------------------------
create or replace function public.audit_log_block_changes()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log es inmutable: operacion % no permitida', tg_op
    using errcode = 'insufficient_privilege';
  return null;
end;
$$;

-- 5a. Row-level: bloquea UPDATE y DELETE fila a fila.
drop trigger if exists trg_audit_block on public.audit_log;
create trigger trg_audit_block
  before update or delete on public.audit_log
  for each row execute function public.audit_log_block_changes();

-- 5b. Statement-level: bloquea TRUNCATE (no respeta RLS ni privilegios de fila).
drop trigger if exists trg_audit_block_truncate on public.audit_log;
create trigger trg_audit_block_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_block_changes();


-- ---------------------------------------------------------------------
-- 6. Enganchar el trigger AFTER en las 7 tablas auditadas.
--    (protocols queda FUERA por decision de FASE 1.)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  tablas text[] := array[
    'patients','session_log','appointments','cobros','profiles','therapists','doctors'
  ];
begin
  foreach t in array tablas loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format(
      'create trigger trg_audit after insert or update or delete on public.%I '
      || 'for each row execute function public.audit_trigger_fn()', t);
    raise notice 'Trigger de auditoria instalado en: %', t;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 7. Verificar que audit_log NO este en la publicacion de realtime.
--    Si por algun motivo estuviera, se remueve. Si no existe la publicacion,
--    no hace nada. audit_log NUNCA debe emitir eventos de realtime a clientes.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'audit_log'
  ) then
    execute 'alter publication supabase_realtime drop table public.audit_log';
    raise notice 'audit_log REMOVIDO de supabase_realtime.';
  else
    raise notice 'OK: audit_log NO esta en supabase_realtime.';
  end if;
end $$;


-- =====================================================================
-- Fin. Verificacion manual sugerida tras correr:
--   select * from public.audit_log order by at desc limit 20;
--   -- deben FALLAR:
--   --   update public.audit_log set actor_name = 'x';
--   --   delete from public.audit_log;
--   --   truncate public.audit_log;
-- =====================================================================
