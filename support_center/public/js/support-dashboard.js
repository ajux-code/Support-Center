/**
 * Customer Support Dashboard
 * Fast customer lookup and support workflow interface
 */

class SupportDashboard {
    constructor() {
        this.searchInput = document.getElementById('customer-search');
        this.suggestionsBox = document.getElementById('search-suggestions');
        this.contentContainer = document.getElementById('dashboard-content');
        this.currentCustomer = null;
        this.currentRecord = null;
        this.currentRecordType = null;
        this.searchTimeout = null;
        this.showingCustomerList = true;
        this.currentOrders = [];
        this.ordersSortField = 'transaction_date';
        this.ordersSortDirection = 'desc'; // Default: most recent first

        // Pagination state - customer list (shadcn-style)
        this.customerListPage = 1;  // 1-indexed for display
        this.customerListPageSize = 20;
        this.customerListTotalCount = 0;
        this.customerListTotalPages = 0;
        this.customerListQuery = '';
        this.isLoadingPage = false;

        // Category filter state
        this.currentCategory = 'all';  // 'all', 'customer', 'contact', 'booking', 'order'
        this.categoryCounts = {};  // Counts per category for tab badges

        // Pagination state - orders in detail view
        this.ordersPageSize = 10;
        this.ordersLoaded = 0;
        this.ordersHasMore = false;

        // Pagination state - timeline in detail view
        this.timelinePageSize = 15;
        this.timelineLoaded = 0;
        this.timelineHasMore = false;

        this.paletteActiveIndex = 0;

        this.initializeEventListeners();
        this.setupKeyboardShortcuts();
        this.initializeCategoryTabs();
        this.initializeCommandPalette();
        this.initializeFromURL();

        // Check if we should load a specific record (from URL query param)
        if (window.DASHBOARD_VIEW_MODE === 'detail' && window.DASHBOARD_RECORD_ID) {
            const recordType = window.DASHBOARD_RECORD_TYPE || 'customer';
            this.loadRecordDetail(window.DASHBOARD_RECORD_ID, recordType);
        } else {
            this.loadCustomerList();
            this.loadCategoryCounts();
        }
    }

    /**
     * Initialize category filter state from URL parameters
     */
    initializeFromURL() {
        const urlParams = new URLSearchParams(window.location.search);
        const category = urlParams.get('category');
        const search = urlParams.get('q');

        if (category && ['all', 'contact', 'customer', 'booking', 'ticket'].includes(category)) {
            this.currentCategory = category;
            this.updateCategoryTabUI(category);
        }

        if (search) {
            this.customerListQuery = search;
            this.searchInput.value = search;
        }
    }

    /**
     * Update URL with current filter state (without page reload)
     */
    updateURL() {
        const url = new URL(window.location);

        if (this.currentCategory && this.currentCategory !== 'all') {
            url.searchParams.set('category', this.currentCategory);
        } else {
            url.searchParams.delete('category');
        }

        if (this.customerListQuery) {
            url.searchParams.set('q', this.customerListQuery);
        } else {
            url.searchParams.delete('q');
        }

        window.history.pushState({}, '', url);
    }

    /**
     * Initialize category tab click listeners
     */
    initializeCategoryTabs() {
        const tabs = document.querySelectorAll('.category-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const category = tab.dataset.category;
                this.setCategory(category);
            });
        });
    }

    /**
     * Set the active category and reload data
     */
    setCategory(category) {
        if (this.currentCategory === category) return;

        this.currentCategory = category;
        this.customerListPage = 1;  // Reset to first page
        this.updateCategoryTabUI(category);
        this.updateURL();
        this.updateResultsHeader();

        if (this.customerListQuery) {
            this.filterCustomerList(this.customerListQuery);
        } else {
            this.loadCustomerList();
        }
    }

    /**
     * Update category tab UI to show active state
     */
    updateCategoryTabUI(activeCategory) {
        const tabs = document.querySelectorAll('.category-tab');
        tabs.forEach(tab => {
            const isActive = tab.dataset.category === activeCategory;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    /**
     * Update results header based on current category
     */
    updateResultsHeader() {
        const titleEl = document.getElementById('results-title');
        if (!titleEl) return;

        const categoryLabels = {
            'all': 'All Records',
            'contact': 'Customers',       // Contact doctype = "Customers" tab
            'customer': 'Sales Orders',   // Customer doctype = "Sales Orders" tab
            'booking': 'Meeting Bookings', // MM Meeting Booking = "Meeting Bookings" tab
            'ticket': 'Support Tickets'   // Issue doctype = "Support Tickets" tab
        };

        titleEl.textContent = categoryLabels[this.currentCategory] || 'All Records';
    }

    /**
     * Load counts for each category to display in tab badges
     */
    async loadCategoryCounts() {
        try {
            const response = await this.apiCall('support_center.api.customer_lookup.get_category_counts', {
                query: this.customerListQuery || ''
            });

            this.categoryCounts = response || {};
            this.updateCategoryCountBadges();
        } catch (error) {
            console.error('Failed to load category counts:', error);
        }
    }

    /**
     * Update the count badges on category tabs
     */
    updateCategoryCountBadges() {
        const countElements = document.querySelectorAll('.tab-count');
        let totalCount = 0;

        countElements.forEach(el => {
            const category = el.dataset.count;
            if (category === 'all') {
                // Calculate total from all categories
                totalCount = Object.values(this.categoryCounts).reduce((sum, count) => sum + count, 0);
                el.textContent = totalCount > 0 ? totalCount : '-';
            } else {
                const count = this.categoryCounts[category] || 0;
                el.textContent = count > 0 ? count : '-';
            }
        });
    }

    initializeEventListeners() {
        // Debounced search
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(this.searchTimeout);
            const query = e.target.value.trim();

            // Always hide dropdown suggestions
            this.suggestionsBox.style.display = 'none';

            if (query.length === 0) {
                // Clear search - reset pagination and reload full customer list
                if (this.showingCustomerList) {
                    this.customerListPage = 1;
                    this.customerListQuery = '';
                    this.updateURL();
                    this.loadCustomerList();
                    this.loadCategoryCounts();
                }
                return;
            }

            if (query.length < 2) {
                return;
            }

            // Only filter the table, no dropdown suggestions
            this.searchTimeout = setTimeout(() => {
                if (this.showingCustomerList) {
                    // Reset to page 1 for new search
                    this.customerListPage = 1;
                    this.filterCustomerList(query);
                }
            }, 300);
        });

        // Hide suggestions on blur (with delay for click)
        this.searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                this.suggestionsBox.style.display = 'none';
            }, 200);
        });

        // Show suggestions on focus if they exist
        this.searchInput.addEventListener('focus', () => {
            if (this.suggestionsBox.children.length > 0) {
                this.suggestionsBox.style.display = 'block';
            }
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // ⌘+K or Ctrl+K to toggle command palette
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                this.toggleCommandPalette();
                return;
            }

            // / to focus search (unless in an input or palette is open)
            if (e.key === '/' && !this.isInputFocused()) {
                const palette = document.getElementById('command-palette');
                if (!palette || !palette.classList.contains('open')) {
                    e.preventDefault();
                    this.searchInput.focus();
                    this.searchInput.select();
                }
            }

            // Escape: close palette first, then clear search
            if (e.key === 'Escape') {
                const palette = document.getElementById('command-palette');
                if (palette && palette.classList.contains('open')) {
                    this.closeCommandPalette();
                    return;
                }
                if (this.searchInput.matches(':focus')) {
                    this.searchInput.value = '';
                    this.suggestionsBox.style.display = 'none';
                    this.searchInput.blur();
                }
            }
        });
    }

    isInputFocused() {
        const activeElement = document.activeElement;
        return activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.isContentEditable
        );
    }

    async performSearch(query) {
        try {
            this.showSearchLoading();

            const results = await this.apiCall('support_center.api.customer_lookup.search_customers', {
                query: query,
                limit: 10
            });

            this.renderSuggestions(results);
        } catch (error) {
            console.error('Search failed:', error);
            this.showSearchError();
        }
    }

    showSearchLoading() {
        this.suggestionsBox.innerHTML = '<div class="search-loading">Searching...</div>';
        this.suggestionsBox.style.display = 'block';
    }

    showSearchError() {
        this.suggestionsBox.innerHTML = '<div class="search-error">Search failed. Please try again.</div>';
        this.suggestionsBox.style.display = 'block';
    }

    renderSuggestions(results) {
        this.suggestionsBox.innerHTML = '';

        if (results.length === 0) {
            this.suggestionsBox.innerHTML = '<div class="no-results">No results found</div>';
            this.suggestionsBox.style.display = 'block';
            return;
        }

        results.forEach(result => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';

            if (result.type === 'customer') {
                item.innerHTML = `
                    <div class="suggestion-icon">👤</div>
                    <div class="suggestion-details">
                        <div class="suggestion-name">${this.escapeHtml(result.name)}</div>
                        <div class="suggestion-meta">${this.escapeHtml(result.email || result.phone || result.id)}</div>
                    </div>
                `;
                item.addEventListener('click', () => this.loadCustomer(result.id));
            } else if (result.type === 'order') {
                item.innerHTML = `
                    <div class="suggestion-icon">📦</div>
                    <div class="suggestion-details">
                        <div class="suggestion-name">${this.escapeHtml(result.order_id)}</div>
                        <div class="suggestion-meta">${this.escapeHtml(result.customer_name)} - ${this.formatCurrency(result.amount)}</div>
                    </div>
                `;
                item.addEventListener('click', () => this.loadCustomer(result.customer_id));
            }

            this.suggestionsBox.appendChild(item);
        });

        this.suggestionsBox.style.display = 'block';
    }

    loadCustomer(customerId) {
        // Navigate to dedicated customer detail page, preserving search state
        const url = new URL('/support-center', window.location.origin);
        url.searchParams.set('customer', customerId);

        if (this.customerListQuery) {
            url.searchParams.set('q', this.customerListQuery);
        }
        if (this.currentCategory && this.currentCategory !== 'all') {
            url.searchParams.set('category', this.currentCategory);
        }

        window.location.href = url.toString();
    }

    loadRecord(recordId, recordType) {
        // Navigate to dedicated record detail page, preserving search/category state
        const paramMap = {
            'customer': 'customer',
            'booking': 'booking',
            'contact': 'contact',
            'user': 'user',
            'ticket': 'ticket'
        };
        const param = paramMap[recordType] || 'customer';
        const url = new URL('/support-center', window.location.origin);
        url.searchParams.set(param, recordId);

        // Preserve search and category so back-navigation restores state
        if (this.customerListQuery) {
            url.searchParams.set('q', this.customerListQuery);
        }
        if (this.currentCategory && this.currentCategory !== 'all') {
            url.searchParams.set('category', this.currentCategory);
        }

        window.location.href = url.toString();
    }

    async loadRecordDetail(recordId, recordType) {
        // Route to appropriate detail loader based on record type
        switch (recordType) {
            case 'customer':
                await this.loadCustomerDetail(recordId);
                break;
            case 'booking':
                await this.loadBookingDetail(recordId);
                break;
            case 'contact':
                await this.loadContactDetail(recordId);
                break;
            case 'user':
                await this.loadUserDetail(recordId);
                break;
            case 'ticket':
                await this.loadTicketDetail(recordId);
                break;
            default:
                await this.loadCustomerDetail(recordId);
        }
    }

    async loadCustomerDetail(customerId) {
        // Load customer detail view directly (when page loads with ?customer= param)
        this.showingCustomerList = false;
        this.currentRecordType = 'customer';

        // Reset pagination state for orders and timeline
        this.ordersLoaded = 0;
        this.ordersHasMore = false;
        this.timelineLoaded = 0;
        this.timelineHasMore = false;

        // Show skeleton loading state
        this.contentContainer.innerHTML = this.renderDetailSkeleton();

        try {
            // Parallel API calls for maximum speed
            // Fetch one extra to check if there are more
            const [customerData, orders, timeline] = await Promise.all([
                this.apiCall('support_center.api.customer_lookup.get_customer_details', {
                    customer_id: customerId
                }),
                this.apiCall('support_center.api.customer_lookup.get_customer_orders', {
                    customer_id: customerId,
                    limit: this.ordersPageSize + 1
                }),
                this.apiCall('support_center.api.customer_lookup.get_unified_timeline', {
                    customer_id: customerId,
                    limit: this.timelinePageSize + 1
                })
            ]);

            // Check if there are more orders
            this.ordersHasMore = orders.length > this.ordersPageSize;
            const displayOrders = orders.slice(0, this.ordersPageSize);
            this.ordersLoaded = displayOrders.length;

            // Check if there are more timeline events
            this.timelineHasMore = timeline.length > this.timelinePageSize;
            const displayTimeline = timeline.slice(0, this.timelinePageSize);
            this.timelineLoaded = displayTimeline.length;

            this.currentCustomer = customerData;
            this.renderDashboard(customerData, displayOrders, displayTimeline);

        } catch (error) {
            console.error('Failed to load customer:', error);
            this.contentContainer.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h2>Failed to load customer data</h2>
                    <p>${this.escapeHtml(error.message || 'Please try again')}</p>
                    <a href="/support-center" class="btn-primary">Back to Dashboard</a>
                </div>
            `;
        }
    }

    async loadBookingDetail(bookingId) {
        // Load booking detail view
        this.showingCustomerList = false;
        this.currentRecordType = 'booking';

        // Show skeleton loading state
        this.contentContainer.innerHTML = this.renderDetailSkeleton();

        try {
            const bookingData = await this.apiCall('support_center.api.customer_lookup.get_booking_details', {
                booking_id: bookingId
            });

            this.currentRecord = bookingData;
            this.renderBookingDashboard(bookingData);

        } catch (error) {
            console.error('Failed to load booking:', error);
            this.contentContainer.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h2>Failed to load booking data</h2>
                    <p>${this.escapeHtml(error.message || 'Please try again')}</p>
                    <a href="/support-center" class="btn-primary">Back to Dashboard</a>
                </div>
            `;
        }
    }

    async loadContactDetail(contactId) {
        // Load contact detail view
        this.showingCustomerList = false;
        this.currentRecordType = 'contact';

        // Show skeleton loading state
        this.contentContainer.innerHTML = this.renderDetailSkeleton();

        try {
            const contactData = await this.apiCall('support_center.api.customer_lookup.get_contact_details', {
                contact_id: contactId
            });

            this.currentRecord = contactData;
            this.renderContactDashboard(contactData);

        } catch (error) {
            console.error('Failed to load contact:', error);
            this.contentContainer.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h2>Failed to load contact data</h2>
                    <p>${this.escapeHtml(error.message || 'Please try again')}</p>
                    <a href="/support-center" class="btn-primary">Back to Dashboard</a>
                </div>
            `;
        }
    }

    async loadUserDetail(userId) {
        // Load user detail view
        this.showingCustomerList = false;
        this.currentRecordType = 'user';

        // Show skeleton loading state
        this.contentContainer.innerHTML = this.renderDetailSkeleton();

        try {
            const userData = await this.apiCall('support_center.api.customer_lookup.get_user_details', {
                user_id: userId
            });

            this.currentRecord = userData;
            this.renderUserDashboard(userData);

        } catch (error) {
            console.error('Failed to load user:', error);
            this.contentContainer.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h2>Failed to load user data</h2>
                    <p>${this.escapeHtml(error.message || 'Please try again')}</p>
                    <a href="/support-center" class="btn-primary">Back to Dashboard</a>
                </div>
            `;
        }
    }

    async loadTicketDetail(ticketId) {
        // Load support ticket (Issue) detail view
        this.showingCustomerList = false;
        this.currentRecordType = 'ticket';

        // Show skeleton loading state
        this.contentContainer.innerHTML = this.renderDetailSkeleton();

        try {
            const ticketData = await this.apiCall('support_center.api.customer_lookup.get_ticket_details', {
                ticket_id: ticketId
            });

            this.currentRecord = ticketData;
            this.renderTicketDashboard(ticketData);

        } catch (error) {
            console.error('Failed to load ticket:', error);
            this.contentContainer.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h2>Failed to load ticket data</h2>
                    <p>${this.escapeHtml(error.message || 'Please try again')}</p>
                    <a href="/support-center" class="btn-primary">Back to Dashboard</a>
                </div>
            `;
        }
    }

    renderTicketDashboard(ticket) {
        this.updateBreadcrumb(ticket.subject || ticket.ticket_id);
        this.updateLastUpdated();

        const template = document.getElementById('ticket-dashboard-template');
        const content = template.content.cloneNode(true);

        // Populate basic fields
        this.setFieldValue(content, 'subject', ticket.subject || 'No subject');
        this.setFieldValue(content, 'ticket_id', ticket.ticket_id);
        this.setFieldValue(content, 'priority', ticket.priority || 'Not set');
        this.setFieldValue(content, 'issue_type', ticket.issue_type || 'Not specified');
        this.setFieldValue(content, 'raised_by', ticket.raised_by || 'Unknown');
        this.setFieldValue(content, 'opening_date', this.formatDate(ticket.opening_date));

        // Set description (sanitize to prevent XSS)
        const descriptionEl = content.querySelector('[data-field="description"]');
        if (descriptionEl) {
            descriptionEl.textContent = ticket.description
                ? ticket.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
                : 'No description provided';
        }

        // Status badge with color coding
        const statusBadge = content.querySelector('[data-field="status_badge"]');
        if (statusBadge) {
            statusBadge.textContent = ticket.status;
            const statusClass = ticket.status ? ticket.status.toLowerCase().replace(/\s+/g, '-') : 'open';
            statusBadge.className = `status-badge status-${statusClass}`;
        }

        // Priority badge styling
        const priorityEl = content.querySelector('[data-field="priority"]');
        if (priorityEl && ticket.priority) {
            const priorityClass = ticket.priority.toLowerCase();
            priorityEl.classList.add(`priority-${priorityClass}`);
        }

        // Show linked customer if exists
        if (ticket.linked_customer) {
            const linkedCard = content.querySelector('[data-container="linked-customer-ticket"]');
            if (linkedCard) {
                linkedCard.style.display = 'block';
                this.setFieldValue(content, 'linked_customer_name', ticket.linked_customer.customer_name);
                this.setFieldValue(content, 'linked_customer_id', ticket.linked_customer.name);
            }
        }

        // Show resolution if resolved/closed
        if (ticket.resolution_details && ['Resolved', 'Closed'].includes(ticket.status)) {
            const resolutionCard = content.querySelector('[data-container="resolution"]');
            if (resolutionCard) {
                resolutionCard.style.display = 'block';
                const resolutionEl = content.querySelector('[data-field="resolution_details"]');
                if (resolutionEl) {
                    resolutionEl.textContent = ticket.resolution_details.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                }
            }
        }

        // Render comments/activity
        this.renderTicketComments(content, ticket.comments || []);

        // Render related tickets
        this.renderRelatedTickets(content, ticket.related_tickets || []);

        // Setup event listeners
        this.setupTicketEventListeners(content, ticket);

        // Clear and show with back button
        this.contentContainer.innerHTML = '';

        const backBtn = document.createElement('button');
        backBtn.className = 'back-button';
        backBtn.innerHTML = '← Back to List';
        backBtn.onclick = () => {
            window.location.href = this.getBackURL();
        };
        this.contentContainer.appendChild(backBtn);

        this.contentContainer.appendChild(content);
    }

    renderTicketComments(content, comments) {
        const container = content.querySelector('[data-container="ticket-comments"]');
        if (!container) return;

        if (!comments || comments.length === 0) {
            container.innerHTML = '<p class="empty-message">No activity yet</p>';
            return;
        }

        container.innerHTML = comments.map(comment => `
            <div class="history-item">
                <div class="history-icon">
                    ${comment.direction === 'Received' ? '📥' : '📤'}
                </div>
                <div class="history-content">
                    <div class="history-title">${this.escapeHtml(comment.subject || comment.type || 'Communication')}</div>
                    <div class="history-meta">${this.escapeHtml(comment.sender || '')} • ${this.formatDateTime(comment.date)}</div>
                    ${comment.content ? `<div class="history-notes">${this.escapeHtml(comment.content.substring(0, 200))}${comment.content.length > 200 ? '...' : ''}</div>` : ''}
                </div>
            </div>
        `).join('');
    }

    renderRelatedTickets(content, tickets) {
        const container = content.querySelector('[data-container="related-tickets"]');
        if (!container) return;

        if (!tickets || tickets.length === 0) {
            container.innerHTML = '<p class="empty-message">No related tickets</p>';
            return;
        }

        container.innerHTML = tickets.map(ticket => `
            <div class="history-item related-ticket-item" style="cursor: pointer;" data-ticket-id="${this.escapeHtml(ticket.name)}">
                <div class="history-icon">🎫</div>
                <div class="history-content">
                    <div class="history-title">${this.escapeHtml(ticket.subject)}</div>
                    <div class="history-meta">
                        <span class="status-badge status-${this.escapeHtml(ticket.status.toLowerCase().replace(/\s+/g, '-'))}">${this.escapeHtml(ticket.status)}</span>
                        • ${this.formatDate(ticket.opening_date)}
                    </div>
                </div>
            </div>
        `).join('');

        // Bind click handlers via addEventListener instead of inline onclick
        container.querySelectorAll('.related-ticket-item').forEach(item => {
            item.addEventListener('click', () => {
                this.loadRecord(item.dataset.ticketId, 'ticket');
            });
        });
    }

    setupTicketEventListeners(content, ticket) {
        // View full ticket in ERPNext
        const viewFullBtn = content.querySelector('[data-action="view-full-ticket"]');
        if (viewFullBtn) {
            viewFullBtn.addEventListener('click', () => {
                window.open(`/app/issue/${ticket.ticket_id}`, '_blank');
            });
        }

        // View linked customer
        const viewCustomerBtn = content.querySelector('[data-action="view-linked-customer-ticket"]');
        if (viewCustomerBtn && ticket.linked_customer) {
            viewCustomerBtn.addEventListener('click', () => {
                this.loadRecord(ticket.linked_customer.name, 'customer');
            });
        }

        // Reply to ticket
        const replyBtn = content.querySelector('[data-action="reply-ticket"]');
        if (replyBtn) {
            replyBtn.addEventListener('click', () => {
                window.open(`/app/issue/${ticket.ticket_id}`, '_blank');
            });
        }

        // Close ticket
        const closeBtn = content.querySelector('[data-action="close-ticket"]');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                window.open(`/app/issue/${ticket.ticket_id}`, '_blank');
            });
        }
    }

    async loadCustomerList() {
        // If there's an active search query, delegate to filterCustomerList instead
        if (this.customerListQuery) {
            return this.filterCustomerList(this.customerListQuery);
        }

        this.showingCustomerList = true;
        const tbody = document.getElementById('customer-table-body');
        const tableContainer = document.querySelector('.customer-table-container');

        // Update results header based on category
        this.updateResultsHeader();

        // Show skeleton loading state
        this.renderTableSkeletonRows(tbody);

        this.isLoadingPage = true;

        try {
            // Calculate offset for pagination (1-indexed page)
            const offset = (this.customerListPage - 1) * this.customerListPageSize;

            // Build API params with category filter
            const apiParams = {
                query: '',  // Empty query to get all
                limit: this.customerListPageSize,
                offset: offset
            };

            // Add category filter if not 'all'
            if (this.currentCategory && this.currentCategory !== 'all') {
                apiParams.category = this.currentCategory;
            }

            // Fetch customers with pagination and total count
            const response = await this.apiCall('support_center.api.customer_lookup.search_customers_paginated', apiParams);

            // Update pagination state
            this.customerListTotalCount = response.total_count;
            this.customerListTotalPages = Math.ceil(response.total_count / this.customerListPageSize);

            // Update results count display
            this.updateResultsCount(response.total_count);

            // Update header meta
            this.updateBreadcrumb(null);
            this.updateLastUpdated();
            this.updateRecordCountBadge(response.total_count);

            if (response.results.length === 0) {
                this.renderEmptyState(tbody, tableContainer);
                return;
            }

            // Render customer rows (no grouping - category filter handles this)
            this.renderCustomerListRows(response.results, tbody);

            // Render pagination
            this.renderPagination(tableContainer);

        } catch (error) {
            console.error('Failed to load customer list:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 40px; color: var(--danger);">
                        Failed to load customers. Please refresh the page.
                    </td>
                </tr>
            `;
        } finally {
            this.isLoadingPage = false;
        }
    }

    /**
     * Get human-readable label for a category
     */
    getCategoryLabel(category) {
        const labels = {
            'all': 'All Records',
            'contact': 'Customers',       // Contact doctype = "Customers" tab
            'customer': 'Sales Orders',   // Customer doctype = "Sales Orders" tab
            'booking': 'Meeting Bookings' // MM Meeting Booking = "Meeting Bookings" tab
        };
        return labels[category] || 'Records';
    }

    /**
     * Update the results count display
     */
    updateResultsCount(count) {
        const countEl = document.getElementById('results-count');
        if (countEl) {
            countEl.textContent = count > 0 ? `${count} record${count !== 1 ? 's' : ''}` : '';
        }
    }

    /**
     * Render empty state when no results
     */
    renderEmptyState(tbody, tableContainer) {
        const categoryLabel = this.getCategoryLabel(this.currentCategory).toLowerCase();
        const isFiltered = this.currentCategory !== 'all';
        const hasSearch = !!this.customerListQuery;

        let emptyMessage = '';
        if (hasSearch && isFiltered) {
            emptyMessage = `No ${categoryLabel} found matching "${this.escapeHtml(this.customerListQuery)}".`;
        } else if (hasSearch) {
            emptyMessage = `No results found matching "${this.escapeHtml(this.customerListQuery)}".`;
        } else if (isFiltered) {
            emptyMessage = `No ${categoryLabel} found.`;
        } else {
            emptyMessage = 'No records found.';
        }

        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <div class="empty-state-icon">${this.getEmptyStateIcon()}</div>
                        <p class="empty-state-message">${emptyMessage}</p>
                        ${hasSearch || isFiltered ? `
                            <div class="empty-state-actions">
                                ${hasSearch ? `<button class="empty-state-btn" onclick="document.getElementById('customer-search').value=''; dashboard.customerListQuery = ''; dashboard.customerListPage = 1; dashboard.loadCustomerList(); dashboard.loadCategoryCounts();">Clear search</button>` : ''}
                                ${isFiltered ? `<button class="empty-state-btn" onclick="dashboard.setCategory('all');">Show all records</button>` : ''}
                            </div>
                        ` : `
                            <a href="/app/customer/new" class="empty-state-btn primary">Create your first customer</a>
                        `}
                    </div>
                </td>
            </tr>
        `;

        // Remove pagination if no results
        const existingPagination = tableContainer.querySelector('.pagination-container');
        if (existingPagination) existingPagination.remove();

        this.updateResultsCount(0);
    }

    /**
     * Get appropriate icon for empty state based on category
     */
    getEmptyStateIcon() {
        const icons = {
            'all': '📋',
            'contact': '👤',   // Customers tab
            'customer': '📦',  // Sales Orders tab
            'booking': '📅'    // Meeting Bookings tab
        };
        return icons[this.currentCategory] || '📋';
    }

    /**
     * Render customer list rows (used by both loadCustomerList and filterCustomerList)
     */
    renderCustomerListRows(customers, tbody) {
        tbody.innerHTML = '';

        customers.forEach(customer => {
            const row = document.createElement('tr');

            // Get source badge with appropriate styling
            const sourceHtml = customer.source ? `<span class="source-badge source-${customer.type}">${this.escapeHtml(customer.source)}</span>` : 'N/A';

            // Build inline action buttons
            let phoneBtn = '';
            if (customer.phone) {
                phoneBtn = `<a href="tel:${this.escapeHtml(customer.phone)}" class="row-action-btn action-phone" title="Call ${this.escapeHtml(customer.phone)}" onclick="event.stopPropagation()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path></svg></a>`;
            }
            let emailBtn = '';
            if (customer.email) {
                emailBtn = `<a href="mailto:${this.escapeHtml(customer.email)}" class="row-action-btn action-email" title="Email ${this.escapeHtml(customer.email)}" onclick="event.stopPropagation()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg></a>`;
            }
            const rowActions = `<div class="row-actions">${phoneBtn}${emailBtn}</div>`;

            row.innerHTML = `
                <td class="customer-name-cell">${this.escapeHtml(customer.name)}</td>
                <td class="customer-email-cell">${this.escapeHtml(customer.email || 'N/A')}</td>
                <td class="customer-phone-cell">${this.escapeHtml(customer.phone || 'N/A')}</td>
                <td class="customer-source-cell">${sourceHtml}</td>
                <td>
                    <div class="table-actions">
                        ${rowActions}
                        <button data-customer-id="${customer.id}" data-customer-type="${customer.type}">View</button>
                    </div>
                </td>
            `;

            // Click row to view record details
            row.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON' && !e.target.closest('.row-action-btn')) {
                    this.loadRecord(customer.id, customer.type);
                }
            });

            // Click button to view record details
            const btn = row.querySelector('button');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.loadRecord(customer.id, customer.type);
            });

            tbody.appendChild(row);
        });
    }

    /**
     * Render shadcn-style pagination component
     */
    renderPagination(container) {
        // Remove existing pagination (look in both container and parent)
        let existingPagination = container.querySelector('.pagination-container');
        if (existingPagination) existingPagination.remove();
        existingPagination = container.parentElement?.querySelector('.pagination-container');
        if (existingPagination) existingPagination.remove();

        // Don't show pagination if only one page or no results
        if (this.customerListTotalPages <= 1) {
            return;
        }

        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination-container';

        // Build page numbers array with ellipsis logic
        const pageNumbers = this.getPaginationRange(this.customerListPage, this.customerListTotalPages);

        const startItem = ((this.customerListPage - 1) * this.customerListPageSize) + 1;
        const endItem = Math.min(this.customerListPage * this.customerListPageSize, this.customerListTotalCount);

        const paginationHTML = `
            <div class="pagination">
                <button class="pagination-btn pagination-prev" ${this.customerListPage === 1 ? 'disabled' : ''}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m15 18-6-6 6-6"/>
                    </svg>
                    <span>Previous</span>
                </button>
                <div class="pagination-pages">
                    ${pageNumbers.map(page => {
                        if (page === '...') {
                            return '<span class="pagination-ellipsis">...</span>';
                        }
                        return `<button class="pagination-page ${page === this.customerListPage ? 'active' : ''}" data-page="${page}">${page}</button>`;
                    }).join('')}
                </div>
                <button class="pagination-btn pagination-next" ${this.customerListPage === this.customerListTotalPages ? 'disabled' : ''}>
                    <span>Next</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m9 18 6-6-6-6"/>
                    </svg>
                </button>
            </div>
            <div class="pagination-info">
                Showing ${startItem} to ${endItem} of ${this.customerListTotalCount} results
            </div>
        `;

        paginationContainer.innerHTML = paginationHTML;

        // Add event listeners
        const prevBtn = paginationContainer.querySelector('.pagination-prev');
        const nextBtn = paginationContainer.querySelector('.pagination-next');
        const pageButtons = paginationContainer.querySelectorAll('.pagination-page');

        prevBtn.addEventListener('click', () => {
            if (this.customerListPage > 1) {
                this.goToPage(this.customerListPage - 1);
            }
        });

        nextBtn.addEventListener('click', () => {
            if (this.customerListPage < this.customerListTotalPages) {
                this.goToPage(this.customerListPage + 1);
            }
        });

        pageButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page);
                if (page !== this.customerListPage) {
                    this.goToPage(page);
                }
            });
        });

        // Insert pagination after the table inside the container
        container.appendChild(paginationContainer);
    }

    /**
     * Generate pagination range with ellipsis
     * Shows: 1 ... 4 5 [6] 7 8 ... 20
     */
    getPaginationRange(currentPage, totalPages) {
        const delta = 2; // Pages to show on each side of current
        const range = [];
        const rangeWithDots = [];

        // Always include first page
        range.push(1);

        // Calculate range around current page
        for (let i = currentPage - delta; i <= currentPage + delta; i++) {
            if (i > 1 && i < totalPages) {
                range.push(i);
            }
        }

        // Always include last page
        if (totalPages > 1) {
            range.push(totalPages);
        }

        // Remove duplicates and sort
        const uniqueRange = [...new Set(range)].sort((a, b) => a - b);

        // Add ellipsis where needed
        let prev = 0;
        for (const page of uniqueRange) {
            if (prev && page - prev > 1) {
                rangeWithDots.push('...');
            }
            rangeWithDots.push(page);
            prev = page;
        }

        return rangeWithDots;
    }

    /**
     * Navigate to specific page
     */
    goToPage(page) {
        if (page < 1 || page > this.customerListTotalPages || this.isLoadingPage) return;

        this.customerListPage = page;

        if (this.customerListQuery) {
            this.filterCustomerList(this.customerListQuery);
        } else {
            this.loadCustomerList();
        }
    }

    async filterCustomerList(query) {
        this.showingCustomerList = true;
        const tbody = document.getElementById('customer-table-body');
        const tableContainer = document.querySelector('.customer-table-container');

        // Reset to page 1 if query changed
        if (this.customerListQuery !== query) {
            this.customerListPage = 1;
            this.customerListQuery = query;
        }

        // Update URL with search query
        this.updateURL();

        // Update results header
        this.updateResultsHeader();

        // Show skeleton loading state
        this.renderTableSkeletonRows(tbody);

        this.isLoadingPage = true;

        try {
            // Calculate offset for pagination (1-indexed page)
            const offset = (this.customerListPage - 1) * this.customerListPageSize;

            // Build API params with category filter
            const apiParams = {
                query: query,
                limit: this.customerListPageSize,
                offset: offset
            };

            // Add category filter if not 'all'
            if (this.currentCategory && this.currentCategory !== 'all') {
                apiParams.category = this.currentCategory;
            }

            // Fetch filtered customers with pagination and total count
            const response = await this.apiCall('support_center.api.customer_lookup.search_customers_paginated', apiParams);

            // Update pagination state
            this.customerListTotalCount = response.total_count;
            this.customerListTotalPages = Math.ceil(response.total_count / this.customerListPageSize);

            // Update results count display
            this.updateResultsCount(response.total_count);

            // Update header meta
            this.updateLastUpdated();
            this.updateRecordCountBadge(response.total_count);

            // Refresh category counts for current search query
            this.loadCategoryCounts();

            if (response.results.length === 0) {
                this.renderEmptyState(tbody, tableContainer);
                return;
            }

            // Render results (no grouping - category tabs handle filtering)
            this.renderCustomerListRows(response.results, tbody);

            // Render pagination
            this.renderPagination(tableContainer);

        } catch (error) {
            console.error('Failed to filter customer list:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 40px; color: var(--danger);">
                        Search failed. Please try again.
                    </td>
                </tr>
            `;
        } finally {
            this.isLoadingPage = false;
        }
    }

    /**
     * Build the back-to-list URL preserving search query and category
     */
    getBackURL() {
        const url = new URL('/support-center', window.location.origin);
        if (this.customerListQuery) {
            url.searchParams.set('q', this.customerListQuery);
        }
        if (this.currentCategory && this.currentCategory !== 'all') {
            url.searchParams.set('category', this.currentCategory);
        }
        return url.toString();
    }

    showBackButton() {
        if (this.showingCustomerList) return;

        const backBtn = document.createElement('button');
        backBtn.className = 'back-button';
        backBtn.innerHTML = '← Back to Customer List';
        backBtn.onclick = () => {
            this.showingCustomerList = true;
            this.contentContainer.innerHTML = document.querySelector('.customer-list-view').outerHTML;
            this.loadCustomerList();
        };

        this.contentContainer.insertBefore(backBtn, this.contentContainer.firstChild);
    }

    renderDashboard(customer, orders, history) {
        this.showingCustomerList = false;
        this.updateBreadcrumb(customer.customer_name);
        this.updateLastUpdated();

        // Clone template
        const template = document.getElementById('dashboard-template');
        const clone = template.content.cloneNode(true);

        // Populate customer profile
        const initials = this.getInitials(customer.customer_name);
        this.setFieldValue(clone, 'customer_initials', initials);
        this.setFieldValue(clone, 'customer_name', customer.customer_name);
        this.setFieldValue(clone, 'customer_id', customer.customer_id);
        this.setFieldValue(clone, 'email', customer.email || 'Not provided');
        this.setFieldValue(clone, 'phone', customer.phone || 'Not provided');
        this.setFieldValue(clone, 'company_name', customer.company_name || 'Not provided');
        this.setFieldValue(clone, 'address', customer.address || 'Not provided');
        this.setFieldValue(clone, 'customer_since', this.formatDate(customer.customer_since));
        this.setFieldValue(clone, 'total_orders', customer.total_orders);
        this.setFieldValue(clone, 'total_meetings', customer.total_meetings || 0);
        this.setFieldValue(clone, 'lifetime_value', this.formatCurrency(customer.lifetime_value));
        this.setFieldValue(clone, 'outstanding_amount', this.formatCurrency(customer.outstanding_amount));

        // Color code outstanding amount
        const outstandingEl = clone.querySelector('[data-field="outstanding_amount"]');
        if (outstandingEl && customer.outstanding_amount > 0) {
            outstandingEl.classList.add('has-outstanding');
        }

        // Populate orders table
        const ordersContainer = clone.querySelector('[data-container="orders"]');
        if (orders.length === 0) {
            ordersContainer.innerHTML = '<p class="empty-message">No orders found</p>';
        } else {
            // Store orders for sorting
            this.currentOrders = orders;
            this.ordersSortField = 'transaction_date';
            this.ordersSortDirection = 'desc';
            ordersContainer.innerHTML = this.createOrdersTable(orders);
        }

        // Populate history/timeline
        const historyContainer = clone.querySelector('[data-container="history"]');
        // Store timeline items for pagination
        this.currentTimeline = history;

        if (history.length === 0) {
            historyContainer.innerHTML = '<p class="empty-message">No support history</p>';
        } else {
            historyContainer.innerHTML = '';
            history.forEach(item => {
                const historyItem = this.createHistoryItem(item);
                historyContainer.appendChild(historyItem);
            });

            // Add "Load More" button if there are more timeline items
            if (this.timelineHasMore) {
                const loadMoreDiv = document.createElement('div');
                loadMoreDiv.className = 'load-more-container';
                loadMoreDiv.innerHTML = `
                    <button class="load-more-btn" data-action="load-more-timeline">
                        <span class="load-more-text">Load More History</span>
                        <span class="load-more-spinner" style="display: none;">
                            <div class="loading-spinner-small"></div>
                            Loading...
                        </span>
                    </button>
                `;
                historyContainer.appendChild(loadMoreDiv);
            }
        }

        // Attach action listeners
        this.attachActionListeners(clone);

        // Attach view toggle listeners for timeline
        this.attachViewToggleListeners(clone);

        // Replace content with back button
        this.contentContainer.innerHTML = '';

        // Add back button
        const backBtn = document.createElement('button');
        backBtn.className = 'back-button';
        backBtn.innerHTML = '← Back to Customer List';
        backBtn.onclick = () => {
            window.location.href = this.getBackURL();
        };
        this.contentContainer.appendChild(backBtn);

        this.contentContainer.appendChild(clone);

        // Attach sort and load more listeners after content is in DOM
        if (this.currentOrders.length > 0) {
            this.attachOrdersSortListeners();
            this.attachOrdersLoadMoreListener();
            this.attachOrderRowClickListeners();
        }

        // Attach timeline load more listener
        this.attachTimelineLoadMoreListener();
    }

    createOrderCard(order) {
        const template = document.getElementById('order-card-template');
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.order-card');

        // Set order data
        this.setFieldValue(clone, 'order_id', order.name);
        this.setFieldValue(clone, 'amount', this.formatCurrency(order.grand_total));
        this.setFieldValue(clone, 'date', this.formatDate(order.transaction_date));
        this.setFieldValue(clone, 'items_count', `${order.items_count} item${order.items_count !== 1 ? 's' : ''}`);

        // Set status with appropriate class
        const statusEl = clone.querySelector('[data-field="status"]');
        statusEl.textContent = order.status;
        statusEl.className = `order-status status-${this.slugify(order.status)}`;

        // Show tracking button if available
        if (order.tracking_number) {
            const trackBtn = clone.querySelector('[data-action="track-order"]');
            trackBtn.style.display = 'inline-block';
            trackBtn.dataset.trackingNumber = order.tracking_number;
        }

        // Attach click handlers
        clone.querySelector('[data-action="view-order"]').addEventListener('click', () => {
            window.open(`/app/sales-order/${order.name}`, '_blank');
        });

        const trackBtn = clone.querySelector('[data-action="track-order"]');
        if (trackBtn && order.tracking_number) {
            trackBtn.addEventListener('click', () => {
                // Open tracking in new window (customize URL based on carrier)
                window.open(`https://www.google.com/search?q=${order.tracking_number}`, '_blank');
            });
        }

        return clone;
    }

    createOrdersTable(orders) {
        const rows = orders.map(order => {
            // Format date and time
            const orderDate = this.formatDate(order.transaction_date);
            const orderTime = this.formatTime(order.order_time);

            // Format status
            const statusClass = this.slugify(order.status || 'draft');
            const statusBadge = `<span class="order-status-badge status-${statusClass}">${this.escapeHtml(order.status || 'Draft')}</span>`;

            // Format amount
            const amount = this.formatCurrency(order.grand_total);

            // Customer info
            const customerName = this.escapeHtml(order.customer_name || '-');
            const customerEmail = this.escapeHtml(order.contact_email || '-');
            const customerPhone = this.escapeHtml(order.contact_mobile || '-');

            // Items info
            const itemsCount = order.items_count || 0;
            const itemNames = order.item_names ? this.escapeHtml(order.item_names) : '-';

            return `
                <tr class="order-row clickable-row" data-order-id="${this.escapeHtml(order.name)}">
                    <td class="order-number-cell">
                        <span class="order-link">${this.escapeHtml(order.name)}</span>
                    </td>
                    <td class="order-date-cell">${orderDate}</td>
                    <td class="order-time-cell">${orderTime}</td>
                    <td class="order-customer-cell">
                        <div class="customer-info-mini">
                            <div class="customer-name-mini">${customerName}</div>
                            <div class="customer-contact-mini">${customerEmail}</div>
                        </div>
                    </td>
                    <td class="order-items-cell">
                        <div class="items-info">
                            <div class="items-count">${itemsCount} item${itemsCount !== 1 ? 's' : ''}</div>
                            <div class="items-preview">${itemNames}</div>
                        </div>
                    </td>
                    <td class="order-amount-cell">
                        <span class="amount-value">${amount}</span>
                    </td>
                    <td class="order-status-cell">${statusBadge}</td>
                </tr>
            `;
        }).join('');

        // Determine sort indicator for date column
        const dateSortIcon = this.ordersSortField === 'transaction_date'
            ? (this.ordersSortDirection === 'asc' ? ' ▲' : ' ▼')
            : '';

        const amountSortIcon = this.ordersSortField === 'grand_total'
            ? (this.ordersSortDirection === 'asc' ? ' ▲' : ' ▼')
            : '';

        // Add "Load More" row if there are more orders
        const loadMoreRow = this.ordersHasMore ? `
            <tr class="load-more-row">
                <td colspan="7">
                    <button class="load-more-btn" data-action="load-more-orders">
                        <span class="load-more-text">Load More Orders</span>
                        <span class="load-more-spinner" style="display: none;">
                            <div class="loading-spinner-small"></div>
                            Loading...
                        </span>
                    </button>
                </td>
            </tr>
        ` : '';

        return `
            <table class="orders-detail-table">
                <thead>
                    <tr>
                        <th>Order #</th>
                        <th class="sortable" data-sort-field="transaction_date">Date${dateSortIcon}</th>
                        <th>Time</th>
                        <th>Customer Info</th>
                        <th>Items</th>
                        <th class="sortable" data-sort-field="grand_total">Total${amountSortIcon}</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                    ${loadMoreRow}
                </tbody>
            </table>
        `;
    }

    async loadMoreOrders() {
        if (this.isLoadingMore || !this.ordersHasMore || !this.currentCustomer) return;

        this.isLoadingMore = true;
        const btn = document.querySelector('[data-action="load-more-orders"]');

        if (btn) {
            btn.querySelector('.load-more-text').style.display = 'none';
            btn.querySelector('.load-more-spinner').style.display = 'inline-flex';
            btn.disabled = true;
        }

        try {
            const moreOrders = await this.apiCall('support_center.api.customer_lookup.get_customer_orders', {
                customer_id: this.currentCustomer.customer_id,
                limit: this.ordersPageSize + 1,
                offset: this.ordersLoaded
            });

            // Check if there are more
            this.ordersHasMore = moreOrders.length > this.ordersPageSize;
            const newOrders = moreOrders.slice(0, this.ordersPageSize);

            // Append to current orders
            this.currentOrders = [...this.currentOrders, ...newOrders];
            this.ordersLoaded += newOrders.length;

            // Re-render orders table
            const ordersContainer = document.querySelector('[data-container="orders"]');
            if (ordersContainer) {
                ordersContainer.innerHTML = this.createOrdersTable(this.currentOrders);
                this.attachOrdersSortListeners();
                this.attachOrdersLoadMoreListener();
                this.attachOrderRowClickListeners();
            }

        } catch (error) {
            console.error('Failed to load more orders:', error);
        } finally {
            this.isLoadingMore = false;
        }
    }

    attachOrdersLoadMoreListener() {
        const loadMoreBtn = document.querySelector('[data-action="load-more-orders"]');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => this.loadMoreOrders());
        }
    }

    attachOrderRowClickListeners() {
        const orderRows = document.querySelectorAll('.orders-detail-table .order-row');
        orderRows.forEach(row => {
            row.addEventListener('click', () => {
                const orderId = row.dataset.orderId;
                if (orderId) {
                    this.showOrderDetail(orderId);
                }
            });
        });
    }

    attachTimelineLoadMoreListener() {
        const loadMoreBtn = document.querySelector('[data-action="load-more-timeline"]');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => this.loadMoreTimeline());
        }
    }

    async loadMoreTimeline() {
        if (this.isLoadingMore || !this.timelineHasMore || !this.currentCustomer) return;

        this.isLoadingMore = true;
        const btn = document.querySelector('[data-action="load-more-timeline"]');

        if (btn) {
            btn.querySelector('.load-more-text').style.display = 'none';
            btn.querySelector('.load-more-spinner').style.display = 'inline-flex';
            btn.disabled = true;
        }

        try {
            const moreItems = await this.apiCall('support_center.api.customer_lookup.get_unified_timeline', {
                customer_id: this.currentCustomer.customer_id,
                limit: this.timelinePageSize + 1,
                offset: this.timelineLoaded
            });

            // Check if there are more
            this.timelineHasMore = moreItems.length > this.timelinePageSize;
            const newItems = moreItems.slice(0, this.timelinePageSize);

            // Append to current timeline
            this.currentTimeline = [...this.currentTimeline, ...newItems];
            this.timelineLoaded += newItems.length;

            // Re-render timeline
            const historyContainer = document.querySelector('[data-container="history"]');
            if (historyContainer) {
                historyContainer.innerHTML = '';
                this.currentTimeline.forEach(item => {
                    const historyItem = this.createHistoryItem(item);
                    historyContainer.appendChild(historyItem);
                });

                // Add "Load More" button if there are more timeline items
                if (this.timelineHasMore) {
                    const loadMoreDiv = document.createElement('div');
                    loadMoreDiv.className = 'load-more-container';
                    loadMoreDiv.innerHTML = `
                        <button class="load-more-btn" data-action="load-more-timeline">
                            <span class="load-more-text">Load More History</span>
                            <span class="load-more-spinner" style="display: none;">
                                <div class="loading-spinner-small"></div>
                                Loading...
                            </span>
                        </button>
                    `;
                    historyContainer.appendChild(loadMoreDiv);
                    this.attachTimelineLoadMoreListener();
                }
            }

        } catch (error) {
            console.error('Failed to load more timeline items:', error);
        } finally {
            this.isLoadingMore = false;
        }
    }

    attachOrdersSortListeners() {
        const sortableHeaders = document.querySelectorAll('.orders-detail-table th.sortable');
        sortableHeaders.forEach(header => {
            header.style.cursor = 'pointer';
            header.addEventListener('click', () => {
                const sortField = header.getAttribute('data-sort-field');
                this.sortOrders(sortField);
            });
        });

        // Attach click listeners to order rows to open detail modal
        const orderRows = document.querySelectorAll('.orders-detail-table .order-row.clickable-row');
        orderRows.forEach(row => {
            row.style.cursor = 'pointer';
            row.addEventListener('click', (e) => {
                // Don't trigger if clicking a link
                if (e.target.tagName === 'A') return;

                const orderId = row.getAttribute('data-order-id');
                if (orderId) {
                    this.showOrderDetail(orderId);
                }
            });
        });
    }

    sortOrders(field) {
        // Toggle direction if clicking same field, otherwise default to desc
        if (this.ordersSortField === field) {
            this.ordersSortDirection = this.ordersSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.ordersSortField = field;
            this.ordersSortDirection = 'desc'; // Default to descending
        }

        // Sort the orders array
        this.currentOrders.sort((a, b) => {
            let aVal, bVal;

            if (field === 'transaction_date') {
                aVal = new Date(a.transaction_date);
                bVal = new Date(b.transaction_date);
            } else if (field === 'grand_total') {
                aVal = parseFloat(a.grand_total || 0);
                bVal = parseFloat(b.grand_total || 0);
            }

            if (this.ordersSortDirection === 'asc') {
                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            } else {
                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
            }
        });

        // Re-render the table
        const ordersContainer = document.querySelector('[data-container="orders"]');
        if (ordersContainer) {
            ordersContainer.innerHTML = this.createOrdersTable(this.currentOrders);
            this.attachOrdersSortListeners();
        }
    }

    createHistoryItem(item) {
        const template = document.getElementById('history-item-template');
        const clone = template.content.cloneNode(true);

        // Determine SVG icon based on type
        const icons = {
            'meeting': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect>
                <line x1="16" x2="16" y1="2" y2="6"></line>
                <line x1="8" x2="8" y1="2" y2="6"></line>
                <line x1="3" x2="21" y1="10" y2="10"></line>
            </svg>`,
            'email': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"></rect>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
            </svg>`,
            'communication': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"></path>
            </svg>`,
            'note': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"></path>
            </svg>`,
            'call': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>`,
            'chat': `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"></path>
            </svg>`
        };
        const defaultIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"></path>
        </svg>`;
        const icon = icons[item.type] || defaultIcon;

        // Set icon as HTML
        const iconEl = clone.querySelector('[data-field="icon"]');
        if (iconEl) {
            iconEl.innerHTML = icon;
        }

        // Build title based on type
        let title = '';
        if (item.type === 'meeting') {
            title = `Meeting: ${item.meeting_type || 'Support'}`;
        } else if (item.subject) {
            title = item.subject;
        } else if (item.title) {
            title = item.title;
        } else {
            title = this.capitalize(item.type);
        }
        this.setFieldValue(clone, 'title', title);

        // Build meta info
        let meta = this.escapeHtml(this.formatDate(item.date));
        if (item.booked_by) {
            meta += ` • Booked by <span class="booked-by-agent">${this.escapeHtml(item.booked_by)}</span>`;
        }
        if (item.assigned_to) {
            meta += ` • ${this.escapeHtml(item.assigned_to)}`;
        }
        if (item.created_by) {
            meta += ` • ${this.escapeHtml(item.created_by)}`;
        }
        if (item.status) {
            meta += ` • ${this.escapeHtml(item.status)}`;
        }
        const metaEl = clone.querySelector('[data-field="meta"]');
        if (metaEl) metaEl.innerHTML = meta;

        // Set notes if available
        const notes = item.notes || item.content;
        if (notes) {
            const notesEl = clone.querySelector('[data-field="notes"]');
            notesEl.textContent = notes;
            notesEl.style.display = 'block';
        }

        // Attach view detail handler
        clone.querySelector('[data-action="view-detail"]').addEventListener('click', () => {
            if (item.id) {
                // Open in new tab based on type
                if (item.type === 'meeting') {
                    window.open(`/app/mm-meeting-booking/${item.id}`, '_blank');
                } else if (item.type === 'note') {
                    window.open(`/app/note/${item.id}`, '_blank');
                } else if (item.type === 'email' || item.type === 'communication') {
                    window.open(`/app/communication/${item.id}`, '_blank');
                }
            }
        });

        return clone;
    }

    attachActionListeners(element) {
        // Book Meeting
        element.querySelector('[data-action="book-meeting"]')?.addEventListener('click', () => {
            // Pre-fill customer data and redirect to Meeting Manager
            const params = new URLSearchParams({
                customer_name: this.currentCustomer.customer_name,
                customer_email: this.currentCustomer.email || '',
                customer_phone: this.currentCustomer.phone || ''
            });
            window.location.href = `/meeting-booking?${params.toString()}`;
        });

        // Send Email
        element.querySelector('[data-action="send-email"]')?.addEventListener('click', () => {
            if (this.currentCustomer.email) {
                window.location.href = `mailto:${this.currentCustomer.email}`;
            } else {
                alert('No email address available for this customer');
            }
        });

        // Create Note
        element.querySelector('[data-action="create-note"]')?.addEventListener('click', () => {
            this.showNoteModal();
        });

        // Create Order
        element.querySelector('[data-action="create-order"]')?.addEventListener('click', () => {
            window.open(`/app/sales-order/new?customer=${this.currentCustomer.customer_id}`, '_blank');
        });

        // Create Ticket
        element.querySelector('[data-action="create-ticket"]')?.addEventListener('click', () => {
            this.showTicketModal();
        });

        // View Full Profile
        element.querySelector('[data-action="view-full"]')?.addEventListener('click', () => {
            window.open(`/app/customer/${this.currentCustomer.customer_id}`, '_blank');
        });

        // View All Orders
        element.querySelector('[data-action="view-all-orders"]')?.addEventListener('click', () => {
            window.open(`/app/sales-order?customer=${this.currentCustomer.customer_id}`, '_blank');
        });

        // View All History
        element.querySelector('[data-action="view-all-history"]')?.addEventListener('click', () => {
            window.open(`/app/customer/${this.currentCustomer.customer_id}`, '_blank');
        });
    }

    showNoteModal() {
        const modal = document.getElementById('note-modal');
        const textarea = document.getElementById('note-content');
        const saveBtn = modal.querySelector('[data-action="save-note"]');
        const closeBtns = modal.querySelectorAll('[data-action="close-modal"]');

        // Clear previous content
        textarea.value = '';

        // Show modal
        modal.style.display = 'flex';
        textarea.focus();

        // Close handlers
        closeBtns.forEach(btn => {
            btn.onclick = () => {
                modal.style.display = 'none';
            };
        });

        // Save handler
        saveBtn.onclick = async () => {
            const content = textarea.value.trim();
            if (!content) {
                alert('Please enter note content');
                return;
            }

            const btnText = saveBtn.querySelector('.btn-text');
            const btnLoading = saveBtn.querySelector('.btn-loading');

            try {
                // Show loading
                btnText.style.display = 'none';
                btnLoading.style.display = 'inline';
                saveBtn.disabled = true;

                await this.apiCall('support_center.api.customer_lookup.create_quick_note', {
                    customer_id: this.currentCustomer.customer_id,
                    note_content: content
                });

                // Success - close modal and reload customer
                modal.style.display = 'none';
                this.loadCustomer(this.currentCustomer.customer_id);

            } catch (error) {
                console.error('Failed to save note:', error);
                alert('Failed to save note. Please try again.');

                // Reset button
                btnText.style.display = 'inline';
                btnLoading.style.display = 'none';
                saveBtn.disabled = false;
            }
        };
    }

    async showTicketModal() {
        const modal = document.getElementById('ticket-modal');
        const modalBody = modal.querySelector('.modal-body');
        const modalFooter = modal.querySelector('.modal-footer');

        // Store original modal body/footer HTML for reset
        if (!this._ticketModalBodyHTML) {
            this._ticketModalBodyHTML = modalBody.innerHTML;
            this._ticketModalFooterHTML = modalFooter.innerHTML;
        }

        // Restore form if it was replaced by success view
        modalBody.innerHTML = this._ticketModalBodyHTML;
        modalFooter.innerHTML = this._ticketModalFooterHTML;

        // Re-query elements after restoring
        const subjectEl = document.getElementById('ticket-subject');
        const descEl = document.getElementById('ticket-description');
        const typeEl = document.getElementById('ticket-type');
        const priorityEl = document.getElementById('ticket-priority');
        const teamEl = document.getElementById('ticket-team');
        const folderEl = document.getElementById('ticket-folder');
        const assigneeEl = document.getElementById('ticket-assignee');
        const submitEl = modal.querySelector('[data-action="submit-ticket"]');
        const closeEls = modal.querySelectorAll('[data-action="close-ticket-modal"]');
        const custInfoEl = document.getElementById('ticket-customer-info');

        // Reset form
        subjectEl.value = '';
        folderEl.disabled = true;
        folderEl.innerHTML = '<option value="">Select team first</option>';
        assigneeEl.disabled = true;
        assigneeEl.innerHTML = '<option value="">Select team first</option>';
        submitEl.disabled = false;
        submitEl.querySelector('.btn-text').style.display = 'inline';
        submitEl.querySelector('.btn-loading').style.display = 'none';

        // Auto-populate customer info banner
        const customer = this.currentCustomer;
        custInfoEl.innerHTML = `
            <div class="customer-avatar">${this.getInitials(customer.customer_name)}</div>
            <div class="customer-meta">
                <strong>${this.escapeHtml(customer.customer_name)}</strong>
                <span>${this.escapeHtml(customer.email || customer.phone || customer.customer_id)}</span>
            </div>
        `;

        // Pre-fill description with customer context
        descEl.value = `Customer: ${customer.customer_name}\nEmail: ${customer.email || 'N/A'}\nPhone: ${customer.phone || 'N/A'}\n\n`;

        // Show modal
        modal.style.display = 'flex';
        subjectEl.focus();

        // Load dropdown options
        this.loadTicketDropdowns(typeEl, priorityEl, teamEl);

        // Team change handler — load folders and agents for the selected team
        // Use onchange (not addEventListener) to auto-replace on repeated modal opens
        teamEl.onchange = async () => {
            const fSel = document.getElementById('ticket-folder');
            const aSel = document.getElementById('ticket-assignee');
            const team = teamEl.value;
            if (!team) {
                fSel.disabled = true;
                fSel.innerHTML = '<option value="">Select team first</option>';
                aSel.disabled = true;
                aSel.innerHTML = '<option value="">Select team first</option>';
                return;
            }
            fSel.innerHTML = '<option value="">Loading...</option>';
            aSel.innerHTML = '<option value="">Loading...</option>';
            try {
                const opts = await this.apiCall('support_center.api.customer_lookup.get_team_options', { team });
                fSel.disabled = false;
                fSel.innerHTML = '<option value="">-- Select Folder --</option>';
                (opts.folders || []).forEach(f => {
                    fSel.innerHTML += `<option value="${this.escapeHtml(f.id)}">${this.escapeHtml(f.name)}</option>`;
                });
                aSel.disabled = false;
                aSel.innerHTML = '<option value="">-- Select Assignee --</option>';
                (opts.agents || []).forEach(a => {
                    aSel.innerHTML += `<option value="${this.escapeHtml(a.id)}">${this.escapeHtml(a.name)}</option>`;
                });
            } catch (error) {
                console.error('Failed to load team options:', error);
                fSel.innerHTML = '<option value="">-- Failed to load --</option>';
                aSel.innerHTML = '<option value="">-- Failed to load --</option>';
            }
        };

        // Close handlers
        closeEls.forEach(btn => {
            btn.onclick = () => { modal.style.display = 'none'; };
        });

        // Submit handler
        submitEl.onclick = async () => {
            const subject = subjectEl.value.trim();
            if (!subject) {
                alert('Please enter a subject for the ticket');
                subjectEl.focus();
                return;
            }

            const btnText = submitEl.querySelector('.btn-text');
            const btnLoading = submitEl.querySelector('.btn-loading');

            try {
                btnText.style.display = 'none';
                btnLoading.style.display = 'inline';
                submitEl.disabled = true;

                const result = await this.apiCall('support_center.api.customer_lookup.create_hd_ticket', {
                    customer_email: customer.email || '',
                    customer_name: customer.customer_name,
                    subject: subject,
                    description: descEl.value.trim(),
                    ticket_type: typeEl.value || '',
                    priority: priorityEl.value || '',
                    agent_group: teamEl.value || '',
                    team_folder: document.getElementById('ticket-folder').value || '',
                    assignee: document.getElementById('ticket-assignee').value || ''
                });

                // Show success state
                const body = modal.querySelector('.modal-body');
                const footer = modal.querySelector('.modal-footer');
                body.innerHTML = `
                    <div class="ticket-success">
                        <div class="success-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20 6 9 17l-5-5"></path>
                            </svg>
                        </div>
                        <h3>Ticket Created</h3>
                        <p>Ticket <strong>${this.escapeHtml(result.ticket_id)}</strong> has been created.</p>
                        <a href="/helpdesk/tickets/${this.escapeHtml(result.ticket_id)}" target="_blank">Open in Helpdesk &rarr;</a>
                    </div>
                `;
                footer.innerHTML = `<button class="btn-primary" data-action="close-ticket-modal">Done</button>`;
                footer.querySelector('[data-action="close-ticket-modal"]').onclick = () => {
                    modal.style.display = 'none';
                };

            } catch (error) {
                console.error('Failed to create ticket:', error);
                alert('Failed to create ticket: ' + (error.message || 'Please try again.'));
                btnText.style.display = 'inline';
                btnLoading.style.display = 'none';
                submitEl.disabled = false;
            }
        };
    }

    async loadTicketDropdowns(typeSelect, prioritySelect, teamSelect) {
        try {
            const options = await this.apiCall('support_center.api.customer_lookup.get_ticket_options');

            typeSelect.innerHTML = '<option value="">-- Select Type --</option>';
            (options.ticket_types || []).forEach(t => {
                typeSelect.innerHTML += `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`;
            });

            prioritySelect.innerHTML = '<option value="">-- Select Priority --</option>';
            (options.priorities || []).forEach(p => {
                prioritySelect.innerHTML += `<option value="${this.escapeHtml(p)}">${this.escapeHtml(p)}</option>`;
            });

            teamSelect.innerHTML = '<option value="">-- Select Team --</option>';
            (options.teams || []).forEach(t => {
                teamSelect.innerHTML += `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`;
            });
        } catch (error) {
            console.error('Failed to load ticket options:', error);
            [typeSelect, prioritySelect, teamSelect].forEach(sel => {
                sel.innerHTML = '<option value="">-- Failed to load --</option>';
            });
        }
    }

    // Utility methods
    setFieldValue(element, field, value) {
        const el = element.querySelector(`[data-field="${field}"]`);
        if (el) {
            el.textContent = value;
        }
    }

    getInitials(name) {
        if (!name) return '?';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
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
        return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
    }

    capitalize(text) {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Group search results by type for better visual organization
     * Returns object with type keys and arrays of results
     */
    groupResultsByType(results) {
        const groups = {};
        const typeOrder = ['customer', 'contact', 'user', 'booking', 'order'];
        const typeLabels = {
            customer: { label: 'Customers', icon: '👤', color: 'var(--info)' },
            contact: { label: 'Contacts', icon: '📇', color: '#7c3aed' },
            user: { label: 'System Users', icon: '🔑', color: 'var(--success)' },
            booking: { label: 'Meeting Bookings', icon: '📅', color: 'var(--warning)' },
            order: { label: 'Sales Orders', icon: '📦', color: '#db2777' }
        };

        // Group results by type
        results.forEach(result => {
            const type = result.type || 'customer';
            if (!groups[type]) {
                groups[type] = {
                    items: [],
                    ...typeLabels[type] || { label: this.capitalize(type), icon: '📋', color: 'var(--gray-600)' }
                };
            }
            groups[type].items.push(result);
        });

        // Return in preferred order
        const orderedGroups = {};
        typeOrder.forEach(type => {
            if (groups[type]) {
                orderedGroups[type] = groups[type];
            }
        });

        // Add any remaining types not in the order
        Object.keys(groups).forEach(type => {
            if (!orderedGroups[type]) {
                orderedGroups[type] = groups[type];
            }
        });

        return orderedGroups;
    }

    getCsrfToken() {
        return frappe.boot?.csrf_token || frappe.csrf_token || '';
    }

    async apiCall(method, args) {
        const response = await fetch(`/api/method/${method}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Frappe-CSRF-Token': this.getCsrfToken()
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

    showRecordNotice(record) {
        // Show an alert for non-customer records
        const messages = {
            'booking': `This is a meeting booking (${record.source}). Meeting booking details are managed in the Meeting Manager app at /app/mm-meeting-booking/${record.id}`,
            'contact': `This is a contact record (${record.source}). Contact details are managed at /app/contact/${record.id}`,
            'user': `This is a system user (${record.source}). User details are managed at /app/user/${record.id}`,
            'order': `This is a sales order. You can view it at /app/sales-order/${record.order_id || record.id}`
        };

        const message = messages[record.type] || `This ${record.type} record cannot be viewed in the support dashboard yet.`;

        alert(message + '\n\nOnly ERPNext Customer records have full support dashboard profiles with orders and history.');
    }

    // ============================================
    // Unified Timeline Methods
    // ============================================

    attachViewToggleListeners(element) {
        const toggleBtns = element.querySelectorAll('.view-toggle .toggle-btn');
        const separateView = element.querySelector('[data-view-content="separate"]');
        const timelineView = element.querySelector('[data-view-content="timeline"]');

        toggleBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                const view = btn.dataset.view;

                // Update active button
                toggleBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Toggle views
                if (view === 'timeline') {
                    separateView.style.display = 'none';
                    timelineView.style.display = 'block';

                    // Load timeline if not already loaded
                    const container = timelineView.querySelector('[data-container="timeline"]');
                    if (container.querySelector('.timeline-loading')) {
                        await this.loadUnifiedTimeline();
                    }
                } else {
                    separateView.style.display = 'block';
                    timelineView.style.display = 'none';
                }
            });
        });
    }

    async loadUnifiedTimeline() {
        if (!this.currentCustomer) return;

        const container = document.querySelector('[data-container="timeline"]');
        if (!container) return;

        try {
            const timeline = await this.apiCall('support_center.api.customer_lookup.get_unified_timeline', {
                customer_id: this.currentCustomer.customer_id,
                limit: 30
            });

            this.renderTimeline(timeline, container);
        } catch (error) {
            console.error('Failed to load timeline:', error);
            container.innerHTML = '<p class="empty-message">Failed to load timeline</p>';
        }
    }

    renderTimeline(timeline, container) {
        if (!timeline || timeline.length === 0) {
            container.innerHTML = '<p class="empty-message">No activity found for this customer</p>';
            return;
        }

        container.innerHTML = '';

        timeline.forEach((event, index) => {
            const item = this.createTimelineItem(event, index === timeline.length - 1);
            container.appendChild(item);
        });
    }

    createTimelineItem(event, isLast) {
        const template = document.getElementById('timeline-item-template');
        const clone = template.content.cloneNode(true);
        const item = clone.querySelector('.timeline-item');

        // Set type-specific styling
        item.classList.add(`timeline-type-${event.type}`);
        if (isLast) {
            item.classList.add('timeline-last');
        }

        // Set icon based on type
        const iconEl = clone.querySelector('[data-field="icon"]');
        iconEl.innerHTML = this.getTimelineIcon(event.type, event.icon);

        // Set type badge
        const typeBadge = clone.querySelector('[data-field="type-badge"]');
        typeBadge.textContent = this.getTimelineTypeLabel(event.type);
        typeBadge.classList.add(`badge-${event.type}`);

        // Set date
        this.setFieldValue(clone, 'date', this.formatDateTime(event.date));

        // Set title
        this.setFieldValue(clone, 'title', event.title);

        // Set details
        if (event.details) {
            this.setFieldValue(clone, 'details', event.details);
        } else {
            clone.querySelector('[data-field="details"]').style.display = 'none';
        }

        // Show booked-by agent for meetings
        if (event.booked_by) {
            const detailsEl = clone.querySelector('[data-field="details"]');
            if (detailsEl) {
                const detailsPart = event.details ? `${this.escapeHtml(event.details)}<br>` : '';
                detailsEl.innerHTML = `${detailsPart}Booked by <span class="booked-by-agent">${this.escapeHtml(event.booked_by)}</span>`;
                detailsEl.style.display = 'block';
            }
        }

        // Set amount for orders/invoices
        if (event.amount) {
            const amountEl = clone.querySelector('[data-field="amount"]');
            amountEl.textContent = this.formatCurrency(event.amount);
            amountEl.style.display = 'block';
        }

        // Set status
        if (event.status) {
            const statusEl = clone.querySelector('[data-field="status"]');
            statusEl.textContent = event.status;
            statusEl.classList.add(`status-${this.slugify(event.status)}`);
        } else {
            clone.querySelector('[data-field="status"]').style.display = 'none';
        }

        // Add click handler to view detail
        const actionBtn = clone.querySelector('[data-action="view-timeline-detail"]');
        actionBtn.addEventListener('click', () => {
            this.viewTimelineDetail(event);
        });

        return clone;
    }

    getTimelineIcon(type, iconName) {
        const icons = {
            'order': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path></svg>',
            'invoice': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
            'meeting': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"></rect><line x1="16" x2="16" y1="2" y2="6"></line><line x1="8" x2="8" y1="2" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line></svg>',
            'email': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>',
            'call': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
            'delivery': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>',
            'note': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>',
            'communication': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
            'chat': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>'
        };
        return icons[type] || icons['communication'];
    }

    getTimelineTypeLabel(type) {
        const labels = {
            'order': 'Order',
            'invoice': 'Invoice',
            'meeting': 'Meeting',
            'email': 'Email',
            'call': 'Call',
            'delivery': 'Delivery',
            'note': 'Note',
            'communication': 'Message',
            'chat': 'Chat'
        };
        return labels[type] || this.capitalize(type);
    }

    formatDateTime(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    formatTime(timeString) {
        if (!timeString) return '-';
        // Handle MySQL TIME format (HH:MM:SS or HH:MM:SS.microseconds)
        const parts = timeString.split(':');
        if (parts.length >= 2) {
            const hours = parseInt(parts[0], 10);
            const minutes = parts[1].padStart(2, '0');
            // Format as HH:MM in 24-hour CET format
            return `${hours.toString().padStart(2, '0')}:${minutes}`;
        }
        return timeString;
    }

    viewTimelineDetail(event) {
        const urlMap = {
            'order': `/app/sales-order/${event.id}`,
            'invoice': `/app/sales-invoice/${event.id}`,
            'meeting': `/app/mm-meeting-booking/${event.id}`,
            'delivery': `/app/delivery-note/${event.id}`,
            'email': `/app/communication/${event.id}`,
            'call': `/app/communication/${event.id}`,
            'communication': `/app/communication/${event.id}`,
            'chat': `/app/communication/${event.id}`,
            'note': `/app/note/${event.id}`
        };

        const url = urlMap[event.type];
        if (url) {
            window.open(url, '_blank');
        }
    }

    // ============================================
    // Order Detail Modal Methods
    // ============================================

    async showOrderDetail(orderId) {
        const modal = document.getElementById('order-detail-modal');
        if (!modal) return;

        // Show loading state
        modal.style.display = 'flex';
        modal.querySelector('.order-detail-body').innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>Loading order details...</p>
            </div>
        `;

        try {
            // Fetch order details and user options in parallel
            const [orderData, users] = await Promise.all([
                this.apiCall('support_center.api.customer_lookup.get_order_details', {
                    order_id: orderId
                }),
                this.apiCall('support_center.api.customer_lookup.get_user_options', {})
            ]);

            this.currentOrderData = orderData;
            this.userOptions = users;

            this.renderOrderDetailModal(orderData, users);

        } catch (error) {
            console.error('Failed to load order details:', error);
            modal.querySelector('.order-detail-body').innerHTML = `
                <div class="error-state">
                    <div class="error-icon">⚠️</div>
                    <h3>Failed to load order details</h3>
                    <p>${this.escapeHtml(error.message || 'Please try again')}</p>
                </div>
            `;
        }
    }

    renderOrderDetailModal(order, users) {
        const modal = document.getElementById('order-detail-modal');

        // Reset modal body with tabs
        modal.querySelector('.order-detail-body').innerHTML = `
            <!-- Order Tabs -->
            <div class="order-tabs">
                <button class="tab-btn active" data-tab="items">Items</button>
                <button class="tab-btn" data-tab="custom">Custom Fields</button>
                <button class="tab-btn" data-tab="customer">Customer Info</button>
                <button class="tab-btn" data-tab="payment">Payment</button>
            </div>

            <!-- Items Tab -->
            <div class="tab-content active" data-tab-content="items">
                <div class="order-items-list" data-container="items"></div>
                <div class="order-pricing-breakdown">
                    <div class="pricing-row">
                        <span>Subtotal</span>
                        <span data-field="subtotal"></span>
                    </div>
                    <div class="pricing-row discount" data-container="discount-row" style="display: none;">
                        <span>Discount</span>
                        <span data-field="discount"></span>
                    </div>
                    <div class="pricing-row">
                        <span>Tax</span>
                        <span data-field="taxes"></span>
                    </div>
                    <div class="pricing-row total">
                        <span>Total</span>
                        <span data-field="grand_total"></span>
                    </div>
                </div>
            </div>

            <!-- Custom Fields Tab -->
            <div class="tab-content" data-tab-content="custom">
                <div class="custom-fields-form">
                    <div class="form-section">
                        <h3>Sales Information</h3>
                        <div class="form-grid">
                            <div class="form-row">
                                <label>Salesperson</label>
                                <select data-field="custom_salesperson" class="editable-field"></select>
                            </div>
                            <div class="form-row">
                                <label>Booker</label>
                                <select data-field="custom_booker" class="editable-field"></select>
                            </div>
                            <div class="form-row">
                                <label>Order Type</label>
                                <select data-field="custom_order_type" class="editable-field">
                                    <option value="">-- Select --</option>
                                    <option value="Extension Private">Extension Private</option>
                                    <option value="Extension Business">Extension Business</option>
                                    <option value="New Order Private">New Order Private</option>
                                    <option value="New Order Business">New Order Business</option>
                                    <option value="Upgrade">Upgrade</option>
                                    <option value="Downgrade">Downgrade</option>
                                    <option value="Renewal">Renewal</option>
                                </select>
                            </div>
                            <div class="form-row">
                                <label>Product</label>
                                <select data-field="custom_product" class="editable-field">
                                    <option value="">-- Select --</option>
                                    <option value="Security">Security</option>
                                    <option value="Trend Micro">Trend Micro</option>
                                    <option value="Kaspersky">Kaspersky</option>
                                    <option value="Bitdefender">Bitdefender</option>
                                    <option value="Norton">Norton</option>
                                    <option value="McAfee">McAfee</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div class="form-row" data-depends="custom_product=Trend Micro">
                                <label>Trend Micro Seats</label>
                                <input type="number" data-field="custom_trend_micro_seats" class="editable-field" min="0">
                            </div>
                        </div>
                    </div>
                    <div class="form-section">
                        <h3>References & Tracking</h3>
                        <div class="form-grid">
                            <div class="form-row">
                                <label>Lead</label>
                                <input type="text" data-field="custom_lead" class="editable-field" placeholder="Lead ID">
                            </div>
                            <div class="form-row">
                                <label>Previous Order</label>
                                <input type="text" data-field="custom_previous_order" class="editable-field" placeholder="Order ID">
                            </div>
                            <div class="form-row">
                                <label>Company Reg. Number</label>
                                <input type="text" data-field="custom_company_reg_number" class="editable-field" maxlength="20">
                            </div>
                            <div class="form-row">
                                <label>External Invoice Number</label>
                                <input type="text" data-field="custom_external_invoice_number" class="editable-field">
                            </div>
                        </div>
                    </div>
                    <div class="form-section">
                        <h3>Payment & Status</h3>
                        <div class="form-grid">
                            <div class="form-row">
                                <label>Bank Payment Status</label>
                                <select data-field="custom_bank_payment_status" class="editable-field">
                                    <option value="">-- Select --</option>
                                    <option value="Pending">Pending</option>
                                    <option value="Received">Received</option>
                                    <option value="Failed">Failed</option>
                                    <option value="Refunded">Refunded</option>
                                    <option value="Not Applicable">Not Applicable</option>
                                </select>
                            </div>
                            <div class="form-row">
                                <label>Deferred Payment Date</label>
                                <input type="date" data-field="custom_deferred_payment_date" class="editable-field">
                            </div>
                            <div class="form-row checkbox-row">
                                <label>
                                    <input type="checkbox" data-field="custom_vip_customer" class="editable-field">
                                    VIP Customer
                                </label>
                            </div>
                            <div class="form-row checkbox-row">
                                <label>
                                    <input type="checkbox" data-field="custom_complaint_case" class="editable-field">
                                    Complaint Case
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button class="btn-primary" data-action="save-custom-fields">
                            <span class="btn-text">Save Changes</span>
                            <span class="btn-loading" style="display: none;">Saving...</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Customer Info Tab -->
            <div class="tab-content" data-tab-content="customer">
                <div class="info-columns">
                    <div class="info-section">
                        <h3>Billing</h3>
                        <div class="address-display" data-field="billing_address"></div>
                        <div class="contact-display">
                            <p><strong>Contact:</strong> <span data-field="contact_person"></span></p>
                            <p><strong>Phone:</strong> <span data-field="contact_phone"></span></p>
                            <p><strong>Email:</strong> <span data-field="contact_email"></span></p>
                        </div>
                    </div>
                    <div class="info-section">
                        <h3>Shipping</h3>
                        <div class="address-display" data-field="shipping_address"></div>
                    </div>
                </div>
            </div>

            <!-- Payment Tab -->
            <div class="tab-content" data-tab-content="payment">
                <div class="payment-info">
                    <div class="payment-row">
                        <span>Payment Terms</span>
                        <span data-field="payment_terms"></span>
                    </div>
                    <div class="payment-row">
                        <span>Advance Paid</span>
                        <span data-field="advance_paid"></span>
                    </div>
                    <div class="payment-schedule" data-container="payment_schedule"></div>
                </div>
            </div>
        `;

        // Set header info
        modal.querySelector('.order-header-info h2 span').textContent = order.order_id;

        const statusBadge = modal.querySelector('[data-field="status_badge"]');
        statusBadge.textContent = order.status;
        statusBadge.className = `order-status-badge status-${this.slugify(order.status)}`;

        // Render items
        this.renderOrderItems(modal, order.items);

        // Render pricing
        modal.querySelector('.order-pricing-breakdown [data-field="subtotal"]').textContent = this.formatCurrency(order.pricing.subtotal);
        modal.querySelector('.order-pricing-breakdown [data-field="taxes"]').textContent = this.formatCurrency(order.pricing.total_taxes);
        modal.querySelector('.order-pricing-breakdown [data-field="grand_total"]').textContent = this.formatCurrency(order.pricing.grand_total);

        // Discount row
        const discountRow = modal.querySelector('[data-container="discount-row"]');
        if (order.pricing.discount_amount > 0) {
            modal.querySelector('.order-pricing-breakdown [data-field="discount"]').textContent = '-' + this.formatCurrency(order.pricing.discount_amount);
            discountRow.style.display = 'flex';
        }

        // Populate custom fields form
        this.populateCustomFieldsForm(modal, order.custom_fields, users);

        // Populate customer info
        modal.querySelector('[data-tab-content="customer"] [data-field="billing_address"]').innerHTML = order.billing.address_display || '<em>No billing address</em>';
        modal.querySelector('[data-tab-content="customer"] [data-field="contact_person"]').textContent = order.billing.contact_display || '-';
        modal.querySelector('[data-tab-content="customer"] [data-field="contact_phone"]').textContent = order.billing.contact_phone || order.billing.contact_mobile || '-';
        modal.querySelector('[data-tab-content="customer"] [data-field="contact_email"]').textContent = order.billing.contact_email || '-';
        modal.querySelector('[data-tab-content="customer"] [data-field="shipping_address"]').innerHTML = order.shipping.address_display || '<em>Same as billing</em>';

        // Payment info
        modal.querySelector('[data-tab-content="payment"] [data-field="payment_terms"]').textContent = order.payment.payment_terms_template || '-';
        modal.querySelector('[data-tab-content="payment"] [data-field="advance_paid"]').textContent = this.formatCurrency(order.payment.advance_paid);

        // Setup event listeners
        this.setupOrderModalListeners(modal, order);
        this.setupOrderTabs(modal);
    }

    renderOrderItems(modal, items) {
        const container = modal.querySelector('[data-container="items"]');
        const template = document.getElementById('order-item-template');

        if (!items || items.length === 0) {
            container.innerHTML = '<p class="empty-message">No items in this order</p>';
            return;
        }

        container.innerHTML = '';

        items.forEach(item => {
            const clone = template.content.cloneNode(true);
            const row = clone.querySelector('.order-item-row');

            // Image handling
            const imgEl = row.querySelector('[data-field="image"]');
            const noImageEl = row.querySelector('.no-image');

            if (item.image) {
                imgEl.src = item.image;
                imgEl.style.display = 'block';
                noImageEl.style.display = 'none';
            } else {
                imgEl.style.display = 'none';
                noImageEl.style.display = 'flex';
            }

            row.querySelector('[data-field="item_name"]').textContent = item.item_name || '';
            row.querySelector('[data-field="item_code"]').textContent = item.item_code || '';
            row.querySelector('[data-field="description"]').textContent = item.description || '';
            row.querySelector('[data-field="qty"]').textContent = item.qty || 0;
            row.querySelector('[data-field="rate"]').textContent = this.formatCurrency(item.rate);
            row.querySelector('[data-field="amount"]').textContent = this.formatCurrency(item.amount);

            // Discount display
            const discountEl = row.querySelector('[data-field="discount_display"]');
            if (item.discount_percentage > 0) {
                discountEl.textContent = `-${item.discount_percentage}%`;
                discountEl.style.display = 'block';
            } else if (item.discount_amount > 0) {
                discountEl.textContent = `-${this.formatCurrency(item.discount_amount)}`;
                discountEl.style.display = 'block';
            } else {
                discountEl.style.display = 'none';
            }

            container.appendChild(clone);
        });
    }

    populateCustomFieldsForm(modal, customFields, users) {
        // Populate user dropdowns
        const salespersonSelect = modal.querySelector('[data-field="custom_salesperson"]');
        const bookerSelect = modal.querySelector('[data-field="custom_booker"]');

        [salespersonSelect, bookerSelect].forEach(select => {
            if (!select) return;
            select.innerHTML = '<option value="">-- Select --</option>';
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.name;
                option.textContent = user.full_name || user.name;
                select.appendChild(option);
            });
        });

        // Set current values
        if (salespersonSelect) salespersonSelect.value = customFields.salesperson || '';
        if (bookerSelect) bookerSelect.value = customFields.booker || '';

        const setFieldValue = (selector, value) => {
            const el = modal.querySelector(selector);
            if (el) el.value = value || '';
        };

        const setCheckbox = (selector, value) => {
            const el = modal.querySelector(selector);
            if (el) el.checked = value === 1;
        };

        setFieldValue('[data-field="custom_order_type"]', customFields.order_type);
        setFieldValue('[data-field="custom_product"]', customFields.product);
        setFieldValue('[data-field="custom_trend_micro_seats"]', customFields.trend_micro_seats);
        setFieldValue('[data-field="custom_lead"]', customFields.lead);
        setFieldValue('[data-field="custom_previous_order"]', customFields.previous_order);
        setFieldValue('[data-field="custom_company_reg_number"]', customFields.company_reg_number);
        setFieldValue('[data-field="custom_external_invoice_number"]', customFields.external_invoice_number);
        setFieldValue('[data-field="custom_bank_payment_status"]', customFields.bank_payment_status);
        setFieldValue('[data-field="custom_deferred_payment_date"]', customFields.deferred_payment_date);
        setCheckbox('[data-field="custom_vip_customer"]', customFields.vip_customer);
        setCheckbox('[data-field="custom_complaint_case"]', customFields.complaint_case);

        // Show/hide Trend Micro seats based on product
        this.updateTrendMicroVisibility(modal);
    }

    updateTrendMicroVisibility(modal) {
        const produktSelect = modal.querySelector('[data-field="custom_product"]');
        const seatsRow = modal.querySelector('[data-depends="custom_product=Trend Micro"]');

        if (!produktSelect || !seatsRow) return;

        if (produktSelect.value === 'Trend Micro') {
            seatsRow.style.display = 'flex';
        } else {
            seatsRow.style.display = 'none';
        }
    }

    setupOrderModalListeners(modal, order) {
        // Close modal handlers
        modal.querySelectorAll('[data-action="close-order-modal"]').forEach(btn => {
            btn.onclick = () => {
                modal.style.display = 'none';
            };
        });

        // Open in ERPNext
        const erpnextBtn = modal.querySelector('[data-action="open-in-erpnext"]');
        if (erpnextBtn) {
            erpnextBtn.onclick = () => {
                window.open(`/app/sales-order/${order.order_id}`, '_blank');
            };
        }

        // Product change handler for Trend Micro seats visibility
        const produktSelect = modal.querySelector('[data-field="custom_product"]');
        if (produktSelect) {
            produktSelect.onchange = () => this.updateTrendMicroVisibility(modal);
        }

        // Save custom fields
        const saveBtn = modal.querySelector('[data-action="save-custom-fields"]');
        if (saveBtn) {
            saveBtn.onclick = async () => {
                await this.saveCustomFields(modal, order.order_id);
            };
        }
    }

    async saveCustomFields(modal, orderId) {
        const saveBtn = modal.querySelector('[data-action="save-custom-fields"]');
        const btnText = saveBtn.querySelector('.btn-text');
        const btnLoading = saveBtn.querySelector('.btn-loading');

        // Gather field values
        const fields = {};
        const fieldMappings = [
            { name: 'custom_salesperson', type: 'select' },
            { name: 'custom_booker', type: 'select' },
            { name: 'custom_order_type', type: 'select' },
            { name: 'custom_product', type: 'select' },
            { name: 'custom_trend_micro_seats', type: 'number' },
            { name: 'custom_lead', type: 'text' },
            { name: 'custom_previous_order', type: 'text' },
            { name: 'custom_company_reg_number', type: 'text' },
            { name: 'custom_external_invoice_number', type: 'text' },
            { name: 'custom_bank_payment_status', type: 'select' },
            { name: 'custom_deferred_payment_date', type: 'date' },
            { name: 'custom_vip_customer', type: 'checkbox' },
            { name: 'custom_complaint_case', type: 'checkbox' },
        ];

        fieldMappings.forEach(({ name, type }) => {
            const el = modal.querySelector(`[data-field="${name}"]`);
            if (!el) return;

            if (type === 'checkbox') {
                fields[name] = el.checked ? 1 : 0;
            } else if (type === 'number') {
                fields[name] = el.value ? parseInt(el.value, 10) : 0;
            } else {
                fields[name] = el.value || null;
            }
        });

        try {
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline';
            saveBtn.disabled = true;

            await this.apiCall('support_center.api.customer_lookup.update_order_custom_fields', {
                order_id: orderId,
                fields: JSON.stringify(fields)
            });

            // Success feedback
            alert('Changes saved successfully!');

        } catch (error) {
            console.error('Failed to save custom fields:', error);
            alert('Failed to save changes: ' + (error.message || 'Unknown error'));
        } finally {
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
            saveBtn.disabled = false;
        }
    }

    setupOrderTabs(modal) {
        const tabBtns = modal.querySelectorAll('.tab-btn');
        const tabContents = modal.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            btn.onclick = () => {
                const tabName = btn.getAttribute('data-tab');

                // Update active tab button
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Show corresponding content
                tabContents.forEach(content => {
                    if (content.getAttribute('data-tab-content') === tabName) {
                        content.classList.add('active');
                    } else {
                        content.classList.remove('active');
                    }
                });
            };
        });
    }

    // ============================================
    // Booking Dashboard Methods
    // ============================================

    renderBookingDashboard(booking) {
        this.showingCustomerList = false;
        this.updateBreadcrumb(booking.customer_name || booking.name);
        this.updateLastUpdated();

        // Clone template
        const template = document.getElementById('booking-dashboard-template');
        const clone = template.content.cloneNode(true);

        // Populate booking profile
        this.setFieldValue(clone, 'customer_name', booking.customer_name || 'Unknown');
        this.setFieldValue(clone, 'booking_id', booking.booking_id);
        this.setFieldValue(clone, 'email', booking.customer_email || 'Not provided');
        this.setFieldValue(clone, 'phone', booking.customer_phone || 'Not provided');

        // Status badge
        const statusBadge = clone.querySelector('[data-field="booking_status_badge"]');
        if (statusBadge) {
            statusBadge.textContent = booking.booking_status || 'Unknown';
            statusBadge.className = `status-badge status-${this.slugify(booking.booking_status || 'unknown')}`;
        }

        // Meeting details
        this.setFieldValue(clone, 'meeting_datetime', this.formatDateTime(booking.start_datetime));
        this.setFieldValue(clone, 'meeting_type', booking.meeting_type_data?.title || booking.meeting_type || 'Not specified');
        this.setFieldValue(clone, 'duration', booking.meeting_type_data?.duration ? `${booking.meeting_type_data.duration} minutes` : 'Not specified');
        this.setFieldValue(clone, 'department', booking.meeting_type_data?.department || 'Not specified');

        // Stats
        this.setFieldValue(clone, 'total_bookings', booking.total_bookings || 1);
        this.setFieldValue(clone, 'creation_date', this.formatDate(booking.creation));

        // Customer notes
        if (booking.customer_notes) {
            const notesSection = clone.querySelector('[data-container="notes-section"]');
            if (notesSection) {
                notesSection.style.display = 'block';
                this.setFieldValue(clone, 'customer_notes', booking.customer_notes);
            }
        }

        // Linked customer - show either linked card or no-customer card
        if (booking.linked_customer || booking.customer_link) {
            const linkedSection = clone.querySelector('[data-container="linked-customer"]');
            if (linkedSection) {
                linkedSection.style.display = 'block';
                this.setFieldValue(clone, 'linked_customer_name', booking.linked_customer?.customer_name || booking.customer_link);
                this.setFieldValue(clone, 'linked_customer_id', booking.customer_link || booking.linked_customer?.name || '');
            }
        } else {
            // No customer linked - show the "no customer" card
            const noCustomerSection = clone.querySelector('[data-container="no-customer-linked"]');
            if (noCustomerSection) {
                noCustomerSection.style.display = 'block';
            }
        }

        // Assigned users
        const assignedContainer = clone.querySelector('[data-container="assigned-users"]');
        if (booking.assigned_users && booking.assigned_users.length > 0) {
            assignedContainer.innerHTML = '';
            booking.assigned_users.forEach(user => {
                const userItem = document.createElement('div');
                userItem.className = 'user-item';
                userItem.innerHTML = `
                    <div class="user-avatar-small">${this.getInitials(user.full_name || user.user)}</div>
                    <div class="user-info">
                        <div class="user-name">${this.escapeHtml(user.full_name || user.user)}</div>
                        <div class="user-email">${this.escapeHtml(user.email || '')}</div>
                        ${user.is_primary_host ? '<span class="primary-badge">Primary Host</span>' : ''}
                    </div>
                `;
                assignedContainer.appendChild(userItem);
            });
        }

        // Other bookings
        const otherBookingsContainer = clone.querySelector('[data-container="other-bookings"]');
        if (booking.other_bookings && booking.other_bookings.length > 0) {
            otherBookingsContainer.innerHTML = '';
            booking.other_bookings.forEach(b => {
                const bookingItem = document.createElement('div');
                bookingItem.className = 'booking-item clickable';
                bookingItem.innerHTML = `
                    <div class="booking-info">
                        <div class="booking-name">${this.escapeHtml(b.customer_name)}</div>
                        <div class="booking-meta">${this.formatDateTime(b.start_datetime)} - ${this.escapeHtml(b.meeting_type || 'Meeting')}</div>
                    </div>
                    <span class="status-badge status-${this.slugify(b.booking_status)}">${this.escapeHtml(b.booking_status)}</span>
                `;
                bookingItem.addEventListener('click', () => this.loadRecord(b.name, 'booking'));
                otherBookingsContainer.appendChild(bookingItem);
            });
        }

        // Attach action listeners
        this.attachBookingActionListeners(clone, booking);

        // Replace content with back button
        this.contentContainer.innerHTML = '';

        // Add back button
        const backBtn = document.createElement('button');
        backBtn.className = 'back-button';
        backBtn.innerHTML = '← Back to List';
        backBtn.onclick = () => {
            window.location.href = this.getBackURL();
        };
        this.contentContainer.appendChild(backBtn);

        this.contentContainer.appendChild(clone);
    }

    attachBookingActionListeners(element, booking) {
        // View full booking
        element.querySelector('[data-action="view-full-booking"]')?.addEventListener('click', () => {
            window.open(`/app/mm-meeting-booking/${booking.booking_id}`, '_blank');
        });

        // Send email
        element.querySelector('[data-action="send-email-booking"]')?.addEventListener('click', () => {
            if (booking.customer_email) {
                window.location.href = `mailto:${booking.customer_email}`;
            } else {
                alert('No email address available for this booking');
            }
        });

        // Reschedule
        element.querySelector('[data-action="reschedule-booking"]')?.addEventListener('click', () => {
            window.open(`/app/mm-meeting-booking/${booking.booking_id}`, '_blank');
        });

        // View linked customer
        element.querySelector('[data-action="view-linked-customer"]')?.addEventListener('click', () => {
            if (booking.linked_customer) {
                this.loadRecord(booking.linked_customer.name, 'customer');
            } else if (booking.customer_link) {
                this.loadRecord(booking.customer_link, 'customer');
            }
        });

        // Create customer from booking
        element.querySelector('[data-action="create-customer-from-booking"]')?.addEventListener('click', () => {
            this.handleCreateCustomerFromBooking(booking.booking_id);
        });

        // Link to existing customer
        element.querySelector('[data-action="link-to-existing-customer"]')?.addEventListener('click', () => {
            this.openLinkCustomerModal(booking.booking_id);
        });

        // Unlink customer
        element.querySelector('[data-action="unlink-customer"]')?.addEventListener('click', () => {
            this.handleUnlinkCustomer(booking.booking_id);
        });
    }

    async handleCreateCustomerFromBooking(bookingId) {
        if (!confirm('Create a new ERPNext Customer from this booking\'s details?')) {
            return;
        }

        try {
            const result = await this.apiCall('support_center.api.customer_lookup.create_customer_from_booking', {
                booking_id: bookingId
            });

            if (result.success) {
                alert(`Customer "${result.customer_name}" created successfully!`);
                // Reload the booking view to show the new link
                this.loadRecord(bookingId, 'booking');
            }
        } catch (error) {
            console.error('Error creating customer:', error);
            alert('Error creating customer: ' + (error.message || 'Unknown error'));
        }
    }

    openLinkCustomerModal(bookingId) {
        this.currentLinkingBookingId = bookingId;
        this.selectedCustomerForLinking = null;

        const modal = document.getElementById('link-customer-modal');
        const searchInput = document.getElementById('link-customer-search');
        const resultsContainer = document.getElementById('link-customer-search-results');
        const selectedContainer = document.getElementById('selected-customer');
        const confirmBtn = modal.querySelector('[data-action="confirm-link-customer"]');

        // Reset state
        if (searchInput) searchInput.value = '';
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (selectedContainer) selectedContainer.style.display = 'none';
        if (confirmBtn) confirmBtn.disabled = true;

        // Show modal
        modal.style.display = 'flex';

        // Setup search input listener
        const linkSearchInput = document.getElementById('link-customer-search');
        if (linkSearchInput) {
            linkSearchInput.focus();

            // Remove old listener and add new one
            const newInput = linkSearchInput.cloneNode(true);
            linkSearchInput.parentNode.replaceChild(newInput, linkSearchInput);

            let searchTimeout;
            newInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                const query = e.target.value.trim();

                if (query.length < 2) {
                    resultsContainer.style.display = 'none';
                    return;
                }

                searchTimeout = setTimeout(() => {
                    this.searchCustomersForLinking(query);
                }, 300);
            });
        }

        // Setup modal close handlers
        this.setupLinkModalListeners(modal);
    }

    setupLinkModalListeners(modal) {
        // Close handlers
        modal.querySelectorAll('[data-action="close-link-modal"]').forEach(el => {
            el.addEventListener('click', () => {
                modal.style.display = 'none';
            });
        });

        // Clear selection
        modal.querySelector('[data-action="clear-customer-selection"]')?.addEventListener('click', () => {
            this.selectedCustomerForLinking = null;
            document.getElementById('selected-customer').style.display = 'none';
            document.getElementById('link-customer-search-results').style.display = 'none';
            document.getElementById('link-customer-search').value = '';
            modal.querySelector('[data-action="confirm-link-customer"]').disabled = true;
        });

        // Confirm link
        modal.querySelector('[data-action="confirm-link-customer"]')?.addEventListener('click', async () => {
            if (!this.selectedCustomerForLinking || !this.currentLinkingBookingId) return;

            const btn = modal.querySelector('[data-action="confirm-link-customer"]');
            const btnText = btn.querySelector('.btn-text');
            const btnLoading = btn.querySelector('.btn-loading');

            try {
                btn.disabled = true;
                btnText.style.display = 'none';
                btnLoading.style.display = 'inline-flex';

                const result = await this.apiCall('support_center.api.customer_lookup.link_booking_to_customer', {
                    booking_id: this.currentLinkingBookingId,
                    customer_id: this.selectedCustomerForLinking.id
                });

                if (result.success) {
                    modal.style.display = 'none';
                    alert(`Booking linked to customer "${result.customer_name}"`);
                    // Reload the booking view
                    this.loadRecord(this.currentLinkingBookingId, 'booking');
                }
            } catch (error) {
                console.error('Error linking customer:', error);
                alert('Error linking customer: ' + (error.message || 'Unknown error'));
            } finally {
                btn.disabled = false;
                btnText.style.display = 'inline';
                btnLoading.style.display = 'none';
            }
        });
    }

    async searchCustomersForLinking(query) {
        const resultsContainer = document.getElementById('link-customer-search-results');

        try {
            const results = await this.apiCall('support_center.api.customer_lookup.search_customers_for_linking', {
                query: query,
                limit: 10
            });

            if (results.length === 0) {
                resultsContainer.innerHTML = '<div class="no-results">No customers found</div>';
            } else {
                resultsContainer.innerHTML = results.map(customer => `
                    <div class="customer-result-item" data-customer-id="${this.escapeHtml(customer.id)}">
                        <div class="customer-result-name">${this.escapeHtml(customer.name)}</div>
                        <div class="customer-result-details">
                            ${customer.email ? this.escapeHtml(customer.email) : ''}
                            ${customer.email && customer.phone ? ' | ' : ''}
                            ${customer.phone ? this.escapeHtml(customer.phone) : ''}
                        </div>
                    </div>
                `).join('');

                // Add click handlers
                resultsContainer.querySelectorAll('.customer-result-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const customerId = item.getAttribute('data-customer-id');
                        const customer = results.find(c => c.id === customerId);
                        if (customer) {
                            this.selectCustomerForLinking(customer);
                        }
                    });
                });
            }

            resultsContainer.style.display = 'block';
        } catch (error) {
            console.error('Error searching customers:', error);
            resultsContainer.innerHTML = '<div class="no-results">Error searching customers</div>';
            resultsContainer.style.display = 'block';
        }
    }

    selectCustomerForLinking(customer) {
        this.selectedCustomerForLinking = customer;

        const resultsContainer = document.getElementById('link-customer-search-results');
        const selectedContainer = document.getElementById('selected-customer');
        const modal = document.getElementById('link-customer-modal');

        resultsContainer.style.display = 'none';
        selectedContainer.style.display = 'flex';

        document.getElementById('selected-customer-name').textContent = customer.name;
        document.getElementById('selected-customer-details').textContent =
            [customer.email, customer.phone].filter(Boolean).join(' | ') || customer.id;

        modal.querySelector('[data-action="confirm-link-customer"]').disabled = false;
    }

    async handleUnlinkCustomer(bookingId) {
        if (!confirm('Remove the customer link from this booking?')) {
            return;
        }

        try {
            const result = await this.apiCall('support_center.api.customer_lookup.unlink_booking_from_customer', {
                booking_id: bookingId
            });

            if (result.success) {
                alert('Customer link removed');
                // Reload the booking view
                this.loadRecord(bookingId, 'booking');
            }
        } catch (error) {
            console.error('Error unlinking customer:', error);
            alert('Error unlinking customer: ' + (error.message || 'Unknown error'));
        }
    }

    // ============================================
    // Contact Dashboard Methods
    // ============================================

    renderContactDashboard(contact) {
        this.showingCustomerList = false;
        this.updateBreadcrumb(contact.name);
        this.updateLastUpdated();

        // Clone template
        const template = document.getElementById('contact-dashboard-template');
        const clone = template.content.cloneNode(true);

        // Populate contact profile
        const initials = this.getInitials(contact.name);
        this.setFieldValue(clone, 'contact_initials', initials);
        this.setFieldValue(clone, 'contact_name', contact.name || 'Unknown');
        this.setFieldValue(clone, 'contact_id', contact.contact_id);
        this.setFieldValue(clone, 'email', contact.email || 'Not provided');
        this.setFieldValue(clone, 'phone', contact.phone || 'Not provided');
        this.setFieldValue(clone, 'company_name', contact.company_name || 'Not provided');
        this.setFieldValue(clone, 'designation', contact.designation || 'Not provided');

        // Stats
        this.setFieldValue(clone, 'creation_date', this.formatDate(contact.creation));
        this.setFieldValue(clone, 'total_bookings', contact.total_bookings || 0);
        this.setFieldValue(clone, 'is_primary', contact.is_primary_contact ? 'Yes' : 'No');

        // Linked records
        const linkedContainer = clone.querySelector('[data-container="linked-records"]');
        if (contact.linked_records && contact.linked_records.length > 0) {
            linkedContainer.innerHTML = '';
            contact.linked_records.forEach(record => {
                const recordItem = document.createElement('div');
                recordItem.className = 'record-item clickable';
                recordItem.innerHTML = `
                    <div class="record-type">${this.escapeHtml(record.link_doctype)}</div>
                    <div class="record-name">${this.escapeHtml(record.link_name)}</div>
                `;
                recordItem.addEventListener('click', () => {
                    if (record.link_doctype === 'Customer') {
                        this.loadRecord(record.link_name, 'customer');
                    } else {
                        window.open(`/app/${this.slugify(record.link_doctype)}/${record.link_name}`, '_blank');
                    }
                });
                linkedContainer.appendChild(recordItem);
            });
        }

        // Bookings
        const bookingsContainer = clone.querySelector('[data-container="contact-bookings"]');
        if (contact.bookings && contact.bookings.length > 0) {
            bookingsContainer.innerHTML = '';
            contact.bookings.forEach(b => {
                const bookingItem = document.createElement('div');
                bookingItem.className = 'booking-item clickable';
                bookingItem.innerHTML = `
                    <div class="booking-info">
                        <div class="booking-name">${this.escapeHtml(b.customer_name)}</div>
                        <div class="booking-meta">${this.formatDateTime(b.start_datetime)} - ${this.escapeHtml(b.meeting_type || 'Meeting')}</div>
                    </div>
                    <span class="status-badge status-${this.slugify(b.booking_status)}">${this.escapeHtml(b.booking_status)}</span>
                `;
                bookingItem.addEventListener('click', () => this.loadRecord(b.name, 'booking'));
                bookingsContainer.appendChild(bookingItem);
            });
        }

        // Attach action listeners
        this.attachContactActionListeners(clone, contact);

        // Replace content with back button
        this.contentContainer.innerHTML = '';

        // Add back button
        const backBtn = document.createElement('button');
        backBtn.className = 'back-button';
        backBtn.innerHTML = '← Back to List';
        backBtn.onclick = () => {
            window.location.href = this.getBackURL();
        };
        this.contentContainer.appendChild(backBtn);

        this.contentContainer.appendChild(clone);
    }

    attachContactActionListeners(element, contact) {
        // View full contact
        element.querySelector('[data-action="view-full-contact"]')?.addEventListener('click', () => {
            window.open(`/app/contact/${contact.contact_id}`, '_blank');
        });

        // Book meeting
        element.querySelector('[data-action="book-meeting-contact"]')?.addEventListener('click', () => {
            const params = new URLSearchParams({
                customer_name: contact.name,
                customer_email: contact.email || '',
                customer_phone: contact.phone || ''
            });
            window.location.href = `/meeting-booking?${params.toString()}`;
        });

        // Send email
        element.querySelector('[data-action="send-email-contact"]')?.addEventListener('click', () => {
            if (contact.email) {
                window.location.href = `mailto:${contact.email}`;
            } else {
                alert('No email address available for this contact');
            }
        });
    }

    // ============================================
    // User Dashboard Methods
    // ============================================

    renderUserDashboard(user) {
        this.showingCustomerList = false;
        this.updateBreadcrumb(user.name || user.email);
        this.updateLastUpdated();

        // Clone template
        const template = document.getElementById('user-dashboard-template');
        const clone = template.content.cloneNode(true);

        // Populate user profile
        const initials = this.getInitials(user.name || user.email);
        this.setFieldValue(clone, 'user_initials', initials);
        this.setFieldValue(clone, 'user_name', user.name || user.email);
        this.setFieldValue(clone, 'user_id', user.user_id);
        this.setFieldValue(clone, 'email', user.email || 'Not provided');
        this.setFieldValue(clone, 'phone', user.phone || 'Not provided');

        // User type badge
        const typeBadge = clone.querySelector('[data-field="user_type_badge"]');
        if (typeBadge) {
            typeBadge.textContent = user.user_type || 'User';
            typeBadge.className = `status-badge status-${this.slugify(user.user_type || 'user')}`;
        }

        // Stats
        this.setFieldValue(clone, 'creation_date', this.formatDate(user.creation));
        this.setFieldValue(clone, 'last_login', user.last_login ? this.formatDateTime(user.last_login) : 'Never');
        this.setFieldValue(clone, 'total_bookings', user.total_bookings || 0);
        this.setFieldValue(clone, 'total_hosted', user.total_hosted || 0);

        // Roles
        const rolesContainer = clone.querySelector('[data-field="roles"]');
        if (user.roles && user.roles.length > 0 && rolesContainer) {
            rolesContainer.innerHTML = user.roles.map(role =>
                `<span class="role-badge">${this.escapeHtml(role)}</span>`
            ).join('');
        }

        // Linked customer
        if (user.linked_customer) {
            const linkedSection = clone.querySelector('[data-container="linked-customer-user"]');
            if (linkedSection) {
                linkedSection.style.display = 'block';
                this.setFieldValue(clone, 'linked_customer_name', user.linked_customer.customer_name);
            }
        }

        // User's bookings
        const bookingsContainer = clone.querySelector('[data-container="user-bookings"]');
        if (user.bookings && user.bookings.length > 0) {
            bookingsContainer.innerHTML = '';
            user.bookings.forEach(b => {
                const bookingItem = document.createElement('div');
                bookingItem.className = 'booking-item clickable';
                bookingItem.innerHTML = `
                    <div class="booking-info">
                        <div class="booking-name">${this.escapeHtml(b.customer_name)}</div>
                        <div class="booking-meta">${this.formatDateTime(b.start_datetime)} - ${this.escapeHtml(b.meeting_type || 'Meeting')}</div>
                    </div>
                    <span class="status-badge status-${this.slugify(b.booking_status)}">${this.escapeHtml(b.booking_status)}</span>
                `;
                bookingItem.addEventListener('click', () => this.loadRecord(b.name, 'booking'));
                bookingsContainer.appendChild(bookingItem);
            });
        }

        // Hosted meetings
        const hostedContainer = clone.querySelector('[data-container="hosted-meetings"]');
        if (user.hosted_meetings && user.hosted_meetings.length > 0) {
            hostedContainer.innerHTML = '';
            user.hosted_meetings.forEach(m => {
                const meetingItem = document.createElement('div');
                meetingItem.className = 'booking-item clickable';
                meetingItem.innerHTML = `
                    <div class="booking-info">
                        <div class="booking-name">${this.escapeHtml(m.customer_name)}</div>
                        <div class="booking-meta">${this.formatDateTime(m.start_datetime)} - ${this.escapeHtml(m.meeting_type || 'Meeting')}</div>
                        ${m.is_primary_host ? '<span class="primary-badge">Primary Host</span>' : ''}
                    </div>
                    <span class="status-badge status-${this.slugify(m.booking_status)}">${this.escapeHtml(m.booking_status)}</span>
                `;
                meetingItem.addEventListener('click', () => this.loadRecord(m.name, 'booking'));
                hostedContainer.appendChild(meetingItem);
            });
        }

        // Attach action listeners
        this.attachUserActionListeners(clone, user);

        // Replace content with back button
        this.contentContainer.innerHTML = '';

        // Add back button
        const backBtn = document.createElement('button');
        backBtn.className = 'back-button';
        backBtn.innerHTML = '← Back to List';
        backBtn.onclick = () => {
            window.location.href = this.getBackURL();
        };
        this.contentContainer.appendChild(backBtn);

        this.contentContainer.appendChild(clone);
    }

    attachUserActionListeners(element, user) {
        // View full user
        element.querySelector('[data-action="view-full-user"]')?.addEventListener('click', () => {
            window.open(`/app/user/${user.user_id}`, '_blank');
        });

        // Book meeting
        element.querySelector('[data-action="book-meeting-user"]')?.addEventListener('click', () => {
            const params = new URLSearchParams({
                customer_name: user.name || '',
                customer_email: user.email || '',
                customer_phone: user.phone || ''
            });
            window.location.href = `/meeting-booking?${params.toString()}`;
        });

        // Send email
        element.querySelector('[data-action="send-email-user"]')?.addEventListener('click', () => {
            if (user.email) {
                window.location.href = `mailto:${user.email}`;
            } else {
                alert('No email address available for this user');
            }
        });

        // View linked customer
        element.querySelector('[data-action="view-linked-customer-user"]')?.addEventListener('click', () => {
            if (user.linked_customer) {
                this.loadRecord(user.linked_customer.name, 'customer');
            }
        });
    }

    // ============================================
    // Utility Methods for New Dashboards
    // ============================================

    formatDateTime(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // ============================================
    // Skeleton Loaders
    // ============================================

    renderTableSkeletonRows(tbody, rowCount = 5) {
        const widths = [
            ['55%', '70%', '50%', '60%', '40%'],
            ['45%', '65%', '55%', '50%', '35%'],
            ['60%', '60%', '45%', '55%', '45%'],
            ['50%', '75%', '40%', '65%', '40%'],
            ['40%', '55%', '60%', '45%', '50%']
        ];
        let html = '';
        for (let i = 0; i < rowCount; i++) {
            const w = widths[i % widths.length];
            html += `<tr class="skeleton-table-row">
                <td><div class="skeleton skeleton-text" style="width:${w[0]}"></div></td>
                <td><div class="skeleton skeleton-text" style="width:${w[1]}"></div></td>
                <td><div class="skeleton skeleton-text" style="width:${w[2]}"></div></td>
                <td><div class="skeleton skeleton-text-sm" style="width:${w[3]}"></div></td>
                <td><div class="skeleton skeleton-text-sm" style="width:${w[4]}"></div></td>
            </tr>`;
        }
        tbody.innerHTML = html;
    }

    renderDetailSkeleton() {
        return `
            <button class="back-button" style="opacity:0.5;pointer-events:none;">← Back to Customer List</button>
            <div class="skeleton-detail-grid">
                <div class="skeleton-profile-card">
                    <div class="skeleton-avatar"></div>
                    <div class="skeleton skeleton-text-lg" style="width:60%;margin:12px auto 0"></div>
                    <div class="skeleton skeleton-text-sm" style="width:40%;margin:8px auto 0"></div>
                    <div class="skeleton skeleton-text" style="width:80%;margin:8px auto 0"></div>
                    <div style="border-top:1px solid var(--border);margin:16px 0"></div>
                    <div class="skeleton skeleton-text" style="width:70%;margin:0 auto 8px"></div>
                    <div class="skeleton skeleton-text" style="width:55%;margin:0 auto 8px"></div>
                    <div style="display:flex;gap:8px;margin-top:16px;justify-content:center">
                        <div class="skeleton" style="width:80px;height:32px;border-radius:6px"></div>
                        <div class="skeleton" style="width:80px;height:32px;border-radius:6px"></div>
                    </div>
                </div>
                <div class="skeleton-right-panel">
                    <div class="skeleton-card">
                        <div class="skeleton skeleton-text-lg" style="width:30%;margin-bottom:16px"></div>
                        <div class="skeleton skeleton-text" style="width:100%;margin-bottom:8px"></div>
                        <div class="skeleton skeleton-text" style="width:90%;margin-bottom:8px"></div>
                        <div class="skeleton skeleton-text" style="width:95%;margin-bottom:8px"></div>
                        <div class="skeleton skeleton-text" style="width:85%"></div>
                    </div>
                    <div class="skeleton-card">
                        <div class="skeleton skeleton-text-lg" style="width:25%;margin-bottom:16px"></div>
                        <div class="skeleton skeleton-text" style="width:100%;margin-bottom:8px"></div>
                        <div class="skeleton skeleton-text" style="width:80%;margin-bottom:8px"></div>
                        <div class="skeleton skeleton-text" style="width:70%"></div>
                    </div>
                </div>
            </div>
        `;
    }

    // ============================================
    // Enhanced Header (breadcrumb, timestamp, count)
    // ============================================

    updateBreadcrumb(recordName) {
        const breadcrumb = document.getElementById('dashboard-breadcrumb');
        if (!breadcrumb) return;

        if (recordName) {
            breadcrumb.innerHTML = `
                <a href="/">Home</a>
                <span class="breadcrumb-separator">/</span>
                <a href="/support-center">Support Center</a>
                <span class="breadcrumb-separator">/</span>
                <span class="breadcrumb-current">${this.escapeHtml(recordName)}</span>
            `;
        } else {
            breadcrumb.innerHTML = `
                <a href="/">Home</a>
                <span class="breadcrumb-separator">/</span>
                <span class="breadcrumb-current">Support Center</span>
            `;
        }
    }

    updateLastUpdated() {
        const el = document.getElementById('last-updated');
        if (!el) return;
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        el.textContent = `Updated ${timeStr}`;
    }

    updateRecordCountBadge(count) {
        const el = document.getElementById('record-count-badge');
        if (!el) return;
        if (count !== undefined && count !== null) {
            el.textContent = `${count.toLocaleString()} records`;
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    }

    // ============================================
    // Command Palette (⌘+K)
    // ============================================

    initializeCommandPalette() {
        const palette = document.getElementById('command-palette');
        if (!palette) return;

        const backdrop = palette.querySelector('.command-palette-backdrop');
        const input = document.getElementById('command-palette-input');

        // Close on backdrop click
        backdrop.addEventListener('click', () => this.closeCommandPalette());

        // Search with debounce
        let searchTimeout;
        input.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const query = input.value.trim();
            if (query.length === 0) {
                this.renderDefaultPaletteItems();
            } else {
                searchTimeout = setTimeout(() => this.searchCommandPalette(query), 250);
            }
        });

        // Keyboard navigation inside palette
        input.addEventListener('keydown', (e) => this.handleCommandPaletteKeydown(e));
    }

    toggleCommandPalette() {
        const palette = document.getElementById('command-palette');
        if (!palette) return;
        if (palette.classList.contains('open')) {
            this.closeCommandPalette();
        } else {
            this.openCommandPalette();
        }
    }

    openCommandPalette() {
        const palette = document.getElementById('command-palette');
        if (!palette) return;
        palette.classList.add('open');
        const input = document.getElementById('command-palette-input');
        input.value = '';
        this.paletteActiveIndex = 0;
        this.renderDefaultPaletteItems();
        setTimeout(() => input.focus(), 50);
    }

    closeCommandPalette() {
        const palette = document.getElementById('command-palette');
        if (!palette) return;
        palette.classList.remove('open');
    }

    renderDefaultPaletteItems() {
        const results = document.getElementById('command-palette-results');
        if (!results) return;

        results.innerHTML = `
            <div class="command-palette-group">
                <div class="command-palette-group-title">Navigate</div>
                <div class="command-palette-item active" data-action="navigate" data-url="/retention-dashboard">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                    <span>Retention Dashboard</span>
                </div>
            </div>
            <div class="command-palette-group">
                <div class="command-palette-group-title">Filter</div>
                <div class="command-palette-item" data-action="filter" data-category="all">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                    <span>All Records</span>
                </div>
                <div class="command-palette-item" data-action="filter" data-category="contact">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    <span>Customers</span>
                </div>
                <div class="command-palette-item" data-action="filter" data-category="customer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line></svg>
                    <span>Sales Orders</span>
                </div>
                <div class="command-palette-item" data-action="filter" data-category="booking">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <span>Bookings</span>
                </div>
                <div class="command-palette-item" data-action="filter" data-category="ticket">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <span>Support Tickets</span>
                </div>
            </div>
        `;

        this.paletteActiveIndex = 0;
        this.updatePaletteActiveItem();
        this.bindCommandPaletteItemClicks();
    }

    async searchCommandPalette(query) {
        const results = document.getElementById('command-palette-results');
        if (!results) return;

        results.innerHTML = `
            <div class="command-palette-group">
                <div class="command-palette-group-title">Searching...</div>
                <div class="command-palette-item" style="opacity:0.5;pointer-events:none">
                    <span>Looking for "${this.escapeHtml(query)}"...</span>
                </div>
            </div>
        `;

        try {
            const data = await this.apiCall('support_center.api.customer_lookup.search_customers', {
                query: query,
                limit: 8
            });

            let html = '';

            if (data && data.length > 0) {
                html += `<div class="command-palette-group"><div class="command-palette-group-title">Records</div>`;
                data.forEach(r => {
                    const typeLabel = r.type === 'contact' ? 'Customer' : r.type === 'customer' ? 'Sales Order' : r.type === 'booking' ? 'Booking' : r.type === 'ticket' ? 'Ticket' : r.type;
                    html += `
                        <div class="command-palette-item" data-action="record" data-record-id="${this.escapeHtml(r.id)}" data-record-type="${this.escapeHtml(r.type)}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            <span>${this.escapeHtml(r.name)}</span>
                            <span class="command-palette-item-meta">${this.escapeHtml(r.email || '')} · ${typeLabel}</span>
                        </div>
                    `;
                });
                html += `</div>`;
            } else {
                html += `
                    <div class="command-palette-group">
                        <div class="command-palette-group-title">No results</div>
                        <div class="command-palette-item" style="opacity:0.5;pointer-events:none">
                            <span>No records found for "${this.escapeHtml(query)}"</span>
                        </div>
                    </div>
                `;
            }

            results.innerHTML = html;
            this.paletteActiveIndex = 0;
            this.updatePaletteActiveItem();
            this.bindCommandPaletteItemClicks();

        } catch (error) {
            console.error('Command palette search failed:', error);
            results.innerHTML = `
                <div class="command-palette-group">
                    <div class="command-palette-group-title">Error</div>
                    <div class="command-palette-item" style="opacity:0.5;pointer-events:none">
                        <span>Search failed. Please try again.</span>
                    </div>
                </div>
            `;
        }
    }

    handleCommandPaletteKeydown(e) {
        const results = document.getElementById('command-palette-results');
        if (!results) return;
        const items = results.querySelectorAll('.command-palette-item:not([style*="pointer-events:none"])');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.paletteActiveIndex = (this.paletteActiveIndex + 1) % items.length;
            this.updatePaletteActiveItem();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.paletteActiveIndex = (this.paletteActiveIndex - 1 + items.length) % items.length;
            this.updatePaletteActiveItem();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (items[this.paletteActiveIndex]) {
                this.executePaletteAction(items[this.paletteActiveIndex]);
            }
        }
    }

    updatePaletteActiveItem() {
        const results = document.getElementById('command-palette-results');
        if (!results) return;
        const items = results.querySelectorAll('.command-palette-item:not([style*="pointer-events:none"])');
        items.forEach((item, i) => {
            item.classList.toggle('active', i === this.paletteActiveIndex);
        });
        // Scroll active item into view
        if (items[this.paletteActiveIndex]) {
            items[this.paletteActiveIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    bindCommandPaletteItemClicks() {
        const results = document.getElementById('command-palette-results');
        if (!results) return;
        results.querySelectorAll('.command-palette-item:not([style*="pointer-events:none"])').forEach((item, i) => {
            item.addEventListener('click', () => {
                this.paletteActiveIndex = i;
                this.executePaletteAction(item);
            });
            item.addEventListener('mouseenter', () => {
                this.paletteActiveIndex = i;
                this.updatePaletteActiveItem();
            });
        });
    }

    executePaletteAction(item) {
        const action = item.dataset.action;
        this.closeCommandPalette();

        if (action === 'navigate') {
            window.location.href = item.dataset.url;
        } else if (action === 'filter') {
            const category = item.dataset.category;
            this.setCategory(category);
        } else if (action === 'record') {
            const recordId = item.dataset.recordId;
            const recordType = item.dataset.recordType;
            this.loadRecord(recordId, recordType);
        }
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.supportDashboard = new SupportDashboard();
});
