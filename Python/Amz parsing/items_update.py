# items_update.py
import json
import pymysql
from db import get_connection
from schemas import ReportResultPayload

SQL_RELEASE_ITEM = """
UPDATE items
SET work = 0,
    updated_at = NOW()
WHERE id = %s
LIMIT 1
"""

SQL_UPDATE_WEIGHT = """
UPDATE items
SET weight_kg = %s
WHERE id = %s
LIMIT 1
"""

SQL_UPDATE_AVAILABLE = """
UPDATE items
SET available = %s,
    work = 0,
    updated_at = NOW()
WHERE id = %s
"""

SQL_OOS_NO_PRICE = """
UPDATE items
SET available = 0,
    quantity = 0,
    work = 0,
    updated_at = NOW()
WHERE id = %s
"""


def _safe_int(v, default: int | None = None) -> int | None:
    try:
        if v is None:
            return default
        return int(v)
    except Exception:
        return default


def _safe_float(v, default: float | None = None) -> float | None:
    try:
        if v is None:
            return default
        return float(v)
    except Exception:
        return default


def _safe_str(v, default: str | None = None) -> str | None:
    try:
        if v is None:
            return default
        return str(v)
    except Exception:
        return default


def _fneq(a, b, eps: float = 0.01) -> bool:
    """Float not equal with epsilon."""
    try:
        return abs(float(a) - float(b)) > eps
    except Exception:
        return True


def release_item(item_id: int) -> int:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(SQL_RELEASE_ITEM, (item_id,))
            conn.commit()
            return cur.rowcount
    finally:
        conn.close()


def update_item_weight(item_id: int, weight_kg: float) -> int:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(SQL_UPDATE_WEIGHT, (_safe_float(weight_kg, 0.0), item_id))
            conn.commit()
            return cur.rowcount
    finally:
        conn.close()


def log_event(module: str, action: str, level: str, data: dict):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO logs
                    (module, action, level, message, context, created_at)
                VALUES
                    (%s, %s, %s, %s, %s, NOW())
            """, (
                module,
                action,
                level,
                '',
                json.dumps(data, ensure_ascii=False)
            ))
            conn.commit()
    finally:
        conn.close()


def mark_oos_no_price(item_id: int) -> int:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(SQL_OOS_NO_PRICE, (item_id,))
            conn.commit()
            return cur.rowcount
    finally:
        conn.close()


def update_item_available(item_id: int, available: int) -> int:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(SQL_UPDATE_AVAILABLE, (_safe_int(available, 0), item_id))
            conn.commit()
            return cur.rowcount
    finally:
        conn.close()


def report_result(payload: ReportResultPayload) -> dict:

    conn = get_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute("""
                SELECT
                    cost_source,
                    cost_now,
                    cost_now_uah,
                    shipping,
                    shipping_ua,
                    prime,
                    currency,
                    available,
                    quantity
                FROM items
                WHERE id = %s
                LIMIT 1
            """, (payload.id,))
            row = cur.fetchone()

            if not row:
                return {"status": "error", "msg": "item not found"}

            p_price       = _safe_float(getattr(payload, "price", None), None)
            p_cost_now    = _safe_float(getattr(payload, "cost_now", None), None)
            p_cost_uah    = _safe_float(getattr(payload, "cost_now_uah", None), None)

            p_shipping    = _safe_float(getattr(payload, "shipping", None), None)

            p_shipping_ua = _safe_float(getattr(payload, "shipping_ua", None), None)
            if p_shipping_ua is None:
                p_shipping_ua = _safe_float(getattr(payload, "shippingUA", None), None)

            p_prime       = _safe_int(getattr(payload, "prime", None), None)
            p_currency    = _safe_str(getattr(payload, "currency", None), None)

            p_available   = _safe_int(getattr(payload, "available", None), None)
            p_quantity    = _safe_int(getattr(payload, "quantity", None), None)

            final_price       = p_price       if p_price       is not None else float(row.get("cost_source", 0) or 0)
            final_cost_now    = p_cost_now    if p_cost_now    is not None else float(row.get("cost_now", 0) or 0)
            final_cost_uah    = p_cost_uah    if p_cost_uah    is not None else float(row.get("cost_now_uah", 0) or 0)
            final_shipping    = p_shipping    if p_shipping    is not None else float(row.get("shipping", 0) or 0)
            final_shipping_ua = p_shipping_ua if p_shipping_ua is not None else float(row.get("shipping_ua", 0) or 0)
            final_prime       = p_prime       if p_prime       is not None else int(row.get("prime", 0) or 0)
            final_currency    = p_currency    if p_currency    is not None else str(row.get("currency", "") or "")

            final_available   = p_available   if p_available   is not None else int(row.get("available", 0) or 0)
            final_quantity    = p_quantity    if p_quantity    is not None else int(row.get("quantity", 0) or 0)

            changed = (
                _fneq(row.get("cost_source", 0), final_price) or
                _fneq(row.get("cost_now", 0), final_cost_now) or
                _fneq(row.get("cost_now_uah", 0), final_cost_uah) or
                _fneq(row.get("shipping", 0), final_shipping) or
                _fneq(row.get("shipping_ua", 0), final_shipping_ua) or
                int(row.get("prime", 0) or 0) != int(final_prime) or
                str(row.get("currency", "") or "") != str(final_currency) or
                int(row.get("available", 0) or 0) != int(final_available) or
                int(row.get("quantity", 0) or 0) != int(final_quantity)
            )

            if changed:
                cur.execute("""
                    UPDATE items SET
                        cost_source  = %s,
                        cost_now     = %s,
                        cost_now_uah = %s,
                        shipping     = %s,
                        shipping_ua  = %s,
                        prime        = %s,
                        currency     = %s,
                        available    = %s,
                        quantity     = %s,
                        work         = 0,
                        updated_at   = NOW()
                    WHERE id = %s
                    LIMIT 1
                """, (
                    final_price,
                    final_cost_now,
                    final_cost_uah,
                    final_shipping,
                    final_shipping_ua,
                    final_prime,
                    final_currency,
                    final_available,
                    final_quantity,
                    payload.id
                ))
                conn.commit()
                return {"status": "updated"}

            cur.execute("""
                UPDATE items
                SET work = 0, updated_at = NOW()
                WHERE id = %s
                LIMIT 1
            """, (payload.id,))
            conn.commit()
            return {"status": "same"}
    finally:
        conn.close()


def get_rates_from_db() -> dict:
    conn = get_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            cur.execute("""
                SELECT usd_uah_rate, eur_uah_rate, gbp_uah_rate
                FROM settings
                LIMIT 1
            """)
            row = cur.fetchone()

            if not row:
                return {"usd": 0, "eur": 0, "gbp": 0}

            return {
                "usd": float(row["usd_uah_rate"]),
                "eur": float(row["eur_uah_rate"]),
                "gbp": float(row["gbp_uah_rate"])
            }
    finally:
        conn.close()