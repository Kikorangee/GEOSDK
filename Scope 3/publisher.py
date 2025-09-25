import os, glob, json, urllib.parse
import pandas as pd
import requests
from datetime import datetime

WEBFLEET_URL = os.getenv("WEBFLEET_URL","https://csv.webfleet.com/extern")
POWERBI_URL  = os.getenv("POWERBI_URL","")

REQUIRED_ENV = ["WEBFLEET_ACCOUNT","WEBFLEET_USERNAME","WEBFLEET_PASSWORD","WEBFLEET_APIKEY"]
for k in REQUIRED_ENV:
    if not os.getenv(k):
        raise SystemExit(f"Missing env var: {k}")

def latest_csv(out_dir:str)->str:
    files = sorted(glob.glob(os.path.join(out_dir, "scope3_trips_*.csv")))
    if not files:
        raise SystemExit("No extracted CSVs found. Run extractor first.")
    return files[-1]

def build_pbi_link(rego:str)->str:
    if not POWERBI_URL:
        return ""
    fil = f"&filter=Trips/registration_plate eq '{rego}'"
    return POWERBI_URL + fil

def publish_for_row(row:pd.Series):
    objectno = row.get("vehicle_id") or row.get("objectno")
    rego     = row.get("registration_plate") or ""
    if not objectno:
        return "skip:no_objectno"
    co2_today = float(row.get("co2e_kg", 0.0))
    link = build_pbi_link(str(rego))
    payload = {
        "version":"1.0.0",
        "defaultLocale":"en-GB",
        "title":{"en-GB":"Scope 3 Summary"},
        "externalLinks":{
            "name":{"en-GB":"Open dashboard"},
            "value":[{
                "href":{"en-GB": link or POWERBI_URL or ""},
                "title":{"en-GB":"View full Scope-3 dashboard"}
            }] if (link or POWERBI_URL) else []
        },
        "data":[[
            {"name":{"en-GB":"Vehicle"}, "value":{"en-GB": str(rego)}, "icon":1},
            {"name":{"en-GB":"CO₂e (this file)"}, "value":{"en-GB": f"{co2_today:.1f} kg"}}
        ],
        [
            {"name":{"en-GB":"Last update"}, "value":{"en-GB": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}}
        ]]
    }
    params = {
        "account": os.getenv("WEBFLEET_ACCOUNT"),
        "username": os.getenv("WEBFLEET_USERNAME"),
        "password": os.getenv("WEBFLEET_PASSWORD"),
        "apikey":  os.getenv("WEBFLEET_APIKEY"),
        "lang":"en",
        "action":"setExternalObjectData",
        "objectno": str(objectno),
        "data": json.dumps(payload, separators=(",",":"))
    }
    r = requests.get(WEBFLEET_URL, params=params, timeout=30)
    r.raise_for_status()
    return r.text

def main():
    out_dir = os.getenv("OUTPUT_DIR","/data/out")
    csv_path = latest_csv(out_dir)
    df = pd.read_csv(csv_path)
    gb_key = "vehicle_id" if "vehicle_id" in df.columns else "objectno"
    if not gb_key:
        print("No vehicle_id/objectno in CSV")
        return
    agg = df.groupby([gb_key,"registration_plate"], dropna=False)["co2e_kg"].sum().reset_index()
    agg = agg.rename(columns={gb_key:"vehicle_id"})
    results = []
    for _, row in agg.iterrows():
        try:
            res = publish_for_row(row)
        except Exception as e:
            res = f"error:{e}"
        results.append((row["vehicle_id"], row.get("registration_plate",""), res))
    for r in results:
        print(r)

if __name__ == "__main__":
    main()
