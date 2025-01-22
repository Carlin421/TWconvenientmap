$(document).ready(function() {
    let map = L.map('map').setView([24.147736, 120.673648], 12); // 初始中心點
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    let markersLayer = L.layerGroup().addTo(map); // 用來儲存分店標記

    // 動態載入區鄉鎮
    $('#county').change(function() {
        let selectedCounty = $(this).val();
        let $district = $('#district');
        let $store = $('#store');

        $district.empty().append('<option value="">-- 選擇區鄉鎮 --</option>');
        $store.empty().append('<option value="">-- 選擇分店 --</option>');

        if (selectedCounty !== "") {
            $.ajax({
                url: '/get_districts',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ county: selectedCounty }),
                success: function(response) {
                    console.log('Received districts:', response); // 調試用
                    if (Array.isArray(response) && response.length > 0) {
                        response.forEach(function(district) {
                            $district.append(`<option value="${district}">${district}</option>`);
                        });
                    } else {
                        console.log('No districts received or invalid response format');
                        alert("無法取得區鄉鎮資料。");
                    }
                },
                error: function(jqXHR, textStatus, errorThrown) {
                    console.error("AJAX error:", textStatus, errorThrown);
                    alert("無法取得區鄉鎮資料。錯誤: " + textStatus);
                }
            });
        }
    });

    // 動態載入分店
    $('#search').click(function() {
        let brand = $('#brand').val();
        let county = $('#county').val();
        let district = $('#district').val();

        if (brand === "" || county === "" || district === "") {
            alert("請選擇品牌、縣市和區鄉鎮！");
            return;
        }

        $.ajax({
            url: '/get_stores',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ brand: brand, county: county, district: district }),
            success: function(response) {
                // 清除舊的標記
                markersLayer.clearLayers();
                $('#store').empty().append('<option value="">-- 選擇分店 --</option>');

                response.forEach(function(store, index) {
                    $('#store').append(`<option value="${index}">${store['分公司名稱']}</option>`);
                    
                    // 在地圖上標記
                    let marker = L.marker([store['Latitude'], store['Longitude']]).addTo(markersLayer)
                        .bindPopup(`<b>${store['分公司名稱']}</b><br>${store['Address']}`)
                        .on('click', function() {
                            showNearbyStores(store);
                        });
                });

                if (response.length > 0) {
                    // 調整地圖視窗以包覆所有標記
                    let group = new L.featureGroup(markersLayer.getLayers());
                    map.fitBounds(group.getBounds().pad(0.5));
                } else {
                    alert("該區域內沒有該品牌的分店！");
                }
            },
            error: function() {
                alert("無法取得分店資料。");
            }
        });
    });

    // 當選擇分店時，顯示附近分店
    $('#store').change(function() {
        let selectedIndex = $(this).val();
        if (selectedIndex !== "") {
            let brand = $('#brand').val();
            let county = $('#county').val();
            let district = $('#district').val();

            // 重新請求分店資料
            $.ajax({
                url: '/get_stores',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ brand: brand, county: county, district: district }),
                success: function(response) {
                    let selectedStore = response[selectedIndex];
                    showNearbyStores(selectedStore);
                },
                error: function() {
                    alert("無法取得分店資料。");
                }
            });
        }
    });

    // 顯示附近分店的函式
    function showNearbyStores(store) {
        $.ajax({
            url: '/get_nearby_stores',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ selected_store: store, radius: 0.5 }), // 500m = 0.5km
            success: function(response) {
                $('#store-count').text(`方圓500米內共有 ${response.nearby_stores.length} 間分店`);
                $('#stores-table').empty();
                response.nearby_stores.forEach(function(store) {
                    $('#stores-table').append(`
                        <tr>
                            <td>${store['公司名稱']}</td>
                            <td>${store['分公司名稱']}</td>
                            <td>${store['Address']}</td>
                            <td>${store['距離']}</td>
                        </tr>
                    `);
                });
                $('#competition-index').text(response.competition_index);

                // 在地圖上顯示半徑500m的圓
                markersLayer.clearLayers();
                // 添加選定的分店標記
                L.marker([store['Latitude'], store['Longitude']])
                    .addTo(markersLayer)
                    .bindPopup(`<b>${store['分公司名稱']}</b><br>${store['Address']}`)
                    .openPopup();

                // 添加圓形
                L.circle([store['Latitude'], store['Longitude']], {
                    color: 'blue',
                    fillColor: '#blue',
                    fillOpacity: 0.1,
                    radius: 500
                }).addTo(markersLayer);

                // 添加附近分店標記
                response.nearby_stores.forEach(function(neighbor) {
                    if (neighbor['分公司名稱'] !== store['分公司名稱']) { // 排除選定的分店
                        L.marker([neighbor['Latitude'], neighbor['Longitude']], {
                            icon: L.icon({
                                iconUrl: getIconUrl(neighbor['公司名稱']),
                                iconSize: [25, 25],
                                iconAnchor: [12, 24],
                                popupAnchor: [0, -24]
                            })
                        })
                        .addTo(markersLayer)
                        .bindPopup(`<b>${neighbor['分公司名稱']}</b><br>${neighbor['Address']}<br>距離：${neighbor['距離']} km`);
                    }
                });

                // 調整地圖視窗
                let group = new L.featureGroup(markersLayer.getLayers());
                map.fitBounds(group.getBounds().pad(0.5));
            },
            error: function() {
                alert("無法取得附近分店資料。");
            }
        });
    }

    // 根據公司名稱返回圖示路徑
    function getIconUrl(company) {
        switch(company) {
            case '統一超商股份有限公司':
                return '/static/icons/7eleven.png';
            case '全家便利商店股份有限公司':
                return '/static/icons/familymart.png';
            case '萊爾富國際股份有限公司':
                return '/static/icons/hilife.png';
            case '歐可股份有限公司':
                return '/static/icons/okmart.png';
            default:
                return '/static/icons/default.png';
        }
    }
});
