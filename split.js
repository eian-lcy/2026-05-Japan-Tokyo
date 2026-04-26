// --- 0. 變數與初始化 ---
const persons = ['賴', '李', '林'];
let currentData = [];
let currentItems = [];
let settlementMode = 'separate';
let hasFetchedRate = false;

function initSplitPage() {
    console.log("初始化記帳分頁...");
    fetchExpenses();
}
document.getElementById('form-date').valueAsDate = new Date();

// --- 1. 資料讀取 ---
async function fetchExpenses() {
    const { data, error } = await supabaseClient.from('expenses').select('*').order('date', { ascending: false }).order('created_at', { ascending: false });
    if (!error) {
        currentData = data;
        renderExpenses();
        if (!document.getElementById('view-settlement').classList.contains('hidden')) calculateSettlement();
    }
}

// --- 2. 核心計算邏輯 (含整趟總花費) ---
// --- 修正版計算邏輯：整合全案結清與個人結清 ---
function calculateSettlement() {
    // 1. 初始化所有需要的變數
    let paid = { JPY: { '賴': 0, '李': 0, '林': 0 }, TWD: { '賴': 0, '李': 0, '林': 0 } };
    let share = { JPY: { '賴': 0, '李': 0, '林': 0 }, TWD: { '賴': 0, '李': 0, '林': 0 } };
    let history = { '賴': [], '李': [], '林': [] };
    let absoluteShare = { JPY: { '賴': 0, '李': 0, '林': 0 }, TWD: { '賴': 0, '李': 0, '林': 0 } }; // 👈 確保這行存在

    currentData.forEach(exp => {
        const amt = parseFloat(exp.total_amount);
        const isAllSettled = exp.is_settled; // 總結清狀態

        // 2. 紀錄所有歷史花費 (無論是否結清，皆計入「個人實際總花費」統計)
        for (const [person, p_amt] of Object.entries(exp.split_details)) {
            if (persons.includes(person)) {
                absoluteShare[exp.currency][person] += p_amt; //

                // 判斷個人在明細中是否顯示為已結清
                const pNum = person === '賴' ? 'p1' : person === '李' ? 'p2' : 'p3';
                const isPersonSettled = exp[`settled_${pNum}`];

                history[person].push({
                    desc: exp.description || '消費',
                    currency: exp.currency,
                    paidBy: exp.payer,
                    myShare: p_amt,
                    is_settled: isAllSettled || isPersonSettled // 任一條件成立即顯示結清
                });
            }
        }

        // 3. 債務計算：僅處理「全案未結清」的項目
        if (!isAllSettled) {
            // 付款人先墊了這筆總額
            paid[exp.currency][exp.payer] += amt;

            // 檢查每個人的應付份額，若個人已付則從付款人的應收中扣除
            persons.forEach((p, index) => {
                const pNum = index + 1;
                const isPersonSettled = exp[`settled_p${pNum}`]; // 個人已付勾選
                const personShare = exp.split_details[p] || 0;

                if (isPersonSettled) {
                    // 若此人已單獨付清給付款人，付款人的「應收」扣除此份額
                    paid[exp.currency][exp.payer] -= personShare;
                } else {
                    // 尚未付清才進入債務池
                    share[exp.currency][p] += personShare;
                }
            });
        }
    });

    // 4. 渲染 UI
    renderExpenditureSummary(absoluteShare);
    renderPersonalSummary(paid, share, history);

    // 5. 計算轉帳步驟 (沿用你原本的邏輯)
    let debts = [];
    if (settlementMode === 'separate') {
        debts.push(...getGreedyDebts('JPY', paid.JPY, share.JPY));
        debts.push(...getGreedyDebts('TWD', paid.TWD, share.TWD));
    } else {
        const targetCurr = document.getElementById('merge-target').value;
        const rate = parseFloat(document.getElementById('merge-rate').value) || 0.21;
        let mPaid = { '賴': 0, '李': 0, '林': 0 };
        let mShare = { '賴': 0, '李': 0, '林': 0 };
        persons.forEach(p => {
            if (targetCurr === 'TWD') {
                mPaid[p] = paid.TWD[p] + (paid.JPY[p] * rate);
                mShare[p] = share.TWD[p] + (share.JPY[p] * rate);
            } else {
                mPaid[p] = paid.JPY[p] + (paid.TWD[p] * rate);
                mShare[p] = share.JPY[p] + (share.TWD[p] * rate);
            }
        });
        debts.push(...getGreedyDebts(targetCurr, mPaid, mShare));
    }
    renderSettlementSteps(debts);
}

// --- 3. UI 渲染函數 ---
function renderExpenditureSummary(absShare) {
    const container = document.getElementById('expenditure-summary');
    if (!container) return;
    container.innerHTML = '';
    const rate = parseFloat(document.getElementById('merge-rate').value) || 0.21;
    const targetCurr = document.getElementById('merge-target').value;

    persons.forEach(p => {
        let html = '';
        if (settlementMode === 'separate') {
            html = `<div class="text-[10px] font-bold text-slate-700">¥ ${Math.round(absShare.JPY[p]).toLocaleString()}</div>
                    <div class="text-[10px] font-bold text-slate-700">$ ${Math.round(absShare.TWD[p]).toLocaleString()}</div>`;
        } else {
            // let total = (targetCurr === 'TWD') ? Math.round(absShare.TWD[p] + (absShare.JPY[p] * rate)) : Math.round(absShare.JPY[p] + (absShare.TWD[p] / rate));
            let total = (targetCurr === 'TWD') ? Math.round(absShare.TWD[p] + (absShare.JPY[p] * rate)) : Math.round(absShare.JPY[p] + (absShare.TWD[p] * rate));
            html = `<div class="text-xs font-bold text-slate-800">${targetCurr === 'TWD' ? '$' : '¥'} ${total.toLocaleString()}</div>`;
        }
        container.innerHTML += `
            <div onclick="focusMemberExpenditure('${p}')" class="bg-gray-50 border border-gray-100 rounded-lg p-3 text-center cursor-pointer hover:bg-white transition-all">
                <div class="w-8 h-8 bg-slate-800 text-white rounded-full leading-8 text-xs font-bold mx-auto mb-1">${p}</div>
                ${html}
            </div>`;
    });
}

function renderPersonalSummary(paid, share, history) {
    const container = document.getElementById('personal-summary');
    if (!container) return;
    container.innerHTML = '';
    persons.forEach(p => {
        const jNet = paid.JPY[p] - share.JPY[p];
        const tNet = paid.TWD[p] - share.TWD[p];
        let netH = '';
        if (Math.abs(jNet) > 0.5) netH += `<span class="${jNet > 0 ? 'text-green-600' : 'text-red-500'}">¥${jNet > 0 ? '+' : ''}${Math.round(jNet).toLocaleString()}</span> `;
        if (Math.abs(tNet) > 0.5) netH += `<span class="${tNet > 0 ? 'text-green-600' : 'text-red-500'}">$${tNet > 0 ? '+' : ''}${Math.round(tNet).toLocaleString()}</span>`;
        if (netH === '') netH = '<span class="text-gray-400">已結平</span>';

        const histH = history[p].map(h => `
            <div class="flex justify-between py-2 border-b border-gray-50 last:border-0 ${h.is_settled ? 'opacity-40 line-through' : ''}">
                <span class="text-xs text-gray-600 truncate flex-1 pr-2">${h.paidBy}付 - ${h.desc}</span>
                <span class="text-xs font-bold">${h.currency === 'JPY' ? '¥' : '$'}${Math.round(h.myShare).toLocaleString()}</span>
            </div>`).join('');

        container.innerHTML += `
            <div class="bg-white border rounded-lg mb-2 overflow-hidden shadow-sm">
                <div onclick="toggleSummaryAccordion('${p}')" class="p-3 flex justify-between items-center cursor-pointer bg-gray-50/50">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 bg-slate-800 text-white rounded-full leading-8 text-center text-xs font-bold">${p}</div>
                        <div class="text-xs font-bold text-slate-800">待結清: ${netH}</div>
                    </div>
                    <svg id="summary-icon-${p}" class="w-4 h-4 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 9l-7 7-7-7" stroke-width="2" /></svg>
                </div>
                <div id="summary-details-${p}" class="max-h-0 overflow-hidden transition-all bg-white px-3">${histH}</div>
            </div>`;
    });
}

function renderSettlementSteps(debts) {
    const container = document.getElementById('settlement-steps');
    if (!container) return;
    container.innerHTML = debts.length === 0 ? '<div class="text-center py-6 text-gray-400 text-xs">🎉 已全數結清</div>' : '';
    let completed = 0;
    debts.forEach(debt => {
        const stepId = `settle_${settlementMode}_${debt.currency}_${debt.debtor}_${debt.creditor}_${Math.round(debt.amount)}`;
        const isChecked = localStorage.getItem(stepId) === 'true';
        if (isChecked) completed++;
        container.innerHTML += `
            <div class="flex items-center justify-between bg-white p-3 border rounded-lg mb-2 shadow-sm ${isChecked ? 'opacity-40' : ''}" id="card-${stepId}">
                <div class="flex items-center gap-3">
                    <input type="checkbox" id="${stepId}" ${isChecked ? 'checked' : ''} onchange="toggleSettleCheck('${stepId}')" class="w-5 h-5 accent-green-500">
                    <span class="text-sm font-bold text-red-500">${debt.debtor}</span>
                    <span class="text-gray-400">➔</span>
                    <span class="text-sm font-bold text-green-600">${debt.creditor}</span>
                </div>
                <div class="text-lg font-bold">${debt.currency === 'JPY' ? '¥' : 'NT$'} ${Math.round(debt.amount).toLocaleString()}</div>
            </div>`;
    });
    updateProgressBar(completed, debts.length);
}

// --- 4. 輔助與互動函數 ---
function getGreedyDebts(currency, paidData, shareData) {
    let d = []; let c = [];
    persons.forEach(p => { let net = paidData[p] - shareData[p]; if (net < -0.5) d.push({ name: p, amt: Math.abs(net) }); else if (net > 0.5) c.push({ name: p, amt: net }); });
    d.sort((a, b) => b.amt - a.amt); c.sort((a, b) => b.amt - a.amt);
    let res = []; let i = 0, j = 0;
    while (i < d.length && j < c.length) {
        const amt = Math.min(d[i].amt, c[j].amt);
        if (amt > 0.5) res.push({ debtor: d[i].name, creditor: c[j].name, amount: amt, currency: currency });
        d[i].amt -= amt; c[j].amt -= amt;
        if (d[i].amt < 0.5) i++; if (c[j].amt < 0.5) j++;
    }
    return res;
}

function toggleSettleCheck(stepId) {
    const isChecked = document.getElementById(stepId).checked;
    localStorage.setItem(stepId, isChecked);
    document.getElementById(`card-${stepId}`).classList.toggle('opacity-40', isChecked);
    const all = document.querySelectorAll('#settlement-steps input[type="checkbox"]');
    updateProgressBar(Array.from(all).filter(cb => cb.checked).length, all.length);
}

function updateProgressBar(completed, total) {
    const p = total === 0 ? 0 : Math.round((completed / total) * 100);
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = `${p}%`;
    const txt = document.getElementById('progress-text');
    if (txt) txt.textContent = `進度 ${completed} / ${total}`;
}

function focusMemberExpenditure(name) {
    switchTab('settlement');
    const detailEl = document.getElementById(`summary-details-${name}`);
    const summarySection = document.getElementById('personal-summary');
    if (summarySection) {
        summarySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
            persons.forEach(p => { document.getElementById(`summary-details-${p}`).style.maxHeight = '0px'; document.getElementById(`summary-icon-${p}`).style.transform = 'rotate(0deg)'; });
            detailEl.style.maxHeight = detailEl.scrollHeight + 'px';
            document.getElementById(`summary-icon-${name}`).style.transform = 'rotate(180deg)';
        }, 400);
    }
}

function toggleSummaryAccordion(p) {
    const el = document.getElementById(`summary-details-${p}`);
    const icon = document.getElementById(`summary-icon-${p}`);
    if (el.style.maxHeight && el.style.maxHeight !== '0px') { el.style.maxHeight = '0px'; icon.style.transform = 'rotate(0deg)'; }
    else { el.style.maxHeight = el.scrollHeight + 'px'; icon.style.transform = 'rotate(180deg)'; }
}

// --- 切換分帳模式 (分開或合併) ---
function setSettlementMode(mode) {
    settlementMode = mode;

    // 切換按鈕樣式
    document.getElementById('btn-set-sep').className = mode === 'separate'
        ? 'flex-1 py-2 rounded-md bg-white shadow-sm text-slate-800 font-bold transition'
        : 'flex-1 py-2 rounded-md text-gray-500 hover:text-slate-800 transition';

    document.getElementById('btn-set-merge').className = mode === 'merge'
        ? 'flex-1 py-2 rounded-md bg-white shadow-sm text-slate-800 font-bold transition'
        : 'flex-1 py-2 rounded-md text-gray-500 hover:text-slate-800 transition';

    // 顯示或隱藏匯率設定區塊
    document.getElementById('merge-settings').classList.toggle('hidden', mode === 'separate');

    // 重新計算與渲染
    calculateSettlement();
}

// --- 5. 匯率與分頁切換 ---
function switchTab(tab) {
    document.getElementById('tab-list').className = tab === 'list' ? 'flex-1 py-3 tab-active transition' : 'flex-1 py-3 tab-inactive transition';
    document.getElementById('tab-settlement').className = tab === 'settlement' ? 'flex-1 py-3 tab-active transition' : 'flex-1 py-3 tab-inactive transition';
    document.getElementById('view-list').classList.toggle('hidden', tab !== 'list');
    document.getElementById('view-settlement').classList.toggle('hidden', tab !== 'settlement');
    if (tab === 'settlement') calculateSettlement();
}

async function fetchExchangeRate() {
    const targetCurr = document.getElementById('merge-target').value;
    try {
        const res = await fetch(`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${targetCurr === 'TWD' ? 'jpy' : 'twd'}.json`);
        const data = await res.json();
        document.getElementById('merge-rate').value = targetCurr === 'TWD' ? data.jpy.twd.toFixed(4) : data.twd.jpy.toFixed(2);
        calculateSettlement();
    } catch (e) { alert('匯率更新失敗'); }
}

function handleCurrencyChange() {
    const targetCurr = document.getElementById('merge-target').value;
    document.getElementById('rate-base-currency').textContent = targetCurr === 'TWD' ? '1 JPY' : '1 TWD';
    document.getElementById('rate-target-currency').textContent = targetCurr === 'TWD' ? 'TWD' : 'JPY';
    fetchExchangeRate();
}

// --- 6. 記帳 Modal 邏輯 ---
function openExpenseModal(id = null) {
    const modal = document.getElementById('expense-modal');
    const deleteBtn = document.getElementById('btn-delete');

    modal.classList.remove('hidden');
    initSplitInputs();
    if (id) {
        const item = currentData.find(i => i.id === id);
        document.getElementById('form-id').value = item.id;
        document.getElementById('form-amount').value = item.total_amount;
        document.getElementById('form-desc').value = item.description || '';
        document.getElementById('form-currency').value = item.currency;
        document.querySelector(`input[name="payer"][value="${item.payer}"]`).checked = true;
        document.getElementById('form-is-settled').checked = item.is_settled;
        setSplitMode(item.split_method);
        persons.forEach(p => {
            const hasShare = item.split_details[p] !== undefined;
            document.getElementById(`check-${p}`).checked = hasShare;
            document.getElementById(`input-${p}`).value = hasShare ? (item.split_method === 'ratio' ? (item.split_details[p] / item.total_amount * 100).toFixed(2) : item.split_details[p]) : '';
        });

        // 顯示刪除按鈕並修改標題
        if (deleteBtn) deleteBtn.classList.remove('hidden');
        document.getElementById('modal-title').textContent = '編輯紀錄';

    } else {
        document.getElementById('form-id').value = '';
        document.getElementById('form-amount').value = '';
        document.getElementById('form-desc').value = ''; // 確保說明被清空
        document.getElementById('form-is-settled').checked = false;
        document.getElementById('settled-check-賴').checked = item.settled_p1 || false;
        document.getElementById('settled-check-李').checked = item.settled_p2 || false;
        document.getElementById('settled-check-林').checked = item.settled_p3 || false;
        splitEqually();

        // 隱藏刪除按鈕並修改標題
        if (deleteBtn) deleteBtn.classList.add('hidden');
        document.getElementById('modal-title').textContent = '新增紀錄';
    }
}

function calculateSplit() {
    const mode = document.getElementById('form-split-mode').value;
    const total = parseFloat(document.getElementById('form-amount').value) || 0;
    let sum = 0;
    persons.forEach(p => { if (document.getElementById(`check-${p}`).checked) sum += parseFloat(document.getElementById(`input-${p}`).value) || 0; });
    const valText = document.getElementById('validation-text');
    const isCorrect = mode === 'ratio' ? Math.abs(sum - 100) < 0.1 : Math.abs(sum - total) < 0.1;
    valText.textContent = `${sum.toLocaleString()} / ${mode === 'ratio' ? '100%' : total.toLocaleString()}`;
    valText.className = isCorrect ? 'text-green-600 font-bold' : 'text-red-500 font-bold';
}

function setSplitMode(mode) {
    document.getElementById('form-split-mode').value = mode;
    ['ratio', 'custom'].forEach(m => document.getElementById(`btn-mode-${m}`).classList.toggle('bg-white', mode === m));
    splitEqually();
}

function splitEqually() {
    const total = parseFloat(document.getElementById('form-amount').value) || 0;
    const active = persons.filter(p => document.getElementById(`check-${p}`).checked);
    const mode = document.getElementById('form-split-mode').value;
    active.forEach(p => {
        document.getElementById(`input-${p}`).value = (mode === 'ratio' ? 100 / active.length : total / active.length).toFixed(2);
    });
    calculateSplit();
}

// 修改後的 saveExpense
async function saveExpense() {
    const total = parseFloat(document.getElementById('form-amount').value) || 0;
    const mode = document.getElementById('form-split-mode').value;
    let details = {};

    persons.forEach(p => {
        if (document.getElementById(`check-${p}`).checked) {
            const val = parseFloat(document.getElementById('input-' + p).value) || 0;
            details[p] = mode === 'ratio' ? (total * val / 100) : val;
        }
    });

    const data = {
        date: document.getElementById('form-date').value,
        description: document.getElementById('form-desc').value,
        currency: document.getElementById('form-currency').value,
        total_amount: total,
        payer: document.querySelector('input[name="payer"]:checked').value,
        split_method: mode,
        split_details: details,
        // 同時儲存總結清與個人結清
        is_settled: document.getElementById('form-is-settled').checked,
        settled_p1: document.getElementById('settled-check-賴').checked,
        settled_p2: document.getElementById('settled-check-李').checked,
        settled_p3: document.getElementById('settled-check-林').checked
    };

    const id = document.getElementById('form-id').value;
    if (id) await supabaseClient.from('expenses').update(data).eq('id', id);
    else await supabaseClient.from('expenses').insert([data]);

    document.getElementById('expense-modal').classList.add('hidden');
    fetchExpenses();
}

function renderExpenses() {
    const container = document.getElementById('expenses-container');
    container.innerHTML = '';
    currentData.forEach(item => {
        const cardClass = item.is_settled ? 'opacity-50 bg-gray-100' : 'bg-white';
        container.innerHTML += `
            <div onclick="openExpenseModal('${item.id}')" class="p-3 border rounded-lg mb-2 shadow-sm cursor-pointer ${cardClass}">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-slate-400">${item.date}</span>
                    <span class="text-xs font-bold">${item.payer} 付</span>
                </div>
                <div class="flex justify-between items-end mt-1">
                    <span class="font-bold text-slate-800">${item.description || '未命名'} ${item.is_settled ? '✅' : ''}</span>
                    <span class="text-lg font-bold">${item.currency === 'JPY' ? '¥' : '$'} ${item.total_amount.toLocaleString()}</span>
                </div>
            </div>`;
    });
}

// 範例：計算林(Person 3) 的總欠款
async function calculateLinBalance() {
    const { data, error } = await supabaseClient
        .from('shopping_list')
        .select('price, qty_person3')
        .eq('settled_p3', false); // ⚡️ 關鍵：只計算「未結清」的項目

    const unpaidTotal = data.reduce((sum, item) => sum + (item.price * item.qty_person3), 0);
    // 這樣一來，只要你在購物清單勾選了「林已結清」，這裡的 954 元就會自動消失
}

function closeExpenseModal() { document.getElementById('expense-modal').classList.add('hidden'); }
async function deleteExpense() { if (confirm('確定刪除？')) { await supabaseClient.from('expenses').delete().eq('id', document.getElementById('form-id').value); closeExpenseModal(); fetchExpenses(); } }
supabaseClient.channel('split-db').on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => fetchExpenses()).subscribe();

// --- 7. 匯出結算明細圖片 ---
function exportToImage() {
    const exportArea = document.getElementById('export-area');
    const exportBtn = document.querySelector('button[onclick="exportToImage()"]');

    // 如果找不到要匯出的區塊，就停止執行
    if (!exportArea) {
        alert('找不到結算明細區塊！');
        return;
    }

    // 1. 改變按鈕狀態，提示使用者正在處理中
    const originalContent = exportBtn.innerHTML;
    exportBtn.innerHTML = '⏳ 圖片產生中...';
    exportBtn.disabled = true;
    exportBtn.classList.add('opacity-70', 'cursor-not-allowed');

    // 2. 呼叫 html2canvas 進行截圖
    // 設定 scale: 2 可以讓匯出的圖片解析度變高，在手機上放大看文字才不會模糊
    html2canvas(exportArea, {
        scale: 2,
        backgroundColor: '#FAFAFA', // 確保背景顏色與你的網頁一致
        useCORS: true // 確保字體或跨域圖片能正常渲染
    }).then(canvas => {
        // 3. 將 Canvas 轉為圖片網址 (Base64)
        const imageURL = canvas.toDataURL('image/png');

        // 4. 建立一個隱藏的下載連結並觸發點擊
        const link = document.createElement('a');
        link.href = imageURL;
        // 自動帶上當天日期的檔名
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        link.download = `TOKYO2026_結算明細_${today}.png`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    }).catch(err => {
        console.error('圖片匯出失敗:', err);
        alert('圖片匯出失敗，請重試或截圖分享。');
    }).finally(() => {
        // 5. 無論成功或失敗，都把按鈕狀態恢復原狀
        exportBtn.innerHTML = originalContent;
        exportBtn.disabled = false;
        exportBtn.classList.remove('opacity-70', 'cursor-not-allowed');
    });
}

// 修改後的 initSplitInputs
function initSplitInputs() {
    const container = document.getElementById('split-inputs-container');
    container.innerHTML = persons.map((p, index) => {
        const pNum = index + 1; // 產生 p1, p2, p3
        return `
        <div class="flex items-center justify-between p-2.5 border rounded-lg mb-2 bg-white">
            <div class="flex flex-col gap-1">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id="check-${p}" checked onchange="calculateSplit()" class="w-4 h-4">
                    <span class="text-sm font-bold text-slate-800">${p}</span>
                </label>
                <label class="flex items-center gap-1.5 cursor-pointer ml-6">
                    <input type="checkbox" id="settled-check-${p}" class="w-3.5 h-3.5 accent-green-600">
                    <span class="text-[10px] text-gray-500 font-bold">已付清</span>
                </label>
            </div>
            <input type="number" id="input-${p}" oninput="calculateSplit()" class="w-24 text-right border-b font-bold text-slate-800 focus:border-slate-800 outline-none">
        </div>`;
    }).join('');
}

function exportToExcel() {
    if (!currentData || currentData.length === 0) {
        alert("目前沒有資料可以匯出");
        return;
    }

    // 1. 整理資料格式
    const excelRows = currentData.map(item => {
        return {
            "日期": item.date,
            "說明": item.description || "未命名項目",
            "幣別": item.currency,
            "總金額": item.total_amount,
            "付款人": item.payer,
            "賴(分擔)": item.split_details["賴"] || 0,
            "李(分擔)": item.split_details["李"] || 0,
            "林(分擔)": item.split_details["林"] || 0,
            "狀態": item.is_settled ? "已結清" : "未結清"
        };
    });

    // 2. 建立工作表
    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    // 3. 設定欄位寬度
    const wscols = [
        { wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 12 },
        { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }
    ];
    worksheet['!cols'] = wscols;

    // 4. 建立活頁簿並寫入資料
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "消費明細");

    // 5. 下載檔案
    const fileName = `東京旅遊記帳_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}
