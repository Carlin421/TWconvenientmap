// static/js/scripts.js
console.log('scripts.js loaded');

// ===== ICON 定義 =====
const iconSize    = [32, 32];
const iconAnchor  = [16, 32];
const popupAnchor = [0, -32];

const brandIcons = {
  '統一超商股份有限公司':     L.icon({ iconUrl: '/static/icons/7eleven.png',    iconSize, iconAnchor, popupAnchor }),
  '全家便利商店股份有限公司': L.icon({ iconUrl: '/static/icons/familymart.png', iconSize, iconAnchor, popupAnchor }),
  '來來超商股份有限公司':       L.icon({ iconUrl: '/static/icons/okmart.png',      iconSize, iconAnchor, popupAnchor }),
  '萊爾富國際股份有限公司':     L.icon({ iconUrl: '/static/icons/hilife.png',      iconSize, iconAnchor, popupAnchor }),
  '全聯實業股份有限公司':       L.icon({ iconUrl: '/static/icons/pxmart.png',      iconSize, iconAnchor, popupAnchor })
};
const defaultIcon = L.icon({
  iconUrl: '/static/icons/default.png',
  iconSize, iconAnchor, popupAnchor
});

// ===== 全域變數 =====
let storesData = [];
let storesTable, map, markersLayer, competitorLayer, selectionCircle;
let countyDistricts = {};
fetch('/static/data/districts.json')
  .then(r => r.json())
  .then(data => countyDistricts = data)
  .catch(() => console.warn('載入鄉鎮清單失敗'));

// ===== 工具函式 =====
function showAlert(msg) {
  const box = document.getElementById('alert-box');
  box.textContent = msg;
  box.classList.remove('d-none');
}
function clearAlert() {
  document.getElementById('alert-box').classList.add('d-none');
}

// 點擊 <code class="copyable"> 複製 URL
document.addEventListener('click', e => {
  const tgt = e.target;
  if (tgt.classList.contains('copyable')) {
    const url = tgt.dataset.url;
    navigator.clipboard.writeText(url)
      .then(() => {
        showAlert('URL 已複製：' + url);
        setTimeout(clearAlert, 1500);
      })
      .catch(() => showAlert('複製失敗'));
  }
});

// ===== 輔助：載入鄉鎮 =====
async function fetchDistricts(countySelect) {
  const sel = document.getElementById('district');
  sel.disabled = true;
  sel.innerHTML = '<option>載入中…</option>';
  try {
    const res = await fetch('/get_districts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ county: countySelect })
    });
    const towns = await res.json();
    sel.innerHTML = '<option value="">── 選擇鄉鎮 ──</option>' +
      towns.map(t => `<option>${t}</option>`).join('');
    sel.disabled = false;
  } catch {
    showAlert('無法載入鄉鎮');
    // allow flow to continue
  }
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  const brandSelect    = document.getElementById('brand');
  const countySelect   = document.getElementById('county');
  const districtSelect = document.getElementById('district');
  const storeSelect    = document.getElementById('store');
  const searchBtn      = document.getElementById('search');
  const searchBtnText  = document.getElementById('searchBtnText');
  const searchSpinner  = document.getElementById('searchSpinner');
  const showGuideBtn   = document.getElementById('showGuideBtn');
  const guideModalEl   = document.getElementById('usageGuideModal');
  const guideModal     = new bootstrap.Modal(guideModalEl);

  // DataTable 初始化
  storesTable = $('#stores-table').DataTable({
    paging: false,
    info: false,
    ordering: false,
    language: { emptyTable: '暫無資料', zeroRecords: '查無符合資料' }
  });

  // Leaflet 地圖 + LayerGroups
  map            = L.map('map').setView([23.973875, 120.982025], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  markersLayer    = L.featureGroup().addTo(map);
  competitorLayer = L.featureGroup().addTo(map);

  // 初始解鎖狀態
  countySelect.disabled   = true;
  districtSelect.disabled = true;
  storeSelect.disabled    = true;
  clearAlert();

  // 品牌選擇 → 解鎖縣市
  brandSelect.addEventListener('change', () => {
    clearAlert();
    countySelect.disabled = !brandSelect.value;
    if (!brandSelect.value) {
      districtSelect.disabled = true;
      storeSelect.disabled    = true;
    }
  });

  // 縣市變更 → 載入鄉鎮
countySelect.addEventListener('change', () => {
  clearAlert();
  const towns = countyDistricts[countySelect.value] || [];
  // 填入 <option>
  districtSelect.innerHTML = towns.length
    ? '<option value="">── 選擇鄉鎮 ──</option>' +
      towns.map(t => `<option>${t}</option>`).join('')
    : '<option value="">（無資料）</option>';
  districtSelect.disabled = towns.length === 0;
});

  // 查詢同品牌分店
  searchBtn.addEventListener('click', async () => {
    clearAlert();
    if (!brandSelect.value)   { showAlert('請選擇品牌');	return; }
    if (!countySelect.value)  { showAlert('請選擇縣市');	return; }
    if (!districtSelect.value){ showAlert('請選擇鄉鎮');	return; }

    searchBtn.disabled        = true;
    searchBtnText.textContent = '查詢中…';
    searchSpinner.classList.remove('d-none');
    markersLayer.clearLayers();
    competitorLayer.clearLayers();
    storesTable.clear().draw();
    storeSelect.disabled = true;
    storesData = [];

    try {
      const res  = await fetch('/get_stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand:    brandSelect.value,
          county:   countySelect.value,
          district: districtSelect.value
        })
      });
      const data = await res.json();
      if (!data.length) { showAlert('此區無任何分店'); return; }
      storesData = data;

      data.forEach((s,i) => {
        const icon = brandIcons[s['公司名稱']] || defaultIcon;
        L.marker([s.Latitude, s.Longitude], { icon })
         .addTo(markersLayer)
         .bindPopup(`<b>${s['分公司名稱']}</b><br>${s.Address}`)
         .on('click', () => selectStore(i));
      });
      map.fitBounds(markersLayer.getBounds(), { padding: [50,50] });

      storeSelect.innerHTML = '<option value="">── 選擇分店 ──</option>' +
        data.map((s,i) => `<option value="${i}">${s['分公司名稱']}</option>`).join('');
      storeSelect.disabled = false;
    } catch {
      showAlert('查詢分店失敗');
    } finally {
      searchBtn.disabled        = false;
      searchBtnText.textContent = '查詢';
      searchSpinner.classList.add('d-none');
    }
  });

  // 分店下拉 → 點選分店
  storeSelect.addEventListener('change', () => {
    clearAlert();
    const idx = parseInt(storeSelect.value, 10);
    if (!isNaN(idx)) selectStore(idx);
  });

  // 首次自動顯示使用說明 Modal
  if (!localStorage.getItem('guideShown')) guideModal.show();
  guideModalEl.addEventListener('hidden.bs.modal', () => {
    localStorage.setItem('guideShown', 'true');
  });
  showGuideBtn.addEventListener('click', () => guideModal.show());

  // 自動初始化：選第一品牌→縣市→鄉鎮並查詢
  (async function initDefault() {
    const fb = brandSelect.options[1]?.value;
    const fc = countySelect.options[1]?.value;
    if (!fb || !fc) return;

    brandSelect.value = fb;
    brandSelect.dispatchEvent(new Event('change'));

    countySelect.value = fc;
    await fetchDistricts(fc);

    const fd = districtSelect.options[1]?.value;
    if (!fd) return;
    districtSelect.value = fd;
    searchBtn.click();
  })();
});

// ===== 權重設定 =====
const brandWeights = {
  '全聯實業股份有限公司': 4
};

// ===== 分店點擊：競爭分析 & CI Modal =====
async function selectStore(idx) {
  const sel = storesData[idx];
  if (!sel) return;

  try {
    const res  = await fetch('/get_nearby_stores', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ selected_store: sel, radius:0.5 })
    });
    const json = await res.json();
    if (json.error) { showAlert(json.error); return; }

    competitorLayer.clearLayers();
    if (selectionCircle) map.removeLayer(selectionCircle);
    storesTable.clear();

    // (1) 計算加權商店數
    const wc = {};
    json.nearby_stores.forEach(s => {
      const w = brandWeights[s['公司名稱']] || 1;
      wc[s['公司名稱']] = (wc[s['公司名稱']] || 0) + w;
    });

    // (2) Proportion CI
    let sumSq = 0;
    Object.values(wc).forEach(c => sumSq += c*c);
    const tot    = Object.values(wc).reduce((a,c)=>a+c, 0);
    const ciProp = sumSq / (tot*tot);

    // (3) Distance CI（固定分子 500² = 250000）
    const R       = 500;
    const numDist = R*R;
    let denDist   = 0;
    json.nearby_stores.forEach(s => {
      const d_m = s['距離']*1000;
      const w   = brandWeights[s['公司名稱']] || 1;
      denDist += d_m*d_m*w;
    });
    const ciDist = numDist/denDist;

    // 注入 CI Modal
    document.getElementById('ciModalBody').innerHTML = `
      <h6>Proportion CI</h6>
      <p>
        加權店數：<br/>
        ${Object.entries(wc).map(([b,c])=>`${b}: ${c} 家`).join('<br/>')}<br/>
        Σc=${tot}<br/>
        CIₚ=Σ(c²)/(Σc)²=${sumSq}/${tot*tot}≈<strong>${ciProp.toFixed(3)}</strong>
      </p>
      <hr/>
      <h6>Distance CI</h6>
      <p>
        固定分子=500²=${numDist}<br/>
        Σ(dist²×w)=${denDist.toFixed(0)}<br/>
        CIₑ=${numDist}/${denDist.toFixed(0)}≈<strong>${ciDist.toFixed(3)}</strong>
      </p>
    `;
    
    // 繪製表格 & Marker
    json.nearby_stores.forEach(s => {
      storesTable.row.add([
        s['公司名稱'], s['分公司名稱'], s.Address, Math.round(s['距離']*1000)
      ]);
      const icon = brandIcons[s['公司名稱']] || defaultIcon;
      L.marker([s.Latitude,s.Longitude],{icon})
        .addTo(competitorLayer)
        .bindPopup(`<b>${s['分公司名稱']}</b><br>${s.Address}`);
    });
    storesTable.draw();

    // 畫 500m 圓形 & 縮放
    selectionCircle = L.circle([sel.Latitude,sel.Longitude],{radius:R})
                       .addTo(competitorLayer);
    map.fitBounds(competitorLayer.getBounds(),{padding:[50,50]});

    document.getElementById('ci-prop-value').textContent = ciProp.toFixed(3);
    document.getElementById('ci-dist-value').textContent = ciDist.toFixed(3);
    document.getElementById('results-area').classList.remove('d-none');
  } catch {
    showAlert('分析失敗');
  }
}
