# Copyright (c) 2025, Best Security and contributors
# For license information, please see license.txt

"""
Backfill existing MM Meeting Bookings with customer links.

This patch re-saves all bookings that don't have a customer link,
triggering the auto_link_customer() method to match them by email/phone.
"""

import frappe


def execute():
    """Backfill customer links for existing Meeting Bookings."""

    # Get all bookings without a customer link
    unlinked_bookings = frappe.get_all(
        "MM Meeting Booking",
        filters={"customer": ["is", "not set"]},
        fields=["name", "customer_email", "customer_phone"]
    )

    if not unlinked_bookings:
        print("No unlinked bookings found. Nothing to backfill.")
        return

    print(f"Found {len(unlinked_bookings)} bookings without customer links. Starting backfill...")

    linked_count = 0
    for booking_data in unlinked_bookings:
        try:
            doc = frappe.get_doc("MM Meeting Booking", booking_data.name)
            old_customer = doc.customer

            # Save triggers before_save which calls auto_link_customer()
            doc.save(ignore_permissions=True)
            frappe.db.commit()

            if doc.customer and doc.customer != old_customer:
                linked_count += 1
                print(f"  ✓ Linked {booking_data.name} to customer: {doc.customer}")
            else:
                print(f"  - {booking_data.name}: No matching customer found (email: {booking_data.customer_email}, phone: {booking_data.customer_phone})")

        except Exception as e:
            print(f"  ✗ Error processing {booking_data.name}: {e}")

    print(f"\nBackfill complete. Linked {linked_count} of {len(unlinked_bookings)} bookings to customers.")
