import json
import os
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from django.core.cache import cache
from django.db import DatabaseError, connection


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_BASE_URL = "https://pos.aaladipattiyan.in/pos"
SALES_ITEMS_PATH = "/api/integration/v1/sales/items"

ITEM_GROUPS = {
    "tea": {
        "label": "Tea",
        "codes": [
            "BDT",
            "EMP02-ET",
            "2693-KTM",
            "101-TKTM",
            "TLP001",
            "001MT-MT",
            "2686-MGT",
            "1.5Q",
            "2692-NTM",
            "102-TNTM",
            "2695-NTP",
            "2697-NTPC",
            "TSC222",
        ],
    },
    "coffee": {
        "label": "Coffee",
        "codes": [
            "BDC-01",
            "1QQ",
            "002-CSC",
            "CWH_01",
            "EMP01-EC",
            "2738-HKC",
            "2739-KC",
            "2678-KCM",
            "2681-KCP",
            "2683-KCPC",
            "2347-PC",
            "2699-SKC",
        ],
    },
    "milk": {
        "label": "Milk",
        "codes": [
            "BMM001",
            "BMM",
            "2688-KMM",
            "2685-KMPC",
            "2690-KMP",
            "2691-KSP",
            "2692-KSPP",
            "001RT-MP",
            "2689-NSMM",
        ],
    },
    "kadusu": {
        "label": "Kadusu Coffee & Tea",
        "codes": [
            "2687-BSC",
            "2692-KSPPC",
            "2679-KKCM",
            "2682-KKCP",
            "2684-KKCPC",
            "2694-KKTM",
            "2696-KKTP",
            "2698-KKTPC",
            "TL001",
            "2680-CSM",
            "SKP 001",
        ],
    },
    "biscuits": {
        "label": "Biscuits",
        "codes": [
            "2345-BB",
            "BIS",
            "2740-BP",
            "EMP03-BB",
        ],
    },
}

# Display fallbacks supplied by the billing team. POS quantities remain the
# source of truth; these values are used only when itemName is absent.
ITEM_NAMES = {
    "BMM001": "Badam Milk Parcel", "2345-BB": "Biscuit",
    "BIS": "Biscuit - 3Pcs", "2740-BP": "Biscuit Packet",
    "2687-BSC": "Black Sukku Coffee", "2692-KSPPC": "Black Sukku Coffee Parcel",
    "BDC-01": "Bus Driver Coffee", "BDT": "Bus Driver Tea",
    "1QQ": "Coffee Parcel with Cover 1.5", "002-CSC": "Coffee Snacks combo",
    "CWH_01": "Coffee with hugs", "EMP03-BB": "Employee Biscuit",
    "EMP01-EC": "Employee Coffee", "EMP02-ET": "Employee Tea",
    "2738-HKC": "Halwa Kaaram Coffee", "BMM": "Hot Badam Milk",
    "2739-KC": "Kaaram Coffee", "2678-KCM": "Karupatti Coffee Medium",
    "2681-KCP": "Karupatti Coffee Parcel Half Cup",
    "2683-KCPC": "Karupatti Coffee Parcel With Cover Half Cup",
    "2679-KKCM": "Karupatti Kadusu Coffee Medium",
    "2682-KKCP": "Karupatti Kadusu Coffee Parcel Half Cup",
    "2684-KKCPC": "Karupatti Kadusu Coffee Parcel With Cover Half Cup",
    "2694-KKTM": "Karupatti Kadusu Tea Medium",
    "2696-KKTP": "Karupatti Kadusu Tea Parcel Half Cup",
    "2698-KKTPC": "Karupatti Kadusu Tea Parcel With Cover Half Cup",
    "2688-KMM": "Karupatti Milk Medium", "2685-KMPC": "Karupatti Milk Parcel -WC",
    "2690-KMP": "Karupatti Milk Parcel -WTC", "2691-KSP": "Karupatti Sukku Paal",
    "2692-KSPP": "Karupatti Sukku Paal Parcel", "2693-KTM": "Karupatti Tea Medium",
    "101-TKTM": "KARUPATTI TEA MEDIUM", "TL001": "Lemon Tea",
    "TLP001": "Lemon Tea Parcel", "001MT-MT": "Masala Tea",
    "2686-MGT": "Medium Ginger Tea", "001RT-MP": "Milagu Paal",
    "1.5Q": "Nattusakkarai Tea parcel 1.5 cup",
    "2689-NSMM": "Nattusarkarai Milk Medium", "2692-NTM": "Nattusarkarai Tea Medium",
    "102-TNTM": "NATTUSARKARAI TEA MEDIUM",
    "2695-NTP": "Nattusarkarai Tea Parcel Half Cup",
    "2697-NTPC": "Nattusarkarai Tea Parcel With Cover Half Cup",
    "2347-PC": "Police Coffee", "2680-CSM": "Sukku Coffee Medium",
    "SKP 001": "Sukku Coffee Parcel Half Cup", "2699-SKC": "Sweet Kaaram Coffee",
    "TSC222": "Tea Sacks Combo",
}


def _quantity(value):
    """Preserve decimal POS quantities instead of truncating them to integers."""
    try:
        return Decimal(str(value or 0))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def _json_quantity(value):
    value = _quantity(value)
    return int(value) if value == value.to_integral_value() else float(value)


def _load_env_file():
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _today_ist():
    return datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()


def _unique_codes():
    seen = set()
    codes = []
    for group in ITEM_GROUPS.values():
        for code in group["codes"]:
            if code not in seen:
                seen.add(code)
                codes.append(code)
    return codes


def _code_groups():
    groups = {}
    for group in ITEM_GROUPS.values():
        for code in group["codes"]:
            groups[code] = group["label"]
    return groups


def _normalise_pos_items(api_items):
    """Build one catalog row per code and aggregate its POS sales rows."""
    code_groups = _code_groups()
    by_code = {}
    for raw_item in api_items:
        code = raw_item.get("itemCode")
        if code not in code_groups:
            continue
        if code not in by_code:
            by_code[code] = {
                **raw_item,
                "totalQty": _quantity(raw_item.get("totalQty")),
                "totalBills": int(raw_item.get("totalBills") or 0),
                "hadSalesToday": bool(raw_item.get("hadSalesToday")),
                "foundInPOS": raw_item.get("foundInPOS", True),
                "returnedByBilling": True,
            }
            continue
        item = by_code[code]
        item["totalQty"] += _quantity(raw_item.get("totalQty"))
        item["totalBills"] += int(raw_item.get("totalBills") or 0)
        item["hadSalesToday"] = item["hadSalesToday"] or bool(raw_item.get("hadSalesToday"))
        item["foundInPOS"] = item["foundInPOS"] or raw_item.get("foundInPOS", True)
        if not item.get("itemName") and raw_item.get("itemName"):
            item["itemName"] = raw_item["itemName"]

    items = []
    for code in _unique_codes():
        item = by_code.get(code, {
            "itemCode": code, "totalQty": 0, "totalBills": 0,
            # Many POS sales endpoints omit valid codes that had no sales.
            # The supplied catalog confirms these codes exist; absence is not
            # an error unless the API explicitly returns foundInPOS=false.
            "hadSalesToday": False, "foundInPOS": True,
            "returnedByBilling": False,
        })
        item["itemName"] = item.get("itemName") or ITEM_NAMES[code]
        item["localCategory"] = code_groups[code]
        item["totalQty"] = _json_quantity(item.get("totalQty"))
        items.append(item)
    return items


def _request_pos_sales(sales_date):
    _load_env_file()
    api_key = os.environ.get("POS_API_KEY")
    base_url = os.environ.get("POS_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    outlet = os.environ.get("OUTLET_CODE") or os.environ.get("POS_OUTLET") or "UPK"

    # Share one recent POS response between all browser/TV viewers. Without
    # this, every open dashboard consumes the external API quota separately.
    cache_key = f"pos-sales-items:{outlet}:{sales_date}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    if not api_key:
        raise RuntimeError("POS_API_KEY is missing in ai_dashboard_backend/.env")

    payload = {
        "outlet": outlet,
        "date": sales_date,
        "item_codes": _unique_codes(),
    }
    body = json.dumps(payload).encode("utf-8")
    request = Request(
        f"{base_url}{SALES_ITEMS_PATH}",
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
        },
    )

    try:
        with urlopen(request, timeout=12) as response:
            result = json.loads(response.read().decode("utf-8"))
            cache.set(cache_key, result, timeout=30)
            return result
    except HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"POS API returned {exc.code}: {message}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach POS API: {exc.reason}") from exc


def _camera_snapshot(sales_date, outlet):
    """Return the camera team's latest daily cumulative count and diagnostics.

    Each row is a snapshot of the camera service's cumulative counter. Summing
    rows would count the same cups repeatedly, so the latest row is the daily
    total used for reconciliation.
    """
    if not os.environ.get("DATABASE_URL"):
        return {
            "configured": False,
            "available": False,
            "latest": None,
            "message": "Camera database is not configured",
        }

    try:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                WITH day_rows AS (
                    SELECT *
                    FROM public.outlet_stats
                    WHERE outlet_code = %s
                      AND (ts AT TIME ZONE 'Asia/Kolkata')::date = %s::date
                ), latest AS (
                    SELECT * FROM day_rows ORDER BY ts DESC LIMIT 1
                )
                SELECT
                    latest.id, latest.ts, latest.outlet_code,
                    latest.cup_count, latest.staff_count,
                    latest.customer_count, latest.empty_count,
                    latest.inserted_at,
                    stats.sample_count, stats.first_capture,
                    stats.max_cups_visible, stats.max_staff,
                    stats.max_customers
                FROM latest
                CROSS JOIN (
                    SELECT COUNT(*) AS sample_count,
                           MIN(ts) AS first_capture,
                           MAX(COALESCE(cup_count, 0)) AS max_cups_visible,
                           MAX(COALESCE(staff_count, 0)) AS max_staff,
                           MAX(COALESCE(customer_count, 0)) AS max_customers
                    FROM day_rows
                ) stats
                """,
                [outlet, sales_date],
            )
            row = cursor.fetchone()
    except DatabaseError:
        return {
            "configured": True,
            "available": False,
            "latest": None,
            "message": "Camera data is temporarily unavailable",
        }

    if not row:
        return {
            "configured": True,
            "available": True,
            "latest": None,
            "message": "No camera snapshots for this date",
        }

    return {
        "configured": True,
        "available": True,
        "latest": {
            "id": row[0],
            "capturedAt": row[1].isoformat() if row[1] else None,
            "outletCode": row[2],
            "cupCount": int(row[3] or 0),
            "staffCount": int(row[4] or 0),
            "customerCount": int(row[5] or 0),
            "emptyCount": int(row[6] or 0),
            "insertedAt": row[7].isoformat() if row[7] else None,
        },
        "daily": {
            "sampleCount": int(row[8] or 0),
            "firstCapturedAt": row[9].isoformat() if row[9] else None,
            "maxCupsVisible": int(row[10] or 0),
            "maxStaff": int(row[11] or 0),
            "maxCustomers": int(row[12] or 0),
        },
        "message": None,
        "countingMode": "daily_cumulative",
    }


def _reconcile_counts(billed_drinks, camera):
    """Compare like-for-like daily totals and expose every mismatch."""
    camera_total = (
        camera.get("latest", {}).get("cupCount") if camera.get("latest") else None
    )
    counting_mode = camera.get("countingMode")

    if camera_total is None:
        return {
            "billedDrinkQty": billed_drinks,
            "cameraCupTotal": None,
            "difference": None,
            "absoluteDifference": None,
            "differenceDirection": None,
            "matchRate": None,
            "isComparable": False,
            "status": "waiting_for_camera",
            "message": camera.get("message") or "Waiting for the AI camera daily count.",
        }

    if counting_mode != "daily_cumulative":
        return {
            "billedDrinkQty": billed_drinks,
            "cameraCupTotal": camera_total,
            "difference": None,
            "absoluteDifference": None,
            "differenceDirection": None,
            "matchRate": None,
            "isComparable": False,
            "status": "not_comparable",
            "message": "The camera value is not a daily cumulative count, so it cannot be compared with daily billing.",
        }

    difference = camera_total - billed_drinks
    larger = max(camera_total, billed_drinks)
    match_rate = round(min(camera_total, billed_drinks) / larger * 100, 2) if larger else 100.0
    direction = "equal" if difference == 0 else "camera_over" if difference > 0 else "camera_under"

    return {
        "billedDrinkQty": billed_drinks,
        "cameraCupTotal": camera_total,
        "difference": _json_quantity(difference),
        "absoluteDifference": _json_quantity(abs(difference)),
        "differenceDirection": direction,
        "matchRate": match_rate,
        "isComparable": True,
        "status": "matched" if difference == 0 else "not_matched",
        "message": (
            "Billing and AI camera daily cup counts match exactly."
            if difference == 0
            else "Billing and AI camera daily cup counts do not match."
        ),
    }


def get_dashboard_snapshot(sales_date=None):
    sales_date = sales_date or _today_ist()
    data = _request_pos_sales(sales_date)
    items = _normalise_pos_items(data.get("items", []))

    by_code = {item.get("itemCode"): item for item in items}

    groups = []
    for key, group in ITEM_GROUPS.items():
        group_items = [by_code[code] for code in group["codes"] if code in by_code]
        groups.append(
            {
                "key": key,
                "label": group["label"],
                "totalQty": _json_quantity(
                    sum((_quantity(item.get("totalQty")) for item in group_items), Decimal("0"))
                ),
                "totalBills": sum(int(item.get("totalBills") or 0) for item in group_items),
                "itemCount": len(group["codes"]),
                "soldItems": [
                    item
                    for item in group_items
                    if _quantity(item.get("totalQty")) > 0 or item.get("hadSalesToday")
                ],
            }
        )

    outlet_code = (
        data.get("outlet", {}).get("code")
        or os.environ.get("OUTLET_CODE")
        or "UPK"
    )

    camera = _camera_snapshot(sales_date, outlet_code)
    billed_drinks = sum(
        group["totalQty"] for group in groups if group["key"] != "biscuits"
    )

    return {
        "date": data.get("date", sales_date),
        "outlet": data.get("outlet", {}),
        "summary": data.get("summary", {"totalBills": 0}),
        "groups": groups,
        "items": items,
        "camera": camera,
        "reconciliation": _reconcile_counts(billed_drinks, camera),
        "meta": {
            "source": "Aaladipattiyan POS",
            "itemCodesRequested": len(_unique_codes()),
            "lastUpdated": datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(),
        },
    }


def get_camera_dashboard_snapshot(sales_date=None):
    """Camera-only payload that does not depend on the POS service."""
    _load_env_file()
    sales_date = sales_date or _today_ist()
    outlet_code = os.environ.get("OUTLET_CODE") or "UPK"
    return {
        "date": sales_date,
        "outlet": {"code": outlet_code},
        "camera": _camera_snapshot(sales_date, outlet_code),
        "meta": {
            "source": "Neon AI camera database",
            "lastUpdated": datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(),
        },
    }
