import { PRICE_BANDS, SORTS, type PriceBandKey, type SortKey } from "@abh/core";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { ProductCard } from "@/components/ProductCard";
import { Button, Chip, Empty } from "@/components/ui";
import { getCategories, getSettings, listProducts, type CardItem } from "@/lib/catalog";
import { ui } from "@/lib/theme";
import { useLoad } from "@/lib/useLoad";

export default function Shop() {
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const [q, setQ] = useState(params.q ?? "");
  const [search, setSearch] = useState(params.q ?? "");
  const [category, setCategory] = useState<string | undefined>(params.category || undefined);
  const [price, setPrice] = useState<PriceBandKey | undefined>();
  const [sort, setSort] = useState<SortKey>("new");
  const [inStock, setInStock] = useState(false);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CardItem[]>([]);
  const { width } = useWindowDimensions();
  const columns = width >= 700 ? 3 : 2;

  // Opening the tab from a category or search on the home screen.
  useEffect(() => {
    if (params.category !== undefined) setCategory(params.category || undefined);
    if (params.q !== undefined) {
      setQ(params.q);
      setSearch(params.q);
    }
  }, [params.category, params.q]);

  const meta = useLoad(async () => ({ categories: await getCategories(), settings: await getSettings() }));
  const result = useLoad(async () => {
    const r = await listProducts({ q: search, category, price, sort, inStock, page });
    setItems((prev) => (page === 1 ? r.items : [...prev, ...r.items.filter((p) => !prev.some((x) => x.id === p.id))]));
    return r;
  }, [search, category, price, sort, inStock, page]);

  const change = (fn: () => void) => {
    setPage(1);
    fn();
  };
  const showPrice = meta.data?.settings?.show_prices ?? true;

  const header = (
    <View style={{ gap: 10, paddingBottom: 6 }}>
      <TextInput
        style={ui.input}
        placeholder="Search designs or design no."
        value={q}
        onChangeText={setQ}
        onSubmitEditing={() => change(() => setSearch(q.trim()))}
        returnKeyType="search"
        accessibilityLabel="Search designs"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.row}>
        <Chip label="All" active={!category} onPress={() => change(() => setCategory(undefined))} />
        {meta.data?.categories.map((c) => (
          <Chip key={c.id} label={c.name ?? ""} active={category === c.slug} onPress={() => change(() => setCategory(c.slug ?? undefined))} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.row}>
        <Chip label="In stock" active={inStock} onPress={() => change(() => setInStock(!inStock))} />
        {PRICE_BANDS.map((b) => (
          <Chip key={b.key} label={b.label} active={price === b.key} onPress={() => change(() => setPrice(price === b.key ? undefined : b.key))} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ui.row}>
        {(Object.keys(SORTS) as SortKey[]).map((k) => (
          <Chip key={k} label={SORTS[k]} active={sort === k} onPress={() => change(() => setSort(k))} />
        ))}
      </ScrollView>
      <Text style={ui.muted}>{result.data ? `${result.data.total} designs` : " "}</Text>
      {result.error && <Text style={ui.error}>{result.error}</Text>}
    </View>
  );

  return (
    <FlatList
      key={columns}
      style={ui.screen}
      contentContainerStyle={ui.content}
      columnWrapperStyle={{ gap: 12 }}
      numColumns={columns}
      data={items}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => <ProductCard p={item} showPrice={showPrice} />}
      ListEmptyComponent={result.loading ? null : <Empty title="No designs match" hint="Try fewer filters." />}
      ListFooterComponent={
        result.data && items.length < result.data.total ? (
          <Button title="Load more" variant="outline" loading={result.loading} onPress={() => setPage((p) => p + 1)} />
        ) : null
      }
      onRefresh={() => (page === 1 ? result.reload() : setPage(1))}
      refreshing={result.loading && page === 1}
    />
  );
}
