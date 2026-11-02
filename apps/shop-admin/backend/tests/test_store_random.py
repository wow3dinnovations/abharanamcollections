"""Randomised proof that what is on disk always equals what is in memory - including the fast 'append' save path."""
from __future__ import annotations

import json
import random

from app.storage import json_store
from app.storage.json_store import JsonStore
from app.storage.registry import SPECS


def disk(path, name):
    return json.loads((path / f"{name}.json").read_text(encoding="utf-8"))["records"]


def test_disk_always_matches_memory_through_random_saves(tmp_path, monkeypatch):
    monkeypatch.setattr(json_store, "COMPACT_ABOVE", 5)          # exercise compact + append-only paths with small data
    rnd = random.Random(7)
    store = JsonStore(tmp_path, SPECS).open()
    n = 0
    for step in range(120):
        with store.transaction() as tx:
            kind = rnd.choice(["append", "append", "append", "mixed", "delete"])
            existing = [c["id"] for c in tx.iter_all("categories")]
            if kind in ("append", "mixed") or not existing:
                for _ in range(rnd.randint(1, 4)):
                    n += 1
                    tx.insert("categories", {"id": f"CAT-{n:04d}", "name": f"Cat \"{n}\" é ₹ {n}", "code": "ABC", "active": True})
            if kind == "mixed" and existing:
                tx.update("categories", rnd.choice(existing), name=f"renamed {step}")
            if kind == "delete" and existing:
                tx.delete("categories", rnd.choice(existing))
        assert disk(tmp_path, "categories") == store.all("categories"), f"disk differs from memory after step {step} ({kind})"
        assert {c["id"] for c in store.all("categories")} == set(store._index["categories"])
    store.close()
    again = JsonStore(tmp_path, SPECS).open()                        # a completely fresh start reads the same data
    assert again.all("categories") == disk(tmp_path, "categories")
    assert again.status()["categories"].state == "ok"
    again.close()


def test_append_path_keeps_revision_and_is_used_for_big_files(tmp_path, monkeypatch):
    monkeypatch.setattr(json_store, "COMPACT_ABOVE", 3)
    store = JsonStore(tmp_path, SPECS).open()
    for i in range(10):
        with store.transaction() as tx:
            tx.insert("categories", {"id": f"CAT-{i:04d}", "name": "n", "code": "ABC", "active": True})
    raw = (tmp_path / "categories.json").read_bytes()
    assert b'"records":[{' in raw and b"\n" not in raw                 # compact layout
    parsed = json.loads(raw)
    assert parsed["revision"] == 10 and len(parsed["records"]) == 10 and parsed["schema_version"] == 1
    store.close()
