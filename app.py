from flask import Flask, render_template, request, jsonify
import pandas as pd
from math import radians, sin, cos, sqrt, atan2
from geopy.distance import geodesic
import folium
import requests
from flask_cors import CORS
import xml.etree.ElementTree as ET

app = Flask(__name__)
CORS(app)  # 啟用跨來源資源共享

# 縣市別與代碼對照表
county_code_mapping = {
    '台北市': 'A',
    '台中市': 'B',
    '基隆市': 'C',
    '台南市': 'D',
    '高雄市': 'E',
    '台北縣': 'F',
    '宜蘭縣': 'G',
    '桃園縣': 'H',
    '苗栗縣': 'K',
    '南投縣': 'M',
    '彰化縣': 'N',
    '雲林縣': 'P',
    '嘉義縣': 'Q',
    '連江縣': 'Z',
    '嘉義市': 'I',
    '高雄市': 'S',
    '屏東縣': 'T',
    '花蓮縣': 'U',
    '台東縣': 'V',
    '澎湖縣': 'X',
    '陽明山': 'Y',
}

def fetch_towns_by_county_code(county_code):
    api_url = f"https://api.nlsc.gov.tw/other/ListTown1/{county_code}"
    try:
        response = requests.get(api_url)
        response.raise_for_status()
        
        # 解析 XML
        root = ET.fromstring(response.content)
        towns = []
        for town_item in root.findall('townItem'):
            town_name = town_item.find('townname').text
            towns.append({'Name': town_name})
        
        return towns
    except requests.exceptions.RequestException as e:
        print(f"API請求錯誤: {e}")
        return []
    except ET.ParseError as e:
        print(f"XML 解析錯誤: {e}")
        return []

# 讀取並清理資料
df = pd.read_csv("data/output.csv")

# 確保經緯度為數字，並去除有缺失值的資料
df['Longitude'] = pd.to_numeric(df['Longitude'], errors='coerce')
df['Latitude'] = pd.to_numeric(df['Latitude'], errors='coerce')
df.dropna(subset=['Longitude', 'Latitude'], inplace=True)

# 獲取所有超商品牌的選項
store_brands = sorted(df['公司名稱'].unique())

@app.route('/')
def index():
    return render_template('index.html', brands=store_brands, counties=sorted(county_code_mapping.keys()))

@app.route('/get_districts', methods=['POST'])
def get_districts():
    county = request.json.get('county')
    county_code = county_code_mapping.get(county)
    if not county_code:
        return jsonify({"error": "Invalid county"}), 400

    towns = fetch_towns_by_county_code(county_code)
    district_names = [town['Name'] for town in towns]
    return jsonify(district_names)

@app.route('/get_stores', methods=['POST'])
def get_stores():
    brand = request.json.get('brand')
    county = request.json.get('county')
    district = request.json.get('district')

    # 篩選資料
    filtered = df[
        (df['公司名稱'] == brand) &
        (df['Address'].str.contains(county)) &
        (df['Address'].str.contains(district))
    ]

    stores = filtered.to_dict(orient='records')
    return jsonify(stores)

@app.route('/get_nearby_stores', methods=['POST'])
def get_nearby_stores():
    selected_store = request.json.get('selected_store')
    radius = float(request.json.get('radius', 0.5))  # 默認500m

    store_coords = (selected_store['Latitude'], selected_store['Longitude'])

    nearby_stores = []
    for _, row in df.iterrows():
        store_coords_other = (row['Latitude'], row['Longitude'])
        distance = geodesic(store_coords, store_coords_other).km
        if distance <= radius:
            store_info = {
                '公司名稱': row['公司名稱'],
                '分公司名稱': row['分公司名稱'],
                'Address': row['Address'],
                'Longitude': row['Longitude'],
                'Latitude': row['Latitude'],
                '距離': round(distance, 3)
            }
            nearby_stores.append(store_info)

    # 計算競爭集中度
    numerator = 0
    denominator = 0
    for store in nearby_stores:
        if store['公司名稱'] == '全聯實業股份有限公司':
            weight = 4
        else:
            weight = 1
        distance_sq = store['距離'] ** 2
        numerator += (weight ** 2)
        denominator += distance_sq

    if denominator != 0:
        competition_index = numerator / denominator
    else:
        competition_index = 0

    result = {
        'nearby_stores': nearby_stores,
        'competition_index': round(competition_index, 3)
    }

    return jsonify(result)

if __name__ == '__main__':
    app.run(debug=True)
