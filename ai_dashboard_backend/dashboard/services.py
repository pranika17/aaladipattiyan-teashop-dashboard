import json
import os
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


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


def _load_env_file():
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ[key.strip()] = value.strip().strip('"').strip("'")


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


def _request_pos_sales(sales_date):
    _load_env_file()
    api_key = os.environ.get("POS_API_KEY")
    base_url = os.environ.get("POS_BASE_URL", DEFAULT_BASE_URL).rstrip("/")
    outlet = os.environ.get("OUTLET_CODE") or os.environ.get("POS_OUTLET") or "UPK"

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
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"POS API returned {exc.code}: {message}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not reach POS API: {exc.reason}") from exc


def get_dashboard_snapshot(sales_date=None):
    sales_date = sales_date or _today_ist()
    data = _request_pos_sales(sales_date)
    items = data.get("items", [])
    code_groups = _code_groups()
    for item in items:
        item["localCategory"] = code_groups.get(item.get("itemCode"))

    by_code = {item.get("itemCode"): item for item in items}

    groups = []
    for key, group in ITEM_GROUPS.items():
        group_items = [by_code[code] for code in group["codes"] if code in by_code]
        groups.append(
            {
                "key": key,
                "label": group["label"],
                "totalQty": sum(int(item.get("totalQty") or 0) for item in group_items),
                "totalBills": sum(int(item.get("totalBills") or 0) for item in group_items),
                "itemCount": len(group["codes"]),
                "soldItems": [
                    item
                    for item in group_items
                    if int(item.get("totalQty") or 0) > 0 or item.get("hadSalesToday")
                ],
            }
        )

    return {
        "date": data.get("date", sales_date),
        "outlet": data.get("outlet", {}),
        "summary": data.get("summary", {"totalBills": 0}),
        "groups": groups,
        "items": items,
        "meta": {
            "source": "Aaladipattiyan POS",
            "itemCodesRequested": len(_unique_codes()),
            "lastUpdated": datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(),
        },
    }
