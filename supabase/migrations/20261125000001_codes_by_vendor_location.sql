-- Product codes run in one series per vendor + location, whatever the category.
--
-- Before: for a vendor without a code number, the next code followed the last product of the same
-- category + vendor + location, so every category had its own series (Earrings IB4501, IB4502; Necklaces IB4501…).
-- Now: the next code follows the last product of the same vendor + location in any category, so Earrings IB4501 is
-- followed by a Necklace IB4502. A vendor's first product still follows the category + location (as before), and a
-- new category with nothing to follow still starts at ABH-<code>-000001.
-- (Vendors with a code number use the IB850G scheme, which already counts per vendor for every category.)

create or replace function public.shop_next_code(p_category uuid, p_vendor uuid default null, p_location uuid default null)
returns jsonb
language plpgsql
stable
as $$
declare
  last_sku text;
  how text := 'vendor_location';
  candidate text;
  cat_code text;
  i int := 0;
begin
  perform public.shop_require_admin();
  if p_category is null and p_vendor is null then
    return jsonb_build_object('sku', '', 'based_on', '', 'match', '');
  end if;
  if p_vendor is not null then
    -- Same vendor + location, any category.
    select p.sku into last_sku
      from public.products p join public.shop_products sp on sp.product_id = p.id
     where sp.vendor_id = p_vendor and sp.location_id is not distinct from p_location
     order by p.added_at desc, p.created_at desc limit 1;
  elsif p_category is not null then
    -- No vendor chosen: same category + location among products without a vendor (as before).
    how := 'category_vendor_location';
    select p.sku into last_sku
      from public.products p join public.shop_products sp on sp.product_id = p.id
     where p.category_id = p_category and sp.location_id is not distinct from p_location and sp.vendor_id is null
     order by p.added_at desc, p.created_at desc limit 1;
  end if;
  if last_sku is null and p_category is not null then
    how := 'category_location';
    select p.sku into last_sku
      from public.products p left join public.shop_products sp on sp.product_id = p.id
     where p.category_id = p_category and sp.location_id is not distinct from p_location
     order by p.added_at desc, p.created_at desc limit 1;
  end if;
  if last_sku is null then
    if p_category is null then
      return jsonb_build_object('sku', '', 'based_on', '', 'match', '');
    end if;
    how := 'new';
    select upper(coalesce(nullif(code, ''), left(regexp_replace(name, '[^A-Za-z]', '', 'g'), 3)))
      into cat_code from public.categories where id = p_category;
    candidate := 'ABH-' || coalesce(nullif(cat_code, ''), 'GEN') || '-000000';
  else
    candidate := last_sku;
  end if;
  loop
    candidate := public.shop_bump_code(candidate);
    exit when not exists (select 1 from public.products where upper(sku) = upper(candidate));
    i := i + 1;
    if i > 10000 then
      return jsonb_build_object('sku', '', 'based_on', coalesce(last_sku, ''), 'match', how);
    end if;
  end loop;
  return jsonb_build_object('sku', candidate, 'based_on', coalesce(last_sku, ''), 'match', how);
end;
$$;

-- Finds the last product of a vendor + location quickly.
create index if not exists shop_products_vendor_location on public.shop_products (vendor_id, location_id);

revoke all on function public.shop_next_code(uuid, uuid, uuid) from public, anon;
grant execute on function public.shop_next_code(uuid, uuid, uuid) to authenticated;
