"""
Pre-Deployment Verification: Check for Demo Data

Verifies that no demo/test data exists before deploying to production.
Run this before every production deployment!

Usage:
    bench --site [site] execute support_center.utils.verify_no_demo_data.verify_clean_for_production

Exit codes:
    0 = Clean (safe to deploy)
    1 = Demo data found (DO NOT DEPLOY)
"""

import frappe
import sys


def verify_clean_for_production():
    """
    Verify no demo data exists
    Returns True if clean, False if demo data found
    """
    print("\n" + "="*70)
    print("PRE-DEPLOYMENT VERIFICATION: CHECKING FOR DEMO DATA")
    print("="*70 + "\n")

    issues_found = []
    warnings = []

    # Check 1: Demo Customers
    print("🔍 Checking for demo customers...")
    demo_customers = frappe.db.sql("""
        SELECT COUNT(*) as count
        FROM `tabCustomer`
        WHERE customer_name LIKE 'Demo Customer%'
        OR customer_name LIKE '%Demo%'
        OR customer_name LIKE '%Test%'
        OR email_id LIKE '%demo%'
        OR email_id LIKE '%test%'
        OR email_id LIKE '%@example.com'
    """, as_dict=True)[0].count

    if demo_customers > 0:
        issues_found.append(f"❌ Found {demo_customers} demo/test customers")
        print(f"   ❌ FAIL: {demo_customers} demo/test customers found")
    else:
        print("   ✅ PASS: No demo customers")

    # Check 2: Demo Sales Orders
    print("\n🔍 Checking for demo sales orders...")
    demo_orders = frappe.db.sql("""
        SELECT COUNT(*) as count
        FROM `tabSales Order`
        WHERE customer LIKE 'Demo Customer%'
        OR name LIKE 'SO-DEMO-%'
    """, as_dict=True)[0].count

    if demo_orders > 0:
        issues_found.append(f"❌ Found {demo_orders} demo sales orders")
        print(f"   ❌ FAIL: {demo_orders} demo sales orders found")
    else:
        print("   ✅ PASS: No demo sales orders")

    # Check 3: Demo Comments
    print("\n🔍 Checking for demo comments...")
    demo_comments = frappe.db.sql("""
        SELECT COUNT(*) as count
        FROM `tabComment`
        WHERE reference_name LIKE 'Demo Customer%'
        OR content LIKE '%demo%'
    """, as_dict=True)[0].count

    if demo_comments > 0:
        warnings.append(f"⚠️  Found {demo_comments} comments with 'demo' reference")
        print(f"   ⚠️  WARNING: {demo_comments} demo-related comments")
    else:
        print("   ✅ PASS: No demo comments")

    # Check 4: Developer Mode Status
    print("\n🔍 Checking developer mode status...")
    dev_mode = frappe.conf.get('developer_mode', False)
    if dev_mode:
        warnings.append("⚠️  Developer mode is ENABLED (should be disabled in production)")
        print("   ⚠️  WARNING: Developer mode is enabled")
    else:
        print("   ✅ PASS: Developer mode is disabled")

    # Check 5: Site Name
    print("\n🔍 Checking site name...")
    site = frappe.local.site
    risky_names = ["localhost", "dev", "test", "staging"]
    if any(name in site.lower() for name in risky_names):
        warnings.append(f"⚠️  Site name '{site}' suggests non-production environment")
        print(f"   ⚠️  WARNING: Site name is '{site}'")
    else:
        print(f"   ✅ PASS: Site name is '{site}'")

    # Results Summary
    print("\n" + "="*70)
    print("VERIFICATION RESULTS")
    print("="*70 + "\n")

    if issues_found:
        print("🚨 CRITICAL ISSUES FOUND - DO NOT DEPLOY!")
        print("-" * 70)
        for issue in issues_found:
            print(issue)
        print("\n💡 To clean demo data, run:")
        print("   bench --site [site] execute support_center.utils.quick_demo_data.clear_quick_demo")
        print("\n" + "="*70 + "\n")
        return False

    if warnings:
        print("⚠️  WARNINGS (Review before deploying)")
        print("-" * 70)
        for warning in warnings:
            print(warning)
        print()

    if not issues_found:
        print("✅ VERIFICATION PASSED - SAFE TO DEPLOY")
        print("\nNo demo data detected. Deployment can proceed.")
        print("="*70 + "\n")
        return True


def get_demo_data_summary():
    """Get detailed summary of demo data for review"""
    print("\n" + "="*70)
    print("DEMO DATA DETAILED SUMMARY")
    print("="*70 + "\n")

    # Demo Customers
    customers = frappe.db.sql("""
        SELECT customer_name, email_id, creation
        FROM `tabCustomer`
        WHERE customer_name LIKE 'Demo Customer%'
        OR email_id LIKE '%@example.com'
        ORDER BY creation DESC
        LIMIT 10
    """, as_dict=True)

    if customers:
        print("📋 Demo Customers (showing first 10):")
        for c in customers:
            print(f"   - {c.customer_name} ({c.email_id}) - Created: {c.creation}")
        print()

    # Demo Orders
    orders = frappe.db.sql("""
        SELECT name, customer, transaction_date, grand_total
        FROM `tabSales Order`
        WHERE customer LIKE 'Demo Customer%'
        OR name LIKE 'SO-DEMO-%'
        ORDER BY transaction_date DESC
        LIMIT 10
    """, as_dict=True)

    if orders:
        print("📋 Demo Sales Orders (showing first 10):")
        for o in orders:
            print(f"   - {o.name}: {o.customer} - ${o.grand_total:,.2f} on {o.transaction_date}")
        print()

    # Counts
    total_customers = frappe.db.count("Customer", {"customer_name": ["like", "Demo Customer%"]})
    total_orders = frappe.db.sql("""
        SELECT COUNT(*) as count
        FROM `tabSales Order`
        WHERE customer LIKE 'Demo Customer%'
    """)[0][0]

    print(f"📊 Total Demo Data:")
    print(f"   Customers: {total_customers}")
    print(f"   Sales Orders: {total_orders}")
    print("\n" + "="*70 + "\n")


def pre_deploy_check():
    """
    Wrapper function for CI/CD pipelines
    Exits with code 1 if demo data found
    """
    is_clean = verify_clean_for_production()

    if not is_clean:
        sys.exit(1)  # Fail the deployment

    sys.exit(0)  # Pass
