from flask import Flask, render_template, request, jsonify
import sqlite3
import pandas as pd
from geopy.distance import geodesic
import requests
import xml.etree.ElementTree as ET
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# SQLite connection
conn = sqlite3.connect("stores.db", check_same_thread=False)
conn.row_factory = sqlite3.Row

# Load entire stores table into DataFrame for efficiency
df = pd.read_sql_query("SELECT * FROM stores", conn)

# Normalize address column (replace 臺 with 台)
if 'Address' in df.columns:
    df['Address'] = df['Address'].str.replace('臺', '台', regex=False)
    addr_col = 'Address'
elif '地址' in df.columns:
    df['地址']   = df['地址'].str.replace('臺', '台', regex=False)
    addr_col = '地址'
else:
    raise KeyError("找不到 Address 或 地址 欄位，請檢查資料表欄位名稱")

# County-to-code mapping
county_code_mapping = {
    '台北市': 'A', '台中市': 'B', '基隆市': 'C', '台南市': 'D', '高雄市': 'E',
    '新北市': 'F', '宜蘭縣': 'G', '桃園縣': 'H', '苗栗縣': 'K', '南投縣': 'M',
    '彰化縣': 'N', '雲林縣': 'P', '嘉義縣': 'Q', '連江縣': 'Z', '嘉義市': 'I',
    '屏東縣': 'T', '花蓮縣': 'U', '台東縣': 'V', '澎湖縣': 'X', '陽明山': 'Y'
}

def fetch_towns_by_county_code(code):
    url = f"https://api.nlsc.gov.tw/other/ListTown1/{code}"
    try:
        r = requests.get(url)
        r.raise_for_status()
        root = ET.fromstring(r.content)
        return [ { 'Name': item.find('townname').text.replace('臺','台') }
                 for item in root.findall('townItem') ]
    except Exception as e:
        print(f"fetch_towns error: {e}")
        return []

@app.route('/')
def index():
    brands = sorted(df['公司名稱'].unique())
    return render_template('index.html',
                           brands=brands,
                           counties=sorted(county_code_mapping.keys()))

# ========== 鄉鎮路由 ==========
@app.route('/get_districts', methods=['GET', 'POST'])
@app.route('/api/districts',  methods=['GET', 'POST'])
def get_districts():
    if request.method == 'POST':
        county = (request.json or {}).get('county')
    else:
        county = request.args.get('county')
    code = county_code_mapping.get(county)
    if not code:
        return jsonify({ 'error': 'Invalid county' }), 400

    towns = fetch_towns_by_county_code(code)
    return jsonify([ t['Name'] for t in towns ])

# ========== 分店查詢 ==========
@app.route('/get_stores', methods=['GET', 'POST'])
@app.route('/api/stores', methods=['GET', 'POST'])
def get_stores():
    # debug log
    print("→ get_stores:", request.method, request.json or request.args)

    if request.method == 'POST':
        data = request.json or {}
        brand, county, district = data.get('brand'), data.get('county'), data.get('district')
    else:
        brand   = request.args.get('brand')
        county  = request.args.get('county')
        district= request.args.get('district')

    county_norm   = county.replace('臺', '台') if county else ''
    district_norm = district.replace('臺', '台') if district else ''

    filtered = df[
        (df['公司名稱'] == brand) &
        df[addr_col].str.contains(county_norm, na=False) &
        df[addr_col].str.contains(district_norm, na=False)
    ]
    result = []
    for _, row in filtered.iterrows():
        result.append({
            '公司名稱':   row['公司名稱'],
            '分公司名稱': row['分公司名稱'],
            'Address':    row[addr_col],
            'Longitude':  row['Longitude'],
            'Latitude':   row['Latitude']
        })
    return jsonify(result)

# ========== 競爭分析 ==========
@app.route('/get_nearby_stores', methods=['POST'])
@app.route('/api/analysis',        methods=['POST'])
def get_nearby_stores():
    data   = request.json or {}
    sel    = data.get('selected_store')
    radius = float(data.get('radius', 0.5))

    # debug log
    print("→ get_nearby_stores:", sel, "radius=", radius)

    base = (sel['Latitude'], sel['Longitude'])
    nearby = []
    for _, row in df.iterrows():
        d = geodesic(base, (row['Latitude'], row['Longitude'])).km
        if d <= radius:
            nearby.append({
                '公司名稱':   row['公司名稱'],
                '分公司名稱': row['分公司名稱'],
                'Address':    row[addr_col],
                '距離':       round(d, 3)
            })

    num   = sum((4 if s['公司名稱']=='全聯實業股份有限公司' else 1)**2 for s in nearby)
    den   = sum(s['距離']**2 for s in nearby)
    ci_prop = (num/den) if den else 0
    dsum  = den
    sel_d = next((s['距離'] for s in nearby if s['分公司名稱']==sel['分公司名稱']), 0)
    ci_dist = (sel_d**2/dsum) if dsum else 0

    return jsonify({
        'nearby_stores': nearby,
        'competition_index_proportion': round(ci_prop, 3),
        'competition_index_distance':   round(ci_dist, 3)
    })

if __name__ == '__main__':
    print("啟動 Flask，請求紀錄會在這裡顯示…")
    app.run(debug=True)
