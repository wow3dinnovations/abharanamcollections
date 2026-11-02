begin;
select plan(20);

-- Runs against the sample data in seed.sql (16 categories, 64 products).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'alice@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'bob@test.local');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';

-- One hidden product and one product switched off in the shop.
update public.products set is_visible = false where local_id = 'DEMO-PRD-0001';
update public.products set is_active = false where local_id = 'DEMO-PRD-0002';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.pid(local text) returns uuid language sql as $$
  select id from public.products where local_id = local;
$$;

-- Anonymous visitors ---------------------------------------------------------
set local role anon;
select is((select count(*)::int from public.catalog), 62, 'anon sees active, visible products only');
select is((select count(*)::int from public.products where local_id in ('DEMO-PRD-0001', 'DEMO-PRD-0002')), 0,
  'hidden and inactive products are not readable');
select is((select count(*)::int from public.enquiries), 0, 'anon cannot read enquiries');
select is_empty($$ update public.products set price = 1 returning id $$, 'anon cannot change products');
select throws_ok($$ insert into public.enquiries (name, phone) values ('x', '9999999999') $$,
  '42501', null, 'anon cannot insert enquiries directly');
select is((select count(*)::int from public.store_settings), 1, 'anon reads store settings');

-- Guest enquiry: price comes from the catalog, not the caller.
select matches(
  (select number from public.submit_enquiry('Guest', '+919876543210', null, 'Nandyal', null,
     jsonb_build_array(jsonb_build_object('product_id', pg_temp.pid('DEMO-PRD-0010'), 'quantity', 2, 'price', 1)), 'web')),
  '^ENQ-[0-9]+$', 'guest can send an enquiry');
select throws_ok(
  format($$ select public.submit_enquiry('Guest', '+919876543210', null, null, null,
     jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1)), 'web') $$, pg_temp.pid('DEMO-PRD-0001')),
  'A piece in your enquiry is no longer available. Please remove it and try again.', 'hidden product cannot be enquired');
select throws_ok(
  $$ select public.submit_enquiry('Guest', '+919876543210', null, null, null, '[]'::jsonb, 'web') $$,
  'Add at least one piece to your enquiry', 'empty enquiry refused');
select throws_ok(
  format($$ select public.submit_enquiry('Guest', '12', null, null, null,
     jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1)), 'web') $$, pg_temp.pid('DEMO-PRD-0010')),
  '23514', null, 'bad phone number refused');
reset role;

select is(
  (select total from public.enquiries where name = 'Guest'),
  (select price * 2 from public.products where local_id = 'DEMO-PRD-0010'),
  'enquiry total uses the server price');
select is((select user_id from public.enquiries where name = 'Guest'), null, 'guest enquiry has no user');

-- Customer -----------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select lives_ok(
  format($$ select public.submit_enquiry('Alice', '9876500000', 'alice@test.local', null, 'For a wedding',
     jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1)), 'app') $$, pg_temp.pid('DEMO-PRD-0011')),
  'customer can send an enquiry');
select is((select count(*)::int from public.enquiries), 1, 'customer sees only their own enquiry');
select is((select count(*)::int from public.enquiry_items), 1, 'customer sees only their own enquiry items');
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b' $$,
  'only an admin can change roles', 'customer cannot make themselves admin');
select is_empty($$ update public.store_settings set show_prices = false returning id $$, 'customer cannot change settings');
reset role;

select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.enquiries), 0, 'another customer sees none of them');
reset role;

-- Admin ----------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.enquiries), 2, 'admin sees all enquiries');
select is((select count(*)::int from public.products), 64, 'admin sees hidden and inactive products');
reset role;

select * from finish();
rollback;
