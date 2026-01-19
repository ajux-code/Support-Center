"""
Support Dashboard Route Handler
Provides context for the customer support dashboard page
Supports both list view and detail views for multiple record types
"""

import frappe
from frappe import _


def get_context(context):
    """
    Context for support dashboard page
    URL formats:
    - /support-dashboard (shows customer list)
    - /support-dashboard?customer=CUST-00001 (shows customer detail)
    - /support-dashboard?booking=MM-MB-00001 (shows booking detail)
    - /support-dashboard?contact=CONT-00001 (shows contact detail)
    - /support-dashboard?user=user@example.com (shows user detail)
    """

    # Ensure user is logged in
    if frappe.session.user == "Guest":
        frappe.throw(_("You need to be logged in to access this page"), frappe.PermissionError)

    # Page configuration
    context.no_cache = 1
    context.show_sidebar = False

    # Pass user info to template
    context.user = frappe.session.user
    context.user_fullname = frappe.get_value("User", frappe.session.user, "full_name") or frappe.session.user

    # Pass CSRF token for API calls
    context.csrf_token = frappe.sessions.get_csrf_token()

    # Default values
    context.record_id = None
    context.record_type = None
    context.view_mode = "list"

    # Check for different record types in query params
    customer_id = frappe.form_dict.get("customer")
    booking_id = frappe.form_dict.get("booking")
    contact_id = frappe.form_dict.get("contact")
    user_id = frappe.form_dict.get("user")

    if customer_id:
        # Verify customer exists
        if not frappe.db.exists("Customer", customer_id):
            frappe.throw(_("Customer not found"), frappe.DoesNotExistError)
        context.record_id = customer_id
        context.record_type = "customer"
        context.view_mode = "detail"
    elif booking_id:
        # Verify booking exists (only if Meeting Manager is installed)
        if "meeting_manager" in frappe.get_installed_apps():
            if not frappe.db.exists("MM Meeting Booking", booking_id):
                frappe.throw(_("Meeting booking not found"), frappe.DoesNotExistError)
            context.record_id = booking_id
            context.record_type = "booking"
            context.view_mode = "detail"
        else:
            frappe.throw(_("Meeting Manager is not installed"), frappe.DoesNotExistError)
    elif contact_id:
        # Verify contact exists
        if not frappe.db.exists("Contact", contact_id):
            frappe.throw(_("Contact not found"), frappe.DoesNotExistError)
        context.record_id = contact_id
        context.record_type = "contact"
        context.view_mode = "detail"
    elif user_id:
        # Verify user exists
        if not frappe.db.exists("User", user_id):
            frappe.throw(_("User not found"), frappe.DoesNotExistError)
        context.record_id = user_id
        context.record_type = "user"
        context.view_mode = "detail"

    # Keep backward compatibility
    context.customer_id = context.record_id if context.record_type == "customer" else None

    return context
