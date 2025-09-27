import pandas as pd
import requests
from io import StringIO
import sys
from datetime import datetime
import csv
import re

class WebfleetScope3Mapper:
    def __init__(self):
        # Your Webfleet API credentials
        self.api_url = "https://csv.webfleet.com/extern"
        self.credentials = {
            'account': 'direct-track',
            'username': 'fwynne',
            'password': '@wynn5Fr4nc1s',
            'apikey': '247a8041-63e6-4129-8e77-1fc823f1546c',
            'lang': 'en',
            'action': 'showTripReportExtern',
            'outputformat': 'csv'
        }

        # Manual-entry fields (filled in interactive mode)
        self.client = ''
        self.client_v1 = ''
        self.organisation_level1 = ''
        self.organisation_level2 = ''
        self.organisation_level3 = ''
        self.project_level1 = ''
        self.project_level2 = ''
        self.project_level3 = ''

    def validate_range_pattern(self, range_pattern):
        valid_patterns = {
            'today': 'd0', 'd0': 'd0',
            'yesterday': 'd-1', 'd-1': 'd-1',
            'd-2': 'd-2', 'd-3': 'd-3', 'd-4': 'd-4', 'd-5': 'd-5', 'd-6': 'd-6',
            'current week': 'w0', 'w0': 'w0',
            'last week': 'w-1', 'w-1': 'w-1', 'w-2': 'w-2', 'w-3': 'w-3',
            'floating week': 'wf0', 'wf0': 'wf0', 'wf-1': 'wf-1', 'wf-2': 'wf-2', 'wf-3': 'wf-3',
            'current month': 'm0', 'm0': 'm0',
            'last month': 'm-1', 'm-1': 'm-1', 'm-2': 'm-2', 'm-3': 'm-3',
            'custom': 'ud', 'ud': 'ud',
            '1d': 'd0', '7d': 'wf0', '30d': 'm-1', '1m': 'm-1', '3m': 'm-3', '6m': 'm-3', '1y': 'm-3'
        }
        clean = str(range_pattern).lower().strip()
        if clean in valid_patterns:
            return valid_patterns[clean]
        print(f"⚠️  Invalid range pattern '{range_pattern}', defaulting to 'm-1' (last month)")
        return 'm-1'

    def get_range_description(self, range_pattern):
        descriptions = {
            'd0': 'Today', 'd-1': 'Yesterday', 'd-2': 'Two days ago', 'd-3': 'Three days ago',
            'd-4': 'Four days ago', 'd-5': 'Five days ago', 'd-6': 'Six days ago',
            'w0': 'Current week', 'w-1': 'Last week', 'w-2': 'Two weeks ago', 'w-3': 'Three weeks ago',
            'wf0': 'Last 7 days (floating week)', 'wf-1': 'Previous 7 days', 'wf-2': 'Two floating weeks ago', 'wf-3': 'Three floating weeks ago',
            'm0': 'Current month', 'm-1': 'Last month', 'm-2': 'Two months ago', 'm-3': 'Three months ago',
            'ud': 'Custom date range'
        }
        return descriptions.get(range_pattern, f"Range: {range_pattern}")

    def get_custom_date_range(self):
        print("\n📅 Custom Date Range Setup")
        print("Format: DD/MM/YYYY HH:MM:SS (e.g., 15/12/2024 00:00:00)")
        rangefrom = input("Enter start date/time: ").strip()
        rangeto = input("Enter end date/time: ").strip()
        if not rangefrom or not rangeto:
            print("❌ Both start and end dates are required for custom range")
            return None
        return {'rangefrom_string': rangefrom, 'rangeto_string': rangeto}

    def fetch_webfleet_data(self, range_pattern='m-1'):
        valid_range = self.validate_range_pattern(range_pattern)
        range_desc = self.get_range_description(valid_range)

        params = self.credentials.copy()
        params['range_pattern'] = valid_range

        if valid_range == 'ud':
            custom = self.get_custom_date_range()
            if custom is None:
                return None
            params.update(custom)

        print("🔌 Connecting to Webfleet API...")
        print(f"📊 Fetching data for: {range_desc}")
        print(f"🔧 Using range_pattern: {valid_range}")
        print(f"🌐 API URL: {self.api_url}")

        debug_params = params.copy()
        debug_params['password'] = '***'
        debug_url = requests.Request('GET', self.api_url, params=debug_params).prepare().url
        print(f"🔍 Request URL: {debug_url}")

        try:
            response = requests.get(self.api_url, params=params, timeout=60)
            response.raise_for_status()
            text = response.text.strip()
            if len(text) < 50:
                print("❌ API returned empty or insufficient data")
                print(f"🔧 Response: {text}")
                return None
            if 'error' in text.lower() or 'invalid' in text.lower():
                print(f"❌ API returned error: {text[:200]}...")
                return None
            print("✅ Data fetched successfully")
            print(f"📄 Response size: {len(text)} characters")
            first_line = text.split('\\n')[0] if '\\n' in text else text
            print(f"📋 First line sample: {first_line[:100]}...")
            return text
        except requests.exceptions.Timeout:
            print("❌ API request timed out. Try a smaller date range.")
            return None
        except requests.exceptions.RequestException as e:
            print(f"❌ Error fetching data from Webfleet API: {e}")
            return None
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            return None

    def parse_webfleet_csv(self, csv_data):
        try:
            print("🔍 Examining CSV data structure...")
            lines = csv_data.split('\\n')
            print(f"📝 Number of lines: {len(lines)}")
            print("📋 First 3 lines:")
            for i, line in enumerate(lines[:3]):
                print(f"  {i+1}: {line[:150]}...")

            df = None
            for delimiter in [';', ',', '\\t']:
                try:
                    tmp = pd.read_csv(StringIO(csv_data), delimiter=delimiter, quotechar='\"', encoding='utf-8', on_bad_lines='skip')
                    if not tmp.empty and len(tmp.columns) > 3:
                        df = tmp
                        print(f"✅ Successfully parsed with delimiter: '{delimiter}'")
                        break
                except Exception:
                    continue
            if df is None:
                try:
                    df = pd.read_csv(StringIO(csv_data), encoding='utf-8', on_bad_lines='skip')
                    print("✅ Parsed with auto-detected delimiter")
                except Exception as e:
                    print(f"❌ Could not parse CSV: {e}")
                    return None

            if df.empty:
                print("❌ No data found in CSV")
                return None

            df.columns = [col.strip().lower() for col in df.columns]
            print(f"✅ Parsed {len(df)} trip records")
            return df
        except Exception as e:
            print(f"❌ Error parsing CSV data: {e}")
            import traceback
            traceback.print_exc()
            return None

    def safe_float(self, value):
        try:
            if pd.isna(value) or value == '' or value is None:
                return 0.0
            return float(value)
        except (ValueError, TypeError):
            return 0.0

    def extract_make(self, objectname):
        if not objectname:
            return ''
        makes = ['VOLKSWAGEN', 'MAZDA', 'ISUZU', 'LDV', 'TOYOTA', 'FORD', 'BMW', 'MERCEDES']
        up = str(objectname).upper()
        for make in makes:
            if make in up:
                return make
        parts = str(objectname).split(' ')
        return parts[0] if parts else ''

    def extract_model(self, objectname):
        """Extract model from objectname"""
        if not objectname:
            return ''
        makes = ['VOLKSWAGEN', 'MAZDA', 'ISUZU', 'LDV', 'TOYOTA', 'FORD', 'BMW', 'MERCEDES']
        text = str(objectname)
        for make in makes:
            if make in text.upper():
                return text.upper().replace(make, '').strip(' -')
        return text

    def extract_year(self, objectname):
        """Extract 4-digit year from vehicle details. Returns '' if not found."""
        if not objectname:
            return ''
        text = str(objectname)
        m = re.search(r'(19\\d{2}|20\\d{2})', text)
        if m:
            yr = int(m.group(1))
            if 1990 <= yr <= 2035:
                return str(yr)
        m2 = re.search(r'\\b(?:MY)?(\\d{2})\\b', text, flags=re.IGNORECASE)
        if m2:
            two = int(m2.group(1))
            if 90 <= two <= 99:
                return str(1900 + two)
            if 0 <= two <= 35:
                return str(2000 + two)
        return ''

    def sanitize_reg_plate(self, plate):
        if plate is None:
            return ''
        p = str(plate).strip().upper().replace(' ', '').replace('-', '')
        return p

    def generate_filename(self):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"scope3_trips_{timestamp}.csv"

    def save_to_csv(self, df, filename=None):
        if filename is None:
            filename = self.generate_filename()
        try:
            df.to_csv(filename, index=False)
            print(f"💾 Data saved to: {filename}")
            return filename
        except Exception as e:
            print(f"❌ Error saving to CSV: {e}")
            return None

    def show_data_summary(self, df):
        if df.empty:
            print("❌ No data to summarize")
            return
        print("\\n" + "="*60)
        print("📊 DATA SUMMARY")
        print("="*60)
        print(f"Total trips: {len(df)}")
        if 'date' in df.columns and not df['date'].empty:
            dates = df['date'].dropna()
            if not dates.empty:
                print(f"Date range: {dates.min()} to {dates.max()}")
        if 'registration_plate' in df.columns:
            print(f"Unique vehicles: {df['registration_plate'].nunique()}")
        if 'kms_travelled' in df.columns:
            total_km = df['kms_travelled'].sum()
            print(f"Total distance: {total_km:,.2f} km")
        if 'co2e_kg' in df.columns:
            total_co2 = df['co2e_kg'].sum()
            print(f"Total CO2e: {total_co2:,.2f} kg")
        if 'economy_l_per_100_km' in df.columns:
            valid = df[df['economy_l_per_100_km'] > 0]['economy_l_per_100_km']
            if not valid.empty:
                print(f"Average fuel economy: {valid.mean():.2f} L/100km")
        print("="*60)

    def map_to_scope3_format(self, raw_df):
        print("🔄 Mapping data to scope3 format...")
        mapped_data = []
        successful_mappings = 0

        # Global counters (sequential across entire dataset)
        global_leg_no = 0
        global_trip_count = 0

        for index, row in raw_df.iterrows():
            try:
                tripid = str(row.get('tripid', f'unknown_{index}')).strip()
                objectno = str(row.get('objectno', '')).strip()
                objectname = str(row.get('objectname', '')).strip()

                # Increment global counters
                global_leg_no += 1
                global_trip_count += 1

                # Units
                distance = self.safe_float(row.get('distance', 0.0))
                distance_km = distance / 1000.0
                co2 = self.safe_float(row.get('co2', 0.0))
                co2_kg = co2 / 1000.0
                co2_tonnes = co2 / 1000000.0
                fuel_usage = self.safe_float(row.get('fuel_usage', 0.0))

                economy = 0.0
                if distance > 0 and fuel_usage > 0:
                    economy = (fuel_usage / (distance / 100000)) * 100

                # Coords
                start_lon = self.safe_float(row.get('start_longitude', 0.0)) / 1000000.0
                start_lat = self.safe_float(row.get('start_latitude', 0.0)) / 1000000.0
                end_lon = self.safe_float(row.get('end_longitude', 0.0)) / 1000000.0
                end_lat = self.safe_float(row.get('end_latitude', 0.0)) / 1000000.0

                # Times
                start_time = str(row.get('start_time', '')).strip()
                end_time = str(row.get('end_time', '')).strip()
                date_part = start_time.split(' ')[0] if ' ' in start_time else start_time

                # Vehicle info
                vehicle_name = objectname or objectno or 'Unknown Vehicle'
                make = self.extract_make(vehicle_name)
                model = self.extract_model(vehicle_name)
                year = self.extract_year(vehicle_name)

                # Leg info
                leg_no = global_leg_no
                leg_id = f"{tripid}_{leg_no}"

                mapped_row = {
                    'client': self.client,
                    'client_v1': self.client_v1,
                    'organisation_level1': self.organisation_level1,
                    'organisation_level2': self.organisation_level2,
                    'organisation_level3': self.organisation_level3,
                    'project_level1': self.project_level1,
                    'project_level2': self.project_level2,
                    'project_level3': self.project_level3,
                    'registration_plate': self.sanitize_reg_plate(objectno),
                    'date': date_part,
                    'dow_numeric': '',
                    'dow': '',
                    'month_start_date': date_part,
                    'trip_id': tripid,
                    'trip_start': start_time,
                    'trip_end': end_time,
                    'trip_duration': self.safe_float(row.get('duration', 0.0)),
                    'leg_no': leg_no,
                    'leg_id': leg_id,
                    'leg_start': start_time,
                    'leg_end': end_time,
                    'leg_duration': self.safe_float(row.get('duration', 0.0)),
                    'leg_start_address': str(row.get('start_postext', '')),
                    'start_address_longitude': start_lon,
                    'start_address_latitude': start_lat,
                    'leg_end_address': str(row.get('end_postext', '')),
                    'end_address_longitude': end_lon,
                    'end_address_latitude': end_lat,
                    'kms_travelled': distance_km,
                    'mass_goods_transported_tonnes': '',
                    'co2e_kg': co2_kg,
                    'co2e_tonnes': co2_tonnes,
                    'economy_l_per_100_km': economy,
                    'est_fuel_consumption': fuel_usage,
                    'client_grouping1': self.project_level1 or self.organisation_level1 or self.client,
                    'client_grouping2': self.project_level2 or self.organisation_level2 or self.client,
                    'client_grouping3': self.project_level3 or self.organisation_level3 or self.client,
                    'vehicle_class': vehicle_name,
                    'vehicle_type': vehicle_name,
                    'make': make,
                    'model': model,
                    'year': year,
                    'count': global_trip_count
                }

                mapped_data.append(mapped_row)
                successful_mappings += 1

            except Exception as e:
                print(f"⚠️  Error mapping row {index}: {e}")
                continue

        column_order = [
            'client', 'client_v1', 'organisation_level1', 'organisation_level2', 'organisation_level3',
            'project_level1', 'project_level2', 'project_level3', 'registration_plate', 'date',
            'dow_numeric', 'dow', 'month_start_date', 'trip_id', 'trip_start', 'trip_end',
            'trip_duration', 'leg_no', 'leg_id', 'leg_start', 'leg_end', 'leg_duration',
            'leg_start_address', 'start_address_longitude', 'start_address_latitude',
            'leg_end_address', 'end_address_longitude', 'end_address_latitude',
            'kms_travelled', 'mass_goods_transported_tonnes', 'co2e_kg', 'co2e_tonnes',
            'economy_l_per_100_km', 'est_fuel_consumption', 'client_grouping1', 'client_grouping2',
            'client_grouping3', 'vehicle_class', 'vehicle_type', 'make', 'model', 'year', 'count'
        ]

        output_df = pd.DataFrame(mapped_data, columns=column_order)
        print(f"✅ Successfully mapped {successful_mappings}/{len(raw_df)} records")
        return output_df

    def run_complete_mapping(self, range_pattern='m-1', output_file=None):
        print("🚀 Starting Webfleet to Scope3 CSV Mapping")
        print("="*60)

        csv_data = self.fetch_webfleet_data(range_pattern)
        if csv_data is None:
            print("❌ Failed to fetch data from API")
            return None

        raw_df = self.parse_webfleet_csv(csv_data)
        if raw_df is None:
            print("❌ Failed to parse CSV data")
            return None

        mapped_df = self.map_to_scope3_format(raw_df)
        if mapped_df.empty:
            print("❌ No data was successfully mapped")
            return None

        saved_file = self.save_to_csv(mapped_df, output_file)
        if saved_file is None:
            return None

        self.show_data_summary(mapped_df)
        print("✅ Mapping process completed successfully!")
        return mapped_df

def interactive_mapper():
    mapper = WebfleetScope3Mapper()

    print("🌐 Webfleet API to Scope3 CSV Mapper")
    print("="*50)

    range_options = {
        '1': {'pattern': 'd0', 'desc': 'Today'},
        '2': {'pattern': 'd-1', 'desc': 'Yesterday'},
        '3': {'pattern': 'wf0', 'desc': 'Last 7 days (floating week)'},
        '4': {'pattern': 'w-1', 'desc': 'Last week'},
        '5': {'pattern': 'm-1', 'desc': 'Last month (default)'},
        '6': {'pattern': 'm-2', 'desc': 'Two months ago'},
        '7': {'pattern': 'm-3', 'desc': 'Three months ago'},
        '8': {'pattern': 'ud', 'desc': 'Custom date range'}
    }

    print("Select time range:")
    for key, option in range_options.items():
        print(f"  {key}. {option['desc']} ({option['pattern']})")

    choice = input("\\nEnter choice (1-8) [5]: ").strip() or '5'
    selected = range_options.get(choice, range_options['5'])

    # Prompt for metadata fields
    print("\\nEnter values for metadata fields (press Enter to leave blank):")
    mapper.client = input("  client: ").strip()
    mapper.client_v1 = input("  client_v1: ").strip()
    mapper.organisation_level1 = input("  organisation_level1: ").strip()
    mapper.organisation_level2 = input("  organisation_level2: ").strip()
    mapper.organisation_level3 = input("  organisation_level3: ").strip()
    mapper.project_level1 = input("  project_level1: ").strip()
    mapper.project_level2 = input("  project_level2: ").strip()
    mapper.project_level3 = input("  project_level3: ").strip()

    custom_file = input("\\nEnter output filename (optional, press Enter for auto-generated): ").strip() or None

    print(f"\\n📅 Processing: {selected['desc']}")
    result = mapper.run_complete_mapping(range_pattern=selected['pattern'], output_file=custom_file)
    return result

if __name__ == "__main__":
    if len(sys.argv) > 1:
        if sys.argv[1] == '--quick':
            mapper = WebfleetScope3Mapper()
            # Minimal defaults for CLI quick run
            mapper.client = 'CLIENT'
            mapper.client_v1 = 'CLIENT_V1'
            mapper.organisation_level1 = 'ORG_L1'
            mapper.organisation_level2 = 'ORG_L2'
            mapper.organisation_level3 = 'ORG_L3'
            mapper.project_level1 = 'PROJ_L1'
            mapper.project_level2 = 'PROJ_L2'
            mapper.project_level3 = 'PROJ_L3'
            mapper.run_complete_mapping('wf0')
        elif sys.argv[1] == '--range' and len(sys.argv) > 2:
            mapper = WebfleetScope3Mapper()
            # Minimal defaults for CLI non-interactive
            mapper.client = 'CLIENT'
            mapper.client_v1 = 'CLIENT_V1'
            mapper.organisation_level1 = 'ORG_L1'
            mapper.organisation_level2 = 'ORG_L2'
            mapper.organisation_level3 = 'ORG_L3'
            mapper.project_level1 = 'PROJ_L1'
            mapper.project_level2 = 'PROJ_L2'
            mapper.project_level3 = 'PROJ_L3'
            mapper.run_complete_mapping(sys.argv[2])
        else:
            print("Usage:")
            print("  python script.py              # Interactive mode")
            print("  python script.py --quick      # Quick test (last 7 days)")
            print("  python script.py --range m-1  # Specific range pattern")
            print("\\nValid range patterns:")
            print("  d0, d-1, d-2, d-3, d-4, d-5, d-6")
            print("  w0, w-1, w-2, w-3")
            print("  wf0, wf-1, wf-2, wf-3")
            print("  m0, m-1, m-2, m-3")
            print("  ud (custom)")
    else:
        interactive_mapper()
