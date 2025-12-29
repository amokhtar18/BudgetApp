/**
 * Budget Assumptions Data Entry Application
 * Supports CRUD operations with SCD versioning
 * Supports multiple scenarios: Most Likely, Best Case, Worst Case
 */

const API_BASE = '';
const STORAGE_KEY = 'budgetApp_state';

// Application State
let config = {};
let currentYear = null;
let currentData = [];
let pendingChanges = {};
let isNewYear = false;
let currentScenario = 'most_likely'; // Current active scenario
let currentUser = null; // Current logged-in user

// DOM Elements
const yearInput = document.getElementById('year-input');
const yearSelect = document.getElementById('year-select');
const loadBtn = document.getElementById('load-btn');
const yearBanner = document.getElementById('year-banner');
const selectedYearSpan = document.getElementById('selected-year');
const dataStatus = document.getElementById('data-status');
const filterSection = document.getElementById('filter-sidebar');
const dataForm = document.getElementById('data-form');
const tableBody = document.getElementById('table-body');
const saveAllBtn = document.getElementById('save-all-btn');
const viewHistoryBtn = document.getElementById('view-history-btn');
const historyModal = document.getElementById('history-modal');
const historyBody = document.getElementById('history-body');
const loadingEl = document.getElementById('loading');
const statusMessage = document.getElementById('status-message');

// Filter Elements
const filterMetric = document.getElementById('filter-metric');
const filterCareType = document.getElementById('filter-caretype');
const filterQuarter = document.getElementById('filter-quarter');
const filterBranch = document.getElementById('filter-branch');

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication first
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) {
        window.location.href = '/login.html';
        return;
    }
    
    await loadConfig();
    await loadExistingYears();
    setupEventListeners();
    restoreState(); // Restore saved state on page load
});

/**
 * Check if user is authenticated
 */
async function checkAuthentication() {
    try {
        const response = await fetch(`${API_BASE}/api/auth/check`, {
            credentials: 'include'
        });
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
 * Update user display in header
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
 * Show admin link if user is admin
 */
function updateAdminLink() {
    const adminLink = document.getElementById('admin-link');
    if (adminLink && currentUser && currentUser.role === 'admin') {
        adminLink.classList.remove('hidden');
    }
}

/**
 * Logout user
 */
async function logout() {
    try {
        await fetch(`${API_BASE}/api/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        clearState();
        window.location.href = '/login.html';
    } catch (err) {
        console.error('Logout failed:', err);
        window.location.href = '/login.html';
    }
}

/**
 * Save application state to localStorage
 */
function saveState() {
    const state = {
        currentYear,
        currentScenario,
        currentData,
        pendingChanges,
        isNewYear,
        filters: {
            metric: filterMetric.value,
            careType: filterCareType.value,
            quarter: filterQuarter.value,
            branch: filterBranch.value
        },
        timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Restore application state from localStorage
 */
function restoreState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;

        const state = JSON.parse(saved);
        
        // Check if state is not too old (24 hours)
        if (Date.now() - state.timestamp > 24 * 60 * 60 * 1000) {
            localStorage.removeItem(STORAGE_KEY);
            return;
        }

        if (state.currentYear && state.currentData && state.currentData.length > 0) {
            currentYear = state.currentYear;
            currentScenario = state.currentScenario || 'most_likely';
            currentData = state.currentData;
            pendingChanges = state.pendingChanges || {};
            isNewYear = state.isNewYear;

            // Restore filters
            if (state.filters) {
                filterMetric.value = state.filters.metric || 'all';
                filterCareType.value = state.filters.careType || 'all';
                filterQuarter.value = state.filters.quarter || 'all';
                filterBranch.value = state.filters.branch || 'all';
            }

            // Update scenario buttons
            updateScenarioButtons();

            // Update UI
            yearInput.value = currentYear;
            updateUI();
            renderTable();
            
            showStatus(`Restored data for year ${currentYear} (${getScenarioLabel(currentScenario)})`, 'success');
        }
    } catch (err) {
        console.error('Failed to restore state:', err);
        localStorage.removeItem(STORAGE_KEY);
    }
}

/**
 * Get human-readable scenario label
 */
function getScenarioLabel(scenario) {
    const labels = {
        'most_likely': 'Most Likely',
        'best_case': 'Best Case',
        'worst_case': 'Worst Case'
    };
    return labels[scenario] || scenario;
}

/**
 * Update scenario button states
 */
function updateScenarioButtons() {
    const scenarioButtons = document.querySelectorAll('.btn-scenario');
    scenarioButtons.forEach(btn => {
        const btnScenario = btn.dataset.scenario;
        if (btnScenario === currentScenario || 
            (btnScenario === 'most' && currentScenario === 'most_likely') ||
            (btnScenario === 'best' && currentScenario === 'best_case') ||
            (btnScenario === 'worst' && currentScenario === 'worst_case')) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

/**
 * Clear saved state
 */
function clearState() {
    localStorage.removeItem(STORAGE_KEY);
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await loadExistingYears();
    setupEventListeners();
});

/**
 * Load configuration from API
 */
async function loadConfig() {
    try {
        const response = await fetch(`${API_BASE}/api/config`, {
            credentials: 'include'
        });
        if (response.ok) {
            config = await response.json();
            populateFilters();
        }
    } catch (err) {
        showStatus('Failed to load configuration', 'error');
        console.error(err);
    }
}

/**
 * Load existing years from database
 */
async function loadExistingYears() {
    try {
        const response = await fetch(`${API_BASE}/api/years`, {
            credentials: 'include'
        });
        if (response.ok) {
            const data = await response.json();
            yearSelect.innerHTML = '<option value="">Select existing year</option>';
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
 * Populate filter dropdowns
 */
function populateFilters() {
    // Metrics
    filterMetric.innerHTML = '<option value="all">All Metrics</option>';
    config.metrics.forEach(metric => {
        const option = document.createElement('option');
        option.value = metric;
        option.textContent = metric;
        filterMetric.appendChild(option);
    });

    // Care Types
    filterCareType.innerHTML = '<option value="all">All Care Types</option>';
    config.care_types.forEach(ct => {
        const option = document.createElement('option');
        option.value = ct;
        option.textContent = ct;
        filterCareType.appendChild(option);
    });

    // Branches with names - filter by user's branch if assigned
    const userBranch = currentUser ? currentUser.branch_id : null;
    const userRole = currentUser ? currentUser.role : null;
    const branchesToShow = (userBranch && userRole !== 'admin') 
        ? [userBranch] 
        : config.branches;
    
    filterBranch.innerHTML = '<option value="all">All Branches</option>';
    branchesToShow.forEach(branchId => {
        const option = document.createElement('option');
        option.value = branchId;
        option.textContent = config.branch_names[branchId] || `Branch ${branchId}`;
        filterBranch.appendChild(option);
    });
    
    // If user has only one branch, auto-select it
    if (branchesToShow.length === 1) {
        filterBranch.value = branchesToShow[0];
        filterBranch.disabled = true;
    } else {
        filterBranch.disabled = false;
    }

    // Populate branch header row
    populateBranchHeaders();
}

/**
 * Populate branch column headers
 */
function populateBranchHeaders() {
    const branchHeaderRow = document.getElementById('branch-header-row');
    const branchColspanHeader = document.getElementById('branch-colspan-header');
    branchHeaderRow.innerHTML = '';
    
    // Use filtered branches based on user's assignment
    const userBranch = currentUser ? currentUser.branch_id : null;
    const userRole = currentUser ? currentUser.role : null;
    const branchesToShow = (userBranch && userRole !== 'admin') 
        ? [userBranch] 
        : config.branches;
    
    // Update colspan for the branch header
    if (branchColspanHeader) {
        branchColspanHeader.setAttribute('colspan', branchesToShow.length);
    }
    
    branchesToShow.forEach(branchId => {
        const th = document.createElement('th');
        th.className = 'branch-name-header';
        th.innerHTML = `<i class="fas fa-building"></i>${config.branch_names[branchId] || branchId}`;
        branchHeaderRow.appendChild(th);
    });
}

/**
 * Get branch name by ID
 */
function getBranchName(branchId) {
    return config.branch_names ? (config.branch_names[branchId] || `Branch ${branchId}`) : `Branch ${branchId}`;
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Year input change
    yearInput.addEventListener('input', () => {
        yearSelect.value = '';
    });

    // Enter key on year input to load data
    yearInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            loadYearData();
        }
    });

    yearSelect.addEventListener('change', () => {
        if (yearSelect.value) {
            yearInput.value = '';
            // Auto-load when selecting from dropdown
            loadYearData();
        }
    });

    // Load button
    loadBtn.addEventListener('click', loadYearData);

    // Save all button
    saveAllBtn.addEventListener('click', saveAllChanges);

    // View history button
    viewHistoryBtn.addEventListener('click', loadHistory);

    // Filter changes
    [filterMetric, filterCareType, filterQuarter, filterBranch].forEach(filter => {
        filter.addEventListener('change', () => {
            renderTable();
            saveState(); // Save filter state
        });
    });

    // Scenario toggle buttons
    const scenarioButtons = document.querySelectorAll('.btn-scenario');

    scenarioButtons.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', async () => {
                // Map button data-scenario to API scenario values
                const scenarioMap = {
                    'most': 'most_likely',
                    'best': 'best_case',
                    'worst': 'worst_case'
                };
                
                const newScenario = scenarioMap[btn.dataset.scenario] || btn.dataset.scenario;
                
                // Check for unsaved changes before switching
                if (Object.keys(pendingChanges).length > 0) {
                    const confirmSwitch = confirm(
                        `You have unsaved changes in "${getScenarioLabel(currentScenario)}". ` +
                        `Do you want to discard them and switch to "${getScenarioLabel(newScenario)}"?`
                    );
                    if (!confirmSwitch) return;
                }
                
                // Update active state
                scenarioButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Set new scenario
                currentScenario = newScenario;
                pendingChanges = {};
                
                // Reload data for new scenario
                if (currentYear) {
                    await loadYearData();
                    showStatus(`Loaded ${getScenarioLabel(currentScenario)} scenario for ${currentYear}`, 'success');
                }
            });
        }
    });

    // Clear filters button
    const clearFiltersBtn = document.getElementById('clear-filters-btn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearFilters);
    }

    // Close modal on outside click
    historyModal.addEventListener('click', (e) => {
        if (e.target === historyModal) {
            closeHistoryModal();
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeHistoryModal();
        }
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (!saveAllBtn.disabled) {
                saveAllChanges();
            }
        }
    });

    // Arrow key navigation for table inputs
    document.addEventListener('keydown', handleTableNavigation);
}

/**
 * Handle arrow key navigation between table cells
 */
function handleTableNavigation(e) {
    const activeElement = document.activeElement;
    
    // Only handle if we're in a table input
    if (!activeElement || activeElement.tagName !== 'INPUT' || !activeElement.closest('#data-table')) {
        return;
    }
    
    // Only handle up/down arrow keys
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
        return;
    }
    
    e.preventDefault();
    
    const currentCell = activeElement.closest('td');
    const currentRow = currentCell.closest('tr');
    const cellIndex = Array.from(currentRow.cells).indexOf(currentCell);
    
    let targetRow;
    if (e.key === 'ArrowUp') {
        targetRow = currentRow.previousElementSibling;
    } else if (e.key === 'ArrowDown') {
        targetRow = currentRow.nextElementSibling;
    }
    
    if (targetRow) {
        const targetCell = targetRow.cells[cellIndex];
        if (targetCell) {
            const targetInput = targetCell.querySelector('input');
            if (targetInput && !targetInput.disabled) {
                targetInput.focus();
                targetInput.select();
            }
        }
    }
}

/**
 * Clear all filters
 */
function clearFilters() {
    filterMetric.value = 'all';
    filterCareType.value = 'all';
    filterQuarter.value = 'all';
    
    // Only reset branch filter if it's not disabled (user has multiple branches)
    if (!filterBranch.disabled) {
        filterBranch.value = 'all';
    }
    
    renderTable();
    saveState();
}

/**
 * Toggle sidebar visibility
 */
function toggleSidebar() {
    const sidebar = document.getElementById('filter-sidebar');
    const expandBtn = document.getElementById('sidebar-expand-btn');
    
    if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
        sidebar.classList.remove('hidden');
        if (expandBtn) expandBtn.classList.add('hidden');
    } else {
        sidebar.classList.add('collapsed');
        if (expandBtn) expandBtn.classList.remove('hidden');
    }
}

/**
 * Load data for selected year and scenario
 */
async function loadYearData() {
    const year = yearInput.value || yearSelect.value;
    
    if (!year || year < 2020 || year > 2100) {
        showStatus('Please enter a valid year (2020-2100)', 'warning');
        return;
    }

    currentYear = parseInt(year);
    showLoading(true);
    pendingChanges = {};

    try {
        const response = await fetch(`${API_BASE}/api/budget/${currentYear}?scenario=${currentScenario}`, {
            credentials: 'include'
        });
        if (response.ok) {
            const result = await response.json();
            
            // Always generate full template first
            const templateData = generateTemplateData(currentYear);
            
            if (result.exists && result.data.length > 0) {
                // Existing data - merge with template to show all metrics including nulls
                isNewYear = false;
                currentData = mergeDataWithTemplate(templateData, result.data);
                showStatus(`Loaded ${result.data.length} saved records for ${currentYear} (${getScenarioLabel(currentScenario)})`, 'success');
            } else {
                // New year/scenario - use template as is
                isNewYear = true;
                currentData = templateData;
                showStatus(`New ${getScenarioLabel(currentScenario)} scenario for ${currentYear} - template generated with ${currentData.length} records`, 'success');
            }

            updateUI();
            renderTable();
            updateRecordCount();
            saveState(); // Save state after loading
        } else {
            throw new Error('Failed to load data');
        }
    } catch (err) {
        showStatus(`Error loading data: ${err.message}`, 'error');
        console.error(err);
    } finally {
        showLoading(false);
    }
}

/**
 * Merge existing data with template to show all metrics including those with null values
 */
function mergeDataWithTemplate(template, existingData) {
    // Create a map for quick lookup of existing data
    const existingMap = new Map();
    existingData.forEach(record => {
        const key = `${record.metric}|${record.care_type}|${record.quarter}|${record.branch_id}`;
        existingMap.set(key, record);
    });

    // Merge template with existing data
    return template.map(templateRecord => {
        const key = `${templateRecord.metric}|${templateRecord.care_type}|${templateRecord.quarter}|${templateRecord.branch_id}`;
        const existingRecord = existingMap.get(key);
        
        if (existingRecord) {
            // Use existing record but keep it marked as not new
            return {
                ...existingRecord,
                isNew: false
            };
        } else {
            // No existing record - use template with null value
            return {
                ...templateRecord,
                isNew: true
            };
        }
    });
}

/**
 * Update record count display
 */
function updateRecordCount() {
    const recordCountEl = document.getElementById('record-count');
    if (recordCountEl && currentData) {
        const total = currentData.length;
        const withValues = currentData.filter(r => r.value !== null && r.value !== undefined && r.value !== '').length;
        recordCountEl.innerHTML = `<span>${withValues}</span> of <span>${total}</span> records have values`;
    }
}

/**
 * Update filter stats display
 */
function updateFilterStats(visibleCount, totalCount) {
    const visibleCountEl = document.getElementById('visible-count');
    const totalCountEl = document.getElementById('total-count');
    
    if (visibleCountEl) visibleCountEl.textContent = visibleCount;
    if (totalCountEl) totalCountEl.textContent = totalCount;
}

/**
 * Generate template data for a new year and scenario
 * Filters by user's branch if they have one assigned (and are not admin)
 */
function generateTemplateData(year) {
    const data = [];
    let tempId = -1;
    
    // Get branches to generate template for
    // If user has a branch assigned (and is not admin), only generate for that branch
    const userBranch = currentUser ? currentUser.branch_id : null;
    const userRole = currentUser ? currentUser.role : null;
    const branchesToUse = (userBranch && userRole !== 'admin') 
        ? [userBranch] 
        : config.branches;

    config.metrics.forEach(metric => {
        const careTypes = config.metric_care_types[metric] || config.care_types;
        const inputType = config.metric_input_types[metric] || 'Growth Rate';

        careTypes.forEach(careType => {
            config.quarters.forEach(quarter => {
                branchesToUse.forEach(branchId => {
                    data.push({
                        id: tempId--,
                        metric: metric,
                        care_type: careType,
                        year: year,
                        quarter: quarter,
                        input_type: inputType,
                        branch_id: branchId,
                        scenario: currentScenario,
                        value: null,
                        version: 0,
                        isNew: true
                    });
                });
            });
        });
    });

    return data;
}

/**
 * Update UI elements
 */
function updateUI() {
    yearBanner.classList.remove('hidden');
    filterSection.classList.remove('hidden');
    dataForm.classList.remove('hidden');

    selectedYearSpan.textContent = currentYear;
    
    if (isNewYear) {
        dataStatus.textContent = 'New';
        dataStatus.className = 'status-badge new';
    } else {
        dataStatus.textContent = 'Existing';
        dataStatus.className = 'status-badge existing';
    }

    updateSaveButton();
}

/**
 * Render the data table with horizontal branch layout
 */
function renderTable() {
    const filteredData = applyFilters(currentData);
    
    // Determine which branches to show based on user's assignment
    const userBranch = currentUser ? currentUser.branch_id : null;
    const userRole = currentUser ? currentUser.role : null;
    const branchesToShow = (userBranch && userRole !== 'admin') 
        ? [userBranch] 
        : config.branches;
    
    tableBody.innerHTML = '';

    // Group data by metric, care_type, quarter
    const groupedData = groupDataForHorizontalDisplay(filteredData);
    const totalGrouped = groupDataForHorizontalDisplay(currentData);

    // Update filter stats - show rows (groups), not individual records
    updateFilterStats(groupedData.length, totalGrouped.length);

    if (filteredData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="${4 + branchesToShow.length}" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    No data matching filters
                </td>
            </tr>
        `;
        return;
    }

    groupedData.forEach(group => {
        const tr = document.createElement('tr');
        const careTypeClass = group.care_type.toLowerCase().replace('-', '-');

        // Check if any branch in this row is modified
        const anyModified = group.branches.some(b => pendingChanges[b.id] !== undefined && !pendingChanges[b.id]?.deleted);
        const anyDeleted = group.branches.some(b => pendingChanges[b.id]?.deleted);

        if (anyModified) tr.classList.add('modified');
        if (anyDeleted) tr.classList.add('deleted');

        // Build the row HTML
        let rowHTML = `
            <td><span class="metric-tag">${group.metric}</span></td>
            <td><span class="caretype-tag ${careTypeClass}">${group.care_type}</span></td>
            <td><span class="quarter-badge">Q${group.quarter}</span></td>
            <td>${group.input_type}</td>
        `;

        // Add value cells for each branch (filtered by user's assignment)
        branchesToShow.forEach(branchId => {
            const branchData = group.branches.find(b => b.branch_id === branchId);
            if (branchData) {
                const isModified = pendingChanges[branchData.id] !== undefined;
                const isDeleted = pendingChanges[branchData.id]?.deleted;
                // Get raw storage value, then convert pending change or original to display
                const rawValue = pendingChanges[branchData.id]?.displayValue ?? branchData.value;
                const displayValue = isModified ? pendingChanges[branchData.id]?.displayValue : storageToDisplay(branchData.value, group.input_type);
                
                // Determine validation based on input type
                const validationAttrs = getValidationAttributes(group.input_type);
                const isPct = isPercentageType(group.input_type);
                const suffix = isPct ? '%' : '';

                rowHTML += `
                    <td class="value-cell ${isPct ? 'percentage-cell' : ''}">
                        <div class="input-wrapper">
                            <input type="number" 
                                   ${validationAttrs}
                                   value="${displayValue !== null ? displayValue : ''}"
                                   placeholder="${getPlaceholder(group.input_type)}"
                                   data-id="${branchData.id}"
                                   data-input-type="${group.input_type}"
                                   ${isDeleted ? 'disabled' : ''}
                                   class="${isModified && !isDeleted ? 'modified' : ''}"
                                   onchange="handleValueChange(${branchData.id}, this.value, '${group.input_type}')"
                                   oninput="validateInput(this, '${group.input_type}')">
                            ${isPct ? '<span class="input-suffix">%</span>' : ''}
                        </div>
                    </td>
                `;
            } else {
                rowHTML += `<td class="value-cell"><span style="color: var(--text-light);">-</span></td>`;
            }
        });

        tr.innerHTML = rowHTML;
        tableBody.appendChild(tr);
    });
}

/**
 * Check if input type is a percentage type
 */
function isPercentageType(inputType) {
    return inputType === 'Growth Rate' || inputType === 'Exact Value%';
}

/**
 * Convert display value (e.g., 5 for 5%) to storage value (0.05)
 */
function displayToStorage(value, inputType) {
    if (value === null || value === undefined) return null;
    if (isPercentageType(inputType)) {
        return value / 100;
    }
    return value;
}

/**
 * Convert storage value (e.g., 0.05) to display value (5 for 5%)
 */
function storageToDisplay(value, inputType) {
    if (value === null || value === undefined) return null;
    if (isPercentageType(inputType)) {
        return value * 100;
    }
    return value;
}

/**
 * Get validation attributes based on input type
 */
function getValidationAttributes(inputType) {
    switch(inputType) {
        case 'Growth Rate':
            // Percentage: typically -100% to +1000% (growth rate)
            return 'step="0.01" min="-100" max="1000"';
        case 'Exact Value%':
            // Exact percentage: 0% to 100%
            return 'step="0.01" min="0" max="100"';
        case 'Exact Value Number':
            // Absolute numbers: non-negative integers or decimals
            return 'step="0.01" min="0"';
        default:
            return 'step="0.0001"';
    }
}

/**
 * Get placeholder text based on input type
 */
function getPlaceholder(inputType) {
    switch(inputType) {
        case 'Growth Rate':
            return 'e.g. 5';
        case 'Exact Value%':
            return 'e.g. 25';
        case 'Exact Value Number':
            return 'number';
        default:
            return '-';
    }
}

/**
 * Validate input based on type
 */
window.validateInput = function(input, inputType) {
    const value = parseFloat(input.value);
    let isValid = true;
    let errorMsg = '';

    if (input.value === '') {
        input.classList.remove('invalid');
        input.title = '';
        return true;
    }

    switch(inputType) {
        case 'Growth Rate':
            if (value < -100 || value > 1000) {
                isValid = false;
                errorMsg = 'Growth rate must be between -100% and 1000%';
            }
            break;
        case 'Exact Value%':
            if (value < 0 || value > 100) {
                isValid = false;
                errorMsg = 'Percentage must be between 0% and 100%';
            }
            break;
        case 'Exact Value Number':
            if (value < 0) {
                isValid = false;
                errorMsg = 'Value must be a positive number';
            }
            break;
    }

    if (!isValid) {
        input.classList.add('invalid');
        input.title = errorMsg;
    } else {
        input.classList.remove('invalid');
        input.title = '';
    }

    return isValid;
};

/**
 * Group data for horizontal display (branches as columns)
 */
function groupDataForHorizontalDisplay(data) {
    const groups = {};

    data.forEach(row => {
        const key = `${row.metric}|${row.care_type}|${row.quarter}`;
        if (!groups[key]) {
            groups[key] = {
                metric: row.metric,
                care_type: row.care_type,
                quarter: row.quarter,
                input_type: row.input_type,
                branches: []
            };
        }
        groups[key].branches.push(row);
    });

    // Sort branches within each group
    Object.values(groups).forEach(group => {
        group.branches.sort((a, b) => a.branch_id - b.branch_id);
    });

    // Convert to array and sort
    return Object.values(groups).sort((a, b) => {
        if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
        if (a.care_type !== b.care_type) return a.care_type.localeCompare(b.care_type);
        return a.quarter - b.quarter;
    });
}

/**
 * Apply filters to data
 */
function applyFilters(data) {
    return data.filter(row => {
        if (filterMetric.value !== 'all' && row.metric !== filterMetric.value) return false;
        if (filterCareType.value !== 'all' && row.care_type !== filterCareType.value) return false;
        if (filterQuarter.value !== 'all' && row.quarter !== parseInt(filterQuarter.value)) return false;
        if (filterBranch.value !== 'all' && row.branch_id !== parseInt(filterBranch.value)) return false;
        return true;
    });
}

/**
 * Handle value change in input
 */
window.handleValueChange = function(id, value, inputType) {
    const row = currentData.find(r => r.id === id);
    if (!row) return;

    const actualInputType = inputType || row.input_type;

    // Validate before accepting
    if (value !== '' && !validateInputValue(parseFloat(value), actualInputType)) {
        return; // Don't accept invalid values
    }

    const displayValue = value === '' ? null : parseFloat(value);
    // Convert to storage value (divide by 100 for percentages)
    const storageValue = displayToStorage(displayValue, actualInputType);
    const originalStorageValue = row.value;

    // Compare storage values (handle floating point precision and null comparisons)
    const valuesAreEqual = (storageValue === null && originalStorageValue === null) ||
        (storageValue !== null && originalStorageValue !== null && 
         Math.abs(storageValue - originalStorageValue) < 0.0000001);
    
    if (valuesAreEqual) {
        // Value reverted to original
        if (pendingChanges[id] && !pendingChanges[id].deleted) {
            delete pendingChanges[id];
        }
    } else {
        // Value changed - store both display and storage values
        pendingChanges[id] = {
            ...pendingChanges[id],
            value: storageValue,        // For saving to DB
            displayValue: displayValue,  // For UI display
            isNew: row.isNew
        };
    }

    updateSaveButton();
    saveState(); // Save state after value change
};

/**
 * Validate input value based on type (returns boolean)
 */
function validateInputValue(value, inputType) {
    if (isNaN(value)) return false;
    
    switch(inputType) {
        case 'Growth Rate':
            return value >= -100 && value <= 1000;
        case 'Exact Value%':
            return value >= 0 && value <= 100;
        case 'Exact Value Number':
            return value >= 0;
        default:
            return true;
    }
}

/**
 * Mark record for deletion
 */
window.markForDeletion = function(id) {
    const row = currentData.find(r => r.id === id);
    if (!row) return;

    if (row.isNew) {
        // For new records, just remove from data
        currentData = currentData.filter(r => r.id !== id);
        delete pendingChanges[id];
    } else {
        // For existing records, mark for deletion
        pendingChanges[id] = {
            ...pendingChanges[id],
            deleted: true
        };
    }

    updateSaveButton();
    renderTable();
};

/**
 * Undo deletion mark
 */
window.undoDeletion = function(id) {
    if (pendingChanges[id]) {
        delete pendingChanges[id].deleted;
        if (Object.keys(pendingChanges[id]).length === 0 || 
            (pendingChanges[id].value === undefined)) {
            delete pendingChanges[id];
        }
    }

    updateSaveButton();
    renderTable();
};

/**
 * Update save button state
 */
function updateSaveButton() {
    const hasChanges = Object.keys(pendingChanges).length > 0 || 
                       (isNewYear && currentData.some(r => r.value !== null || pendingChanges[r.id]?.value !== undefined));
    
    saveAllBtn.disabled = !hasChanges;
}

/**
 * Save all changes
 */
async function saveAllChanges() {
    showLoading(true);

    try {
        if (isNewYear) {
            // Create new records - collect all records that have values
            const records = currentData.map(row => {
                // Get value from pendingChanges first, then fall back to row.value
                const pendingValue = pendingChanges[row.id]?.value;
                const finalValue = pendingValue !== undefined ? pendingValue : row.value;
                
                return {
                    metric: row.metric,
                    care_type: row.care_type,
                    quarter: row.quarter,
                    input_type: row.input_type,
                    branch_id: row.branch_id,
                    value: finalValue
                };
            }).filter(r => r.value !== null && r.value !== undefined);

            console.log('Saving records:', records.length, records); // Debug log

            const response = await fetch(`${API_BASE}/api/budget`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    year: currentYear,
                    scenario: currentScenario,
                    records: records
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to create records');
            }

            const result = await response.json();
            showStatus(`Successfully created ${result.inserted} records for ${getScenarioLabel(currentScenario)}`, 'success');

        } else {
            // Update existing records AND create new ones
            const updates = [];
            const deletions = [];
            const newRecords = []; // Records that need to be created

            Object.entries(pendingChanges).forEach(([id, change]) => {
                const numId = parseInt(id);
                const row = currentData.find(r => r.id === numId);
                
                console.log('Processing change:', { id, numId, change, row, rowIsNew: row?.isNew });
                
                if (change.deleted) {
                    // Only delete if it's an existing record (positive ID)
                    if (numId > 0) {
                        deletions.push(numId);
                    }
                } else if (change.value !== undefined) {
                    if (numId < 0 || (row && row.isNew)) {
                        // New record - needs to be created
                        if (row) {
                            newRecords.push({
                                metric: row.metric,
                                care_type: row.care_type,
                                quarter: row.quarter,
                                input_type: row.input_type,
                                branch_id: row.branch_id,
                                value: change.value
                            });
                        }
                    } else {
                        // Existing record - needs update
                        updates.push({
                            id: numId,
                            value: change.value
                        });
                    }
                }
            });

            console.log('Updates:', updates.length, updates);
            console.log('New records:', newRecords.length, newRecords);
            console.log('Deletions:', deletions.length, deletions);
            console.log('isNewYear:', isNewYear);
            console.log('currentYear:', currentYear);
            console.log('currentScenario:', currentScenario);

            // Process updates for existing records
            if (updates.length > 0) {
                const response = await fetch(`${API_BASE}/api/budget/batch`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ 
                        updates,
                        scenario: currentScenario
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || 'Failed to update records');
                }
            }

            // Create new records
            if (newRecords.length > 0) {
                const response = await fetch(`${API_BASE}/api/budget`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        year: currentYear,
                        scenario: currentScenario,
                        records: newRecords
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || 'Failed to create new records');
                }
            }

            // Process deletions
            for (const id of deletions) {
                await fetch(`${API_BASE}/api/budget/${id}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
            }

            showStatus(`Updated ${updates.length}, created ${newRecords.length}, deleted ${deletions.length} records for ${getScenarioLabel(currentScenario)}`, 'success');
        }

        // Reload data
        pendingChanges = {};
        await loadYearData();
        await loadExistingYears();
        clearState(); // Clear saved state after successful save

    } catch (err) {
        showStatus(`Error saving: ${err.message}`, 'error');
        console.error(err);
    } finally {
        showLoading(false);
    }
}

/**
 * Load change history for current scenario
 */
async function loadHistory() {
    if (!currentYear) return;

    showLoading(true);

    try {
        const response = await fetch(`${API_BASE}/api/budget/history/${currentYear}?scenario=${currentScenario}`, {
            credentials: 'include'
        });
        if (response.ok) {
            const result = await response.json();
            renderHistory(result.history);
            historyModal.classList.remove('hidden');
        }
    } catch (err) {
        showStatus('Failed to load history', 'error');
        console.error(err);
    } finally {
        showLoading(false);
    }
}

/**
 * Render history table
 */
function renderHistory(history) {
    historyBody.innerHTML = '';

    if (history.length === 0) {
        historyBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    No history available
                </td>
            </tr>
        `;
        return;
    }

    history.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = row.is_last_value ? 'current' : 'old';

        // Format value based on input type
        let displayValue = '<em>Deleted</em>';
        if (row.value !== null) {
            const inputType = row.input_type || 'Exact Value Number';
            if (isPercentageType(inputType)) {
                displayValue = `${(row.value * 100).toFixed(2)}%`;
            } else {
                displayValue = row.value;
            }
        }

        tr.innerHTML = `
            <td>${row.metric}</td>
            <td>${row.care_type}</td>
            <td>Q${row.quarter}</td>
            <td>${getBranchName(row.branch_id)}</td>
            <td>${displayValue}</td>
            <td>v${row.version}</td>
            <td>${row.is_last_value ? '<i class="fas fa-check" style="color: var(--success);"></i>' : ''}</td>
            <td>${row.updated_at ? new Date(row.updated_at).toLocaleString() : '-'}</td>
        `;

        historyBody.appendChild(tr);
    });
}

/**
 * Clear all filters
 */
window.clearFilters = function() {
    filterMetric.value = 'all';
    filterCareType.value = 'all';
    filterQuarter.value = 'all';
    filterBranch.value = 'all';
    renderTable();
};

/**
 * Close history modal
 */
window.closeHistoryModal = function() {
    historyModal.classList.add('hidden');
};

/**
 * Show loading spinner
 */
function showLoading(show) {
    loadingEl.classList.toggle('hidden', !show);
}

/**
 * Show status message
 */
function showStatus(message, type = 'success') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');

    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusMessage.classList.add('hidden');
    }, 5000);
}
