"""
Demo Data Generator for Retention Dashboard

Generates realistic demo data for:
- Sales Orders (renewals, new orders)
- Subscriptions (active, overdue, due soon)
- Customers with varied profiles
- Historical data for trends & analytics

Usage:
    bench execute support_center.utils.generate_demo_data.generate_all_demo_data

To clear demo data:
    bench execute support_center.utils.generate_demo_data.clear_demo_data
"""

import frappe
from frappe.utils import nowdate, add_days, add_months, getdate, flt
from datetime import datetime, timedelta
import random


# Demo data configuration
NUM_CUSTOMERS = 50
MONTHS_HISTORY = 12
ORDER_TYPES = [
    "Renewal",
    "Extension Private",
    "Extension Business",
    "New Order Private",
    "New Order Business"
]
PRODUCTS = [
    "ERP Premium",
    "ERP Standard",
    "Helpdesk Pro",
    "Support Package",
    "Custom Module"
]
CUSTOMER_GROUPS = ["Individual", "Commercial", "Non Profit", "Government"]
TERRITORIES = ["Kenya", "Rest Of The World"]


def generate_all_demo_data():
    """Generate complete demo dataset"""
    print("\n" + "="*70)
    print("GENERATING RETENTION DASHBOARD DEMO DATA")
    print("="*70 + "\n")

    frappe.flags.in_test = True  # Skip some validations

    try:
        # Step 1: Generate customers
        print("📊 Step 1/4: Generating customers...")
        customers = generate_demo_customers(NUM_CUSTOMERS)
        print(f"✓ Created {len(customers)} demo customers\n")

        # Step 2: Generate subscriptions
        print("📊 Step 2/4: Generating subscriptions...")
        subscriptions = generate_demo_subscriptions(customers)
        print(f"✓ Created {len(subscriptions)} demo subscriptions\n")

        # Step 3: Generate historical sales orders
        print("📊 Step 3/4: Generating historical sales orders...")
        orders = generate_demo_sales_orders(customers, MONTHS_HISTORY)
        print(f"✓ Created {len(orders)} demo sales orders\n")

        # Step 4: Add contact history
        print("📊 Step 4/4: Adding contact history...")
        contacts = generate_demo_contacts(customers)
        print(f"✓ Created {len(contacts)} demo contact records\n")

        frappe.db.commit()

        print("="*70)
        print("✅ DEMO DATA GENERATION COMPLETE!")
        print("="*70)
        print(f"\nGenerated:")
        print(f"  - {len(customers)} Customers")
        print(f"  - {len(subscriptions)} Subscriptions")
        print(f"  - {len(orders)} Sales Orders")
        print(f"  - {len(contacts)} Contact Records")
        print(f"\nRefresh your retention dashboard to see the data!\n")

        return {
            "customers": len(customers),
            "subscriptions": len(subscriptions),
            "orders": len(orders),
            "contacts": len(contacts)
        }

    except Exception as e:
        frappe.db.rollback()
        print(f"\n❌ Error generating demo data: {str(e)}")
        frappe.log_error(title="Demo Data Generation Error", message=frappe.get_traceback())
        raise
    finally:
        frappe.flags.in_test = False


def generate_demo_customers(count):
    """Generate demo customers"""
    customers = []

    for i in range(1, count + 1):
        customer_name = f"Demo Customer {i:03d}"

        # Check if already exists
        if frappe.db.exists("Customer", {"customer_name": customer_name}):
            customers.append(customer_name)
            continue

        customer = frappe.get_doc({
            "doctype": "Customer",
            "customer_name": customer_name,
            "customer_type": "Company",
            "customer_group": random.choice(CUSTOMER_GROUPS),
            "territory": random.choice(TERRITORIES),
            "email_id": f"demo{i:03d}@democompany.com",
            "mobile_no": f"+1-555-{random.randint(1000, 9999)}",
            "disabled": 0
        })

        customer.insert(ignore_permissions=True)
        customers.append(customer.name)

        if i % 10 == 0:
            print(f"  Created {i}/{count} customers...")

    return customers


def generate_demo_subscriptions(customers):
    """Generate subscriptions with varied statuses and dates"""
    subscriptions = []
    today = getdate(nowdate())

    for customer in customers:
        # 70% of customers have active subscriptions
        if random.random() > 0.3:

            # Determine subscription status and dates
            status_choice = random.random()

            if status_choice < 0.15:  # 15% overdue
                status = "Past Due Date"
                # End date 1-30 days ago
                end_date = add_days(today, -random.randint(1, 30))
            elif status_choice < 0.35:  # 20% due soon
                status = "Active"
                # End date in next 15-60 days
                end_date = add_days(today, random.randint(15, 60))
            else:  # 65% active with later dates
                status = "Active"
                # End date in 61-365 days
                end_date = add_days(today, random.randint(61, 365))

            # Start date is 1 year before end date
            start_date = add_days(end_date, -365)

            subscription = frappe.get_doc({
                "doctype": "Subscription",
                "party_type": "Customer",
                "party": customer,
                "start_date": start_date,
                "end_date": end_date,
                "status": status,
                "subscription_plan": random.choice(PRODUCTS)
            })

            subscription.insert(ignore_permissions=True)
            subscriptions.append(subscription.name)

    return subscriptions


def generate_demo_sales_orders(customers, months):
    """Generate historical sales orders across multiple months"""
    orders = []
    today = getdate(nowdate())

    # Generate orders for each customer over the past N months
    for customer in customers:
        # Determine how many orders this customer has (1-8 orders)
        num_orders = random.randint(1, 8)

        for order_num in range(num_orders):
            # Random date within the past N months
            days_ago = random.randint(0, months * 30)
            transaction_date = add_days(today, -days_ago)

            # Determine order type (60% renewals, 40% new)
            if random.random() < 0.6:
                order_type = random.choice(["Renewal", "Extension Private", "Extension Business"])
            else:
                order_type = random.choice(["New Order Private", "New Order Business"])

            # Generate realistic revenue amounts
            if "Business" in order_type or "Premium" in order_type:
                base_amount = random.uniform(5000, 15000)
            else:
                base_amount = random.uniform(1000, 5000)

            # Add some variation
            grand_total = flt(base_amount * random.uniform(0.8, 1.2), 2)

            order = frappe.get_doc({
                "doctype": "Sales Order",
                "customer": customer,
                "transaction_date": transaction_date,
                "delivery_date": add_days(transaction_date, 7),
                "custom_order_type": order_type,
                "custom_product": random.choice(PRODUCTS),
                "currency": "USD",
                "grand_total": grand_total,
                "docstatus": 1  # Submitted
            })

            order.insert(ignore_permissions=True)

            # Submit the order
            order.docstatus = 1
            order.db_update()

            orders.append(order.name)

    return orders


def generate_demo_contacts(customers):
    """Generate contact history for retention tracking"""
    contacts = []
    today = getdate(nowdate())

    # 40% of customers have been contacted
    contacted_customers = random.sample(customers, int(len(customers) * 0.4))

    contact_types = ["call", "email", "meeting"]

    for customer in contacted_customers:
        # 1-3 contacts per customer
        num_contacts = random.randint(1, 3)

        for _ in range(num_contacts):
            days_ago = random.randint(1, 90)
            contact_date = add_days(today, -days_ago)
            contact_type = random.choice(contact_types)

            notes = [
                "Discussed renewal options and pricing",
                "Follow-up on contract renewal",
                "Checked in on satisfaction with service",
                "Reviewed upsell opportunities",
                "Addressed support concerns"
            ]

            comment = frappe.get_doc({
                "doctype": "Comment",
                "comment_type": "Info",
                "reference_doctype": "Customer",
                "reference_name": customer,
                "content": f"**Retention Outreach - {contact_type.title()}**\n\n{random.choice(notes)}\n\n_Logged by Administrator via Retention Dashboard_",
                "comment_email": "Administrator",
                "comment_by": "Administrator"
            })

            comment.insert(ignore_permissions=True)

            # Backdate the creation
            frappe.db.sql("""
                UPDATE `tabComment`
                SET creation = %s, modified = %s
                WHERE name = %s
            """, (contact_date, contact_date, comment.name))

            contacts.append(comment.name)

    return contacts


def clear_demo_data():
    """Remove all demo data (CAREFUL!)"""
    print("\n" + "="*70)
    print("⚠️  CLEARING DEMO DATA")
    print("="*70 + "\n")

    response = input("Are you sure you want to delete all demo data? (yes/no): ")

    if response.lower() != "yes":
        print("Cancelled.")
        return

    try:
        # Delete in reverse order (orders -> subscriptions -> customers)

        print("Deleting demo sales orders...")
        frappe.db.sql("""
            DELETE FROM `tabSales Order`
            WHERE customer LIKE 'Demo Customer%'
        """)

        print("Deleting demo subscriptions...")
        frappe.db.sql("""
            DELETE FROM `tabSubscription`
            WHERE party LIKE 'Demo Customer%'
        """)

        print("Deleting demo contact records...")
        frappe.db.sql("""
            DELETE FROM `tabComment`
            WHERE reference_name LIKE 'Demo Customer%'
        """)

        print("Deleting demo customers...")
        frappe.db.sql("""
            DELETE FROM `tabCustomer`
            WHERE customer_name LIKE 'Demo Customer%'
        """)

        frappe.db.commit()

        print("\n✅ Demo data cleared successfully!\n")

    except Exception as e:
        frappe.db.rollback()
        print(f"\n❌ Error clearing demo data: {str(e)}")
        frappe.log_error(title="Demo Data Clearing Error", message=frappe.get_traceback())
        raise


def get_demo_data_stats():
    """Get statistics about current demo data"""
    stats = {
        "customers": frappe.db.count("Customer", {"customer_name": ["like", "Demo Customer%"]}),
        "subscriptions": frappe.db.count("Subscription", {"party": ["like", "Demo Customer%"]}),
        "sales_orders": frappe.db.sql("""
            SELECT COUNT(*) as count
            FROM `tabSales Order`
            WHERE customer LIKE 'Demo Customer%'
        """, as_dict=True)[0].count,
        "contacts": frappe.db.sql("""
            SELECT COUNT(*) as count
            FROM `tabComment`
            WHERE reference_name LIKE 'Demo Customer%'
        """, as_dict=True)[0].count
    }

    print("\n" + "="*70)
    print("DEMO DATA STATISTICS")
    print("="*70)
    print(f"Customers:      {stats['customers']}")
    print(f"Subscriptions:  {stats['subscriptions']}")
    print(f"Sales Orders:   {stats['sales_orders']}")
    print(f"Contact Records: {stats['contacts']}")
    print("="*70 + "\n")

    return stats
