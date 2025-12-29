/**
 * Daily Budget Distribution Application
 * Handles daily budget calculation with automatic Hijri calendar-based adjustments
 */

const API_BASE = '';
let currentUser = null;
let dailyBudgetData = [];
let detailData = [];  // Full detail at purchaser/speciality level for publishing
let calculationParams = {};  // Store year, quarter, scenario for publish
let sourceTotals = null;  // Store source totals from API
let currentPage = 1;
const pageSize = 50;

// Branch names mapping
const BRANCH_NAMES = {
    1: 'Riyadh',
    2: 'Khamis',
    3: 'Jazan',
    4: 'Qassem',
    5: 'Madinah',
    6: 'Abha'
};

// DOM Elements
const statusMessage = document.getElementById('status-message');
const loadingEl = document.getElementById('loading');

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuthentication();
    if (!isAuthenticated) {
        window.location.href = '/login.html';
        return;
    }

    initializeTabs();
    await loadYears();
    await loadBranches();
    await loadScenarios();
    setupEventListeners();
    
    // Restore saved calculation data if available
    restoreCalculationData();
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
        window.location.href = '/login.html';
    } catch (err) {
        console.error('Logout failed:', err);
        window.location.href = '/login.html';
    }
}

/**
 * Initialize tab navigation
 */
function initializeTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Update buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabId}-tab`).classList.add('active');
        });
    });
}

/**
 * Load available years
 */
async function loadYears() {
    try {
        const response = await fetch(`${API_BASE}/api/years`, { credentials: 'include' });
        const data = await response.json();

        const yearSelect = document.getElementById('dist-year');
        yearSelect.innerHTML = '<option value="">Select Year</option>';

        // Only show years that have existing budget assumptions
        data.years.sort((a, b) => b - a).forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearSelect.appendChild(option);
        });
    } catch (err) {
        console.error('Failed to load years:', err);
    }
}

/**
 * Load branches
 */
async function loadBranches() {
    const branchSelect = document.getElementById('dist-branch');
    branchSelect.innerHTML = '<option value="">All Branches</option>';

    try {
        const response = await fetch(`${API_BASE}/api/branches`, { credentials: 'include' });
        const data = await response.json();

        // Only show branches that have existing budget assumptions
        data.branches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch.id;
            option.textContent = branch.name;
            branchSelect.appendChild(option);
        });
    } catch (err) {
        console.error('Failed to load branches:', err);
    }
}

/**
 * Load scenarios
 */
async function loadScenarios() {
    const scenarioSelect = document.getElementById('dist-scenario');
    scenarioSelect.innerHTML = '<option value="">Select Scenario</option>';

    try {
        const response = await fetch(`${API_BASE}/api/scenarios`, { credentials: 'include' });
        const data = await response.json();

        // Only show scenarios that have existing budget assumptions
        data.scenarios.forEach(scenario => {
            const option = document.createElement('option');
            option.value = scenario.value;
            option.textContent = scenario.label;
            scenarioSelect.appendChild(option);
        });
        
        // Select 'most_likely' by default if available
        if (data.scenarios.some(s => s.value === 'most_likely')) {
            scenarioSelect.value = 'most_likely';
        }
    } catch (err) {
        console.error('Failed to load scenarios:', err);
    }
}

/**
 * Save calculation data to localStorage for persistence across page refresh
 * Data is user-specific and will only be restored for the same user
 */
function saveCalculationData() {
    const dataToSave = {
        dailyBudgetData,
        detailData,
        calculationParams,
        sourceTotals,
        timestamp: Date.now(),
        userId: currentUser?.username || null  // Include user ID for validation
    };
    try {
        localStorage.setItem('budgetCalculationData', JSON.stringify(dataToSave));
    } catch (err) {
        console.error('Failed to save calculation data:', err);
    }
}

/**
 * Restore calculation data from localStorage after page refresh
 * Only restores if data belongs to the current user
 */
function restoreCalculationData() {
    try {
        const saved = localStorage.getItem('budgetCalculationData');
        if (!saved) return;
        
        const data = JSON.parse(saved);
        
        // Check if data belongs to the current user
        if (data.userId && currentUser && data.userId !== currentUser.username) {
            console.log('Clearing calculation data from different user');
            localStorage.removeItem('budgetCalculationData');
            return;
        }
        
        // Check if data is less than 24 hours old
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        if (Date.now() - data.timestamp > maxAge) {
            localStorage.removeItem('budgetCalculationData');
            return;
        }
        
        // Restore data
        dailyBudgetData = data.dailyBudgetData || [];
        detailData = data.detailData || [];
        calculationParams = data.calculationParams || {};
        sourceTotals = data.sourceTotals || null;
        
        if (dailyBudgetData.length > 0) {
            // Restore dropdown selections
            if (calculationParams.year) {
                document.getElementById('dist-year').value = calculationParams.year;
            }
            if (calculationParams.scenario) {
                document.getElementById('dist-scenario').value = calculationParams.scenario;
            }
            
            // Update UI
            document.getElementById('summary-section').classList.remove('hidden');
            document.getElementById('export-btn').disabled = false;
            
            // Update summary cards and chart
            updateSummaryCards();
            renderBranchChart();
            
            console.log('Restored calculation data from previous session');
        }
    } catch (err) {
        console.error('Failed to restore calculation data:', err);
        localStorage.removeItem('budgetCalculationData');
    }
}

/**
 * Clear saved calculation data (call after successful publish)
 */
function clearCalculationData() {
    localStorage.removeItem('budgetCalculationData');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Calculate button
    document.getElementById('calculate-btn').addEventListener('click', calculateDailyBudget);

    // Export button
    document.getElementById('export-btn').addEventListener('click', exportToClickHouse);

    // Download CSV
    document.getElementById('download-csv').addEventListener('click', downloadCSV);
}

// Chart instance for branch distribution
let branchChart = null;

/**
 * Calculate daily budget distribution
 */
async function calculateDailyBudget() {
    const year = document.getElementById('dist-year').value;
    const scenario = document.getElementById('dist-scenario').value;
    const branchId = document.getElementById('dist-branch').value;

    if (!year) {
        showStatus('Please select year', 'error');
        return;
    }

    if (!scenario) {
        showStatus('Please select scenario', 'error');
        return;
    }
    
    // Always use full year (all quarters)
    const quarter = null;

    showLoading(true);

    try {
        const response = await fetch(`${API_BASE}/api/daily-budget/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ year: parseInt(year), quarter: quarter, scenario, branch_id: branchId ? parseInt(branchId) : null })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Calculation failed');
        }

        dailyBudgetData = data.daily_budget;  // Aggregated data for display
        detailData = data.detail_data || [];   // Detail data for publishing
        calculationParams = { year: parseInt(year), quarters: data.quarters || [quarter], scenario };
        currentPage = 1;
        
        // Store source totals from API response
        sourceTotals = data.source_totals || null;
        
        // Save calculation data to localStorage for persistence
        saveCalculationData();

        // Update UI
        document.getElementById('summary-section').classList.remove('hidden');
        document.getElementById('export-btn').disabled = false;

        // Update summary cards with all metrics
        updateSummaryCards();
        
        // Render branch distribution chart
        renderBranchChart();

        showStatus(`Calculated ${data.total_records} daily records (${data.detail_records || 0} detail records)`, 'success');
    } catch (err) {
        showStatus(err.message, 'error');
    }

    showLoading(false);
}

/**
 * Update summary cards with all metrics from calculation
 * Uses source totals from the budget view (vw_Budget) and calculated data
 */
function updateSummaryCards() {
    // Use source totals from API if available, otherwise calculate from distributed data
    let totalRevenue, totalCensus;
    
    if (sourceTotals) {
        totalRevenue = sourceTotals.revenue || 0;
        totalCensus = sourceTotals.census || 0;
    } else {
        totalRevenue = dailyBudgetData.reduce((sum, row) => sum + (row.revenue || 0), 0);
        totalCensus = dailyBudgetData.reduce((sum, row) => sum + (row.census || 0), 0);
    }
    
    // Calculate totals from distributed data
    const totalEpisodes = dailyBudgetData.reduce((sum, row) => sum + (row.episodes || 0), 0);
    
    // Separate metrics by stay type
    const stayTypeMetrics = {};
    
    dailyBudgetData.forEach(row => {
        const stayType = row.stay_type || 'Unknown';
        const cpe = row.cpe || 0;
        const alos = row.alos || 0;
        const revenue = row.revenue || 0;
        
        if (!stayTypeMetrics[stayType]) {
            stayTypeMetrics[stayType] = {
                revenue: 0,
                episodes: 0,
                totalCPE: 0,
                countCPE: 0,
                totalALOS: 0,
                countALOS: 0,
                records: 0
            };
        }
        
        stayTypeMetrics[stayType].revenue += revenue;
        stayTypeMetrics[stayType].episodes += (row.episodes || 0);
        stayTypeMetrics[stayType].records++;
        
        // Track CPE values for LTC and Non-LTC
        if (cpe > 0) {
            stayTypeMetrics[stayType].totalCPE += cpe;
            stayTypeMetrics[stayType].countCPE++;
        }
        
        if (alos > 0) {
            stayTypeMetrics[stayType].totalALOS += alos;
            stayTypeMetrics[stayType].countALOS++;
        }
    });
    
    // Update overall summary cards
    document.getElementById('total-revenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('total-census').textContent = formatNumber(Math.round(totalCensus));
    document.getElementById('total-episodes').textContent = formatNumber(Math.round(totalEpisodes));
    
    // Populate the metrics summary table
    const tbody = document.getElementById('metrics-summary-tbody');
    tbody.innerHTML = '';
    
    // Sort stay types: OP, ER, Non-LTC, LTC
    const stayTypeOrder = ['OP', 'ER', 'Non-LTC', 'LTC'];
    const sortedStayTypes = Object.keys(stayTypeMetrics).sort((a, b) => {
        const aIndex = stayTypeOrder.indexOf(a);
        const bIndex = stayTypeOrder.indexOf(b);
        if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });
    
    sortedStayTypes.forEach(stayType => {
        const metrics = stayTypeMetrics[stayType];
        // For LTC and Non-LTC: use average of CPE values
        // For OP and ER: use Revenue / Episodes
        let avgCPE;
        if (stayType === 'LTC' || stayType === 'Non-LTC') {
            avgCPE = metrics.countCPE > 0 ? metrics.totalCPE / metrics.countCPE : 0;
        } else {
            avgCPE = metrics.episodes > 0 ? metrics.revenue / metrics.episodes : 0;
        }
        const avgALOS = metrics.countALOS > 0 ? metrics.totalALOS / metrics.countALOS : 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="stay-type-badge ${stayType.toLowerCase().replace('-', '')}">${stayType}</span></td>
            <td class="text-right">${formatCurrency(metrics.revenue)}</td>
            <td class="text-right">${avgCPE > 0 ? formatCurrency(avgCPE) : '-'}</td>
            <td class="text-right">${avgALOS > 0 ? avgALOS.toFixed(2) + ' days' : '-'}</td>
            <td class="text-right">${formatNumber(metrics.records)}</td>
        `;
        tbody.appendChild(row);
    });
    
    // Add total row
    const totalRow = document.createElement('tr');
    totalRow.className = 'total-row';
    totalRow.innerHTML = `
        <td><strong>Total</strong></td>
        <td class="text-right"><strong>${formatCurrency(totalRevenue)}</strong></td>
        <td class="text-right">-</td>
        <td class="text-right">-</td>
        <td class="text-right"><strong>${formatNumber(dailyBudgetData.length)}</strong></td>
    `;
    tbody.appendChild(totalRow);
}

/**
 * Load and display published budget summary from ClickHouse budget_data table
 */
async function loadPublishedSummary() {
    const year = document.getElementById('dist-year').value;
    const scenario = document.getElementById('dist-scenario').value;
    const branchId = document.getElementById('dist-branch').value;
    
    if (!year || !scenario) {
        return;
    }
    
    try {
        let url = `${API_BASE}/api/daily-budget/published-summary?year=${year}&scenario=${scenario}`;
        if (branchId) {
            url += `&branch_id=${branchId}`;
        }
        
        const response = await fetch(url, { credentials: 'include' });
        const data = await response.json();
        
        if (response.ok && data.success && data.summary) {
            const summary = data.summary;
            
            // Update overall summary cards
            document.getElementById('total-revenue').textContent = formatCurrency(summary.total_revenue);
            document.getElementById('total-census').textContent = formatNumber(Math.round(summary.total_census));
            document.getElementById('total-episodes').textContent = formatNumber(Math.round(summary.total_episodes));
            
            // Build summary table from published data
            const tbody = document.getElementById('metrics-summary-tbody');
            if (tbody && summary.by_stay_type) {
                tbody.innerHTML = '';
                const stayTypeOrder = ['OP', 'ER', 'Non-LTC', 'LTC'];
                const sortedTypes = Object.keys(summary.by_stay_type).sort((a, b) => {
                    const aIndex = stayTypeOrder.indexOf(a);
                    const bIndex = stayTypeOrder.indexOf(b);
                    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
                    if (aIndex === -1) return 1;
                    if (bIndex === -1) return -1;
                    return aIndex - bIndex;
                });
                
                sortedTypes.forEach(stayType => {
                    const metrics = summary.by_stay_type[stayType];
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td><span class="stay-type-badge ${stayType.toLowerCase().replace('-', '')}">${stayType}</span></td>
                        <td class="text-right">${formatCurrency(metrics.revenue || 0)}</td>
                        <td class="text-right">${metrics.avg_cpe > 0 ? formatCurrency(metrics.avg_cpe) : '-'}</td>
                        <td class="text-right">${metrics.avg_alos > 0 ? metrics.avg_alos.toFixed(2) + ' days' : '-'}</td>
                        <td class="text-right">${formatNumber(metrics.records || 0)}</td>
                    `;
                    tbody.appendChild(row);
                });
                
                // Add total row
                const totalRow = document.createElement('tr');
                totalRow.className = 'total-row';
                totalRow.innerHTML = `
                    <td><strong>Total</strong></td>
                    <td class="text-right"><strong>${formatCurrency(summary.total_revenue)}</strong></td>
                    <td class="text-right">-</td>
                    <td class="text-right">-</td>
                    <td class="text-right"><strong>${formatNumber(summary.total_records)}</strong></td>
                `;
                tbody.appendChild(totalRow);
            }
            
            // Show the summary section
            document.getElementById('summary-section').classList.remove('hidden');
            
            return true;
        }
        return false;
    } catch (err) {
        console.error('Failed to load published summary:', err);
        return false;
    }
}

/**
 * Render branch distribution chart
 */
function renderBranchChart() {
    // Aggregate revenue by branch
    const branchData = {};
    dailyBudgetData.forEach(row => {
        const branchName = BRANCH_NAMES[row.branch_id] || `Branch ${row.branch_id}`;
        if (!branchData[branchName]) {
            branchData[branchName] = { revenue: 0, census: 0 };
        }
        branchData[branchName].revenue += row.revenue || 0;
        branchData[branchName].census += row.census || 0;
    });
    
    const labels = Object.keys(branchData);
    const revenueValues = labels.map(label => branchData[label].revenue);
    
    // Colors for branches
    const colors = [
        'rgba(12, 90, 145, 0.8)',    // Primary blue
        'rgba(16, 185, 129, 0.8)',   // Green
        'rgba(245, 158, 11, 0.8)',   // Amber
        'rgba(139, 92, 246, 0.8)',   // Purple
        'rgba(236, 72, 153, 0.8)',   // Pink
        'rgba(20, 184, 166, 0.8)'    // Teal
    ];
    
    const borderColors = [
        'rgba(12, 90, 145, 1)',
        'rgba(16, 185, 129, 1)',
        'rgba(245, 158, 11, 1)',
        'rgba(139, 92, 246, 1)',
        'rgba(236, 72, 153, 1)',
        'rgba(20, 184, 166, 1)'
    ];
    
    // Destroy existing chart if any
    if (branchChart) {
        branchChart.destroy();
    }
    
    const ctx = document.getElementById('branch-chart').getContext('2d');
    branchChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Revenue (SAR)',
                data: revenueValues,
                backgroundColor: colors.slice(0, labels.length),
                borderColor: borderColors.slice(0, labels.length),
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleFont: { size: 14, weight: 'bold' },
                    bodyFont: { size: 13 },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            return `Revenue: ${formatCurrency(value)}`;
                        },
                        afterLabel: function(context) {
                            const branchName = context.label;
                            const census = branchData[branchName].census;
                            return `Census: ${formatNumber(census)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        callback: function(value) {
                            if (value >= 1000000) {
                                return (value / 1000000).toFixed(1) + 'M';
                            } else if (value >= 1000) {
                                return (value / 1000).toFixed(0) + 'K';
                            }
                            return value;
                        },
                        font: { size: 11 }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: { size: 12, weight: '600' }
                    }
                }
            }
        }
    });
}

/**
 * Populate filter dropdowns
 */
function populateFilters() {
    const careTypes = [...new Set(dailyBudgetData.map(d => d.care_type))];
    const stayTypes = [...new Set(dailyBudgetData.map(d => d.stay_type))];

    const careTypeSelect = document.getElementById('filter-care-type');
    careTypeSelect.innerHTML = '<option value="">All</option>' +
        careTypes.map(ct => `<option value="${ct}">${ct}</option>`).join('');

    const stayTypeSelect = document.getElementById('filter-stay-type');
    stayTypeSelect.innerHTML = '<option value="">All</option>' +
        stayTypes.map(st => `<option value="${st}">${st}</option>`).join('');
}

/**
 * Filter and render results
 */
function filterResults() {
    currentPage = 1;
    renderResults();
}

/**
 * Render results table (simplified: Branch, Day, CareType, StayType)
 */
function renderResults() {
    const careType = document.getElementById('filter-care-type').value;
    const stayType = document.getElementById('filter-stay-type').value;
    const dateFrom = document.getElementById('filter-date-from').value;
    const dateTo = document.getElementById('filter-date-to').value;

    let filtered = [...dailyBudgetData];

    if (careType) filtered = filtered.filter(d => d.care_type === careType);
    if (stayType) filtered = filtered.filter(d => d.stay_type === stayType);
    if (dateFrom) filtered = filtered.filter(d => d.table_date >= dateFrom);
    if (dateTo) filtered = filtered.filter(d => d.table_date <= dateTo);

    // Pagination
    const totalPages = Math.ceil(filtered.length / pageSize);
    const start = (currentPage - 1) * pageSize;
    const pageData = filtered.slice(start, start + pageSize);

    // Update count
    document.getElementById('results-count').textContent = `${filtered.length} records`;

    // Render table (simplified columns)
    const tbody = document.getElementById('results-body');
    tbody.innerHTML = pageData.map(row => `
        <tr>
            <td>${formatDate(row.table_date)}</td>
            <td>${BRANCH_NAMES[row.branch_id] || row.branch_id}</td>
            <td>${row.care_type}</td>
            <td>${row.stay_type}</td>
            <td class="numeric">${formatNumber(row.census)}</td>
            <td class="numeric">${formatCurrency(row.revenue)}</td>
        </tr>
    `).join('');

    // Render pagination
    renderPagination(totalPages);
}

/**
 * Render pagination controls
 */
function renderPagination(totalPages) {
    const pagination = document.getElementById('pagination');

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = `
        <button ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(1)">
            <i class="fas fa-angle-double-left"></i>
        </button>
        <button ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">
            <i class="fas fa-angle-left"></i>
        </button>
    `;

    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    html += `
        <button ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">
            <i class="fas fa-angle-right"></i>
        </button>
        <button ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${totalPages})">
            <i class="fas fa-angle-double-right"></i>
        </button>
    `;

    pagination.innerHTML = html;
}

/**
 * Go to specific page
 */
function goToPage(page) {
    currentPage = page;
    renderResults();
}

/**
 * Publish to ClickHouse (budget_data table)
 */
async function exportToClickHouse() {
    if (!detailData.length) {
        showStatus('No data to publish', 'error');
        return;
    }

    // Show confirmation modal instead of browser confirm
    showPublishModal();
}

/**
 * Show publish confirmation modal with summary
 */
function showPublishModal() {
    const modal = document.getElementById('publish-modal');
    
    // Populate modal with data
    const quartersText = calculationParams.quarters.length === 4 
        ? 'Full Year (Q1-Q4)' 
        : `Quarter ${calculationParams.quarters.join(', Q')}`;
    
    const scenarioDisplay = calculationParams.scenario
        .replace('_', ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
    
    // Calculate totals
    const totalRevenue = sourceTotals ? sourceTotals.revenue : 
        dailyBudgetData.reduce((sum, row) => sum + (row.revenue || 0), 0);
    const totalCensus = sourceTotals ? sourceTotals.census : 
        dailyBudgetData.reduce((sum, row) => sum + (row.census || 0), 0);
    const totalEpisodes = dailyBudgetData.reduce((sum, row) => sum + (row.episodes || 0), 0);
    
    // Set modal values
    document.getElementById('modal-year').textContent = calculationParams.year;
    document.getElementById('modal-period').textContent = quartersText;
    document.getElementById('modal-scenario').textContent = scenarioDisplay;
    document.getElementById('modal-records').textContent = detailData.length.toLocaleString();
    document.getElementById('modal-revenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('modal-census').textContent = formatNumber(Math.round(totalCensus));
    document.getElementById('modal-episodes').textContent = formatNumber(Math.round(totalEpisodes));
    
    // Show modal with animation
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.add('active');
    });
    
    // Setup event listeners
    const cancelBtn = document.getElementById('modal-cancel');
    const confirmBtn = document.getElementById('modal-confirm');
    
    // Remove old listeners
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    
    // Add new listeners
    document.getElementById('modal-cancel').addEventListener('click', hidePublishModal);
    document.getElementById('modal-confirm').addEventListener('click', confirmPublish);
    
    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            hidePublishModal();
        }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', handleModalEscape);
}

/**
 * Hide publish modal
 */
function hidePublishModal() {
    const modal = document.getElementById('publish-modal');
    modal.classList.remove('active');
    
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
    
    document.removeEventListener('keydown', handleModalEscape);
}

/**
 * Handle Escape key to close modal
 */
function handleModalEscape(e) {
    if (e.key === 'Escape') {
        hidePublishModal();
    }
}

/**
 * Confirm and execute publish
 */
async function confirmPublish() {
    hidePublishModal();
    showLoading(true);

    try {
        // Use dailyBudgetData (aggregated) instead of detailData (raw) to avoid duplicates
        const response = await fetch(`${API_BASE}/api/daily-budget/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                detail_data: dailyBudgetData,
                year: calculationParams.year,
                quarters: calculationParams.quarters,
                scenario: calculationParams.scenario
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Publish failed');
        }

        showStatus(data.message, 'success');
        
        // Clear saved calculation data after successful publish
        clearCalculationData();
        
        // Reload summary from published data to show accurate metrics
        await loadPublishedSummary();
    } catch (err) {
        showStatus(err.message, 'error');
    }

    showLoading(false);
}

/**
 * Download CSV
 */
function downloadCSV() {
    if (!dailyBudgetData.length) {
        showStatus('No data to download', 'error');
        return;
    }

    const headers = ['Date', 'Branch', 'Scenario', 'CareType', 'StayType', 'Speciality', 'Census', 'Episodes', 'CPE', 'ALOS', 'Revenue'];
    const rows = dailyBudgetData.map(d => [
        d.table_date,
        BRANCH_NAMES[d.branch_id] || d.branch_id,
        d.scenario,
        d.care_type,
        d.stay_type,
        d.speciality || '',
        d.census,
        d.episodes,
        d.cpe,
        d.alos,
        d.revenue
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `daily_budget_${calculationParams.year || 'data'}_${calculationParams.scenario || 'all'}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    showStatus('CSV file downloaded successfully', 'success');
}

// ============== Utility Functions ==============

function showLoading(show) {
    loadingEl.classList.toggle('hidden', !show);
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');

    setTimeout(() => {
        statusMessage.classList.add('hidden');
    }, 4000);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatNumber(value) {
    if (value === null || value === undefined) return '-';
    return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatCurrency(value) {
    if (value === null || value === undefined) return '-';
    return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'SAR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
