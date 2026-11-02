-- Shop software data, kept online so the shop software can run at 1gram.abharanamcollections.com/shop-admin.
--
-- Purchase rates, vendors, customers, sales and expenses are private business data.  They live in their own
-- schema that the website API does not expose, and only these functions can reach them.  The functions can only
-- be called with the service_role key, which exists only inside the shop software's container on Cloudflare.

create schema if not exists shop_private;
revoke all on schema shop_private from public, anon, authenticated;

-- One row per data file of the shop software (products, sales, settings, ...).
create table shop_private.collections (
  name text primary key,
  revision bigint not null default 0,
  doc jsonb,                       -- for settings-style files (one object)
  updated_at timestamptz not null default now()
);

-- One row per record of a list-style file.  seq keeps the original order of the file.
create table shop_private.records (
  collection text not null references shop_private.collections (name) on delete cascade,
  id text not null,
  seq bigint generated always as identity,
  data jsonb not null,
  primary key (collection, id)
);
create index records_collection_seq on shop_private.records (collection, seq);

alter table shop_private.collections enable row level security;
alter table shop_private.records enable row level security;
revoke all on all tables in schema shop_private from public, anon, authenticated;

-- Save one transaction of the shop software, all or nothing.
-- p_ops: [{"c": name, "rev": new revision, "up": [records...], "del": [ids...], "doc": {...} | null, "id_field": "id"}]
-- Each collection's stored revision must be rev - 1, so two copies of the software can never overwrite each other.
create or replace function public.shop_store_commit(p_ops jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  op jsonb;
  cur bigint;
  idf text;
begin
  for op in select * from jsonb_array_elements(p_ops) loop
    insert into shop_private.collections (name) values (op->>'c') on conflict (name) do nothing;
    select revision into cur from shop_private.collections where name = op->>'c' for update;
    if cur <> (op->>'rev')::bigint - 1 then
      raise exception 'shop data changed elsewhere (% is at revision %, expected %)', op->>'c', cur, (op->>'rev')::bigint - 1
        using errcode = '40001';
    end if;
    idf := coalesce(op->>'id_field', 'id');
    if op ? 'doc' and jsonb_typeof(op->'doc') = 'object' then
      update shop_private.collections set doc = op->'doc' where name = op->>'c';
    end if;
    if op ? 'del' then
      delete from shop_private.records r
       where r.collection = op->>'c' and r.id in (select jsonb_array_elements_text(op->'del'));
    end if;
    if op ? 'up' then
      insert into shop_private.records (collection, id, data)
      select op->>'c', e.value->>idf, e.value
        from jsonb_array_elements(op->'up') with ordinality as e(value, n)
       order by e.n
      on conflict (collection, id) do update set data = excluded.data;
    end if;
    update shop_private.collections set revision = (op->>'rev')::bigint, updated_at = now() where name = op->>'c';
  end loop;
end;
$$;

-- Replace whole files (restore from a backup, first upload from the shop computer).
-- p_cols: [{"c": name, "rev": revision, "records": [...] | null, "doc": {...} | null, "id_field": "id"}]
create or replace function public.shop_store_replace(p_cols jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  col jsonb;
  idf text;
begin
  for col in select * from jsonb_array_elements(p_cols) loop
    idf := coalesce(col->>'id_field', 'id');
    insert into shop_private.collections (name, revision, doc)
    values (col->>'c', coalesce((col->>'rev')::bigint, 1), case when jsonb_typeof(col->'doc') = 'object' then col->'doc' end)
    on conflict (name) do update set revision = excluded.revision, doc = excluded.doc, updated_at = now();
    delete from shop_private.records where collection = col->>'c';
    if jsonb_typeof(col->'records') = 'array' then
      insert into shop_private.records (collection, id, data)
      select col->>'c', e.value->>idf, e.value
        from jsonb_array_elements(col->'records') with ordinality as e(value, n)
       order by e.n;
    end if;
  end loop;
end;
$$;

-- Read everything back when the shop software starts.
create or replace function public.shop_store_collections()
returns table (name text, revision bigint, doc jsonb, records bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.name, c.revision, c.doc, (select count(*) from shop_private.records r where r.collection = c.name)
    from shop_private.collections c
   order by c.name;
$$;

create or replace function public.shop_store_records(p_collection text, p_after bigint default 0, p_limit int default 1000)
returns table (seq bigint, data jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select r.seq, r.data
    from shop_private.records r
   where r.collection = p_collection and r.seq > p_after
   order by r.seq
   limit least(greatest(p_limit, 1), 1000);
$$;

revoke all on function public.shop_store_commit(jsonb) from public, anon, authenticated;
revoke all on function public.shop_store_replace(jsonb) from public, anon, authenticated;
revoke all on function public.shop_store_collections() from public, anon, authenticated;
revoke all on function public.shop_store_records(text, bigint, int) from public, anon, authenticated;
grant execute on function public.shop_store_commit(jsonb) to service_role;
grant execute on function public.shop_store_replace(jsonb) to service_role;
grant execute on function public.shop_store_collections() to service_role;
grant execute on function public.shop_store_records(text, bigint, int) to service_role;

-- Product photos, expense receipts, logo and backups of the shop software.  Private: no public URL, no policies,
-- so only the service_role key can read or write it.
insert into storage.buckets (id, name, public, file_size_limit)
values ('shop-files', 'shop-files', false, 52428800)
on conflict (id) do nothing;
