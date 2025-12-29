/**
 * Income Statement Budget View Module
 * Displays calculated budget with monthly breakdown by branch
 * Calculates values the same way as the Assumptions page using monthly revenue from budget_data
 */

const API_BASE = '';
let currentUser = null;
let currentYear = null;
let currentScenario = 'most_likely';
let selectedBranch = 'all'; // 'all' or branch ID

// Revenue and assumptions data per branch
let monthlyRevenueData = {}; // { branchId: { month: { IP, OP, ER } } }
let assumptionsData = {};    // { branchId: { lineItemCode: { assumption_value } } }
let revenueTypeAssumptions = {}; // { branchId: { REV_TYPE_...: value } }
let calculatedData = {};     // { branchId: { lineItemCode: { month_1, month_2, ..., fy_total } } }
let assumptionsVersion = 0;  // Track the current version of loaded assumptions
let assumptionsPublished = false; // Track if current assumptions are published

const BRANCHES = {
    1: 'Riyadh',
    2: 'Khamis',
    3: 'Jazan',
    4: 'Qassem',
    5: 'Madinah',
    6: 'Abha'
};

const BRANCH_IDS = Object.keys(BRANCHES).map(Number);

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Revenue Type Assumptions Configuration
const REVENUE_TYPE_CONFIG = [
    { code: 'REV_TYPE_INSURANCE', name: 'Insurance' },
    { code: 'REV_TYPE_CASH', name: 'Cash' },
    { code: 'REV_TYPE_MOH', name: 'MOH' },
    { code: 'REV_TYPE_OTHER_CREDIT', name: 'Other Credit' }
];

// Line Items Configuration - Matching Assumptions page exactly
const LINE_ITEMS_CONFIG = [
    // Revenue Section
    { code: 'REV_IP', name: 'Inpatient', section: 'Revenue', isRevenue: true, revenueType: 'IP' },
    { code: 'REV_OP', name: 'Outpatient', section: 'Revenue', isRevenue: true, revenueType: 'OP' },
    { code: 'REV_ER', name: 'Emergency', section: 'Revenue', isRevenue: true, revenueType: 'ER' },
    { code: 'REV_SUB', name: 'Sub Revenue', section: 'Revenue', isCalculated: true },
    
    // Discounts
    { code: 'DIS_REJECTION_MOH', name: 'Rejection Expense - MOH', section: 'Discounts', isExpense: true, calcFromSubRevenue: true },
    { code: 'DIS_REJECTION_INS', name: 'Rejection Expense - Insurance', section: 'Discounts', isExpense: true, calcFromSubRevenue: true },
    { code: 'DIS_REJECTION', name: 'Rejection Expense', section: 'Discounts', isCalculated: true },
    { code: 'DIS_VOLUME', name: 'Volume Discount', section: 'Discounts', isExpense: true, calcFromSubRevenue: true },
    { code: 'DIS_EARLY_PAY', name: 'Early Payment Discount', section: 'Discounts', isExpense: true, calcFromSubRevenue: true },
    { code: 'DIS_SETTLEMENT', name: 'Revenue - Settlement Discount', section: 'Discounts', isCalculated: true },
    { code: 'REV_NET', name: 'Net Revenue', section: 'Net Revenue', isCalculated: true, isNetRevenue: true },
    
    // Direct Costs
    { code: 'DC_CONSUMABLES', name: 'Consumables', section: 'Direct Cost', isExpense: true },
    { code: 'DC_MEDICINES', name: 'Cost Of Medicines', section: 'Direct Cost', isExpense: true },
    { code: 'DC_DOCTORS_FEE', name: 'Doctors Fee And Commission', section: 'Direct Cost', isExpense: true },
    { code: 'DC_EMPLOYEE', name: 'Employee Costs', section: 'Direct Cost', isExpense: true },
    { code: 'DC_GOVT_FEES', name: 'Employee Govt Fees', section: 'Direct Cost', isExpense: true },
    { code: 'DC_INSURANCE', name: 'Insurance Expenses', section: 'Direct Cost', isExpense: true },
    { code: 'DC_KITCHEN', name: 'Kitchen Expenses', section: 'Direct Cost', isExpense: true },
    { code: 'DC_MAINTENANCE', name: 'Maintenance Expense', section: 'Direct Cost', isExpense: true },
    { code: 'DC_OTHER', name: 'Other Direct Expenses', section: 'Direct Cost', isExpense: true },
    { code: 'DC_REFERRAL', name: 'Referral Cost', section: 'Direct Cost', isExpense: true },
    { code: 'DC_RENTAL', name: 'Rental Cost', section: 'Direct Cost', isExpense: true },
    { code: 'DC_TRAINING', name: 'Staff Training And Recruitments', section: 'Direct Cost', isExpense: true },
    { code: 'DC_TRAVEL', name: 'Travelling Expenses', section: 'Direct Cost', isExpense: true },
    { code: 'DC_UTILITIES', name: 'Utilities Expenses', section: 'Direct Cost', isExpense: true },
    { code: 'TOTAL_DC', name: 'Total Direct Cost', section: 'Direct Cost', isCalculated: true, isSubtotal: true },
    { code: 'GROSS_PROFIT', name: 'Gross Profit', section: 'Gross Profit', isCalculated: true },
    
    // G&A Expenses
    { code: 'GA_GOVT_FEE', name: 'Government Fee', section: 'G&A Expenses', isExpense: true },
    { code: 'GA_AUDIT', name: 'Audit Fee', section: 'G&A Expenses', isExpense: true },
    { code: 'GA_COMMUNICATION', name: 'Communication Expense', section: 'G&A Expenses', isExpense: true },
    { code: 'GA_ECL', name: 'Expected Credit Loss', section: 'G&A Expenses', isExpense: true },
    { code: 'GA_OTHER', name: 'Other Indirect Expenses', section: 'G&A Expenses', isExpense: true },
    { code: 'GA_POSTAGE', name: 'Postage Printing And Stationary', section: 'G&A Expenses', isExpense: true },
    { code: 'GA_PROFESSIONAL', name: 'Professional Fee And Subscription', section: 'G&A Expenses', isExpense: true },
    { code: 'GA_SECURITY', name: 'Security And Cleaning Expenses', section: 'G&A Expenses', isExpense: true },
    { code: 'GA_TRAINING', name: 'Staff Training And Recruitment', section: 'G&A Expenses', isExpense: true },
    { code: 'GA_EMPLOYEE', name: 'Employee Cost', section: 'G&A Expenses', isExpense: true },
    { code: 'GA_MARKETING', name: 'Selling And Marketing Expenses', section: 'G&A Expenses', isExpense: true },
    { code: 'GA_HO_CHARGES', name: 'Charges From Head Office', section: 'G&A Expenses', isExpense: true },
    { code: 'TOTAL_GA', name: 'Total G&A Expenses', section: 'G&A Expenses', isCalculated: true, isSubtotal: true },
    { code: 'OTHER_INCOME', name: 'Other Income', section: 'Other', isOtherIncome: true },
    { code: 'EBITDA', name: 'EBITDA', section: 'EBITDA', isCalculated: true },
    
    // Below EBITDA
    { code: 'FINANCE_COST', name: 'Finance Cost', section: 'Finance', isExpense: true },
    { code: 'DEPRECIATION', name: 'Depreciation And Amortization', section: 'D&A', isExpense: true },
    { code: 'ZAKAT', name: 'Zakat', section: 'Taxes', isExpense: true },
    { code: 'NET_PROFIT', name: 'Net Profit / (Loss)', section: 'Net Profit', isCalculated: true },
    { code: 'OCI', name: 'OCI', section: 'OCI', isExpense: true },
    { code: 'TOTAL_COMP_INCOME', name: 'Total Comprehensive Income', section: 'Total', isCalculated: true }
];

// DOM Elements
const yearSelect = document.getElementById('year-select');
const scenarioSelect = document.getElementById('scenario-select');
const branchSelect = document.getElementById('branch-select');
const loadBtn = document.getElementById('load-btn');
const exportBtn = document.getElementById('export-btn');
const tableBody = document.getElementById('budget-table-body');
const tableHeader = document.getElementById('table-header');
const loadingEl = document.getElementById('loading');
const statusMessage = document.getElementById('status-message');
const noDataState = document.getElementById('no-data-state');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) {
        window.location.href = '/login.html';
        return;
    }
    
    await loadExistingYears();
    setupEventListeners();
    
    // Restore session data if available
    restoreSessionData();
});

/**
 * Check authentication
 */
async function checkAuthentication() {
    try {
        const response = await fetch(`${API_BASE}/api/auth/check`, { credentials: 'include' });
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data.user;
            updateUserDisplay();
            updateAdminLink();
            return true;
        }
        return false;
    } catch (err) {
        console.error('Auth check failed:', err);
        return false;
    }
}

/**
 * Update user display
 */
function updateUserDisplay() {
    const userDisplay = document.getElementById('user-display');
    if (userDisplay && currentUser) {
        const branchInfo = currentUser.branch_id 
            ? `<span class="branch-info"><i class="fas fa-building"></i> ${currentUser.branch_name}</span>` 
            : '';
        userDisplay.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.2rem;">
                <span class="user-name"><i class="fas fa-user-circle"></i> ${currentUser.full_name || currentUser.username}</span>
                ${branchInfo}
            </div>
            <button class="btn-logout" onclick="logout()" title="Logout">
                <i class="fas fa-sign-out-alt"></i>
            </button>
        `;
    }
}

/**
 * Show admin link
 */
function updateAdminLink() {
    const adminLink = document.getElementById('admin-link');
    if (adminLink && currentUser && currentUser.role === 'admin') {
        adminLink.classList.remove('hidden');
    }
}

/**
 * Logout
 */
async function logout() {
    try {
        await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
        window.location.href = '/login.html';
    } catch (err) {
        window.location.href = '/login.html';
    }
}

/**
 * Get selected branches (returns array of branch IDs)
 */
function getSelectedBranches() {
    if (selectedBranch === 'all') {
        return BRANCH_IDS;
    }
    return [parseInt(selectedBranch)];
}

/**
 * Load existing years with published budgets
 */
async function loadExistingYears() {
    try {
        const response = await fetch(`${API_BASE}/api/income-statement/years`, { credentials: 'include' });
        const data = await response.json();
        
        if (!yearSelect) return;
        yearSelect.innerHTML = '<option value="">Select Year</option>';
        if (data.years && data.years.length > 0) {
            data.years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                yearSelect.appendChild(option);
            });
        }
    } catch (err) {
        console.error('Failed to load years:', err);
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    loadBtn?.addEventListener('click', loadBudget);
    exportBtn?.addEventListener('click', exportToExcel);
    
    branchSelect?.addEventListener('change', function() {
        selectedBranch = this.value;
    });
}

/**
 * Update version display in year badge area
 */
function updateVersionDisplay() {
    const yearBadge = document.getElementById('year-badge');
    const yearBadgeText = document.getElementById('year-badge-text');
    if (!yearBadge || !yearBadgeText) return;
    
    if (assumptionsVersion > 0) {
        let versionText = `v${assumptionsVersion}`;
        if (assumptionsPublished) {
            versionText += ' (Published)';
        } else {
            versionText += ' (Draft)';
        }
        yearBadgeText.textContent = versionText;
        yearBadge.classList.remove('hidden');
    } else {
        yearBadge.classList.add('hidden');
    }
}

/**
 * Load budget data
 */
async function loadBudget() {
    const year = yearSelect?.value;
    selectedBranch = branchSelect?.value || 'all';
    const scenario = scenarioSelect?.value || 'most_likely';
    
    if (!year) {
        showStatus('Please select a year', 'error');
        return;
    }
    
    currentYear = parseInt(year);
    currentScenario = scenario;
    
    showLoading(true);
    showNoData(false);
    
    try {
        const branchesToLoad = getSelectedBranches();
        
        // Reset data stores
        monthlyRevenueData = {};
        assumptionsData = {};
        revenueTypeAssumptions = {};
        calculatedData = {};
        assumptionsVersion = 0; // Reset version info
        assumptionsPublished = false;
        
        // Load data for each branch
        await Promise.all(branchesToLoad.map(branchId => loadBranchData(branchId)));
        
        if (Object.keys(monthlyRevenueData).length === 0) {
            showNoData(true);
            showStatus('No budget data found for the selected criteria', 'error');
            return;
        }
        
        // Calculate all values for each branch
        calculateAllBranchValues();
        
        // Update version display
        updateVersionDisplay();
        
        console.log('Calculated data:', calculatedData);
        console.log('Assumptions data:', assumptionsData);
        console.log('Revenue type assumptions:', revenueTypeAssumptions);
        console.log('Assumptions version:', assumptionsVersion);
        
        // Render the table
        renderTable();
        
        // Save session data for persistence
        saveSessionData();
        
        const branchNames = selectedBranch === 'all' 
            ? 'All Branches' 
            : BRANCHES[parseInt(selectedBranch)];
        showStatus(`Loaded budget for ${branchNames} - ${currentYear}`, 'success');
        
    } catch (err) {
        console.error('Failed to load budget:', err);
        showStatus('Failed to load budget: ' + err.message, 'error');
        showNoData(true);
    } finally {
        showLoading(false);
    }
}

/**
 * Load data for a single branch (monthly revenue + assumptions)
 */
async function loadBranchData(branchId) {
    try {
        // Load monthly revenue from budget_data
        const revenueResponse = await fetch(
            `${API_BASE}/api/income-statement/revenue-monthly/${branchId}/${currentYear}?scenario=${currentScenario}`,
            { credentials: 'include' }
        );
        
        if (revenueResponse.ok) {
            const revenueData = await revenueResponse.json();
            console.log(`Branch ${branchId} monthly revenue:`, revenueData);
            if (revenueData.monthly_revenue) {
                monthlyRevenueData[branchId] = revenueData.monthly_revenue;
            }
        }
        
        // Load assumptions
        const assumptionsResponse = await fetch(
            `${API_BASE}/api/income-statement/assumptions?year=${currentYear}&branch_id=${branchId}&scenario=${currentScenario}`,
            { credentials: 'include' }
        );
        
        if (assumptionsResponse.ok) {
            const data = await assumptionsResponse.json();
            assumptionsData[branchId] = {};
            revenueTypeAssumptions[branchId] = {};
            
            // Track version (use highest version from any branch)
            if (data.version && data.version > assumptionsVersion) {
                assumptionsVersion = data.version;
            }
            if (data.is_published) {
                assumptionsPublished = true;
            }
            
            const revenueTypeCodes = REVENUE_TYPE_CONFIG.map(rt => rt.code);
            
            // API returns { assumptions: [...] } - extract the array
            const assumptionsArray = data.assumptions || data || [];
            
            console.log(`Branch ${branchId} assumptions (v${data.version}):`, assumptionsArray);
            
            if (Array.isArray(assumptionsArray)) {
                assumptionsArray.forEach(item => {
                    // API uses 'assumption_percentage' not 'assumption_value'
                    const value = parseFloat(item.assumption_percentage ?? item.assumption_value ?? 0);
                    
                    if (revenueTypeCodes.includes(item.line_item_code)) {
                        revenueTypeAssumptions[branchId][item.line_item_code] = value;
                    } else {
                        assumptionsData[branchId][item.line_item_code] = {
                            assumption_value: value
                        };
                    }
                });
            }
        }
    } catch (err) {
        console.error(`Failed to load data for branch ${branchId}:`, err);
    }
}

/**
 * Calculate all values for all branches, month by month
 * Uses the same logic as the assumptions page
 */
function calculateAllBranchValues() {
    const branchesToCalc = getSelectedBranches();
    
    branchesToCalc.forEach(branchId => {
        calculatedData[branchId] = {};
        
        // Initialize line items
        LINE_ITEMS_CONFIG.forEach(item => {
            calculatedData[branchId][item.code] = {};
            for (let m = 1; m <= 12; m++) {
                calculatedData[branchId][item.code][`month_${m}`] = 0;
            }
            calculatedData[branchId][item.code].fy_total = 0;
        });
        
        // Calculate for each month
        for (let month = 1; month <= 12; month++) {
            calculateMonthValues(branchId, month);
        }
        
        // Calculate FY totals
        LINE_ITEMS_CONFIG.forEach(item => {
            let fyTotal = 0;
            for (let m = 1; m <= 12; m++) {
                fyTotal += calculatedData[branchId][item.code][`month_${m}`] || 0;
            }
            calculatedData[branchId][item.code].fy_total = fyTotal;
        });
    });
}

/**
 * Calculate values for a specific branch and month
 * Mirrors the logic in income-statement.js calculateAllValues()
 */
function calculateMonthValues(branchId, month) {
    const monthKey = `month_${month}`;
    // Note: JSON keys are strings, so we need to access with string key
    const monthData = monthlyRevenueData[branchId];
    const monthRevenue = monthData?.[month] || monthData?.[String(month)] || { IP: 0, OP: 0, ER: 0 };
    
    // Revenue values
    const ipRevenue = parseFloat(monthRevenue.IP) || 0;
    const opRevenue = parseFloat(monthRevenue.OP) || 0;
    const erRevenue = parseFloat(monthRevenue.ER) || 0;
    const subRevenue = ipRevenue + opRevenue + erRevenue;
    
    // Set revenue line items
    calculatedData[branchId]['REV_IP'][monthKey] = ipRevenue;
    calculatedData[branchId]['REV_OP'][monthKey] = opRevenue;
    calculatedData[branchId]['REV_ER'][monthKey] = erRevenue;
    calculatedData[branchId]['REV_SUB'][monthKey] = subRevenue;
    
    // Get revenue type allocations for this branch
    const mohRevTypePct = revenueTypeAssumptions[branchId]?.['REV_TYPE_MOH'] || 0;
    const insuranceRevTypePct = revenueTypeAssumptions[branchId]?.['REV_TYPE_INSURANCE'] || 0;
    
    // Calculate Rejection Expense parts (MOH and Insurance) using revenue type allocations
    // Rejection MOH = Rejection MOH % × MOH Revenue Type % × Sub Revenue
    const rejectionMohPct = assumptionsData[branchId]?.['DIS_REJECTION_MOH']?.assumption_value || 0;
    const rejectionMohValue = subRevenue * (rejectionMohPct / 100) * (mohRevTypePct / 100);
    calculatedData[branchId]['DIS_REJECTION_MOH'][monthKey] = rejectionMohValue;
    
    // Rejection Insurance = Rejection Insurance % × Insurance Revenue Type % × Sub Revenue
    const rejectionInsPct = assumptionsData[branchId]?.['DIS_REJECTION_INS']?.assumption_value || 0;
    const rejectionInsValue = subRevenue * (rejectionInsPct / 100) * (insuranceRevTypePct / 100);
    calculatedData[branchId]['DIS_REJECTION_INS'][monthKey] = rejectionInsValue;
    
    // Rejection Expense = MOH + Insurance
    const totalRejection = rejectionMohValue + rejectionInsValue;
    calculatedData[branchId]['DIS_REJECTION'][monthKey] = totalRejection;
    
    // Calculate other discounts from Sub Revenue: Volume, Early Pay
    const volumePct = assumptionsData[branchId]?.['DIS_VOLUME']?.assumption_value || 0;
    const volumeValue = subRevenue * (volumePct / 100);
    calculatedData[branchId]['DIS_VOLUME'][monthKey] = volumeValue;
    
    const earlyPayPct = assumptionsData[branchId]?.['DIS_EARLY_PAY']?.assumption_value || 0;
    const earlyPayValue = subRevenue * (earlyPayPct / 100);
    calculatedData[branchId]['DIS_EARLY_PAY'][monthKey] = earlyPayValue;
    
    // Total Discounts = Rejection + Volume + Early Pay
    const totalDiscounts = totalRejection + volumeValue + earlyPayValue;
    
    // Revenue - Settlement Discount = Sum of all discounts
    calculatedData[branchId]['DIS_SETTLEMENT'][monthKey] = totalDiscounts;
    
    // Net Revenue = Sub Revenue - Total Discounts
    const netRevenue = subRevenue - totalDiscounts;
    calculatedData[branchId]['REV_NET'][monthKey] = netRevenue;
    
    // Calculate Direct Costs
    let totalDirectCosts = 0;
    const directCostCodes = ['DC_CONSUMABLES', 'DC_MEDICINES', 'DC_DOCTORS_FEE', 'DC_EMPLOYEE', 
        'DC_GOVT_FEES', 'DC_INSURANCE', 'DC_KITCHEN', 'DC_MAINTENANCE', 'DC_OTHER', 
        'DC_REFERRAL', 'DC_RENTAL', 'DC_TRAINING', 'DC_TRAVEL', 'DC_UTILITIES'];
    
    directCostCodes.forEach(code => {
        const pct = assumptionsData[branchId]?.[code]?.assumption_value || 0;
        const value = netRevenue * (pct / 100);
        calculatedData[branchId][code][monthKey] = value;
        totalDirectCosts += value;
    });
    
    // Total Direct Costs
    calculatedData[branchId]['TOTAL_DC'][monthKey] = totalDirectCosts;
    
    // Gross Profit
    const grossProfit = netRevenue - totalDirectCosts;
    calculatedData[branchId]['GROSS_PROFIT'][monthKey] = grossProfit;
    
    // Calculate G&A Expenses
    let totalGAExpenses = 0;
    const gaCodes = ['GA_GOVT_FEE', 'GA_AUDIT', 'GA_COMMUNICATION', 'GA_ECL', 'GA_OTHER',
        'GA_POSTAGE', 'GA_PROFESSIONAL', 'GA_SECURITY', 'GA_TRAINING', 'GA_EMPLOYEE',
        'GA_MARKETING', 'GA_HO_CHARGES'];
    
    gaCodes.forEach(code => {
        const pct = assumptionsData[branchId]?.[code]?.assumption_value || 0;
        const value = netRevenue * (pct / 100);
        calculatedData[branchId][code][monthKey] = value;
        totalGAExpenses += value;
    });
    
    // Total G&A Expenses
    calculatedData[branchId]['TOTAL_GA'][monthKey] = totalGAExpenses;
    
    // Other Income (positive)
    const otherIncomePct = assumptionsData[branchId]?.['OTHER_INCOME']?.assumption_value || 0;
    const otherIncome = netRevenue * (otherIncomePct / 100);
    calculatedData[branchId]['OTHER_INCOME'][monthKey] = otherIncome;
    
    // EBITDA
    const ebitda = grossProfit - totalGAExpenses + otherIncome;
    calculatedData[branchId]['EBITDA'][monthKey] = ebitda;
    
    // Finance Cost
    const financeCostPct = assumptionsData[branchId]?.['FINANCE_COST']?.assumption_value || 0;
    const financeCost = netRevenue * (financeCostPct / 100);
    calculatedData[branchId]['FINANCE_COST'][monthKey] = financeCost;
    
    // Depreciation
    const depreciationPct = assumptionsData[branchId]?.['DEPRECIATION']?.assumption_value || 0;
    const depreciation = netRevenue * (depreciationPct / 100);
    calculatedData[branchId]['DEPRECIATION'][monthKey] = depreciation;
    
    // Zakat
    const zakatPct = assumptionsData[branchId]?.['ZAKAT']?.assumption_value || 0;
    const zakat = netRevenue * (zakatPct / 100);
    calculatedData[branchId]['ZAKAT'][monthKey] = zakat;
    
    // Net Profit
    const netProfit = ebitda - financeCost - depreciation - zakat;
    calculatedData[branchId]['NET_PROFIT'][monthKey] = netProfit;
    
    // OCI
    const ociPct = assumptionsData[branchId]?.['OCI']?.assumption_value || 0;
    const oci = netRevenue * (ociPct / 100);
    calculatedData[branchId]['OCI'][monthKey] = oci;
    
    // Total Comprehensive Income
    calculatedData[branchId]['TOTAL_COMP_INCOME'][monthKey] = netProfit + oci;
}

/**
 * Show/hide no data state
 */
function showNoData(show) {
    const tableSection = document.querySelector('.income-statement-section table');
    if (tableSection) {
        tableSection.style.display = show ? 'none' : 'table';
    }
    if (noDataState) {
        noDataState.style.display = show ? 'flex' : 'none';
    }
}

/**
 * Render the budget table
 */
function renderTable() {
    if (!tableBody || !tableHeader) return;
    
    // Build header
    renderTableHeader();
    
    // Build body
    tableBody.innerHTML = '';
    
    let currentSection = '';
    
    LINE_ITEMS_CONFIG.forEach(item => {
        // Add section header if section changes
        if (item.section !== currentSection) {
            currentSection = item.section;
            const sectionRow = createSectionRow(currentSection);
            tableBody.appendChild(sectionRow);
        }
        
        const row = createDataRow(item);
        tableBody.appendChild(row);
    });
}

/**
 * Render table header with months
 */
function renderTableHeader() {
    if (!tableHeader) return;
    
    let html = '<th>Line Item</th>';
    
    // Add month columns
    for (let m = 1; m <= 12; m++) {
        html += `<th>${MONTH_NAMES[m]}</th>`;
    }
    
    // Add FY Total column
    html += '<th class="fy-total-col">FY Total</th>';
    
    tableHeader.innerHTML = html;
}

/**
 * Create a section header row
 */
function createSectionRow(sectionName) {
    const tr = document.createElement('tr');
    tr.className = 'section-row';
    
    const td = document.createElement('td');
    td.colSpan = 14; // Line Item + 12 months + FY Total
    td.textContent = sectionName;
    tr.appendChild(td);
    
    return tr;
}

/**
 * Create a data row
 */
function createDataRow(item) {
    const tr = document.createElement('tr');
    const branchesToShow = getSelectedBranches();
    
    // Apply row styling
    if (item.isCalculated) {
        if (item.isSubtotal) {
            tr.className = 'subtotal-row';
        } else if (['REV_NET', 'GROSS_PROFIT', 'EBITDA', 'NET_PROFIT', 'TOTAL_COMP_INCOME'].includes(item.code)) {
            tr.className = 'calculated-row';
        }
    }
    
    // Line Item Name
    const tdName = document.createElement('td');
    tdName.className = item.isExpense || item.isRevenue ? 'indent-1' : '';
    tdName.textContent = item.name;
    tr.appendChild(tdName);
    
    // Calculate values for each month (aggregate across selected branches)
    let fyTotal = 0;
    
    for (let month = 1; month <= 12; month++) {
        const td = document.createElement('td');
        td.className = 'value-cell';
        
        let monthTotal = 0;
        branchesToShow.forEach(branchId => {
            const value = calculatedData[branchId]?.[item.code]?.[`month_${month}`] || 0;
            monthTotal += value;
        });
        
        fyTotal += monthTotal;
        td.textContent = formatCurrency(monthTotal);
        
        if (monthTotal < 0) td.classList.add('negative');
        else if (monthTotal > 0 && item.isCalculated) td.classList.add('positive');
        
        tr.appendChild(td);
    }
    
    // FY Total column
    const tdTotal = document.createElement('td');
    tdTotal.className = 'value-cell fy-total-col';
    tdTotal.textContent = formatCurrency(fyTotal);
    if (fyTotal < 0) tdTotal.classList.add('negative');
    else if (fyTotal > 0 && item.isCalculated) tdTotal.classList.add('positive');
    tr.appendChild(tdTotal);
    
    return tr;
}

/**
 * Format currency
 */
function formatCurrency(value) {
    if (value === null || value === undefined || isNaN(value)) return '—';
    return new Intl.NumberFormat('en-SA', {
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

/**
 * Export to Excel using ExcelJS with styling
 */
async function exportToExcel() {
    if (!calculatedData || Object.keys(calculatedData).length === 0) {
        showStatus('No data to export. Please load budget data first.', 'error');
        return;
    }
    
    try {
        showStatus('Generating Excel file...', 'info');
        
        // Create workbook
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'HNH Budget System';
        workbook.created = new Date();
        
        const branchName = selectedBranch === 'all' ? 'All Branches' : BRANCHES[parseInt(selectedBranch)];
        const sheetName = `${branchName} ${currentYear}`.substring(0, 31);
        const worksheet = workbook.addWorksheet(sheetName);
        
        // Define colors matching the web page
        const colors = {
            primary: '0C5A91',
            primaryDark: '084670',
            primaryLight: '1E7AB8',
            accent: 'EF4151',
            success: '10B981',
            textDark: '1E3A5F',
            bgLight: 'F1F5F9',
            border: 'E2E8F0',
            white: 'FFFFFF'
        };
        
        // Define fonts
        const fonts = {
            header: { name: 'Inter', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
            sectionHeader: { name: 'Inter', size: 9, bold: true, color: { argb: 'FFFFFFFF' } },
            subtotal: { name: 'Inter', size: 10, bold: true, color: { argb: 'FF1E3A5F' } },
            calculated: { name: 'Inter', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
            normal: { name: 'Inter', size: 10, color: { argb: 'FF1E3A5F' } },
            monospace: { name: 'Consolas', size: 10, color: { argb: 'FF1E3A5F' } }
        };
        
        // Set column widths
        worksheet.columns = [
            { header: 'Line Item', key: 'lineItem', width: 35 },
            ...Array.from({ length: 12 }, (_, i) => ({ header: MONTH_NAMES[i + 1], key: `month_${i + 1}`, width: 14 })),
            { header: 'FY Total', key: 'fy_total', width: 16 }
        ];
        
        // Style header row
        const headerRow = worksheet.getRow(1);
        headerRow.height = 25;
        headerRow.eachCell((cell, colNumber) => {
            cell.font = fonts.header;
            cell.fill = {
                type: 'gradient',
                gradient: 'angle',
                degree: 135,
                stops: [
                    { position: 0, color: { argb: 'FF0C5A91' } },
                    { position: 0.5, color: { argb: 'FF1E7AB8' } },
                    { position: 1, color: { argb: 'FF3A9AD9' } }
                ]
            };
            cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'center' };
            cell.border = {
                bottom: { style: 'thin', color: { argb: 'FF084670' } }
            };
        });
        
        const branchesToShow = getSelectedBranches();
        let currentSection = '';
        let rowIndex = 2;
        
        LINE_ITEMS_CONFIG.forEach((item, itemIndex) => {
            // Add section header row
            if (item.section !== currentSection) {
                currentSection = item.section;
                
                const sectionRow = worksheet.addRow([currentSection]);
                sectionRow.height = 22;
                
                // Merge cells for section header
                worksheet.mergeCells(rowIndex, 1, rowIndex, 14);
                
                const sectionCell = sectionRow.getCell(1);
                sectionCell.font = fonts.sectionHeader;
                sectionCell.fill = {
                    type: 'gradient',
                    gradient: 'angle',
                    degree: 135,
                    stops: [
                        { position: 0, color: { argb: 'FF0C5A91' } },
                        { position: 1, color: { argb: 'FF1E7AB8' } }
                    ]
                };
                sectionCell.alignment = { vertical: 'middle', horizontal: 'left' };
                
                rowIndex++;
            }
            
            // Build data row
            const rowData = [item.name];
            let fyTotal = 0;
            
            for (let month = 1; month <= 12; month++) {
                let monthTotal = 0;
                branchesToShow.forEach(branchId => {
                    const value = calculatedData[branchId]?.[item.code]?.[`month_${month}`] || 0;
                    monthTotal += value;
                });
                fyTotal += monthTotal;
                rowData.push(Math.round(monthTotal));
            }
            rowData.push(Math.round(fyTotal));
            
            const dataRow = worksheet.addRow(rowData);
            dataRow.height = 20;
            
            // Determine row type for styling
            const isCalculatedRow = ['REV_NET', 'GROSS_PROFIT', 'EBITDA', 'NET_PROFIT', 'TOTAL_COMP_INCOME'].includes(item.code);
            const isSubtotalRow = item.isSubtotal;
            const isEvenRow = (rowIndex % 2) === 0;
            
            dataRow.eachCell((cell, colNumber) => {
                // Apply styling based on row type
                if (isCalculatedRow) {
                    cell.font = fonts.calculated;
                    cell.fill = {
                        type: 'gradient',
                        gradient: 'angle',
                        degree: 135,
                        stops: [
                            { position: 0, color: { argb: 'FF0C5A91' } },
                            { position: 1, color: { argb: 'FF084670' } }
                        ]
                    };
                } else if (isSubtotalRow) {
                    cell.font = fonts.subtotal;
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFE3EDF5' }
                    };
                } else {
                    cell.font = colNumber === 1 ? fonts.normal : fonts.monospace;
                    if (isEvenRow) {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFF1F5F9' }
                        };
                    }
                }
                
                // Alignment
                cell.alignment = { 
                    vertical: 'middle', 
                    horizontal: colNumber === 1 ? 'left' : 'right' 
                };
                
                // Number format for value cells
                if (colNumber > 1) {
                    cell.numFmt = '#,##0';
                    
                    // Color negative values red
                    if (typeof cell.value === 'number' && cell.value < 0 && !isCalculatedRow) {
                        cell.font = { ...cell.font, color: { argb: 'FFEF4151' } };
                    }
                }
                
                // FY Total column special styling
                if (colNumber === 14) {
                    cell.font = { ...cell.font, bold: true };
                    if (!isCalculatedRow && !isSubtotalRow) {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFE8F4FC' }
                        };
                    }
                    cell.border = {
                        left: { style: 'medium', color: { argb: 'FF0C5A91' } }
                    };
                }
                
                // Bottom border
                cell.border = {
                    ...cell.border,
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
                };
            });
            
            rowIndex++;
        });
        
        // Add title row at the very top
        worksheet.insertRow(1, []);
        const titleRow = worksheet.getRow(1);
        const scenario = currentScenario.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        worksheet.mergeCells(1, 1, 1, 14);
        titleRow.getCell(1).value = `Income Statement Budget - ${branchName} - ${currentYear} - ${scenario}`;
        titleRow.getCell(1).font = { name: 'Inter', size: 14, bold: true, color: { argb: 'FF0C5A91' } };
        titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
        titleRow.height = 30;
        
        // Freeze header rows
        worksheet.views = [
            { state: 'frozen', xSplit: 1, ySplit: 2, topLeftCell: 'B3' }
        ];
        
        // Generate and download file
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const filename = `Income_Statement_Budget_${branchName.replace(/ /g, '_')}_${currentYear}_${scenario.replace(/ /g, '_')}.xlsx`;
        
        saveAs(blob, filename);
        
        showStatus(`Exported to ${filename}`, 'success');
        
    } catch (err) {
        console.error('Export failed:', err);
        showStatus('Failed to export: ' + err.message, 'error');
    }
}

/**
 * Show loading
 */
function showLoading(show) {
    if (loadingEl) loadingEl.classList.toggle('hidden', !show);
}

/**
 * Show status message
 */
function showStatus(message, type = 'info') {
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');
    setTimeout(() => statusMessage.classList.add('hidden'), 5000);
}

/**
 * Save session data to sessionStorage
 */
function saveSessionData() {
    const sessionData = {
        currentYear,
        currentScenario,
        selectedBranch,
        monthlyRevenueData,
        assumptionsData,
        revenueTypeAssumptions,
        calculatedData
    };
    sessionStorage.setItem('incomeStatementBudgetSession', JSON.stringify(sessionData));
}

/**
 * Restore session data from sessionStorage
 */
function restoreSessionData() {
    try {
        const stored = sessionStorage.getItem('incomeStatementBudgetSession');
        if (!stored) return;
        
        const sessionData = JSON.parse(stored);
        
        // Restore year selection
        if (sessionData.currentYear && yearSelect) {
            yearSelect.value = sessionData.currentYear;
            currentYear = sessionData.currentYear;
        }
        
        // Restore scenario selection
        if (sessionData.currentScenario && scenarioSelect) {
            scenarioSelect.value = sessionData.currentScenario;
            currentScenario = sessionData.currentScenario;
        }
        
        // Restore branch selection
        if (sessionData.selectedBranch && branchSelect) {
            branchSelect.value = sessionData.selectedBranch;
            selectedBranch = sessionData.selectedBranch;
        }
        
        // Restore data and render table
        if (sessionData.calculatedData && Object.keys(sessionData.calculatedData).length > 0) {
            monthlyRevenueData = sessionData.monthlyRevenueData || {};
            assumptionsData = sessionData.assumptionsData || {};
            revenueTypeAssumptions = sessionData.revenueTypeAssumptions || {};
            calculatedData = sessionData.calculatedData;
            showNoData(false);
            renderTable();
        }
        
    } catch (err) {
        console.error('Failed to restore session data:', err);
    }
}
