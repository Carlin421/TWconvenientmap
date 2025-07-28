# scripts/fetch_all_towns.py
import requests, certifi, xml.etree.ElementTree as ET, json

county_code_mapping = {
    '台北市':'A','台中市':'B','基隆市':'C','台南市':'D','高雄市':'E',
    '新北市':'F','宜蘭縣':'G','桃園縣':'H','苗栗縣':'K','南投縣':'M',
    '彰化縣':'N','雲林縣':'P','嘉義縣':'Q','連江縣':'Z','嘉義市':'I',
    '屏東縣':'T','花蓮縣':'U','台東縣':'V','澎湖縣':'X'
}

all_data = {}
for county, code in county_code_mapping.items():
    url = f"https://api.nlsc.gov.tw/other/ListTown1/{code}"
    r = requests.get(url, verify=certifi.where(), timeout=10)
    r.raise_for_status()
    root = ET.fromstring(r.content)
    towns = [item.find('townname').text.replace('臺','台')
             for item in root.findall('townItem')]
    all_data[county] = towns

with open('static/data/districts.json', 'w', encoding='utf-8') as f:
    json.dump(all_data, f, ensure_ascii=False, indent=2)
