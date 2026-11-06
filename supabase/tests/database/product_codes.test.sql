begin;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'cust@test.local');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
insert into public.categories (id, name, code) values ('10000000-0000-0000-0000-000000000001', 'Earrings', 'ER');
insert into public.shop_locations (id, name, code) values ('30000000-0000-0000-0000-000000000001', 'Bangalore', 'B'),
                                                          ('30000000-0000-0000-0000-000000000002', 'Hyderabad', 'H');
select is(public.shop_next_vendor_no('30000000-0000-0000-0000-000000000001'), 1, 'first vendor in a city is number 1');
insert into public.shop_vendors (id, name, location_id, code_no, next_serial) values
  ('20000000-0000-0000-0000-000000000001', 'Ravi', '30000000-0000-0000-0000-000000000001', 8, 50),
  ('20000000-0000-0000-0000-000000000002', 'Sita', '30000000-0000-0000-0000-000000000002', 5, 1),
  ('20000000-0000-0000-0000-000000000003', 'No number', null, null, 1);
select is(public.shop_next_vendor_no('30000000-0000-0000-0000-000000000001'), 9, 'next vendor in Bangalore is 9');

-- IB850G: Imitation, Bangalore, vendor 8, serial 50, guarantee.
select is(public.shop_suggest_code('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
                                   '30000000-0000-0000-0000-000000000001', true)->>'sku', 'IB850G', 'code with guarantee');
select is(public.shop_suggest_code('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
                                   '30000000-0000-0000-0000-000000000001', false)->>'sku', 'IB850', 'code without guarantee');
select is(public.shop_suggest_code('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003',
                                   '30000000-0000-0000-0000-000000000001')->>'sku', 'ABH-ER-000001',
  'vendor without a number keeps the old codes');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids values ('a', public.shop_save_product(jsonb_build_object(
  'sku', 'IB850G', 'code_serial', 50, 'guarantee_months', 6, 'name', 'Dollar',
  'category_id', '10000000-0000-0000-0000-000000000001', 'vendor_id', '20000000-0000-0000-0000-000000000001',
  'location_id', '30000000-0000-0000-0000-000000000001', 'price', 499, 'opening_qty', 2,
  'purchase_date', ((now() at time zone 'Asia/Kolkata')::date - 100)::text)));
select is((select next_serial from public.shop_vendors where id = '20000000-0000-0000-0000-000000000001'), 51,
  'saving moves the vendor serial on');
select is((select guarantee_months from public.shop_products where product_id = (select v from ids where k = 'a')), 6,
  'guarantee saved');
select is(public.shop_suggest_code('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
                                   '30000000-0000-0000-0000-000000000001')->>'sku', 'IB851', 'next code is IB851');

-- A code typed by hand does not move the serial.
select lives_ok($$ select public.shop_save_product('{"sku":"IB999","code_serial":70,"name":"X","price":1,
  "vendor_id":"20000000-0000-0000-0000-000000000001"}') $$, 'hand-typed code saves');
select is((select next_serial from public.shop_vendors where id = '20000000-0000-0000-0000-000000000001'), 51,
  'hand-typed code leaves the serial alone');

-- Used numbers are skipped (IB851 exists without the G -> IB851G is not offered).
select lives_ok($$ select public.shop_save_product('{"sku":"IB851","name":"Y","price":1}') $$, 'IB851 added by hand');
select is(public.shop_suggest_code('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
                                   '30000000-0000-0000-0000-000000000001', true)->>'sku', 'IB852G', 'skips a used number');

-- One serial for the whole shop, with the pattern changed.
update public.shop_settings set serial_scope = 'shop', next_serial = 7, serial_digits = 3,
                                code_pattern = '{LOC}{VENDOR}-{SERIAL}' where id = 1;
select is(public.shop_suggest_code('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
                                   null)->>'sku', 'H5-007', 'shop serial with a custom pattern');

-- Stock age
select is((select age_days from public.shop_stock_age where id = (select v from ids where k = 'a')), 100, 'age in days');
select is((select (e->>'pieces')::int from jsonb_array_elements(public.shop_stock_age_summary()) e where (e->>'bucket')::int = 2),
  2, '100 days old is in the 91-180 days group');

-- Customers get nothing
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ select public.shop_suggest_code('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001') $$,
  'Only the shop admin can do this.', 'customers cannot get codes');

select * from finish();
rollback;
