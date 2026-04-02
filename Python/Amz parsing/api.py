# api.py
from fastapi import FastAPI
from schemas import (
    OOSPayload,
    UpdateItemPayload,
    ReportResultPayload,
    LogPayload,
    SaveSourcePayload,  # ✅ NEW
    UpdateWeightPayload, ReleaseItemPayload
)

from get_item import get_and_lock_item
from items_update import (
    update_item_available,
    report_result,
    mark_oos_no_price,
    get_rates_from_db,
    log_event, update_item_weight, release_item
)

import os
import re
from pathlib import Path

app = FastAPI()

DUMP_DIR = os.getenv("AMZ_HTML_DUMP_DIR", "./amz_html_dump")


def _safe_asin(asin: str) -> str:
    a = (asin or "").strip().upper()
    a = re.sub(r"[^A-Z0-9]", "", a)
    return a[:32] if a else "UNKNOWN"


def _atomic_write_text(path: Path, content: str, encoding="utf-8") -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding=encoding, errors="ignore")
    tmp.replace(path) 
    return path.stat().st_size

@app.post("/release-item")
def release_item_api(payload: ReleaseItemPayload):
    rows = release_item(payload.id)
    return {"status": "ok", "updated": rows}

@app.post("/update-weight")
def update_weight(payload: UpdateWeightPayload):
    rows = update_item_weight(payload.id, payload.weight_kg)

    log_event(
        "items_price_check_ex",
        "weight_updated",
        "INFO",
        {"id": payload.id, "weight_kg": payload.weight_kg}
    )

    return {"status": "ok", "updated": rows}

@app.post("/save-source")
def save_source(payload: SaveSourcePayload):
    asin = _safe_asin(payload.asin)
    out_path = Path(DUMP_DIR) / f"{asin}.html"

    size = _atomic_write_text(out_path, payload.html)

    log_event(
        module="tampermonkey",
        action="save_source",
        level="info",
        data={
            "asin": asin,
            "url": payload.url,
            "platform": payload.platform,
            "path": str(out_path),
            "bytes": size
        }
    )

    return {"status": "ok", "asin": asin, "path": str(out_path), "bytes": size}


@app.post("/report-oos-no-price")
def report_oos_no_price(payload: OOSPayload):
    rows = mark_oos_no_price(payload.id)
    return {"status": "ok", "updated": rows}


@app.post("/update-item")
def update_item(payload: UpdateItemPayload):
    rows = update_item_available(
        item_id=payload.id,
        available=payload.available
    )
    return {"status": "ok", "updated": rows}


@app.get("/get-next-item")
def get_next_item():
    print(">>> /get-next-item called")
    item = get_and_lock_item()
    if not item:
        print(">>> EMPTY")
        return {"status": "empty"}
    print(f">>> RETURN ID {item['id']} updated_at={item['updated_at']}")
    return {"status": "ok", "item": item}


@app.post("/report-result")
def report_result_api(payload: ReportResultPayload):
    return report_result(payload)


@app.get("/get-rates")
def get_rates():
    rates = get_rates_from_db()
    return {
        "usd": rates["usd"],
        "eur": rates["eur"],
        "gbp": rates["gbp"]
    }


@app.post("/log")
def api_log(payload: LogPayload):
    log_event(
        payload.module,
        payload.event,
        payload.level,
        payload.data
    )
    return {"status": "ok"}