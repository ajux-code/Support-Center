"""
Quick Demo Data Generator for Retention Dashboard Trends

Focuses on generating Sales Orders to populate Trends & Analytics charts.
Skips complex subscriptions.

Usage:
    bench --site localhost execute support_center.utils.generate_demo_trends_data.generate_trends_data

To clear:
    bench --site localhost execute support_center.utils.generate_demo_trends_data.clear_trends_data
"""

import frappe
from frappe.utils import nowdate, add_days, add_months, getdate, flt
from datetime import datetime
import random


def generate_trends_data():
    """Generate sales orders across 12 months for trends"""
    print("\n" + "="*70)
    print("GENERATING TRENDS & ANALYTICS DEMO DATA")
    print("="*70 + "\n")

    frappe.set_user("Administrator")

    try:
        # Step 1: Ensure we have customers
        print("📊 Step 1/3: Checking customers...")
        customers = get_or_create_customers(30)
        print(f"✓ Using {len(customers)} customers\n")

        # Step 2: Generate historical orders
        print("📊 Step 2/3: Generating historical sales orders...")
        orders = generate_historical_orders(customers, months=12)
        print(f"✓ Created {len(orders)} sales orders\n")

        # Step 3: Add contact records
        print("📊 Step 3/3: Adding contact records...")
        contacts = add_contact_records(customers)
        print(f"✓ Created {len(contacts)} contact records\n")

        frappe.db.commit()

        print("="*70)
        print("✅ DEMO DATA GENERATION COMPLETE!")
        print("="*70)
        print(f"\nGenerated:")
        print(f"  - {len(customers)} Customers")
        print(f"  - {len(orders)} Sales Orders (12 months)")
        print(f"  - {len(contacts)} Contact Records")
        print(f"\n💡 Refresh your dashboard to see the trends!\n")

        return True

    except Exception as e:
        frappe.db.rollback()
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def get_or_create_customers(count):
    """Get existing demo customers or create new ones"""
    # Check existing
    existing = frappe.get_all("Customer",
                             filters={"customer_name": ["like", "Demo Customer%"]},
                             pluck="name")

    if len(existing) >= count:
        return existing[:count]

    # Create more if needed
    customers = list(existing)
    for i in range(len(existing) + 1, count + 1):
        customer_name = f"Demo Customer {i:03d}"

        customer = frappe.get_doc({
            "doctype": "Customer",
            "customer_name": customer_name,
            "customer_type": "Company",
            "customer_group": "Commercial",
            "territory": "Kenya",
            "email_id": f"demo{i:03d}@example.com"
        })

        customer.insert(ignore_permissions=True)
        customers.append(customer.name)

        if i % 10 == 0:
            print(f"  Created {i} customers...")

    return customers


def generate_historical_orders(customers, months=12):
    """Generate sales orders distributed across past N months"""
    orders = []
    today = getdate(nowdate())

    order_types = {
        "Renewal": 0.35,  # 35%
        "Extension Private": 0.15,  # 15%
        "Extension Business": 0.10,  # 10%
        "New Order Private": 0.25,  # 25%
        "New Order Business": 0.15   # 15%
    }

    # Generate trend: declining renewals, increasing new orders
    # This creates interesting chart patterns

    for month_ago in range(months):
        month_start = add_months(today, -month_ago)

        # Number of orders this month (more recent = more orders)
        orders_this_month = random.randint(15, 30) + (months - month_ago) * 2

        for _ in range(orders_this_month):
            # Random day in this month
            day_offset = random.randint(0, 28)
            order_date = add_days(month_start, -day_offset)

            # Select customer
            customer = random.choice(customers)

            # Select order type with weighted probabilities
            rand = random.random()
            cumulative = 0
            order_type = "Renewal"  # default
            for otype, prob in order_types.items():
                cumulative += prob
                if rand < cumulative:
                    order_type = otype
                    break

            # Revenue amount based on type
            if "Business" in order_type or "Extension" in order_type:
                amount = random.uniform(5000, 12000)
            else:
                amount = random.uniform(1500, 5000)

            # Add monthly variation (decline over time for realism)
            trend_factor = 1.0 + (month_ago * 0.05)  # Older orders were higher value
            amount *= trend_factor

            try:
                order = frappe.get_doc({
                    "doctype": "Sales Order",
                    "customer": customer,
                    "transaction_date": order_date,
                    "delivery_date": add_days(order_date, 7),
                    "custom_order_type": order_type,
                    "custom_product": random.choice(["ERP Premium", "Support Package", "Custom Module"]),
                    "currency": "USD",
                    "grand_total": flt(amount, 2),
                    "status": "Completed",
                    "docstatus": 1
                })

                order.insert(ignore_permissions=True)

                # Mark as submitted
                frappe.db.sql("""
                    UPDATE `tabSales Order`
                    SET docstatus = 1
                    WHERE name = %s
                """, order.name)

                orders.append(order.name)

            except Exception as e:
                print(f"  Warning: Could not create order: {str(e)}")
                continue

        print(f"  Generated {orders_this_month} orders for {month_start.strftime('%B %Y')}")

    return orders


def add_contact_records(customers):
    """Add contact history for some customers"""
    contacts = []

    # Contact 30% of customers
    num_to_contact = int(len(customers) * 0.3)
    contacted = random.sample(customers, num_to_contact)

    contact_types = ["call", "email", "meeting"]
    today = getdate(nowdate())

    for customer in contacted:
        # 1-2 contacts per customer
        for _ in range(random.randint(1, 2)):
            days_ago = random.randint(5, 60)
            contact_date = add_days(today, -days_ago)
            contact_type = random.choice(contact_types)

            comment = frappe.get_doc({
                "doctype": "Comment",
                "comment_type": "Info",
                "reference_doctype": "Customer",
                "reference_name": customer,
                "content": f"**Retention Outreach - {contact_type.title()}**\n\nDiscussed renewal options and satisfaction.\n\n_Logged via Retention Dashboard_",
                "comment_by": "Administrator"
            })

            comment.insert(ignore_permissions=True)

            # Backdate creation
            frappe.db.sql("""
                UPDATE `tabComment`
                SET creation = %s, modified = %s
                WHERE name = %s
            """, (contact_date, contact_date, comment.name))

            contacts.append(comment.name)

    return contacts


def clear_trends_data():
    """Clear demo data"""
    print("\n⚠️  Clearing demo trends data...")

    try:
        # Delete sales orders
        frappe.db.sql("""
            DELETE FROM `tabSales Order`
            WHERE customer LIKE 'Demo Customer%'
        """)

        # Delete comments
        frappe.db.sql("""
            DELETE FROM `tabComment`
            WHERE reference_name LIKE 'Demo Customer%'
        """)

        # Delete customers
        frappe.db.sql("""
            DELETE FROM `tabCustomer`
            WHERE customer_name LIKE 'Demo Customer%'
        """)

        frappe.db.commit()
        print("✅ Demo data cleared!\n")

    except Exception as e:
        frappe.db.rollback()
        print(f"❌ Error clearing data: {str(e)}")
