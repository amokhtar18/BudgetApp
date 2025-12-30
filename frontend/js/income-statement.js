// Income Statement Assumptions Module
// Handles multi-branch assumptions input with keyboard navigation
// Line items exactly match the Excel template

const BRANCHES = {
    1: 'Riyadh',
    2: 'Khamis',
    3: 'Jazan',
    4: 'Qassem',
    5: 'Madinah',
    6: 'Abha'
};

const BRANCH_IDS = Object.keys(BRANCHES).map(Number);

// Revenue Type Assumptions Configuration
const REVENUE_TYPE_CONFIG = [
    { code: 'REV_TYPE_INSURANCE', name: 'Insurance' },
    { code: 'REV_TYPE_CASH', name: 'Cash' },
    { code: 'REV_TYPE_MOH', name: 'MOH' },
    { code: 'REV_TYPE_OTHER_CREDIT', name: 'Other Credit' }
];

// Line items configuration - EXACTLY from Excel template
const LINE_ITEMS_CONFIG = [
    // Revenue Section - Contractual Discounts
    { code: 'REV_IP', name: 'Inpatient', section: 'Revenue - Contractual Discounts', isRevenue: true, revenueType: 'IP' },
    { code: 'REV_OP', name: 'Outpatient', section: 'Revenue - Contractual Discounts', isRevenue: true, revenueType: 'OP' },
    { code: 'REV_ER', name: 'Emergency', section: 'Revenue - Contractual Discounts', isRevenue: true, revenueType: 'ER' },
    { code: 'REV_SUB', name: 'Sub Revenue', section: 'Revenue - Contractual Discounts', isCalculated: true, formula: 'sum_revenue' },
    
    // Discounts - Rejection split into MOH and Insurance, Volume, Early Pay calculated from Sub Revenue
    { code: 'DIS_REJECTION_MOH', name: 'Rejection Expense - MOH', section: 'Discounts', isExpense: true, calcFromSubRevenue: true, isRejectionPart: true },
    { code: 'DIS_REJECTION_INS', name: 'Rejection Expense - Insurance', section: 'Discounts', isExpense: true, calcFromSubRevenue: true, isRejectionPart: true },
    { code: 'DIS_REJECTION', name: 'Rejection Expense', section: 'Discounts', isCalculated: true, formula: 'sum_rejection', calcFromSubRevenue: true },
    { code: 'DIS_VOLUME', name: 'Volume Discount', section: 'Discounts', isExpense: true, calcFromSubRevenue: true },
    { code: 'DIS_EARLY_PAY', name: 'Early Payment Discount', section: 'Discounts', isExpense: true, calcFromSubRevenue: true },
    { code: 'DIS_SETTLEMENT', name: 'Revenue - Settlement Discount', section: 'Discounts', isCalculated: true, formula: 'sum_discounts' },
    { code: 'REV_NET', name: 'Net Revenue', section: 'Net Revenue', isCalculated: true, formula: 'net_revenue', isNetRevenue: true },
    
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
    { code: 'TOTAL_DC', name: 'Total Direct Cost', section: 'Direct Cost', isCalculated: true, formula: 'total_dc' },
    { code: 'GROSS_PROFIT', name: 'Gross Profit', section: 'Gross Profit', isCalculated: true, formula: 'gross_profit' },
    
    // G&A Expenses
    { code: 'GA_GOVT_FEE', name: 'Government Fee', section: 'General And Administrative Expenses', isExpense: true },
    { code: 'GA_AUDIT', name: 'Audit Fee', section: 'General And Administrative Expenses', isExpense: true },
    { code: 'GA_COMMUNICATION', name: 'Communication Expense', section: 'General And Administrative Expenses', isExpense: true },
    { code: 'GA_ECL', name: 'Expected Credit Loss', section: 'General And Administrative Expenses', isExpense: true },
    { code: 'GA_OTHER', name: 'Other Indirect Expenses', section: 'General And Administrative Expenses', isExpense: true },
    { code: 'GA_POSTAGE', name: 'Postage Printing And Stationary', section: 'General And Administrative Expenses', isExpense: true },
    { code: 'GA_PROFESSIONAL', name: 'Professional Fee And Subscription', section: 'General And Administrative Expenses', isExpense: true },
    { code: 'GA_SECURITY', name: 'Security And Cleaning Expenses', section: 'General And Administrative Expenses', isExpense: true },
    { code: 'GA_TRAINING', name: 'Staff Training And Recruitment', section: 'General And Administrative Expenses', isExpense: true },
    { code: 'GA_EMPLOYEE', name: 'Employee Cost', section: 'General And Administrative Expenses', isExpense: true },
    { code: 'GA_MARKETING', name: 'Selling And Marketing Expenses', section: 'General And Administrative Expenses', isExpense: true },
    { code: 'GA_HO_CHARGES', name: 'Charges From Head Office', section: 'General And Administrative Expenses', isExpense: true },
    { code: 'TOTAL_GA', name: 'Total G&A Expenses', section: 'General And Administrative Expenses', isCalculated: true, formula: 'total_ga' },
    { code: 'OTHER_INCOME', name: 'Other Income', section: 'Other', isOtherIncome: true },
    { code: 'EBITDA', name: 'EBITDA', section: 'EBITDA', isCalculated: true, formula: 'ebitda' },
    
    // Below EBITDA
    { code: 'FINANCE_COST', name: 'Finance Cost', section: 'Finance', isExpense: true },
    { code: 'DEPRECIATION', name: 'Depreciation And Amortization', section: 'D&A', isExpense: true },
    { code: 'ZAKAT', name: 'Zakat', section: 'Taxes', isExpense: true },
    { code: 'NET_PROFIT', name: 'Net Profit / (Loss)', section: 'Net Profit', isCalculated: true, formula: 'net_profit' },
    { code: 'OCI', name: 'OCI', section: 'OCI', isExpense: true },
    { code: 'TOTAL_COMP_INCOME', name: 'Total Comprehensive Income', section: 'Total', isCalculated: true, formula: 'total_comprehensive' }
];

// State management
let currentYear = new Date().getFullYear() + 1;
let currentScenario = 'most_likely';
let revenueData = {}; // { branchId: { IP: value, OP: value, ER: value } }
let revenueTypeAssumptions = {}; // { branchId: { REV_TYPE_INSURANCE: value, REV_TYPE_CASH: value, etc } }
let assumptionsData = {}; // { branchId: { lineItemCode: { assumption_value: value } } }
let calculatedData = {}; // { branchId: { lineItemCode: calculatedValue } }
let currentUser = null;
let assumptionsVersion = 0; // Track the current version of loaded assumptions
let assumptionsPublished = false; // Track if current assumptions are published

// Initialize the page
document.addEventListener('DOMContentLoaded', async function() {
    // Check authentication via API
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) {
        window.location.href = 'login.html';
        return;
    }
    
    // Set user info
    document.getElementById('userName').textContent = currentUser?.full_name || currentUser?.username || '';
    
    // Initialize controls
    initializeControls();
    
    // Render empty table structure - data loads when user selects year/scenario
    renderTable();
    
    // Restore session data if available
    restoreSessionData();
});

/**
 * Check if user is authenticated
 */
async function checkAuthentication() {
    try {
        const response = await fetch('/api/auth/check', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data.user;
            return true;
        }
        return false;
    } catch (err) {
        console.error('Auth check failed:', err);
        return false;
    }
}

function initializeControls() {
    const yearInput = document.getElementById('year-input');
    const yearSelect = document.getElementById('year-select');
    const loadBtn = document.getElementById('load-btn');
    const scenarioSelect = document.getElementById('scenarioSelect');
    const saveDraftBtn = document.getElementById('saveDraftBtn');
    const publishBtn = document.getElementById('publishBtn');
    const viewBudgetBtn = document.getElementById('viewBudgetBtn');
    
    // Set default year to next year
    yearInput.value = currentYear;
    
    // Load existing years from API
    loadExistingYears();
    
    // Year input change - update but don't auto-load
    yearInput.addEventListener('change', function() {
        currentYear = parseInt(this.value) || new Date().getFullYear() + 1;
        yearSelect.value = ''; // Clear dropdown selection
        hideYearBadge();
    });
    
    // Year select change - update but don't auto-load
    yearSelect.addEventListener('change', function() {
        if (this.value) {
            currentYear = parseInt(this.value);
            yearInput.value = currentYear;
            hideYearBadge();
        }
    });
    
    // Load button click - trigger data load
    loadBtn.addEventListener('click', async function() {
        await loadData();
        updateYearBadge();
    });
    
    // Scenario select change - reload data if already loaded
    scenarioSelect.addEventListener('change', async function() {
        currentScenario = this.value;
        // Only reload if data was already loaded (check if revenueData has data)
        if (Object.keys(revenueData).length > 0) {
            await loadData();
        }
    });
    
    // Save Draft button
    if (saveDraftBtn) {
        saveDraftBtn.addEventListener('click', async function() {
            await saveAssumptions(false);
        });
    }
    
    // Publish button
    if (publishBtn) {
        publishBtn.addEventListener('click', async function() {
            await saveAssumptions(true);
        });
    }
    
    // View Budget button - navigate to budget view page
    if (viewBudgetBtn) {
        viewBudgetBtn.addEventListener('click', function() {
            if (!currentYear) {
                showError('Please select a year first');
                return;
            }
            // Navigate to budget view page with year and scenario parameters
            window.location.href = `income-statement-budget.html?year=${currentYear}&scenario=${currentScenario}`;
        });
    }
}

// Update year badge to show if year is existing or new
function updateYearBadge() {
    const yearBadge = document.getElementById('year-badge');
    const yearBadgeText = document.getElementById('year-badge-text');
    const yearSelect = document.getElementById('year-select');
    
    if (!yearBadge || !yearBadgeText) return;
    
    // Check if the current year exists in the dropdown
    const existingYears = Array.from(yearSelect.options).map(opt => parseInt(opt.value)).filter(v => !isNaN(v));
    const isExisting = existingYears.includes(currentYear);
    
    yearBadge.classList.remove('hidden', 'existing', 'new');
    
    if (isExisting) {
        yearBadge.classList.add('existing');
        yearBadgeText.textContent = 'Existing';
    } else {
        yearBadge.classList.add('new');
        yearBadgeText.textContent = 'New';
    }
}

function hideYearBadge() {
    const yearBadge = document.getElementById('year-badge');
    if (yearBadge) {
        yearBadge.classList.add('hidden');
    }
}

// Update version display to show loaded assumptions version
function updateVersionDisplay() {
    const yearBadge = document.getElementById('year-badge');
    const yearBadgeText = document.getElementById('year-badge-text');
    
    if (!yearBadge || !yearBadgeText) return;
    
    yearBadge.classList.remove('hidden', 'existing', 'new');
    
    if (assumptionsVersion > 0) {
        if (assumptionsPublished) {
            yearBadge.classList.add('existing');
            yearBadgeText.textContent = `v${assumptionsVersion} (Published)`;
        } else {
            yearBadge.classList.add('existing');
            yearBadgeText.textContent = `v${assumptionsVersion} (Draft)`;
        }
    } else {
        yearBadge.classList.add('new');
        yearBadgeText.textContent = 'New';
    }
}

async function loadExistingYears() {
    try {
        const response = await fetch('/api/income-statement/years');
        if (response.ok) {
            const data = await response.json();
            const yearSelect = document.getElementById('year-select');
            
            // Clear existing options except first
            yearSelect.innerHTML = '<option value="">Select existing year</option>';
            
            if (Array.isArray(data.years)) {
                data.years.forEach(year => {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    yearSelect.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Error loading existing years:', error);
    }
}

async function loadData() {
    showLoading(true);
    
    try {
        console.log(`Loading data for year: ${currentYear}, scenario: ${currentScenario}`);
        
        // Load revenue data for all branches
        await loadAllBranchesRevenue();
        
        console.log('Revenue data loaded:', revenueData);
        
        // Load existing assumptions for all branches
        await loadAllBranchesAssumptions();
        
        console.log('Assumptions data loaded:', assumptionsData);
        
        // Render the table
        renderTable();
        
        // Calculate values
        calculateAllValues();
        
        // Save session data for persistence
        saveSessionData();
        
        console.log('Table rendered and calculations complete');
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Failed to load data. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function loadAllBranchesRevenue() {
    revenueData = {};
    
    const promises = BRANCH_IDS.map(async (branchId) => {
        try {
            const response = await fetch(`/api/income-statement/revenue/${branchId}/${currentYear}?scenario=${currentScenario}`);
            if (response.ok) {
                const data = await response.json();
                console.log(`Revenue for branch ${branchId}:`, data);
                
                // API returns { success: true, revenue: { IP: x, OP: y, ER: z } }
                if (data.revenue) {
                    revenueData[branchId] = {
                        IP: parseFloat(data.revenue.IP) || 0,
                        OP: parseFloat(data.revenue.OP) || 0,
                        ER: parseFloat(data.revenue.ER) || 0
                    };
                } else {
                    revenueData[branchId] = { IP: 0, OP: 0, ER: 0 };
                }
            } else {
                console.error(`Failed to load revenue for branch ${branchId}:`, response.status);
                revenueData[branchId] = { IP: 0, OP: 0, ER: 0 };
            }
        } catch (error) {
            console.error(`Error loading revenue for branch ${branchId}:`, error);
            revenueData[branchId] = { IP: 0, OP: 0, ER: 0 };
        }
    });
    
    await Promise.all(promises);
}

async function loadAllBranchesAssumptions() {
    assumptionsData = {};
    revenueTypeAssumptions = {};
    assumptionsVersion = 0;
    assumptionsPublished = false;
    
    const revenueTypeCodes = REVENUE_TYPE_CONFIG.map(rt => rt.code);
    
    const promises = BRANCH_IDS.map(async (branchId) => {
        try {
            const response = await fetch(`/api/income-statement/assumptions?year=${currentYear}&branch_id=${branchId}&scenario=${currentScenario}`);
            if (response.ok) {
                const data = await response.json();
                assumptionsData[branchId] = {};
                revenueTypeAssumptions[branchId] = {};
                
                // Track version (use highest version from any branch)
                if (data.version && data.version > assumptionsVersion) {
                    assumptionsVersion = data.version;
                }
                if (data.is_published) {
                    assumptionsPublished = true;
                }
                
                // API returns { assumptions: [...] } - extract the array
                const assumptionsArray = data.assumptions || data || [];
                
                console.log(`Branch ${branchId} assumptions loaded (v${data.version}):`, assumptionsArray);
                
                if (Array.isArray(assumptionsArray)) {
                    assumptionsArray.forEach(item => {
                        // API uses 'assumption_percentage' not 'assumption_value'
                        const value = parseFloat(item.assumption_percentage ?? item.assumption_value ?? 0);
                        
                        // Check if this is a revenue type assumption
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
        } catch (error) {
            console.error(`Error loading assumptions for branch ${branchId}:`, error);
            assumptionsData[branchId] = {};
            revenueTypeAssumptions[branchId] = {};
        }
    });
    
    await Promise.all(promises);
    
    // Update version display after all branches loaded
    updateVersionDisplay();
}

function renderRevenueAssumptionsTable() {
    const container = document.getElementById('revenueAssumptionsContainer');
    if (!container) return;
    
    // Build table HTML
    let html = `
        <table class="income-table revenue-assumptions-table">
            <thead>
                <tr>
                    <th>Revenue Type</th>
                    <th>Total %</th>
    `;
    
    // Add branch headers
    BRANCH_IDS.forEach(branchId => {
        html += `<th class="branch-col">${BRANCHES[branchId]}</th>`;
    });
    
    html += `</tr></thead><tbody>`;
    
    // Add rows for each revenue type
    REVENUE_TYPE_CONFIG.forEach((revType, idx) => {
        html += `<tr data-rev-type="${revType.code}">`;
        html += `<td>${revType.name}</td>`;
        
        // Total % column (calculated)
        html += `<td class="calculated-value" id="rev-total-${revType.code}">-</td>`;
        
        // Branch input columns
        BRANCH_IDS.forEach((branchId, colIdx) => {
            const existingValue = revenueTypeAssumptions[branchId]?.[revType.code] || '';
            html += `
                <td class="value-cell">
                    <div class="input-wrapper">
                        <input type="number" 
                            class="income-input rev-type-input"
                            data-branch-id="${branchId}"
                            data-rev-type="${revType.code}"
                            data-row-index="${idx}"
                            data-col-index="${colIdx}"
                            value="${existingValue}"
                            step="0.01"
                        >
                        <span class="input-suffix">%</span>
                    </div>
                </td>
            `;
        });
        
        html += `</tr>`;
    });
    
    // Add total row
    html += `<tr class="calculated-row"><td><strong>Total</strong></td><td id="rev-grand-total">-</td>`;
    BRANCH_IDS.forEach(branchId => {
        html += `<td class="calculated-value" id="rev-branch-total-${branchId}">-</td>`;
    });
    html += `</tr>`;
    
    html += `</tbody></table>`;
    
    container.innerHTML = html;
    
    // Add event listeners for inputs
    container.querySelectorAll('.rev-type-input').forEach(input => {
        input.addEventListener('change', function() {
            onRevenueTypeChange(
                parseInt(this.dataset.branchId),
                this.dataset.revType,
                parseFloat(this.value) || 0
            );
        });
        input.addEventListener('input', function() {
            onRevenueTypeChange(
                parseInt(this.dataset.branchId),
                this.dataset.revType,
                parseFloat(this.value) || 0
            );
        });
    });
    
    // Setup keyboard navigation for revenue type inputs
    setupRevenueTypeKeyboardNavigation();
    
    // Calculate totals
    calculateRevenueTypeTotals();
}

function onRevenueTypeChange(branchId, revTypeCode, value) {
    if (!revenueTypeAssumptions[branchId]) {
        revenueTypeAssumptions[branchId] = {};
    }
    revenueTypeAssumptions[branchId][revTypeCode] = value;
    
    // Recalculate totals
    calculateRevenueTypeTotals();
    
    // Recalculate all values (for rejection expenses) - this also calls updateCalculatedUI
    calculateAllValues();
    
    // Save session data on each change
    saveSessionData();
}

function calculateRevenueTypeTotals() {
    // Calculate total per branch
    BRANCH_IDS.forEach(branchId => {
        let branchTotal = 0;
        REVENUE_TYPE_CONFIG.forEach(revType => {
            branchTotal += revenueTypeAssumptions[branchId]?.[revType.code] || 0;
        });
        
        const branchTotalCell = document.getElementById(`rev-branch-total-${branchId}`);
        if (branchTotalCell) {
            branchTotalCell.textContent = branchTotal.toFixed(2) + '%';
            // Highlight if not 100%
            if (Math.abs(branchTotal - 100) > 0.01) {
                branchTotalCell.style.color = 'var(--accent)';
            } else {
                branchTotalCell.style.color = 'var(--success)';
            }
        }
    });
    
    // Calculate total per revenue type (average across branches)
    REVENUE_TYPE_CONFIG.forEach(revType => {
        let typeTotal = 0;
        let branchCount = 0;
        BRANCH_IDS.forEach(branchId => {
            const val = revenueTypeAssumptions[branchId]?.[revType.code] || 0;
            if (val > 0) {
                typeTotal += val;
                branchCount++;
            }
        });
        
        const avgTotal = branchCount > 0 ? typeTotal / branchCount : 0;
        const totalCell = document.getElementById(`rev-total-${revType.code}`);
        if (totalCell) {
            totalCell.textContent = avgTotal.toFixed(2) + '%';
        }
    });
}

/**
 * Setup keyboard navigation for revenue type assumption inputs
 */
function setupRevenueTypeKeyboardNavigation() {
    const inputs = document.querySelectorAll('.rev-type-input');
    const inputGrid = {};
    
    inputs.forEach(input => {
        const rowIdx = parseInt(input.dataset.rowIndex);
        const colIdx = parseInt(input.dataset.colIndex);
        if (!inputGrid[rowIdx]) inputGrid[rowIdx] = {};
        inputGrid[rowIdx][colIdx] = input;
    });
    
    const rowIndices = Object.keys(inputGrid).map(Number).sort((a, b) => a - b);
    const maxCol = BRANCH_IDS.length - 1;
    
    inputs.forEach(input => {
        input.addEventListener('keydown', function(e) {
            const currentRow = parseInt(this.dataset.rowIndex);
            const currentCol = parseInt(this.dataset.colIndex);
            
            let targetRow = currentRow;
            let targetCol = currentCol;
            
            switch(e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    const prevRowIdx = rowIndices.indexOf(currentRow) - 1;
                    if (prevRowIdx >= 0) {
                        targetRow = rowIndices[prevRowIdx];
                    }
                    break;
                    
                case 'ArrowDown':
                    e.preventDefault();
                    const nextRowIdx = rowIndices.indexOf(currentRow) + 1;
                    if (nextRowIdx < rowIndices.length) {
                        targetRow = rowIndices[nextRowIdx];
                    }
                    break;
                    
                case 'ArrowLeft':
                    e.preventDefault();
                    if (currentCol > 0) {
                        targetCol = currentCol - 1;
                    } else if (rowIndices.indexOf(currentRow) > 0) {
                        targetRow = rowIndices[rowIndices.indexOf(currentRow) - 1];
                        targetCol = maxCol;
                    }
                    break;
                    
                case 'ArrowRight':
                    e.preventDefault();
                    if (currentCol < maxCol) {
                        targetCol = currentCol + 1;
                    } else if (rowIndices.indexOf(currentRow) < rowIndices.length - 1) {
                        targetRow = rowIndices[rowIndices.indexOf(currentRow) + 1];
                        targetCol = 0;
                    }
                    break;
                    
                case 'Enter':
                case 'Tab':
                    if (!e.shiftKey) {
                        e.preventDefault();
                        if (currentCol < maxCol) {
                            targetCol = currentCol + 1;
                        } else if (rowIndices.indexOf(currentRow) < rowIndices.length - 1) {
                            targetRow = rowIndices[rowIndices.indexOf(currentRow) + 1];
                            targetCol = 0;
                        }
                    } else {
                        e.preventDefault();
                        if (currentCol > 0) {
                            targetCol = currentCol - 1;
                        } else if (rowIndices.indexOf(currentRow) > 0) {
                            targetRow = rowIndices[rowIndices.indexOf(currentRow) - 1];
                            targetCol = maxCol;
                        }
                    }
                    break;
                    
                default:
                    return;
            }
            
            if (inputGrid[targetRow] && inputGrid[targetRow][targetCol]) {
                inputGrid[targetRow][targetCol].focus({ preventScroll: true });
                inputGrid[targetRow][targetCol].select();
            }
        });
    });
}

function renderTableHeader() {
    const thead = document.querySelector('.income-table:not(.revenue-assumptions-table) thead tr');
    if (!thead) return;
    
    // Clear existing headers except first (Line Item)
    thead.innerHTML = '<th>Line Item</th><th>FY Total</th>';
    
    // Add branch columns with accent gradient styling
    BRANCH_IDS.forEach(branchId => {
        const th = document.createElement('th');
        th.className = 'branch-col';
        th.textContent = BRANCHES[branchId];
        thead.appendChild(th);
    });
}

function renderTable() {
    // Render revenue assumptions table first
    renderRevenueAssumptionsTable();
    
    // Render header for main table
    renderTableHeader();
    
    const tbody = document.getElementById('incomeStatementBody');
    tbody.innerHTML = '';
    
    let currentSection = '';
    let rowIndex = 0;
    
    LINE_ITEMS_CONFIG.forEach((item, itemIndex) => {
        // Add section header if new section
        if (item.section !== currentSection) {
            currentSection = item.section;
            const sectionRow = document.createElement('tr');
            sectionRow.className = 'section-header';
            // 2 columns (Line Item + FY Total) + 6 branch columns = 8 total
            sectionRow.innerHTML = `<td colspan="8" class="section-title">${currentSection}</td>`;
            tbody.appendChild(sectionRow);
        }
        
        // Create data row
        const row = createTableRow(item, rowIndex, itemIndex);
        tbody.appendChild(row);
        rowIndex++;
    });
    
    // Setup keyboard navigation after rendering
    setupKeyboardNavigation();
}

function createTableRow(item, rowIndex, itemIndex) {
    const row = document.createElement('tr');
    row.className = item.isCalculated ? 'calculated-row' : '';
    row.dataset.itemCode = item.code;
    
    // Line Item Name column
    const nameCell = document.createElement('td');
    nameCell.className = 'line-item-name';
    nameCell.textContent = item.name;
    row.appendChild(nameCell);
    
    // FY Total column (sum of all branches)
    const fyCell = document.createElement('td');
    fyCell.className = 'fy-revenue';
    fyCell.id = `fy-${item.code}`;
    
    if (item.isRevenue && item.revenueType) {
        // Sum revenue across all branches for this revenue type
        let totalRevenue = 0;
        BRANCH_IDS.forEach(branchId => {
            totalRevenue += (revenueData[branchId]?.[item.revenueType] || 0);
        });
        fyCell.textContent = formatCurrency(totalRevenue);
        fyCell.dataset.value = totalRevenue;
    } else {
        fyCell.textContent = '-';
    }
    row.appendChild(fyCell);
    
    // Branch columns (6 columns)
    BRANCH_IDS.forEach((branchId, branchIndex) => {
        const branchCell = document.createElement('td');
        
        if (item.isCalculated) {
            // Calculated fields show computed values
            branchCell.id = `calc-${branchId}-${item.code}`;
            branchCell.className = 'calculated-value';
            branchCell.textContent = '-';
        } else if (item.isRevenue && item.revenueType) {
            // Revenue items show the revenue value for this branch
            const branchRevenue = revenueData[branchId]?.[item.revenueType] || 0;
            branchCell.textContent = formatCurrency(branchRevenue);
            branchCell.className = 'revenue-value';
            branchCell.dataset.value = branchRevenue;
        } else {
            // Expense/income items get input fields for percentage assumption
            branchCell.className = 'value-cell';
            const existingValue = assumptionsData[branchId]?.[item.code]?.assumption_value || '';
            
            // Create input wrapper with % suffix
            const wrapper = document.createElement('div');
            wrapper.className = 'input-wrapper';
            
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'income-input assumption-input';
            input.placeholder = '';
            input.value = existingValue;
            input.dataset.branchId = branchId;
            input.dataset.itemCode = item.code;
            input.dataset.rowIndex = rowIndex;
            input.dataset.colIndex = branchIndex;
            input.step = '0.01';
            
            const suffix = document.createElement('span');
            suffix.className = 'input-suffix';
            suffix.textContent = '%';
            
            input.addEventListener('change', function() {
                onAssumptionChange(branchId, item.code, parseFloat(this.value) || 0);
            });
            
            input.addEventListener('input', function() {
                onAssumptionChange(branchId, item.code, parseFloat(this.value) || 0);
            });
            
            wrapper.appendChild(input);
            wrapper.appendChild(suffix);
            branchCell.appendChild(wrapper);
        }
        
        row.appendChild(branchCell);
    });
    
    return row;
}

function setupKeyboardNavigation() {
    const inputs = document.querySelectorAll('.assumption-input');
    const inputGrid = {};
    
    inputs.forEach(input => {
        const rowIdx = parseInt(input.dataset.rowIndex);
        const colIdx = parseInt(input.dataset.colIndex);
        if (!inputGrid[rowIdx]) inputGrid[rowIdx] = {};
        inputGrid[rowIdx][colIdx] = input;
    });
    
    const rowIndices = Object.keys(inputGrid).map(Number).sort((a, b) => a - b);
    
    inputs.forEach(input => {
        input.addEventListener('keydown', function(e) {
            const currentRow = parseInt(this.dataset.rowIndex);
            const currentCol = parseInt(this.dataset.colIndex);
            
            let targetRow = currentRow;
            let targetCol = currentCol;
            
            switch(e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    const prevRowIdx = rowIndices.indexOf(currentRow) - 1;
                    if (prevRowIdx >= 0) {
                        targetRow = rowIndices[prevRowIdx];
                    }
                    break;
                    
                case 'ArrowDown':
                    e.preventDefault();
                    const nextRowIdx = rowIndices.indexOf(currentRow) + 1;
                    if (nextRowIdx < rowIndices.length) {
                        targetRow = rowIndices[nextRowIdx];
                    }
                    break;
                    
                case 'ArrowLeft':
                    e.preventDefault();
                    if (currentCol > 0) {
                        targetCol = currentCol - 1;
                    } else if (rowIndices.indexOf(currentRow) > 0) {
                        targetRow = rowIndices[rowIndices.indexOf(currentRow) - 1];
                        targetCol = 5;
                    }
                    break;
                    
                case 'ArrowRight':
                    e.preventDefault();
                    if (currentCol < 5) {
                        targetCol = currentCol + 1;
                    } else if (rowIndices.indexOf(currentRow) < rowIndices.length - 1) {
                        targetRow = rowIndices[rowIndices.indexOf(currentRow) + 1];
                        targetCol = 0;
                    }
                    break;
                    
                case 'Enter':
                case 'Tab':
                    if (!e.shiftKey) {
                        e.preventDefault();
                        if (currentCol < 5) {
                            targetCol = currentCol + 1;
                        } else if (rowIndices.indexOf(currentRow) < rowIndices.length - 1) {
                            targetRow = rowIndices[rowIndices.indexOf(currentRow) + 1];
                            targetCol = 0;
                        }
                    }
                    break;
                    
                default:
                    return;
            }
            
            if (inputGrid[targetRow] && inputGrid[targetRow][targetCol]) {
                inputGrid[targetRow][targetCol].focus({ preventScroll: true });
                inputGrid[targetRow][targetCol].select();
            }
        });
    });
}

function onAssumptionChange(branchId, itemCode, value) {
    if (!assumptionsData[branchId]) assumptionsData[branchId] = {};
    if (!assumptionsData[branchId][itemCode]) assumptionsData[branchId][itemCode] = {};
    assumptionsData[branchId][itemCode].assumption_value = value;
    
    calculateAllValues();
    
    // Save session data on each change
    saveSessionData();
}

function calculateAllValues() {
    calculatedData = {};
    
    BRANCH_IDS.forEach(branchId => {
        calculatedData[branchId] = {};
        
        // Get revenue for this branch
        const ipRevenue = revenueData[branchId]?.IP || 0;
        const opRevenue = revenueData[branchId]?.OP || 0;
        const erRevenue = revenueData[branchId]?.ER || 0;
        const subRevenue = ipRevenue + opRevenue + erRevenue;
        
        calculatedData[branchId]['REV_SUB'] = subRevenue;
        
        // Get revenue type allocations for this branch
        const mohRevTypePct = revenueTypeAssumptions[branchId]?.['REV_TYPE_MOH'] || 0;
        const insuranceRevTypePct = revenueTypeAssumptions[branchId]?.['REV_TYPE_INSURANCE'] || 0;
        
        // Calculate Rejection Expense parts (MOH and Insurance) using revenue type allocations
        // Rejection MOH = Rejection MOH % × MOH Revenue Type % × Sub Revenue
        const rejectionMohPct = assumptionsData[branchId]?.['DIS_REJECTION_MOH']?.assumption_value || 0;
        const rejectionMohValue = subRevenue * (rejectionMohPct / 100) * (mohRevTypePct / 100);
        calculatedData[branchId]['DIS_REJECTION_MOH'] = rejectionMohValue;
        
        // Rejection Insurance = Rejection Insurance % × Insurance Revenue Type % × Sub Revenue
        const rejectionInsPct = assumptionsData[branchId]?.['DIS_REJECTION_INS']?.assumption_value || 0;
        const rejectionInsValue = subRevenue * (rejectionInsPct / 100) * (insuranceRevTypePct / 100);
        calculatedData[branchId]['DIS_REJECTION_INS'] = rejectionInsValue;
        
        // Rejection Expense = MOH + Insurance
        const totalRejection = rejectionMohValue + rejectionInsValue;
        calculatedData[branchId]['DIS_REJECTION'] = totalRejection;
        
        // Calculate other discounts from Sub Revenue: Volume, Early Pay
        const volumePct = assumptionsData[branchId]?.['DIS_VOLUME']?.assumption_value || 0;
        const volumeValue = subRevenue * (volumePct / 100);
        calculatedData[branchId]['DIS_VOLUME'] = volumeValue;
        
        const earlyPayPct = assumptionsData[branchId]?.['DIS_EARLY_PAY']?.assumption_value || 0;
        const earlyPayValue = subRevenue * (earlyPayPct / 100);
        calculatedData[branchId]['DIS_EARLY_PAY'] = earlyPayValue;
        
        // Total Discounts = Rejection + Volume + Early Pay
        const totalDiscounts = totalRejection + volumeValue + earlyPayValue;
        
        // Revenue - Settlement Discount = Sum of all discounts
        calculatedData[branchId]['DIS_SETTLEMENT'] = totalDiscounts;
        
        // Net Revenue = Sub Revenue - Total Discounts (Settlement Discount)
        const netRevenue = subRevenue - totalDiscounts;
        calculatedData[branchId]['REV_NET'] = netRevenue;
        
        // Calculate Direct Costs
        let totalDirectCosts = 0;
        const directCostCodes = ['DC_CONSUMABLES', 'DC_MEDICINES', 'DC_DOCTORS_FEE', 'DC_EMPLOYEE', 
            'DC_GOVT_FEES', 'DC_INSURANCE', 'DC_KITCHEN', 'DC_MAINTENANCE', 'DC_OTHER', 
            'DC_REFERRAL', 'DC_RENTAL', 'DC_TRAINING', 'DC_TRAVEL', 'DC_UTILITIES'];
        
        directCostCodes.forEach(code => {
            const pct = assumptionsData[branchId]?.[code]?.assumption_value || 0;
            const value = netRevenue * (pct / 100);
            calculatedData[branchId][code] = value;
            totalDirectCosts += value;
        });
        
        // Total Direct Costs
        calculatedData[branchId]['TOTAL_DC'] = totalDirectCosts;
        
        // Gross Profit
        const grossProfit = netRevenue - totalDirectCosts;
        calculatedData[branchId]['GROSS_PROFIT'] = grossProfit;
        
        // Calculate G&A Expenses
        let totalGAExpenses = 0;
        const gaCodes = ['GA_GOVT_FEE', 'GA_AUDIT', 'GA_COMMUNICATION', 'GA_ECL', 'GA_OTHER',
            'GA_POSTAGE', 'GA_PROFESSIONAL', 'GA_SECURITY', 'GA_TRAINING', 'GA_EMPLOYEE',
            'GA_MARKETING', 'GA_HO_CHARGES'];
        
        gaCodes.forEach(code => {
            const pct = assumptionsData[branchId]?.[code]?.assumption_value || 0;
            const value = netRevenue * (pct / 100);
            calculatedData[branchId][code] = value;
            totalGAExpenses += value;
        });
        
        // Total G&A Expenses
        calculatedData[branchId]['TOTAL_GA'] = totalGAExpenses;
        
        // Other Income (positive)
        const otherIncomePct = assumptionsData[branchId]?.['OTHER_INCOME']?.assumption_value || 0;
        const otherIncome = netRevenue * (otherIncomePct / 100);
        calculatedData[branchId]['OTHER_INCOME'] = otherIncome;
        
        // EBITDA
        const ebitda = grossProfit - totalGAExpenses + otherIncome;
        calculatedData[branchId]['EBITDA'] = ebitda;
        
        // Finance Cost
        const financeCostPct = assumptionsData[branchId]?.['FINANCE_COST']?.assumption_value || 0;
        const financeCost = netRevenue * (financeCostPct / 100);
        calculatedData[branchId]['FINANCE_COST'] = financeCost;
        
        // Depreciation
        const depreciationPct = assumptionsData[branchId]?.['DEPRECIATION']?.assumption_value || 0;
        const depreciation = netRevenue * (depreciationPct / 100);
        calculatedData[branchId]['DEPRECIATION'] = depreciation;
        
        // Zakat
        const zakatPct = assumptionsData[branchId]?.['ZAKAT']?.assumption_value || 0;
        const zakat = netRevenue * (zakatPct / 100);
        calculatedData[branchId]['ZAKAT'] = zakat;
        
        // Net Profit
        const netProfit = ebitda - financeCost - depreciation - zakat;
        calculatedData[branchId]['NET_PROFIT'] = netProfit;
        
        // OCI
        const ociPct = assumptionsData[branchId]?.['OCI']?.assumption_value || 0;
        const oci = netRevenue * (ociPct / 100);
        calculatedData[branchId]['OCI'] = oci;
        
        // Total Comprehensive Income
        calculatedData[branchId]['TOTAL_COMP_INCOME'] = netProfit + oci;
    });
    
    updateCalculatedUI();
}

function updateCalculatedUI() {
    // Update branch-specific values
    BRANCH_IDS.forEach(branchId => {
        LINE_ITEMS_CONFIG.forEach(item => {
            if (item.isCalculated) {
                const cell = document.getElementById(`calc-${branchId}-${item.code}`);
                if (cell) {
                    const value = calculatedData[branchId]?.[item.code] || 0;
                    cell.textContent = formatCurrency(value);
                    cell.dataset.value = value;
                }
            }
        });
    });
    
    // Update FY totals
    LINE_ITEMS_CONFIG.forEach(item => {
        const cell = document.getElementById(`fy-${item.code}`);
        if (cell) {
            if (item.isRevenue && item.revenueType) {
                // Already set in renderTable
            } else if (item.isCalculated) {
                let total = 0;
                BRANCH_IDS.forEach(branchId => {
                    total += calculatedData[branchId]?.[item.code] || 0;
                });
                cell.textContent = formatCurrency(total);
                cell.dataset.value = total;
            }
        }
    });
}

function formatCurrency(value) {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return new Intl.NumberFormat('en-SA', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

async function saveAssumptions(publish = false) {
    showLoading(true);
    
    try {
        const allAssumptions = [];
        
        // Save line item assumptions
        BRANCH_IDS.forEach(branchId => {
            LINE_ITEMS_CONFIG.forEach(item => {
                if (!item.isCalculated && !item.isRevenue) {
                    const assumptionValue = assumptionsData[branchId]?.[item.code]?.assumption_value || 0;
                    const calculatedValue = calculatedData[branchId]?.[item.code] || 0;
                    
                    allAssumptions.push({
                        line_item_code: item.code,
                        branch_id: branchId,
                        year: currentYear,
                        scenario: currentScenario,
                        assumption_value: assumptionValue,
                        calculated_value: calculatedValue,
                        created_by: currentUser?.id || 1
                    });
                }
            });
            
            // Save revenue type assumptions for each branch
            REVENUE_TYPE_CONFIG.forEach(revType => {
                const value = revenueTypeAssumptions[branchId]?.[revType.code] || 0;
                allAssumptions.push({
                    line_item_code: revType.code,
                    branch_id: branchId,
                    year: currentYear,
                    scenario: currentScenario,
                    assumption_value: value,
                    calculated_value: 0,
                    created_by: currentUser?.id || 1
                });
            });
        });
        
        const response = await fetch('/api/income-statement/assumptions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                assumptions: allAssumptions,
                publish: publish 
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save assumptions');
        }
        
        showSuccess(publish ? 'Budget published successfully!' : 'Assumptions saved successfully!');
        
    } catch (error) {
        console.error('Error saving assumptions:', error);
        showError('Failed to save assumptions. Please try again.');
    } finally {
        showLoading(false);
    }
}

function showLoading(show) {
    const loader = document.getElementById('loading');
    if (loader) {
        if (show) {
            loader.classList.remove('hidden');
        } else {
            loader.classList.add('hidden');
        }
    }
}

function showError(message) {
    const statusMsg = document.getElementById('status-message');
    if (statusMsg) {
        statusMsg.textContent = message;
        statusMsg.className = 'status-message error';
        setTimeout(() => {
            statusMsg.className = 'status-message hidden';
        }, 5000);
    } else {
        const notification = document.createElement('div');
        notification.className = 'notification error';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
    }
}

function showSuccess(message) {
    const statusMsg = document.getElementById('status-message');
    if (statusMsg) {
        statusMsg.textContent = message;
        statusMsg.className = 'status-message success';
        setTimeout(() => {
            statusMsg.className = 'status-message hidden';
        }, 3000);
    } else {
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    }
}

function logout() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
        .finally(() => {
            window.location.href = 'login.html';
        });
}

/**
 * Save session data to sessionStorage
 */
function saveSessionData() {
    const sessionData = {
        currentYear,
        currentScenario,
        revenueData,
        revenueTypeAssumptions,
        assumptionsData,
        calculatedData
    };
    sessionStorage.setItem('incomeStatementAssumptionsSession', JSON.stringify(sessionData));
}

/**
 * Restore session data from sessionStorage
 */
function restoreSessionData() {
    try {
        const stored = sessionStorage.getItem('incomeStatementAssumptionsSession');
        if (!stored) return;
        
        const sessionData = JSON.parse(stored);
        
        // Restore year
        if (sessionData.currentYear) {
            currentYear = sessionData.currentYear;
            const yearInput = document.getElementById('year-input');
            if (yearInput) yearInput.value = currentYear;
        }
        
        // Restore scenario
        if (sessionData.currentScenario) {
            currentScenario = sessionData.currentScenario;
            const scenarioSelect = document.getElementById('scenarioSelect');
            if (scenarioSelect) scenarioSelect.value = currentScenario;
        }
        
        // Restore data
        if (sessionData.revenueData) {
            revenueData = sessionData.revenueData;
        }
        
        if (sessionData.revenueTypeAssumptions) {
            revenueTypeAssumptions = sessionData.revenueTypeAssumptions;
        }
        
        if (sessionData.assumptionsData) {
            assumptionsData = sessionData.assumptionsData;
        }
        
        if (sessionData.calculatedData) {
            calculatedData = sessionData.calculatedData;
        }
        
        // Re-render tables if we have data
        if (Object.keys(revenueData).length > 0 || Object.keys(assumptionsData).length > 0) {
            renderTable();
            calculateAllValues();
            
            // Update year badge
            updateYearBadge();
        }
        
    } catch (err) {
        console.error('Failed to restore session data:', err);
    }
}
