import requests
import json
import pandas as pd

def get_geocode_data(address):
    base_url = "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates"
    params = {
        'SingleLine': address,
        'f': 'json',
        'outSR': '{"wkid":4326}',
        'outFields': 'Addr_type,Match_addr,StAddr,City',
        'maxLocations': 1
    }
    
    try:
        response = requests.get(base_url, params=params)
        
        if response.status_code == 200:
            data = response.json()
            candidates = data.get('candidates', [])
            
            if candidates:
                candidate = candidates[0]
                location = candidate.get('location', {})
                x = location.get('x', 'N/A')
                y = location.get('y', 'N/A')
                return x, y
            else:
                return 'N/A', 'N/A'
        else:
            print(f"Request failed with status code: {response.status_code}")
            return 'N/A', 'N/A'
    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return 'N/A', 'N/A'

def convert_addresses_to_coordinates(csv_file):
    try:
        # 嘗試不同的編碼方式讀取CSV
        encodings = ['utf-8', 'big5', 'gb18030', 'latin1']
        df = None
        
        for encoding in encodings:
            try:
                df = pd.read_csv(csv_file, encoding=encoding)
                print(f"成功使用 {encoding} 編碼讀取文件")
                break
            except UnicodeDecodeError:
                continue
        
        if df is None:
            raise Exception("無法以任何編碼方式讀取文件")
        
        # 處理地址轉換
        print("開始轉換地址...")
        longitudes = []
        latitudes = []

        for index, row in df.iterrows():
            address = row['Address']
            x, y = get_geocode_data(address)
            longitudes.append(x)
            latitudes.append(y)
            print(f"已轉換第 {index+1} 行地址: {address} -> 經度: {x}, 緯度: {y}")
        
        df['Longitude'] = longitudes
        df['Latitude'] = latitudes
        
        # 輸出結果
        output_file = "經緯經緯.csv"
        df.to_csv(output_file, index=False, encoding='utf-8-sig')
        print(f"已成功將經緯度寫入 {output_file}")
        
        # 顯示前幾筆資料作為確認
        print("\n轉換後的前幾筆資料：")
        print(df.head())
        
    except Exception as e:
        print(f"處理過程中發生錯誤: {str(e)}")

# 使用方法
if __name__ == "__main__":
    convert_addresses_to_coordinates("input.csv")
