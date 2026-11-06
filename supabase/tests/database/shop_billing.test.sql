begin;
select plan(22);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'cust@test.local');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select is(public.shop_clean_phone('+91 98765-43210'), '9876543210', 'phone: +91 dropped');
select is(public.shop_clean_phone('098765 43210'), '9876543210', 'phone: leading 0 dropped');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
insert into public.categories (id, name, code) values ('10000000-0000-0000-0000-000000000001', 'Earrings', 'ER');
insert into public.shop_locations (id, name) values ('30000000-0000-0000-0000-000000000001', 'Hyderabad'),
                                                    ('30000000-0000-0000-0000-000000000002', 'Bangalore');
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids values ('a', public.shop_save_product(jsonb_build_object(
  'sku', 'IB850G', 'name', 'Jhumka', 'category_id', '10000000-0000-0000-0000-000000000001',
  'location_id', '30000000-0000-0000-0000-000000000002', 'purchase_rate', 250, 'price', 500, 'opening_qty', 3)));
select public.shop_set_stock((select v from ids where k = 'a'), '30000000-0000-0000-0000-000000000001', 2, 'count');

-- No location: stock comes from the location with the most first (Bangalore 3), then Hyderabad
create temp table bill (k text primary key, r jsonb);
grant all on bill to authenticated;
insert into bill select 'one', public.shop_create_sale(jsonb_build_object(
  'customer_phone', '+91 98765 43210', 'customer_name', 'Lakshmi', 'customer_address', 'Bangalore',
  'discount_type', 'percent', 'discount_value', 10,
  'items', jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k = 'a'), 'qty', 4, 'price', 500))));
select is((select (r->>'total')::numeric from bill where k = 'one'), 1800::numeric, '10% off 2000');
select is((select discount from public.shop_sales where id = (select (r->>'id')::uuid from bill where k = 'one')), 200::numeric,
  'discount amount saved');
select is((select discount_type || ' ' || discount_value from public.shop_sales where id = (select (r->>'id')::uuid from bill where k = 'one')),
  'percent 10.00', 'discount type and value saved');
select is((select location_id from public.shop_sales where id = (select (r->>'id')::uuid from bill where k = 'one')), null,
  'bill has no location');
select is((select qty from public.shop_stock where product_id = (select v from ids where k = 'a')
            and location_id = '30000000-0000-0000-0000-000000000002'), 0, 'Bangalore (most stock) emptied first');
select is((select qty from public.shop_stock where product_id = (select v from ids where k = 'a')
            and location_id = '30000000-0000-0000-0000-000000000001'), 1, 'then 1 from Hyderabad');
select is((select count(*)::int from public.shop_stock_moves where ref = (select r->>'number' from bill where k = 'one')), 2,
  'one stock line per location');

select is((select name || ' ' || address from public.shop_customers where phone = '9876543210'), 'Lakshmi Bangalore',
  'customer saved by phone');
select is((select customer_phone from public.shop_sales where id = (select (r->>'id')::uuid from bill where k = 'one')),
  '9876543210', 'bill keeps the cleaned phone');

-- Same phone again (no name typed): same customer, name kept; flat amount discount
insert into bill select 'two', public.shop_create_sale(jsonb_build_object(
  'customer_phone', '9876543210', 'discount_type', 'amount', 'discount_value', 50,
  'items', jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k = 'a'), 'qty', 1, 'price', 500))));
select is((select count(*)::int from public.shop_customers), 1, 'no duplicate customer');
select is((select customer_name from public.shop_sales where id = (select (r->>'id')::uuid from bill where k = 'two')), 'Lakshmi',
  'bill takes the saved name');
select is((select (r->>'total')::numeric from bill where k = 'two'), 450::numeric, 'flat ₹50 off');
select is((select count(*)::int from public.shop_sales where customer_id = (select id from public.shop_customers)), 2,
  'both bills linked to the customer');

select throws_like(format($$ select public.shop_create_sale(jsonb_build_object(
  'items', jsonb_build_array(jsonb_build_object('product_id', %L, 'qty', 1)))) $$, (select v from ids where k = 'a')),
  'Not enough stock of IB850G%', 'nothing left anywhere');
select throws_ok($$ select public.shop_create_sale('{"discount_type":"percent","discount_value":101,"items":[{"product_id":"00000000-0000-0000-0000-000000000000"}]}') $$,
  'Discount cannot be more than 100%.', 'percent over 100 refused');
select throws_ok($$ select public.shop_create_sale('{"customer_phone":"12","items":[{"product_id":"00000000-0000-0000-0000-000000000000"}]}') $$,
  'The phone number does not look right.', 'short phone refused');

-- Cancel puts each piece back where it came from
select lives_ok(format($$ select public.shop_cancel_sale(%L) $$, (select (r->>'id')::uuid from bill where k = 'one')), 'cancel bill');
select is((select qty from public.shop_stock where product_id = (select v from ids where k = 'a')
            and location_id = '30000000-0000-0000-0000-000000000002'), 3, 'Bangalore back to 3');
select is((select qty from public.shop_stock where product_id = (select v from ids where k = 'a')
            and location_id = '30000000-0000-0000-0000-000000000001'), 1, 'Hyderabad back to 1 (the other bill took 1)');

-- A customer of the website sees no shop customers
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.shop_customers), 0, 'website customer cannot read shop customers');
reset role;

select * from finish();
rollback;
