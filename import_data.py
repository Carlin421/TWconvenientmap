import pandas as pd
import sqlite3

# 讀取原本的 CSV
df = pd.read_csv("data/output.csv")

# 清理經緯度（跟你原本的流程一樣）
df['Longitude'] = pd.to_numeric(df['Longitude'], errors='coerce')
df['Latitude']  = pd.to_numeric(df['Latitude'], errors='coerce')
df.dropna(subset=['Longitude', 'Latitude'], inplace=True)

# 寫入 SQLite（如果表已存在就取代）
conn = sqlite3.connect("stores.db")
df.to_sql("stores", conn, if_exists="replace", index=False)
conn.close()

print("資料已匯入 stores.db → stores 表")
