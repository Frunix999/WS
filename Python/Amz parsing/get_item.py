# get_item.py
import json

import pymysql
from db import get_connection

SQL_SELECT = """
SELECT
    id,
    asin,
    source_url,
    source_platform,
    cost_source,
    profit,
    available,
    quantity,
    weight_kg,
    updated_at
FROM items
WHERE work = 0
ORDER BY updated_at ASC
LIMIT 1
"""

SQL_LOCK = """
UPDATE items
SET work = 1,
    work_dt = NOW()
WHERE id = %s
"""

def get_and_lock_item():
    conn = get_connection()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cur:
            print("\n=== SQL_SELECT ===")
            print(SQL_SELECT.strip())

            cur.execute(SQL_SELECT)
            item = cur.fetchone()

            print("=== RESULT ===")
            if item:
                print(json.dumps(item, ensure_ascii=False, indent=2, default=str))
            else:
                print("None")

            if not item:
                return None

            cur.execute(SQL_LOCK, (item["id"],))
            conn.commit()

            return item
    finally:
        conn.close()
