import pandas as pd
import time
import requests
from tqdm import tqdm  # 引入 tqdm 顯示進度條

def process_csv(input_file, output_file, api_key):
    """
    處理 CSV 文件，將地址轉換為經緯度並保存到新文件。

    :param input_file: 原始 CSV 文件路徑
    :param output_file: 結果保存的 CSV 文件路徑
    :param api_key: Google Maps Geocoding API 金鑰
    """
    # 讀取 CSV 文件
    df = pd.read_csv(input_file)
    
    # 新增經緯度欄位
    df['Longitude'] = ''
    df['Latitude'] = ''
    
    # 使用 tqdm 包裝 DataFrame 的迭代器來顯示進度條
    for index, row in tqdm(df.iterrows(), total=len(df), desc="處理進度"):
        address = row['分公司地址']
        try:
            # 獲取經緯度
            lat, lon = get_lat_lon(api_key, address)
            df.at[index, 'Latitude'] = lat
            df.at[index, 'Longitude'] = lon
        except Exception as e:
            print(f"處理 {address} 時出錯: {str(e)}")
        
        
    
    # 保存結果到新的 CSV 文件
    df.to_csv(output_file, index=False, encoding='utf-8-sig')
    print(f"已將結果保存到 {output_file}")

def get_lat_lon(api_key, address):
    """
    使用 Google Maps Geocoding API 獲取地址的經緯度。

    :param api_key: Google Maps Geocoding API 金鑰
    :param address: 要查詢的地址
    :return: 經緯度 (緯度, 經度)
    """
    # API 基礎 URL
    url = "https://maps.googleapis.com/maps/api/geocode/json"
    
    # 請求參數
    params = {
        "address": address,
        "key": api_key
    }
    
    # 發送 GET 請求
    response = requests.get(url, params=params)
    data = response.json()
    
    # 檢查響應狀態
    if data["status"] == "OK":
        # 解析經緯度
        location = data["results"][0]["geometry"]["location"]
        return location["lat"], location["lng"]
    else:
        # 如果請求失敗，拋出異常
        error_message = data.get('error_message', 'No additional information')
        raise Exception(f"Error: {data['status']} - {error_message}")

# 使用範例
if __name__ == "__main__":
    # 在此處填入您的 Google API 金鑰
    api_key = ""
    input_file = "全國5大超商資料集.csv"  # 輸入的 CSV 文件名稱
    output_file = "output.csv"  # 輸出的 CSV 文件名稱
    
    # 處理整個 CSV 文件
    process_csv(input_file, output_file, api_key)
