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
        this.refreshBtn = document.getElementById('refresh-btn');

        this.currentFilter = '';
        this.clients = [];
        this.searchTimeout = null;

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

    initializeEventListeners() {
        // Refresh button
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.loadDashboard());
        }

        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter || '';
                this.loadClients();
            });
        });

        // Search input
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.filterClientsLocally(e.target.value.trim());
                }, 300);
            });
        }

        // Modal close handlers
        this.modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => this.closeModal());
        this.modal?.querySelector('#modal-close')?.addEventListener('click', () => this.closeModal());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.searchInput?.focus();
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

        // Quick action cards
        document.querySelectorAll('.quick-action-card').forEach(card => {
            card.addEventListener('click', () => {
                const targetTab = card.dataset.tabTarget;
                if (targetTab) {
                    this.switchTab(targetTab);
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
    }

    switchTab(tabName) {
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
        try {
            // Load KPIs, clients, and product analysis in parallel
            const [kpis, clients, products] = await Promise.all([
                this.apiCall('support_center.api.retention_dashboard.get_dashboard_kpis', {}),
                this.apiCall('support_center.api.retention_dashboard.get_clients_by_renewal_status', {
                    status_filter: this.currentFilter || null,
                    limit: 50
                }),
                this.apiCall('support_center.api.retention_dashboard.get_product_retention_analysis', {})
            ]);

            this.renderKPIs(kpis);
            this.clients = clients;
            this.renderClients(clients);
            this.renderProductAnalysis(products);

            // Render at-risk clients for overview tab
            this.renderAtRiskClients(clients);

            // Load trend charts and calendar data based on current tab
            if (this.currentTab === 'analytics') {
                this.loadTrendData();
            }
            if (this.currentTab === 'calendar') {
                this.loadCalendarData();
            }

        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.showError('Failed to load dashboard data. Please refresh the page.');
        }
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

    async loadClients() {
        this.showClientsLoading();

        try {
            const clients = await this.apiCall('support_center.api.retention_dashboard.get_clients_by_renewal_status', {
                status_filter: this.currentFilter || null,
                limit: 50
            });

            this.clients = clients;
            this.renderClients(clients);

        } catch (error) {
            console.error('Failed to load clients:', error);
            this.showClientsError();
        }
    }

    renderKPIs(kpis) {
        const comparisons = kpis.comparisons || {};

        // Primary KPIs with comparison indicators
        this.setKPIValue('kpi-total-customers', this.formatNumber(kpis.total_customers));
        this.setKPIComparison('kpi-total-customers', comparisons.customers);

        this.setKPIValue('kpi-at-risk', this.formatNumber(kpis.clients_at_risk));
        this.setKPIComparison('kpi-at-risk', comparisons.at_risk, true); // Inverted (down is good)

        this.setKPIValue('kpi-renewal-revenue', this.formatCurrency(kpis.revenue_up_for_renewal));
        this.setKPIComparison('kpi-renewal-revenue', comparisons.renewal_revenue);

        this.setKPIValue('kpi-upsell-potential', this.formatCurrency(kpis.potential_upsell_value));

        // Secondary KPIs with comparison indicators
        this.setKPIValue('kpi-renewal-rate', `${kpis.renewal_rate || 0}%`);
        this.setKPIComparison('kpi-renewal-rate', comparisons.renewal_rate);

        this.setKPIValue('kpi-avg-ltv', this.formatCurrency(kpis.avg_customer_lifetime_value));

        this.setKPIValue('kpi-renewals-month', this.formatNumber(kpis.total_renewals_this_month));
        this.setKPIComparison('kpi-renewals-month', comparisons.renewals_count);
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
                    <td colspan="7" class="empty-cell">
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
                <td class="actions-cell">
                    <button class="action-btn view-detail-btn" data-customer-id="${this.escapeHtml(client.customer_id)}" title="View Details">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                    <button class="action-btn open-erpnext-btn" data-customer-id="${this.escapeHtml(client.customer_id)}" title="Open in ERPNext">
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

        try {
            const detail = await this.apiCall('support_center.api.retention_dashboard.get_client_retention_detail', {
                customer_id: customerId
            });

            this.renderClientDetailModal(detail);

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
                            <span class="overview-value">${customer.email || '-'}</span>
                        </div>
                        <div class="overview-item">
                            <span class="overview-label">Phone</span>
                            <span class="overview-value">${customer.phone || '-'}</span>
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
                            <div class="order-row" onclick="window.open('/app/sales-order/${order.order_id}', '_blank')">
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
                        <button class="btn-link view-all-btn" onclick="window.open('/app/sales-order?customer=${customer.customer_id}', '_blank')">
                            View all ${detail.orders.length} orders →
                        </button>
                    ` : ''}
                </div>
            ` : ''}

            <!-- Actions -->
            <div class="detail-actions">
                <button class="btn-secondary" onclick="window.open('/app/customer/${customer.customer_id}', '_blank')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    View in ERPNext
                </button>
                <button class="btn-secondary" onclick="window.location.href='/support-dashboard?customer=${customer.customer_id}'">
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

    filterClientsLocally(query) {
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

        try {
            const calendarData = await this.apiCall('support_center.api.retention_dashboard.get_calendar_view_data', {
                year: this.calendarYear,
                month: this.calendarMonth
            });
            this.renderCalendar(calendarData);
        } catch (error) {
            console.error('Failed to load calendar data:', error);
            if (calendarGrid) {
                calendarGrid.innerHTML = `
                    <div class="calendar-error">
                        <span>Failed to load calendar. Please try again.</span>
                    </div>
                `;
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

        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const firstDay = new Date(data.first_day);
        const daysInMonth = data.days_in_month;

        // Get the day of the week for the first day (0 = Sunday, adjust for Monday start)
        let startDay = firstDay.getDay();
        startDay = startDay === 0 ? 6 : startDay - 1; // Convert to Monday = 0

        let html = '';

        // Add empty cells for days before the first of the month
        for (let i = 0; i < startDay; i++) {
            html += '<div class="calendar-day calendar-day-empty"></div>';
        }

        // Add days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${data.year}-${String(data.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayData = data.renewals_by_date[dateStr];
            const isToday = dateStr === todayStr;
            const isPast = new Date(dateStr) < new Date(todayStr);

            let dayClass = 'calendar-day';
            if (isToday) dayClass += ' calendar-day-today';
            if (isPast) dayClass += ' calendar-day-past';
            if (dayData && dayData.count > 0) dayClass += ' calendar-day-has-renewals';

            html += `<div class="${dayClass}" data-date="${dateStr}">`;
            html += `<span class="calendar-day-number">${day}</span>`;

            if (dayData && dayData.count > 0) {
                html += '<div class="calendar-day-renewals">';

                // Show up to 3 renewals with dots
                const renewalsToShow = dayData.renewals.slice(0, 3);
                renewalsToShow.forEach(renewal => {
                    const riskClass = `renewal-${renewal.risk_level}`;
                    html += `
                        <div class="calendar-renewal ${riskClass}"
                             data-customer-id="${this.escapeHtml(renewal.customer_id)}"
                             title="${this.escapeHtml(renewal.customer_name)} - ${this.formatCurrency(renewal.annual_value)}">
                            <span class="renewal-dot"></span>
                            <span class="renewal-name">${this.escapeHtml(this.truncate(renewal.customer_name, 12))}</span>
                        </div>
                    `;
                });

                // Show "+X more" if there are more renewals
                if (dayData.count > 3) {
                    html += `<div class="calendar-more">+${dayData.count - 3} more</div>`;
                }

                html += '</div>';
            }

            html += '</div>';
        }

        // Add empty cells to complete the last week
        const totalCells = startDay + daysInMonth;
        const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let i = 0; i < remainingCells; i++) {
            html += '<div class="calendar-day calendar-day-empty"></div>';
        }

        calendarGrid.innerHTML = html;

        // Add click handlers for renewals
        calendarGrid.querySelectorAll('.calendar-renewal').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const customerId = el.dataset.customerId;
                if (customerId) {
                    this.showClientDetail(customerId);
                }
            });
        });

        // Add click handlers for days with renewals
        calendarGrid.querySelectorAll('.calendar-day-has-renewals').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.classList.contains('calendar-renewal') || e.target.closest('.calendar-renewal')) {
                    return; // Don't trigger day click if clicking on a renewal
                }
                const dateStr = el.dataset.date;
                this.showDayDetail(dateStr, data.renewals_by_date[dateStr]);
            });
        });
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

    async apiCall(method, args) {
        const response = await fetch(`/api/method/${method}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Frappe-CSRF-Token': window.frappe?.csrf_token || ''
            },
            body: JSON.stringify(args)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `API call failed: ${response.statusText}`);
        }

        const data = await response.json();
        return data.message;
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new RetentionDashboard();
});
