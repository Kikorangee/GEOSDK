import os
import json
import time
from typing import Any, Dict, Optional
from urllib.parse import urlencode
import httpx
from fastapi import FastAPI, Request, HTTPException

app = FastAPI(title="DM→Webfleet Middleware", version="1.0.0")

WEBFLEET_BASE = os.getenv("WEBFLEET_BASE", "https://csv.webfleet.com/extern")
WEBFLEET_ACCOUNT = os.getenv("WEBFLEET_ACCOUNT")
WEBFLEET_USERNAME = os.getenv("WEBFLEET_USERNAME")
WEBFLEET_PASSWORD = os.getenv("WEBFLEET_PASSWORD")  # URL-safe; encode once
WEBFLEET_APIKEY = os.getenv("WEBFLEET_APIKEY")
WEBFLEET_LANG = os.getenv("WEBFLEET_LANG", "en")

# Toggle which call to make (keep card-data by default)
WEBFLEET_ACTION_CARD = os.getenv("WEBFLEET_ACTION_CARD", "setExternalObjectData")
WEBFLEET_ACTION_POS = os.getenv("WEBFLEET_ACTION_POS", "setExternalObjectData")  # replace later if needed

# Device mapping: DM -> Webfleet objectno
# In prod: move this to a DB or config store.
DEVICE_MAP = {}
DEVICE_MAP_PATH = os.getenv("DEVICE_MAP_PATH", "./device_map.json")
if os.path.exists(DEVICE_MAP_PATH):
    with open(DEVICE_MAP_PATH, "r", encoding="utf-8") as f:
        DEVICE_MAP.update(json.load(f))


def get_objectno(dm_device_id: str) -> Optional[str]:
    """Map a DM device identifier (device name/IMEI) to a Webfleet objectno."""
    # Exact match first:
    if dm_device_id in DEVICE_MAP:
        return DEVICE_MAP[dm_device_id]
    # Try IMEI normalization if the payload contains it
    # (You can extend this resolution logic.)
    return None


def build_card_payload(dm: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build the 'data' structure for Webfleet External Object tiles.
    This renders info on the card (not map position).
    """
    device = dm.get("device") or dm.get("imei") or "Unknown device"
    ts = dm.get("timestamp") or dm.get("time") or ""
    pos = dm.get("position", {})
    lat = pos.get("lat")
    lon = pos.get("lon")
    speed = dm.get("speed")
    heading = dm.get("heading")
    batt = dm.get("battery") or dm.get("extPower")
    altitude = dm.get("altitude")
    odo = dm.get("odometer")

    # Compose friendly strings
    last_update = ts
    location = f"{lat}, {lon}" if lat is not None and lon is not None else "N/A"
    speed_str = f"{speed} km/h" if speed is not None else "N/A"
    heading_str = f"{heading}°" if heading is not None else "N/A"
    batt_str = f"{batt}" if batt is not None else "N/A"
    altitude_str = f"{altitude} m" if altitude is not None else "N/A"
    odo_str = f"{odo} km" if odo is not None else "N/A"

    # Webfleet expects an array-of-arrays of {name:{'en-GB':'...'}, value:{'en-GB':'...'}}
    data = [
        [
            {"name": {"en-GB": "Powered by"}, "value": {"en-GB": "Digital Matter → Middleware"}},
            {"name": {"en-GB": "Device"}, "value": {"en-GB": device}},
            {"name": {"en-GB": "Last update"}, "value": {"en-GB": last_update}},
        ],
        [
            {"name": {"en-GB": "Location"}, "value": {"en-GB": location}},
            {"name": {"en-GB": "Speed"}, "value": {"en-GB": speed_str}},
            {"name": {"en-GB": "Heading"}, "value": {"en-GB": heading_str}},
        ],
        [
            {"name": {"en-GB": "Battery/Power"}, "value": {"en-GB": batt_str}},
            {"name": {"en-GB": "Altitude"}, "value": {"en-GB": altitude_str}},
            {"name": {"en-GB": "Odometer"}, "value": {"en-GB": odo_str}},
        ]
    ]
    return {"data": data}


async def call_webfleet(action: str, objectno: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Call Webfleet Extern API with either card-data or position payload.
    """
    if not all([WEBFLEET_ACCOUNT, WEBFLEET_USERNAME, WEBFLEET_PASSWORD, WEBFLEET_APIKEY]):
        raise HTTPException(500, "Missing Webfleet credentials in environment.")

    params = {
        "action": action,
        "account": WEBFLEET_ACCOUNT,
        "username": WEBFLEET_USERNAME,
        "password": WEBFLEET_PASSWORD,
        "apikey": WEBFLEET_APIKEY,
        "lang": WEBFLEET_LANG,
        "objectno": objectno,
    }

    # For card updates, Webfleet expects JSON in 'data' form field or as URL param.
    # We'll send as URL param (URL-encoded) for simplicity.
    if action == WEBFLEET_ACTION_CARD:
        params["data"] = json.dumps(payload, separators=(",", ":"))
    else:
        # Position push (when you’re ready): shape your expected parameters here.
        # Example (pseudo): params.update({"lat": ..., "lon": ..., "timestamp": ...})
        params["data"] = json.dumps(payload, separators=(",", ":"))

    url = f"{WEBFLEET_BASE}?{urlencode(params)}"

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(url)
        text = r.text
        try:
            return {"status": r.status_code, "body": text}
        except Exception:
            return {"status": r.status_code, "body": text}


def normalize_dm_payload(body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize Digital Matter payload variants into a canonical dict.
    Handles single message or batch arrays.
    """
    # If DM forwards in batches, pick each record in /ingest
    return body


@app.post("/dm/webhook")
async def dm_webhook(req: Request):
    try:
        body = await req.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    # Accept either single object or list
    records = body if isinstance(body, list) else [body]
    results = []

    for rec in records:
        dm = normalize_dm_payload(rec)

        # Identify the device -> objectno
        dm_id = str(dm.get("device") or dm.get("imei") or dm.get("serial") or "").strip()
        if not dm_id:
            results.append({"error": "missing device identifier"})
            continue

        objectno = get_objectno(dm_id)
        if not objectno:
            # If DM sends VIN/reg/alias, you can fallback here.
            results.append({"device": dm_id, "error": "no objectno mapping"})
            continue

        # CARD UPDATE (tiles)
        card_payload = build_card_payload(dm)
        resp = await call_webfleet(WEBFLEET_ACTION_CARD, objectno, card_payload)

        results.append({"device": dm_id, "objectno": objectno, "webfleet": resp})

        # OPTIONAL: also push a position update here once you confirm the exact action/params
        # pos_payload = {"lat": dm.get("position", {}).get("lat"),
        #               "lon": dm.get("position", {}).get("lon"),
        #               "timestamp": dm.get("timestamp")}
        # resp2 = await call_webfleet(WEBFLEET_ACTION_POS, objectno, pos_payload)

    return {"ok": True, "count": len(results), "results": results}


@app.get("/healthz")
def healthz():
    return {"status": "ok", "time": int(time.time())}
