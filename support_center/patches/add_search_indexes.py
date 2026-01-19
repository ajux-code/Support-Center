# Copyright (c) 2025, Best Security and contributors
# For license information, please see license.txt

"""
Add database indexes for Support Dashboard search performance.

This patch adds indexes to columns frequently used in cross-app search queries.
"""

import frappe


def execute():
    """Add indexes to improve search performance across all apps."""

    indexes_to_create = [
        # Customer indexes for email/phone lookup
        ("tabCustomer", "email_id", "idx_customer_email"),
        ("tabCustomer", "mobile_no", "idx_customer_mobile"),
        # Customer name index for LIKE queries in search
        ("tabCustomer", "customer_name", "idx_customer_name"),

        # Contact indexes for email/phone lookup
        ("tabContact", "email_id", "idx_contact_email"),
        ("tabContact", "mobile_no", "idx_contact_mobile"),
        ("tabContact", "phone", "idx_contact_phone"),
        # Contact name indexes for LIKE queries
        ("tabContact", "first_name", "idx_contact_first_name"),
        ("tabContact", "last_name", "idx_contact_last_name"),

        # User indexes for search
        ("tabUser", "full_name", "idx_user_fullname"),
    ]

    # Meeting Manager indexes (only if installed)
    if "meeting_manager" in frappe.get_installed_apps():
        indexes_to_create.extend([
            ("`tabMM Meeting Booking`", "customer_email", "idx_booking_email"),
            ("`tabMM Meeting Booking`", "customer_phone", "idx_booking_phone"),
            ("`tabMM Meeting Booking`", "customer", "idx_booking_customer"),
            # Customer name index for LIKE queries in search
            ("`tabMM Meeting Booking`", "customer_name", "idx_booking_customer_name"),
        ])

    for table, column, index_name in indexes_to_create:
        try:
            # Check if index already exists
            existing = frappe.db.sql(f"""
                SHOW INDEX FROM {table} WHERE Key_name = %s
            """, (index_name,))

            if not existing:
                # Create the index
                frappe.db.sql(f"""
                    CREATE INDEX {index_name} ON {table} ({column})
                """)
                frappe.db.commit()
                print(f"Created index {index_name} on {table}({column})")
            else:
                print(f"Index {index_name} already exists on {table}")

        except Exception as e:
            # Log but don't fail - some tables/columns might not exist
            print(f"Could not create index {index_name} on {table}({column}): {e}")
