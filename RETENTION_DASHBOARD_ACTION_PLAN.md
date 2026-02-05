# Retention Dashboard - Action Plan

## Overview

This action plan addresses 50+ identified issues in the retention dashboard, organized by priority and category. Total estimated effort: **3-4 weeks**.

---

## Phase 1: UI/UX Fixes (Start Here) - 3-5 days

### Priority: HIGH | Effort: Medium | User Impact: HIGH

These fixes improve usability and accessibility without requiring backend changes.

### 1.1 Accessibility Improvements

**Issue #17: Add ARIA Labels**
- **Files**: `www/retention-dashboard/index.html`, `public/js/retention-dashboard.js`
- **Effort**: 4 hours
- **Tasks**:
  ```html
  <!-- Before -->
  <button class="action-btn view-detail-btn" data-customer-id="...">

  <!-- After -->
  <button class="action-btn view-detail-btn"
          data-customer-id="..."
          aria-label="View details for ${customer.customer_name}"
          title="View Details">
  ```
  - Add `aria-label` to all interactive elements
  - Add `role` attributes to custom components
  - Test with screen reader (NVDA/JAWS)

**Issue #18: Focus Management in Modal**
- **File**: `public/js/retention-dashboard.js` lines 522-560
- **Effort**: 2 hours
- **Tasks**:
  ```javascript
  showClientDetail(customerId) {
      // ... existing code
      this.modal.classList.add('open');

      // Add focus trap
      const firstFocusable = this.modal.querySelector('button, [href], input');
      if (firstFocusable) {
          setTimeout(() => firstFocusable.focus(), 100);
      }

      // Add Escape key handler
      this.modal.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') this.closeModal();
      });
  }
  ```

**Issue #19: Color-Only Status Indicators**
- **Files**: `index.html` lines 312-321, CSS file
- **Effort**: 2 hours
- **Tasks**:
  ```html
  <!-- Before -->
  <span class="status-dot status-overdue"></span>

  <!-- After -->
  <span class="status-dot status-overdue" aria-label="Overdue">
      <span class="sr-only">Overdue</span>
  </span>
  ```
  - Add screen-reader-only text
  - Consider adding icons alongside colors
  - Add pattern fills for colorblind users

### 1.2 Loading States & Error Handling

**Issue #11: Global Loading State**
- **File**: `public/js/retention-dashboard.js` lines 168-200
- **Effort**: 3 hours
- **Tasks**:
  ```javascript
  async loadDashboard() {
      this.showGlobalLoading();
      try {
          const [kpis, clients, products] = await Promise.all([
              this.apiCall('get_dashboard_kpis'),
              this.apiCall('get_clients_by_renewal_status', {limit: 10}),
              this.apiCall('get_product_retention_analysis')
          ]);
          this.renderKPIs(kpis);
          this.renderAtRiskClients(clients);
      } catch (error) {
          this.showError('Failed to load dashboard. Please refresh the page.');
      } finally {
          this.hideGlobalLoading();
      }
  }

  showGlobalLoading() {
      const overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = '<div class="spinner"></div><p>Loading...</p>';
      document.body.appendChild(overlay);
  }
  ```

**Issue #14: Better Error Messages**
- **File**: `public/js/retention-dashboard.js` lines 1289-1306
- **Effort**: 2 hours
- **Tasks**:
  ```javascript
  async apiCall(method, args) {
      try {
          const response = await fetch(`/api/method/${method}`, {...});

          if (!response.ok) {
              if (response.status === 403) {
                  throw new Error('You do not have permission to view this data.');
              }
              if (response.status === 401) {
                  window.location.href = '/login';
                  return;
              }
              throw new Error(`Server error: ${response.statusText}`);
          }

          const data = await response.json();
          if (data.exc) {
              throw new Error(data._server_messages || 'An error occurred');
          }
          return data.message;
      } catch (error) {
          console.error('API Error:', method, error);
          this.showToast(error.message, 'error');
          throw error;
      }
  }
  ```

### 1.3 UI Polish & User Experience

**Issue #33: Add Pagination UI**
- **File**: `public/js/retention-dashboard.js`
- **Effort**: 4 hours
- **Tasks**:
  ```javascript
  renderClients(clients, total) {
      // ... render table

      // Add pagination controls
      const paginationHTML = `
          <div class="pagination">
              <button class="btn-secondary"
                      onclick="this.loadPreviousPage()"
                      ${this.currentPage === 1 ? 'disabled' : ''}>
                  Previous
              </button>
              <span class="page-info">
                  Page ${this.currentPage} of ${Math.ceil(total / this.pageSize)}
                  (${clients.length} of ${total} total)
              </span>
              <button class="btn-secondary"
                      onclick="this.loadNextPage()"
                      ${clients.length < this.pageSize ? 'disabled' : ''}>
                  Next
              </button>
          </div>
      `;
      container.insertAdjacentHTML('beforeend', paginationHTML);
  }
  ```

**Issue #49: Add Help/Documentation**
- **Files**: `index.html`, `public/js/retention-dashboard.js`
- **Effort**: 3 hours
- **Tasks**:
  - Add help icon tooltips to all KPI cards
  - Add "?" button in header that opens help modal
  - Create help content explaining metrics
  ```html
  <div class="kpi-content">
      <span class="kpi-value" id="kpi-renewal-rate">-</span>
      <span class="kpi-label">
          Renewal Rate
          <button class="help-icon"
                  aria-label="What is renewal rate?"
                  title="Percentage of customers who renewed vs churned">
              <svg><!-- question mark icon --></svg>
          </button>
      </span>
  </div>
  ```

**Issue #13: Remove Inline Event Handlers**
- **File**: `public/js/retention-dashboard.js` lines 661, 678, 687
- **Effort**: 2 hours
- **Tasks**:
  ```javascript
  // Before
  <div onclick="window.open('/app/sales-order/${id}', '_blank')">

  // After
  <div class="order-row" data-order-id="${this.escapeHtml(id)}">

  // In JavaScript
  document.querySelectorAll('.order-row').forEach(row => {
      row.addEventListener('click', (e) => {
          const orderId = row.dataset.orderId;
          window.open(`/app/sales-order/${orderId}`, '_blank');
      });
  });
  ```

### 1.4 Mobile Responsiveness

**Issue #48: Mobile Layout**
- **File**: `public/css/retention-dashboard.css`
- **Effort**: 8 hours
- **Tasks**:
  - Add media queries for tablet (768px) and mobile (480px)
  - Convert KPI grid to 2-column on tablet, 1-column on mobile
  - Make calendar view swipeable on mobile
  - Convert client table to card layout on mobile
  ```css
  @media (max-width: 768px) {
      .kpi-grid {
          grid-template-columns: repeat(2, 1fr);
      }

      .clients-table {
          display: none; /* Hide table */
      }

      .clients-card-view {
          display: block; /* Show cards instead */
      }

      .calendar-grid {
          font-size: 0.8rem;
      }
  }

  @media (max-width: 480px) {
      .kpi-grid {
          grid-template-columns: 1fr;
      }
  }
  ```

### 1.5 Performance - Client Side

**Issue #16: Cache Chart Data**
- **File**: `public/js/retention-dashboard.js`
- **Effort**: 3 hours
- **Tasks**:
  ```javascript
  constructor() {
      this.cache = new Map();
      this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  }

  getCachedData(key) {
      const cached = this.cache.get(key);
      if (!cached) return null;

      const age = Date.now() - cached.timestamp;
      if (age > this.CACHE_DURATION) {
          this.cache.delete(key);
          return null;
      }
      return cached.data;
  }

  setCachedData(key, data) {
      this.cache.set(key, {
          data: data,
          timestamp: Date.now()
      });
  }

  async loadTrendData() {
      const cached = this.getCachedData('trend_data');
      if (cached) {
          this.renderCharts(cached);
          return;
      }

      const data = await this.apiCall('get_trend_data', {months: 12});
      this.setCachedData('trend_data', data);
      this.renderCharts(data);
  }
  ```

**Issue #12: Proper Chart Cleanup**
- **File**: `public/js/retention-dashboard.js` lines 828-942
- **Effort**: 1 hour
- **Tasks**:
  ```javascript
  destroyChart(chart) {
      if (chart && typeof chart.destroy === 'function') {
          try {
              chart.destroy();
              chart = null;
          } catch (e) {
              console.warn('Chart destroy failed:', e);
          }
      }
      return null;
  }

  // Use it
  this.renewalRateChart = this.destroyChart(this.renewalRateChart);
  ```

**Subtotal for Phase 1: 34 hours (4-5 days)**

---

## Phase 2: Critical Security Fixes - 2-3 days

### Priority: CRITICAL | Effort: Medium | User Impact: HIGH

**Must complete before production deployment.**

### 2.1 Permission Checks (CRITICAL)

**Issue #1, #37: Add Permission Checks to All APIs**
- **File**: `api/retention_dashboard.py`
- **Effort**: 8 hours
- **Tasks**:

**Step 1:** Create permission helper module
```python
# support_center/api/permissions.py
import frappe
from frappe import _

def has_retention_access():
    """Check if user has access to retention dashboard"""
    # Check if user is logged in
    if frappe.session.user == "Guest":
        return False

    # Check for required roles
    user_roles = frappe.get_roles()
    required_roles = ["Sales Manager", "System Manager", "Accounts Manager"]

    return any(role in user_roles for role in required_roles)

def require_retention_access(func):
    """Decorator to enforce retention dashboard permissions"""
    def wrapper(*args, **kwargs):
        if not has_retention_access():
            frappe.throw(
                _("You need Sales Manager or System Manager role to access this dashboard"),
                frappe.PermissionError
            )
        return func(*args, **kwargs)
    return wrapper
```

**Step 2:** Apply decorator to all whitelisted functions
```python
from support_center.api.permissions import require_retention_access

@frappe.whitelist()
@require_retention_access
def get_dashboard_kpis():
    # ... existing code

@frappe.whitelist()
@require_retention_access
def get_clients_by_renewal_status(status_filter=None, days_range=90, limit=50, offset=0):
    # ... existing code

# Apply to all 9 @frappe.whitelist() functions
```

**Issue #38: Per-Customer Permission Checks**
- **File**: `api/retention_dashboard.py` line 167
- **Effort**: 2 hours
- **Tasks**:
  ```python
  @frappe.whitelist()
  @require_retention_access
  def get_client_retention_detail(customer_id):
      # Validate existence
      if not frappe.db.exists("Customer", customer_id):
          frappe.throw(_("Customer not found"), frappe.DoesNotExistError)

      # Check user has permission to view this specific customer
      if not frappe.has_permission("Customer", "read", customer_id):
          frappe.throw(
              _("You do not have permission to view this customer"),
              frappe.PermissionError
          )

      # ... rest of code
  ```

### 2.2 Input Validation

**Issue #7, #39: Validate All User Inputs**
- **File**: `api/retention_dashboard.py`
- **Effort**: 4 hours
- **Tasks**:

**Create validation helper:**
```python
# support_center/api/validators.py
from frappe.utils import cint, getdate, validate_date
import frappe

def validate_status_filter(status_filter):
    """Validate renewal status filter"""
    valid_statuses = ["", None, "overdue", "due_soon", "active"]
    if status_filter not in valid_statuses:
        frappe.throw(_("Invalid status filter. Must be one of: overdue, due_soon, active"))
    return status_filter or ""

def validate_pagination(limit, offset):
    """Validate and clamp pagination parameters"""
    limit = cint(limit) if limit else 50
    offset = cint(offset) if offset else 0

    # Enforce reasonable limits
    if limit < 1 or limit > 100:
        limit = min(max(limit, 1), 100)

    if offset < 0:
        offset = 0

    return limit, offset

def validate_days_range(days_range):
    """Validate days range parameter"""
    days = cint(days_range) if days_range else 90
    # Clamp to reasonable range (1-365 days)
    return min(max(days, 1), 365)

def validate_date_range(start_date, end_date):
    """Validate date range parameters"""
    try:
        start = getdate(start_date) if start_date else getdate()
        end = getdate(end_date) if end_date else None
    except Exception:
        frappe.throw(_("Invalid date format. Use YYYY-MM-DD"))

    # Validate range isn't too large (max 1 year)
    if end and (end - start).days > 365:
        frappe.throw(_("Date range cannot exceed 1 year"))

    return start, end
```

**Apply validation to all APIs:**
```python
from support_center.api.validators import *

@frappe.whitelist()
@require_retention_access
def get_clients_by_renewal_status(status_filter=None, days_range=90, limit=50, offset=0):
    # Validate inputs
    status_filter = validate_status_filter(status_filter)
    days_range = validate_days_range(days_range)
    limit, offset = validate_pagination(limit, offset)

    # ... rest of code
```

**Issue #40: Date Input Validation**
- **File**: `api/retention_dashboard.py` line 272
- **Effort**: 1 hour
- **Tasks**:
  ```python
  @frappe.whitelist()
  @require_retention_access
  def get_renewal_calendar(start_date=None, end_date=None):
      start_date, end_date = validate_date_range(start_date, end_date)

      if not end_date:
          end_date = add_days(start_date, 90)

      # ... rest of code
  ```

### 2.3 Error Handling

**Issue #8: Add Try-Catch to All APIs**
- **File**: `api/retention_dashboard.py`
- **Effort**: 4 hours
- **Tasks**:
  ```python
  import logging

  logger = logging.getLogger("retention_dashboard")

  @frappe.whitelist()
  @require_retention_access
  def get_dashboard_kpis():
      try:
          logger.info(f"User {frappe.session.user} loading dashboard KPIs")

          # ... existing code

          logger.info("KPIs loaded successfully")
          return result

      except frappe.PermissionError:
          # Re-raise permission errors
          raise
      except Exception as e:
          logger.error(f"Error loading dashboard KPIs: {str(e)}", exc_info=True)
          frappe.log_error(
              title="Retention Dashboard Error",
              message=f"Failed to load KPIs: {str(e)}\nUser: {frappe.session.user}"
          )
          frappe.throw(_("Failed to load dashboard data. Please contact support."))
  ```

**Subtotal for Phase 2: 19 hours (2-3 days)**

---

## Phase 3: Performance Optimizations - 3-4 days

### Priority: HIGH | Effort: High | User Impact: MEDIUM

### 3.1 Fix N+1 Query Problem (CRITICAL)

**Issue #2: Optimize Client List Query**
- **File**: `api/retention_dashboard.py` lines 80-126
- **Effort**: 6 hours
- **Impact**: 10x performance improvement
- **Tasks**:

**Replace 5 subqueries with JOINs:**
```python
def get_clients_by_renewal_status(status_filter=None, days_range=90, limit=50, offset=0):
    # Validate inputs
    status_filter = validate_status_filter(status_filter)
    days_range = validate_days_range(days_range)
    limit, offset = validate_pagination(limit, offset)

    today = getdate(nowdate())

    # Optimized query with JOINs instead of subqueries
    customers = frappe.db.sql("""
        SELECT
            c.name as customer_id,
            c.customer_name,
            c.email_id as email,
            c.mobile_no as phone,
            c.customer_group,
            c.territory,
            c.creation as customer_since,
            COALESCE(so_agg.last_order_date, NULL) as last_order_date,
            COALESCE(so_agg.lifetime_value, 0) as lifetime_value,
            COALESCE(so_agg.total_orders, 0) as total_orders,
            COALESCE(so_agg.products_purchased, '') as products_purchased,
            sub_data.next_renewal_date
        FROM `tabCustomer` c
        LEFT JOIN (
            SELECT
                customer,
                MAX(transaction_date) as last_order_date,
                SUM(grand_total) as lifetime_value,
                COUNT(*) as total_orders,
                GROUP_CONCAT(DISTINCT custom_product SEPARATOR ', ') as products_purchased
            FROM `tabSales Order`
            WHERE docstatus = 1
            GROUP BY customer
        ) so_agg ON so_agg.customer = c.name
        LEFT JOIN (
            SELECT
                party,
                MIN(end_date) as next_renewal_date
            FROM `tabSubscription`
            WHERE party_type = 'Customer'
              AND status IN ('Active', 'Past Due Date', 'Unpaid')
            GROUP BY party
        ) sub_data ON sub_data.party = c.name
        WHERE c.disabled = 0
        ORDER BY so_agg.last_order_date DESC
        LIMIT %(limit)s OFFSET %(offset)s
    """, {"limit": limit, "offset": offset}, as_dict=True)

    # Process results (same as before)
    result = []
    for customer in customers:
        renewal_status = calculate_renewal_status(
            customer.get("next_renewal_date"),
            customer.get("last_order_date"),
            today
        )

        # Apply filter in Python (or ideally, move to SQL WHERE clause)
        if status_filter and renewal_status != status_filter:
            continue

        customer["renewal_status"] = renewal_status
        customer["days_until_renewal"] = calculate_days_until(customer.get("next_renewal_date"), today)
        customer["days_since_last_order"] = calculate_days_since(customer.get("last_order_date"), today)
        customer["lifetime_value"] = flt(customer.get("lifetime_value", 0), 2)
        customer["upsell_potential"] = calculate_customer_upsell_potential(customer)
        customer["priority_score"] = calculate_priority_score(customer)
        customer["priority_level"] = get_priority_label(customer["priority_score"])

        result.append(customer)

    # Sort by priority
    result.sort(key=lambda x: (
        0 if x["renewal_status"] in ["overdue", "due_soon"] else 1,
        -x["priority_score"],
        x.get("days_until_renewal") or 999
    ))

    return result
```

**Issue #3: Filter in SQL, Not Python**
- **Effort**: 2 hours
- **Tasks**: Move filtering logic into SQL WHERE clause using CASE statement

### 3.2 Database Indexes

**Issue #30: Add Missing Indexes**
- **File**: Create new file `patches/v1_0/add_retention_indexes.py`
- **Effort**: 2 hours
- **Tasks**:
  ```python
  import frappe

  def execute():
      """Add indexes for retention dashboard performance"""

      # Sales Order indexes
      frappe.db.sql("""
          CREATE INDEX IF NOT EXISTS idx_so_customer_date
          ON `tabSales Order` (customer, transaction_date, docstatus)
      """)

      frappe.db.sql("""
          CREATE INDEX IF NOT EXISTS idx_so_custom_order_type
          ON `tabSales Order` (custom_order_type, docstatus)
      """)

      # Subscription indexes
      frappe.db.sql("""
          CREATE INDEX IF NOT EXISTS idx_sub_party_end_date
          ON `tabSubscription` (party, end_date, status)
      """)

      # Customer index
      frappe.db.sql("""
          CREATE INDEX IF NOT EXISTS idx_customer_disabled
          ON `tabCustomer` (disabled)
      """)

      frappe.db.commit()
      print("Retention dashboard indexes created successfully")
  ```

### 3.3 Server-Side Caching

**Issue #31: Implement Redis Caching**
- **File**: `api/retention_dashboard.py`
- **Effort**: 4 hours
- **Tasks**:
  ```python
  from functools import wraps
  import hashlib
  import json

  def cache_result(ttl=300):
      """Decorator to cache function results in Redis"""
      def decorator(func):
          @wraps(func)
          def wrapper(*args, **kwargs):
              # Generate cache key from function name and args
              cache_key_data = {
                  "func": func.__name__,
                  "args": args,
                  "kwargs": kwargs,
                  "user": frappe.session.user
              }
              cache_key = f"retention_dashboard:{hashlib.md5(json.dumps(cache_key_data, sort_keys=True).encode()).hexdigest()}"

              # Try to get from cache
              cached = frappe.cache().get_value(cache_key)
              if cached:
                  logger.info(f"Cache HIT for {func.__name__}")
                  return cached

              # Execute function
              logger.info(f"Cache MISS for {func.__name__}")
              result = func(*args, **kwargs)

              # Store in cache
              frappe.cache().set_value(cache_key, result, expires_in_sec=ttl)

              return result
          return wrapper
      return decorator

  # Apply to expensive functions
  @frappe.whitelist()
  @require_retention_access
  @cache_result(ttl=300)  # Cache for 5 minutes
  def get_dashboard_kpis():
      # ... existing code
  ```

**Issue #5, #6: Optimize Date Arithmetic & Aggregations**
- **File**: `api/retention_dashboard.py` lines 766, 702-709
- **Effort**: 3 hours
- **Tasks**: Fix queries as identified in code review

**Subtotal for Phase 3: 17 hours (3-4 days)**

---

## Phase 4: Code Quality & Maintainability - 2-3 days

### Priority: MEDIUM | Effort: Medium | User Impact: LOW (developer experience)

### 4.1 Extract Magic Numbers

**Issue #9: Constants at Module Level**
- **File**: `api/retention_dashboard.py`
- **Effort**: 2 hours
- **Tasks**:
  ```python
  # At top of file after imports

  # Risk thresholds (in USD)
  RISK_THRESHOLDS = {
      "high": 5000,
      "medium": 1000,
      "low": 0
  }

  # Priority score weights
  PRIORITY_WEIGHTS = {
      "revenue": 40,
      "urgency": 35,
      "tier": 15,
      "engagement": 10
  }

  # Default parameters
  DEFAULT_DAYS_RANGE = 90
  DEFAULT_LIMIT = 50
  DEFAULT_DUE_SOON_DAYS = 30
  DEFAULT_CHURN_THRESHOLD_DAYS = 730  # 2 years

  # Upsell estimation
  PRICE_PER_SEAT = 50
  CROSS_SELL_VALUE = 500
  TIER_UPGRADE_VALUE = 200
  ```

### 4.2 Remove Code Duplication

**Issue #10: Extract Risk Level Helper**
- **Effort**: 1 hour
- **Tasks**:
  ```python
  def get_risk_level(annual_value):
      """Calculate risk level based on annual value"""
      if annual_value >= RISK_THRESHOLDS["high"]:
          return "high"
      elif annual_value >= RISK_THRESHOLDS["medium"]:
          return "medium"
      return "low"

  # Use everywhere instead of inline if/else blocks
  ```

### 4.3 Add Logging

**Issue #: Comprehensive Logging**
- **File**: `api/retention_dashboard.py`
- **Effort**: 3 hours
- **Tasks**:
  ```python
  import logging
  import time

  logger = logging.getLogger("retention_dashboard")

  def log_performance(func):
      """Decorator to log function performance"""
      @wraps(func)
      def wrapper(*args, **kwargs):
          start = time.time()
          logger.info(f"Starting {func.__name__}")

          try:
              result = func(*args, **kwargs)
              duration = time.time() - start

              # Warn on slow queries
              if duration > 1.0:
                  logger.warning(f"{func.__name__} took {duration:.2f}s (SLOW)")
              else:
                  logger.info(f"{func.__name__} completed in {duration:.2f}s")

              return result
          except Exception as e:
              logger.error(f"{func.__name__} failed: {str(e)}", exc_info=True)
              raise
      return wrapper
  ```

### 4.4 Unit Tests

**Issue #: Add Test Coverage**
- **Create**: `tests/test_retention_dashboard.py`
- **Effort**: 8 hours
- **Tasks**:
  ```python
  import unittest
  import frappe
  from support_center.api.retention_dashboard import (
      calculate_priority_score,
      calculate_renewal_status,
      get_risk_level
  )

  class TestRetentionDashboard(unittest.TestCase):

      def test_priority_score_high_value_overdue(self):
          """High-value overdue customer should score 85+"""
          customer = {
              "lifetime_value": 10000,
              "renewal_status": "overdue",
              "days_until_renewal": -30,
              "customer_group": "Enterprise",
              "total_orders": 12
          }
          score = calculate_priority_score(customer)
          self.assertGreaterEqual(score, 85)

      def test_renewal_status_overdue(self):
          """Customer with past renewal date should be overdue"""
          from frappe.utils import add_days, nowdate, getdate
          today = getdate(nowdate())
          past_date = add_days(today, -10)

          status = calculate_renewal_status(past_date, None, today)
          self.assertEqual(status, "overdue")

      def test_get_risk_level(self):
          """Risk levels should map correctly"""
          self.assertEqual(get_risk_level(6000), "high")
          self.assertEqual(get_risk_level(2000), "medium")
          self.assertEqual(get_risk_level(500), "low")
  ```

**Subtotal for Phase 4: 14 hours (2-3 days)**

---

## Phase 5: Missing Features - 1 week

### Priority: MEDIUM | Effort: High | User Impact: MEDIUM

### 5.1 Export Functionality

**Issue #41: CSV/Excel Export**
- **Effort**: 6 hours
- **Tasks**:
  - Add export button to Clients tab
  - Create backend API for CSV generation
  - Support filters (export only filtered clients)
  ```python
  @frappe.whitelist()
  @require_retention_access
  def export_clients_csv(status_filter=None):
      """Export client list to CSV"""
      import csv
      from io import StringIO

      clients = get_clients_by_renewal_status(status_filter, limit=1000)

      output = StringIO()
      writer = csv.writer(output)

      # Headers
      writer.writerow([
          "Customer ID", "Name", "Email", "Status",
          "Renewal Date", "Lifetime Value", "Priority"
      ])

      # Data
      for client in clients:
          writer.writerow([
              client['customer_id'],
              client['customer_name'],
              client.get('email', ''),
              client['renewal_status'],
              client.get('renewal_date', ''),
              client['lifetime_value'],
              client['priority_level']
          ])

      # Return as downloadable file
      frappe.response['filename'] = f'retention_clients_{nowdate()}.csv'
      frappe.response['filecontent'] = output.getvalue()
      frappe.response['type'] = 'csv'
  ```

### 5.2 Email Alerts

**Issue #42: Automated Alerts**
- **Effort**: 8 hours
- **Tasks**:
  - Create scheduled job (daily)
  - Email alerts for high-priority at-risk customers
  - Configurable thresholds
  ```python
  def send_retention_alerts():
      """Daily job to send retention alerts"""
      # Find critical priority customers
      clients = get_clients_by_renewal_status(limit=100)
      critical = [c for c in clients if c['priority_level'] == 'critical']

      if not critical:
          return

      # Group by assigned sales rep
      by_rep = {}
      for client in critical:
          rep = client.get('assigned_sales_rep')
          if not rep:
              rep = "unassigned"

          if rep not in by_rep:
              by_rep[rep] = []
          by_rep[rep].append(client)

      # Send emails
      for rep, clients in by_rep.items():
          if rep == "unassigned":
              continue

          frappe.sendmail(
              recipients=rep,
              subject=f"Retention Alert: {len(clients)} Customers Need Attention",
              message=render_alert_email(clients)
          )
  ```

### 5.3 Bulk Actions

**Issue #44: Bulk Operations**
- **Effort**: 8 hours
- **Tasks**:
  - Add checkboxes to client table
  - Bulk action dropdown
  - Backend APIs for bulk operations

### 5.4 Customer Segmentation

**Issue #45: Advanced Filtering**
- **Effort**: 6 hours
- **Tasks**:
  - Add filter UI for customer group, territory, product
  - Update API to support multiple filters
  - Save filter presets

**Subtotal for Phase 5: 28 hours (1 week)**

---

## Phase 6: Business Logic Improvements - 3-4 days

### Priority: LOW-MEDIUM | Effort: Medium | User Impact: MEDIUM

### 6.1 Improve Priority Scoring

**Issue #20, #21: Rebalance & Use Logarithmic Scaling**
- **Effort**: 4 hours

### 6.2 Better Renewal Status Logic

**Issue #22, #23, #24: Configurable Thresholds & Churned Status**
- **Effort**: 3 hours

### 6.3 Smarter Upsell Calculations

**Issue #25, #26: Improve Upsell Logic**
- **Effort**: 6 hours

**Subtotal for Phase 6: 13 hours (2-3 days)**

---

## Summary Timeline

| Phase | Focus | Duration | Priority |
|-------|-------|----------|----------|
| **Phase 1** | UI/UX Fixes | 4-5 days | HIGH - Start Here |
| **Phase 2** | Security (CRITICAL) | 2-3 days | CRITICAL |
| **Phase 3** | Performance | 3-4 days | HIGH |
| **Phase 4** | Code Quality | 2-3 days | MEDIUM |
| **Phase 5** | Missing Features | 5-7 days | MEDIUM |
| **Phase 6** | Business Logic | 2-3 days | LOW-MEDIUM |

**Total**: 18-25 days (~4-5 weeks for single developer)

---

## Recommended Execution Order

### Sprint 1 (Week 1): Foundation
- **Days 1-2**: Phase 1 UI/UX (priority items: accessibility, loading states, error handling)
- **Days 3-5**: Phase 2 Security (ALL critical security fixes)

**Deliverable**: Secure, accessible dashboard ready for internal testing

### Sprint 2 (Week 2): Performance & Polish
- **Days 1-3**: Phase 3 Performance (N+1 fix, indexes, caching)
- **Days 4-5**: Phase 1 UI/UX (remaining items: pagination, mobile, help)

**Deliverable**: Fast, polished dashboard ready for user testing

### Sprint 3 (Week 3): Quality & Features
- **Days 1-2**: Phase 4 Code Quality (tests, logging, refactoring)
- **Days 3-5**: Phase 5 Features (export, email alerts)

**Deliverable**: Production-ready dashboard with essential features

### Sprint 4 (Week 4): Advanced Features
- **Days 1-3**: Phase 5 Features (bulk actions, segmentation)
- **Days 4-5**: Phase 6 Business Logic improvements

**Deliverable**: Feature-complete dashboard

---

## Quick Wins (Can Do Today)

These require <2 hours each and have immediate impact:

1. ✅ Add ARIA labels to buttons (Issue #17) - 1 hour
2. ✅ Add global loading overlay (Issue #11) - 1 hour
3. ✅ Extract magic numbers to constants (Issue #9) - 1 hour
4. ✅ Add help icon tooltips (Issue #49) - 1 hour
5. ✅ Fix inline event handlers (Issue #13) - 1 hour
6. ✅ Add proper chart cleanup (Issue #12) - 0.5 hours

**Total: 5.5 hours** - Can complete in one day and significantly improve UX.

---

## Testing Checklist

Before marking each phase complete:

### Phase 1 (UI/UX):
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Screen reader announces all interactive elements
- [ ] Loading states appear for all async operations
- [ ] Error messages are clear and actionable
- [ ] Mobile layout works on 320px, 768px, 1024px
- [ ] Help tooltips explain all metrics

### Phase 2 (Security):
- [ ] Non-authorized user gets permission error
- [ ] Sales Manager can access dashboard
- [ ] User cannot view customers outside their territory
- [ ] Invalid input parameters are rejected
- [ ] SQL injection attempts fail safely

### Phase 3 (Performance):
- [ ] Client list loads in <500ms for 100 customers
- [ ] Dashboard KPIs load in <1s
- [ ] Charts render in <2s
- [ ] No N+1 queries in logs
- [ ] Cache hit rate >70% after initial load

---

## Next Steps

**Immediate Actions:**
1. Review and approve this plan
2. Set up development environment
3. Create feature branch: `feature/retention-dashboard-improvements`
4. Start with Phase 1, Quick Wins section
5. Daily standup to track progress

**Need Clarification On:**
- Which roles should have access to retention dashboard?
- Email alert frequency preferences?
- Mobile responsiveness priority (high/medium/low)?
- Budget for external testing (accessibility audit)?

---

**Last Updated**: January 30, 2026
**Author**: Claude Sonnet 4.5
**Status**: Ready for Review
