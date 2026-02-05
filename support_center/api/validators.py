"""
Retention Dashboard - Input Validation Module

This module provides input validation and sanitization for the retention dashboard API.
It helps prevent injection attacks, invalid data, and ensures data integrity.

Validation Categories:
1. Status filters - Validates renewal status parameters
2. Pagination - Validates limit/offset parameters
3. Date ranges - Validates date inputs and ranges
4. Customer names - Validates customer identifiers
5. Numeric values - Validates numeric inputs (amounts, counts, etc.)

Usage:
    from support_center.api.validators import validate_status_filter, validate_pagination

    @frappe.whitelist()
    def get_clients(status_filter=None, limit=50, offset=0):
        status = validate_status_filter(status_filter)
        limit, offset = validate_pagination(limit, offset)
        # ... rest of function
"""

import frappe
from frappe import _
import re
from datetime import datetime


# Constants for validation
VALID_STATUS_FILTERS = ["overdue", "due_soon", "active", "all", None]
MAX_PAGINATION_LIMIT = 1000
DEFAULT_PAGINATION_LIMIT = 50
MAX_DAYS_RANGE = 3650  # ~10 years


def validate_status_filter(status_filter):
    """
    Validate and sanitize renewal status filter parameter.

    Args:
        status_filter (str): Status filter value from API request.

    Returns:
        str or None: Validated status filter (lowercase) or None.

    Raises:
        frappe.ValidationError: If status filter is invalid.

    Example:
        >>> validate_status_filter("Overdue")  # Returns "overdue"
        >>> validate_status_filter("invalid")  # Raises ValidationError
    """
    if status_filter is None or status_filter == "" or status_filter == "all":
        return None

    # Convert to lowercase for case-insensitive comparison
    status_lower = str(status_filter).lower().strip()

    if status_lower not in VALID_STATUS_FILTERS:
        frappe.throw(
            _("Invalid status filter: {0}. Valid options: {1}").format(
                status_filter,
                ", ".join([s for s in VALID_STATUS_FILTERS if s])
            ),
            frappe.ValidationError
        )

    return status_lower


def validate_pagination(limit, offset):
    """
    Validate and sanitize pagination parameters.

    Args:
        limit (int or str): Number of records to return.
        offset (int or str): Number of records to skip.

    Returns:
        tuple: (validated_limit, validated_offset) as integers.

    Raises:
        frappe.ValidationError: If parameters are invalid or out of range.

    Example:
        >>> validate_pagination(50, 0)  # Returns (50, 0)
        >>> validate_pagination("100", "20")  # Returns (100, 20)
        >>> validate_pagination(-10, 0)  # Raises ValidationError
    """
    # Validate and convert limit
    try:
        limit = int(limit) if limit is not None else DEFAULT_PAGINATION_LIMIT
    except (ValueError, TypeError):
        frappe.throw(
            _("Invalid limit parameter: {0}. Must be a number.").format(limit),
            frappe.ValidationError
        )

    if limit < 1:
        frappe.throw(
            _("Limit must be at least 1"),
            frappe.ValidationError
        )

    if limit > MAX_PAGINATION_LIMIT:
        frappe.throw(
            _("Limit cannot exceed {0}. Received: {1}").format(MAX_PAGINATION_LIMIT, limit),
            frappe.ValidationError
        )

    # Validate and convert offset
    try:
        offset = int(offset) if offset is not None else 0
    except (ValueError, TypeError):
        frappe.throw(
            _("Invalid offset parameter: {0}. Must be a number.").format(offset),
            frappe.ValidationError
        )

    if offset < 0:
        frappe.throw(
            _("Offset cannot be negative"),
            frappe.ValidationError
        )

    return limit, offset


def validate_days_range(days_range):
    """
    Validate days range parameter.

    Args:
        days_range (int or str): Number of days for date range queries.

    Returns:
        int: Validated days range.

    Raises:
        frappe.ValidationError: If days_range is invalid or out of acceptable range.

    Example:
        >>> validate_days_range(90)  # Returns 90
        >>> validate_days_range("30")  # Returns 30
        >>> validate_days_range(-10)  # Raises ValidationError
    """
    try:
        days = int(days_range) if days_range is not None else 90
    except (ValueError, TypeError):
        frappe.throw(
            _("Invalid days_range parameter: {0}. Must be a number.").format(days_range),
            frappe.ValidationError
        )

    if days < 0:
        frappe.throw(
            _("Days range cannot be negative"),
            frappe.ValidationError
        )

    if days > MAX_DAYS_RANGE:
        frappe.throw(
            _("Days range cannot exceed {0}. Received: {1}").format(MAX_DAYS_RANGE, days),
            frappe.ValidationError
        )

    return days


def validate_date(date_str, param_name="date"):
    """
    Validate and parse date string.

    Args:
        date_str (str): Date string in YYYY-MM-DD format.
        param_name (str): Name of the parameter (for error messages).

    Returns:
        str: Validated date string in YYYY-MM-DD format.

    Raises:
        frappe.ValidationError: If date is invalid or in wrong format.

    Example:
        >>> validate_date("2024-01-15")  # Returns "2024-01-15"
        >>> validate_date("2024-13-01")  # Raises ValidationError (invalid month)
    """
    if not date_str:
        frappe.throw(
            _("{0} is required").format(param_name),
            frappe.ValidationError
        )

    # Check format with regex
    date_pattern = r'^\d{4}-\d{2}-\d{2}$'
    if not re.match(date_pattern, str(date_str)):
        frappe.throw(
            _("Invalid {0} format: {1}. Expected format: YYYY-MM-DD").format(param_name, date_str),
            frappe.ValidationError
        )

    # Validate actual date
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        frappe.throw(
            _("Invalid {0}: {1}. Not a valid calendar date.").format(param_name, date_str),
            frappe.ValidationError
        )

    return date_str


def validate_date_range(start_date, end_date):
    """
    Validate that start_date is before or equal to end_date.

    Args:
        start_date (str): Start date in YYYY-MM-DD format.
        end_date (str): End date in YYYY-MM-DD format.

    Returns:
        tuple: (validated_start_date, validated_end_date)

    Raises:
        frappe.ValidationError: If date range is invalid.

    Example:
        >>> validate_date_range("2024-01-01", "2024-01-31")
        >>> validate_date_range("2024-02-01", "2024-01-01")  # Raises error
    """
    start = validate_date(start_date, "start_date")
    end = validate_date(end_date, "end_date")

    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")

    if start_dt > end_dt:
        frappe.throw(
            _("Start date ({0}) cannot be after end date ({1})").format(start, end),
            frappe.ValidationError
        )

    return start, end


def validate_customer_name(customer_name):
    """
    Validate and sanitize customer name parameter.

    Args:
        customer_name (str): Customer document name.

    Returns:
        str: Validated customer name.

    Raises:
        frappe.ValidationError: If customer name is invalid or doesn't exist.

    Example:
        >>> validate_customer_name("ABC Corp")
        >>> validate_customer_name("")  # Raises ValidationError
    """
    if not customer_name or not isinstance(customer_name, str):
        frappe.throw(
            _("Customer name is required and must be a string"),
            frappe.ValidationError
        )

    customer_name = customer_name.strip()

    if not customer_name:
        frappe.throw(
            _("Customer name cannot be empty"),
            frappe.ValidationError
        )

    # Check if customer exists
    if not frappe.db.exists("Customer", customer_name):
        frappe.throw(
            _("Customer not found: {0}").format(customer_name),
            frappe.DoesNotExistError
        )

    return customer_name


def validate_numeric_value(value, param_name="value", min_val=None, max_val=None):
    """
    Validate numeric parameter.

    Args:
        value: Value to validate (int, float, or string).
        param_name (str): Name of parameter (for error messages).
        min_val (numeric, optional): Minimum allowed value.
        max_val (numeric, optional): Maximum allowed value.

    Returns:
        float: Validated numeric value.

    Raises:
        frappe.ValidationError: If value is not numeric or out of range.

    Example:
        >>> validate_numeric_value("100", "amount", min_val=0)
        >>> validate_numeric_value("-10", "amount", min_val=0)  # Raises error
    """
    try:
        num_value = float(value)
    except (ValueError, TypeError):
        frappe.throw(
            _("Invalid {0}: {1}. Must be a number.").format(param_name, value),
            frappe.ValidationError
        )

    if min_val is not None and num_value < min_val:
        frappe.throw(
            _("{0} must be at least {1}. Received: {2}").format(param_name, min_val, num_value),
            frappe.ValidationError
        )

    if max_val is not None and num_value > max_val:
        frappe.throw(
            _("{0} cannot exceed {1}. Received: {2}").format(param_name, max_val, num_value),
            frappe.ValidationError
        )

    return num_value


def validate_months_period(months):
    """
    Validate months period parameter for analytics.

    Args:
        months (int or str): Number of months for trend analysis.

    Returns:
        int: Validated months (either 6 or 12).

    Raises:
        frappe.ValidationError: If months is not 6 or 12.

    Example:
        >>> validate_months_period(6)  # Returns 6
        >>> validate_months_period("12")  # Returns 12
        >>> validate_months_period(3)  # Raises ValidationError
    """
    try:
        months = int(months) if months is not None else 6
    except (ValueError, TypeError):
        frappe.throw(
            _("Invalid months parameter: {0}. Must be a number.").format(months),
            frappe.ValidationError
        )

    if months not in [6, 12]:
        frappe.throw(
            _("Months must be either 6 or 12. Received: {0}").format(months),
            frappe.ValidationError
        )

    return months


def sanitize_search_query(search_query):
    """
    Sanitize search query to prevent SQL injection.

    Args:
        search_query (str): User-provided search string.

    Returns:
        str: Sanitized search query safe for SQL LIKE clauses.

    Example:
        >>> sanitize_search_query("ABC Corp")  # Returns "%ABC Corp%"
        >>> sanitize_search_query("'; DROP TABLE--")  # Returns safely escaped version
    """
    if not search_query:
        return None

    # Remove potentially dangerous characters
    # Allow alphanumeric, spaces, hyphens, underscores, dots, and common punctuation
    search_query = str(search_query).strip()

    # Escape special SQL characters
    search_query = search_query.replace("\\", "\\\\")
    search_query = search_query.replace("%", "\\%")
    search_query = search_query.replace("_", "\\_")
    search_query = search_query.replace("'", "\\'")

    # Limit length to prevent DoS
    if len(search_query) > 100:
        search_query = search_query[:100]

    return f"%{search_query}%" if search_query else None
