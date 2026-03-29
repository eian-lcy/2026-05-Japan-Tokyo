// --- 0. 變數與初始化 ---
const persons = ['賴', '李', '林'];
let currentData = [];
let currentItems = [];
let settlementMode = 'separate';
let hasFetchedRate = false;

checkUser(() => { fetchExpenses(); });
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
function calculateSettlement() {
    let paid = { JPY: { '賴': 0, '李': 0, '林': 0 }, TWD: { '賴': 0, '李': 0, '林': 0 } };
    let share = { JPY: { '賴': 0, '李': 0, '林': 0 }, TWD: { '賴': 0, '聯': 0, '林': 0 } };
    let history = { '賴': [], '李': [], '林': [] };
    let absoluteShare = { JPY: { '賴': 0, '李': 0, '林': 0 }, TWD: { '賴': 0, '李': 0, '林': 0 } };

    currentData.forEach(exp => {
        const amt = parseFloat(exp.total_amount);
        // 計入個人實際總花費 (無論是否結清)
        for (const [person, p_amt] of Object.entries(exp.split_details)) {
            if (persons.includes(person)) {
                absoluteShare[exp.currency][person] += p_amt;
                history[person].push({ desc: exp.description || '消費', currency: exp.currency, paidBy: exp.payer, myShare: p_amt, is_settled: exp.is_settled });
            }
        }
        // 進入債務計算 (僅限未結清)
        if (!exp.is_settled) {
            paid[exp.currency][exp.payer] += amt;
            for (const [person, p_amt] of Object.entries(exp.split_details)) {
                share[exp.currency][person] += p_amt;
            }
        }
    });

    renderExpenditureSummary(absoluteShare);
    renderPersonalSummary(paid, share, history);

    // 計算轉帳步驟
    let debts = [];
    if (settlementMode === 'separate') {
        debts.push(...getGreedyDebts('JPY', paid.JPY, share.JPY));
        debts.push(...getGreedyDebts('TWD', paid.TWD, share.TWD));
    } else {
        const targetCurr = document.getElementById('merge-target').value;
        const rate = parseFloat(document.getElementById('merge-rate').value) || 0.21;
        let mPaid = { '賴': 0, '李': 0, '林': 0 }; let mShare = { '賴': 0, '李': 0, '林': 0 };
        persons.forEach(p => {
            if (targetCurr === 'TWD') {
                mPaid[p] = paid.TWD[p] + (paid.JPY[p] * rate); mShare[p] = share.TWD[p] + (share.JPY[p] * rate);
            } else {
                mPaid[p] = paid.JPY[p] + (paid.TWD[p] / rate); mShare[p] = share.JPY[p] + (share.TWD[p] / rate);
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
            let total = (targetCurr === 'TWD') ? Math.round(absShare.TWD[p] + (absShare.JPY[p] * rate)) : Math.round(absShare.JPY[p] + (absShare.TWD[p] / rate));
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
function openModal(id = null) {
    const modal = document.getElementById('expense-modal');
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
    } else {
        document.getElementById('form-id').value = '';
        document.getElementById('form-amount').value = '';
        document.getElementById('form-is-settled').checked = false;
        splitEqually();
    }
}

function initSplitInputs() {
    const container = document.getElementById('split-inputs-container');
    container.innerHTML = persons.map(p => `
        <div class="flex items-center justify-between p-2.5 border rounded-lg mb-2">
            <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="check-${p}" checked onchange="calculateSplit()" class="w-4 h-4">
                <span class="text-sm font-bold">${p}</span>
            </label>
            <input type="number" id="input-${p}" oninput="calculateSplit()" class="w-20 text-right border-b font-bold">
        </div>`).join('');
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

async function saveExpense() {
    const total = parseFloat(document.getElementById('form-amount').value) || 0;
    const mode = document.getElementById('form-split-mode').value;
    let details = {};
    persons.forEach(p => {
        if (document.getElementById(`check-${p}`).checked) {
            const val = parseFloat(document.getElementById(`input-${p}`).value) || 0;
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
        is_settled: document.getElementById('form-is-settled').checked
    };
    const id = document.getElementById('form-id').value;
    if (id) await supabaseClient.from('expenses').update(data).eq('id', id); else await supabaseClient.from('expenses').insert([data]);
    document.getElementById('expense-modal').classList.add('hidden');
    fetchExpenses();
}

function renderExpenses() {
    const container = document.getElementById('expenses-container');
    container.innerHTML = '';
    currentData.forEach(item => {
        const cardClass = item.is_settled ? 'opacity-50 bg-gray-100' : 'bg-white';
        container.innerHTML += `
            <div onclick="openModal('${item.id}')" class="p-3 border rounded-lg mb-2 shadow-sm cursor-pointer ${cardClass}">
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

function closeModal() { document.getElementById('expense-modal').classList.add('hidden'); }
async function deleteExpense() { if (confirm('確定刪除？')) { await supabaseClient.from('expenses').delete().eq('id', document.getElementById('form-id').value); closeModal(); fetchExpenses(); } }
supabaseClient.channel('split-db').on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => fetchExpenses()).subscribe();