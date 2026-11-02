import { describe, expect, it } from "vitest";
import {
  addToBag, bagTotal, discountPercent, enquiryMessage, filtersToParams, normaliseIndianMobile,
  parseFilters, rupees, searchTerms, setQuantity, whatsappLink, MAX_QTY,
} from "./index";

describe("rupees", () => {
  it("uses Indian grouping and hides .00", () => {
    expect(rupees(129999)).toBe("₹1,29,999");
    expect(rupees(799.5)).toBe("₹799.50");
    expect(rupees("250")).toBe("₹250");
  });
});

describe("discountPercent", () => {
  it("only shows a real saving", () => {
    expect(discountPercent(700, 1000)).toBe(30);
    expect(discountPercent(1000, 1000)).toBeNull();
    expect(discountPercent(1000, null)).toBeNull();
    expect(discountPercent(1000, 900)).toBeNull();
  });
});

describe("normaliseIndianMobile", () => {
  it("accepts common ways of writing a number", () => {
    expect(normaliseIndianMobile("98765 43210")).toBe("+919876543210");
    expect(normaliseIndianMobile("+91-9876543210")).toBe("+919876543210");
    expect(normaliseIndianMobile("09876543210")).toBe("+919876543210");
  });
  it("rejects bad numbers", () => {
    expect(normaliseIndianMobile("12345")).toBeNull();
    expect(normaliseIndianMobile("5876543210")).toBeNull();
  });
});

describe("filters", () => {
  it("ignores unknown values and round-trips", () => {
    const f = parseFilters({ q: " jhumka ", sort: "evil", price: "nope", page: "-3", category: "earrings", instock: "1" });
    expect(f).toMatchObject({ q: "jhumka", sort: "new", price: undefined, page: 1, category: "earrings", inStock: true });
    expect(filtersToParams(f)).toEqual({ q: "jhumka", category: "earrings", instock: "1" });
    expect(filtersToParams(parseFilters({ sort: "price_asc", page: "2", price: "u500" }))).toEqual({
      sort: "price_asc", page: "2", price: "u500",
    });
  });
  it("builds safe prefix search terms", () => {
    expect(searchTerms("Gold  Jhumka!")).toBe("gold:* & jhumka:*");
    expect(searchTerms("  '&|  ")).toBeNull();
  });
});

describe("enquiry bag", () => {
  const a = { productId: "a", sku: "ABH-ER-1", name: "Jhumka", price: 499, quantity: 1 };
  it("merges lines and caps quantity", () => {
    let bag = addToBag([], a);
    bag = addToBag(bag, { ...a, quantity: 2 });
    expect(bag).toHaveLength(1);
    expect(bag[0]!.quantity).toBe(3);
    bag = setQuantity(bag, "a", 999);
    expect(bag[0]!.quantity).toBe(MAX_QTY);
    expect(setQuantity(bag, "a", 0)).toHaveLength(0);
  });
  it("totals and builds a WhatsApp message", () => {
    const bag = [a, { ...a, productId: "b", sku: "ABH-CH-2", name: "Chain", price: 1200, quantity: 2 }];
    expect(bagTotal(bag)).toEqual({ count: 3, total: 2899 });
    const msg = enquiryMessage({ lines: bag, number: "ENQ-1001", name: "Lakshmi", city: "Nandyal" });
    expect(msg).toContain("ENQ-1001");
    expect(msg).toContain("Chain (ABH-CH-2) x2 – ₹2,400");
    expect(msg).toContain("Total: ₹2,899");
    expect(whatsappLink("+91 99999 99999", "hi there")).toBe("https://wa.me/919999999999?text=hi%20there");
    expect(whatsappLink("", "x")).toBeNull();
  });
});
