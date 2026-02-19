"""
Permission helpers for Support Dashboard and Retention Dashboard

This module provides role-based access control (RBAC) for the support center app,
including the retention dashboard which requires specific role checks.
"""

import frappe
from frappe import _
from functools import wraps


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


def check_ticket_permission(ticket_id, ptype="read"):
    """
    Check if current user has permission to access a specific support ticket (Issue).
    Raises PermissionError if not allowed.

    Args:
        ticket_id: The Issue doctype name/ID
        ptype: Permission type - 'read', 'write', etc.
    """
    if not frappe.has_permission("Issue", ptype, ticket_id):
        frappe.throw(
            _("You don't have permission to {0} this support ticket").format(ptype),
            frappe.PermissionError
        )


def require_login():
    """
    Ensure user is logged in. Raises PermissionError if guest.
    """
    if frappe.session.user == "Guest":
        frappe.throw(_("You must be logged in to access this resource"), frappe.PermissionError)


# ============================================================================
# RETENTION DASHBOARD PERMISSIONS
# ============================================================================

# Define roles that have access to retention dashboard
RETENTION_ACCESS_ROLES = [
    "Administrator",
    "Sales Manager",
    "System Manager",
    "Accounts Manager"
]


def has_retention_access(user=None):
    """
    Check if a user has access to the retention dashboard.

    Args:
        user (str, optional): Username to check. If None, checks current user.

    Returns:
        bool: True if user has any of the required roles, False otherwise.

    Example:
        >>> if has_retention_access():
        >>>     return get_sensitive_data()
        >>> else:
        >>>     frappe.throw("Access denied")
    """
    if not user:
        user = frappe.session.user

    # System administrators always have access
    if user == "Administrator":
        return True

    # Check if user has any of the required roles
    user_roles = frappe.get_roles(user)
    return any(role in user_roles for role in RETENTION_ACCESS_ROLES)


def require_retention_access(fn):
    """
    Decorator to enforce retention dashboard access permissions.

    This decorator should be applied to all @frappe.whitelist() functions
    that expose retention dashboard data.

    Args:
        fn: The function to wrap with permission checking.

    Returns:
        function: Wrapped function that checks permissions before execution.

    Raises:
        frappe.PermissionError: If user does not have required permissions.

    Example:
        @frappe.whitelist()
        @require_retention_access
        def get_dashboard_kpis():
            return {"kpis": "data"}
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not has_retention_access():
            log_access_denial(frappe.session.user, fn.__name__)
            frappe.throw(
                _("You do not have permission to access the Retention Dashboard. Required roles: {0}").format(
                    ", ".join(RETENTION_ACCESS_ROLES)
                ),
                frappe.PermissionError
            )
        return fn(*args, **kwargs)
    return wrapper


def can_access_customer_retention(customer_name, user=None):
    """
    Check if a user has permission to access a specific customer's retention data.

    This function checks both:
    1. General retention dashboard access
    2. Specific customer-level permissions in ERPNext

    Args:
        customer_name (str): Name of the customer document.
        user (str, optional): Username to check. If None, checks current user.

    Returns:
        bool: True if user can access the customer, False otherwise.

    Example:
        >>> if can_access_customer_retention("ABC Corp"):
        >>>     return get_customer_details("ABC Corp")
    """
    if not user:
        user = frappe.session.user

    # First check if user has retention dashboard access
    if not has_retention_access(user):
        return False

    # Then check ERPNext customer-level permissions
    try:
        return frappe.has_permission("Customer", "read", customer_name, user=user)
    except Exception:
        return False


def log_access_denial(user, endpoint):
    """
    Log security events when access is denied.

    This creates an audit trail for security monitoring and compliance.

    Args:
        user (str): Username that was denied access.
        endpoint (str): API endpoint or function name that was accessed.
    """
    try:
        frappe.log_error(
            title=_("Retention Dashboard - Access Denied"),
            message=_(
                "User: {0}\n"
                "Endpoint: {1}\n"
                "IP Address: {2}\n"
                "User Agent: {3}"
            ).format(
                user,
                endpoint,
                frappe.local.request_ip if hasattr(frappe.local, 'request_ip') else "Unknown",
                frappe.request.headers.get('User-Agent', 'Unknown') if frappe.request else "Unknown"
            )
        )
    except Exception:
        # Silently fail if logging fails - don't break the permission check
        pass


def log_security_event(event_type, details, user=None):
    """
    Log security-related events for audit trail.

    Args:
        event_type (str): Type of event (e.g., "access_granted", "data_export", "bulk_action").
        details (str): Detailed description of the event.
        user (str, optional): Username. If None, uses current user.

    Example:
        >>> log_security_event("data_export", "Exported 50 customer records")
    """
    if not user:
        user = frappe.session.user

    try:
        frappe.log_error(
            title=_("Retention Dashboard - {0}").format(event_type),
            message=_(
                "User: {0}\n"
                "Event: {1}\n"
                "Details: {2}\n"
                "Timestamp: {3}\n"
                "IP Address: {4}"
            ).format(
                user,
                event_type,
                details,
                frappe.utils.now(),
                frappe.local.request_ip if hasattr(frappe.local, 'request_ip') else "Unknown"
            )
        )
    except Exception:
        pass
