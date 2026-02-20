"""
Retention Dashboard API
Provides analytics for client retention, renewal tracking, and upsell opportunities
"""

import frappe
from frappe import _
from frappe.utils import nowdate, add_days, getdate, flt, cint
from datetime import datetime, timedelta

# Import security modules
from support_center.api.permissions import (
    require_retention_access,
    can_access_customer_retention,
    log_security_event
)
from support_center.api.validators import (
    validate_status_filter,
    validate_pagination,
    validate_days_range,
    validate_date_range,
    validate_customer_name,
    validate_months_period
)


# ============================================
# Configuration Constants
# ============================================

# Time periods (in days)
DAYS_RENEWAL_WINDOW = 90  # Look ahead for upcoming renewals
DAYS_AT_RISK_THRESHOLD = 90  # No orders = at risk
DAYS_DUE_SOON_THRESHOLD = 30  # Renewal due soon
DAYS_INACTIVE_WARNING = 270  # 9 months without order
DAYS_INACTIVE_CRITICAL = 365  # 1 year without order

# Revenue thresholds for risk levels
REVENUE_HIGH_VALUE = 5000  # High-value customer threshold
REVENUE_MEDIUM_VALUE = 1000  # Medium-value customer threshold

# Priority score configuration
PRIORITY_SCORE_MAX = 100  # Maximum priority score

# Priority score weights (total = 100)
PRIORITY_WEIGHT_REVENUE = 40  # Revenue at risk
PRIORITY_WEIGHT_URGENCY = 35  # Days overdue/until renewal
PRIORITY_WEIGHT_TIER = 15  # Customer tier
PRIORITY_WEIGHT_ENGAGEMENT = 10  # Order history/loyalty

# Priority score thresholds
PRIORITY_CRITICAL = 75  # Critical priority threshold
PRIORITY_HIGH = 50  # High priority threshold
PRIORITY_MEDIUM = 25  # Medium priority threshold

# Revenue thresholds for priority scoring
REVENUE_TIER_ENTERPRISE = 10000  # 40 points
REVENUE_TIER_HIGH = 5000  # 30 points
REVENUE_TIER_MEDIUM = 2000  # 20 points
REVENUE_TIER_LOW = 500  # 10 points

# Urgency thresholds (overdue)
URGENCY_OVERDUE_CRITICAL = 30  # 35 points
URGENCY_OVERDUE_HIGH = 14  # 30 points
URGENCY_OVERDUE_MEDIUM = 7  # 25 points

# Urgency thresholds (due soon)
URGENCY_DUE_VERY_SOON = 7  # 18 points
URGENCY_DUE_SOON = 14  # 12 points
URGENCY_DUE_APPROACHING = 21  # 8 points

# Engagement/loyalty thresholds
ENGAGEMENT_LOYAL = 10  # 10 points
ENGAGEMENT_REGULAR = 5  # 7 points
ENGAGEMENT_OCCASIONAL = 2  # 4 points

# Pricing
PRICE_PER_SEAT = 50  # Estimated price per seat for upsell calculations

# Custom field names on Sales Order that may or may not exist
SO_CUSTOM_FIELDS = [
    "custom_order_type",
    "custom_product",
    "custom_trend_micro_seats",
    "custom_previous_order",
    "custom_salesperson",
]

# Cache for available custom fields (checked once per request)
_available_fields_cache = {}


def get_available_so_fields():
    """Check which custom fields actually exist on the Sales Order table.
    Caches per request to avoid repeated DB lookups."""
    if _available_fields_cache.get("sales_order"):
        return _available_fields_cache["sales_order"]

    available = set()
    meta = frappe.get_meta("Sales Order")
    for field_name in SO_CUSTOM_FIELDS:
        if meta.has_field(field_name):
            available.add(field_name)

    _available_fields_cache["sales_order"] = available
    return available


def has_so_field(field_name):
    """Check if a specific custom field exists on Sales Order."""
    return field_name in get_available_so_fields()


@frappe.whitelist()
@require_retention_access
def get_dashboard_kpis():
    """
    Get high-level KPIs for the retention dashboard
    Returns:
        - total_customers: Active customer count
        - revenue_up_for_renewal: Total revenue from customers due for renewal in next 90 days
        - clients_at_risk: Customers overdue or with no recent activity
        - potential_upsell_value: Estimated upsell opportunity
        - renewal_rate: Percentage of customers who renewed
        - Comparison metrics vs last month for each KPI
    """
    try:
        today = nowdate()

        # Total active customers
        total_customers = frappe.db.count("Customer", {"disabled": 0})

        # Get customers with renewal orders in last year to establish baseline
        renewal_data = get_renewal_metrics()

        # Clients at risk (no order in 90+ days, or overdue subscriptions)
        at_risk_customers = get_at_risk_customers_count()

        # Revenue up for renewal (from subscriptions ending in next DAYS_RENEWAL_WINDOW days)
        renewal_revenue = get_upcoming_renewal_revenue(days=DAYS_RENEWAL_WINDOW)

        # Potential upsell value calculation
        upsell_potential = calculate_total_upsell_potential()

        # Get comparison metrics (vs last month)
        comparisons = get_kpi_comparisons()

        # Log access
        log_security_event("dashboard_access", "Accessed retention dashboard KPIs")

        return {
            "total_customers": total_customers,
            "revenue_up_for_renewal": renewal_revenue,
            "clients_at_risk": at_risk_customers,
            "potential_upsell_value": upsell_potential,
            "renewal_rate": renewal_data.get("renewal_rate", 0),
            "avg_customer_lifetime_value": renewal_data.get("avg_ltv", 0),
            "total_renewals_this_month": renewal_data.get("renewals_this_month", 0),
            # Comparison metrics
            "comparisons": comparisons
        }
    except frappe.PermissionError:
        raise
    except Exception as e:
        frappe.log_error(
            title=_("Retention Dashboard - Error in get_dashboard_kpis"),
            message=frappe.get_traceback()
        )
        frappe.throw(_("An error occurred while fetching dashboard KPIs. Please try again."))



@frappe.whitelist()
@require_retention_access
def get_clients_by_renewal_status(status_filter=None, days_range=DAYS_RENEWAL_WINDOW, limit=50, offset=0):
    """
    Get list of clients segmented by renewal status
    Optimized with LEFT JOINs to avoid N+1 query problem

    Args:
        status_filter: 'overdue', 'due_soon', 'active', or None for all
        days_range: Number of days to look ahead for 'due_soon'
        limit: Number of results to return
        offset: Pagination offset

    Returns list of clients with:
        - customer_id, customer_name, email, phone
        - renewal_status: overdue, due_soon, active
        - renewal_date: Next renewal date
        - last_order_date
        - lifetime_value
        - product_summary
    """
    try:
        import time
        query_start = time.time()

        # Validate inputs
        status_filter = validate_status_filter(status_filter)
        days_range = validate_days_range(days_range)
        limit, offset = validate_pagination(limit, offset)

        today = getdate(nowdate())
        due_soon_date = add_days(today, cint(days_range))

        # Optimized query with LEFT JOINs to avoid N+1 problem
        # Uses derived tables to pre-aggregate data per customer
        products_col = "GROUP_CONCAT(DISTINCT so.custom_product) as products_purchased" if has_so_field("custom_product") else "NULL as products_purchased"

        customers = frappe.db.sql("""
        SELECT
            c.name as customer_id,
            c.customer_name,
            c.email_id as email,
            c.mobile_no as phone,
            c.customer_group,
            c.territory,
            c.creation as customer_since,
            order_data.last_order_date,
            COALESCE(order_data.lifetime_value, 0) as lifetime_value,
            COALESCE(order_data.total_orders, 0) as total_orders,
            order_data.products_purchased,
            sub_data.next_renewal_date,
            contact_data.last_contacted_at,
            contact_data.last_contacted_by,
            contact_data.last_contact_content
        FROM `tabCustomer` c
        LEFT JOIN (
            SELECT
                so.customer,
                MAX(so.transaction_date) as last_order_date,
                SUM(so.grand_total) as lifetime_value,
                COUNT(*) as total_orders,
                {products_col}
            FROM `tabSales Order` so
            WHERE so.docstatus = 1
            GROUP BY so.customer
        ) as order_data ON order_data.customer = c.name
        LEFT JOIN (
            SELECT
                sub.party as customer,
                MIN(sub.end_date) as next_renewal_date
            FROM `tabSubscription` sub
            WHERE sub.party_type = 'Customer'
            AND sub.status IN ('Active', 'Past Due Date', 'Unpaid')
            GROUP BY sub.party
        ) as sub_data ON sub_data.customer = c.name
        LEFT JOIN (
            SELECT
                com.reference_name as customer,
                MAX(com.creation) as last_contacted_at,
                SUBSTRING_INDEX(GROUP_CONCAT(com.comment_by ORDER BY com.creation DESC), ',', 1) as last_contacted_by,
                SUBSTRING_INDEX(GROUP_CONCAT(com.content ORDER BY com.creation DESC), ',', 1) as last_contact_content
            FROM `tabComment` com
            WHERE com.reference_doctype = 'Customer'
            AND com.content LIKE '%%Retention Outreach%%'
            GROUP BY com.reference_name
        ) as contact_data ON contact_data.customer = c.name
        WHERE c.disabled = 0
        ORDER BY order_data.last_order_date DESC
        LIMIT %(limit)s OFFSET %(offset)s
        """.format(products_col=products_col), {"limit": cint(limit), "offset": cint(offset)}, as_dict=True)

        query_time = time.time() - query_start
        frappe.logger().info(f"Client list query completed in {query_time:.3f}s for {len(customers)} customers (filter: {status_filter})")

        # Process and categorize each customer
        result = []
        for customer in customers:
            renewal_status = calculate_renewal_status(
                customer.get("next_renewal_date"),
                customer.get("last_order_date"),
                today
            )

            # Apply filter if specified
            if status_filter and renewal_status != status_filter:
                continue

            customer["renewal_status"] = renewal_status
            customer["renewal_date"] = customer.get("next_renewal_date")
            customer["days_until_renewal"] = calculate_days_until(customer.get("next_renewal_date"), today)
            customer["days_since_last_order"] = calculate_days_since(customer.get("last_order_date"), today)
            customer["lifetime_value"] = flt(customer.get("lifetime_value", 0), 2)
            customer["upsell_potential"] = calculate_customer_upsell_potential(customer)

            # Calculate priority score for at-risk clients
            priority_score = calculate_priority_score(customer)
            customer["priority_score"] = priority_score
            customer["priority_level"] = get_priority_label(priority_score)

            # Process last contact information
            if customer.get("last_contacted_at"):
                # Parse contact type from content
                contact_content = customer.get("last_contact_content", "")
                contact_type = "call"  # default
                if "email" in contact_content.lower():
                    contact_type = "email"
                elif "meeting" in contact_content.lower():
                    contact_type = "meeting"

                customer["last_contact_type"] = contact_type
                customer["last_contact_days_ago"] = (today - getdate(customer["last_contacted_at"])).days
            else:
                customer["last_contacted_at"] = None
                customer["last_contacted_by"] = None
                customer["last_contact_type"] = None
                customer["last_contact_days_ago"] = None

            # Remove the content field (not needed in frontend)
            customer.pop("last_contact_content", None)

            result.append(customer)

        # Sort by priority score (highest first) for at-risk clients
        # Active clients are sorted by renewal date
        result.sort(key=lambda x: (
            0 if x["renewal_status"] in ["overdue", "due_soon"] else 1,  # At-risk first
            -x["priority_score"],  # Then by priority (highest first)
            x.get("days_until_renewal") or 999  # Then by urgency
        ))

        # Log access
        log_security_event(
            "client_list_access",
            f"Retrieved {len(result)} clients with filter={status_filter}, limit={limit}, offset={offset}"
        )

        return result
    except frappe.PermissionError:
        raise
    except frappe.ValidationError:
        raise
    except Exception as e:
        frappe.log_error(
            title=_("Retention Dashboard - Error in get_clients_by_renewal_status"),
            message=frappe.get_traceback()
        )
        frappe.throw(_("An error occurred while fetching client list. Please try again."))


@frappe.whitelist()
@require_retention_access
def get_client_retention_detail(customer_id):
    """
    Get detailed retention information for a specific client

    Returns:
        - Customer profile
        - Purchase history with products
        - Renewal history
        - Upsell recommendations
        - Engagement timeline
    """
    try:
        # Validate customer name
        customer_id = validate_customer_name(customer_id)

        # Check per-customer permission
        if not can_access_customer_retention(customer_id):
            frappe.throw(
                _("You do not have permission to access this customer's data"),
                frappe.PermissionError
            )

        customer = frappe.get_doc("Customer", customer_id)

        # Get purchase history — dynamically include custom fields if they exist
        custom_cols = []
        if has_so_field("custom_order_type"):
            custom_cols.append("so.custom_order_type as order_type")
        if has_so_field("custom_product"):
            custom_cols.append("so.custom_product as product")
        if has_so_field("custom_trend_micro_seats"):
            custom_cols.append("so.custom_trend_micro_seats as seats")
        if has_so_field("custom_previous_order"):
            custom_cols.append("so.custom_previous_order as previous_order")
        if has_so_field("custom_salesperson"):
            custom_cols.append("so.custom_salesperson as salesperson")

        extra_cols = (", " + ", ".join(custom_cols)) if custom_cols else ""

        orders = frappe.db.sql("""
        SELECT
            so.name as order_id,
            so.transaction_date,
            so.grand_total,
            so.status
            {extra_cols}
        FROM `tabSales Order` so
        WHERE so.customer = %(customer)s
        AND so.docstatus = 1
        ORDER BY so.transaction_date DESC
        LIMIT 20
        """.format(extra_cols=extra_cols), {"customer": customer_id}, as_dict=True)

        # Get subscriptions
        subscriptions = frappe.db.sql("""
        SELECT
            name,
            start_date,
            end_date,
            status,
            current_invoice_start,
            current_invoice_end
        FROM `tabSubscription`
        WHERE party_type = 'Customer'
        AND party = %(customer)s
        ORDER BY end_date DESC
        """, {"customer": customer_id}, as_dict=True)

        # Calculate metrics
        lifetime_value = sum(flt(o.get("grand_total", 0)) for o in orders)
        total_orders = len(orders)

        # Product breakdown
        product_breakdown = {}
        for order in orders:
            product = order.get("product") or "Other"
            if product not in product_breakdown:
                product_breakdown[product] = {"count": 0, "revenue": 0, "seats": 0}
            product_breakdown[product]["count"] += 1
            product_breakdown[product]["revenue"] += flt(order.get("grand_total", 0))
            product_breakdown[product]["seats"] += cint(order.get("seats", 0))

        # Renewal tracking
        renewal_orders = [o for o in orders if o.get("order_type") in ["Renewal", "Extension Private", "Extension Business"]]
        new_orders = [o for o in orders if o.get("order_type") in ["New Order Private", "New Order Business"]]

        # Calculate upsell potential
        upsell_recommendations = calculate_upsell_recommendations(customer_id, orders, product_breakdown)

        # Get next renewal date
        next_renewal = None
        for sub in subscriptions:
            if sub.get("status") in ["Active", "Past Due Date", "Unpaid"]:
                next_renewal = sub.get("end_date")
                break

        # Log access to customer details
        log_security_event(
            "customer_detail_access",
            f"Accessed detailed retention data for customer: {customer_id}"
        )

        return {
            "customer": {
                "customer_id": customer.name,
                "customer_name": customer.customer_name,
                "email": customer.email_id,
                "phone": customer.mobile_no,
                "customer_group": customer.customer_group,
                "territory": customer.territory,
                "customer_since": customer.creation
            },
            "metrics": {
                "lifetime_value": lifetime_value,
                "total_orders": total_orders,
                "renewal_count": len(renewal_orders),
                "avg_order_value": lifetime_value / total_orders if total_orders > 0 else 0,
                "last_order_date": orders[0].get("transaction_date") if orders else None,
                "next_renewal_date": next_renewal,
                "renewal_status": calculate_renewal_status(next_renewal, orders[0].get("transaction_date") if orders else None, getdate(nowdate())),
                "priority_score": calculate_priority_score({
                    "lifetime_value": lifetime_value,
                    "total_orders": total_orders,
                    "customer_group": customer.customer_group,
                    "renewal_status": calculate_renewal_status(next_renewal, orders[0].get("transaction_date") if orders else None, getdate(nowdate())),
                    "days_until_renewal": calculate_days_until(next_renewal, getdate(nowdate()))
                }),
                "priority_level": get_priority_label(calculate_priority_score({
                    "lifetime_value": lifetime_value,
                    "total_orders": total_orders,
                    "customer_group": customer.customer_group,
                    "renewal_status": calculate_renewal_status(next_renewal, orders[0].get("transaction_date") if orders else None, getdate(nowdate())),
                    "days_until_renewal": calculate_days_until(next_renewal, getdate(nowdate()))
                }))
            },
            "product_breakdown": product_breakdown,
            "orders": orders,
            "subscriptions": subscriptions,
            "upsell_recommendations": upsell_recommendations
        }
    except frappe.PermissionError:
        raise
    except frappe.DoesNotExistError:
        raise
    except frappe.ValidationError:
        raise
    except Exception as e:
        frappe.log_error(
            title=_("Retention Dashboard - Error in get_client_retention_detail"),
            message=frappe.get_traceback()
        )
        frappe.throw(_("An error occurred while fetching customer details. Please try again."))


@frappe.whitelist()
@require_retention_access
def get_renewal_calendar(start_date=None, end_date=None):
    """
    Get renewals organized by date for calendar view
    Optimized with LEFT JOIN to avoid N+1 query problem
    """
    try:
        import time
        query_start = time.time()

        # Set defaults if not provided
        if not start_date:
            start_date = nowdate()
        if not end_date:
            end_date = add_days(start_date, DAYS_RENEWAL_WINDOW)

        # Validate date range
        start_date, end_date = validate_date_range(start_date, end_date)

        # Query 1: Get subscriptions (fast — uses idx_party_status_enddate)
        renewals = frappe.db.sql("""
        SELECT
            sub.name as subscription_id,
            sub.party as customer_id,
            c.customer_name,
            sub.end_date as renewal_date,
            sub.status
        FROM `tabSubscription` sub
        JOIN `tabCustomer` c ON c.name = sub.party
        WHERE sub.party_type = 'Customer'
        AND sub.status IN ('Active', 'Past Due Date', 'Unpaid')
        AND sub.end_date BETWEEN %(start)s AND %(end)s
        ORDER BY sub.end_date ASC
        """, {"start": start_date, "end": end_date}, as_dict=True)

        # Query 2: Get sales totals per customer (fast — uses idx_customer_docstatus_date)
        customer_ids = list({r.customer_id for r in renewals})
        sales_by_customer = {}
        if customer_ids:
            cutoff = str(add_days(start_date, -365))
            sales_rows = frappe.db.sql("""
            SELECT so.customer, SUM(so.grand_total) as annual_value
            FROM `tabSales Order` so
            WHERE so.customer IN %(customers)s
            AND so.docstatus = 1
            AND so.transaction_date >= %(cutoff)s
            GROUP BY so.customer
            """, {"customers": tuple(customer_ids), "cutoff": cutoff}, as_dict=True)
            sales_by_customer = {r.customer: flt(r.annual_value) for r in sales_rows}

        query_time = time.time() - query_start
        frappe.logger().info(f"Renewal calendar query completed in {query_time:.3f}s for {len(renewals)} renewals")

        # Merge sales data and assign risk levels
        for renewal in renewals:
            annual_value = sales_by_customer.get(renewal.customer_id, 0)
            if annual_value >= REVENUE_HIGH_VALUE:
                renewal["risk_level"] = "high"
            elif annual_value >= REVENUE_MEDIUM_VALUE:
                renewal["risk_level"] = "medium"
            else:
                renewal["risk_level"] = "low"
            renewal["annual_value"] = annual_value

        # Log access
        log_security_event(
            "calendar_access",
            f"Retrieved renewal calendar data for {start_date} to {end_date}"
        )

        return renewals
    except frappe.PermissionError:
        raise
    except frappe.ValidationError:
        raise
    except Exception as e:
        frappe.log_error(
            title=_("Retention Dashboard - Error in get_renewal_calendar"),
            message=frappe.get_traceback()
        )
        frappe.throw(_("An error occurred while fetching renewal calendar. Please try again."))


@frappe.whitelist()
@require_retention_access
def get_trend_data(months=12):
    """
    Get historical trend data for charts
    Returns monthly data for:
    - Renewal rate
    - New customers vs renewals
    - Revenue trends
    """
    try:
        # Validate months parameter
        months = validate_months_period(months)
        today = getdate(nowdate())

        # Generate list of months
        month_data = []
        for i in range(months - 1, -1, -1):
            # Calculate the first day of each month going back
            year = today.year
            month = today.month - i
            while month <= 0:
                month += 12
                year -= 1

            month_start = datetime(year, month, 1).date()
            if month == 12:
                month_end = datetime(year + 1, 1, 1).date() - timedelta(days=1)
            else:
                month_end = datetime(year, month + 1, 1).date() - timedelta(days=1)

            month_data.append({
                "month_start": str(month_start),
                "month_end": str(month_end),
                "label": month_start.strftime("%b %Y"),
                "short_label": month_start.strftime("%b")
            })

        # Get order counts and revenue by month
        has_order_type = has_so_field("custom_order_type")
        results = []
        for month in month_data:
            # Total orders for the month
            total_orders = frappe.db.count("Sales Order", {
                "docstatus": 1,
                "transaction_date": ["between", [month["month_start"], month["month_end"]]]
            })

            renewal_count = 0
            new_count = 0

            if has_order_type:
                # Count renewal orders
                renewal_count = frappe.db.count("Sales Order", {
                    "docstatus": 1,
                    "custom_order_type": ["in", ["Renewal", "Extension Private", "Extension Business"]],
                    "transaction_date": ["between", [month["month_start"], month["month_end"]]]
                })

                # Count new orders
                new_count = frappe.db.count("Sales Order", {
                    "docstatus": 1,
                    "custom_order_type": ["in", ["New Order Private", "New Order Business"]],
                    "transaction_date": ["between", [month["month_start"], month["month_end"]]]
                })

            # Calculate renewal rate
            renewal_rate = 0
            if total_orders > 0 and has_order_type:
                renewal_rate = round((renewal_count / total_orders) * 100, 1)

            # Get revenue
            if has_order_type:
                revenue_data = frappe.db.sql("""
                    SELECT
                        COALESCE(SUM(grand_total), 0) as total_revenue,
                        COALESCE(SUM(CASE WHEN custom_order_type IN ('Renewal', 'Extension Private', 'Extension Business')
                            THEN grand_total ELSE 0 END), 0) as renewal_revenue,
                        COALESCE(SUM(CASE WHEN custom_order_type IN ('New Order Private', 'New Order Business')
                            THEN grand_total ELSE 0 END), 0) as new_revenue
                    FROM `tabSales Order`
                    WHERE docstatus = 1
                    AND transaction_date BETWEEN %(start)s AND %(end)s
                """, {"start": month["month_start"], "end": month["month_end"]}, as_dict=True)[0]
            else:
                revenue_data = frappe.db.sql("""
                    SELECT
                        COALESCE(SUM(grand_total), 0) as total_revenue,
                        0 as renewal_revenue,
                        0 as new_revenue
                    FROM `tabSales Order`
                    WHERE docstatus = 1
                    AND transaction_date BETWEEN %(start)s AND %(end)s
                """, {"start": month["month_start"], "end": month["month_end"]}, as_dict=True)[0]

            results.append({
                "label": month["label"],
                "short_label": month["short_label"],
                "month": month["month_start"],
                "renewal_count": renewal_count,
                "new_count": new_count,
                "total_orders": total_orders,
                "renewal_rate": renewal_rate,
                "total_revenue": flt(revenue_data.get("total_revenue", 0), 2),
                "renewal_revenue": flt(revenue_data.get("renewal_revenue", 0), 2),
                "new_revenue": flt(revenue_data.get("new_revenue", 0), 2)
            })

        # Log access
        log_security_event("trend_data_access", f"Retrieved {months} months of trend data")

        return results
    except frappe.PermissionError:
        raise
    except frappe.ValidationError:
        raise
    except Exception as e:
        frappe.log_error(
            title=_("Retention Dashboard - Error in get_trend_data"),
            message=frappe.get_traceback()
        )
        frappe.throw(_("An error occurred while fetching trend data. Please try again."))


@frappe.whitelist()
@require_retention_access
def get_calendar_view_data(year=None, month=None):
    """
    Get renewal data organized for calendar display
    Returns renewals grouped by day with summary stats
    Optimized with LEFT JOIN to avoid N+1 query problem
    """
    try:
        import time
        query_start = time.time()

        today = getdate(nowdate())
        if not year:
            year = today.year
        if not month:
            month = today.month

        year = cint(year)
        month = cint(month)

        # Validate year and month ranges
        if year < 2000 or year > 2100:
            frappe.throw(_("Invalid year: {0}").format(year), frappe.ValidationError)
        if month < 1 or month > 12:
            frappe.throw(_("Invalid month: {0}").format(month), frappe.ValidationError)

        # Get first and last day of the month
        first_day = datetime(year, month, 1).date()
        if month == 12:
            last_day = datetime(year + 1, 1, 1).date() - timedelta(days=1)
        else:
            last_day = datetime(year, month + 1, 1).date() - timedelta(days=1)

        # Query 1: Get subscriptions (fast — uses idx_party_status_enddate)
        renewals = frappe.db.sql("""
        SELECT
            sub.name as subscription_id,
            sub.party as customer_id,
            c.customer_name,
            sub.end_date as renewal_date,
            sub.status
        FROM `tabSubscription` sub
        JOIN `tabCustomer` c ON c.name = sub.party
        WHERE sub.party_type = 'Customer'
        AND sub.status IN ('Active', 'Past Due Date', 'Unpaid')
        AND sub.end_date BETWEEN %(start)s AND %(end)s
        ORDER BY sub.end_date ASC
        """, {"start": str(first_day), "end": str(last_day)}, as_dict=True)

        # Query 2: Get sales totals per customer (fast — uses idx_customer_docstatus_date)
        customer_ids = list({r.customer_id for r in renewals})
        sales_by_customer = {}
        if customer_ids:
            cutoff = str((first_day - timedelta(days=365)))
            sales_rows = frappe.db.sql("""
            SELECT so.customer, SUM(so.grand_total) as annual_value
            FROM `tabSales Order` so
            WHERE so.customer IN %(customers)s
            AND so.docstatus = 1
            AND so.transaction_date >= %(cutoff)s
            GROUP BY so.customer
            """, {"customers": tuple(customer_ids), "cutoff": cutoff}, as_dict=True)
            sales_by_customer = {r.customer: flt(r.annual_value) for r in sales_rows}

        query_time = time.time() - query_start
        frappe.logger().info(f"Calendar view query completed in {query_time:.3f}s for {len(renewals)} renewals ({year}-{month})")

        # Merge sales data, assign risk levels, and group by date
        by_date = {}
        for renewal in renewals:
            date_str = str(renewal.get("renewal_date"))
            annual_value = sales_by_customer.get(renewal.customer_id, 0)

            if annual_value >= REVENUE_HIGH_VALUE:
                renewal["risk_level"] = "high"
            elif annual_value >= REVENUE_MEDIUM_VALUE:
                renewal["risk_level"] = "medium"
            else:
                renewal["risk_level"] = "low"
            renewal["annual_value"] = annual_value

            if date_str not in by_date:
                by_date[date_str] = {
                    "date": date_str,
                    "renewals": [],
                    "total_value": 0,
                    "count": 0
                }
            by_date[date_str]["renewals"].append(renewal)
            by_date[date_str]["total_value"] += annual_value
            by_date[date_str]["count"] += 1

        # Calculate month summary
        total_renewals = len(renewals)
        total_value = sum(flt(r.get("annual_value", 0)) for r in renewals)
        high_value_count = sum(1 for r in renewals if r.get("risk_level") == "high")

        # Log access
        log_security_event("calendar_view_access", f"Retrieved calendar view for {year}-{month}")

        return {
            "year": year,
            "month": month,
            "month_name": first_day.strftime("%B %Y"),
            "first_day": str(first_day),
            "last_day": str(last_day),
            "days_in_month": (last_day - first_day).days + 1,
            "first_day_weekday": first_day.weekday(),  # 0 = Monday
            "renewals_by_date": by_date,
            "summary": {
                "total_renewals": total_renewals,
                "total_value": flt(total_value, 2),
                "high_value_count": high_value_count
            }
        }
    except frappe.PermissionError:
        raise
    except frappe.ValidationError:
        raise
    except Exception as e:
        frappe.log_error(
            title=_("Retention Dashboard - Error in get_calendar_view_data"),
            message=frappe.get_traceback()
        )
        frappe.throw(_("An error occurred while fetching calendar view data. Please try again."))


@frappe.whitelist()
@require_retention_access
def get_product_retention_analysis():
    """
    Analyze retention rates by product category
    """
    try:
        # Product analysis requires custom_product field
        if not has_so_field("custom_product"):
            log_security_event("product_analysis_access", "Product analysis unavailable - custom_product field missing")
            return []

        has_order_type = has_so_field("custom_order_type")
        has_seats = has_so_field("custom_trend_micro_seats")

        renewal_col = "SUM(CASE WHEN so.custom_order_type IN ('Renewal', 'Extension Private', 'Extension Business') THEN 1 ELSE 0 END) as renewal_orders" if has_order_type else "0 as renewal_orders"
        new_col = "SUM(CASE WHEN so.custom_order_type IN ('New Order Private', 'New Order Business') THEN 1 ELSE 0 END) as new_orders" if has_order_type else "0 as new_orders"
        seats_col = "AVG(so.custom_trend_micro_seats) as avg_seats" if has_seats else "0 as avg_seats"

        products = frappe.db.sql("""
        SELECT
            so.custom_product as product,
            COUNT(DISTINCT so.customer) as unique_customers,
            COUNT(*) as total_orders,
            SUM(so.grand_total) as total_revenue,
            {renewal_col},
            {new_col},
            {seats_col}
        FROM `tabSales Order` so
        WHERE so.docstatus = 1
        AND so.custom_product IS NOT NULL
        AND so.custom_product != ''
        GROUP BY so.custom_product
        ORDER BY total_revenue DESC
    """.format(renewal_col=renewal_col, new_col=new_col, seats_col=seats_col), as_dict=True)

        # Calculate retention rate per product
        for product in products:
            total = product.get("total_orders", 0)
            renewals = product.get("renewal_orders", 0)
            product["retention_rate"] = (renewals / total * 100) if total > 0 else 0
            product["total_revenue"] = flt(product.get("total_revenue", 0), 2)
            product["avg_seats"] = flt(product.get("avg_seats", 0), 1)

        # Log access
        log_security_event("product_analysis_access", "Retrieved product retention analysis")

        return products
    except frappe.PermissionError:
        raise
    except Exception as e:
        frappe.log_error(
            title=_("Retention Dashboard - Error in get_product_retention_analysis"),
            message=frappe.get_traceback()
        )
        frappe.throw(_("An error occurred while fetching product retention analysis. Please try again."))


# ======================
# Helper Functions
# ======================

def get_kpi_comparisons():
    """
    Calculate comparison metrics vs last month for all KPIs.
    Returns percentage change and direction for each metric.
    """
    today = getdate(nowdate())

    # Current month boundaries
    current_month_start = today.replace(day=1)
    if today.month == 12:
        current_month_end = datetime(today.year + 1, 1, 1).date() - timedelta(days=1)
    else:
        current_month_end = datetime(today.year, today.month + 1, 1).date() - timedelta(days=1)

    # Last month boundaries
    last_month_end = current_month_start - timedelta(days=1)
    last_month_start = last_month_end.replace(day=1)

    comparisons = {}
    has_order_type = has_so_field("custom_order_type")

    # 1. Total Customers comparison (new customers this month vs last month)
    new_customers_current = frappe.db.count("Customer", {
        "disabled": 0,
        "creation": ["between", [str(current_month_start), str(current_month_end)]]
    })
    new_customers_last = frappe.db.count("Customer", {
        "disabled": 0,
        "creation": ["between", [str(last_month_start), str(last_month_end)]]
    })
    comparisons["customers"] = calculate_change(new_customers_current, new_customers_last)

    # 2. Clients at risk comparison
    at_risk_current = get_at_risk_customers_count()
    comparisons["at_risk"] = {
        "change": 0,
        "direction": "neutral",
        "label": "vs last month"
    }

    # 3. Renewal revenue comparison (renewals this month vs last month)
    renewal_revenue_current = 0
    renewal_revenue_last = 0

    if has_order_type:
        renewal_revenue_current = frappe.db.sql("""
            SELECT COALESCE(SUM(grand_total), 0) as total
            FROM `tabSales Order`
            WHERE docstatus = 1
            AND custom_order_type IN ('Renewal', 'Extension Private', 'Extension Business')
            AND transaction_date BETWEEN %(start)s AND %(end)s
        """, {"start": str(current_month_start), "end": str(current_month_end)}, as_dict=True)[0].get("total", 0)

        renewal_revenue_last = frappe.db.sql("""
            SELECT COALESCE(SUM(grand_total), 0) as total
            FROM `tabSales Order`
            WHERE docstatus = 1
            AND custom_order_type IN ('Renewal', 'Extension Private', 'Extension Business')
            AND transaction_date BETWEEN %(start)s AND %(end)s
        """, {"start": str(last_month_start), "end": str(last_month_end)}, as_dict=True)[0].get("total", 0)

    comparisons["renewal_revenue"] = calculate_change(
        flt(renewal_revenue_current),
        flt(renewal_revenue_last)
    )

    # 4. Renewal rate comparison
    total_orders_current = frappe.db.count("Sales Order", {
        "docstatus": 1,
        "transaction_date": ["between", [str(current_month_start), str(current_month_end)]]
    })
    total_orders_last = frappe.db.count("Sales Order", {
        "docstatus": 1,
        "transaction_date": ["between", [str(last_month_start), str(last_month_end)]]
    })

    renewal_orders_current = 0
    renewal_orders_last = 0

    if has_order_type:
        renewal_orders_current = frappe.db.count("Sales Order", {
            "docstatus": 1,
            "custom_order_type": ["in", ["Renewal", "Extension Private", "Extension Business"]],
            "transaction_date": ["between", [str(current_month_start), str(current_month_end)]]
        })
        renewal_orders_last = frappe.db.count("Sales Order", {
            "docstatus": 1,
            "custom_order_type": ["in", ["Renewal", "Extension Private", "Extension Business"]],
            "transaction_date": ["between", [str(last_month_start), str(last_month_end)]]
        })

    rate_current = (renewal_orders_current / total_orders_current * 100) if total_orders_current > 0 else 0
    rate_last = (renewal_orders_last / total_orders_last * 100) if total_orders_last > 0 else 0
    comparisons["renewal_rate"] = calculate_change(rate_current, rate_last, is_percentage=True)

    # 5. Renewals this month count comparison
    comparisons["renewals_count"] = calculate_change(renewal_orders_current, renewal_orders_last)

    return comparisons


def calculate_change(current, previous, is_percentage=False):
    """
    Calculate percentage change between two values.
    Returns dict with change percentage, direction, and label.
    """
    if previous == 0:
        if current > 0:
            return {
                "change": 100,
                "direction": "up",
                "label": "+100% vs last month"
            }
        return {
            "change": 0,
            "direction": "neutral",
            "label": "No change"
        }

    change = ((current - previous) / previous) * 100

    if is_percentage:
        # For percentages, show the point difference, not percentage of percentage
        change = current - previous

    direction = "up" if change > 0 else "down" if change < 0 else "neutral"
    abs_change = abs(change)

    if is_percentage:
        label = f"{'+' if change > 0 else ''}{change:.1f}pp vs last month"
    else:
        label = f"{'+' if change > 0 else ''}{change:.1f}% vs last month"

    return {
        "change": round(abs_change, 1),
        "direction": direction,
        "label": label,
        "raw_change": round(change, 1)
    }


def get_renewal_metrics():
    """Calculate overall renewal metrics"""
    today = nowdate()
    month_start = getdate(today).replace(day=1)
    year_ago = add_days(today, -DAYS_INACTIVE_CRITICAL)

    total_renewal_orders = 0
    renewals_this_month = 0

    if has_so_field("custom_order_type"):
        # Renewal rate: renewals / (renewals + churned)
        total_renewal_orders = frappe.db.count("Sales Order", {
            "docstatus": 1,
            "custom_order_type": ["in", ["Renewal", "Extension Private", "Extension Business"]],
            "transaction_date": [">=", year_ago]
        })

        # Renewals this month
        renewals_this_month = frappe.db.count("Sales Order", {
            "docstatus": 1,
            "custom_order_type": ["in", ["Renewal", "Extension Private", "Extension Business"]],
            "transaction_date": [">=", month_start]
        })

    total_customers_with_orders = frappe.db.sql("""
        SELECT COUNT(DISTINCT customer)
        FROM `tabSales Order`
        WHERE docstatus = 1
        AND transaction_date >= %(year_ago)s
    """, {"year_ago": year_ago})[0][0] or 1

    # Average LTV
    avg_ltv = frappe.db.sql("""
        SELECT AVG(ltv) FROM (
            SELECT customer, SUM(grand_total) as ltv
            FROM `tabSales Order`
            WHERE docstatus = 1
            GROUP BY customer
        ) as customer_ltv
    """)[0][0] or 0

    return {
        "renewal_rate": round((total_renewal_orders / total_customers_with_orders) * 100, 1) if total_customers_with_orders > 0 else 0,
        "renewals_this_month": renewals_this_month,
        "avg_ltv": flt(avg_ltv, 2)
    }


def get_at_risk_customers_count():
    """Count customers at risk of churning"""
    today = nowdate()
    ninety_days_ago = add_days(today, -DAYS_AT_RISK_THRESHOLD)

    # Customers with no orders in DAYS_AT_RISK_THRESHOLD days
    inactive_customers = frappe.db.sql("""
        SELECT COUNT(DISTINCT c.name)
        FROM `tabCustomer` c
        WHERE c.disabled = 0
        AND c.name IN (
            SELECT DISTINCT customer FROM `tabSales Order` WHERE docstatus = 1
        )
        AND c.name NOT IN (
            SELECT DISTINCT customer
            FROM `tabSales Order`
            WHERE docstatus = 1
            AND transaction_date >= %(cutoff)s
        )
    """, {"cutoff": ninety_days_ago})[0][0] or 0

    # Customers with overdue subscriptions
    overdue_subscriptions = frappe.db.sql("""
        SELECT COUNT(DISTINCT party)
        FROM `tabSubscription`
        WHERE party_type = 'Customer'
        AND status = 'Past Due Date'
    """)[0][0] or 0

    return inactive_customers + overdue_subscriptions


def get_upcoming_renewal_revenue(days=DAYS_RENEWAL_WINDOW):
    """Calculate total revenue from upcoming renewals"""
    today = nowdate()
    future_date = add_days(today, days)

    # Sum of annual revenue for customers with renewals in the period
    revenue = frappe.db.sql("""
        SELECT COALESCE(SUM(annual_revenue), 0)
        FROM (
            SELECT
                sub.party,
                (
                    SELECT SUM(so.grand_total)
                    FROM `tabSales Order` so
                    WHERE so.customer = sub.party
                    AND so.docstatus = 1
                    AND so.transaction_date >= DATE_SUB(%(today)s, INTERVAL 1 YEAR)
                ) as annual_revenue
            FROM `tabSubscription` sub
            WHERE sub.party_type = 'Customer'
            AND sub.status IN ('Active', 'Past Due Date', 'Unpaid')
            AND sub.end_date BETWEEN %(today)s AND %(future)s
            GROUP BY sub.party
        ) as renewal_customers
    """, {"today": today, "future": future_date})[0][0] or 0

    return flt(revenue, 2)


def calculate_total_upsell_potential():
    """Calculate total upsell potential across all customers"""
    if not has_so_field("custom_trend_micro_seats"):
        return 0

    avg_seats = frappe.db.sql("""
        SELECT AVG(custom_trend_micro_seats)
        FROM `tabSales Order`
        WHERE docstatus = 1
        AND custom_trend_micro_seats > 0
    """)[0][0] or 10

    # Customers below average seats
    below_avg_customers = frappe.db.sql("""
        SELECT
            customer,
            MAX(custom_trend_micro_seats) as current_seats,
            MAX(grand_total) as last_order_value
        FROM `tabSales Order`
        WHERE docstatus = 1
        AND custom_trend_micro_seats > 0
        AND custom_trend_micro_seats < %(avg)s
        GROUP BY customer
    """, {"avg": avg_seats}, as_dict=True)

    # Estimate upsell: (avg_seats - current_seats) * price_per_seat estimate
    total_upsell = sum(
        (avg_seats - c.get("current_seats", 0)) * PRICE_PER_SEAT
        for c in below_avg_customers
    )

    return flt(total_upsell, 2)


def calculate_renewal_status(renewal_date, last_order_date, today):
    """Determine renewal status for a customer"""
    if renewal_date:
        renewal_date = getdate(renewal_date)
        if renewal_date < today:
            return "overdue"
        elif renewal_date <= add_days(today, DAYS_DUE_SOON_THRESHOLD):
            return "due_soon"
        else:
            return "active"
    elif last_order_date:
        last_order_date = getdate(last_order_date)
        days_since = (today - last_order_date).days
        if days_since > DAYS_INACTIVE_CRITICAL:
            return "overdue"
        elif days_since > DAYS_INACTIVE_WARNING:
            return "due_soon"
        else:
            return "active"
    return "unknown"


def calculate_priority_score(customer):
    """
    Calculate a priority score for at-risk clients (0-100).
    Higher score = higher priority = needs attention first.

    Factors:
    - Revenue at risk (up to 40 points)
    - Urgency/Days overdue or until renewal (up to 35 points)
    - Customer tier (up to 15 points)
    - Engagement history (up to 10 points)
    """
    score = 0
    lifetime_value = flt(customer.get("lifetime_value", 0))
    days_until = customer.get("days_until_renewal")
    renewal_status = customer.get("renewal_status")
    customer_group = customer.get("customer_group", "")
    total_orders = cint(customer.get("total_orders", 0))

    # Revenue at risk (0-PRIORITY_WEIGHT_REVENUE points)
    # Uses revenue tier thresholds
    if lifetime_value >= REVENUE_TIER_ENTERPRISE:
        score += 40
    elif lifetime_value >= REVENUE_TIER_HIGH:
        score += 30
    elif lifetime_value >= REVENUE_TIER_MEDIUM:
        score += 20
    elif lifetime_value >= REVENUE_TIER_LOW:
        score += 10
    else:
        score += 5

    # Urgency (0-PRIORITY_WEIGHT_URGENCY points)
    if renewal_status == "overdue":
        # Overdue: more days overdue = higher priority
        days_overdue = abs(days_until) if days_until and days_until < 0 else 0
        if days_overdue >= URGENCY_OVERDUE_CRITICAL:
            score += 35
        elif days_overdue >= URGENCY_OVERDUE_HIGH:
            score += 30
        elif days_overdue >= URGENCY_OVERDUE_MEDIUM:
            score += 25
        else:
            score += 20
    elif renewal_status == "due_soon":
        # Due soon: fewer days = higher priority
        days_left = days_until if days_until and days_until > 0 else DAYS_DUE_SOON_THRESHOLD
        if days_left <= URGENCY_DUE_VERY_SOON:
            score += 18
        elif days_left <= URGENCY_DUE_SOON:
            score += 12
        elif days_left <= URGENCY_DUE_APPROACHING:
            score += 8
        else:
            score += 4
    else:
        # Active: no urgency bonus
        score += 0

    # Customer tier (0-15 points)
    if customer_group and customer_group.lower() in ["enterprise", "strategic", "vip"]:
        score += 15
    elif customer_group and customer_group.lower() in ["commercial", "smb"]:
        score += 8
    else:
        score += 3

    # Engagement/loyalty (0-PRIORITY_WEIGHT_ENGAGEMENT points)
    # More orders = more valuable relationship to preserve
    if total_orders >= ENGAGEMENT_LOYAL:
        score += 10
    elif total_orders >= ENGAGEMENT_REGULAR:
        score += 7
    elif total_orders >= ENGAGEMENT_OCCASIONAL:
        score += 4
    else:
        score += 1

    return min(score, PRIORITY_SCORE_MAX)  # Cap at max


def get_priority_label(score):
    """Convert priority score to human-readable label"""
    if score >= PRIORITY_CRITICAL:
        return "critical"
    elif score >= PRIORITY_HIGH:
        return "high"
    elif score >= PRIORITY_MEDIUM:
        return "medium"
    else:
        return "low"


def get_priority_score_breakdown(customer):
    """
    Get detailed breakdown of how priority score is calculated.
    Returns component scores and explanations for transparency.

    Args:
        customer: Customer dict with LTV, renewal info, etc.

    Returns:
        Dict with breakdown of all scoring components
    """
    lifetime_value = flt(customer.get("lifetime_value", 0))
    days_until = customer.get("days_until_renewal")
    renewal_status = customer.get("renewal_status")
    customer_group = customer.get("customer_group", "")
    total_orders = cint(customer.get("total_orders", 0))

    breakdown = {
        "total_score": 0,
        "components": []
    }

    # 1. Revenue Component (40% weight)
    revenue_score = 0
    revenue_tier = ""
    revenue_explanation = ""

    if lifetime_value >= REVENUE_TIER_ENTERPRISE:
        revenue_score = 40
        revenue_tier = "Enterprise"
        revenue_explanation = f"LTV ${lifetime_value:,.0f} (Enterprise tier ≥ ${REVENUE_TIER_ENTERPRISE:,})"
    elif lifetime_value >= REVENUE_TIER_HIGH:
        revenue_score = 30
        revenue_tier = "High Value"
        revenue_explanation = f"LTV ${lifetime_value:,.0f} (High tier ≥ ${REVENUE_TIER_HIGH:,})"
    elif lifetime_value >= REVENUE_TIER_MEDIUM:
        revenue_score = 20
        revenue_tier = "Medium Value"
        revenue_explanation = f"LTV ${lifetime_value:,.0f} (Medium tier ≥ ${REVENUE_TIER_MEDIUM:,})"
    elif lifetime_value >= REVENUE_TIER_LOW:
        revenue_score = 10
        revenue_tier = "Low Value"
        revenue_explanation = f"LTV ${lifetime_value:,.0f} (Low tier ≥ ${REVENUE_TIER_LOW:,})"
    else:
        revenue_score = 5
        revenue_tier = "Minimal"
        revenue_explanation = f"LTV ${lifetime_value:,.0f} (Below ${REVENUE_TIER_LOW:,})"

    breakdown["components"].append({
        "name": "Revenue at Risk",
        "score": revenue_score,
        "max_score": PRIORITY_WEIGHT_REVENUE,
        "percentage": (revenue_score / PRIORITY_WEIGHT_REVENUE) * 100,
        "tier": revenue_tier,
        "explanation": revenue_explanation,
        "icon": "dollar-sign"
    })

    # 2. Urgency Component (35% weight)
    urgency_score = 0
    urgency_tier = ""
    urgency_explanation = ""

    if renewal_status == "overdue":
        days_overdue = abs(days_until) if days_until and days_until < 0 else 0
        if days_overdue >= URGENCY_OVERDUE_CRITICAL:
            urgency_score = 35
            urgency_tier = "Critical"
            urgency_explanation = f"{days_overdue} days overdue (≥{URGENCY_OVERDUE_CRITICAL} days)"
        elif days_overdue >= URGENCY_OVERDUE_HIGH:
            urgency_score = 30
            urgency_tier = "High"
            urgency_explanation = f"{days_overdue} days overdue ({URGENCY_OVERDUE_HIGH}-{URGENCY_OVERDUE_CRITICAL-1} days)"
        elif days_overdue >= URGENCY_OVERDUE_MEDIUM:
            urgency_score = 25
            urgency_tier = "Medium"
            urgency_explanation = f"{days_overdue} days overdue ({URGENCY_OVERDUE_MEDIUM}-{URGENCY_OVERDUE_HIGH-1} days)"
        else:
            urgency_score = 20
            urgency_tier = "Recent"
            urgency_explanation = f"{days_overdue} days overdue (< {URGENCY_OVERDUE_MEDIUM} days)"
    elif renewal_status == "due_soon":
        days_left = days_until if days_until and days_until > 0 else DAYS_DUE_SOON_THRESHOLD
        if days_left <= URGENCY_DUE_VERY_SOON:
            urgency_score = 18
            urgency_tier = "Very Soon"
            urgency_explanation = f"{days_left} days until renewal (≤{URGENCY_DUE_VERY_SOON} days)"
        elif days_left <= URGENCY_DUE_SOON:
            urgency_score = 12
            urgency_tier = "Soon"
            urgency_explanation = f"{days_left} days until renewal ({URGENCY_DUE_VERY_SOON+1}-{URGENCY_DUE_SOON} days)"
        elif days_left <= URGENCY_DUE_APPROACHING:
            urgency_score = 8
            urgency_tier = "Approaching"
            urgency_explanation = f"{days_left} days until renewal ({URGENCY_DUE_SOON+1}-{URGENCY_DUE_APPROACHING} days)"
        else:
            urgency_score = 4
            urgency_tier = "Distant"
            urgency_explanation = f"{days_left} days until renewal (> {URGENCY_DUE_APPROACHING} days)"
    else:
        urgency_score = 0
        urgency_tier = "Active"
        urgency_explanation = "No immediate renewal pressure"

    breakdown["components"].append({
        "name": "Renewal Urgency",
        "score": urgency_score,
        "max_score": PRIORITY_WEIGHT_URGENCY,
        "percentage": (urgency_score / PRIORITY_WEIGHT_URGENCY) * 100,
        "tier": urgency_tier,
        "explanation": urgency_explanation,
        "icon": "clock"
    })

    # 3. Customer Tier Component (15% weight)
    tier_score = 0
    tier_label = ""
    tier_explanation = ""

    if customer_group and customer_group.lower() in ["enterprise", "strategic", "vip"]:
        tier_score = 15
        tier_label = "Premium"
        tier_explanation = f"{customer_group} tier (strategic importance)"
    elif customer_group and customer_group.lower() in ["commercial", "smb"]:
        tier_score = 8
        tier_label = "Standard"
        tier_explanation = f"{customer_group} tier (commercial)"
    else:
        tier_score = 3
        tier_label = "Basic"
        tier_explanation = f"{customer_group or 'Unassigned'} tier"

    breakdown["components"].append({
        "name": "Customer Tier",
        "score": tier_score,
        "max_score": PRIORITY_WEIGHT_TIER,
        "percentage": (tier_score / PRIORITY_WEIGHT_TIER) * 100,
        "tier": tier_label,
        "explanation": tier_explanation,
        "icon": "award"
    })

    # 4. Engagement Component (10% weight)
    engagement_score = 0
    engagement_tier = ""
    engagement_explanation = ""

    if total_orders >= ENGAGEMENT_LOYAL:
        engagement_score = 10
        engagement_tier = "Loyal"
        engagement_explanation = f"{total_orders} orders (≥{ENGAGEMENT_LOYAL} loyal customer)"
    elif total_orders >= ENGAGEMENT_REGULAR:
        engagement_score = 7
        engagement_tier = "Regular"
        engagement_explanation = f"{total_orders} orders ({ENGAGEMENT_REGULAR}-{ENGAGEMENT_LOYAL-1} regular)"
    elif total_orders >= ENGAGEMENT_OCCASIONAL:
        engagement_score = 4
        engagement_tier = "Occasional"
        engagement_explanation = f"{total_orders} orders ({ENGAGEMENT_OCCASIONAL}-{ENGAGEMENT_REGULAR-1} occasional)"
    else:
        engagement_score = 1
        engagement_tier = "New"
        engagement_explanation = f"{total_orders} orders (new/infrequent)"

    breakdown["components"].append({
        "name": "Engagement",
        "score": engagement_score,
        "max_score": PRIORITY_WEIGHT_ENGAGEMENT,
        "percentage": (engagement_score / PRIORITY_WEIGHT_ENGAGEMENT) * 100,
        "tier": engagement_tier,
        "explanation": engagement_explanation,
        "icon": "activity"
    })

    # Calculate total
    total_score = revenue_score + urgency_score + tier_score + engagement_score
    breakdown["total_score"] = min(total_score, PRIORITY_SCORE_MAX)
    breakdown["max_possible_score"] = PRIORITY_SCORE_MAX
    breakdown["priority_level"] = get_priority_label(breakdown["total_score"])

    return breakdown


def calculate_days_until(date, today):
    """Calculate days until a future date"""
    if not date:
        return None
    date = getdate(date)
    return (date - today).days


def calculate_days_since(date, today):
    """Calculate days since a past date"""
    if not date:
        return None
    date = getdate(date)
    return (today - date).days


def calculate_customer_upsell_potential(customer):
    """Calculate upsell potential for a specific customer"""
    # Simple heuristic based on current spend vs potential
    lifetime_value = flt(customer.get("lifetime_value", 0))
    total_orders = cint(customer.get("total_orders", 0))

    if total_orders == 0:
        return 0

    avg_order = lifetime_value / total_orders

    # Potential: assume they could increase by 25% with upsell
    return flt(avg_order * 0.25, 2)


def calculate_upsell_recommendations(customer_id, orders, product_breakdown):
    """Generate specific upsell recommendations for a customer"""
    recommendations = []

    # Check for seat upgrades
    for order in orders:
        if order.get("seats") and order.get("seats") < 10:
            recommendations.append({
                "type": "seat_upgrade",
                "title": "Seat Upgrade Opportunity",
                "description": f"Current: {order.get('seats')} seats. Consider upgrading to 10+ seats for volume discount.",
                "potential_value": (10 - order.get("seats", 0)) * PRICE_PER_SEAT
            })
            break

    # Check for product cross-sell
    products_owned = set(product_breakdown.keys())
    all_products = {"Security", "Trend Micro", "Kaspersky", "Bitdefender", "Norton", "McAfee"}
    missing_products = all_products - products_owned - {"Other"}

    if missing_products and len(products_owned) > 0:
        recommendations.append({
            "type": "cross_sell",
            "title": "Cross-Sell Opportunity",
            "description": f"Customer hasn't purchased: {', '.join(list(missing_products)[:3])}",
            "potential_value": 500  # Estimated cross-sell value
        })

    # Check for upgrade opportunities (e.g., Private to Business)
    for order in orders:
        if order.get("order_type") in ["New Order Private", "Extension Private"]:
            recommendations.append({
                "type": "tier_upgrade",
                "title": "Business Tier Upgrade",
                "description": "Customer is on Private tier. Consider upgrading to Business tier for enhanced features.",
                "potential_value": 200
            })
            break

    return recommendations


@frappe.whitelist()
@require_retention_access
def get_customer_priority_breakdown(customer_id):
    """
    Get detailed breakdown of priority score calculation for a customer.

    Args:
        customer_id: Customer name/ID

    Returns:
        Detailed breakdown of priority score components
    """
    try:
        # Validate customer exists
        if not frappe.db.exists("Customer", customer_id):
            frappe.throw(_("Customer not found"), frappe.DoesNotExistError)

        today = getdate(nowdate())

        # Get customer data (reuse the same query pattern)
        customer_data = frappe.db.sql("""
            SELECT
                c.name as customer_id,
                c.customer_name,
                c.customer_group,
                c.territory,
                COALESCE(co.last_order_date, NULL) as last_order_date,
                COALESCE(co.lifetime_value, 0) as lifetime_value,
                COALESCE(co.total_orders, 0) as total_orders,
                cs.next_renewal_date
            FROM `tabCustomer` c
            LEFT JOIN (
                SELECT
                    customer,
                    MAX(transaction_date) as last_order_date,
                    SUM(grand_total) as lifetime_value,
                    COUNT(*) as total_orders
                FROM `tabSales Order`
                WHERE docstatus = 1
                GROUP BY customer
            ) co ON co.customer = c.name
            LEFT JOIN (
                SELECT
                    party as customer,
                    MIN(end_date) as next_renewal_date
                FROM `tabSubscription`
                WHERE party_type = 'Customer'
                AND status IN ('Active', 'Past Due Date', 'Unpaid')
                GROUP BY party
            ) cs ON cs.customer = c.name
            WHERE c.name = %(customer_id)s
            LIMIT 1
        """, {"customer_id": customer_id}, as_dict=True)

        if not customer_data:
            frappe.throw(_("Customer data not found"), frappe.DoesNotExistError)

        customer = customer_data[0]

        # Calculate renewal status and metrics
        renewal_status = calculate_renewal_status(
            customer.get("next_renewal_date"),
            customer.get("last_order_date"),
            today
        )

        customer["renewal_status"] = renewal_status
        customer["days_until_renewal"] = calculate_days_until(customer.get("next_renewal_date"), today)
        customer["priority_score"] = calculate_priority_score(customer)

        # Get detailed breakdown
        breakdown = get_priority_score_breakdown(customer)

        # Log access
        log_security_event(
            "priority_breakdown_viewed",
            f"Viewed priority breakdown for {customer_id}"
        )

        return breakdown

    except (frappe.DoesNotExistError, frappe.ValidationError):
        raise
    except Exception as e:
        frappe.log_error(
            title=_("Retention Dashboard - Error in get_customer_priority_breakdown"),
            message=frappe.get_traceback()
        )
        frappe.throw(_("Failed to get priority breakdown"))


@frappe.whitelist()
@require_retention_access
def mark_customer_contacted(customer_id, contact_type="call", notes=None):
    """
    Mark a customer as contacted and log the interaction.

    Creates a Comment record to track customer outreach for retention purposes.

    Args:
        customer_id: Customer name/ID
        contact_type: Type of contact (call, email, meeting, other)
        notes: Optional notes about the interaction

    Returns:
        Success status and contact timestamp
    """
    try:
        # Validate customer exists
        if not frappe.db.exists("Customer", customer_id):
            frappe.throw(_("Customer not found"), frappe.DoesNotExistError)

        # Validate contact type
        valid_types = ["call", "email", "meeting", "other"]
        if contact_type not in valid_types:
            contact_type = "call"

        # Get customer name for display
        customer_name = frappe.db.get_value("Customer", customer_id, "customer_name")

        # Create contact log as Comment
        comment_content = f"**Retention Outreach - {contact_type.title()}**\n\n"
        if notes:
            comment_content += f"{notes}\n\n"
        comment_content += f"_Logged by {frappe.session.user} via Retention Dashboard_"

        comment = frappe.get_doc({
            "doctype": "Comment",
            "comment_type": "Info",
            "reference_doctype": "Customer",
            "reference_name": customer_id,
            "content": comment_content,
            "comment_email": frappe.session.user,
            "comment_by": frappe.session.user
        })
        comment.insert(ignore_permissions=True)

        # Also create an Activity Log for visibility
        frappe.get_doc({
            "doctype": "Activity Log",
            "subject": f"Retention contact: {contact_type.title()} with {customer_name}",
            "communication_date": frappe.utils.now(),
            "reference_doctype": "Customer",
            "reference_name": customer_id,
            "timeline_doctype": "Customer",
            "timeline_name": customer_id,
            "status": "Closed",
            "user": frappe.session.user,
            "full_name": frappe.utils.get_fullname(frappe.session.user)
        }).insert(ignore_permissions=True)

        # Log security event
        log_security_event(
            "customer_contact_logged",
            f"Marked {customer_id} as contacted ({contact_type})"
        )

        # Get the last contact timestamp (most recent comment)
        last_contact = frappe.db.sql("""
            SELECT creation
            FROM `tabComment`
            WHERE reference_doctype = 'Customer'
            AND reference_name = %(customer_id)s
            AND content LIKE '%%Retention Outreach%%'
            ORDER BY creation DESC
            LIMIT 1
        """, {"customer_id": customer_id}, as_dict=True)

        last_contact_time = last_contact[0].creation if last_contact else frappe.utils.now()

        return {
            "success": True,
            "customer_id": customer_id,
            "customer_name": customer_name,
            "contact_type": contact_type,
            "contacted_at": last_contact_time,
            "contacted_by": frappe.session.user,
            "message": f"Successfully logged {contact_type} with {customer_name}"
        }

    except (frappe.DoesNotExistError, frappe.ValidationError):
        raise
    except Exception as e:
        frappe.log_error(
            title=_("Retention Dashboard - Error in mark_customer_contacted"),
            message=frappe.get_traceback()
        )
        frappe.throw(_("Failed to log customer contact"))


@frappe.whitelist()
@require_retention_access
def get_customer_last_contact(customer_id):
    """
    Get the last contact timestamp for a customer from retention outreach logs.

    Args:
        customer_id: Customer name/ID

    Returns:
        Last contact info or None
    """
    try:
        # Validate customer exists
        if not frappe.db.exists("Customer", customer_id):
            return None

        # Get most recent retention contact
        last_contact = frappe.db.sql("""
            SELECT
                creation as contacted_at,
                comment_by as contacted_by,
                content
            FROM `tabComment`
            WHERE reference_doctype = 'Customer'
            AND reference_name = %(customer_id)s
            AND content LIKE '%%Retention Outreach%%'
            ORDER BY creation DESC
            LIMIT 1
        """, {"customer_id": customer_id}, as_dict=True)

        if not last_contact:
            return None

        contact = last_contact[0]

        # Parse contact type from content
        contact_type = "call"  # default
        if "email" in contact.content.lower():
            contact_type = "email"
        elif "meeting" in contact.content.lower():
            contact_type = "meeting"

        return {
            "contacted_at": contact.contacted_at,
            "contacted_by": contact.contacted_by,
            "contact_type": contact_type,
            "days_ago": (frappe.utils.nowdate() - frappe.utils.getdate(contact.contacted_at)).days
        }

    except Exception as e:
        frappe.log_error(
            title=_("Retention Dashboard - Error in get_customer_last_contact"),
            message=frappe.get_traceback()
        )
        return None


@frappe.whitelist()
@require_retention_access
def search_customers(query, limit=50):
    """
    Global search across all customers for retention dashboard

    Searches by:
    - Customer name
    - Customer ID
    - Email address
    - Phone number

    Args:
        query: Search string (min 2 characters)
        limit: Maximum results to return (default 50)

    Returns:
        List of customers matching search criteria with retention data
    """
    try:
        # Validate query
        if not query or not isinstance(query, str):
            frappe.throw(_("Search query is required"), frappe.ValidationError)

        query = query.strip()

        if len(query) < 2:
            frappe.throw(_("Search query must be at least 2 characters"), frappe.ValidationError)

        # Validate limit
        limit = cint(limit)
        if limit < 1 or limit > 200:
            limit = 50

        today = getdate(nowdate())

        # Sanitize search query for LIKE
        search_pattern = f"%{query}%"

        # Search query with optimized JOINs
        products_col = "GROUP_CONCAT(DISTINCT custom_product) as products_purchased" if has_so_field("custom_product") else "NULL as products_purchased"

        customers = frappe.db.sql("""
            SELECT
                c.name as customer_id,
                c.customer_name,
                c.email_id as email,
                c.mobile_no as phone,
                c.customer_group,
                c.territory,
                c.creation as customer_since,
                COALESCE(co.last_order_date, NULL) as last_order_date,
                COALESCE(co.lifetime_value, 0) as lifetime_value,
                COALESCE(co.total_orders, 0) as total_orders,
                co.products_purchased,
                cs.next_renewal_date
            FROM `tabCustomer` c
            LEFT JOIN (
                SELECT
                    customer,
                    MAX(transaction_date) as last_order_date,
                    SUM(grand_total) as lifetime_value,
                    COUNT(*) as total_orders,
                    {products_col}
                FROM `tabSales Order`
                WHERE docstatus = 1
                GROUP BY customer
            ) co ON co.customer = c.name
            LEFT JOIN (
                SELECT
                    party as customer,
                    MIN(end_date) as next_renewal_date
                FROM `tabSubscription`
                WHERE party_type = 'Customer'
                AND status IN ('Active', 'Past Due Date', 'Unpaid')
                GROUP BY party
            ) cs ON cs.customer = c.name
            WHERE c.disabled = 0
            AND (
                c.customer_name LIKE %(search_pattern)s
                OR c.name LIKE %(search_pattern)s
                OR c.email_id LIKE %(search_pattern)s
                OR c.mobile_no LIKE %(search_pattern)s
            )
            ORDER BY
                CASE
                    WHEN c.customer_name LIKE %(search_pattern)s THEN 1
                    WHEN c.name LIKE %(search_pattern)s THEN 2
                    WHEN c.email_id LIKE %(search_pattern)s THEN 3
                    ELSE 4
                END,
                COALESCE(co.last_order_date, '1900-01-01') DESC
            LIMIT %(limit)s
        """.format(products_col=products_col), {
            "search_pattern": search_pattern,
            "limit": limit
        }, as_dict=True)

        # Process results with retention info
        result = []
        for customer in customers:
            renewal_status = calculate_renewal_status(
                customer.get("next_renewal_date"),
                customer.get("last_order_date"),
                today
            )

            customer["renewal_status"] = renewal_status
            customer["renewal_date"] = customer.get("next_renewal_date")
            customer["days_until_renewal"] = calculate_days_until(customer.get("next_renewal_date"), today)
            customer["days_since_last_order"] = calculate_days_since(customer.get("last_order_date"), today)
            customer["lifetime_value"] = flt(customer.get("lifetime_value", 0), 2)
            customer["upsell_potential"] = calculate_customer_upsell_potential(customer)
            customer["priority_score"] = calculate_priority_score(customer)
            customer["priority_level"] = get_priority_label(customer["priority_score"])

            result.append(customer)

        # Sort by priority (at-risk customers first)
        result.sort(key=lambda x: (
            0 if x["renewal_status"] in ["overdue", "due_soon"] else 1,
            -x["priority_score"],
            x.get("days_until_renewal") or 999
        ))

        # Log search
        log_security_event(
            "customer_search",
            f"Searched for '{query}' - {len(result)} results found"
        )

        return {
            "customers": result,
            "count": len(result),
            "query": query,
            "has_more": len(result) >= limit
        }

    except frappe.ValidationError:
        raise
    except Exception as e:
        frappe.log_error(
            title=_("Retention Dashboard - Error in search_customers"),
            message=frappe.get_traceback()
        )
        frappe.throw(_("Search failed. Please try again."))
