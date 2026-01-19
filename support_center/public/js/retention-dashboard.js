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

        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.showError('Failed to load dashboard data. Please refresh the page.');
        }
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
        // Primary KPIs
        this.setKPIValue('kpi-total-customers', this.formatNumber(kpis.total_customers));
        this.setKPIValue('kpi-at-risk', this.formatNumber(kpis.clients_at_risk));
        this.setKPIValue('kpi-renewal-revenue', this.formatCurrency(kpis.revenue_up_for_renewal));
        this.setKPIValue('kpi-upsell-potential', this.formatCurrency(kpis.potential_upsell_value));

        // Secondary KPIs
        this.setKPIValue('kpi-renewal-rate', `${kpis.renewal_rate || 0}%`);
        this.setKPIValue('kpi-avg-ltv', this.formatCurrency(kpis.avg_customer_lifetime_value));
        this.setKPIValue('kpi-renewals-month', this.formatNumber(kpis.total_renewals_this_month));
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
