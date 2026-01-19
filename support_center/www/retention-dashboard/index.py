"""
Retention Dashboard Route Handler
Provides context for the retention/renewal tracking dashboard page
"""

import frappe
from frappe import _


def get_context(context):
    """
    Context for retention dashboard page
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

    # Check for specific customer view
    customer_id = frappe.form_dict.get("customer")
    if customer_id:
        if not frappe.db.exists("Customer", customer_id):
            frappe.throw(_("Customer not found"), frappe.DoesNotExistError)
        context.customer_id = customer_id
        context.view_mode = "detail"
    else:
        context.customer_id = None
        context.view_mode = "dashboard"

    return context
