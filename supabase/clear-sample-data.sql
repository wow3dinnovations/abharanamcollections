-- Removes the sample jewellery that `pnpm db:start` / `pnpm db:reset` adds, so you can test with
-- your real products from the shop software. Paste into Supabase Studio -> SQL Editor -> Run.
delete from public.enquiry_items where product_id in (select id from public.products where local_id like 'DEMO-%');
delete from public.products where local_id like 'DEMO-%';
delete from public.categories where local_id like 'DEMO-%';
update public.store_settings set announcement = '' where id = 1;
