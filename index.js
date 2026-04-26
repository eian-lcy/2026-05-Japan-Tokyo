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
    showTab('shopping');
    // 1. 更新篩選條件
    filters.location = null;
    filters.people.clear();
    if (type === 'location' && value) filters.location = value;
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

function showSkeleton() {
    const container = document.getElementById('shopping-list-container');
    container.innerHTML = `
        <div class="animate-pulse flex flex-col gap-4">
            <div class="h-24 bg-gray-200 rounded-sm"></div>
            <div class="h-24 bg-gray-200 rounded-sm"></div>
        </div>
    `;
}
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

    // 💡 統一使用這個成員 HTML 產生器，整合「結清」與「優先級 (🔥👀)」
    const getMemberHtml = (name, qtySelf, qtyProxy, isSettled, field, id, priority) => {
        const totalQty = (qtySelf || 0) + (qtyProxy || 0);
        if (totalQty <= 0) return '';

        const isChecked = isSettled ? 'checked' : '';
        const textStyle = isSettled ? 'line-through text-gray-400 font-normal' : 'text-slate-800 font-bold';
        const priorityIcon = priority === 1 ? '<span class="text-red-500 mr-0.5">🔥</span>' :
            priority === 2 ? '<span class="text-blue-500 mr-0.5">👀</span>' : '';

        // 💡 格式：賴 1(+2) 代表自用 1 個，代購 2 個
        const displayQty = qtyProxy > 0 ? `${qtySelf}<span class="text-blue-500 ml-0.5">(+${qtyProxy})</span>` : qtySelf;

        return `
        <label class="flex items-center gap-1 cursor-pointer ${textStyle}">
            <input type="checkbox" ${isChecked} onchange="event.stopPropagation(); toggleSettled('${id}', '${field}', this.checked)"
                class="w-3.5 h-3.5 accent-slate-800 rounded border-gray-300">
            <span class="text-[11px] flex items-center">${priorityIcon}${name} ${displayQty}</span>
        </label>
    `;
    };
    // const getMemberHtml = (name, qty, isSettled, field, id, priority) => {
    //     if (qty <= 0) return '';

    //     const isChecked = isSettled ? 'checked' : '';
    //     const textStyle = isSettled ? 'line-through text-gray-400 font-normal' : 'text-slate-800 font-bold';

    //     // 根據 priority 顯示圖示
    //     const priorityIcon = priority === 1 ? '<span class="text-red-500 mr-0.5">🔥</span>' :
    //         priority === 2 ? '<span class="text-blue-500 mr-0.5">👀</span>' : '';

    //     return `
    //         <label class="flex items-center gap-1 cursor-pointer ${textStyle}">
    //             <input type="checkbox" ${isChecked} 
    //                 onchange="event.stopPropagation(); toggleSettled('${id}', '${field}', this.checked)"
    //                 class="w-3.5 h-3.5 accent-slate-800 rounded border-gray-300">
    //             <span class="text-[11px] flex items-center">${priorityIcon}${name} ${qty}</span>
    //         </label>
    //     `;
    // };

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
        const s1 = item.qty_person1 || 0, p1 = item.qty_p1_proxy || 0;
        const s2 = item.qty_person2 || 0, p2 = item.qty_p2_proxy || 0;
        const s3 = item.qty_person3 || 0, p3 = item.qty_p3_proxy || 0;

        const total = s1 + p1 + s2 + p2 + s3 + p3; // 💡 總計包含代購

        const b1 = getMemberHtml('賴', s1, p1, item.settled_p1, 'settled_p1', item.id, item.priority_p1);
        const b2 = getMemberHtml('李', s2, p2, item.settled_p2, 'settled_p2', item.id, item.priority_p2);
        const b3 = getMemberHtml('林', s3, p3, item.settled_p3, 'settled_p3', item.id, item.priority_p3);
        // const q1 = item.qty_person1 || 0;
        // const q2 = item.qty_person2 || 0;
        // const q3 = item.qty_person3 || 0;
        // const total = q1 + q2 + q3;
        const colorClass = catColors[item.location] || 'bg-gray-50 text-gray-600';

        // 呼叫外部定義的 getMemberHtml
        // const b1 = getMemberHtml('賴', q1, item.settled_p1, 'settled_p1', item.id, item.priority_p1);
        // const b2 = getMemberHtml('李', q2, item.settled_p2, 'settled_p2', item.id, item.priority_p2);
        // const b3 = getMemberHtml('林', q3, item.settled_p3, 'settled_p3', item.id, item.priority_p3);

        let breakdownHtml = [b1, b2, b3].filter(h => h !== '').join('<span class="text-gray-200 mx-1">|</span>');
        if (!breakdownHtml) breakdownHtml = '<span class="text-[10px] text-gray-400">尚未分配</span>';

        const itemStr = encodeURIComponent(JSON.stringify(item));
        const safeName = (item.item_name || '').replace(/'/g, "\\'");

        const imgHtml = item.image_url
            ? `<div class="w-12 h-12 shrink-0 rounded-sm overflow-hidden border border-gray-200 mt-0.5 cursor-zoom-in group" onclick="event.stopPropagation(); openLightbox('${item.image_url}', '${safeName}')">
                 <img src="${item.image_url}" class="w-full h-full object-cover group-hover:scale-110 transition duration-300">
               </div>`
            : '';

        // 3. 組合 HTML (修正了標籤空格與事件放置位置)
        container.innerHTML += `
            <div class="shopping-card bg-white border border-gray-100 shadow-sm p-3 flex flex-col transition hover:shadow-md mb-2"
                 ontouchstart="startLongPress(event, '${item.id}')" 
                 ontouchend="cancelLongPress()"
                 oncontextmenu="handleRightClick(event, '${item.id}')">
                
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
}
let longPressTimer;
function startLongPress(e, itemId) {
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    // 如果使用者移動手指，通常代表要捲動網頁而非長按
    // 我們可以加一個 move 監聽來取消計時器
    const cancelOnMove = () => {
        clearTimeout(longPressTimer);
        document.removeEventListener('touchmove', cancelOnMove);
    };
    document.addEventListener('touchmove', cancelOnMove);

    longPressTimer = setTimeout(() => {
        showContextMenu(x, y, itemId);
    }, 600); // 0.6秒視為長按
}

function cancelLongPress() {
    clearTimeout(longPressTimer);
}

async function showContextMenu(x, y, itemId) {
    const menu = document.getElementById('context-menu');
    if (!menu) return;
    // 根據 itemId 抓取該品項資料 (略過，假設已有)

    menu.innerHTML = `
            <div class="px-4 py-2 text-[10px] text-gray-400 font-bold">設定購買優先級</div>
                ${['賴', '李', '林'].map((name, i) => `
            <div class="menu-item" onclick="quickUpdatePriority('${itemId}', 'p${i + 1}', 1)">
                <span>${name}：🔥 必買</span>
            </div>
            <div class="menu-item" onclick="quickUpdatePriority('${itemId}', 'p${i + 1}', 2)">
                <span>${name}：👀 看看</span>
            </div>
            ${i < 2 ? '<div class="menu-divider"></div>' : ''}
        `).join('')
        }
        `;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = 'block';

    // 💡 聰明的邊界檢查：防止選單超出螢幕右側或下方
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let finalX = x;
    let finalY = y;

    if (x + menuWidth > windowWidth) finalX = windowWidth - menuWidth - 10;
    if (y + menuHeight > windowHeight) finalY = windowHeight - menuHeight - 10;

    menu.style.left = `${finalX}px`;
    menu.style.top = `${finalY}px`;

    // 💡 點擊選單以外的地方就關閉 (電腦端常用體驗)
    const closeMenu = () => {
        menu.style.display = 'none';
        document.removeEventListener('click', closeMenu);
    };
    // 延遲一點點監聽，避免本次右鍵點擊立刻觸發關閉
    setTimeout(() => document.addEventListener('click', closeMenu), 10);

    // 點擊其他地方關閉選單
    document.addEventListener('click', () => menu.style.display = 'none', { once: true });
}

// 快速更新資料庫
async function quickUpdatePriority(id, person, status) {
    const field = `priority_${person}`;
    await supabaseClient.from('shopping_list').update({ [field]: status }).eq('id', id);
    // applyFilters() 自動重繪畫面
}

// 建議的狀態結構
let filters = {
    location: null, // 儲存單一地點
    people: new Set()      // 儲存多個人員欄位
};

let searchKeyword = '';
let currentSort = 'created_at';

// 2. 處理搜尋輸入
function handleSearch(e) {
    searchKeyword = e.target.value.trim();
    applyFilters(); // 觸發重繪
}

// 3. 處理排序切換
function handleSort(e) {
    currentSort = e.target.value;
    applyFilters();
}
async function applyFilters() {
    let query = supabaseClient.from('shopping_list').select('*');

    // 地點篩選
    if (filters.location) query = query.eq('location', filters.location);

    // 人員篩選：多選 or 查詢
    if (filters.people.size > 0) {
        const orConditions = Array.from(filters.people)
            .map(p => `${p}.gt.0`)
            .join(',');
        query = query.or(orConditions);
    }

    // 💡 關鍵字搜尋 (不分大小寫)
    if (searchKeyword) {
        query = query.ilike('item_name', `%${searchKeyword}%`);
    }

    /// 💡 排序邏輯
    if (currentSort === 'priority_p1') {
        // 先排優先級(1>2>0)，再排時間
        query = query.order('priority_p1', { ascending: true }).order('created_at', { ascending: false });
    } else {
        query = query.order(currentSort, { ascending: currentSort === 'location' });
    }
    const { data, error } = await query;

    if (!error) {
        renderShoppingList(data);
        document.getElementById('item-count').textContent = `${data.length} items`;
        updateFilterUI();
    }
}


// --- 3. 新增按鈕觸發函式 ---

// 處理地點按鈕點擊
function toggleLocationFilter(cat) {
    if (cat === null) {
        filters.location = null; // 💡 點擊「全部」時直接設為 null
    } else {
        // 單選切換邏輯
        filters.location = (filters.location === cat) ? null : cat;
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

        // --- 處理商店地點按鈕 ---
        if (attr.includes('toggleLocationFilter')) {
            // 如果 onclick 包含 null 且目前狀態也是 null
            if (attr.includes('null')) {
                if (filters.location === null) isSelected = true;
            }
            // 如果目前有選特定地點，且 onclick 包含該地點名稱
            else if (filters.location && attr.includes(`'${filters.location}'`)) {
                isSelected = true;
            }
        }

        // --- 處理個人篩選按鈕 (保持 Set 邏輯) ---
        if (attr.includes('togglePersonFilter')) {
            if (attr.includes('null')) {
                if (filters.people.size === 0) isSelected = true;
            } else {
                filters.people.forEach(p => {
                    if (attr.includes(`'${p}'`)) isSelected = true;
                });
            }
        }

        // 套用樣式
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
            <div class="flex flex-col bg-white border border-gray-200 shadow-sm hover:shadow-md transition" >
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
          </div> `;
    });
}

function renderPersonSettled(item, name, qtyField, settledField) {
    const qty = item[qtyField] || 0;
    if (qty === 0) return ''; // 沒買的人不顯示

    const isSettled = item[settledField];
    return `
            <label class="flex items-center gap-1 cursor-pointer ${isSettled ? 'text-gray-400 line-through' : 'text-slate-700'}" >
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
/** 
* @param {number} p1 - 賴的優先級 (0, 1, 2)
* @param {number} p2 - 李的優先級
* @param {number} p3 - 林的優先級
*/
function updateDotStyles(p1, p2, p3) {
    const pStatus = { p1, p2, p3 };

    Object.keys(pStatus).forEach(key => {
        const dot = document.getElementById(`dot-${key}`);
        if (!dot) return; // 沒找到元素就跳過，防止報錯

        const status = pStatus[key];
        // 根據狀態套用 CSS 類別
        // 0: 無色, 1: must-buy (紅), 2: looking (藍)
        dot.className = 'priority-dot ' +
            (status === 1 ? 'must-buy' : status === 2 ? 'looking' : '');
    });
}
/**
 * 💡 點擊 Modal 內的小圓圈時，循環切換狀態：0 -> 1 -> 2 -> 0
 * @param {string} pKey - 哪個人 (p1, p2, 或 p3)
 */
function cyclePriority(pKey) {
    // 1. 取得儲存數值的隱藏欄位 (0, 1, 2)
    const hiddenInput = document.getElementById(`form-priority-${pKey}`);
    if (!hiddenInput) return;

    // 2. 計算下一個狀態
    let currentVal = parseInt(hiddenInput.value) || 0;
    let nextVal = (currentVal + 1) % 3;
    hiddenInput.value = nextVal;

    // 3. 取得畫面上的小圓圈元素並立即更新顏色
    const dot = document.getElementById(`dot-${pKey}`);
    if (dot) {
        // 根據數值切換 CSS Class
        const classes = nextVal === 1 ? 'must-buy' : nextVal === 2 ? 'looking' : '';
        dot.className = `priority-dot ${classes}`;
    }
}
// --- 補上完整的 Modal 切換與編輯功能 ---
function openModal(itemStr = null) {
    const modal = document.getElementById('add-modal');
    const form = document.getElementById('form-shopping');
    const deleteBtn = document.getElementById('btn-delete');
    const title = document.getElementById('modal-title');

    if (form) form.reset();

    // 1. 初始化預設值
    let p1 = 0, p2 = 0, p3 = 0;
    let imageUrl = '';

    // 💡 取得 DOM 元素 (根據你提供的 id="form-name" 修改)
    const elId = document.getElementById('form-id');
    const elName = document.getElementById('form-name'); // 修正：對齊你的 HTML ID
    const elSpec = document.getElementById('form-spec');
    const elRemark = document.getElementById('form-remark');
    const elLocation = document.getElementById('form-location');
    const elQty1 = document.getElementById('form-qty1');
    const elQty2 = document.getElementById('form-qty2');
    const elQty3 = document.getElementById('form-qty3');
    const elQty1P = document.getElementById('form-qty1-proxy');
    const elQty2P = document.getElementById('form-qty2-proxy');
    const elQty3P = document.getElementById('form-qty3-proxy');
    const elImgUrl = document.getElementById('form-image-url');
    const elImgPreview = document.getElementById('form-img-preview');
    const elImgContainer = document.getElementById('img-preview-container');

    // 預設狀態清理
    if (elImgContainer) elImgContainer.classList.add('hidden');
    if (elId) elId.value = '';

    // 2. 判斷模式
    if (itemStr) {
        try {
            // 💡 統一使用 itemData 變數
            const itemData = JSON.parse(decodeURIComponent(itemStr));

            if (elId) elId.value = itemData.id || '';
            if (elName) elName.value = itemData.item_name || ''; // 這裡讀取資料庫的 item_name 填入 form-name
            if (elSpec) elSpec.value = itemData.spec || '';
            if (elRemark) elRemark.value = itemData.remark || '';
            if (elLocation) elLocation.value = itemData.location || '其他';
            if (elQty1) elQty1.value = itemData.qty_person1 || 0;
            if (elQty2) elQty2.value = itemData.qty_person2 || 0;
            if (elQty3) elQty3.value = itemData.qty_person3 || 0;
            if (elQty1P) elQty1P.value = itemData.qty_p1_proxy || 0;
            if (elQty2P) elQty2P.value = itemData.qty_p2_proxy || 0;
            if (elQty3P) elQty3P.value = itemData.qty_p3_proxy || 0;

            p1 = itemData.priority_p1 || 0;
            p2 = itemData.priority_p2 || 0;
            p3 = itemData.priority_p3 || 0;
            imageUrl = itemData.image_url || '';

            title.textContent = '編輯品項';
            if (deleteBtn) deleteBtn.classList.remove('hidden');
        } catch (e) {
            console.error('解析資料失敗:', e);
        }
    } else {
        if (elQty1P) elQty1P.value = 0;
        if (elQty2P) elQty2P.value = 0;
        if (elQty3P) elQty3P.value = 0;
        // 新增模式
        title.textContent = '新增購物清單';
        if (deleteBtn) deleteBtn.classList.add('hidden');
    }

    // 3. 處理圖片預覽
    if (imageUrl && elImgUrl && elImgPreview && elImgContainer) {
        elImgUrl.value = imageUrl;
        elImgPreview.src = imageUrl;
        elImgContainer.classList.remove('hidden');
    }

    // 4. 更新隱藏的優先級欄位 (重要：供 save 時讀取)
    const fP1 = document.getElementById('form-priority-p1');
    const fP2 = document.getElementById('form-priority-p2');
    const fP3 = document.getElementById('form-priority-p3');
    document.getElementById('form-priority-p1').value = p1;
    document.getElementById('form-priority-p2').value = p2;
    document.getElementById('form-priority-p3').value = p3;
    if (fP1) fP1.value = p1;
    if (fP2) fP2.value = p2;
    if (fP3) fP3.value = p3;

    // 5. 更新 UI 標籤上的小圓圈 (賴/李/林)
    const updateLabelWithDot = (labelId, personName, status, personKey) => {
        const labelEl = document.getElementById(labelId);
        if (labelEl) {
            const classes = status === 1 ? 'must-buy' : status === 2 ? 'looking' : '';
            // 💡 標籤緊貼，移除空格
            labelEl.innerHTML = `${personName}<span class="priority-dot ${classes}" id="dot-${personKey}" onclick="cyclePriority('${personKey}')"></span>`;
        }
    };

    updateModalLabels(p1, p2, p3);
    // 最後顯示 Modal
    modal.classList.remove('hidden');
}

// 輔助函式：更新 Modal 內的文字標籤
function updateModalLabels(p1, p2, p3) {
    const labels = [
        { id: 'p1', name: '賴', val: p1 },
        { id: 'p2', name: '李', val: p2 },
        { id: 'p3', name: '林', val: p3 }
    ];

    labels.forEach(person => {
        const labelEl = document.getElementById(`form-label-${person.id}`);
        if (labelEl) {
            const dotClass = person.val === 1 ? 'must-buy' : person.val === 2 ? 'looking' : '';
            // 💡 確保這裡的 HTML 標籤沒有空格
            labelEl.innerHTML = `${person.name}<span class="priority-dot ${dotClass}" id="dot-${person.id}" onclick="cyclePriority('${person.id}')"></span>`;
        }
    });
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

            qty_p1_proxy: parseInt(document.getElementById('form-qty1-proxy').value) || 0,
            qty_p2_proxy: parseInt(document.getElementById('form-qty2-proxy').value) || 0,
            qty_p3_proxy: parseInt(document.getElementById('form-qty3-proxy').value) || 0,

            location: document.getElementById('form-location').value,
            image_url: imageUrl || null,
            priority_p1: parseInt(document.getElementById('form-priority-p1').value) || 0,
            priority_p2: parseInt(document.getElementById('form-priority-p2').value) || 0,
            priority_p3: parseInt(document.getElementById('form-priority-p3').value) || 0
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
        listContainer.innerHTML = `<p class="text-red-500 text-[10px] py-4" > 抓取失敗</p> `;
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
// 電腦端右鍵處理
function handleRightClick(e, itemId) {
    // 1. 擋掉瀏覽器預設的右鍵選單
    e.preventDefault();

    // 2. 取得點擊位置 (相對於視窗)
    const x = e.clientX;
    const y = e.clientY;

    // 3. 顯示自定義選單 (沿用之前寫好的 showContextMenu)
    showContextMenu(x, y, itemId);
}

// index.js

const FLIGHT_API_KEY = '15cd755524f1817bbf112559466a23e4';

async function checkFlightStatus(flightIata) {
    const modal = document.getElementById('flight-modal');
    const content = document.getElementById('flight-info-content');
    const title = document.getElementById('flight-title');

    title.textContent = `航班 ${flightIata} 狀態`;
    content.innerHTML = '<div class="text-center py-8"><span class="animate-pulse">正在連線至全球航班資料庫...</span></div>';
    modal.classList.remove('hidden');

    try {
        // 💡 串接 AviationStack API (範例網址)
        const response = await fetch(`http://api.aviationstack.com/v1/flights?access_key=${FLIGHT_API_KEY}&flight_iata=${flightIata}`);
        const result = await response.json();

        if (result.data && result.data.length > 0) {
            const flight = result.data[0];
            const statusMapping = {
                'scheduled': '📅 預計',
                'active': '✈️ 飛行中',
                'landed': '🛬 已抵達',
                'cancelled': '❌ 已取消'
            };

            // 💡 處理延誤資訊的邏輯
            const depDelay = flight.departure.delay || 0;
            const arrDelay = flight.arrival.delay || 0;

            // 格式化顯示時間的輔助小工具
            const formatTime = (isoStr) => isoStr ? isoStr.split('T')[1].substring(0, 5) : '--:--';

            // 判斷出發時間：如果有延誤就顯示紅字與新時間
            const depTimeHtml = depDelay > 0
                ? `<p class="text-xs font-mono text-red-500 font-bold">延誤 ${depDelay}m</p>
       <p class="text-sm font-mono text-red-500 line-through opacity-50">${formatTime(flight.departure.scheduled)}</p>
       <p class="text-lg font-mono text-red-600 font-black">${formatTime(flight.departure.estimated)}</p>`
                : `<p class="text-sm font-mono mt-1">${formatTime(flight.departure.scheduled)}</p>`;

            // 判斷抵達時間：同樣處理紅字
            const arrTimeHtml = arrDelay > 0
                ? `<p class="text-xs font-mono text-red-500 font-bold">延誤 ${arrDelay}m</p>
       <p class="text-lg font-mono text-red-600 font-black">${formatTime(flight.arrival.estimated)}</p>`
                : `<p class="text-sm font-mono mt-1">${formatTime(flight.arrival.scheduled)}</p>`;

            content.innerHTML = `
    <div class="space-y-6">
        <div class="flex justify-between items-center">
            <span class="text-xs font-bold px-2 py-1 rounded ${depDelay > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-800 text-white'}">
                ${depDelay > 0 ? '⚠️ 延誤' : (statusMapping[flight.flight_status] || flight.flight_status)}
            </span>
            <span class="text-[10px] text-gray-400">更新：${new Date().toLocaleTimeString()}</span>
        </div>

        <div class="relative py-4">
            <div class="absolute top-1/2 left-0 w-full h-[1px] bg-gray-200"></div>
            <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2">
                <span class="text-lg">✈️</span>
            </div>
        </div>

        <div class="grid grid-cols-2 gap-8">
            <div>
                <p class="text-[10px] text-gray-400 tracking-widest uppercase">Departure</p>
                <p class="text-2xl font-black text-slate-800">${flight.departure.iata}</p>
                <p class="text-xs font-bold text-slate-600">航廈 ${flight.departure.terminal || '--'} / 門 ${flight.departure.gate || '--'}</p>
                ${depTimeHtml} </div>
            <div class="text-right">
                <p class="text-[10px] text-gray-400 tracking-widest uppercase">Arrival</p>
                <p class="text-2xl font-black text-slate-800">${flight.arrival.iata}</p>
                <p class="text-xs font-bold text-slate-600">航廈 ${flight.arrival.terminal || '--'} / 轉盤 ${flight.arrival.baggage || '--'}</p>
                ${arrTimeHtml} </div>
        </div>
    </div>
`;
        } else {
            content.innerHTML = '<p class="text-center py-8 text-red-400">暫無該航班的即時資訊</p>';
        }
    } catch (error) {
        content.innerHTML = '<p class="text-center py-8 text-red-500">無法取得資料，請檢查 API 設定</p>';
    }
}

function closeFlightModal() {
    document.getElementById('flight-modal').classList.add('hidden');
}

function showTab(tabName) {
    // 1. 隱藏所有分頁
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.add('hidden');
    });

    // 2. 顯示目標分頁
    const targetPane = document.getElementById(`tab-${tabName}-content`);
    if (targetPane) {
        targetPane.classList.remove('hidden');
    }

    // 3. 💡 關鍵修正：切換到記帳分頁時觸發 fetchExpenses
    if (tabName === 'split') {
        if (typeof fetchExpenses === 'function') {
            fetchExpenses(); 
        }
    }
    
    // 3. 更新按鈕顏色狀態 (變回灰色)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('text-slate-800');
        btn.classList.add('text-gray-400');
    });

    // 4. 高亮目前點選的按鈕 (變成深色)
    const activeBtn = document.getElementById(`btn-${tabName}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-gray-400');
        activeBtn.classList.add('text-slate-800');
    }
    
}
