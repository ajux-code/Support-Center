"""
Quick Demo Data Generator - Direct SQL Insert

Bypasses ERPNext validation for demo purposes.
Creates realistic data for Trends & Analytics.

Usage:
    bench --site localhost execute support_center.utils.quick_demo_data.generate_quick_demo

To clear:
    bench --site localhost execute support_center.utils.quick_demo_data.clear_quick_demo
"""

import frappe
from frappe.utils import nowdate, add_days, add_months, getdate, now
import random
import os


def is_production_environment():
    """
    Check if running in production environment
    Returns True if production, False if development/staging
    """
    # Check 1: Site name contains production indicators
    site = frappe.local.site
    production_indicators = ["production", "prod", "live", ".com", ".co", ".org"]

    # Allow localhost and development sites
    if site in ["localhost", "127.0.0.1", "dev.localhost", "staging.localhost"]:
        return False

    # Check for production indicators in site name
    for indicator in production_indicators:
        if indicator in site.lower():
            return True

    # Check 2: Environment variable
    env = os.environ.get("FRAPPE_ENV", "development")
    if env.lower() in ["production", "prod"]:
        return True

    # Check 3: Developer mode (production has this disabled)
    if not frappe.conf.get("developer_mode"):
        # If developer mode is off, assume production unless explicitly allowed
        return True

    return False


def generate_quick_demo():
    """Generate demo data with direct SQL inserts"""
    print("\n" + "="*70)
    print("QUICK DEMO DATA GENERATOR")
    print("="*70 + "\n")

    # SAFETY CHECK: Prevent running in production
    if is_production_environment():
        print("🚨 ERROR: PRODUCTION ENVIRONMENT DETECTED")
        print("="*70)
        print("Demo data generation is DISABLED in production for safety.")
        print(f"Current site: {frappe.local.site}")
        print(f"Developer mode: {frappe.conf.get('developer_mode', False)}")
        print("\nThis script only runs on:")
        print("  - localhost")
        print("  - dev.localhost")
        print("  - staging.localhost")
        print("  - Sites with developer_mode enabled")
        print("="*70 + "\n")
        frappe.throw("Demo data generation blocked in production environment")
        return False

    print(f"✓ Environment check passed: {frappe.local.site}")
    print(f"✓ Developer mode: {frappe.conf.get('developer_mode', False)}\n")

    try:
        # Get or create customers
        print("📊 Creating customers...")
        customers = ensure_customers(30)
        print(f"✓ {len(customers)} customers ready\n")

        # Generate orders with direct SQL
        print("📊 Generating sales orders (12 months of data)...")
        orders_created = generate_orders_sql(customers)
        print(f"✓ Created {orders_created} sales orders\n")

        frappe.db.commit()

        print("="*70)
        print("✅ COMPLETE!")
        print("="*70)
        print(f"\n💡 Refresh your retention dashboard now!\n")

        return True

    except Exception as e:
        frappe.db.rollback()
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def ensure_customers(count):
    """Ensure demo customers exist"""
    customers = []

    for i in range(1, count + 1):
        customer_name = f"Demo Customer {i:03d}"

        # Check if exists
        exists = frappe.db.exists("Customer", {"customer_name": customer_name})

        if not exists:
            # Insert directly
            frappe.db.sql("""
                INSERT INTO `tabCustomer` (
                    name, customer_name, customer_type, customer_group,
                    territory, docstatus, creation, modified, modified_by, owner
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                customer_name, customer_name, "Company", "Commercial",
                "Kenya", 0, now(), now(), "Administrator", "Administrator"
            ))

        customers.append(customer_name)

    return customers


def generate_orders_sql(customers):
    """Generate orders with direct SQL inserts"""
    today = getdate(nowdate())
    orders_created = 0

    order_types = [
        "Renewal",
        "Extension Private",
        "Extension Business",
        "New Order Private",
        "New Order Business"
    ]

    # Generate for past 12 months
    for month_ago in range(12):
        month_date = add_months(today, -month_ago)

        # 20-40 orders per month (more recent = more orders)
        num_orders = random.randint(20, 40) + (12 - month_ago) * 2

        for _ in range(num_orders):
            # Random day in month
            day_offset = random.randint(0, 28)
            order_date = add_days(month_date, -day_offset)

            # Random customer
            customer = random.choice(customers)

            # Random order type (weighted towards renewals)
            if random.random() < 0.6:
                order_type = random.choice(["Renewal", "Extension Private", "Extension Business"])
            else:
                order_type = random.choice(["New Order Private", "New Order Business"])

            # Revenue amount
            if "Business" in order_type:
                amount = random.uniform(5000, 12000)
            else:
                amount = random.uniform(1500, 5000)

            # Older orders had higher value (trend)
            amount *= (1.0 + month_ago * 0.03)

            # Generate unique name
            order_name = f"SO-DEMO-{orders_created + 1:06d}"

            # Insert order
            frappe.db.sql("""
                INSERT INTO `tabSales Order` (
                    name, customer, transaction_date, delivery_date,
                    custom_order_type, custom_product, currency,
                    grand_total, status, docstatus,
                    creation, modified, modified_by, owner, company
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                order_name, customer, order_date, add_days(order_date, 7),
                order_type, "Demo Product", "USD",
                round(amount, 2), "Completed", 1,
                order_date, order_date, "Administrator", "Administrator",
                frappe.defaults.get_user_default("Company") or "Demo Company"
            ))

            orders_created += 1

        if month_ago % 3 == 0:
            print(f"  Generated data for {month_date.strftime('%B %Y')}...")

    return orders_created


def clear_quick_demo():
    """Clear all demo data"""
    print("\n⚠️  Clearing demo data...")

    # SAFETY CHECK: Prevent running in production
    if is_production_environment():
        print("🚨 ERROR: PRODUCTION ENVIRONMENT DETECTED")
        print("Demo data clearing is DISABLED in production for safety.")
        frappe.throw("Demo data operations blocked in production environment")
        return False

    try:
        # Delete orders
        deleted_orders = frappe.db.sql("""
            DELETE FROM `tabSales Order`
            WHERE customer LIKE 'Demo Customer%'
        """)

        # Delete customers
        deleted_customers = frappe.db.sql("""
            DELETE FROM `tabCustomer`
            WHERE customer_name LIKE 'Demo Customer%'
        """)

        # Delete comments
        frappe.db.sql("""
            DELETE FROM `tabComment`
            WHERE reference_name LIKE 'Demo Customer%'
        """)

        frappe.db.commit()
        print(f"✅ Cleared demo data!\n")

    except Exception as e:
        frappe.db.rollback()
        print(f"❌ Error: {str(e)}")
