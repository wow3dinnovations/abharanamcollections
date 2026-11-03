begin;
select plan(28);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'cust@test.local');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Admin sets things up ----------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
insert into public.categories (id, name, code) values ('10000000-0000-0000-0000-000000000001', 'Earrings', 'ER');
insert into public.shop_vendors (id, name) values ('20000000-0000-0000-0000-000000000001', 'Ravi'),
                                                  ('20000000-0000-0000-0000-000000000002', 'Sita');
insert into public.shop_locations (id, name) values ('30000000-0000-0000-0000-000000000001', 'Hyderabad'),
                                                    ('30000000-0000-0000-0000-000000000002', 'Bangalore');

select is(public.shop_next_code('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
                                '30000000-0000-0000-0000-000000000002')->>'sku', 'ABH-ER-000001',
  'first code in a new category');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids values ('a', public.shop_save_product(jsonb_build_object(
  'sku', 'ib4501', 'name', 'Jhumka', 'category_id', '10000000-0000-0000-0000-000000000001',
  'vendor_id', '20000000-0000-0000-0000-000000000001', 'location_id', '30000000-0000-0000-0000-000000000002',
  'purchase_rate', 250, 'multiplier', 2, 'price', 500, 'opening_qty', 3)));
select is((select sku from public.products where id = (select v from ids where k = 'a')), 'IB4501', 'code saved in capitals');
select is((select stock_qty from public.products where id = (select v from ids where k = 'a')), 3, 'website stock = opening stock');
select is((select barcode from public.shop_products where product_id = (select v from ids where k = 'a')), '100000', 'first barcode');

select is(public.shop_next_code('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
                                '30000000-0000-0000-0000-000000000002')->>'sku', 'IB4502', 'next code follows the last one');
select is(public.shop_next_code('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
                                '30000000-0000-0000-0000-000000000002')->>'match', 'category_location',
  'other vendor falls back to category + location');
select is(public.shop_next_code('10000000-0000-0000-0000-000000000001', null,
                                '30000000-0000-0000-0000-000000000001')->>'sku', 'ABH-ER-000001',
  'other location starts its own series');
select is(public.shop_bump_code('IH615-LOT009'), 'IH615-LOT010', 'keeps leading zeros');
select is(public.shop_bump_code('IB99'), 'IB100', 'grows when needed');

select throws_ok($$ select public.shop_save_product('{"sku":"IB4501","name":"X","price":1}') $$,
  'Product code IB4501 is already used.', 'duplicate code refused');
select throws_ok($$ select public.shop_save_product('{"sku":"IB9","name":"X","price":1,"opening_qty":2}') $$,
  'Choose the location for the opening stock.', 'stock needs a location');

-- Stock and sales
select is(public.shop_set_stock((select v from ids where k = 'a'), '30000000-0000-0000-0000-000000000001', 2, 'count'), 2,
  'set stock at second location');
select is((select stock_qty from public.products where id = (select v from ids where k = 'a')), 5, 'total over locations');

create temp table bill (r jsonb);
grant all on bill to authenticated;
insert into bill select public.shop_create_sale(jsonb_build_object(
  'location_id', '30000000-0000-0000-0000-000000000002', 'discount', 50,
  'items', jsonb_build_array(jsonb_build_object('product_id', (select v from ids where k = 'a'), 'qty', 2, 'price', 500))));
select matches((select r->>'number' from bill), '^INV-\d{5}$', 'bill number');
select is((select (r->>'total')::numeric from bill), 950::numeric, 'bill total after discount');
select is((select qty from public.shop_stock where product_id = (select v from ids where k = 'a')
            and location_id = '30000000-0000-0000-0000-000000000002'), 1, 'stock reduced at that location');
select throws_like(format($$ select public.shop_create_sale(jsonb_build_object(
  'location_id', '30000000-0000-0000-0000-000000000002',
  'items', jsonb_build_array(jsonb_build_object('product_id', %L, 'qty', 5)))) $$, (select v from ids where k = 'a')),
  'Not enough stock of IB4501%', 'cannot sell more than in stock');
select lives_ok(format($$ select public.shop_cancel_sale(%L) $$, (select (r->>'id')::uuid from bill)), 'cancel bill');
select is((select stock_qty from public.products where id = (select v from ids where k = 'a')), 5, 'cancel puts stock back');

-- Import (twice: the second time updates, does not double)
select is((public.shop_import($j${
  "categories":[{"id":"CAT-0009","name":"Bangles","code":"BG","active":true}],
  "vendors":[{"id":"VEN-0001","name":"Lakshmi","active":true}],
  "locations":[{"id":"LOC-0001","name":"Hyderabad","active":true}],
  "products":[{"id":"PRD-000001","sku":"IB21041","barcode":"100000","name":"Bangle","category_id":"CAT-0009",
    "vendor_id":"VEN-0001","purchase_location_id":"LOC-0002","purchase_rate":270,"selling_price":540,
    "stock":{"LOC-0002":1,"LOC-0001":2},"status":"active","date_added":"2026-09-19T15:40:23"},
   {"id":"PRD-000002","sku":"OLD1","name":"Gone","status":"deleted"}]}$j$::jsonb))->>'products', '1',
  'import adds products, skips deleted');
select lives_ok($$ select public.shop_import('{"products":[{"id":"PRD-000001","sku":"IB21041","name":"Bangle",
  "selling_price":600,"stock":{"LOC-0001":4},"status":"active"}]}') $$, 'import again');
select is((select price from public.products where local_id = 'PRD-000001'), 600::numeric, 'import updates price');
select is((select stock_qty from public.products where local_id = 'PRD-000001'), 4, 'import replaces stock');
select is((select name from public.shop_locations where local_id = 'LOC-0002'), 'LOC-0002', 'unknown location gets a placeholder');
select isnt((select barcode from public.shop_products sp join public.products p on p.id = sp.product_id
              where p.local_id = 'PRD-000001'), '100000', 'barcode already used is not copied');

-- A customer sees and does nothing --------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select is((select count(*)::int from public.shop_products) + (select count(*)::int from public.shop_vendors)
          + (select count(*)::int from public.shop_sales) + (select count(*)::int from public.shop_stock), 0,
  'customer cannot read shop data');
select throws_ok($$ select public.shop_next_barcode() $$, '42501', null, 'customer cannot use shop functions');
reset role;

set local role anon;
select throws_ok($$ select count(*) from public.shop_products $$, '42501', null, 'visitor cannot even open shop tables');
reset role;

select * from finish();
rollback;
