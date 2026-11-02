"""The JSON storage engine: atomic writes, multi-file transactions, corruption and crash recovery."""
from __future__ import annotations

import json

import pytest

from app.core.errors import DataCorrupted, StorageError, ValidationFailed
from app.storage.json_store import JOURNAL_NAME, JsonStore
from app.storage.registry import SPECS


def open_store(path):
    return JsonStore(path, SPECS).open()


def cat(i, name="Earrings", code="EAR"):
    return {"id": i, "name": name, "code": code, "active": True}


def test_creates_missing_files_with_valid_schema(tmp_path):
    store = open_store(tmp_path)
    assert (tmp_path / "products.json").exists()
    raw = json.loads((tmp_path / "products.json").read_text(encoding="utf-8"))
    assert raw["records"] == [] and raw["schema_version"] == 1
    assert store.status()["products"].state == "ok"          # a brand-new install is normal, not a warning
    store.close()


def test_one_missing_file_is_reported_and_recreated(tmp_path):
    store = open_store(tmp_path)
    with store.transaction() as tx:
        tx.insert("categories", cat("CAT-0001"))
    store.close()
    (tmp_path / "vendors.json").unlink()
    store = open_store(tmp_path)
    assert store.status()["vendors"].state == "created" and store.status()["categories"].state == "ok"
    assert (tmp_path / "vendors.json").exists() and store.get("categories", "CAT-0001") is not None
    store.close()


def test_no_sql_database_files_created(tmp_path):
    open_store(tmp_path).close()
    assert not list(tmp_path.glob("*.db")) and not list(tmp_path.glob("*.sqlite*"))


def test_write_and_reload(tmp_path):
    store = open_store(tmp_path)
    with store.transaction() as tx:
        tx.insert("categories", cat("CAT-0001"))
    store.close()
    store2 = open_store(tmp_path)
    assert store2.get("categories", "CAT-0001")["name"] == "Earrings"
    assert store2.status()["categories"].revision == 1
    store2.close()


def test_exception_inside_transaction_saves_nothing(tmp_path):
    store = open_store(tmp_path)
    with pytest.raises(RuntimeError):
        with store.transaction() as tx:
            tx.insert("categories", cat("CAT-0001"))
            raise RuntimeError("boom")
    assert store.all("categories") == []
    assert json.loads((tmp_path / "categories.json").read_text(encoding="utf-8"))["records"] == []
    store.close()


def test_invalid_record_is_rejected_and_nothing_saved(tmp_path):
    store = open_store(tmp_path)
    with pytest.raises(ValidationFailed):
        with store.transaction() as tx:
            tx.insert("categories", cat("CAT-0001"))
            tx.insert("categories", {"id": "CAT-0002", "name": "", "code": "X"})
    assert store.all("categories") == []
    store.close()


def test_readers_never_see_uncommitted_changes(tmp_path):
    store = open_store(tmp_path)
    with store.transaction() as tx:
        tx.insert("categories", cat("CAT-0001"))
        assert store.all("categories") == []            # not committed yet
        assert tx.get("categories", "CAT-0001") is not None
    assert len(store.all("categories")) == 1
    store.close()


def test_multi_file_failure_rolls_back_every_file(tmp_path):
    store = open_store(tmp_path)
    with store.transaction() as tx:
        tx.insert("categories", cat("CAT-0001"))
    before_cat = (tmp_path / "categories.json").read_text(encoding="utf-8")

    def crash(stage, name):
        if name == "vendors":            # fail half way through swapping files
            raise OSError("disk error")

    store._fault_hook = crash
    with pytest.raises(StorageError):
        with store.transaction() as tx:
            tx.update("categories", "CAT-0001", name="Changed")
            tx.insert("vendors", {"id": "VEN-0001", "name": "V", "active": True})
    store._fault_hook = None
    assert (tmp_path / "categories.json").read_text(encoding="utf-8") == before_cat
    assert store.get("categories", "CAT-0001")["name"] == "Earrings"
    assert store.all("vendors") == []
    assert not list(tmp_path.glob("*.tmp")) and not list(tmp_path.glob("*.pre-txn"))
    assert not (tmp_path / JOURNAL_NAME).exists()
    store.close()


def test_corrupted_file_is_flagged_not_overwritten(tmp_path):
    store = open_store(tmp_path)
    with store.transaction() as tx:
        tx.insert("categories", cat("CAT-0001"))
    store.close()
    (tmp_path / "products.json").write_text("{ this is not json", encoding="utf-8")
    store = open_store(tmp_path)
    assert store.status()["products"].state == "corrupted"
    with pytest.raises(DataCorrupted) as e:
        store.all("products")
    assert "products.json appears to be corrupted" in e.value.message
    # the rest of the app still works
    assert store.get("categories", "CAT-0001") is not None
    # and we refuse to overwrite the damaged file
    with pytest.raises(DataCorrupted):
        with store.transaction() as tx:
            tx.get("products", "x")
    assert (tmp_path / "products.json").read_text(encoding="utf-8") == "{ this is not json"
    store.close()


def test_crash_during_swap_is_undone_on_next_start(tmp_path):
    store = open_store(tmp_path)
    with store.transaction() as tx:
        tx.insert("categories", cat("CAT-0001"))
    good = (tmp_path / "categories.json").read_text(encoding="utf-8")
    store.close()
    # simulate: power cut after categories.json was swapped but before the journal was cleared
    (tmp_path / "categories.json.pre-txn").write_text(good, encoding="utf-8")
    (tmp_path / "categories.json").write_text('{"schema_version":1,"revision":9,"records":[]}', encoding="utf-8")
    (tmp_path / JOURNAL_NAME).write_text(json.dumps({"state": "replacing", "files": [
        {"file": "categories.json", "existed": True}]}), encoding="utf-8")
    (tmp_path / "vendors.json.123.tmp").write_text("partial", encoding="utf-8")
    store = open_store(tmp_path)
    assert store.get("categories", "CAT-0001") is not None
    assert "stopped in the middle of saving" in store.recovered_from_crash
    assert not list(tmp_path.glob("*.tmp")) and not (tmp_path / JOURNAL_NAME).exists()
    store.close()


def test_second_copy_of_app_is_blocked(tmp_path):
    store = open_store(tmp_path)
    with pytest.raises(StorageError):
        open_store(tmp_path)
    store.close()


def test_counters_generate_unique_ids(tmp_path):
    store = open_store(tmp_path)
    with store.transaction() as tx:
        a, b = tx.next_id("PRD"), tx.next_id("PRD")
    assert (a, b) == ("PRD-000001", "PRD-000002")
    with store.transaction() as tx:
        assert tx.next_id("PRD") == "PRD-000003"
    store.close()


def test_delete_and_update_in_transaction(tmp_path):
    store = open_store(tmp_path)
    with store.transaction() as tx:
        tx.insert("categories", cat("CAT-0001"))
        tx.insert("categories", cat("CAT-0002", "Rings", "RIN"))
    with store.transaction() as tx:
        tx.delete("categories", "CAT-0001")
        tx.update("categories", "CAT-0002", name="Finger Rings")
    assert [c["name"] for c in store.all("categories")] == ["Finger Rings"]
    store.close()
