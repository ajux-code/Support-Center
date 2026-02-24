/**
 * Retention Dashboard
 * Client retention, renewal tracking, and upsell opportunity management
 */

class RetentionDashboard {
    constructor() {
        this.contentContainer = document.getElementById('dashboard-content');
        this.clientsTableBody = document.getElementById('clients-table-body');
        this.productAnalysisContainer = document.getElementById('product-analysis');
        this.modal = document.getElementById('client-detail-modal');
        this.searchInput = document.getElementById('client-search');

        this.currentFilter = '';
        this.clients = [];
        this.searchTimeout = null;

        // Pagination state
        this.currentPage = 1;
        this.pageSize = 50;
        this.totalClients = 0;

        // Chart instances
        this.renewalRateChart = null;
        this.ordersComparisonChart = null;
        this.revenueTrendChart = null;
        this.chartMonths = 6;

        // Calendar state
        this.calendarYear = new Date().getFullYear();
        this.calendarMonth = new Date().getMonth() + 1;

        // Current tab
        this.currentTab = 'overview';

        this.initializeEventListeners();
        this.loadDashboard();
    }

    showGlobalLoading() {
        let overlay = document.getElementById('global-loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'global-loading-overlay';
            overlay.className = 'global-loading-overlay';
            overlay.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">Loading dashboard data...</p>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    }

    hideGlobalLoading() {
        const overlay = document.getElementById('global-loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    destroyAllCharts() {
        if (this.renewalRateChart) {
            this.renewalRateChart.destroy();
            this.renewalRateChart = null;
        }
        if (this.ordersComparisonChart) {
            this.ordersComparisonChart.destroy();
            this.ordersComparisonChart = null;
        }
        if (this.revenueTrendChart) {
            this.revenueTrendChart.destroy();
            this.revenueTrendChart = null;
        }
    }

    initializeEventListeners() {
        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter || '';
                this.loadClients();
            });
        });

        // Search input - Backend search
        const searchClearBtn = document.getElementById('search-clear-btn');
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                const value = e.target.value.trim();

                // Show/hide clear button
                if (searchClearBtn) {
                    searchClearBtn.style.display = value ? 'flex' : 'none';
                }

                // If search is empty, reload original client list
                if (!value) {
                    this.clearSearch();
                    return;
                }

                // Debounce backend search
                this.searchTimeout = setTimeout(() => {
                    this.performBackendSearch(value);
                }, 400); // Slightly longer debounce for backend calls
            });

            // Enter key to search
            this.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    clearTimeout(this.searchTimeout);
                    const value = e.target.value.trim();
                    if (value) {
                        this.performBackendSearch(value);
                    }
                }
            });
        }

        // Search clear button
        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', () => {
                this.clearSearch();
            });
        }

        // Modal close handlers
        this.modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.closeModal());
        this.modal?.querySelector('#modal-close')?.addEventListener('click', () => this.closeModal());

        // Modal content event delegation
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                const target = e.target.closest('[data-order-url]');
                if (target) {
                    const url = target.getAttribute('data-order-url');
                    window.open(url, '_blank');
                    return;
                }

                const ordersBtn = e.target.closest('[data-orders-url]');
                if (ordersBtn) {
                    const url = ordersBtn.getAttribute('data-orders-url');
                    window.open(url, '_blank');
                    return;
                }

                const customerBtn = e.target.closest('[data-customer-url]');
                if (customerBtn) {
                    const url = customerBtn.getAttribute('data-customer-url');
                    window.open(url, '_blank');
                    return;
                }

                const supportBtn = e.target.closest('[data-support-url]');
                if (supportBtn) {
                    const url = supportBtn.getAttribute('data-support-url');
                    window.location.href = url;
                    return;
                }

                const breakdownBtn = e.target.closest('.view-breakdown-btn');
                if (breakdownBtn) {
                    e.preventDefault();
                    const customerId = breakdownBtn.getAttribute('data-customer-id');
                    if (customerId) {
                        this.showPriorityBreakdown(customerId);
                    }
                    return;
                }

                const contactBtn = e.target.closest('.mark-contacted-btn');
                if (contactBtn) {
                    e.preventDefault();
                    const customerId = contactBtn.getAttribute('data-customer-id');
                    const customerName = contactBtn.getAttribute('data-customer-name');
                    if (customerId) {
                        this.showContactDialog(customerId, customerName);
                    }
                    return;
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Escape - Close modal
            if (e.key === 'Escape') {
                this.closeModal();
            }

            // Ctrl/Cmd + K - Focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.searchInput?.focus();
            }

            // Ctrl/Cmd + 1-4 - Switch tabs
            if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '4') {
                e.preventDefault();
                const tabs = ['overview', 'calendar', 'clients', 'analytics'];
                const tabIndex = parseInt(e.key) - 1;
                if (tabs[tabIndex]) {
                    this.switchTab(tabs[tabIndex]);
                }
            }

            // ? - Show keyboard shortcuts help
            if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
                const target = e.target;
                // Don't trigger in input fields
                if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    this.showKeyboardShortcutsHelp();
                }
            }
        });

        // Chart period selector
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.chartMonths = parseInt(e.target.dataset.months) || 6;
                this.loadTrendData();
            });
        });

        // Calendar navigation
        document.getElementById('prev-month')?.addEventListener('click', () => {
            this.calendarMonth--;
            if (this.calendarMonth < 1) {
                this.calendarMonth = 12;
                this.calendarYear--;
            }
            this.loadCalendarData();
        });

        document.getElementById('next-month')?.addEventListener('click', () => {
            this.calendarMonth++;
            if (this.calendarMonth > 12) {
                this.calendarMonth = 1;
                this.calendarYear++;
            }
            this.loadCalendarData();
        });

        document.getElementById('today-btn')?.addEventListener('click', () => {
            const today = new Date();
            this.calendarYear = today.getFullYear();
            this.calendarMonth = today.getMonth() + 1;
            this.loadCalendarData();
        });

        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.currentTarget.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Quick action cards - Scroll to sections
        document.querySelectorAll('.quick-action-card').forEach(card => {
            card.addEventListener('click', () => {
                const targetTab = card.dataset.tabTarget;
                let targetSection = null;

                // Map tab targets to actual section IDs
                if (targetTab === 'calendar') {
                    targetSection = document.getElementById('full-calendar-section');
                    // Expand the calendar if it's hidden
                    if (targetSection && targetSection.style.display === 'none') {
                        targetSection.style.display = 'block';
                    }
                    // Load calendar data
                    this.loadCalendarData();
                } else if (targetTab === 'clients') {
                    targetSection = document.querySelector('.clients-section');
                } else if (targetTab === 'analytics') {
                    targetSection = document.getElementById('analytics-section');
                    // Expand analytics if collapsed
                    if (targetSection && targetSection.classList.contains('collapsed')) {
                        targetSection.classList.remove('collapsed');
                        // Load charts if not already loaded
                        if (!this.renewalRateChart) {
                            this.loadTrendData();
                        }
                    }
                }

                // Smooth scroll to the section
                if (targetSection) {
                    targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        // View all clients link
        document.querySelector('.view-all-clients-btn')?.addEventListener('click', (e) => {
            e.preventDefault();
            const filter = e.target.dataset.filter;
            this.switchTab('clients');
            if (filter) {
                this.currentFilter = filter;
                document.querySelectorAll('.filter-tab').forEach(t => {
                    t.classList.toggle('active', t.dataset.filter === filter);
                });
                this.filterClientsLocally('');
            }
        });

        // Cleanup charts on page unload
        window.addEventListener('beforeunload', () => {
            this.destroyAllCharts();
        });

        // Collapsible sections
        document.getElementById('analytics-toggle')?.addEventListener('click', () => {
            const section = document.getElementById('analytics-section');
            const isCollapsed = section.classList.contains('collapsed');

            if (isCollapsed) {
                section.classList.remove('collapsed');
                // Load charts if not already loaded
                if (!this.renewalRateChart) {
                    this.loadTrendData();
                }
            } else {
                section.classList.add('collapsed');
            }
        });

        // Expand/collapse calendar
        document.getElementById('expand-calendar-btn')?.addEventListener('click', () => {
            const section = document.getElementById('full-calendar-section');
            section.style.display = 'block';
            // Load full calendar if needed
            this.loadCalendarData();
            // Scroll to it
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        document.getElementById('collapse-calendar-btn')?.addEventListener('click', () => {
            const section = document.getElementById('full-calendar-section');
            section.style.display = 'none';
        });
    }

    switchTab(tabName) {
        // Cleanup charts when leaving analytics tab
        if (this.currentTab === 'analytics' && tabName !== 'analytics') {
            this.destroyAllCharts();
        }

        this.currentTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.panel === tabName);
        });

        // Load tab-specific data if needed
        if (tabName === 'analytics' && !this.renewalRateChart) {
            this.loadTrendData();
        }
        if (tabName === 'calendar') {
            this.loadCalendarData();
        }
    }

    async loadDashboard() {
        this.showGlobalLoading();
        try {
            // Load all data in parallel for the new layout
            const [kpis, clients, products, compactCalendar] = await Promise.all([
                this.apiCall('support_center.api.retention_dashboard.get_dashboard_kpis', {}),
                this.apiCall('support_center.api.retention_dashboard.get_clients_by_renewal_status', {
                    status_filter: this.currentFilter || null,
                    limit: this.pageSize,
                    offset: (this.currentPage - 1) * this.pageSize
                }),
                this.apiCall('support_center.api.retention_dashboard.get_product_retention_analysis', {}),
                this.apiCall('support_center.api.retention_dashboard.get_renewal_calendar', {
                    start_date: this.getTodayDate(),
                    end_date: this.getDatePlusDays(7) // 7-day view
                })
            ]);

            this.renderKPIs(kpis);
            this.clients = clients;
            this.renderClients(clients);
            this.renderPagination();
            this.renderProductAnalysis(products);

            // Render insights widgets (adaptive - consolidates when empty)
            this.renderInsightsWidgets(compactCalendar, clients);

            // Render at-risk clients for overview (legacy)
            this.renderAtRiskClients(clients);

        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.showError('Failed to load dashboard data. Please refresh the page.');
        } finally {
            this.hideGlobalLoading();
        }
    }

    getTodayDate() {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }

    getDatePlusDays(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
    }

    /**
     * Adaptive rendering for insights section
     * Always renders both cards — each card shows its own empty state when needed
     */
    renderInsightsWidgets(renewals, clients) {
        const insightsGrid = document.querySelector('.insights-grid');
        if (!insightsGrid) return;

        // Remove any previous consolidated state and restore widget cards
        const existingConsolidated = insightsGrid.querySelector('.consolidated-success');
        if (existingConsolidated) {
            existingConsolidated.remove();
        }
        insightsGrid.classList.remove('insights-consolidated');

        // Show the widget cards (they may have been hidden)
        insightsGrid.querySelectorAll('.widget-card').forEach(card => {
            card.style.display = '';
        });

        // Always render both cards — they handle empty states internally
        this.renderCompactCalendar(renewals);
        this.renderPriorityClients(clients);
    }

    /**
     * Render consolidated empty state when both widgets are empty
     * Vercel-style: compact, informative, actionable
     */
    renderConsolidatedEmptyState(clients) {
        // Find next renewal from all clients
        const nextRenewal = this.findNextRenewal(clients);

        const insightsGrid = document.querySelector('.insights-grid');
        if (!insightsGrid) return;

        insightsGrid.innerHTML = `
            <div class="consolidated-success">
                <div class="success-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                </div>
                <div class="success-content">
                    <h4>You're all caught up</h4>
                    <p class="success-details">
                        No renewals in next 7 days${nextRenewal ? ` • Next: ${this.formatNextRenewal(nextRenewal)}` : ''}
                    </p>
                </div>
                <div class="success-actions">
                    <button type="button" class="btn-link" id="jump-to-calendar-btn">
                        View pipeline →
                    </button>
                    <button type="button" class="btn-link" id="analytics-nav-btn">
                        Review analytics →
                    </button>
                </div>
            </div>
        `;

        // Add event listeners using event delegation (more reliable)
        setTimeout(() => {
            // Use event delegation on the parent container
            const successContainer = document.querySelector('.consolidated-success');
            if (!successContainer) {
                return;
            }

            // Attach single delegated listener
            successContainer.addEventListener('click', (e) => {
                const target = e.target;

                // Check if click is on or within calendar button
                const calendarBtn = target.closest('#jump-to-calendar-btn');
                if (calendarBtn) {
                    e.preventDefault();
                    e.stopPropagation();

                    // Navigate to calendar section (same logic as quick-action-card)
                    const calendarSection = document.getElementById('full-calendar-section');
                    if (calendarSection) {
                        // Expand the calendar if it's hidden
                        if (calendarSection.style.display === 'none') {
                            calendarSection.style.display = 'block';
                        }
                        // Load calendar data
                        this.loadCalendarData();
                        // Smooth scroll to the section
                        calendarSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

                        // Optional: scroll to next renewal date if found
                        if (nextRenewal) {
                            setTimeout(() => {
                                const dateElement = document.querySelector(`[data-date="${nextRenewal.renewal_date}"]`);
                                if (dateElement) {
                                    dateElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            }, 500);
                        }
                    } else {
                        console.warn('Calendar section not found');
                    }
                    return;
                }

                // Check if click is on or within analytics button
                const analyticsBtn = target.closest('#analytics-nav-btn');
                if (analyticsBtn) {
                    e.preventDefault();
                    e.stopPropagation();

                    // Navigate to analytics section (same logic as quick-action-card)
                    const analyticsSection = document.getElementById('analytics-section');
                    if (analyticsSection) {
                        // Expand analytics if collapsed
                        if (analyticsSection.classList.contains('collapsed')) {
                            analyticsSection.classList.remove('collapsed');
                        }
                        // Load charts if not already loaded
                        if (!this.renewalRateChart) {
                            this.loadTrendData();
                        }
                        // Smooth scroll to the section
                        analyticsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } else {
                        console.warn('Analytics section not found');
                    }
                    return;
                }
            });

        }, 100);
    }

    /**
     * Find the next upcoming renewal from all clients
     */
    findNextRenewal(clients) {
        if (!clients || clients.length === 0) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Find clients with future renewal dates
        const upcomingRenewals = clients
            .filter(c => c.renewal_date && new Date(c.renewal_date) > today)
            .sort((a, b) => new Date(a.renewal_date) - new Date(b.renewal_date));

        return upcomingRenewals.length > 0 ? upcomingRenewals[0] : null;
    }

    /**
     * Format next renewal info for display
     */
    formatNextRenewal(renewal) {
        if (!renewal) return '';

        const date = new Date(renewal.renewal_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((date - today) / (1000 * 60 * 60 * 24));

        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const customerName = renewal.customer_name || 'Customer';

        return `${dateStr} (${daysUntil} days) • ${this.truncate(customerName, 20)}`;
    }

    /**
     * Truncate text with ellipsis
     */
    truncate(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    renderCompactCalendar(renewals) {
        const container = document.getElementById('compact-calendar');
        if (!container) return;

        if (!renewals || renewals.length === 0) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <p>No renewals in the next 7 days</p>
                </div>
            `;
            return;
        }

        // Group by date
        const byDate = {};
        renewals.forEach(renewal => {
            const date = renewal.renewal_date;
            if (!byDate[date]) {
                byDate[date] = [];
            }
            byDate[date].push(renewal);
        });

        // Generate next 7 days
        const days = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            days.push({
                date: dateStr,
                dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
                dayNum: date.getDate(),
                renewals: byDate[dateStr] || []
            });
        }

        container.innerHTML = `
            <div class="compact-calendar-grid">
                ${days.map(day => `
                    <div class="compact-day ${day.renewals.length > 0 ? 'has-renewals' : ''}">
                        <div class="compact-day-header">
                            <span class="day-name">${day.dayName}</span>
                            <span class="day-num">${day.dayNum}</span>
                        </div>
                        ${day.renewals.length > 0 ? `
                            <div class="compact-day-renewals">
                                <span class="renewal-count">${day.renewals.length}</span>
                                <span class="renewal-label">renewal${day.renewals.length !== 1 ? 's' : ''}</span>
                            </div>
                        ` : '<div class="compact-day-empty">-</div>'}
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderPriorityClients(clients) {
        const container = document.getElementById('priority-clients-list');
        const badge = document.getElementById('priority-count-badge');
        if (!container) return;

        // Filter for high-priority at-risk clients
        const priorityClients = clients
            .filter(c => c.renewal_status === 'overdue' || c.renewal_status === 'due_soon')
            .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
            .slice(0, 5); // Top 5

        // Hide badge when count is 0, show otherwise
        if (badge) {
            if (priorityClients.length === 0) {
                badge.style.display = 'none';
            } else {
                badge.style.display = '';
                badge.textContent = priorityClients.length;
            }
        }

        if (priorityClients.length === 0) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--success); margin: 1rem auto;">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <p style="color: var(--success); font-weight: 500;">All caught up!</p>
                    <p style="font-size: var(--text-xs); color: var(--muted);">No urgent actions needed</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="priority-list">
                ${priorityClients.map(client => `
                    <div class="priority-item" data-customer-id="${this.escapeHtml(client.customer_id)}">
                        <div class="priority-item-header">
                            <div class="priority-item-info">
                                <span class="priority-customer-name">${this.escapeHtml(client.customer_name)}</span>
                                <span class="priority-status status-${client.renewal_status}">
                                    ${client.renewal_status === 'overdue' ? '🔴 Overdue' : '⚠️ Due Soon'}
                                </span>
                            </div>
                            <span class="priority-value">${this.formatCurrency(client.lifetime_value)}</span>
                        </div>
                        <div class="priority-item-details">
                            ${client.days_until_renewal !== null && client.days_until_renewal !== undefined ?
                                `<span class="priority-detail">${client.days_until_renewal < 0 ?
                                    `${Math.abs(client.days_until_renewal)} days overdue` :
                                    `${client.days_until_renewal} days left`}</span>` : ''}
                            ${client.priority_score ?
                                `<span class="priority-score">Priority: ${client.priority_score}/100</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
            ${priorityClients.length >= 5 ? `
                <button class="btn-link view-all-priority-btn" style="width: 100%; text-align: center; margin-top: 0.5rem;">
                    View all at-risk clients →
                </button>
            ` : ''}
        `;

        // Add click handlers
        container.querySelectorAll('.priority-item').forEach(item => {
            item.addEventListener('click', () => {
                const customerId = item.dataset.customerId;
                this.showClientDetail(customerId);
            });
        });
    }

    renderAtRiskClients(clients) {
        const container = document.getElementById('at-risk-clients');
        if (!container) return;

        // Filter for overdue and due_soon clients (already sorted by priority from backend)
        const atRiskClients = clients
            .filter(c => c.renewal_status === 'overdue' || c.renewal_status === 'due_soon')
            .slice(0, 6);

        if (atRiskClients.length === 0) {
            container.innerHTML = `
                <div class="at-risk-empty">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <p>No clients need immediate attention</p>
                </div>
            `;
            return;
        }

        container.innerHTML = atRiskClients.map(client => {
            const statusClass = client.renewal_status === 'overdue' ? 'overdue' : 'due-soon';
            const statusLabel = client.renewal_status === 'overdue' ? 'Overdue' : 'Due Soon';
            const daysText = client.days_until_renewal < 0
                ? `${Math.abs(client.days_until_renewal)} days overdue`
                : `${client.days_until_renewal} days left`;
            const priorityLevel = client.priority_level || 'medium';
            const priorityScore = client.priority_score || 0;

            return `
                <div class="at-risk-card priority-${priorityLevel}" data-customer-id="${this.escapeHtml(client.customer_id)}">
                    <div class="at-risk-card-header">
                        <span class="at-risk-card-name">${this.escapeHtml(client.customer_name)}</span>
                        <span class="priority-badge priority-${priorityLevel}" title="Priority Score: ${priorityScore}/100">
                            ${this.getPriorityLabel(priorityLevel)}
                        </span>
                    </div>
                    <div class="at-risk-card-meta">
                        <span class="at-risk-card-status ${statusClass}">${statusLabel}</span>
                        <span class="at-risk-card-days">${daysText}</span>
                    </div>
                    <div class="at-risk-card-footer">
                        <span class="at-risk-card-value">${this.formatCurrency(client.lifetime_value)}</span>
                        <span class="at-risk-card-action">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M5 12h14M12 5l7 7-7 7"/>
                            </svg>
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers
        container.querySelectorAll('.at-risk-card').forEach(card => {
            card.addEventListener('click', () => {
                const customerId = card.dataset.customerId;
                if (customerId) {
                    this.showClientDetail(customerId);
                }
            });
        });
    }

    getPriorityLabel(level) {
        const labels = {
            'critical': 'Critical',
            'high': 'High Priority',
            'medium': 'Medium',
            'low': 'Low'
        };
        return labels[level] || 'Medium';
    }

    async loadClients(resetPage = false) {
        if (resetPage) {
            this.currentPage = 1;
        }

        this.showClientsLoading();

        try {
            const offset = (this.currentPage - 1) * this.pageSize;
            const clients = await this.apiCall('support_center.api.retention_dashboard.get_clients_by_renewal_status', {
                status_filter: this.currentFilter || null,
                limit: this.pageSize,
                offset: offset
            });

            this.clients = clients;
            this.renderClients(clients);
            this.renderPagination();

        } catch (error) {
            console.error('Failed to load clients:', error);
            this.showClientsError();
        }
    }

    loadNextPage() {
        this.currentPage++;
        this.loadClients();
    }

    loadPreviousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.loadClients();
        }
    }

    renderPagination() {
        const paginationContainer = document.getElementById('clients-pagination');
        if (!paginationContainer) return;

        const hasNextPage = this.clients.length >= this.pageSize;
        const hasPrevPage = this.currentPage > 1;

        if (!hasNextPage && !hasPrevPage) {
            paginationContainer.innerHTML = '';
            return;
        }

        paginationContainer.innerHTML = `
            <div class="pagination">
                <button class="btn-secondary pagination-btn"
                        id="prev-page-btn"
                        ${!hasPrevPage ? 'disabled' : ''}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                    Previous
                </button>
                <span class="page-info">
                    Page ${this.currentPage}${this.clients.length < this.pageSize ? ' (Last)' : ''}
                    <span class="page-detail">${this.clients.length} clients</span>
                </span>
                <button class="btn-secondary pagination-btn"
                        id="next-page-btn"
                        ${!hasNextPage ? 'disabled' : ''}>
                    Next
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </button>
            </div>
        `;

        // Attach event listeners
        document.getElementById('prev-page-btn')?.addEventListener('click', () => this.loadPreviousPage());
        document.getElementById('next-page-btn')?.addEventListener('click', () => this.loadNextPage());
    }

    renderKPIs(kpis) {
        const comparisons = kpis.comparisons || {};

        // Primary KPIs with trend indicators
        this.setKPIValue('kpi-total-customers', this.formatNumber(kpis.total_customers));
        this.setKPITrend('kpi-total-customers-trend', comparisons.customers);
        // Add Avg LTV as subtext
        this.setKPIValue('kpi-avg-ltv-subtext', `Avg LTV: ${this.formatCurrency(kpis.avg_customer_lifetime_value)}`);

        this.setKPIValue('kpi-at-risk', this.formatNumber(kpis.clients_at_risk));
        this.setKPITrend('kpi-at-risk-trend', comparisons.at_risk, true); // Inverted (down is good)

        this.setKPIValue('kpi-renewal-revenue', this.formatCurrency(kpis.revenue_up_for_renewal));
        this.setKPITrend('kpi-renewal-revenue-trend', comparisons.renewal_revenue);
        // Add Renewals This Month as subtext
        this.setKPIValue('kpi-renewals-month-subtext', `${this.formatNumber(kpis.total_renewals_this_month)} renewals this month`);

        this.setKPIValue('kpi-upsell-potential', this.formatCurrency(kpis.potential_upsell_value));
        // Add Renewal Rate as subtext
        this.setKPIValue('kpi-renewal-rate-subtext', `Renewal Rate: ${kpis.renewal_rate || 0}%`);
    }

    setKPITrend(trendId, comparison, inverted = false) {
        const container = document.getElementById(trendId);
        if (!container || !comparison) {
            if (container) container.innerHTML = '';
            return;
        }

        let direction = comparison.direction;
        // For inverted metrics (like at-risk), swap the sentiment
        let sentiment = direction;
        if (inverted) {
            if (direction === 'up') sentiment = 'negative';
            else if (direction === 'down') sentiment = 'positive';
        } else {
            if (direction === 'up') sentiment = 'positive';
            else if (direction === 'down') sentiment = 'negative';
        }

        if (direction === 'neutral') {
            container.innerHTML = '';
            return;
        }

        const arrowUp = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
        const arrowDown = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

        const changeText = comparison.raw_change !== undefined
            ? `${Math.abs(comparison.raw_change)}%`
            : comparison.label?.replace(/[+-]/g, '').trim();

        container.className = `kpi-trend kpi-trend-${sentiment}`;
        container.innerHTML = `
            ${direction === 'up' ? arrowUp : arrowDown}
            <span class="trend-text">${changeText}</span>
            <span class="trend-label">vs last month</span>
        `;
        container.title = comparison.label || 'vs last month';
    }

    setKPIStatTrend(trendId, comparison, inverted = false) {
        const container = document.getElementById(trendId);
        if (!container || !comparison) {
            if (container) container.innerHTML = '';
            return;
        }

        let direction = comparison.direction;
        let sentiment = direction;
        if (inverted) {
            if (direction === 'up') sentiment = 'negative';
            else if (direction === 'down') sentiment = 'positive';
        } else {
            if (direction === 'up') sentiment = 'positive';
            else if (direction === 'down') sentiment = 'negative';
        }

        if (direction === 'neutral') {
            container.innerHTML = '';
            return;
        }

        const arrowUp = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
        const arrowDown = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

        const changeText = comparison.raw_change !== undefined
            ? `${Math.abs(comparison.raw_change)}%`
            : comparison.label?.replace(/[+-]/g, '').trim();

        container.className = `kpi-stat-trend kpi-trend-${sentiment}`;
        container.innerHTML = `
            ${direction === 'up' ? arrowUp : arrowDown}
            <span>${changeText}</span>
        `;
        container.title = comparison.label || 'vs last month';
    }

    setKPIComparison(kpiId, comparison, inverted = false) {
        if (!comparison) return;

        const container = document.getElementById(kpiId)?.parentElement;
        if (!container) return;

        // Remove existing comparison indicator
        const existing = container.querySelector('.kpi-comparison');
        if (existing) existing.remove();

        let direction = comparison.direction;
        // For inverted metrics (like at-risk), swap the sentiment
        let sentiment = direction;
        if (inverted) {
            if (direction === 'up') sentiment = 'negative';
            else if (direction === 'down') sentiment = 'positive';
        } else {
            if (direction === 'up') sentiment = 'positive';
            else if (direction === 'down') sentiment = 'negative';
        }

        if (direction === 'neutral') return;

        const arrowUp = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
        const arrowDown = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

        const changeText = comparison.raw_change !== undefined
            ? `${comparison.raw_change > 0 ? '+' : ''}${comparison.raw_change}%`
            : comparison.label;

        const comparisonEl = document.createElement('span');
        comparisonEl.className = `kpi-comparison kpi-comparison-${sentiment}`;
        comparisonEl.innerHTML = `
            ${direction === 'up' ? arrowUp : arrowDown}
            <span class="comparison-text">${changeText}</span>
        `;
        comparisonEl.title = comparison.label || 'vs last month';

        container.appendChild(comparisonEl);
    }

    setKPIValue(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
    }

    renderClients(clients) {
        if (!this.clientsTableBody) return;

        if (clients.length === 0) {
            this.clientsTableBody.innerHTML = `
                <tr>
                    <td colspan="9" class="empty-cell">
                        <div class="empty-state-small">
                            <p>No clients found${this.currentFilter ? ` with status "${this.currentFilter}"` : ''}.</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        this.clientsTableBody.innerHTML = clients.map(client => this.createClientRow(client)).join('');

        // Attach click handlers
        this.clientsTableBody.querySelectorAll('.client-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    const customerId = row.dataset.customerId;
                    this.showClientDetail(customerId);
                }
            });
        });

        this.clientsTableBody.querySelectorAll('.view-detail-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const customerId = btn.dataset.customerId;
                this.showClientDetail(customerId);
            });
        });

        this.clientsTableBody.querySelectorAll('.open-erpnext-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const customerId = btn.dataset.customerId;
                window.open(`/app/customer/${customerId}`, '_blank');
            });
        });
    }

    createClientRow(client) {
        const statusClass = `status-${client.renewal_status || 'unknown'}`;
        const statusLabel = this.getStatusLabel(client.renewal_status);

        return `
            <tr class="client-row" data-customer-id="${this.escapeHtml(client.customer_id)}">
                <td class="customer-cell">
                    <div class="customer-info">
                        <div class="customer-name">${this.escapeHtml(client.customer_name)}</div>
                        <div class="customer-email">${this.escapeHtml(client.email || client.phone || '-')}</div>
                    </div>
                </td>
                <td class="status-cell">
                    <span class="renewal-status ${statusClass}">${statusLabel}</span>
                </td>
                <td class="priority-cell">
                    ${this.renderPriorityScore(client.priority_score, client.priority_level)}
                </td>
                <td class="date-cell">
                    ${client.renewal_date ? this.formatDate(client.renewal_date) : '-'}
                    ${client.days_until_renewal !== null && client.days_until_renewal !== undefined ?
                        `<span class="days-badge ${client.days_until_renewal < 0 ? 'overdue' : client.days_until_renewal <= 30 ? 'warning' : ''}">${client.days_until_renewal < 0 ? Math.abs(client.days_until_renewal) + ' days ago' : client.days_until_renewal + ' days'}</span>`
                        : ''}
                </td>
                <td class="products-cell">
                    ${client.products_purchased ?
                        client.products_purchased.split(',').slice(0, 2).map(p =>
                            `<span class="product-badge">${this.escapeHtml(p.trim())}</span>`
                        ).join('') +
                        (client.products_purchased.split(',').length > 2 ? `<span class="more-badge">+${client.products_purchased.split(',').length - 2}</span>` : '')
                        : '<span class="no-products">-</span>'}
                </td>
                <td class="ltv-cell">
                    <span class="ltv-value">${this.formatCurrency(client.lifetime_value)}</span>
                    <span class="order-count">${client.total_orders || 0} orders</span>
                </td>
                <td class="upsell-cell">
                    ${client.upsell_potential > 0 ?
                        `<span class="upsell-value">${this.formatCurrency(client.upsell_potential)}</span>`
                        : '<span class="no-upsell">-</span>'}
                </td>
                <td class="contact-cell">
                    ${this.renderLastContact(client)}
                </td>
                <td class="actions-cell">
                    <button class="action-btn view-detail-btn"
                            data-customer-id="${this.escapeHtml(client.customer_id)}"
                            aria-label="View details for ${this.escapeHtml(client.customer_name)}"
                            title="View Details">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                    <button class="action-btn open-erpnext-btn"
                            data-customer-id="${this.escapeHtml(client.customer_id)}"
                            aria-label="Open ${this.escapeHtml(client.customer_name)} in ERPNext"
                            title="Open in ERPNext">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </button>
                </td>
            </tr>
        `;
    }

    renderLastContact(client) {
        if (!client.last_contacted_at) {
            return '<span class="no-contact">Never</span>';
        }

        const icon = this.getContactIcon(client.last_contact_type);
        const timeAgo = this.formatContactTimeAgo(client.last_contact_days_ago);

        return `
            <div class="contact-info" title="Contacted by ${this.escapeHtml(client.last_contacted_by || 'Unknown')}">
                ${icon}
                <span class="contact-time">${timeAgo}</span>
            </div>
        `;
    }

    formatContactTimeAgo(daysAgo) {
        if (daysAgo === null || daysAgo === undefined) return 'Never';

        if (daysAgo === 0) return 'Today';
        if (daysAgo === 1) return 'Yesterday';
        if (daysAgo < 7) return `${daysAgo} days ago`;
        if (daysAgo < 30) {
            const weeks = Math.floor(daysAgo / 7);
            return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
        }
        if (daysAgo < 365) {
            const months = Math.floor(daysAgo / 30);
            return `${months} month${months !== 1 ? 's' : ''} ago`;
        }
        const years = Math.floor(daysAgo / 365);
        return `${years} year${years !== 1 ? 's' : ''} ago`;
    }

    renderPriorityScore(score, level) {
        // If no score, show dash
        if (score === null || score === undefined) {
            return '<span class="no-priority">-</span>';
        }

        // Determine priority class based on level or score
        let priorityClass = 'low';
        if (level) {
            priorityClass = level.toLowerCase();
        } else if (score >= 75) {
            priorityClass = 'critical';
        } else if (score >= 50) {
            priorityClass = 'high';
        } else if (score >= 25) {
            priorityClass = 'medium';
        }

        // Calculate bar width percentage
        const barWidth = Math.min(100, Math.max(0, score));

        return `
            <div class="priority-score-container">
                <div class="priority-bar-wrapper">
                    <div class="priority-bar priority-${priorityClass}" style="width: ${barWidth}%"></div>
                </div>
                <div class="priority-label-wrapper">
                    <span class="priority-score-value">${score}</span>
                    <span class="priority-level priority-level-${priorityClass}">${level || this.getPriorityLabel(score)}</span>
                </div>
            </div>
        `;
    }

    getPriorityLabel(score) {
        if (score >= 75) return 'Critical';
        if (score >= 50) return 'High';
        if (score >= 25) return 'Medium';
        return 'Low';
    }

    renderProductAnalysis(products) {
        if (!this.productAnalysisContainer) return;

        if (!products || products.length === 0) {
            this.productAnalysisContainer.innerHTML = `
                <div class="empty-state-small">
                    <p>No product data available yet.</p>
                </div>
            `;
            return;
        }

        this.productAnalysisContainer.innerHTML = products.map(product => `
            <div class="product-card">
                <div class="product-header">
                    <h3 class="product-name">${this.escapeHtml(product.product || 'Other')}</h3>
                    <span class="retention-badge ${product.retention_rate >= 70 ? 'high' : product.retention_rate >= 40 ? 'medium' : 'low'}">
                        ${product.retention_rate.toFixed(1)}% retention
                    </span>
                </div>
                <div class="product-stats">
                    <div class="product-stat">
                        <span class="stat-value">${this.formatCurrency(product.total_revenue)}</span>
                        <span class="stat-label">Revenue</span>
                    </div>
                    <div class="product-stat">
                        <span class="stat-value">${product.unique_customers}</span>
                        <span class="stat-label">Customers</span>
                    </div>
                    <div class="product-stat">
                        <span class="stat-value">${product.total_orders}</span>
                        <span class="stat-label">Orders</span>
                    </div>
                    <div class="product-stat">
                        <span class="stat-value">${product.renewal_orders}</span>
                        <span class="stat-label">Renewals</span>
                    </div>
                </div>
                ${product.avg_seats > 0 ? `
                    <div class="product-extra">
                        <span class="seats-info">Avg. ${product.avg_seats.toFixed(0)} seats per order</span>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    async showClientDetail(customerId) {
        if (!this.modal) return;

        // Show modal with loading state
        this.modal.classList.add('open');
        document.getElementById('modal-customer-name').textContent = 'Loading...';
        document.getElementById('modal-customer-id').textContent = '';
        document.getElementById('modal-body').innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <span>Loading customer details...</span>
            </div>
        `;

        // Add focus management
        this.setModalFocus();

        try {
            const detail = await this.apiCall('support_center.api.retention_dashboard.get_client_retention_detail', {
                customer_id: customerId
            });

            this.renderClientDetailModal(detail);

            // Load last contact info
            this.loadLastContact(customerId);

            // Re-focus after content loads
            this.setModalFocus();

        } catch (error) {
            console.error('Failed to load client detail:', error);
            document.getElementById('modal-body').innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h3>Failed to load customer details</h3>
                    <p>${this.escapeHtml(error.message || 'Please try again')}</p>
                </div>
            `;
        }
    }

    setModalFocus() {
        // Focus the first focusable element in the modal
        setTimeout(() => {
            const firstFocusable = this.modal.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])');
            if (firstFocusable) {
                firstFocusable.focus();
            }
        }, 100);
    }

    showKeyboardShortcutsHelp() {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modKey = isMac ? '⌘' : 'Ctrl';

        this.showToast(`
            <strong>Keyboard Shortcuts:</strong><br>
            <kbd>${modKey} + K</kbd> Focus search<br>
            <kbd>${modKey} + 1-4</kbd> Switch tabs<br>
            <kbd>Esc</kbd> Close modal<br>
            <kbd>?</kbd> Show this help
        `, 'info');
    }

    renderClientDetailModal(detail) {
        const customer = detail.customer;
        const metrics = detail.metrics;

        document.getElementById('modal-customer-name').textContent = customer.customer_name;
        document.getElementById('modal-customer-id').textContent = customer.customer_id;

        const statusClass = `status-${metrics.renewal_status || 'unknown'}`;
        const statusLabel = this.getStatusLabel(metrics.renewal_status);

        document.getElementById('modal-body').innerHTML = `
            <!-- Customer Overview -->
            <div class="detail-section">
                <div class="customer-overview">
                    <div class="overview-grid">
                        <div class="overview-item">
                            <span class="overview-label">Status</span>
                            <span class="renewal-status ${statusClass}">${statusLabel}</span>
                        </div>
                        <div class="overview-item">
                            <span class="overview-label">Customer Since</span>
                            <span class="overview-value">${this.formatDate(customer.customer_since)}</span>
                        </div>
                        <div class="overview-item">
                            <span class="overview-label">Email</span>
                            <span class="overview-value">${this.escapeHtml(customer.email || '-')}</span>
                        </div>
                        <div class="overview-item">
                            <span class="overview-label">Phone</span>
                            <span class="overview-value">${this.escapeHtml(customer.phone || '-')}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Metrics -->
            <div class="detail-section">
                <h3>Key Metrics</h3>
                <div class="metrics-grid">
                    <div class="metric-card">
                        <span class="metric-value">${this.formatCurrency(metrics.lifetime_value)}</span>
                        <span class="metric-label">Lifetime Value</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-value">${metrics.total_orders}</span>
                        <span class="metric-label">Total Orders</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-value">${metrics.renewal_count}</span>
                        <span class="metric-label">Renewals</span>
                    </div>
                    <div class="metric-card">
                        <span class="metric-value">${this.formatCurrency(metrics.avg_order_value)}</span>
                        <span class="metric-label">Avg. Order Value</span>
                    </div>
                </div>
                <div class="dates-row">
                    <div class="date-item">
                        <span class="date-label">Last Order:</span>
                        <span class="date-value">${metrics.last_order_date ? this.formatDate(metrics.last_order_date) : 'Never'}</span>
                    </div>
                    <div class="date-item">
                        <span class="date-label">Next Renewal:</span>
                        <span class="date-value">${metrics.next_renewal_date ? this.formatDate(metrics.next_renewal_date) : 'Not scheduled'}</span>
                    </div>
                </div>
            </div>

            <!-- Priority Score Breakdown -->
            <div class="detail-section priority-breakdown-section">
                <div class="section-header-inline">
                    <h3>Priority Score: <span class="priority-badge priority-${metrics.priority_level}">${metrics.priority_score}/100</span></h3>
                    <button class="btn-link view-breakdown-btn" data-customer-id="${customer.customer_id}">
                        View Breakdown →
                    </button>
                </div>
                <div class="priority-breakdown-container" style="display: none;">
                    <div class="breakdown-loading">
                        <div class="loading-spinner"></div>
                        <span>Loading breakdown...</span>
                    </div>
                </div>
            </div>

            <!-- Product Breakdown -->
            ${Object.keys(detail.product_breakdown).length > 0 ? `
                <div class="detail-section">
                    <h3>Products</h3>
                    <div class="product-breakdown">
                        ${Object.entries(detail.product_breakdown).map(([product, data]) => `
                            <div class="product-row">
                                <span class="product-name">${this.escapeHtml(product)}</span>
                                <span class="product-stats">
                                    ${data.count} orders · ${this.formatCurrency(data.revenue)}
                                    ${data.seats > 0 ? ` · ${data.seats} seats` : ''}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Upsell Recommendations -->
            ${detail.upsell_recommendations && detail.upsell_recommendations.length > 0 ? `
                <div class="detail-section">
                    <h3>Upsell Opportunities</h3>
                    <div class="recommendations-list">
                        ${detail.upsell_recommendations.map(rec => `
                            <div class="recommendation-card ${rec.type}">
                                <div class="rec-header">
                                    <span class="rec-title">${this.escapeHtml(rec.title)}</span>
                                    <span class="rec-value">${this.formatCurrency(rec.potential_value)}</span>
                                </div>
                                <p class="rec-description">${this.escapeHtml(rec.description)}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- Recent Orders -->
            ${detail.orders && detail.orders.length > 0 ? `
                <div class="detail-section">
                    <h3>Recent Orders</h3>
                    <div class="orders-list">
                        ${detail.orders.slice(0, 5).map(order => `
                            <div class="order-row" data-order-url="/app/sales-order/${order.order_id}">
                                <div class="order-info">
                                    <span class="order-id">${this.escapeHtml(order.order_id)}</span>
                                    <span class="order-date">${this.formatDate(order.transaction_date)}</span>
                                </div>
                                <div class="order-details">
                                    <span class="order-type">${this.escapeHtml(order.order_type || 'Order')}</span>
                                    <span class="order-product">${this.escapeHtml(order.product || '-')}</span>
                                </div>
                                <div class="order-amount">
                                    <span class="order-total">${this.formatCurrency(order.grand_total)}</span>
                                    <span class="order-status status-${this.slugify(order.status)}">${this.escapeHtml(order.status)}</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    ${detail.orders.length > 5 ? `
                        <button class="btn-link view-all-btn" data-orders-url="/app/sales-order?customer=${customer.customer_id}">
                            View all ${detail.orders.length} orders →
                        </button>
                    ` : ''}
                </div>
            ` : ''}

            <!-- Quick Actions -->
            <div class="detail-section quick-actions-bar">
                <div class="last-contact-display" id="last-contact-${customer.customer_id}" style="display: none;">
                    <span class="contact-label">Last contacted:</span>
                    <span class="contact-value"></span>
                </div>
                <button class="btn-action mark-contacted-btn" data-customer-id="${customer.customer_id}" data-customer-name="${this.escapeHtml(customer.customer_name)}">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    Mark as Contacted
                </button>
            </div>

            <!-- Actions -->
            <div class="detail-actions">
                <button class="btn-secondary" data-customer-url="/app/customer/${customer.customer_id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    View in ERPNext
                </button>
                <button class="btn-secondary" data-support-url="/support-dashboard?customer=${customer.customer_id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                    </svg>
                    Support Dashboard
                </button>
                <button class="btn-primary" onclick="window.open('/app/sales-order/new?customer=${customer.customer_id}', '_blank')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    Create Order
                </button>
            </div>
        `;
    }

    closeModal() {
        if (this.modal) {
            this.modal.classList.remove('open');
        }
    }

    async showPriorityBreakdown(customerId) {
        const container = document.querySelector('.priority-breakdown-container');
        const btn = document.querySelector('.view-breakdown-btn');

        if (!container) return;

        // Toggle visibility
        const isHidden = container.style.display === 'none';

        if (!isHidden) {
            // Collapse
            container.style.display = 'none';
            if (btn) btn.textContent = 'View Breakdown →';
            return;
        }

        // Expand and load
        container.style.display = 'block';
        if (btn) btn.textContent = 'Hide Breakdown ↑';

        // Show loading if not already loaded
        if (!container.dataset.loaded) {
            container.innerHTML = `
                <div class="breakdown-loading">
                    <div class="loading-spinner"></div>
                    <span>Loading breakdown...</span>
                </div>
            `;

            try {
                const breakdown = await this.apiCall('support_center.api.retention_dashboard.get_customer_priority_breakdown', {
                    customer_id: customerId
                });

                this.renderPriorityBreakdown(breakdown);
                container.dataset.loaded = 'true';

            } catch (error) {
                console.error('Failed to load priority breakdown:', error);
                container.innerHTML = `
                    <div class="error-state-small">
                        <p>Failed to load priority breakdown.</p>
                        <button class="btn-link" onclick="this.closest('.priority-breakdown-container').dataset.loaded = ''; this.closest('.priority-breakdown-section').querySelector('.view-breakdown-btn').click();">
                            Retry
                        </button>
                    </div>
                `;
            }
        }
    }

    renderPriorityBreakdown(breakdown) {
        const container = document.querySelector('.priority-breakdown-container');
        if (!container) return;

        const getIconSvg = (iconName) => {
            const icons = {
                'dollar-sign': '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="6" x2="12" y2="18"></line><line x1="9" y1="9" x2="9" y2="9"></line><line x1="15" y1="15" x2="15" y2="15"></line>',
                'clock': '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
                'award': '<circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>',
                'activity': '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>'
            };
            return icons[iconName] || icons['activity'];
        };

        const getComponentColor = (name) => {
            const colors = {
                'Revenue at Risk': '#16a34a',
                'Renewal Urgency': '#dc2626',
                'Customer Tier': '#2563eb',
                'Engagement': '#ca8a04'
            };
            return colors[name] || '#737373';
        };

        container.innerHTML = `
            <div class="priority-breakdown-content">
                <p class="breakdown-intro">
                    This score prioritizes customers who need attention. Higher scores indicate higher priority.
                </p>

                <div class="breakdown-components">
                    ${breakdown.components.map(component => `
                        <div class="breakdown-component">
                            <div class="component-header">
                                <div class="component-title">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: ${getComponentColor(component.name)}">
                                        ${getIconSvg(component.icon)}
                                    </svg>
                                    <span class="component-name">${component.name}</span>
                                </div>
                                <div class="component-score">
                                    <strong>${component.score}</strong>
                                    <span class="score-max">/ ${component.max_score}</span>
                                </div>
                            </div>

                            <div class="component-progress">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${component.percentage}%; background-color: ${getComponentColor(component.name)}"></div>
                                </div>
                                <span class="progress-percentage">${Math.round(component.percentage)}%</span>
                            </div>

                            <div class="component-details">
                                <span class="component-tier">${component.tier}</span>
                                <span class="component-explanation">${component.explanation}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="breakdown-summary">
                    <div class="summary-row">
                        <span class="summary-label">Total Priority Score</span>
                        <span class="summary-value">
                            <strong>${breakdown.total_score}</strong> / ${breakdown.max_possible_score}
                            <span class="priority-badge priority-${breakdown.priority_level}">${breakdown.priority_level}</span>
                        </span>
                    </div>
                </div>

                <div class="breakdown-formula">
                    <strong>Formula:</strong> Revenue (40%) + Urgency (35%) + Tier (15%) + Engagement (10%)
                </div>
            </div>
        `;
    }

    showContactDialog(customerId, customerName) {
        // Create a simple dialog to select contact type
        const dialogHtml = `
            <div class="contact-dialog-overlay" id="contact-dialog">
                <div class="contact-dialog">
                    <div class="contact-dialog-header">
                        <h3>Log Contact with ${this.escapeHtml(customerName)}</h3>
                        <button class="contact-dialog-close" onclick="document.getElementById('contact-dialog').remove()">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="contact-dialog-body">
                        <label class="contact-label">Contact Type:</label>
                        <div class="contact-type-buttons">
                            <button class="contact-type-btn" data-type="call">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                </svg>
                                Phone Call
                            </button>
                            <button class="contact-type-btn" data-type="email">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                    <polyline points="22,6 12,13 2,6"></polyline>
                                </svg>
                                Email
                            </button>
                            <button class="contact-type-btn" data-type="meeting">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                                Meeting
                            </button>
                            <button class="contact-type-btn" data-type="other">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="16" x2="12" y2="12"></line>
                                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                </svg>
                                Other
                            </button>
                        </div>

                        <label class="contact-label" style="margin-top: 1rem;">Notes (optional):</label>
                        <textarea id="contact-notes" class="contact-notes" placeholder="Add notes about the interaction..." rows="3"></textarea>
                    </div>
                    <div class="contact-dialog-footer">
                        <button class="btn-secondary" onclick="document.getElementById('contact-dialog').remove()">
                            Cancel
                        </button>
                        <button class="btn-primary" id="contact-submit-btn" disabled>
                            Log Contact
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Add to DOM
        document.body.insertAdjacentHTML('beforeend', dialogHtml);

        const dialog = document.getElementById('contact-dialog');
        let selectedType = null;

        // Handle contact type selection
        dialog.querySelectorAll('.contact-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                dialog.querySelectorAll('.contact-type-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedType = btn.getAttribute('data-type');
                document.getElementById('contact-submit-btn').disabled = false;
            });
        });

        // Handle submit
        document.getElementById('contact-submit-btn').addEventListener('click', () => {
            if (!selectedType) return;

            const notes = document.getElementById('contact-notes').value.trim();
            this.markCustomerContacted(customerId, customerName, selectedType, notes);
            dialog.remove();
        });

        // Close on backdrop click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
            }
        });
    }

    async markCustomerContacted(customerId, customerName, contactType, notes) {
        try {
            // Show loading state
            this.showToast('Logging contact...', 'info');

            const response = await this.apiCall('support_center.api.retention_dashboard.mark_customer_contacted', {
                customer_id: customerId,
                contact_type: contactType,
                notes: notes || null
            });

            if (response && response.success) {
                // Show success message
                this.showToast(`✓ Logged ${contactType} with ${customerName}`, 'success');

                // Update last contact display
                this.updateLastContactDisplay(customerId, response);

                // Optionally refresh client list (commented out to avoid disrupting user flow)
                // this.loadClients();
            }

        } catch (error) {
            console.error('Failed to log contact:', error);
            this.showToast('Failed to log contact. Please try again.', 'error');
        }
    }

    updateLastContactDisplay(customerId, contactInfo) {
        const displayEl = document.getElementById(`last-contact-${customerId}`);
        if (!displayEl) return;

        const valueEl = displayEl.querySelector('.contact-value');
        if (!valueEl) return;

        const timeAgo = this.formatRelativeTime(contactInfo.contacted_at);
        const icon = this.getContactIcon(contactInfo.contact_type);

        valueEl.innerHTML = `
            ${icon}
            <strong>${timeAgo}</strong> by ${this.escapeHtml(contactInfo.contacted_by)}
        `;

        displayEl.style.display = 'flex';

        // Add animation
        displayEl.classList.add('contact-updated');
        setTimeout(() => displayEl.classList.remove('contact-updated'), 2000);
    }

    async loadLastContact(customerId) {
        try {
            const contactInfo = await this.apiCall('support_center.api.retention_dashboard.get_customer_last_contact', {
                customer_id: customerId
            });

            if (contactInfo && contactInfo.contacted_at) {
                this.updateLastContactDisplay(customerId, contactInfo);
            }
        } catch (error) {
            console.error('Failed to load last contact:', error);
            // Silent fail - not critical
        }
    }

    getContactIcon(contactType) {
        const icons = {
            'call': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline; margin-right: 0.25rem;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
            'email': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline; margin-right: 0.25rem;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
            'meeting': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline; margin-right: 0.25rem;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line></svg>',
            'other': ''
        };
        return icons[contactType] || '';
    }

    formatRelativeTime(timestamp) {
        const now = new Date();
        const then = new Date(timestamp);
        const diffMs = now - then;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        return this.formatDate(timestamp);
    }

    async performBackendSearch(query) {
        // Validate query length
        if (query.length < 2) {
            this.showToast('Please enter at least 2 characters to search', 'info');
            return;
        }

        // Show loading state
        this.showSearchLoading();

        try {
            const response = await this.apiCall('support_center.api.retention_dashboard.search_customers', {
                query: query,
                limit: 100
            });

            if (!response || !response.customers) {
                throw new Error('Invalid response from server');
            }

            const { customers, count, has_more } = response;

            if (count === 0) {
                this.showSearchEmpty(query);
                return;
            }

            // Update UI with search results
            this.renderClients(customers);
            this.showSearchResultsCount(count, query, has_more);

            // Hide pagination during search
            const pagination = document.getElementById('clients-pagination');
            if (pagination) {
                pagination.style.display = 'none';
            }

        } catch (error) {
            console.error('Search failed:', error);
            this.showToast('Search failed. Please try again.', 'error');
            this.clearSearch();
        }
    }

    clearSearch() {
        // Reset search input
        if (this.searchInput) {
            this.searchInput.value = '';
        }

        // Hide clear button
        const searchClearBtn = document.getElementById('search-clear-btn');
        if (searchClearBtn) {
            searchClearBtn.style.display = 'none';
        }

        // Clear search results header
        this.clearSearchResultsCount();

        // Reload original client list
        this.loadClients(true);

        // Focus search input
        if (this.searchInput) {
            this.searchInput.focus();
        }
    }

    showSearchLoading() {
        if (!this.clientsTableBody) return;

        this.clientsTableBody.innerHTML = `
            <tr>
                <td colspan="9" class="loading-cell">
                    <div class="loading-spinner"></div>
                    <span>Searching across all customers...</span>
                </td>
            </tr>
        `;
    }

    showSearchEmpty(query) {
        if (!this.clientsTableBody) return;

        this.clientsTableBody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-cell">
                    <div class="empty-state-small">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--muted); margin: 0 auto 1rem;">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <h3 style="margin: 0 0 0.5rem; color: var(--text);">No customers found</h3>
                        <p style="margin: 0; color: var(--muted); font-size: var(--text-sm);">
                            No customers matching "<strong>${this.escapeHtml(query)}</strong>"
                        </p>
                        <p style="margin: 0.5rem 0 0; color: var(--muted-light); font-size: var(--text-xs);">
                            Try searching by name, email, phone, or customer ID
                        </p>
                        <button class="btn-secondary" onclick="document.getElementById('client-search').value = ''; document.getElementById('client-search').dispatchEvent(new Event('input'));" style="margin-top: 1rem;">
                            Clear Search
                        </button>
                    </div>
                </td>
            </tr>
        `;

        this.showSearchResultsCount(0, query, false);
    }

    showSearchResultsCount(count, query, hasMore) {
        const sectionHeader = document.querySelector('.clients-section .section-header h2');
        if (!sectionHeader) return;

        // Remove any existing search badge
        const existingBadge = sectionHeader.querySelector('.search-results-badge');
        if (existingBadge) {
            existingBadge.remove();
        }

        // Create new search results badge
        const badge = document.createElement('span');
        badge.className = 'search-results-badge';
        badge.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 0.25rem;">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            ${count} result${count !== 1 ? 's' : ''} for "${this.escapeHtml(query)}"
            ${hasMore ? ' <span style="color: var(--warning);">(showing first 100)</span>' : ''}
            <button class="search-clear-inline" onclick="document.querySelector('.retention-dashboard').querySelector('#client-search').value = ''; document.querySelector('.retention-dashboard').querySelector('#client-search').dispatchEvent(new Event('input'));" title="Clear search">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;

        sectionHeader.appendChild(badge);
    }

    clearSearchResultsCount() {
        const sectionHeader = document.querySelector('.clients-section .section-header h2');
        if (!sectionHeader) return;

        const existingBadge = sectionHeader.querySelector('.search-results-badge');
        if (existingBadge) {
            existingBadge.remove();
        }

        // Show pagination again
        const pagination = document.getElementById('clients-pagination');
        if (pagination) {
            pagination.style.display = 'block';
        }
    }

    filterClientsLocally(query) {
        // DEPRECATED: This method is no longer used (replaced by performBackendSearch)
        // Kept for backwards compatibility
        if (!query) {
            this.renderClients(this.clients);
            return;
        }

        const lowerQuery = query.toLowerCase();
        const filtered = this.clients.filter(client =>
            (client.customer_name && client.customer_name.toLowerCase().includes(lowerQuery)) ||
            (client.email && client.email.toLowerCase().includes(lowerQuery)) ||
            (client.phone && client.phone.includes(query)) ||
            (client.customer_id && client.customer_id.toLowerCase().includes(lowerQuery))
        );

        this.renderClients(filtered);
    }

    showClientsLoading() {
        if (this.clientsTableBody) {
            this.clientsTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="loading-cell">
                        <div class="loading-spinner"></div>
                        <span>Loading clients...</span>
                    </td>
                </tr>
            `;
        }
    }

    showClientsError() {
        if (this.clientsTableBody) {
            this.clientsTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="error-cell">
                        <span>Failed to load clients. Please try again.</span>
                    </td>
                </tr>
            `;
        }
    }

    showError(message) {
        console.error(message);
        this.showToast(message, 'error');
    }

    showToast(message, type = 'info') {
        // Remove existing toasts
        document.querySelectorAll('.toast-notification').forEach(toast => toast.remove());

        const toast = document.createElement('div');
        toast.className = `toast-notification toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${type === 'error' ?
                        '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>' :
                        type === 'success' ?
                        '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>' :
                        '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>'
                    }
                </svg>
                <span class="toast-message">${this.escapeHtml(message)}</span>
                <button class="toast-close" aria-label="Close">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;

        document.body.appendChild(toast);

        // Close button handler
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 300);
        });

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('hiding');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }

    // ==========================================
    // Trend Charts Methods
    // ==========================================

    async loadTrendData() {
        try {
            const trendData = await this.apiCall('support_center.api.retention_dashboard.get_trend_data', {
                months: this.chartMonths
            });
            this.renderCharts(trendData);
        } catch (error) {
            console.error('Failed to load trend data:', error);
        }
    }

    renderCharts(data) {
        if (!data || data.length === 0) return;

        const labels = data.map(d => d.short_label);

        // Chart.js default options
        const defaultOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: { size: 13 },
                    bodyFont: { size: 12 },
                    cornerRadius: 6
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#737373', font: { size: 11 } }
                },
                y: {
                    grid: { color: '#f5f5f5' },
                    ticks: { color: '#737373', font: { size: 11 } }
                }
            }
        };

        // Renewal Rate Line Chart
        this.renderRenewalRateChart(labels, data, defaultOptions);

        // Orders Comparison Bar Chart
        this.renderOrdersComparisonChart(labels, data, defaultOptions);

        // Revenue Trend Chart
        this.renderRevenueTrendChart(labels, data, defaultOptions);
    }

    renderRenewalRateChart(labels, data, defaultOptions) {
        const ctx = document.getElementById('renewal-rate-chart');
        if (!ctx) return;

        if (this.renewalRateChart) {
            this.renewalRateChart.destroy();
        }

        this.renewalRateChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Renewal Rate',
                    data: data.map(d => d.renewal_rate),
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#2563eb',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                ...defaultOptions,
                plugins: {
                    ...defaultOptions.plugins,
                    tooltip: {
                        ...defaultOptions.plugins.tooltip,
                        callbacks: {
                            label: (context) => `Renewal Rate: ${context.raw}%`
                        }
                    }
                },
                scales: {
                    ...defaultOptions.scales,
                    y: {
                        ...defaultOptions.scales.y,
                        min: 0,
                        max: 100,
                        ticks: {
                            ...defaultOptions.scales.y.ticks,
                            callback: (value) => value + '%'
                        }
                    }
                }
            }
        });
    }

    renderOrdersComparisonChart(labels, data, defaultOptions) {
        const ctx = document.getElementById('orders-comparison-chart');
        if (!ctx) return;

        if (this.ordersComparisonChart) {
            this.ordersComparisonChart.destroy();
        }

        this.ordersComparisonChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Renewals',
                        data: data.map(d => d.renewal_count),
                        backgroundColor: '#16a34a',
                        borderRadius: 4,
                        barPercentage: 0.7,
                        categoryPercentage: 0.8
                    },
                    {
                        label: 'New Orders',
                        data: data.map(d => d.new_count),
                        backgroundColor: '#2563eb',
                        borderRadius: 4,
                        barPercentage: 0.7,
                        categoryPercentage: 0.8
                    }
                ]
            },
            options: {
                ...defaultOptions,
                plugins: {
                    ...defaultOptions.plugins,
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 16,
                            font: { size: 11 }
                        }
                    }
                },
                scales: {
                    ...defaultOptions.scales,
                    y: {
                        ...defaultOptions.scales.y,
                        beginAtZero: true
                    }
                }
            }
        });
    }

    renderRevenueTrendChart(labels, data, defaultOptions) {
        const ctx = document.getElementById('revenue-trend-chart');
        if (!ctx) return;

        if (this.revenueTrendChart) {
            this.revenueTrendChart.destroy();
        }

        this.revenueTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Total Revenue',
                        data: data.map(d => d.total_revenue),
                        borderColor: '#171717',
                        backgroundColor: 'rgba(23, 23, 23, 0.05)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.3,
                        pointBackgroundColor: '#171717',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Renewal Revenue',
                        data: data.map(d => d.renewal_revenue),
                        borderColor: '#16a34a',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.3,
                        pointBackgroundColor: '#16a34a',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5
                    },
                    {
                        label: 'New Revenue',
                        data: data.map(d => d.new_revenue),
                        borderColor: '#2563eb',
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [5, 5],
                        fill: false,
                        tension: 0.3,
                        pointBackgroundColor: '#2563eb',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 3,
                        pointHoverRadius: 5
                    }
                ]
            },
            options: {
                ...defaultOptions,
                plugins: {
                    ...defaultOptions.plugins,
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 16,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        ...defaultOptions.plugins.tooltip,
                        callbacks: {
                            label: (context) => `${context.dataset.label}: ${this.formatCurrency(context.raw)}`
                        }
                    }
                },
                scales: {
                    ...defaultOptions.scales,
                    y: {
                        ...defaultOptions.scales.y,
                        beginAtZero: true,
                        ticks: {
                            ...defaultOptions.scales.y.ticks,
                            callback: (value) => this.formatCurrencyCompact(value)
                        }
                    }
                }
            }
        });
    }

    // ==========================================
    // Calendar Methods
    // ==========================================

    async loadCalendarData() {
        const calendarGrid = document.getElementById('calendar-grid');
        const monthLabel = document.getElementById('calendar-month-label');

        if (monthLabel) {
            monthLabel.textContent = 'Loading...';
        }

        // Generate cache key
        const cacheKey = `${this.calendarYear}-${this.calendarMonth}`;

        // Check cache first
        if (this.calendarCache && this.calendarCache[cacheKey]) {
            this.renderCalendar(this.calendarCache[cacheKey]);
            return;
        }

        // Cancel previous request if still pending
        if (this.pendingCalendarRequest) {
            this.pendingCalendarRequest.cancelled = true;
        }

        // Create new request tracker
        const requestTracker = { cancelled: false };
        this.pendingCalendarRequest = requestTracker;

        try {
            const calendarData = await this.apiCall('support_center.api.retention_dashboard.get_calendar_view_data', {
                year: this.calendarYear,
                month: this.calendarMonth
            });

            // Check if request was cancelled (race condition protection)
            if (requestTracker.cancelled) {
                return;
            }

            // Cache the result
            if (!this.calendarCache) {
                this.calendarCache = {};
            }
            this.calendarCache[cacheKey] = calendarData;

            // Limit cache size to last 6 months
            const cacheKeys = Object.keys(this.calendarCache);
            if (cacheKeys.length > 6) {
                delete this.calendarCache[cacheKeys[0]];
            }

            this.renderCalendar(calendarData);
        } catch (error) {
            if (requestTracker.cancelled) return;

            console.error('Failed to load calendar data:', error);
            if (monthLabel) {
                const monthNames = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
                monthLabel.textContent = `${monthNames[this.calendarMonth - 1]} ${this.calendarYear}`;
            }
            if (calendarGrid) {
                calendarGrid.innerHTML = `
                    <div class="calendar-error">
                        <span>Failed to load calendar. Please try again.</span>
                    </div>
                `;
            }
        } finally {
            if (this.pendingCalendarRequest === requestTracker) {
                this.pendingCalendarRequest = null;
            }
        }
    }

    renderCalendar(data) {
        const calendarGrid = document.getElementById('calendar-grid');
        const monthLabel = document.getElementById('calendar-month-label');

        if (monthLabel) {
            monthLabel.textContent = data.month_name;
        }

        // Update summary
        this.setKPIValue('cal-total-renewals', this.formatNumber(data.summary.total_renewals));
        this.setKPIValue('cal-total-value', this.formatCurrency(data.summary.total_value));
        this.setKPIValue('cal-high-value', this.formatNumber(data.summary.high_value_count));

        if (!calendarGrid) return;

        // Remove old event listener if exists
        if (this.calendarClickHandler) {
            calendarGrid.removeEventListener('click', this.calendarClickHandler);
        }

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const firstDay = new Date(data.first_day);
        const daysInMonth = data.days_in_month;

        // Get the day of the week for the first day (0 = Sunday, adjust for Monday start)
        let startDay = firstDay.getDay();
        startDay = startDay === 0 ? 6 : startDay - 1; // Convert to Monday = 0

        // Use DocumentFragment for efficient DOM construction
        const fragment = document.createDocumentFragment();
        const htmlParts = []; // Use array for faster string building

        // Add empty cells for days before the first of the month
        for (let i = 0; i < startDay; i++) {
            htmlParts.push('<div class="calendar-day calendar-day-empty"></div>');
        }

        // Add days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${data.year}-${String(data.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayData = data.renewals_by_date[dateStr];
            const isToday = dateStr === todayStr;
            const isPast = new Date(dateStr) < new Date(todayStr);

            const dayClasses = ['calendar-day'];
            if (isToday) dayClasses.push('calendar-day-today');
            if (isPast) dayClasses.push('calendar-day-past');
            if (dayData && dayData.count > 0) dayClasses.push('calendar-day-has-renewals');

            htmlParts.push(`<div class="${dayClasses.join(' ')}" data-date="${dateStr}">`);
            htmlParts.push(`<span class="calendar-day-number">${day}</span>`);

            if (dayData && dayData.count > 0) {
                htmlParts.push('<div class="calendar-day-renewals">');

                // Show up to 3 renewals with dots
                const renewalsToShow = dayData.renewals.slice(0, 3);
                renewalsToShow.forEach(renewal => {
                    const riskClass = `renewal-${renewal.risk_level}`;
                    htmlParts.push(
                        `<div class="calendar-renewal ${riskClass}" data-customer-id="${this.escapeHtml(renewal.customer_id)}" title="${this.escapeHtml(renewal.customer_name)} - ${this.formatCurrency(renewal.annual_value)}">`,
                        '<span class="renewal-dot"></span>',
                        `<span class="renewal-name">${this.escapeHtml(this.truncate(renewal.customer_name, 12))}</span>`,
                        '</div>'
                    );
                });

                // Show "+X more" if there are more renewals
                if (dayData.count > 3) {
                    htmlParts.push(`<div class="calendar-more">+${dayData.count - 3} more</div>`);
                }

                htmlParts.push('</div>');
            }

            htmlParts.push('</div>');
        }

        // Add empty cells to complete the last week
        const totalCells = startDay + daysInMonth;
        const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let i = 0; i < remainingCells; i++) {
            htmlParts.push('<div class="calendar-day calendar-day-empty"></div>');
        }

        // Single DOM write with array.join (faster than string concatenation)
        calendarGrid.innerHTML = htmlParts.join('');

        // Store renewals data for event delegation
        this.calendarData = data;

        // Event delegation - single listener for entire calendar
        this.calendarClickHandler = (e) => {
            // Handle renewal click
            const renewalEl = e.target.closest('.calendar-renewal');
            if (renewalEl) {
                e.stopPropagation();
                const customerId = renewalEl.dataset.customerId;
                if (customerId) {
                    this.showClientDetail(customerId);
                }
                return;
            }

            // Handle day click
            const dayEl = e.target.closest('.calendar-day-has-renewals');
            if (dayEl && !e.target.closest('.calendar-renewal')) {
                const dateStr = dayEl.dataset.date;
                const dayData = data.renewals_by_date[dateStr];
                if (dayData) {
                    this.showDayDetail(dateStr, dayData);
                }
            }
        };

        calendarGrid.addEventListener('click', this.calendarClickHandler);
    }

    showDayDetail(dateStr, dayData) {
        if (!dayData || !this.modal) return;

        this.modal.classList.add('open');
        const date = new Date(dateStr);
        const formattedDate = date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        document.getElementById('modal-customer-name').textContent = `Renewals on ${formattedDate}`;
        document.getElementById('modal-customer-id').textContent = `${dayData.count} renewal${dayData.count > 1 ? 's' : ''} - ${this.formatCurrency(dayData.total_value)} total`;

        const renewalsHtml = dayData.renewals.map(renewal => {
            const riskClass = renewal.risk_level === 'high' ? 'danger' : renewal.risk_level === 'medium' ? 'warning' : 'info';
            return `
                <div class="renewal-list-item" data-customer-id="${this.escapeHtml(renewal.customer_id)}">
                    <div class="renewal-item-left">
                        <span class="renewal-item-indicator risk-${renewal.risk_level}"></span>
                        <div class="renewal-item-info">
                            <span class="renewal-item-name">${this.escapeHtml(renewal.customer_name)}</span>
                            <span class="renewal-item-status">${renewal.status}</span>
                        </div>
                    </div>
                    <div class="renewal-item-right">
                        <span class="renewal-item-value">${this.formatCurrency(renewal.annual_value)}</span>
                        <button class="btn-secondary btn-small view-customer-btn" data-customer-id="${this.escapeHtml(renewal.customer_id)}">
                            View
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('modal-body').innerHTML = `
            <div class="detail-section">
                <div class="renewals-list-container">
                    ${renewalsHtml}
                </div>
            </div>
        `;

        // Add click handlers
        document.querySelectorAll('.view-customer-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const customerId = btn.dataset.customerId;
                this.showClientDetail(customerId);
            });
        });

        document.querySelectorAll('.renewal-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const customerId = item.dataset.customerId;
                this.showClientDetail(customerId);
            });
        });
    }

    truncate(str, length) {
        if (!str) return '';
        return str.length > length ? str.substring(0, length) + '...' : str;
    }

    formatCurrencyCompact(amount) {
        if (amount >= 1000000) {
            return '$' + (amount / 1000000).toFixed(1) + 'M';
        } else if (amount >= 1000) {
            return '$' + (amount / 1000).toFixed(0) + 'K';
        }
        return '$' + amount;
    }

    // Utility methods
    getStatusLabel(status) {
        const labels = {
            'overdue': 'Overdue',
            'due_soon': 'Due Soon',
            'active': 'Active',
            'unknown': 'Unknown'
        };
        return labels[status] || status || 'Unknown';
    }

    formatNumber(num) {
        return new Intl.NumberFormat('en-US').format(num || 0);
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    slugify(text) {
        if (!text) return '';
        return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getCsrfToken() {
        return frappe.boot?.csrf_token || frappe.csrf_token || '';
    }

    async apiCall(method, args) {
        try {
            const response = await fetch(`/api/method/${method}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Frappe-CSRF-Token': this.getCsrfToken()
                },
                body: JSON.stringify(args)
            });

            // Handle HTTP errors
            if (!response.ok) {
                if (response.status === 403) {
                    throw new Error('You do not have permission to access this data.');
                }
                if (response.status === 401) {
                    this.showToast('Your session has expired. Redirecting to login...', 'error');
                    setTimeout(() => window.location.href = '/login', 2000);
                    throw new Error('Session expired');
                }
                if (response.status === 404) {
                    throw new Error('The requested resource was not found.');
                }
                if (response.status >= 500) {
                    throw new Error('Server error. Please try again later.');
                }

                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Request failed: ${response.statusText}`);
            }

            const data = await response.json();

            // Handle Frappe-specific errors
            if (data.exc) {
                const serverMessages = data._server_messages;
                if (serverMessages) {
                    try {
                        const messages = JSON.parse(serverMessages);
                        const parsed = JSON.parse(messages[0]);
                        throw new Error(parsed.message || 'An error occurred on the server.');
                    } catch (e) {
                        throw new Error('An error occurred while processing your request.');
                    }
                }
                throw new Error('An error occurred on the server.');
            }

            return data.message;

        } catch (error) {
            console.error('API Error:', method, error);
            // Don't show toast here - let the calling code handle it
            throw error;
        }
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new RetentionDashboard();
});
