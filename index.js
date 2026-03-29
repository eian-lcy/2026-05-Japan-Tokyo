// 初始化
checkUser((session) => {
    initLuggageStorage();
    fetchShoppingList();
    fetchReceipts();
    enableRealtime();
});

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

async function fetchShoppingList(category = null) {
    console.log('正在篩選分類:', category || '全部');
    let query = supabaseClient.from('shopping_list').select('*').order('created_at', { ascending: false });
    
    if (category) {
        query = query.eq('location', category); 
    }

    const { data, error } = await query;
    
    if (error) {
        console.error('抓取清單失敗 (401請檢查權限):', error.message);
        alert('無法抓取清單，請確認登入狀態或資料庫權限');
        return;
    }

    renderShoppingList(data);
    updateFilterUI(category);
}

// --- 渲染購物清單 (終極版：總數與彩色標籤整併於右側) ---
function renderShoppingList(items) {
    const container = document.getElementById('shopping-list-container');
    container.innerHTML = '';
    
    if (!items || items.length === 0) {
        container.innerHTML = '<p class="text-center py-10 text-gray-400">目前此分類下沒有物品</p>';
        return;
    }

    const catColors = {
        'MUJI': 'bg-red-50 text-red-700 border-red-100',
        '藥妝店': 'bg-blue-50 text-blue-700 border-blue-100',
        '唐吉訶德': 'bg-yellow-50 text-yellow-700 border-yellow-100',
        '3COINS': 'bg-green-50 text-green-700 border-green-100',
        '衣服包包鞋子': 'bg-purple-50 text-purple-700 border-purple-100',
        '超商': 'bg-indigo-50 text-indigo-700 border-indigo-100',
        '伴手禮': 'bg-orange-50 text-orange-700 border-orange-100',
        '其他': 'bg-gray-50 text-gray-700 border-gray-100'
    };

    items.forEach(item => {
        const q1 = item.qty_person1 || 0;
        const q2 = item.qty_person2 || 0;
        const q3 = item.qty_person3 || 0;
        const total = q1 + q2 + q3;
        const colorClass = catColors[item.location] || 'bg-gray-50 text-gray-600';
        
        // 🎨 彩色標籤群組 (我們把這個從中間搬走)
        let breakdown = [];
        if (q1 > 0) breakdown.push(`賴 <span class="font-bold text-slate-800">${q1}</span>`);
        if (q2 > 0) breakdown.push(`李 <span class="font-bold text-slate-800">${q2}</span>`);
        if (q3 > 0) breakdown.push(`林 <span class="font-bold text-slate-800">${q3}</span>`);
        
        let breakdownHtml = breakdown.length > 0 
            ? breakdown.join('<span class="text-gray-300 mx-1.5">|</span>') 
            : '<span class="text-[10px] text-gray-400">尚未分配</span>';

        // 將 item 資料轉為字串，以便傳入 onclick 編輯
        const itemStr = encodeURIComponent(JSON.stringify(item));

        container.innerHTML += `
            <div class="bg-white border border-gray-100 shadow-sm p-3 flex flex-col transition hover:shadow-md mb-2">
                <div class="flex items-start gap-3">
                    <div class="pt-1">
                        <input type="checkbox" ${item.is_checked ? 'checked' : ''} onchange="updateCheck('${item.id}', this.checked)" class="accent-slate-800 w-5 h-5 cursor-pointer">
                    </div>
                    
                    <div class="flex-1 cursor-pointer" onclick="openModal('${itemStr}')">
                        <div class="font-bold text-slate-800 text-sm">${item.item_name} <span class="text-xs font-normal text-gray-400 ml-1">${item.spec || ''}</span></div>
                        <div class="mt-1.5">
                            <span class="inline-block ${colorClass} px-2 py-0.5 rounded text-[10px] border font-medium">${item.location}</span>
                        </div>
                    </div>

                    <div class="border-l border-gray-100 pl-3 shrink-0 flex flex-col items-end gap-1 cursor-pointer" onclick="openModal('${itemStr}')">
                        <div class="flex items-end gap-1.5">
                            <span class="text-[10px] font-bold text-slate-500 mb-0.5">總計</span>
                            <span class="text-2xl font-extrabold text-slate-900 leading-none">${total}</span>
                        </div>
                        <div class="text-[11px] text-gray-500 flex items-center whitespace-nowrap mt-0.5">
                            ${breakdownHtml}
                        </div>
                    </div>
                </div>
                ${item.remark ? `<div class="mt-2.5 pt-2 border-t border-gray-50 text-xs text-gray-500 cursor-pointer" onclick="openModal('${itemStr}')">📝 ${item.remark}</div>` : ''}
            </div>`;
    });
}
function updateFilterUI(activeCategory) {
    // 修正選擇器以對應 index.html 結構
    const buttons = document.querySelectorAll('#shopping button[onclick^="fetchShoppingList"]');
    buttons.forEach(btn => {
        const isAll = btn.getAttribute('onclick') === 'fetchShoppingList()';
        const match = btn.getAttribute('onclick').match(/'([^']+)'/);
        const btnCat = match ? match[1] : null;

        if ((activeCategory === null && isAll) || (activeCategory !== null && btnCat === activeCategory)) {
            btn.className = 'whitespace-nowrap px-4 py-2 rounded-full border border-slate-800 bg-slate-800 text-white text-xs font-bold transition';
        } else {
            btn.className = 'whitespace-nowrap px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-600 text-xs hover:border-slate-800 transition';
        }
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

function enableRealtime() {
    supabaseClient.channel('public-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_list' }, () => fetchShoppingList()).subscribe();
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
        fileInput.addEventListener('change', function() {
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
        fetchShoppingList(); // 重新抓取最新清單

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
            fetchShoppingList();
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
