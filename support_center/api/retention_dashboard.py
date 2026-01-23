"""
Retention Dashboard API
Provides analytics for client retention, renewal tracking, and upsell opportunities
"""

import frappe
from frappe import _
from frappe.utils import nowdate, add_days, getdate, flt, cint
from datetime import datetime, timedelta


@frappe.whitelist()
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
    today = nowdate()

    # Total active customers
    total_customers = frappe.db.count("Customer", {"disabled": 0})

    # Get customers with renewal orders in last year to establish baseline
    renewal_data = get_renewal_metrics()

    # Clients at risk (no order in 90+ days, or overdue subscriptions)
    at_risk_customers = get_at_risk_customers_count()

    # Revenue up for renewal (from subscriptions ending in next 90 days)
    renewal_revenue = get_upcoming_renewal_revenue(days=90)

    # Potential upsell value calculation
    upsell_potential = calculate_total_upsell_potential()

    # Get comparison metrics (vs last month)
    comparisons = get_kpi_comparisons()

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


@frappe.whitelist()
def get_clients_by_renewal_status(status_filter=None, days_range=90, limit=50, offset=0):
    """
    Get list of clients segmented by renewal status

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
    today = getdate(nowdate())
    due_soon_date = add_days(today, cint(days_range))

    # Base query to get customers with their order history
    customers = frappe.db.sql("""
        SELECT
            c.name as customer_id,
            c.customer_name,
            c.email_id as email,
            c.mobile_no as phone,
            c.customer_group,
            c.territory,
            c.creation as customer_since,
            (
                SELECT MAX(so.transaction_date)
                FROM `tabSales Order` so
                WHERE so.customer = c.name
                AND so.docstatus = 1
            ) as last_order_date,
            (
                SELECT SUM(so.grand_total)
                FROM `tabSales Order` so
                WHERE so.customer = c.name
                AND so.docstatus = 1
            ) as lifetime_value,
            (
                SELECT COUNT(*)
                FROM `tabSales Order` so
                WHERE so.customer = c.name
                AND so.docstatus = 1
            ) as total_orders,
            (
                SELECT GROUP_CONCAT(DISTINCT so.custom_product)
                FROM `tabSales Order` so
                WHERE so.customer = c.name
                AND so.docstatus = 1
                AND so.custom_product IS NOT NULL
                AND so.custom_product != ''
            ) as products_purchased,
            (
                SELECT MIN(sub.end_date)
                FROM `tabSubscription` sub
                WHERE sub.party_type = 'Customer'
                AND sub.party = c.name
                AND sub.status IN ('Active', 'Past Due Date', 'Unpaid')
            ) as next_renewal_date
        FROM `tabCustomer` c
        WHERE c.disabled = 0
        ORDER BY last_order_date DESC
        LIMIT %(limit)s OFFSET %(offset)s
    """, {"limit": cint(limit), "offset": cint(offset)}, as_dict=True)

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

        result.append(customer)

    # Sort by priority score (highest first) for at-risk clients
    # Active clients are sorted by renewal date
    result.sort(key=lambda x: (
        0 if x["renewal_status"] in ["overdue", "due_soon"] else 1,  # At-risk first
        -x["priority_score"],  # Then by priority (highest first)
        x.get("days_until_renewal") or 999  # Then by urgency
    ))

    return result


@frappe.whitelist()
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
    if not frappe.db.exists("Customer", customer_id):
        frappe.throw(_("Customer not found"), frappe.DoesNotExistError)

    customer = frappe.get_doc("Customer", customer_id)

    # Get purchase history
    orders = frappe.db.sql("""
        SELECT
            so.name as order_id,
            so.transaction_date,
            so.grand_total,
            so.status,
            so.custom_order_type as order_type,
            so.custom_product as product,
            so.custom_trend_micro_seats as seats,
            so.custom_previous_order as previous_order,
            so.custom_salesperson as salesperson
        FROM `tabSales Order` so
        WHERE so.customer = %(customer)s
        AND so.docstatus = 1
        ORDER BY so.transaction_date DESC
        LIMIT 20
    """, {"customer": customer_id}, as_dict=True)

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
            "renewal_status": calculate_renewal_status(next_renewal, orders[0].get("transaction_date") if orders else None, getdate(nowdate()))
        },
        "product_breakdown": product_breakdown,
        "orders": orders,
        "subscriptions": subscriptions,
        "upsell_recommendations": upsell_recommendations
    }


@frappe.whitelist()
def get_renewal_calendar(start_date=None, end_date=None):
    """
    Get renewals organized by date for calendar view
    """
    if not start_date:
        start_date = nowdate()
    if not end_date:
        end_date = add_days(start_date, 90)

    renewals = frappe.db.sql("""
        SELECT
            sub.name as subscription_id,
            sub.party as customer_id,
            c.customer_name,
            sub.end_date as renewal_date,
            sub.status,
            (
                SELECT SUM(so.grand_total)
                FROM `tabSales Order` so
                WHERE so.customer = sub.party
                AND so.docstatus = 1
                AND so.transaction_date >= DATE_SUB(sub.end_date, INTERVAL 1 YEAR)
            ) as annual_value
        FROM `tabSubscription` sub
        JOIN `tabCustomer` c ON c.name = sub.party
        WHERE sub.party_type = 'Customer'
        AND sub.status IN ('Active', 'Past Due Date', 'Unpaid')
        AND sub.end_date BETWEEN %(start)s AND %(end)s
        ORDER BY sub.end_date ASC
    """, {"start": start_date, "end": end_date}, as_dict=True)

    # Add risk level based on annual value
    for renewal in renewals:
        annual_value = flt(renewal.get("annual_value", 0))
        if annual_value >= 5000:
            renewal["risk_level"] = "high"
        elif annual_value >= 1000:
            renewal["risk_level"] = "medium"
        else:
            renewal["risk_level"] = "low"
        renewal["annual_value"] = annual_value

    return renewals


@frappe.whitelist()
def get_trend_data(months=12):
    """
    Get historical trend data for charts
    Returns monthly data for:
    - Renewal rate
    - New customers vs renewals
    - Revenue trends
    """
    months = cint(months) or 12
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
    results = []
    for month in month_data:
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

        # Total orders for the month
        total_orders = frappe.db.count("Sales Order", {
            "docstatus": 1,
            "transaction_date": ["between", [month["month_start"], month["month_end"]]]
        })

        # Calculate renewal rate
        renewal_rate = 0
        if total_orders > 0:
            renewal_rate = round((renewal_count / total_orders) * 100, 1)

        # Get revenue
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

    return results


@frappe.whitelist()
def get_calendar_view_data(year=None, month=None):
    """
    Get renewal data organized for calendar display
    Returns renewals grouped by day with summary stats
    """
    today = getdate(nowdate())
    if not year:
        year = today.year
    if not month:
        month = today.month

    year = cint(year)
    month = cint(month)

    # Get first and last day of the month
    first_day = datetime(year, month, 1).date()
    if month == 12:
        last_day = datetime(year + 1, 1, 1).date() - timedelta(days=1)
    else:
        last_day = datetime(year, month + 1, 1).date() - timedelta(days=1)

    # Get all renewals for the month
    renewals = frappe.db.sql("""
        SELECT
            sub.name as subscription_id,
            sub.party as customer_id,
            c.customer_name,
            sub.end_date as renewal_date,
            sub.status,
            (
                SELECT SUM(so.grand_total)
                FROM `tabSales Order` so
                WHERE so.customer = sub.party
                AND so.docstatus = 1
                AND so.transaction_date >= DATE_SUB(sub.end_date, INTERVAL 1 YEAR)
            ) as annual_value
        FROM `tabSubscription` sub
        JOIN `tabCustomer` c ON c.name = sub.party
        WHERE sub.party_type = 'Customer'
        AND sub.status IN ('Active', 'Past Due Date', 'Unpaid')
        AND sub.end_date BETWEEN %(start)s AND %(end)s
        ORDER BY sub.end_date ASC, annual_value DESC
    """, {"start": str(first_day), "end": str(last_day)}, as_dict=True)

    # Group by date
    by_date = {}
    for renewal in renewals:
        date_str = str(renewal.get("renewal_date"))
        annual_value = flt(renewal.get("annual_value", 0))

        # Assign risk level
        if annual_value >= 5000:
            renewal["risk_level"] = "high"
        elif annual_value >= 1000:
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


@frappe.whitelist()
def get_product_retention_analysis():
    """
    Analyze retention rates by product category
    """
    products = frappe.db.sql("""
        SELECT
            so.custom_product as product,
            COUNT(DISTINCT so.customer) as unique_customers,
            COUNT(*) as total_orders,
            SUM(so.grand_total) as total_revenue,
            SUM(CASE WHEN so.custom_order_type IN ('Renewal', 'Extension Private', 'Extension Business') THEN 1 ELSE 0 END) as renewal_orders,
            SUM(CASE WHEN so.custom_order_type IN ('New Order Private', 'New Order Business') THEN 1 ELSE 0 END) as new_orders,
            AVG(so.custom_trend_micro_seats) as avg_seats
        FROM `tabSales Order` so
        WHERE so.docstatus = 1
        AND so.custom_product IS NOT NULL
        AND so.custom_product != ''
        GROUP BY so.custom_product
        ORDER BY total_revenue DESC
    """, as_dict=True)

    # Calculate retention rate per product
    for product in products:
        total = product.get("total_orders", 0)
        renewals = product.get("renewal_orders", 0)
        product["retention_rate"] = (renewals / total * 100) if total > 0 else 0
        product["total_revenue"] = flt(product.get("total_revenue", 0), 2)
        product["avg_seats"] = flt(product.get("avg_seats", 0), 1)

    return products


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
    # This month's at-risk (using 60 days ago from current month start vs 60 days from last month start)
    at_risk_current = get_at_risk_customers_count()
    # For last month, we approximate by checking customers that were at risk then
    # We'll use the same logic but shifted by one month
    comparisons["at_risk"] = {
        "change": 0,
        "direction": "neutral",
        "label": "vs last month"
    }  # We can't accurately calculate historical at-risk, so neutral

    # 3. Renewal revenue comparison (renewals this month vs last month)
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
    # Current month renewal rate
    total_orders_current = frappe.db.count("Sales Order", {
        "docstatus": 1,
        "transaction_date": ["between", [str(current_month_start), str(current_month_end)]]
    })
    renewal_orders_current = frappe.db.count("Sales Order", {
        "docstatus": 1,
        "custom_order_type": ["in", ["Renewal", "Extension Private", "Extension Business"]],
        "transaction_date": ["between", [str(current_month_start), str(current_month_end)]]
    })
    rate_current = (renewal_orders_current / total_orders_current * 100) if total_orders_current > 0 else 0

    # Last month renewal rate
    total_orders_last = frappe.db.count("Sales Order", {
        "docstatus": 1,
        "transaction_date": ["between", [str(last_month_start), str(last_month_end)]]
    })
    renewal_orders_last = frappe.db.count("Sales Order", {
        "docstatus": 1,
        "custom_order_type": ["in", ["Renewal", "Extension Private", "Extension Business"]],
        "transaction_date": ["between", [str(last_month_start), str(last_month_end)]]
    })
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
    year_ago = add_days(today, -365)

    # Renewal rate: renewals / (renewals + churned)
    total_renewal_orders = frappe.db.count("Sales Order", {
        "docstatus": 1,
        "custom_order_type": ["in", ["Renewal", "Extension Private", "Extension Business"]],
        "transaction_date": [">=", year_ago]
    })

    total_customers_with_orders = frappe.db.sql("""
        SELECT COUNT(DISTINCT customer)
        FROM `tabSales Order`
        WHERE docstatus = 1
        AND transaction_date >= %(year_ago)s
    """, {"year_ago": year_ago})[0][0] or 1

    # Renewals this month
    renewals_this_month = frappe.db.count("Sales Order", {
        "docstatus": 1,
        "custom_order_type": ["in", ["Renewal", "Extension Private", "Extension Business"]],
        "transaction_date": [">=", month_start]
    })

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
    ninety_days_ago = add_days(today, -90)

    # Customers with no orders in 90 days
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


def get_upcoming_renewal_revenue(days=90):
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
    # Simple heuristic: customers with fewer seats than average could upgrade
    # Plus customers on lower-tier products could upgrade

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
    price_per_seat = 50  # Estimated price per seat
    total_upsell = sum(
        (avg_seats - c.get("current_seats", 0)) * price_per_seat
        for c in below_avg_customers
    )

    return flt(total_upsell, 2)


def calculate_renewal_status(renewal_date, last_order_date, today):
    """Determine renewal status for a customer"""
    if renewal_date:
        renewal_date = getdate(renewal_date)
        if renewal_date < today:
            return "overdue"
        elif renewal_date <= add_days(today, 30):
            return "due_soon"
        else:
            return "active"
    elif last_order_date:
        last_order_date = getdate(last_order_date)
        days_since = (today - last_order_date).days
        if days_since > 365:
            return "overdue"
        elif days_since > 270:
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

    # Revenue at risk (0-40 points)
    # $10,000+ = 40 points, scales down proportionally
    if lifetime_value >= 10000:
        score += 40
    elif lifetime_value >= 5000:
        score += 30
    elif lifetime_value >= 2000:
        score += 20
    elif lifetime_value >= 500:
        score += 10
    else:
        score += 5

    # Urgency (0-35 points)
    if renewal_status == "overdue":
        # Overdue: more days overdue = higher priority
        days_overdue = abs(days_until) if days_until and days_until < 0 else 0
        if days_overdue >= 30:
            score += 35
        elif days_overdue >= 14:
            score += 30
        elif days_overdue >= 7:
            score += 25
        else:
            score += 20
    elif renewal_status == "due_soon":
        # Due soon: fewer days = higher priority
        days_left = days_until if days_until and days_until > 0 else 30
        if days_left <= 7:
            score += 18
        elif days_left <= 14:
            score += 12
        elif days_left <= 21:
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

    # Engagement/loyalty (0-10 points)
    # More orders = more valuable relationship to preserve
    if total_orders >= 10:
        score += 10
    elif total_orders >= 5:
        score += 7
    elif total_orders >= 2:
        score += 4
    else:
        score += 1

    return min(score, 100)  # Cap at 100


def get_priority_label(score):
    """Convert priority score to human-readable label"""
    if score >= 75:
        return "critical"
    elif score >= 50:
        return "high"
    elif score >= 25:
        return "medium"
    else:
        return "low"


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
                "potential_value": (10 - order.get("seats", 0)) * 50
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
