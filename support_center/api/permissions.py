"""
Permission helpers for Support Dashboard
"""

import frappe
from frappe import _


def has_app_permission():
    """
    Check if the current user has permission to access the Support Dashboard.
    Returns True if user is logged in and not a guest.
    Can be extended to check for specific roles.
    """
    if frappe.session.user == "Guest":
        return False

    # Optionally restrict to specific roles
    # user_roles = frappe.get_roles(frappe.session.user)
    # if "Support Team" not in user_roles and "System Manager" not in user_roles:
    #     return False

    return True


def check_customer_permission(customer_id, ptype="read"):
    """
    Check if current user has permission to access a specific customer.
    Raises PermissionError if not allowed.

    Args:
        customer_id: The Customer doctype name/ID
        ptype: Permission type - 'read', 'write', etc.
    """
    if not frappe.has_permission("Customer", ptype, customer_id):
        frappe.throw(
            _("You don't have permission to {0} this customer").format(ptype),
            frappe.PermissionError
        )


def check_booking_permission(booking_id, ptype="read"):
    """
    Check if current user has permission to access a specific meeting booking.
    Raises PermissionError if not allowed.

    Args:
        booking_id: The MM Meeting Booking doctype name/ID
        ptype: Permission type - 'read', 'write', etc.
    """
    if not frappe.has_permission("MM Meeting Booking", ptype, booking_id):
        frappe.throw(
            _("You don't have permission to {0} this meeting booking").format(ptype),
            frappe.PermissionError
        )


def check_contact_permission(contact_id, ptype="read"):
    """
    Check if current user has permission to access a specific contact.
    Raises PermissionError if not allowed.

    Args:
        contact_id: The Contact doctype name/ID
        ptype: Permission type - 'read', 'write', etc.
    """
    if not frappe.has_permission("Contact", ptype, contact_id):
        frappe.throw(
            _("You don't have permission to {0} this contact").format(ptype),
            frappe.PermissionError
        )


def check_user_permission(user_id, ptype="read"):
    """
    Check if current user has permission to access a specific user record.
    Raises PermissionError if not allowed.

    Args:
        user_id: The User doctype name/ID
        ptype: Permission type - 'read', 'write', etc.
    """
    if not frappe.has_permission("User", ptype, user_id):
        frappe.throw(
            _("You don't have permission to {0} this user").format(ptype),
            frappe.PermissionError
        )


def require_login():
    """
    Ensure user is logged in. Raises PermissionError if guest.
    """
    if frappe.session.user == "Guest":
        frappe.throw(_("You must be logged in to access this resource"), frappe.PermissionError)
