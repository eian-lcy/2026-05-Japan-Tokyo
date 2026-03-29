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
        '堂吉訶德': 'bg-yellow-50 text-yellow-700 border-yellow-100',
        '3COINS': 'bg-green-50 text-green-700 border-green-100',
        '衣服包包鞋子': 'bg-purple-50 text-purple-700 border-purple-100',
        '超商': 'bg-indigo-50 text-indigo-700 border-indigo-100',
        '伴手禮': 'bg-orange-50 text-orange-700 border-orange-100',
        '其他': 'bg-gray-50 text-gray-700 border-gray-100'
    };

    items.forEach(item => {
        const total = (item.qty_person1 || 0) + (item.qty_person2 || 0) + (item.qty_person3 || 0);
        const colorClass = catColors[item.location] || 'bg-gray-50 text-gray-600';
        container.innerHTML += `
            <div class="bg-white border border-gray-100 shadow-sm p-4 flex flex-col transition hover:shadow-md mb-2">
                <div class="flex items-center gap-4">
                    <input type="checkbox" ${item.is_checked ? 'checked' : ''} onchange="updateCheck('${item.id}', this.checked)" class="accent-slate-800 w-5 h-5 cursor-pointer">
                    <div class="flex-1">
                        <div class="font-bold text-slate-800 text-sm">${item.item_name}</div>
                        <span class="inline-block mt-1 ${colorClass} px-2 py-0.5 rounded-sm text-[10px] border font-medium">${item.location}</span>
                    </div>
                    <div class="text-xs font-bold text-slate-400 border-l pl-3 shrink-0">共 ${total}</div>
                </div>
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
        grid.innerHTML += `
          <div class="flex flex-col bg-white border border-gray-200 shadow-sm hover:shadow-md transition">
            <div class="aspect-square bg-gray-100 overflow-hidden cursor-zoom-in relative" onclick="openLightbox('${item.image_url}', '${item.description || ''}')">
              <img src="${item.image_url}" class="w-full h-full object-cover">
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

// --- 補上 Modal 切換功能 ---
function openModal(item = null) {
    const modal = document.getElementById('add-modal');
    const form = document.getElementById('form-shopping');
    form.reset(); // 清空表單
    
    if (item) {
        // 編輯模式邏輯 (如果有實作的話)
    }
    modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('add-modal').classList.add('hidden');
}
