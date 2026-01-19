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

    return {
        "total_customers": total_customers,
        "revenue_up_for_renewal": renewal_revenue,
        "clients_at_risk": at_risk_customers,
        "potential_upsell_value": upsell_potential,
        "renewal_rate": renewal_data.get("renewal_rate", 0),
        "avg_customer_lifetime_value": renewal_data.get("avg_ltv", 0),
        "total_renewals_this_month": renewal_data.get("renewals_this_month", 0)
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

        result.append(customer)

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

    return renewals


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
