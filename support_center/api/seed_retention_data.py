"""
Data Seeding Script for Retention Dashboard
Run with: bench execute support_center.api.seed_retention_data.seed_all_data
"""

import frappe
from frappe.utils import nowdate, add_days, add_months, getdate
from datetime import datetime, timedelta
import random


# Sample data configurations
CUSTOMER_DATA = [
    {"name": "CUST-001", "customer_name": "Acme Corporation", "email_id": "contact@acme.com", "mobile_no": "+1-555-0101", "customer_group": "Enterprise", "territory": "United States"},
    {"name": "CUST-002", "customer_name": "TechStart Inc", "email_id": "info@techstart.io", "mobile_no": "+1-555-0102", "customer_group": "SMB", "territory": "United States"},
    {"name": "CUST-003", "customer_name": "Global Solutions Ltd", "email_id": "sales@globalsolutions.co.uk", "mobile_no": "+44-20-7123-4567", "customer_group": "Enterprise", "territory": "United Kingdom"},
    {"name": "CUST-004", "customer_name": "DataFlow Systems", "email_id": "support@dataflow.de", "mobile_no": "+49-30-12345678", "customer_group": "Enterprise", "territory": "Germany"},
    {"name": "CUST-005", "customer_name": "CloudNine Software", "email_id": "hello@cloudnine.io", "mobile_no": "+1-555-0105", "customer_group": "SMB", "territory": "United States"},
    {"name": "CUST-006", "customer_name": "SecureNet Partners", "email_id": "info@securenet.com", "mobile_no": "+1-555-0106", "customer_group": "Enterprise", "territory": "United States"},
    {"name": "CUST-007", "customer_name": "Innovation Labs", "email_id": "contact@innovationlabs.fr", "mobile_no": "+33-1-23456789", "customer_group": "SMB", "territory": "France"},
    {"name": "CUST-008", "customer_name": "Digital Ventures", "email_id": "team@digitalventures.ca", "mobile_no": "+1-416-555-0108", "customer_group": "SMB", "territory": "Canada"},
    {"name": "CUST-009", "customer_name": "Enterprise One Corp", "email_id": "admin@enterprise1.com", "mobile_no": "+1-555-0109", "customer_group": "Enterprise", "territory": "United States"},
    {"name": "CUST-010", "customer_name": "SmartTech Solutions", "email_id": "sales@smarttech.au", "mobile_no": "+61-2-9876-5432", "customer_group": "SMB", "territory": "Australia"},
    {"name": "CUST-011", "customer_name": "Nexus Industries", "email_id": "info@nexusind.com", "mobile_no": "+1-555-0111", "customer_group": "Enterprise", "territory": "United States"},
    {"name": "CUST-012", "customer_name": "Pinnacle Consulting", "email_id": "hello@pinnacle.co", "mobile_no": "+1-555-0112", "customer_group": "SMB", "territory": "United States"},
    {"name": "CUST-013", "customer_name": "Atlas Software GmbH", "email_id": "contact@atlas-soft.de", "mobile_no": "+49-89-12345678", "customer_group": "Enterprise", "territory": "Germany"},
    {"name": "CUST-014", "customer_name": "Horizon Tech", "email_id": "support@horizontech.jp", "mobile_no": "+81-3-1234-5678", "customer_group": "SMB", "territory": "Japan"},
    {"name": "CUST-015", "customer_name": "Vertex Systems", "email_id": "info@vertexsys.com", "mobile_no": "+1-555-0115", "customer_group": "Enterprise", "territory": "United States"},
    {"name": "CUST-016", "customer_name": "BlueSky Enterprises", "email_id": "contact@bluesky.io", "mobile_no": "+1-555-0116", "customer_group": "SMB", "territory": "United States"},
    {"name": "CUST-017", "customer_name": "Omega Corp", "email_id": "admin@omegacorp.com", "mobile_no": "+1-555-0117", "customer_group": "Enterprise", "territory": "United States"},
    {"name": "CUST-018", "customer_name": "Swift Technologies", "email_id": "hello@swifttech.in", "mobile_no": "+91-22-12345678", "customer_group": "SMB", "territory": "India"},
    {"name": "CUST-019", "customer_name": "Prime Security Ltd", "email_id": "info@primesec.co.uk", "mobile_no": "+44-121-234-5678", "customer_group": "Enterprise", "territory": "United Kingdom"},
    {"name": "CUST-020", "customer_name": "Quantum Dynamics", "email_id": "sales@quantumdyn.com", "mobile_no": "+1-555-0120", "customer_group": "Enterprise", "territory": "United States"},
]

PRODUCTS = ["Trend Micro", "Kaspersky", "Bitdefender", "Norton", "McAfee"]

ORDER_TYPES = {
    "new": ["New Order Private", "New Order Business"],
    "renewal": ["Renewal", "Extension Private", "Extension Business"]
}


def seed_customers():
    """Create sample customers"""
    print("Seeding customers...")
    created = 0

    for customer_data in CUSTOMER_DATA:
        if frappe.db.exists("Customer", customer_data["name"]):
            print(f"  Customer {customer_data['name']} already exists, skipping...")
            continue

        customer = frappe.new_doc("Customer")
        customer.name = customer_data["name"]
        customer.customer_name = customer_data["customer_name"]
        customer.email_id = customer_data["email_id"]
        customer.mobile_no = customer_data["mobile_no"]
        customer.customer_group = customer_data.get("customer_group", "Commercial")
        customer.territory = customer_data.get("territory", "All Territories")
        customer.disabled = 0

        try:
            customer.insert(ignore_permissions=True)
            created += 1
            print(f"  Created customer: {customer_data['customer_name']}")
        except Exception as e:
            print(f"  Error creating {customer_data['name']}: {str(e)}")

    frappe.db.commit()
    print(f"Created {created} customers")
    return created


def seed_sales_orders():
    """Create sample sales orders with realistic distribution over 12 months"""
    print("Seeding sales orders...")
    created = 0
    today = getdate(nowdate())

    for customer_data in CUSTOMER_DATA:
        customer_id = customer_data["name"]

        if not frappe.db.exists("Customer", customer_id):
            print(f"  Customer {customer_id} not found, skipping orders...")
            continue

        # Determine customer behavior pattern
        is_enterprise = customer_data.get("customer_group") == "Enterprise"

        # Enterprise customers: more orders, higher values
        # SMB: fewer orders, lower values
        if is_enterprise:
            num_orders = random.randint(4, 8)
            base_value = random.uniform(3000, 8000)
            base_seats = random.randint(20, 100)
        else:
            num_orders = random.randint(2, 5)
            base_value = random.uniform(500, 2500)
            base_seats = random.randint(5, 25)

        # Generate orders spread across the past 12-18 months
        order_months = sorted(random.sample(range(1, 18), min(num_orders, 17)))

        previous_order = None
        for i, months_ago in enumerate(order_months):
            order_date = add_months(today, -months_ago)

            # First order is always "New", subsequent can be renewals
            if i == 0:
                order_type = random.choice(ORDER_TYPES["new"])
            else:
                # 70% chance of renewal, 30% chance of new product
                order_type = random.choice(ORDER_TYPES["renewal"]) if random.random() < 0.7 else random.choice(ORDER_TYPES["new"])

            # Vary the value slightly
            value_variance = random.uniform(0.8, 1.2)
            grand_total = round(base_value * value_variance, 2)

            # Vary seats
            seats = base_seats + random.randint(-5, 10)

            # Random product
            product = random.choice(PRODUCTS)

            order_name = f"SAL-ORD-TEST-{customer_id[-3:]}-{i+1:03d}"

            if frappe.db.exists("Sales Order", order_name):
                print(f"  Order {order_name} already exists, skipping...")
                previous_order = order_name
                continue

            try:
                sales_order = frappe.new_doc("Sales Order")
                sales_order.name = order_name
                sales_order.customer = customer_id
                sales_order.transaction_date = order_date
                sales_order.delivery_date = add_days(order_date, 7)
                sales_order.grand_total = grand_total
                sales_order.net_total = grand_total
                sales_order.total = grand_total
                sales_order.base_grand_total = grand_total
                sales_order.base_net_total = grand_total
                sales_order.base_total = grand_total
                sales_order.custom_order_type = order_type
                sales_order.custom_product = product
                sales_order.custom_trend_micro_seats = seats
                sales_order.custom_previous_order = previous_order
                sales_order.docstatus = 1  # Submitted
                sales_order.status = "Completed"
                sales_order.company = frappe.defaults.get_user_default("company") or "Test Company"
                sales_order.currency = "USD"
                sales_order.conversion_rate = 1

                # Add a dummy item
                sales_order.append("items", {
                    "item_code": product,
                    "item_name": f"{product} License",
                    "description": f"{product} Security License - {seats} seats",
                    "qty": seats,
                    "rate": round(grand_total / seats, 2),
                    "amount": grand_total,
                    "delivery_date": add_days(order_date, 7),
                    "uom": "Nos",
                    "stock_uom": "Nos",
                    "conversion_factor": 1
                })

                sales_order.flags.ignore_validate = True
                sales_order.flags.ignore_permissions = True
                sales_order.flags.ignore_links = True
                sales_order.flags.ignore_mandatory = True
                sales_order.insert(ignore_permissions=True)

                # Submit the order
                sales_order.db_set("docstatus", 1, update_modified=False)

                previous_order = order_name
                created += 1
                print(f"  Created order: {order_name} for {customer_data['customer_name']} - ${grand_total}")
            except Exception as e:
                print(f"  Error creating order {order_name}: {str(e)}")

    frappe.db.commit()
    print(f"Created {created} sales orders")
    return created


def seed_subscriptions():
    """Create subscriptions with various statuses and end dates"""
    print("Seeding subscriptions...")
    created = 0
    today = getdate(nowdate())

    # Define subscription scenarios for testing
    subscription_scenarios = [
        # Overdue subscriptions (end date in the past)
        {"customer_idx": 0, "days_offset": -15, "status": "Past Due Date"},  # 15 days overdue - high value
        {"customer_idx": 1, "days_offset": -7, "status": "Past Due Date"},   # 7 days overdue
        {"customer_idx": 5, "days_offset": -30, "status": "Past Due Date"},  # 30 days overdue - high value
        {"customer_idx": 10, "days_offset": -3, "status": "Past Due Date"},  # 3 days overdue

        # Due soon (within 30 days)
        {"customer_idx": 2, "days_offset": 5, "status": "Active"},   # Due in 5 days - high value
        {"customer_idx": 3, "days_offset": 10, "status": "Active"},  # Due in 10 days - high value
        {"customer_idx": 6, "days_offset": 15, "status": "Active"},  # Due in 15 days
        {"customer_idx": 7, "days_offset": 20, "status": "Active"},  # Due in 20 days
        {"customer_idx": 11, "days_offset": 25, "status": "Active"}, # Due in 25 days
        {"customer_idx": 12, "days_offset": 28, "status": "Active"}, # Due in 28 days - high value

        # Active but further out (31-90 days)
        {"customer_idx": 4, "days_offset": 45, "status": "Active"},
        {"customer_idx": 8, "days_offset": 60, "status": "Active"},
        {"customer_idx": 9, "days_offset": 75, "status": "Active"},
        {"customer_idx": 13, "days_offset": 35, "status": "Active"},
        {"customer_idx": 14, "days_offset": 50, "status": "Active"},
        {"customer_idx": 15, "days_offset": 65, "status": "Active"},

        # Unpaid subscriptions
        {"customer_idx": 16, "days_offset": 12, "status": "Unpaid"},
        {"customer_idx": 17, "days_offset": -5, "status": "Unpaid"},

        # More active subscriptions
        {"customer_idx": 18, "days_offset": 80, "status": "Active"},
        {"customer_idx": 19, "days_offset": 90, "status": "Active"},
    ]

    for scenario in subscription_scenarios:
        idx = scenario["customer_idx"]
        if idx >= len(CUSTOMER_DATA):
            continue

        customer_data = CUSTOMER_DATA[idx]
        customer_id = customer_data["name"]

        if not frappe.db.exists("Customer", customer_id):
            print(f"  Customer {customer_id} not found, skipping subscription...")
            continue

        end_date = add_days(today, scenario["days_offset"])
        start_date = add_days(end_date, -365)  # 1 year subscription

        sub_name = f"SUB-TEST-{customer_id[-3:]}"

        if frappe.db.exists("Subscription", sub_name):
            print(f"  Subscription {sub_name} already exists, skipping...")
            continue

        try:
            subscription = frappe.new_doc("Subscription")
            subscription.name = sub_name
            subscription.party_type = "Customer"
            subscription.party = customer_id
            subscription.start_date = start_date
            subscription.end_date = end_date
            subscription.status = scenario["status"]
            subscription.current_invoice_start = start_date
            subscription.current_invoice_end = end_date

            subscription.flags.ignore_validate = True
            subscription.flags.ignore_permissions = True
            subscription.flags.ignore_links = True
            subscription.flags.ignore_mandatory = True
            subscription.insert(ignore_permissions=True)

            created += 1
            status_text = scenario["status"]
            if scenario["days_offset"] < 0:
                days_text = f"{abs(scenario['days_offset'])} days overdue"
            else:
                days_text = f"due in {scenario['days_offset']} days"
            print(f"  Created subscription: {sub_name} for {customer_data['customer_name']} - {status_text} ({days_text})")
        except Exception as e:
            print(f"  Error creating subscription {sub_name}: {str(e)}")

    frappe.db.commit()
    print(f"Created {created} subscriptions")
    return created


def clear_test_data():
    """Remove all test data (useful for re-seeding)"""
    print("Clearing existing test data...")

    # Delete test subscriptions
    frappe.db.sql("DELETE FROM `tabSubscription` WHERE name LIKE 'SUB-TEST-%'")
    print("  Cleared test subscriptions")

    # Delete test sales orders
    frappe.db.sql("DELETE FROM `tabSales Order Item` WHERE parent LIKE 'SAL-ORD-TEST-%'")
    frappe.db.sql("DELETE FROM `tabSales Order` WHERE name LIKE 'SAL-ORD-TEST-%'")
    print("  Cleared test sales orders")

    # Delete test customers
    for customer_data in CUSTOMER_DATA:
        if frappe.db.exists("Customer", customer_data["name"]):
            try:
                frappe.delete_doc("Customer", customer_data["name"], force=True, ignore_permissions=True)
            except Exception as e:
                print(f"  Could not delete {customer_data['name']}: {str(e)}")
    print("  Cleared test customers")

    frappe.db.commit()
    print("Test data cleared")


def seed_all_data(clear_existing=False):
    """
    Main function to seed all retention dashboard test data

    Usage:
        bench execute support_center.api.seed_retention_data.seed_all_data
        bench execute support_center.api.seed_retention_data.seed_all_data --kwargs "{'clear_existing': True}"
    """
    print("\n" + "="*60)
    print("RETENTION DASHBOARD DATA SEEDING")
    print("="*60 + "\n")

    if clear_existing:
        clear_test_data()
        print("")

    customers_created = seed_customers()
    print("")

    orders_created = seed_sales_orders()
    print("")

    subscriptions_created = seed_subscriptions()
    print("")

    print("="*60)
    print("SEEDING COMPLETE")
    print("="*60)
    print(f"  Customers created: {customers_created}")
    print(f"  Sales orders created: {orders_created}")
    print(f"  Subscriptions created: {subscriptions_created}")
    print("")
    print("You can now view the retention dashboard to see the test data.")
    print("="*60 + "\n")

    return {
        "customers": customers_created,
        "orders": orders_created,
        "subscriptions": subscriptions_created
    }


# Convenience function for API access
@frappe.whitelist()
def run_seed(clear_existing=False):
    """API endpoint to run seeding from the browser"""
    if not frappe.has_permission("Customer", "create"):
        frappe.throw("You don't have permission to create test data")

    return seed_all_data(clear_existing=clear_existing)
