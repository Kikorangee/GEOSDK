# Scope 3 Module with Power BI integration and Plugin Publisher

## Features
- Extract trips and compute CO₂e.
- Serve FastAPI UI with a button to open Power BI dashboard.
- Row click in the UI deep-links into Power BI with filter by registration_plate.
- Publisher pushes per-vehicle plugin cards into Webfleet with Power BI link.

## Usage
1. Copy `.env.sample` to `.env` and fill in credentials + `POWERBI_URL`.
2. Run extractor then publisher:
   ```bash
   docker compose up --build
   ```
   - UI: http://localhost:8080
   - Plugin publisher pushes cards into Webfleet.
