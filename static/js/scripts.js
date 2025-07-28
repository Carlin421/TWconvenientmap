// Debug: confirm script is loaded
console.log("scripts.js loaded");

document.addEventListener('DOMContentLoaded', () => {
  console.log("DOMContentLoaded fired");

  // --- DOM Elements ---
  const brandSelect    = document.getElementById('brand');
  const countySelect   = document.getElementById('county');
  const districtSelect = document.getElementById('district');
  const storeSelect    = document.getElementById('store');
  const searchButton   = document.getElementById('search');
  const resultsArea    = document.getElementById('results-area');
  const storesTableBody = document.querySelector('#stores-table tbody');
  const ciPropValue    = document.getElementById('ci-prop-value');
  const ciDistValue    = document.getElementById('ci-dist-value');

  let currentStores = [];

  // --- Leaflet Map Initialization ---
  const map = L.map('map').setView([23.973875, 120.982025], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  let markersLayer = new L.FeatureGroup().addTo(map);

  // --- Event Listeners ---
  countySelect.addEventListener('change', handleCountyChange);
  searchButton.addEventListener('click', handleSearch);
  storeSelect.addEventListener('change', handleStoreSelect);

  // --- Functions ---

  async function handleCountyChange() {
    console.log("handleCountyChange triggered", countySelect.value);
    const county = countySelect.value;
    districtSelect.disabled = true;
    districtSelect.innerHTML = '<option value="">載入中...</option>';

    if (!county) {
      districtSelect.innerHTML = '<option value="">-- 請先選縣市 --</option>';
      return;
    }

    try {
      const res = await fetch('/get_districts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ county })
      });
      console.log('get_districts status=', res.status);
      const districts = await res.json();

      populateSelect(districtSelect, districts, '-- 請選擇鄉鎮市區 --');
      districtSelect.disabled = false;
    } catch (err) {
      console.error('載入鄉鎮失敗:', err);
      districtSelect.innerHTML = '<option value="">讀取失敗</option>';
    }
  }

  async function handleSearch() {
    const brand    = brandSelect.value;
    const county   = countySelect.value;
    const district = districtSelect.value;
    console.log('handleSearch triggered', { brand, county, district });

    if (!county || !district) {
      alert('請先選擇縣市與鄉鎮市區！');
      return;
    }

    searchButton.disabled = true;
    searchButton.textContent = '查詢中...';
    markersLayer.clearLayers();
    storeSelect.innerHTML = '<option value="">-- 請先查詢 --</option>';
    storeSelect.disabled = true;
    resultsArea.style.display = 'none';

    try {
      const res = await fetch('/get_stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, county, district })
      });
      console.log('get_stores status=', res.status);
      const stores = await res.json();
      console.log('stores received', stores.length);

      if (stores.length === 0) {
        alert('在選定區域內找不到任何分店。');
        map.setView([23.973875, 120.982025], 8);
        return;
      }

      currentStores = stores.map((s, idx) => ({
        id: idx,
        brand: s['公司名稱'],
        name: s['分公司名稱'],
        address: s['Address'],
        lat: parseFloat(s['Latitude']),
        lng: parseFloat(s['Longitude'])
      }));

      addMarkersToMap(currentStores);
      populateSelect(
        storeSelect,
        currentStores.map(s => ({ value: s.id, text: `${s.brand} - ${s.name}` })),
        '-- 選擇分店以分析 --'
      );
      storeSelect.disabled = false;
    } catch (err) {
      console.error('查詢分店失敗:', err);
      alert('查詢分店時發生錯誤。');
    } finally {
      searchButton.disabled = false;
      searchButton.textContent = '查詢區域分店';
    }
  }

  async function handleStoreSelect() {
    const storeId = storeSelect.value;
    console.log('handleStoreSelect triggered', storeId);
    if (!storeId) {
      resultsArea.style.display = 'none';
      return;
    }

    const selectedStore = currentStores.find(s => String(s.id) === storeId);
    if (!selectedStore) return;

    try {
      const res = await fetch('/get_nearby_stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selected_store: {
            Latitude: selectedStore.lat,
            Longitude: selectedStore.lng,
            '分公司名稱': selectedStore.name
          },
          radius: 0.5,
          method: 'proportion'
        })
      });
      console.log('analysis status=', res.status);
      const data = await res.json();
      console.log('analysis data', data);

      storesTableBody.innerHTML = '';
      data.nearby_stores.forEach(item => {
        const distM = Math.round(item['距離'] * 1000);
        const row = `
          <tr>
            <td>${item['公司名稱']}</td>
            <td>${item['分公司名稱']}</td>
            <td>${item['Address']}</td>
            <td class="text-end">${distM}</td>
          </tr>`;
        storesTableBody.insertAdjacentHTML('beforeend', row);
      });

      ciPropValue.textContent = data['competition_index_proportion'].toFixed(3);
      ciDistValue.textContent = data['competition_index_distance'].toFixed(3);

      resultsArea.style.display = 'block';

      const marker = findMarkerById(selectedStore.id);
      if (marker) {
        marker.openPopup();
        map.setView(marker.getLatLng(), 16);
      }
    } catch (err) {
      console.error('分析資料失敗:', err);
      alert('分析資料時發生錯誤。');
    }
  }

  let storeMarkers = {};

  function populateSelect(el, data, placeholder) {
    el.innerHTML = `<option value="">${placeholder}</option>`;
    data.forEach(item => {
      const opt = document.createElement('option');
      if (typeof item === 'object') {
        opt.value = item.value;
        opt.textContent = item.text;
      } else {
        opt.value = item;
        opt.textContent = item;
      }
      el.appendChild(opt);
    });
  }

  function addMarkersToMap(stores) {
    markersLayer.clearLayers();
    storeMarkers = {};
    stores.forEach(s => {
      if (!isNaN(s.lat) && !isNaN(s.lng)) {
        const m = L.marker([s.lat, s.lng]);
        m.bindPopup(`<b>${s.name}</b><br>${s.address}`);
        storeMarkers[s.id] = m;
        markersLayer.addLayer(m);
      }
    });
    if (Object.keys(storeMarkers).length) {
      map.fitBounds(markersLayer.getBounds(), { padding: [50, 50] });
    }
  }

  function findMarkerById(id) {
    return storeMarkers[id] || null;
  }
});
