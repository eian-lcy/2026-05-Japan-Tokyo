// 初始化
checkUser((session) => {
    initLuggageStorage();
    applyFilters();
    fetchReceipts();
    enableRealtime();
});

/**
 * 快速跳轉並篩選購物清單
 * @param {string} type - 'location' 或 'person'
 * @param {string} value - 篩選的值 (例如 '藥妝店' 或 'qty_person1')
 */

async function navigateToShopping(type, value) {
    // 1. 更新篩選條件
    filters.locations.clear();
    filters.people.clear();
    if (type === 'location' && value) filters.locations.add(value);
    else if (type === 'person' && value) filters.people.add(value);

    // 2. 等待渲染完成
    await applyFilters();

    // 3. 強制展開清單 (為了準確計算高度)
    const container = document.getElementById('shopping-list-container');
    if (container) {
        container.style.maxHeight = 'none';
        const gradient = document.getElementById('shopping-gradient');
        if (gradient) gradient.classList.add('hidden');
        const btn = document.getElementById('btn-expand-shopping');
        if (btn) btn.textContent = '收合清單 ▵';
    }

    // 4. 💡 關鍵修正：給瀏覽器一點時間重繪佈局後再跳轉
    setTimeout(() => {
        const target = document.getElementById('shopping');
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }, 50); // 50ms 的延遲肉眼無感，但對佈局穩定非常有效
}

// --- 行李確認清單 ---
function initLuggageStorage() {
    const checkboxes = document.querySelectorAll('#luggage-list input[type="checkbox"]');
    checkboxes.forEach(cb => {
        const saved = localStorage.getItem(cb.id);
        if (saved !== null) cb.checked = (saved === 'true');
        cb.addEventListener('change', () => { localStorage.setItem(cb.id, cb.checked); });
    });
}

// --- 購物清單 (類別分類) ---
let currentListData = [];

// async function fetchShoppingList(category = null) {
//     // 如果點擊已選中的分類，則取消篩選（設為 null）
//     if (currentActiveCategory === category) {
//         category = null;
//     }

//     currentActiveCategory = category;

//     let query = supabaseClient.from('shopping_list').select('*').order('created_at', { ascending: false });
//     if (category) {
//         query = query.eq('location', category);
//     }

//     const { data, error } = await query;
//     if (error) {
//         console.error('抓取失敗:', error.message);
//         return;
//     }

//     renderShoppingList(data);
//     updateFilterUI(category); // 👈 確保這裡傳入的是最新的 category (或 null)
// }

// --- 渲染購物清單 (加入圖片縮圖與單列明細) ---
function renderShoppingList(items) {
    const container = document.getElementById('shopping-list-container');

    // 1. 基本檢查
    if (!container) return;
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = '<p class="text-center py-10 text-gray-400">目前此分類下沒有物品</p>';
        return;
    }

    const catColors = {
        'MUJI': 'bg-red-50 text-red-700 border-red-100',
        '藥妝店': 'bg-blue-50 text-blue-700 border-blue-100',
        '美妝': 'bg-pink-50 text-pink-700 border-pink-100',
        '唐吉訶德': 'bg-yellow-50 text-yellow-700 border-yellow-100',
        '3COINS': 'bg-green-50 text-green-700 border-green-100',
        '衣服包包鞋子': 'bg-purple-50 text-purple-700 border-purple-100',
        '超商': 'bg-indigo-50 text-indigo-700 border-indigo-100',
        '伴手禮': 'bg-orange-50 text-orange-700 border-orange-100',
        '其他': 'bg-gray-50 text-gray-700 border-gray-100'
    };

    // 2. 開始渲染每一項
    items.forEach(item => {
        const q1 = item.qty_person1 || 0;
        const q2 = item.qty_person2 || 0;
        const q3 = item.qty_person3 || 0;
        const total = q1 + q2 + q3;
        const colorClass = catColors[item.location] || 'bg-gray-50 text-gray-600';

        // --- 分帳結清小工具函式 ---
        const getSettledHtml = (name, qty, isSettled, field, id) => {
            if (qty <= 0) return '';

            const isChecked = isSettled ? 'checked' : '';
            // 結清時加上刪除線與灰色樣式
            const textStyle = isSettled ? 'line-through text-gray-400 font-normal' : 'text-slate-800 font-bold';

            return `
        <label class="flex items-center gap-1.5 cursor-pointer ${textStyle}">
            <input type="checkbox" ${isChecked} 
                onchange="event.stopPropagation(); toggleSettled('${id}', '${field}', this.checked)"
                class="w-3.5 h-3.5 accent-slate-800 rounded border-gray-300">
            <span class="text-[11px]">${name} ${qty}</span>
        </label>
    `;
        };

        // 確保有抓到這三個人的資料
        const b1 = getSettledHtml('賴', item.qty_person1 || 0, item.settled_p1, 'settled_p1', item.id);
        const b2 = getSettledHtml('李', item.qty_person2 || 0, item.settled_p2, 'settled_p2', item.id);
        const b3 = getSettledHtml('林', item.qty_person3 || 0, item.settled_p3, 'settled_p3', item.id);
        let breakdownHtml = [b1, b2, b3].filter(h => h !== '').join('<span class="text-gray-200 mx-1">|</span>');
        if (!breakdownHtml) breakdownHtml = '<span class="text-[10px] text-gray-400">尚未分配</span>';

        const itemStr = encodeURIComponent(JSON.stringify(item));
        const safeName = (item.item_name || '').replace(/'/g, "\\'");

        const imgHtml = item.image_url
            ? `<div class="w-12 h-12 shrink-0 rounded-sm overflow-hidden border border-gray-200 mt-0.5 cursor-zoom-in group" onclick="event.stopPropagation(); openLightbox('${item.image_url}', '${safeName}')">
                 <img src="${item.image_url}" class="w-full h-full object-cover group-hover:scale-110 transition duration-300">
               </div>`
            : '';

        // 3. 組合 HTML (精緻卡片版)
        container.innerHTML += `
            <div class="bg-white border border-gray-100 shadow-sm p-3 flex flex-col transition hover:shadow-md mb-2">
                
                <div class="flex items-start gap-3">
                    
                    ${imgHtml}
                    
                    <div class="flex-1 min-w-0 cursor-pointer" onclick="openModal('${itemStr}')">
                        <div class="font-bold text-slate-800 text-sm md:text-base leading-tight">
                            ${item.item_name} 
                            <span class="text-xs font-normal text-gray-400 ml-1 whitespace-nowrap">${item.spec || ''}</span>
                        </div>
                        <div class="mt-2">
                            <span class="inline-block ${colorClass} px-2 py-0.5 rounded text-[10px] border font-medium">${item.location}</span>
                        </div>
                    </div>
                </div>

                <div class="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                    <div class="text-[11px] flex items-center whitespace-nowrap overflow-x-auto no-scrollbar">
                        ${breakdownHtml}
                    </div>
                    <div class="flex items-end gap-1.5 pl-3 shrink-0">
                        <span class="text-[10px] font-bold text-slate-500 mb-0.5">總計</span>
                        <span class="text-xl font-extrabold text-slate-900 leading-none">${total}</span>
                    </div>
                </div>

                ${item.remark ? `<div class="mt-2 pt-2 border-t border-gray-50 text-xs text-gray-500 cursor-pointer" onclick="openModal('${itemStr}')">📝 ${item.remark}</div>` : ''}
            </div>`;
    });
    // --- 關鍵：已移除下方會造成報錯的舊版 listContainer 渲染邏輯 ---
}

// 建議的狀態結構
let filters = {
    locations: new Set(), // 儲存多個地點
    people: new Set()      // 儲存多個人員欄位
};

async function applyFilters() {
    let query = supabaseClient.from('shopping_list').select('*');
    if (filters.locations.size > 0) query = query.in('location', Array.from(filters.locations));
    if (filters.people.size > 0) {
        const orConditions = Array.from(filters.people).map(p => `${p}.gt.0`).join(',');
        query = query.or(orConditions);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (!error) {
        renderShoppingList(data);
        updateFilterUI();
        // 💡 返回一個成功的信號
        return true;
    }
    return false;
}

// --- 3. 新增按鈕觸發函式 ---

// 處理地點按鈕點擊
function toggleLocationFilter(cat) {
    if (filters.locations.has(cat)) {
        filters.locations.delete(cat); // 已存在則移除
    } else {
        filters.locations.add(cat);    // 不存在則加入
    }
    applyFilters();
}

// 處理個人按鈕點擊
function togglePersonFilter(field) {
    if (!field) {
        filters.people.clear(); // 若傳入 null (點擊全體人員)，清空選取
    } else {
        if (filters.people.has(field)) {
            filters.people.delete(field);
        } else {
            filters.people.add(field);
        }
    }
    applyFilters();
}

function toggleExpandShopping() {
    const container = document.getElementById('shopping-list-container');
    const btn = document.getElementById('btn-expand-shopping');
    const gradient = document.getElementById('shopping-gradient');

    // 防錯：如果找不到元素就跳出，避免報錯
    if (!container || !gradient) return;

    if (container.style.maxHeight === 'none') {
        container.style.maxHeight = '400px';
        gradient.classList.remove('hidden'); // 顯示遮罩
        btn.textContent = '顯示全部品項 ▿';
        document.getElementById('shopping').scrollIntoView({ behavior: 'smooth' });
    } else {
        container.style.maxHeight = 'none';
        gradient.classList.add('hidden'); // 隱藏遮罩
        btn.textContent = '收合清單 ▵';
    }
}

// --- index.js ---

function updateFilterUI() {
    const buttons = document.querySelectorAll('#shopping button[onclick]');
    buttons.forEach(btn => {
        const attr = btn.getAttribute('onclick');
        let isSelected = false;

        // 檢查地點按鈕是否在 Set 中
        filters.locations.forEach(loc => {
            if (attr.includes(`toggleLocationFilter('${loc}')`)) isSelected = true;
        });

        // 檢查人員按鈕是否在 Set 中
        filters.people.forEach(p => {
            if (attr.includes(`togglePersonFilter('${p}')`)) isSelected = true;
        });

        // 「全部」按鈕：當地點與個人都沒選時亮起
        if (filters.locations.size === 0 && filters.people.size === 0 && (attr.includes('null') || attr.includes('applyFilters'))) {
            isSelected = true;
        }

        // 特別處理「全體人員」按鈕
        if (filters.people.size === 0 && attr.includes("togglePersonFilter(null)")) {
            isSelected = true;
        }

        btn.className = isSelected
            ? 'whitespace-nowrap px-4 py-2 rounded-full border border-slate-800 bg-slate-800 text-white text-xs font-bold transition'
            : 'whitespace-nowrap px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-600 text-xs hover:border-slate-800 transition';
    });
}
// --- 收據紀錄 ---
async function fetchReceipts() {
    const { data, error } = await supabaseClient.from('receipts').select('*').order('created_at', { ascending: false });
    if (!error) renderReceipts(data);
}

function renderReceipts(items) {
    const grid = document.getElementById('receipts-grid');
    grid.innerHTML = items.length === 0 ? '<div class="col-span-full text-center py-8 text-gray-400 text-sm">目前尚無照片</div>' : '';

    items.forEach(item => {
        // 處理沒有備註時的顯示文字
        const descText = item.description ? item.description : '<span class="text-gray-400 text-[10px]">無備註</span>';
        // 處理單引號跳脫，避免文字內有單引號導致 onclick 壞掉
        const safeDesc = (item.description || '').replace(/'/g, "\\'");

        grid.innerHTML += `
          <div class="flex flex-col bg-white border border-gray-200 shadow-sm hover:shadow-md transition">
            <div class="aspect-square bg-gray-100 overflow-hidden cursor-zoom-in relative group" onclick="openLightbox('${item.image_url}', '${safeDesc}')">
              <img src="${item.image_url}" class="w-full h-full object-cover group-hover:opacity-90 transition">
              <div class="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 group-hover:opacity-100 transition">
                  <span class="text-white text-xs font-bold bg-slate-800/80 px-2 py-1 rounded shadow-sm">🔍 放大</span>
              </div>
            </div>
            <div class="p-3 flex justify-between items-start gap-2">
                <div class="text-xs text-slate-700 line-clamp-2 flex-1 whitespace-pre-wrap leading-relaxed">${descText}</div>
                <button onclick="openReceiptModal('${item.id}', '${safeDesc}')" class="text-gray-400 hover:text-slate-800 transition p-1 bg-gray-50 hover:bg-gray-100 rounded">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
            </div>
          </div>`;
    });
}

function renderPersonSettled(item, name, qtyField, settledField) {
    const qty = item[qtyField] || 0;
    if (qty === 0) return ''; // 沒買的人不顯示

    const isSettled = item[settledField];
    return `
        <label class="flex items-center gap-1 cursor-pointer ${isSettled ? 'text-gray-400 line-through' : 'text-slate-700'}">
            <input type="checkbox" 
                ${isSettled ? 'checked' : ''} 
                onchange="toggleSettled('${item.id}', '${settledField}', this.checked)"
                class="rounded-sm border-gray-300">
            ${name}: ${qty}
        </label>
    `;
}
// 處理分帳結清勾選
async function toggleSettled(id, field, isChecked) {
    console.log(`更新結清狀態: ${id}, ${field} -> ${isChecked}`);
    const { error } = await supabaseClient
        .from('shopping_list')
        .update({ [field]: isChecked })
        .eq('id', id);

    if (error) {
        console.error('結清更新失敗:', error.message);
        alert('更新失敗，請檢查權限');
    }
    // 注意：因為有 enableRealtime，畫面會自動重繪，不需要手動 fetch
}

// --- 開啟即時更新 (同時監聽購物清單與收據) ---
function enableRealtime() {
    const channel = supabaseClient.channel('public-changes');

    // 監聽購物清單變化
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_list' }, () => {
        // ✅ 直接呼叫 applyFilters，它會自動讀取當前的 filters 狀態
        applyFilters();
    });

    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'receipts' }, () => {
        fetchReceipts();
    });

    // 2. 監聽收據照片的變化 (👉 這次補上這個！)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'receipts' }, () => {
        fetchReceipts();
    });

    // 啟動監聽
    channel.subscribe();
}

function toggleAccordion(id) {
    const el = document.getElementById(id);
    el.style.maxHeight = el.style.maxHeight && el.style.maxHeight !== '0px' ? '0px' : el.scrollHeight + 'px';
}

// --- 補上缺失的 updateCheck ---
async function updateCheck(id, isChecked) {
    const { error } = await supabaseClient
        .from('shopping_list')
        .update({ is_checked: isChecked })
        .eq('id', id);

    if (error) {
        console.error('更新失敗:', error.message);
        alert('更新狀態失敗');
    }
}

// --- 補上完整的 Modal 切換與編輯功能 ---
function openModal(itemStr = null) {
    const modal = document.getElementById('add-modal');
    const form = document.getElementById('form-shopping');
    const deleteBtn = document.getElementById('btn-delete');
    const title = document.getElementById('modal-title');

    // 1. 每次打開前先重置所有欄位與圖片預覽
    form.reset();
    document.getElementById('form-id').value = '';
    document.getElementById('form-image-url').value = '';
    document.getElementById('img-preview-container').classList.add('hidden');
    document.getElementById('form-img-preview').src = '';

    if (itemStr) {
        // 2. 編輯模式：將剛剛傳進來的字串解析回物件
        const item = JSON.parse(decodeURIComponent(itemStr));

        document.getElementById('form-id').value = item.id;
        document.getElementById('form-name').value = item.item_name;
        document.getElementById('form-spec').value = item.spec || '';
        document.getElementById('form-remark').value = item.remark || '';
        document.getElementById('form-qty1').value = item.qty_person1 || 0;
        document.getElementById('form-qty2').value = item.qty_person2 || 0;
        document.getElementById('form-qty3').value = item.qty_person3 || 0;
        document.getElementById('form-location').value = item.location || '其他';

        // 如果原本有圖片，顯示預覽
        if (item.image_url) {
            document.getElementById('form-image-url').value = item.image_url;
            document.getElementById('form-img-preview').src = item.image_url;
            document.getElementById('img-preview-container').classList.remove('hidden');
        }

        title.textContent = '編輯品項';
        if (deleteBtn) deleteBtn.classList.remove('hidden');
    } else {
        // 3. 新增模式
        title.textContent = '新增購物清單';
        if (deleteBtn) deleteBtn.classList.add('hidden');
    }

    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('add-modal').classList.add('hidden');
}

// --- 切換右下角浮動選單 (FAB) ---
function toggleFab() {
    const fabMenu = document.getElementById('fab-menu');
    if (fabMenu) {
        fabMenu.classList.toggle('hidden');
    }
}

// --- 處理收據照片上傳 ---
async function uploadReceipt(input) {
    const file = input.files[0];
    if (!file) return;

    const btn = document.getElementById('btn-upload-receipt');
    const originalText = btn.innerHTML;

    // 改變按鈕狀態，讓使用者知道正在上傳
    btn.innerHTML = '⏳ 上傳中...';
    btn.disabled = true;
    btn.classList.add('opacity-70', 'cursor-not-allowed');

    try {
        // 1. 產生獨一無二的檔名，避免覆蓋
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `receipts/${fileName}`;

        // 2. 上傳圖片到 Supabase Storage (假設你的 Bucket 叫做 'images')
        const { error: uploadError } = await supabaseClient.storage
            .from('images')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 3. 取得公開網址
        const { data: { publicUrl } } = supabaseClient.storage.from('images').getPublicUrl(filePath);

        // 4. 將網址寫入資料庫的 receipts 表格
        const { error: dbError } = await supabaseClient.from('receipts').insert([
            { image_url: publicUrl, description: '' }
        ]);

        if (dbError) throw dbError;

        // 5. 重新載入畫面上的照片
        fetchReceipts();

    } catch (error) {
        console.error('照片上傳失敗:', error);
        alert('照片上傳失敗，請檢查網路連線或檔案大小！\n錯誤訊息: ' + error.message);
    } finally {
        // 恢復按鈕狀態，並清空 input 讓下次可以選同一張圖
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.classList.remove('opacity-70', 'cursor-not-allowed');
        input.value = '';
    }
}

// --- 購物清單 Modal：選擇圖片時馬上顯示預覽 ---
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('form-file-input');
    if (fileInput) {
        fileInput.addEventListener('change', function () {
            const file = this.files[0];
            if (!file) return;

            // 使用 FileReader 在本地端馬上產生預覽圖
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('form-img-preview').src = e.target.result;
                document.getElementById('img-preview-container').classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        });
    }
});

// --- 處理購物清單的儲存 (包含圖片上傳與文字資料) ---
async function saveShoppingItem(event) {
    event.preventDefault(); // 防止表單送出刷新頁面

    const btnSave = document.getElementById('btn-save');
    btnSave.textContent = '⏳ 儲存中...';
    btnSave.disabled = true;

    try {
        let imageUrl = document.getElementById('form-image-url').value;
        const fileInput = document.getElementById('form-file-input');
        const file = fileInput.files[0];

        // 如果使用者有選新圖片，就先上傳圖片
        if (file) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `shopping/${fileName}`;

            const { error: uploadError } = await supabaseClient.storage
                .from('images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 取得圖片公開網址
            const { data: { publicUrl } } = supabaseClient.storage.from('images').getPublicUrl(filePath);
            imageUrl = publicUrl;
        }

        // 整理要存入資料庫的資料
        const itemData = {
            item_name: document.getElementById('form-name').value,
            spec: document.getElementById('form-spec').value,
            remark: document.getElementById('form-remark').value,
            qty_person1: parseInt(document.getElementById('form-qty1').value) || 0,
            qty_person2: parseInt(document.getElementById('form-qty2').value) || 0,
            qty_person3: parseInt(document.getElementById('form-qty3').value) || 0,
            location: document.getElementById('form-location').value,
            image_url: imageUrl || null
        };

        const id = document.getElementById('form-id').value;

        // 如果有 ID 代表是編輯，沒有 ID 代表是新增
        if (id) {
            await supabaseClient.from('shopping_list').update(itemData).eq('id', id);
        } else {
            await supabaseClient.from('shopping_list').insert([itemData]);
        }

        closeModal();
        applyFilters(); // 重新抓取最新清單

    } catch (error) {
        console.error('儲存失敗:', error);
        alert('儲存失敗！\n' + error.message);
    } finally {
        btnSave.textContent = '儲存';
        btnSave.disabled = false;
    }
}

// --- 順便補上刪除購物清單功能 ---
async function deleteShoppingItem() {
    const id = document.getElementById('form-id').value;
    if (!id) return;

    if (confirm('確定要刪除這個品項嗎？')) {
        const { error } = await supabaseClient.from('shopping_list').delete().eq('id', id);
        if (!error) {
            closeModal();
            applyFilters();
        } else {
            alert('刪除失敗：' + error.message);
        }
    }
}
// --- 收據照片的備註與刪除邏輯 ---

function openReceiptModal(id, currentDesc) {
    document.getElementById('receipt-id').value = id;
    document.getElementById('receipt-desc').value = currentDesc;
    document.getElementById('receipt-modal').classList.remove('hidden');
}

function closeReceiptModal() {
    document.getElementById('receipt-modal').classList.add('hidden');
    document.getElementById('receipt-id').value = '';
    document.getElementById('receipt-desc').value = '';
}

async function saveReceiptDesc() {
    const id = document.getElementById('receipt-id').value;
    const desc = document.getElementById('receipt-desc').value;
    if (!id) return;

    const btn = document.getElementById('btn-save-receipt');
    const originalText = btn.textContent;
    btn.textContent = '⏳ 儲存中...';
    btn.disabled = true;

    // 更新資料庫中的 description 欄位
    const { error } = await supabaseClient.from('receipts').update({ description: desc }).eq('id', id);

    btn.textContent = originalText;
    btn.disabled = false;

    if (!error) {
        closeReceiptModal();
        fetchReceipts(); // 重新載入畫面
    } else {
        alert('備註儲存失敗：' + error.message);
    }
}

async function deleteReceipt() {
    const id = document.getElementById('receipt-id').value;
    if (!id) return;

    if (confirm('確定要刪除這張照片與紀錄嗎？\n(此動作無法復原喔！)')) {
        // 從資料庫刪除該筆資料
        const { error } = await supabaseClient.from('receipts').delete().eq('id', id);

        if (!error) {
            closeReceiptModal();
            fetchReceipts(); // 重新載入畫面
        } else {
            alert('刪除失敗：' + error.message);
        }
    }
}
// --- 📄 旅遊文件管理 (機票/住宿/保險) ---

// 打開 Modal 並抓取資料
async function openDocModal(category) {
    const modal = document.getElementById('doc-modal');
    const title = document.getElementById('doc-modal-title');
    const categoryInput = document.getElementById('doc-category');

    const titles = {
        'flight': '航班相關文件',
        'stay': '住宿憑證/地圖',
        'insurance': '電子保單/緊急聯絡'
    };

    title.textContent = titles[category] || '相關文件';
    categoryInput.value = category;
    modal.classList.remove('hidden');

    fetchDocuments(category);
}

function closeDocModal() {
    document.getElementById('doc-modal').classList.add('hidden');
}

// 抓取文件清單
async function fetchDocuments(category) {
    const listContainer = document.getElementById('doc-list');
    listContainer.innerHTML = '<p class="text-center text-gray-400 text-[10px] py-4">載入中...</p>';

    const { data, error } = await supabaseClient
        .from('travel_docs') // 對應你截圖中的資料表名稱
        .select('*')
        .eq('category', category)
        .order('created_at', { ascending: false });

    if (error) {
        listContainer.innerHTML = `<p class="text-red-500 text-[10px] py-4">抓取失敗</p>`;
        return;
    }

    if (!data || data.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-gray-400 text-[10px] py-4">目前尚無文件</p>';
        return;
    }

    listContainer.innerHTML = data.map(doc => `
        <div class="flex justify-between items-center p-3 bg-gray-50 border border-gray-100 rounded-sm mb-2">
            <a href="${doc.file_url}" target="_blank" class="text-xs text-slate-700 hover:text-blue-600 truncate flex-1 mr-2 underline">
                📄 ${doc.file_name || '查看文件'}
            </a>
            <button onclick="deleteDocument('${doc.id}', '${category}')" class="text-gray-400 hover:text-red-500 text-[10px]">
                刪除
            </button>
        </div>
    `).join('');
}

// 上傳文件
async function uploadDocument(input) {
    const file = input.files[0];
    const category = document.getElementById('doc-category').value;
    if (!file) return;

    const btn = document.getElementById('btn-upload-doc');
    btn.innerHTML = '⏳ 上傳中...';
    btn.disabled = true;

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${category}_${Date.now()}.${fileExt}`;
        const filePath = `documents/${fileName}`;

        // 1. 上傳至 Storage
        const { error: uploadError } = await supabaseClient.storage
            .from('images')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // 2. 取得連結
        const { data: { publicUrl } } = supabaseClient.storage.from('images').getPublicUrl(filePath);

        // 3. 存入 travel_docs 表
        const { error: dbError } = await supabaseClient.from('travel_docs').insert([
            { category, file_url: publicUrl, file_name: file.name }
        ]);

        if (dbError) throw dbError;
        fetchDocuments(category);
    } catch (error) {
        alert('上傳失敗：' + error.message);
    } finally {
        btn.innerHTML = '＋ 上傳新文件 (PDF / 圖片)';
        btn.disabled = false;
        input.value = '';
    }
}

async function deleteDocument(id, category) {
    if (!confirm('確定要刪除此文件嗎？')) return;
    const { error } = await supabaseClient.from('travel_docs').delete().eq('id', id);
    if (!error) fetchDocuments(category);
}
// 監聽所有 Modal 的背景點擊
window.onclick = function (event) {
    const docModal = document.getElementById('doc-modal');
    const addModal = document.getElementById('add-modal');
    const receiptModal = document.getElementById('receipt-modal');
    const noteModal = document.getElementById('note-modal'); // 下方新增的

    if (event.target === docModal) closeDocModal();
    if (event.target === addModal) closeModal();
    if (event.target === receiptModal) closeReceiptModal();
    if (event.target === noteModal) closeNoteModal();
};
function openNoteModal() {
    document.getElementById('note-modal').classList.remove('hidden');
}
function closeNoteModal() {
    document.getElementById('note-modal').classList.add('hidden');
}
