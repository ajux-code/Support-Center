# Retention Dashboard

A comprehensive customer retention and renewal tracking system for ERPNext/Frappe, built for the Support Center app.

## Overview

The Retention Dashboard provides real-time visibility into customer renewals, identifies at-risk clients, and surfaces upsell opportunities. Designed for sales and account management teams to proactively manage customer relationships and maximize lifetime value.

## Key Features

### 1. **Executive KPI Dashboard**
Real-time metrics with month-over-month comparisons:
- **Total Active Customers** - Current customer count with growth trends
- **Clients at Risk** - Customers overdue or inactive (90+ days without orders)
- **Revenue Up for Renewal** - Total value from upcoming renewals (next 90 days)
- **Upsell Potential** - Estimated revenue from seat upgrades and cross-sells
- **Renewal Rate** - Percentage of customers who renewed vs churned
- **Average Customer Lifetime Value (LTV)**
- **Renewals This Month** - Count of renewal orders

### 2. **Renewal Calendar**
Interactive monthly calendar view showing:
- All upcoming renewals by date
- Risk levels (High Value: $5,000+, Medium: $1,000+, Low: <$1,000)
- Daily renewal summaries
- Month navigation and summary statistics

### 3. **Client Management**
Comprehensive client list with:
- **Status Filtering**: All, Overdue, Due Soon (30 days), Active
- **Search & Sort**: By customer name, renewal date, value
- **Priority Scoring**: Intelligent prioritization based on:
  - Revenue at risk (0-40 points)
  - Urgency/days until renewal (0-35 points)
  - Customer tier (0-15 points)
  - Engagement history (0-10 points)
- **Detailed Customer Profiles**: Click any customer to view:
  - Complete purchase history
  - Product breakdown
  - Subscription status
  - Upsell recommendations
  - Engagement timeline

### 4. **Analytics & Trends**
Historical analysis with customizable time periods (6 or 12 months):
- **Renewal Rate Trend** - Monthly renewal percentage over time
- **New vs Renewals** - Stacked bar chart comparing order types
- **Revenue Trend** - Line chart showing renewal vs new revenue streams
- **Product Retention Analysis** - Retention rates by product category

## Technical Architecture

### Backend (Python)

**API Endpoints** (`support_center/api/retention_dashboard.py`):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `get_dashboard_kpis()` | GET | High-level KPIs with comparisons |
| `get_clients_by_renewal_status()` | GET | Filtered client list with pagination |
| `get_client_retention_detail()` | GET | Individual customer deep-dive |
| `get_renewal_calendar()` | GET | Renewals for date range |
| `get_calendar_view_data()` | GET | Calendar month data with grouping |
| `get_trend_data()` | GET | Historical trend data for charts |
| `get_product_retention_analysis()` | GET | Product-level retention metrics |

**Key Algorithms**:

1. **Renewal Status Calculation**
   ```python
   - Overdue: renewal_date < today OR last_order > 365 days ago
   - Due Soon: renewal_date <= 30 days away OR last_order > 270 days
   - Active: renewal_date > 30 days away
   ```

2. **Priority Score** (0-100 scale)
   - Revenue at risk: 0-40 points
   - Urgency: 0-35 points
   - Customer tier: 0-15 points
   - Engagement/loyalty: 0-10 points

3. **Upsell Calculations**
   - Seat upgrades: (avg_seats - current_seats) × $50
   - Cross-sell opportunities: Missing products from portfolio
   - Tier upgrades: Private → Business tier

### Frontend (JavaScript + Chart.js)

**Structure** (`support_center/public/js/retention-dashboard.js`):
- Vanilla JavaScript (no framework dependencies)
- Chart.js 4.4.1 for data visualization
- Event-driven architecture with tab navigation
- Modal system for customer detail views

**Views**:
- **Overview Tab**: KPI cards, at-risk alerts, quick actions
- **Calendar Tab**: Interactive monthly calendar with renewal markers
- **Clients Tab**: Sortable/filterable table with search
- **Analytics Tab**: Trend charts and product analysis
  - **Renewal Rate Trend**: Line chart showing monthly renewal percentage over time
  - **New vs Renewals**: Stacked bar chart comparing order types month-by-month
  - **Revenue Trend**: Dual-line chart tracking renewal revenue vs new order revenue
  - **Product Retention Analysis**: Retention rates by product category
  - **Time Period Selector**: Toggle between 6 or 12 months of data

**Styling** (`support_center/public/css/retention-dashboard.css`):
- Responsive design (desktop-first)
- Color-coded status indicators
- Loading states and error handling
- Print-optimized layouts

### Data Model

**Primary Entities**:
- `Customer` (ERPNext core) - Customer records
- `Sales Order` (ERPNext core) - Order history
  - Custom fields:
    - `custom_order_type`: "New Order Private", "Renewal", "Extension Private", etc.
    - `custom_product`: Product name
    - `custom_trend_micro_seats`: Seat count
    - `custom_previous_order`: Link to previous order
    - `custom_salesperson`: Assigned sales rep
- `Subscription` (ERPNext core) - Recurring billing cycles

**Query Optimization**:
- Uses indexed fields for performance
- Subqueries for aggregate calculations
- Pagination support (limit/offset)
- Date range filtering

## Installation & Setup

### Prerequisites
- ERPNext v14+ or v15+
- Support Center app installed
- Sales Orders with custom fields configured

### Initial Setup

1. **Install the app**:
   ```bash
   bench get-app support_center
   bench --site your-site install-app support_center
   ```

2. **Run migrations**:
   ```bash
   bench --site your-site migrate
   ```

3. **Seed sample data (optional, for testing)**:
   ```bash
   bench --site your-site execute support_center.api.seed_retention_data.seed_all_data
   ```

4. **Access the dashboard**:
   Navigate to: `https://your-site/retention-dashboard`

### Configuration

**Required Custom Fields on Sales Order**:
- `custom_order_type` (Select): Order type classification
- `custom_product` (Data): Product name
- `custom_trend_micro_seats` (Int): Number of seats/licenses
- `custom_previous_order` (Link): Reference to previous order
- `custom_salesperson` (Link to User): Assigned sales representative

**Permissions**:
- Requires login (no Guest access)
- Permissions inherit from ERPNext Customer/Sales Order access

## Usage Guide

### For Account Managers

**Daily Workflow**:
1. Check **Overview** tab for at-risk alerts
2. Review **Calendar** for upcoming renewals
3. Contact high-priority clients first (sorted by priority score)
4. Log follow-up actions in ERPNext

**Proactive Actions**:
- Reach out to overdue clients within 7 days
- Schedule renewal calls 30-45 days before due date
- Identify upsell opportunities during renewal conversations

### For Sales Leadership

**Weekly Review**:
- Monitor renewal rate trends
- Analyze product retention performance
- Review team progress on at-risk accounts
- Track revenue up for renewal vs targets

**Strategic Planning**:
- Use trend data to forecast revenue
- Identify which products have best/worst retention
- Allocate resources to high-value at-risk accounts

## Data Seeding (Development/Testing)

The `seed_retention_data.py` script creates realistic test data:
- 20 sample customers (various tiers and territories)
- Historical orders (new and renewal)
- Active subscriptions
- Product mix (Trend Micro, Kaspersky, Bitdefender, Norton, McAfee)

```bash
bench --site localhost execute support_center.api.seed_retention_data.seed_all_data
```

## Metrics Definitions

### Renewal Rate
```
Renewal Rate = (Renewal Orders / Total Orders) × 100
```
Calculated over trailing 12 months.

### Customer Lifetime Value (LTV)
```
LTV = Sum of all Sales Order grand_total for customer
```
Average LTV = Average across all customers with orders.

### Clients at Risk
Customers matching ANY of:
- No orders in last 90 days
- Subscription status = "Past Due Date"
- Renewal overdue

### Upsell Potential
Sum of:
- Seat upgrade opportunities: (avg_seats - current_seats) × $50
- Cross-sell missing products: ~$500 per product
- Tier upgrades (Private → Business): ~$200

## Troubleshooting

**Dashboard shows "0" for all metrics**:
- Verify Sales Orders exist with `custom_order_type` populated
- Check Subscriptions are active
- Ensure customers are not disabled

**Calendar not loading**:
- Check browser console for JavaScript errors
- Verify Chart.js CDN is accessible
- Confirm Subscriptions have valid `end_date` values

**Slow performance**:
- Add indexes on `Sales Order.transaction_date`
- Add indexes on `Subscription.end_date`
- Reduce `limit` parameter in API calls
- Consider archiving old orders

## Future Enhancements

**Planned Features**:
- Email alerts for at-risk clients
- Automated renewal reminders
- Integration with CRM activities
- Predictive churn modeling (ML)
- Mobile-responsive design improvements
- Export reports to PDF/Excel
- Team performance dashboards
- Custom retention goals/targets

**Technical Debt**:
- Migrate to Vue.js framework
- Add unit tests for API endpoints
- Implement Redis caching for KPIs
- WebSocket for real-time updates

## API Reference

### `get_dashboard_kpis()`
**Returns**:
```json
{
  "total_customers": 150,
  "revenue_up_for_renewal": 125000.00,
  "clients_at_risk": 12,
  "potential_upsell_value": 45000.00,
  "renewal_rate": 85.5,
  "avg_customer_lifetime_value": 12500.00,
  "total_renewals_this_month": 8,
  "comparisons": {
    "customers": {"change": 5.2, "direction": "up"},
    "renewal_revenue": {"change": -2.1, "direction": "down"}
  }
}
```

### `get_clients_by_renewal_status(status_filter, days_range, limit, offset)`
**Parameters**:
- `status_filter`: "overdue", "due_soon", "active", or null for all
- `days_range`: Days to look ahead for "due_soon" (default: 90)
- `limit`: Results per page (default: 50)
- `offset`: Pagination offset (default: 0)

**Returns**: Array of customer objects with renewal details, priority scores, and upsell potential.

## License

MIT License - See main Support Center app LICENSE file.

---

**Last Updated**: January 2026
**Maintained By**: Support Center Development Team
