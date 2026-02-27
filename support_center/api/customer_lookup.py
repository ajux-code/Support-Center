"""
Customer Lookup API for Support Dashboard
Provides fast search and data retrieval for customer support workflows
"""

import frappe
from frappe import _
from frappe.utils import now_datetime, flt
from support_center.api.permissions import (
    require_login,
    check_customer_permission,
    check_booking_permission,
    check_contact_permission,
    check_user_permission,
    check_ticket_permission
)


def _meeting_manager_installed():
    """Check if Meeting Manager app is installed"""
    return "meeting_manager" in frappe.get_installed_apps()


@frappe.whitelist()
def search_customers(query, limit=10, offset=0):
    """
    Universal cross-app search: Customers, Contacts, Users, Meeting Bookings, Orders
    Empty query returns all customers (for table view)
    Returns: List of unified matches with preview data from all apps

    Args:
        query: Search string (empty for all records)
        limit: Maximum number of results to return
        offset: Number of results to skip (for pagination)
    """

    limit = int(limit)
    offset = int(offset)
    results = []
    seen_ids = set()  # Track unique entries

    # If query is provided but too short, reject it
    if query and len(query) < 2:
        return []

    # If query is empty or None, fetch all records from all sources
    if not query:
        # Calculate fetch limit: need enough results to satisfy offset + limit
        fetch_limit = offset + limit

        # 1. Fetch customers
        customers = frappe.db.sql("""
            SELECT
                name,
                customer_name,
                email_id,
                mobile_no,
                customer_group,
                territory,
                modified
            FROM `tabCustomer`
            WHERE disabled = 0
            ORDER BY modified DESC
            LIMIT %(fetch_limit)s
        """, {"fetch_limit": fetch_limit}, as_dict=True)

        for customer in customers:
            if customer.name not in seen_ids:
                seen_ids.add(customer.name)
                results.append({
                    "type": "customer",
                    "id": customer.name,
                    "name": customer.customer_name,
                    "email": customer.email_id,
                    "phone": customer.mobile_no,
                    "label": f"{customer.customer_name} ({customer.email_id or customer.mobile_no or customer.name})",
                    "source": "ERPNext Customer",
                    "modified": customer.modified
                })

        # 2. Fetch contacts
        contacts = frappe.db.sql("""
            SELECT
                name,
                first_name,
                last_name,
                email_id,
                phone,
                mobile_no,
                company_name,
                modified
            FROM `tabContact`
            ORDER BY modified DESC
            LIMIT %(fetch_limit)s
        """, {"fetch_limit": fetch_limit}, as_dict=True)

        for contact in contacts:
            contact_name = f"{contact.first_name or ''} {contact.last_name or ''}".strip()
            contact_id = f"contact-{contact.name}"
            if contact_id not in seen_ids:
                seen_ids.add(contact_id)
                results.append({
                    "type": "contact",
                    "id": contact.name,
                    "name": contact_name or contact.name,
                    "email": contact.email_id,
                    "phone": contact.mobile_no or contact.phone,
                    "label": f"{contact_name} ({contact.email_id or contact.mobile_no or contact.name})",
                    "source": "Contact",
                    "company": contact.company_name,
                    "modified": contact.modified
                })

        # 3. Fetch users
        users = frappe.db.sql("""
            SELECT
                name,
                full_name,
                email,
                mobile_no,
                user_type,
                modified
            FROM `tabUser`
            WHERE enabled = 1
            AND name NOT IN ('Administrator', 'Guest')
            ORDER BY modified DESC
            LIMIT %(fetch_limit)s
        """, {"fetch_limit": fetch_limit}, as_dict=True)

        for user in users:
            user_id = f"user-{user.name}"
            if user_id not in seen_ids:
                seen_ids.add(user_id)
                results.append({
                    "type": "user",
                    "id": user.name,
                    "name": user.full_name or user.email,
                    "email": user.email,
                    "phone": user.mobile_no,
                    "label": f"{user.full_name or user.email} ({user.user_type})",
                    "source": "System User",
                    "user_type": user.user_type,
                    "modified": user.modified
                })

        # 4. Fetch meeting bookings (if Meeting Manager is installed)
        if _meeting_manager_installed():
            bookings = frappe.db.sql("""
                SELECT
                    mb.name,
                    mc.customer_name,
                    mb.customer_email_at_booking as customer_email,
                    mb.customer_phone_at_booking as customer_phone,
                    mb.booking_status,
                    mb.start_datetime,
                    mb.meeting_type,
                    mb.modified
                FROM `tabMM Meeting Booking` mb
                LEFT JOIN `tabMM Customer` mc ON mb.customer = mc.name
                ORDER BY mb.modified DESC
                LIMIT %(fetch_limit)s
            """, {"fetch_limit": fetch_limit}, as_dict=True)

            for booking in bookings:
                booking_id = f"booking-{booking.name}"
                if booking_id not in seen_ids:
                    seen_ids.add(booking_id)
                    results.append({
                        "type": "booking",
                        "id": booking.name,
                        "name": booking.customer_name,
                        "email": booking.customer_email,
                        "phone": booking.customer_phone,
                        "label": f"{booking.customer_name} - Meeting {booking.name} ({booking.booking_status})",
                        "source": "Meeting Manager",
                        "booking_status": booking.booking_status,
                        "meeting_date": booking.start_datetime,
                        "modified": booking.modified
                    })

        # Sort all results by modified date (most recent first)
        results.sort(key=lambda x: x.get('modified', ''), reverse=True)

        # Remove the modified field from results (was only used for sorting)
        for r in results:
            r.pop('modified', None)

        # Apply pagination (offset and limit)
        return results[offset:offset + limit]

    # If query is provided, do cross-app search
    query_param = f"%{query}%"

    # For phone number search, also try without special characters
    phone_query = query.replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
    phone_param = f"%{phone_query}%"

    # Calculate fetch limit: need enough results to satisfy offset + limit
    fetch_limit = offset + limit

    # 1. Search in Customer DocType (ERPNext)
    customers = frappe.db.sql("""
        SELECT
            name,
            customer_name,
            email_id,
            mobile_no,
            customer_group,
            territory,
            creation
        FROM `tabCustomer`
        WHERE
            (customer_name LIKE %(query)s
            OR email_id LIKE %(query)s
            OR mobile_no LIKE %(query)s
            OR REPLACE(REPLACE(REPLACE(REPLACE(mobile_no, '-', ''), ' ', ''), '(', ''), ')', '') LIKE %(phone_query)s
            OR name LIKE %(query)s)
            AND disabled = 0
        ORDER BY modified DESC
        LIMIT %(fetch_limit)s
    """, {"query": query_param, "phone_query": phone_param, "fetch_limit": fetch_limit}, as_dict=True)

    for customer in customers:
        if customer.name not in seen_ids:
            seen_ids.add(customer.name)
            results.append({
                "type": "customer",
                "id": customer.name,
                "name": customer.customer_name,
                "email": customer.email_id,
                "phone": customer.mobile_no,
                "label": f"{customer.customer_name} ({customer.email_id or customer.mobile_no or customer.name})",
                "source": "ERPNext Customer"
            })

    # 2. Search in Contact DocType (Frappe)
    contacts = frappe.db.sql("""
        SELECT
            name,
            first_name,
            last_name,
            email_id,
            phone,
            mobile_no,
            company_name
        FROM `tabContact`
        WHERE
            (first_name LIKE %(query)s
            OR last_name LIKE %(query)s
            OR email_id LIKE %(query)s
            OR phone LIKE %(query)s
            OR mobile_no LIKE %(query)s
            OR REPLACE(REPLACE(REPLACE(REPLACE(mobile_no, '-', ''), ' ', ''), '(', ''), ')', '') LIKE %(phone_query)s
            OR name LIKE %(query)s)
        ORDER BY modified DESC
        LIMIT %(fetch_limit)s
    """, {"query": query_param, "phone_query": phone_param, "fetch_limit": fetch_limit}, as_dict=True)

    for contact in contacts:
        contact_name = f"{contact.first_name or ''} {contact.last_name or ''}".strip()
        contact_id = f"contact-{contact.name}"
        if contact_id not in seen_ids:
            seen_ids.add(contact_id)
            results.append({
                "type": "contact",
                "id": contact.name,
                "name": contact_name or contact.name,
                "email": contact.email_id,
                "phone": contact.mobile_no or contact.phone,
                "label": f"{contact_name} ({contact.email_id or contact.mobile_no or contact.name})",
                "source": "Contact",
                "company": contact.company_name
            })

    # 3. Search in User DocType (Frappe Core - for registered users)
    users = frappe.db.sql("""
        SELECT
            name,
            full_name,
            email,
            mobile_no,
            user_type
        FROM `tabUser`
        WHERE
            (full_name LIKE %(query)s
            OR email LIKE %(query)s
            OR mobile_no LIKE %(query)s
            OR name LIKE %(query)s)
            AND enabled = 1
            AND name NOT IN ('Administrator', 'Guest')
        ORDER BY modified DESC
        LIMIT %(fetch_limit)s
    """, {"query": query_param, "fetch_limit": fetch_limit}, as_dict=True)

    for user in users:
        user_id = f"user-{user.name}"
        if user_id not in seen_ids:
            seen_ids.add(user_id)
            results.append({
                "type": "user",
                "id": user.name,
                "name": user.full_name or user.email,
                "email": user.email,
                "phone": user.mobile_no,
                "label": f"{user.full_name or user.email} ({user.user_type})",
                "source": "System User",
                "user_type": user.user_type
            })

    # 4. Search in Meeting Bookings (if Meeting Manager is installed)
    if _meeting_manager_installed():
        bookings = frappe.db.sql("""
            SELECT
                mb.name,
                mc.customer_name,
                mb.customer_email_at_booking as customer_email,
                mb.customer_phone_at_booking as customer_phone,
                mb.booking_status,
                mb.start_datetime,
                mb.meeting_type
            FROM `tabMM Meeting Booking` mb
            LEFT JOIN `tabMM Customer` mc ON mb.customer = mc.name
            WHERE
                (mc.customer_name LIKE %(query)s
                OR mb.customer_email_at_booking LIKE %(query)s
                OR mb.customer_phone_at_booking LIKE %(query)s
                OR mb.name LIKE %(query)s)
            ORDER BY mb.modified DESC
            LIMIT %(fetch_limit)s
        """, {"query": query_param, "fetch_limit": fetch_limit}, as_dict=True)

        for booking in bookings:
            booking_id = f"booking-{booking.name}"
            if booking_id not in seen_ids:
                seen_ids.add(booking_id)
                results.append({
                    "type": "booking",
                    "id": booking.name,
                    "name": booking.customer_name,
                    "email": booking.customer_email,
                    "phone": booking.customer_phone,
                    "label": f"{booking.customer_name} - Meeting {booking.name} ({booking.booking_status})",
                    "source": "Meeting Manager",
                    "booking_status": booking.booking_status,
                    "meeting_date": booking.start_datetime
                })

    # 5. Search in Sales Orders (by order ID)
    orders = frappe.db.sql("""
        SELECT DISTINCT
            so.customer,
            so.customer_name,
            so.name as order_id,
            so.grand_total
        FROM `tabSales Order` so
        WHERE
            so.name LIKE %(query)s
            AND so.docstatus < 2
        LIMIT %(fetch_limit)s
    """, {"query": query_param, "fetch_limit": fetch_limit}, as_dict=True)

    for order in orders:
        order_id = f"order-{order.order_id}"
        if order_id not in seen_ids:
            seen_ids.add(order_id)
            results.append({
                "type": "order",
                "order_id": order.order_id,
                "customer_id": order.customer,
                "customer_name": order.customer_name,
                "amount": flt(order.grand_total),
                "label": f"Order {order.order_id} - {order.customer_name} (${flt(order.grand_total):.2f})",
                "source": "Sales Order"
            })

    # Apply pagination (offset and limit)
    return results[offset:offset + limit]


@frappe.whitelist()
def search_customers_paginated(query, limit=20, offset=0, category=None):
    """
    Paginated search with total count for shadcn-style pagination.
    Returns both results and total_count for proper pagination UI.

    Args:
        query: Search string (empty for all records)
        limit: Maximum number of results to return per page
        offset: Number of results to skip
        category: Filter by source category ('contact', 'customer', 'booking', or 'all'/None)
                  - 'contact': Customers from Contact doctype (source: "Contact")
                  - 'customer': Sales Orders from Customer doctype (source: "ERPNext Customer")
                  - 'booking': Meeting Bookings (source: "Meeting Manager")
                  - 'all' or None: All records

    Returns:
        dict with 'results' list and 'total_count' integer
    """
    limit = int(limit)
    offset = int(offset)

    # Get all matching results (we need to count them)
    all_results = _get_all_search_results(query)

    # Filter by category if specified
    if category and category != 'all':
        all_results = [r for r in all_results if r.get('type') == category]

    # Return paginated slice with total count
    return {
        "results": all_results[offset:offset + limit],
        "total_count": len(all_results)
    }


@frappe.whitelist()
def get_category_counts(query=''):
    """
    Get counts for each category based on the current search query.
    Uses COUNT(*) SQL queries instead of fetching all rows.

    Args:
        query: Optional search string to filter by

    Returns:
        dict with counts per category: {'contact': N, 'customer': N, 'booking': N, 'ticket': N}
    """
    counts = {
        'contact': 0,
        'customer': 0,
        'booking': 0,
        'ticket': 0
    }

    if query and len(query) < 2:
        return counts

    if query:
        query_param = f"%{query}%"
        phone_query = query.replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
        phone_param = f"%{phone_query}%"

        counts['customer'] = frappe.db.sql("""
            SELECT COUNT(*) FROM `tabCustomer`
            WHERE (customer_name LIKE %(q)s OR email_id LIKE %(q)s
                   OR mobile_no LIKE %(q)s OR name LIKE %(q)s
                   OR REPLACE(REPLACE(REPLACE(REPLACE(mobile_no, '-', ''), ' ', ''), '(', ''), ')', '') LIKE %(pq)s)
            AND disabled = 0
        """, {"q": query_param, "pq": phone_param})[0][0]

        counts['contact'] = frappe.db.sql("""
            SELECT COUNT(*) FROM `tabContact`
            WHERE first_name LIKE %(q)s OR last_name LIKE %(q)s
                  OR email_id LIKE %(q)s OR phone LIKE %(q)s
                  OR mobile_no LIKE %(q)s OR name LIKE %(q)s
                  OR REPLACE(REPLACE(REPLACE(REPLACE(mobile_no, '-', ''), ' ', ''), '(', ''), ')', '') LIKE %(pq)s
        """, {"q": query_param, "pq": phone_param})[0][0]

        counts['ticket'] = frappe.db.sql("""
            SELECT COUNT(*) FROM `tabIssue` i
            LEFT JOIN `tabCustomer` c ON i.customer = c.name
            WHERE i.subject LIKE %(q)s OR i.name LIKE %(q)s
                  OR i.raised_by LIKE %(q)s OR i.customer_name LIKE %(q)s
                  OR c.customer_name LIKE %(q)s
        """, {"q": query_param})[0][0]

        if _meeting_manager_installed():
            counts['booking'] = frappe.db.sql("""
                SELECT COUNT(*) FROM `tabMM Meeting Booking` mb
                LEFT JOIN `tabMM Customer` mc ON mb.customer = mc.name
                WHERE mc.customer_name LIKE %(q)s
                      OR mb.customer_email_at_booking LIKE %(q)s
                      OR mb.customer_phone_at_booking LIKE %(q)s
                      OR mb.name LIKE %(q)s
            """, {"q": query_param})[0][0]
    else:
        counts['customer'] = frappe.db.sql(
            "SELECT COUNT(*) FROM `tabCustomer` WHERE disabled = 0"
        )[0][0]

        counts['contact'] = frappe.db.sql(
            "SELECT COUNT(*) FROM `tabContact`"
        )[0][0]

        counts['ticket'] = frappe.db.sql(
            "SELECT COUNT(*) FROM `tabIssue`"
        )[0][0]

        if _meeting_manager_installed():
            counts['booking'] = frappe.db.sql(
                "SELECT COUNT(*) FROM `tabMM Meeting Booking`"
            )[0][0]

    return counts


def _get_all_search_results(query):
    """
    Internal function to get all search results without pagination.
    Used by search_customers_paginated to calculate total count.
    """
    results = []
    seen_ids = set()

    # If query is provided but too short, reject it
    if query and len(query) < 2:
        return []

    if not query:
        # Fetch all records from all sources (no limit for counting)
        # 1. Fetch customers
        customers = frappe.db.sql("""
            SELECT
                name, customer_name, email_id, mobile_no,
                customer_group, territory, modified
            FROM `tabCustomer`
            WHERE disabled = 0
            ORDER BY modified DESC
            LIMIT 5000
        """, as_dict=True)

        for customer in customers:
            if customer.name not in seen_ids:
                seen_ids.add(customer.name)
                results.append({
                    "type": "customer",
                    "id": customer.name,
                    "name": customer.customer_name,
                    "email": customer.email_id,
                    "phone": customer.mobile_no,
                    "label": f"{customer.customer_name} ({customer.email_id or customer.mobile_no or customer.name})",
                    "source": "ERPNext Customer",
                    "modified": customer.modified
                })

        # 2. Fetch contacts
        contacts = frappe.db.sql("""
            SELECT
                name, first_name, last_name, email_id,
                phone, mobile_no, company_name, modified
            FROM `tabContact`
            ORDER BY modified DESC
            LIMIT 5000
        """, as_dict=True)

        for contact in contacts:
            contact_name = f"{contact.first_name or ''} {contact.last_name or ''}".strip()
            contact_id = f"contact-{contact.name}"
            if contact_id not in seen_ids:
                seen_ids.add(contact_id)
                results.append({
                    "type": "contact",
                    "id": contact.name,
                    "name": contact_name or contact.name,
                    "email": contact.email_id,
                    "phone": contact.mobile_no or contact.phone,
                    "label": f"{contact_name} ({contact.email_id or contact.mobile_no or contact.name})",
                    "source": "Contact",
                    "company": contact.company_name,
                    "modified": contact.modified
                })

        # 3. Fetch users
        users = frappe.db.sql("""
            SELECT
                name, full_name, email, mobile_no, user_type, modified
            FROM `tabUser`
            WHERE enabled = 1
            AND name NOT IN ('Administrator', 'Guest')
            ORDER BY modified DESC
            LIMIT 5000
        """, as_dict=True)

        for user in users:
            user_id = f"user-{user.name}"
            if user_id not in seen_ids:
                seen_ids.add(user_id)
                results.append({
                    "type": "user",
                    "id": user.name,
                    "name": user.full_name or user.email,
                    "email": user.email,
                    "phone": user.mobile_no,
                    "label": f"{user.full_name or user.email} ({user.user_type})",
                    "source": "System User",
                    "user_type": user.user_type,
                    "modified": user.modified
                })

        # 4. Fetch meeting bookings (if installed)
        if _meeting_manager_installed():
            bookings = frappe.db.sql("""
                SELECT
                    mb.name,
                    mc.customer_name,
                    mb.customer_email_at_booking as customer_email,
                    mb.customer_phone_at_booking as customer_phone,
                    mb.booking_status,
                    mb.start_datetime,
                    mb.meeting_type,
                    mb.modified
                FROM `tabMM Meeting Booking` mb
                LEFT JOIN `tabMM Customer` mc ON mb.customer = mc.name
                ORDER BY mb.modified DESC
                LIMIT 5000
            """, as_dict=True)

            for booking in bookings:
                booking_id = f"booking-{booking.name}"
                if booking_id not in seen_ids:
                    seen_ids.add(booking_id)
                    results.append({
                        "type": "booking",
                        "id": booking.name,
                        "name": booking.customer_name,
                        "email": booking.customer_email,
                        "phone": booking.customer_phone,
                        "label": f"{booking.customer_name} - Meeting {booking.name} ({booking.booking_status})",
                        "source": "Meeting Manager",
                        "booking_status": booking.booking_status,
                        "meeting_date": booking.start_datetime,
                        "modified": booking.modified
                    })

        # 5. Fetch support tickets (Issue doctype)
        # JOIN with Customer to get actual customer_name when linked
        tickets = frappe.db.sql("""
            SELECT
                i.name, i.subject, i.status, i.priority, i.customer,
                COALESCE(c.customer_name, i.customer_name) as customer_name,
                i.raised_by, i.opening_date, i.modified
            FROM `tabIssue` i
            LEFT JOIN `tabCustomer` c ON i.customer = c.name
            ORDER BY i.modified DESC
            LIMIT 5000
        """, as_dict=True)

        for ticket in tickets:
            ticket_id = f"ticket-{ticket.name}"
            if ticket_id not in seen_ids:
                seen_ids.add(ticket_id)
                # Use customer_name from Customer record if available, otherwise fall back to raised_by email
                display_name = ticket.customer_name or ticket.raised_by or ticket.subject
                results.append({
                    "type": "ticket",
                    "id": ticket.name,
                    "name": display_name,
                    "email": ticket.raised_by,
                    "phone": None,
                    "label": f"{ticket.name} - {ticket.subject}",
                    "source": "Support Tickets",
                    "status": ticket.status,
                    "priority": ticket.priority,
                    "modified": ticket.modified
                })

        # Sort all results by modified date
        results.sort(key=lambda x: x.get('modified', ''), reverse=True)

        # Remove modified field from results
        for r in results:
            r.pop('modified', None)

        return results

    # Query-based search
    query_param = f"%{query}%"
    phone_query = query.replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
    phone_param = f"%{phone_query}%"

    # 1. Search customers
    customers = frappe.db.sql("""
        SELECT
            name, customer_name, email_id, mobile_no, customer_group
        FROM `tabCustomer`
        WHERE
            (customer_name LIKE %(query)s
            OR email_id LIKE %(query)s
            OR mobile_no LIKE %(query)s
            OR REPLACE(REPLACE(REPLACE(REPLACE(mobile_no, '-', ''), ' ', ''), '(', ''), ')', '') LIKE %(phone_query)s
            OR name LIKE %(query)s)
            AND disabled = 0
        ORDER BY modified DESC
        LIMIT 500
    """, {"query": query_param, "phone_query": phone_param}, as_dict=True)

    for customer in customers:
        if customer.name not in seen_ids:
            seen_ids.add(customer.name)
            results.append({
                "type": "customer",
                "id": customer.name,
                "name": customer.customer_name,
                "email": customer.email_id,
                "phone": customer.mobile_no,
                "label": f"{customer.customer_name} ({customer.email_id or customer.mobile_no or customer.name})",
                "source": "ERPNext Customer"
            })

    # 2. Search contacts
    contacts = frappe.db.sql("""
        SELECT
            name, first_name, last_name, email_id, phone, mobile_no, company_name
        FROM `tabContact`
        WHERE
            (first_name LIKE %(query)s
            OR last_name LIKE %(query)s
            OR email_id LIKE %(query)s
            OR phone LIKE %(query)s
            OR mobile_no LIKE %(query)s
            OR REPLACE(REPLACE(REPLACE(REPLACE(mobile_no, '-', ''), ' ', ''), '(', ''), ')', '') LIKE %(phone_query)s
            OR name LIKE %(query)s)
        ORDER BY modified DESC
        LIMIT 500
    """, {"query": query_param, "phone_query": phone_param}, as_dict=True)

    for contact in contacts:
        contact_name = f"{contact.first_name or ''} {contact.last_name or ''}".strip()
        contact_id = f"contact-{contact.name}"
        if contact_id not in seen_ids:
            seen_ids.add(contact_id)
            results.append({
                "type": "contact",
                "id": contact.name,
                "name": contact_name or contact.name,
                "email": contact.email_id,
                "phone": contact.mobile_no or contact.phone,
                "label": f"{contact_name} ({contact.email_id or contact.mobile_no or contact.name})",
                "source": "Contact",
                "company": contact.company_name
            })

    # 3. Search users
    users = frappe.db.sql("""
        SELECT
            name, full_name, email, mobile_no, user_type
        FROM `tabUser`
        WHERE
            (full_name LIKE %(query)s
            OR email LIKE %(query)s
            OR mobile_no LIKE %(query)s
            OR name LIKE %(query)s)
            AND enabled = 1
            AND name NOT IN ('Administrator', 'Guest')
        ORDER BY modified DESC
        LIMIT 500
    """, {"query": query_param}, as_dict=True)

    for user in users:
        user_id = f"user-{user.name}"
        if user_id not in seen_ids:
            seen_ids.add(user_id)
            results.append({
                "type": "user",
                "id": user.name,
                "name": user.full_name or user.email,
                "email": user.email,
                "phone": user.mobile_no,
                "label": f"{user.full_name or user.email} ({user.user_type})",
                "source": "System User",
                "user_type": user.user_type
            })

    # 4. Search meeting bookings (if installed)
    if _meeting_manager_installed():
        bookings = frappe.db.sql("""
            SELECT
                mb.name,
                mc.customer_name,
                mb.customer_email_at_booking as customer_email,
                mb.customer_phone_at_booking as customer_phone,
                mb.booking_status,
                mb.start_datetime,
                mb.meeting_type
            FROM `tabMM Meeting Booking` mb
            LEFT JOIN `tabMM Customer` mc ON mb.customer = mc.name
            WHERE
                (mc.customer_name LIKE %(query)s
                OR mb.customer_email_at_booking LIKE %(query)s
                OR mb.customer_phone_at_booking LIKE %(query)s
                OR mb.name LIKE %(query)s)
            ORDER BY mb.modified DESC
            LIMIT 500
        """, {"query": query_param}, as_dict=True)

        for booking in bookings:
            booking_id = f"booking-{booking.name}"
            if booking_id not in seen_ids:
                seen_ids.add(booking_id)
                results.append({
                    "type": "booking",
                    "id": booking.name,
                    "name": booking.customer_name,
                    "email": booking.customer_email,
                    "phone": booking.customer_phone,
                    "label": f"{booking.customer_name} - Meeting {booking.name} ({booking.booking_status})",
                    "source": "Meeting Manager",
                    "booking_status": booking.booking_status,
                    "meeting_date": booking.start_datetime
                })

    # 5. Search sales orders
    orders = frappe.db.sql("""
        SELECT
            so.customer, so.customer_name, so.name as order_id, so.grand_total
        FROM `tabSales Order` so
        WHERE
            so.name LIKE %(query)s
            AND so.docstatus < 2
        LIMIT 500
    """, {"query": query_param}, as_dict=True)

    for order in orders:
        order_id = f"order-{order.order_id}"
        if order_id not in seen_ids:
            seen_ids.add(order_id)
            results.append({
                "type": "order",
                "order_id": order.order_id,
                "customer_id": order.customer,
                "customer_name": order.customer_name,
                "amount": flt(order.grand_total),
                "label": f"Order {order.order_id} - {order.customer_name} (${flt(order.grand_total):.2f})",
                "source": "Sales Order"
            })

    # 6. Search support tickets (Issue doctype)
    # JOIN with Customer to get actual customer_name and search by it
    tickets = frappe.db.sql("""
        SELECT
            i.name, i.subject, i.status, i.priority, i.customer,
            COALESCE(c.customer_name, i.customer_name) as customer_name,
            i.raised_by, i.opening_date
        FROM `tabIssue` i
        LEFT JOIN `tabCustomer` c ON i.customer = c.name
        WHERE
            (i.subject LIKE %(query)s
            OR i.name LIKE %(query)s
            OR i.raised_by LIKE %(query)s
            OR i.customer_name LIKE %(query)s
            OR c.customer_name LIKE %(query)s)
        ORDER BY i.modified DESC
        LIMIT 500
    """, {"query": query_param}, as_dict=True)

    for ticket in tickets:
        ticket_id = f"ticket-{ticket.name}"
        if ticket_id not in seen_ids:
            seen_ids.add(ticket_id)
            # Use customer_name from Customer record if available, otherwise fall back to raised_by email
            display_name = ticket.customer_name or ticket.raised_by or ticket.subject
            results.append({
                "type": "ticket",
                "id": ticket.name,
                "name": display_name,
                "email": ticket.raised_by,
                "phone": None,
                "label": f"{ticket.name} - {ticket.subject}",
                "source": "Support Tickets",
                "status": ticket.status,
                "priority": ticket.priority
            })

    return results


@frappe.whitelist()
def get_customer_details(customer_id):
    """
    Get full customer profile with computed metrics across all apps
    """
    require_login()

    # Check if customer exists and is accessible
    if not frappe.db.exists("Customer", customer_id):
        frappe.throw(_("Customer not found"), frappe.DoesNotExistError)

    # Check permission
    check_customer_permission(customer_id, "read")

    # Get customer base data
    customer = frappe.get_doc("Customer", customer_id)

    # Calculate order metrics
    order_stats = frappe.db.sql("""
        SELECT
            COUNT(*) as total_orders,
            COALESCE(SUM(grand_total), 0) as lifetime_value,
            MAX(transaction_date) as last_order_date,
            COALESCE(AVG(grand_total), 0) as avg_order_value
        FROM `tabSales Order`
        WHERE customer = %(customer)s
        AND docstatus = 1
    """, {"customer": customer_id}, as_dict=True)[0]

    # Get outstanding amount (sum of unpaid invoices)
    outstanding = frappe.db.sql("""
        SELECT COALESCE(SUM(outstanding_amount), 0) as outstanding
        FROM `tabSales Invoice`
        WHERE customer = %(customer)s
        AND docstatus = 1
        AND outstanding_amount > 0
    """, {"customer": customer_id}, as_dict=True)[0]

    # Get meeting bookings count (if Meeting Manager is installed)
    meeting_stats = {"total_meetings": 0, "last_meeting_date": None}
    if _meeting_manager_installed():
        # First try using the customer link field (most reliable)
        meeting_stats = frappe.db.sql("""
            SELECT
                COUNT(*) as total_meetings,
                MAX(start_datetime) as last_meeting_date
            FROM `tabMM Meeting Booking`
            WHERE customer = %(customer_id)s
            AND booking_status NOT IN ('Cancelled')
        """, {"customer_id": customer_id}, as_dict=True)[0]

        # If no linked bookings found, fall back to email/phone matching
        # This handles legacy bookings that haven't been re-saved with auto-linking
        if meeting_stats.get("total_meetings", 0) == 0 and (customer.email_id or customer.mobile_no):
            fallback_stats = frappe.db.sql("""
                SELECT
                    COUNT(*) as total_meetings,
                    MAX(start_datetime) as last_meeting_date
                FROM `tabMM Meeting Booking`
                WHERE customer IS NULL
                AND (customer_email_at_booking = %(email)s OR customer_phone_at_booking = %(phone)s)
                AND booking_status NOT IN ('Cancelled')
            """, {"email": customer.email_id, "phone": customer.mobile_no}, as_dict=True)[0]
            if fallback_stats.get("total_meetings", 0) > 0:
                meeting_stats = fallback_stats

    # Get primary address for the customer
    primary_address = frappe.db.sql("""
        SELECT
            a.address_line1,
            a.address_line2,
            a.city,
            a.state,
            a.pincode,
            a.country
        FROM `tabAddress` a
        INNER JOIN `tabDynamic Link` dl ON dl.parent = a.name
        WHERE dl.link_doctype = 'Customer'
        AND dl.link_name = %(customer)s
        AND a.is_primary_address = 1
        LIMIT 1
    """, {"customer": customer_id}, as_dict=True)

    # Format address string
    address_display = ""
    if primary_address:
        addr = primary_address[0]
        address_parts = [
            addr.address_line1,
            addr.address_line2,
            addr.city,
            addr.state,
            addr.pincode,
            addr.country
        ]
        address_display = ", ".join(filter(None, address_parts))

    return {
        "customer_id": customer.name,
        "customer_name": customer.customer_name,
        "email": customer.email_id,
        "phone": customer.mobile_no,
        "company_name": customer.customer_name if customer.customer_type == "Company" else None,
        "address": address_display or None,
        "customer_since": customer.creation,
        "customer_type": customer.customer_type,
        "customer_group": customer.customer_group,
        "territory": customer.territory,

        # Computed metrics from ERPNext
        "total_orders": int(order_stats.total_orders or 0),
        "lifetime_value": flt(order_stats.lifetime_value or 0),
        "last_order_date": order_stats.last_order_date,
        "avg_order_value": flt(order_stats.avg_order_value or 0),
        "outstanding_amount": flt(outstanding.outstanding or 0),
        "credit_limit": flt(customer.credit_limits[0].credit_limit if customer.credit_limits else 0),

        # Computed metrics from Meeting Manager
        "total_meetings": int(meeting_stats.get("total_meetings") or 0),
        "last_meeting_date": meeting_stats.get("last_meeting_date")
    }


@frappe.whitelist()
def get_customer_orders(customer_id, limit=5, offset=0):
    """
    Get recent orders with detailed WooCommerce-style information

    Args:
        customer_id: Customer ID
        limit: Maximum number of orders to return
        offset: Number of orders to skip (for pagination)
    """

    limit = int(limit)
    offset = int(offset)

    orders = frappe.db.sql("""
        SELECT
            so.name,
            so.transaction_date,
            TIME(so.creation) as order_time,
            so.grand_total,
            so.status,
            so.per_delivered,
            so.per_billed,
            so.delivery_status,
            so.customer_name,
            so.contact_email,
            so.contact_mobile,
            so.payment_terms_template,
            (SELECT COUNT(*) FROM `tabSales Order Item`
             WHERE parent = so.name) as items_count
        FROM `tabSales Order` so
        WHERE so.customer = %(customer)s
        AND so.docstatus < 2
        ORDER BY so.transaction_date DESC, so.creation DESC
        LIMIT %(limit)s OFFSET %(offset)s
    """, {"customer": customer_id, "limit": limit, "offset": offset}, as_dict=True)

    if not orders:
        return orders

    order_names = tuple(o.name for o in orders)

    # Batch query: Get item names for all orders in one query
    all_items = frappe.db.sql("""
        SELECT parent, GROUP_CONCAT(DISTINCT item_name SEPARATOR ', ') as item_names_concat
        FROM `tabSales Order Item`
        WHERE parent IN %(orders)s
        GROUP BY parent
    """, {"orders": order_names}, as_dict=True)

    # Create lookup dict for item names
    items_by_order = {item.parent: item.item_names_concat for item in all_items}

    # Batch query: Get tracking info for all orders in one query
    all_tracking = frappe.db.sql("""
        SELECT
            dni.against_sales_order as order_name,
            dn.lr_no as tracking_number,
            dn.lr_date,
            dn.creation
        FROM `tabDelivery Note` dn
        JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
        WHERE dni.against_sales_order IN %(orders)s
        AND dn.docstatus = 1
        ORDER BY dn.creation DESC
    """, {"orders": order_names}, as_dict=True)

    # Create lookup dict for tracking info (keep only most recent per order)
    tracking_by_order = {}
    for track in all_tracking:
        if track.order_name not in tracking_by_order:
            tracking_by_order[track.order_name] = track

    # Enrich orders with item names and tracking data
    for order in orders:
        # Get item names (limited to first 3 for display, already comma-separated)
        item_names = items_by_order.get(order.name)
        if item_names:
            # Limit to first 3 items for display
            item_list = item_names.split(', ')[:3]
            order["item_names"] = ", ".join(item_list)
        else:
            order["item_names"] = None

        # Get tracking info
        tracking = tracking_by_order.get(order.name)
        if tracking:
            order["tracking_number"] = tracking.tracking_number
            order["delivery_date"] = tracking.lr_date
        else:
            order["tracking_number"] = None
            order["delivery_date"] = None

        # Format amounts
        order["grand_total"] = flt(order.grand_total)

    return orders


@frappe.whitelist()
def get_support_history(customer_id, limit=10):
    """
    Get all support interactions from Meeting Manager + other sources
    """

    limit = int(limit)

    # Get customer details for email/phone lookup
    customer = frappe.get_doc("Customer", customer_id)
    customer_email = customer.email_id
    customer_phone = customer.mobile_no

    interactions = []

    # Get Meeting Manager bookings (if installed)
    if _meeting_manager_installed():
        # Use the customer link field to find bookings
        bookings = frappe.db.sql("""
            SELECT
                mb.name,
                mb.start_datetime,
                mb.booking_status,
                mc.customer_name,
                mb.customer_email_at_booking as customer_email,
                mb.customer_phone_at_booking as customer_phone,
                mb.customer_notes,
                mb.meeting_type
            FROM `tabMM Meeting Booking` mb
            LEFT JOIN `tabMM Customer` mc ON mb.customer = mc.name
            WHERE mb.customer = %(customer_id)s
            AND mb.booking_status NOT IN ('Cancelled')
            ORDER BY mb.start_datetime DESC
            LIMIT %(limit)s
        """, {"customer_id": customer_id, "limit": limit}, as_dict=True)

        # If no linked bookings, fall back to email/phone matching for legacy data
        if not bookings and (customer_email or customer_phone):
            booking_filters = []
            booking_params = {"limit": limit}

            if customer_email:
                booking_filters.append("mb.customer_email_at_booking = %(email)s")
                booking_params["email"] = customer_email

            if customer_phone:
                booking_filters.append("mb.customer_phone_at_booking = %(phone)s")
                booking_params["phone"] = customer_phone

            booking_where = " OR ".join(booking_filters) if booking_filters else "1=0"

            # booking_where only contains hardcoded column comparisons with %(param)s placeholders
            bookings = frappe.db.sql("""
                SELECT
                    mb.name,
                    mb.start_datetime,
                    mb.booking_status,
                    mc.customer_name,
                    mb.customer_email_at_booking as customer_email,
                    mb.customer_phone_at_booking as customer_phone,
                    mb.customer_notes,
                    mb.meeting_type
                FROM `tabMM Meeting Booking` mb
                LEFT JOIN `tabMM Customer` mc ON mb.customer = mc.name
                WHERE mb.customer IS NULL
                AND ({booking_where})
                AND mb.booking_status NOT IN ('Cancelled')
                ORDER BY mb.start_datetime DESC
                LIMIT %(limit)s
            """.format(booking_where=booking_where), booking_params, as_dict=True)

        for booking in bookings:
            # Get assigned user
            assigned = frappe.db.get_value(
                "MM Meeting Booking Assigned User",
                {"parent": booking.name, "is_primary_host": 1},
                "user"
            )

            # Get department from meeting type
            department = frappe.db.get_value(
                "MM Meeting Type",
                booking.meeting_type,
                "department"
            ) if booking.meeting_type else None

            interactions.append({
                "type": "meeting",
                "date": booking.start_datetime,
                "department": department,
                "meeting_type": booking.meeting_type,
                "assigned_to": assigned,
                "status": booking.booking_status,
                "notes": booking.customer_notes,
                "id": booking.name
            })

    # Get Communication records (emails, calls, etc.)
    communications = frappe.db.sql("""
        SELECT
            name,
            communication_type,
            content,
            subject,
            creation,
            sender,
            recipients
        FROM `tabCommunication`
        WHERE reference_doctype = 'Customer'
        AND reference_name = %(customer)s
        AND communication_type IN ('Communication', 'Email', 'Call', 'Chat')
        ORDER BY creation DESC
        LIMIT %(limit)s
    """, {"customer": customer_id, "limit": limit}, as_dict=True)

    for comm in communications:
        interactions.append({
            "type": comm.communication_type.lower(),
            "date": comm.creation,
            "subject": comm.subject or f"{comm.communication_type} interaction",
            "content": (comm.content[:100] + "...") if comm.content and len(comm.content) > 100 else comm.content,
            "from": comm.sender,
            "id": comm.name
        })

    # Get Notes linked to customer (if ERPNext Notes module is being used)
    try:
        notes = frappe.get_all(
            "Note",
            filters={"reference_type": "Customer", "reference_name": customer_id},
            fields=["name", "title", "content", "creation", "owner"],
            order_by="creation desc",
            limit=limit
        )

        for note in notes:
            interactions.append({
                "type": "note",
                "date": note.creation,
                "title": note.title,
                "content": (note.content[:100] + "...") if len(note.content) > 100 else note.content,
                "created_by": note.owner,
                "id": note.name
            })
    except Exception:
        # Note doctype might not exist in all installations
        pass

    # Sort all interactions by date descending
    interactions.sort(key=lambda x: x.get("date") or "", reverse=True)

    return interactions[:limit]


@frappe.whitelist()
def get_unified_timeline(customer_id, limit=20, offset=0):
    """
    Get a unified timeline that interleaves orders with support interactions.
    Provides agents with the full customer story in one scrollable view.

    Returns events sorted by date descending, each with:
    - type: 'order', 'meeting', 'email', 'call', 'note', etc.
    - date: event timestamp
    - title: brief description
    - details: additional context
    - id: reference ID for linking

    Args:
        customer_id: Customer ID
        limit: Maximum number of events to return
        offset: Number of events to skip (for pagination)
    """
    require_login()

    limit = int(limit)
    offset = int(offset)
    # Fetch more to support pagination (offset + limit from each source)
    fetch_limit = offset + limit

    # Check if customer exists and is accessible
    if not frappe.db.exists("Customer", customer_id):
        frappe.throw(_("Customer not found"), frappe.DoesNotExistError)

    check_customer_permission(customer_id, "read")

    # Get customer details for email/phone lookup
    customer = frappe.get_doc("Customer", customer_id)
    customer_email = customer.email_id
    customer_phone = customer.mobile_no

    timeline = []

    # 1. Get Sales Orders
    orders = frappe.db.sql("""
        SELECT
            so.name,
            so.transaction_date,
            so.creation,
            so.grand_total,
            so.status,
            so.per_delivered,
            (SELECT COUNT(*) FROM `tabSales Order Item` WHERE parent = so.name) as items_count
        FROM `tabSales Order` so
        WHERE so.customer = %(customer)s
        AND so.docstatus < 2
        ORDER BY so.transaction_date DESC, so.creation DESC
        LIMIT %(fetch_limit)s
    """, {"customer": customer_id, "fetch_limit": fetch_limit}, as_dict=True)

    # Batch fetch item names for orders
    if orders:
        order_names = tuple(o.name for o in orders)
        all_items = frappe.db.sql("""
            SELECT parent, GROUP_CONCAT(DISTINCT item_name SEPARATOR ', ') as item_names_concat
            FROM `tabSales Order Item`
            WHERE parent IN %(orders)s
            GROUP BY parent
        """, {"orders": order_names}, as_dict=True)
        items_by_order = {item.parent: item.item_names_concat for item in all_items}

        for order in orders:
            item_names = items_by_order.get(order.name, "")
            if item_names:
                item_list = item_names.split(', ')[:2]
                items_preview = ", ".join(item_list)
                if len(item_names.split(', ')) > 2:
                    items_preview += f" +{len(item_names.split(', ')) - 2} more"
            else:
                items_preview = f"{order.items_count} item(s)"

            # Determine order status for display
            if order.status == "Completed":
                status_label = "Delivered"
            elif order.per_delivered == 100:
                status_label = "Delivered"
            elif order.per_delivered > 0:
                status_label = "Partially Delivered"
            else:
                status_label = order.status

            timeline.append({
                "type": "order",
                "date": order.creation,
                "title": f"Order {order.name}",
                "details": items_preview,
                "amount": flt(order.grand_total),
                "status": status_label,
                "id": order.name,
                "icon": "shopping-cart"
            })

    # 2. Get Sales Invoices
    invoices = frappe.db.sql("""
        SELECT
            name,
            posting_date,
            creation,
            grand_total,
            outstanding_amount,
            status
        FROM `tabSales Invoice`
        WHERE customer = %(customer)s
        AND docstatus = 1
        ORDER BY posting_date DESC
        LIMIT %(fetch_limit)s
    """, {"customer": customer_id, "fetch_limit": fetch_limit}, as_dict=True)

    for invoice in invoices:
        if invoice.outstanding_amount > 0:
            status_label = f"Outstanding: ${flt(invoice.outstanding_amount):,.2f}"
        else:
            status_label = "Paid"

        timeline.append({
            "type": "invoice",
            "date": invoice.creation,
            "title": f"Invoice {invoice.name}",
            "details": f"Total: ${flt(invoice.grand_total):,.2f}",
            "amount": flt(invoice.grand_total),
            "status": status_label,
            "id": invoice.name,
            "icon": "file-text"
        })

    # 3. Get Meeting Bookings (if Meeting Manager installed)
    if _meeting_manager_installed():
        # Try customer link first, then fall back to email/phone
        bookings = frappe.db.sql("""
            SELECT
                name,
                start_datetime,
                booking_status,
                customer_notes,
                meeting_type,
                created_by
            FROM `tabMM Meeting Booking`
            WHERE customer = %(customer_id)s
            AND booking_status NOT IN ('Cancelled')
            ORDER BY start_datetime DESC
            LIMIT %(fetch_limit)s
        """, {"customer_id": customer_id, "fetch_limit": fetch_limit}, as_dict=True)

        # Fall back to email/phone matching for legacy data
        if not bookings and (customer_email or customer_phone):
            booking_filters = []
            booking_params = {"fetch_limit": fetch_limit}

            if customer_email:
                booking_filters.append("customer_email_at_booking = %(email)s")
                booking_params["email"] = customer_email

            if customer_phone:
                booking_filters.append("customer_phone_at_booking = %(phone)s")
                booking_params["phone"] = customer_phone

            booking_where = " OR ".join(booking_filters) if booking_filters else "1=0"

            bookings = frappe.db.sql(f"""
                SELECT
                    name,
                    start_datetime,
                    booking_status,
                    customer_notes,
                    meeting_type,
                    created_by
                FROM `tabMM Meeting Booking`
                WHERE customer IS NULL
                AND ({booking_where})
                AND booking_status NOT IN ('Cancelled')
                ORDER BY start_datetime DESC
                LIMIT %(fetch_limit)s
            """, booking_params, as_dict=True)

        for booking in bookings:
            meeting_type_name = booking.meeting_type or "Meeting"
            # Resolve created_by to full name
            booked_by = None
            if booking.created_by:
                booked_by = frappe.db.get_value("User", booking.created_by, "full_name") or booking.created_by
            timeline.append({
                "type": "meeting",
                "date": booking.start_datetime,
                "title": f"{meeting_type_name}",
                "details": booking.customer_notes[:80] + "..." if booking.customer_notes and len(booking.customer_notes) > 80 else booking.customer_notes,
                "status": booking.booking_status,
                "id": booking.name,
                "icon": "calendar",
                "booked_by": booked_by
            })

    # 4. Get Communications (emails, calls, chats)
    communications = frappe.db.sql("""
        SELECT
            name,
            communication_type,
            subject,
            content,
            creation,
            sender
        FROM `tabCommunication`
        WHERE reference_doctype = 'Customer'
        AND reference_name = %(customer)s
        AND communication_type IN ('Communication', 'Email', 'Call', 'Chat')
        ORDER BY creation DESC
        LIMIT %(fetch_limit)s
    """, {"customer": customer_id, "fetch_limit": fetch_limit}, as_dict=True)

    for comm in communications:
        comm_type = comm.communication_type.lower()
        icon_map = {"email": "mail", "call": "phone", "chat": "message-circle", "communication": "message-square"}

        timeline.append({
            "type": comm_type,
            "date": comm.creation,
            "title": comm.subject or f"{comm.communication_type}",
            "details": (comm.content[:80] + "...") if comm.content and len(comm.content) > 80 else comm.content,
            "sender": comm.sender,
            "id": comm.name,
            "icon": icon_map.get(comm_type, "message-square")
        })

    # 5. Get Delivery Notes
    deliveries = frappe.db.sql("""
        SELECT
            name,
            posting_date,
            creation,
            lr_no as tracking_number,
            status
        FROM `tabDelivery Note`
        WHERE customer = %(customer)s
        AND docstatus = 1
        ORDER BY posting_date DESC
        LIMIT %(fetch_limit)s
    """, {"customer": customer_id, "fetch_limit": fetch_limit}, as_dict=True)

    for delivery in deliveries:
        details = f"Tracking: {delivery.tracking_number}" if delivery.tracking_number else "Shipment dispatched"
        timeline.append({
            "type": "delivery",
            "date": delivery.creation,
            "title": f"Delivery {delivery.name}",
            "details": details,
            "status": delivery.status,
            "id": delivery.name,
            "icon": "truck"
        })

    # 6. Get Support Notes
    try:
        notes = frappe.get_all(
            "Note",
            filters={"reference_type": "Customer", "reference_name": customer_id},
            fields=["name", "title", "content", "creation", "owner"],
            order_by="creation desc",
            limit=fetch_limit
        )

        for note in notes:
            timeline.append({
                "type": "note",
                "date": note.creation,
                "title": note.title or "Support Note",
                "details": (note.content[:80] + "...") if note.content and len(note.content) > 80 else note.content,
                "created_by": note.owner,
                "id": note.name,
                "icon": "edit-3"
            })
    except Exception:
        pass

    # Sort all events by date descending
    timeline.sort(key=lambda x: x.get("date") or "", reverse=True)

    # Apply pagination (offset and limit)
    return timeline[offset:offset + limit]


@frappe.whitelist()
def create_quick_note(customer_id, note_content):
    """
    Create a support note linked to customer
    Uses Communication doctype which exists in all Frappe installations
    """

    if not note_content or not note_content.strip():
        frappe.throw(_("Note content cannot be empty"))

    # Check if customer exists
    if not frappe.db.exists("Customer", customer_id):
        frappe.throw(_("Customer not found"), frappe.DoesNotExistError)

    # Create a Communication record (more universal than Note)
    comm = frappe.get_doc({
        "doctype": "Communication",
        "communication_type": "Communication",
        "communication_medium": "Other",
        "subject": f"Support Note - {now_datetime().strftime('%Y-%m-%d %H:%M')}",
        "content": note_content,
        "reference_doctype": "Customer",
        "reference_name": customer_id,
        "sent_or_received": "Sent",
        "sender": frappe.session.user
    })

    comm.insert(ignore_permissions=False)
    frappe.db.commit()

    return {
        "success": True,
        "note_id": comm.name
    }


@frappe.whitelist()
def get_ticket_options():
    """
    Fetch HD Ticket Type, HD Ticket Priority, and HD Team lists
    for the Create Ticket modal dropdowns.
    """
    require_login()

    ticket_types = frappe.get_all("HD Ticket Type", pluck="name", order_by="name asc")
    priorities = frappe.get_all("HD Ticket Priority", pluck="name", order_by="integer_value asc")
    teams = frappe.get_all("HD Team", pluck="name", order_by="name asc")

    return {
        "ticket_types": ticket_types,
        "priorities": priorities,
        "teams": teams
    }


@frappe.whitelist()
def get_team_options(team):
    """
    Fetch folders and agents for a specific HD Team.
    Called when the team dropdown changes.
    """
    require_login()

    if not team:
        return {"folders": [], "agents": []}

    folder_list = frappe.get_all(
        "HD Team Folder",
        filters={"team": team},
        fields=["name", "folder_name"],
        order_by="folder_name asc"
    )
    folders = [{"id": f.name, "name": f.folder_name} for f in folder_list]

    # Get team members (HD Agent linked to this team)
    agents = []
    team_members = frappe.get_all(
        "HD Team Member",
        filters={"parent": team, "parenttype": "HD Team"},
        pluck="user"
    )
    if team_members:
        agent_list = frappe.get_all(
            "HD Agent",
            filters={"name": ("in", team_members), "is_active": 1},
            fields=["name", "agent_name"],
            order_by="agent_name asc"
        )
        agents = [{"id": a.name, "name": a.agent_name or a.name} for a in agent_list]

    return {"folders": folders, "agents": agents}


@frappe.whitelist()
def create_hd_ticket(customer_email, customer_name, subject, description='',
                     ticket_type='', priority='', agent_group='',
                     team_folder='', assignee=''):
    """
    Create an HD Ticket from the Support Center.

    Sets raised_by to the customer's email so Helpdesk's before_validate
    hooks auto-resolve the Contact and HD Customer from the email.
    """
    require_login()

    if not subject or not subject.strip():
        frappe.throw(_("Ticket subject is required"))

    doc = {
        "doctype": "HD Ticket",
        "subject": subject.strip(),
        "description": description or "",
        "via_customer_portal": False,
    }

    if customer_email:
        doc["raised_by"] = customer_email

    if ticket_type:
        doc["ticket_type"] = ticket_type
    if priority:
        doc["priority"] = priority
    if agent_group:
        doc["agent_group"] = agent_group
    if team_folder:
        doc["team_folder"] = team_folder

    ticket = frappe.get_doc(doc).insert()

    # Assign agent after creation (uses Frappe's assign_to mechanism)
    if assignee:
        from frappe.desk.form.assign_to import add as assign_to
        assign_to({
            "doctype": "HD Ticket",
            "name": ticket.name,
            "assign_to": [assignee],
        })

    return {
        "ticket_id": ticket.name,
        "status": ticket.status,
        "subject": ticket.subject
    }


@frappe.whitelist()
def get_customer_by_email(email):
    """
    Quick lookup customer by email
    Used for auto-linking when creating bookings
    """

    if not email:
        return None

    customer = frappe.db.get_value(
        "Customer",
        {"email_id": email, "disabled": 0},
        ["name", "customer_name", "mobile_no", "customer_group"],
        as_dict=True
    )

    return customer


@frappe.whitelist()
def get_customer_by_phone(phone):
    """
    Quick lookup customer by phone
    Used for auto-linking when creating bookings
    """

    if not phone:
        return None

    customer = frappe.db.get_value(
        "Customer",
        {"mobile_no": phone, "disabled": 0},
        ["name", "customer_name", "email_id", "customer_group"],
        as_dict=True
    )

    return customer


@frappe.whitelist()
def get_booking_details(booking_id):
    """
    Get full meeting booking profile with related data
    """
    require_login()

    if not _meeting_manager_installed():
        frappe.throw(_("Meeting Manager is not installed"), frappe.DoesNotExistError)

    # Check if booking exists
    if not frappe.db.exists("MM Meeting Booking", booking_id):
        frappe.throw(_("Meeting booking not found"), frappe.DoesNotExistError)

    # Check permission
    check_booking_permission(booking_id, "read")

    # Get booking data
    booking = frappe.get_doc("MM Meeting Booking", booking_id)

    # Get meeting type details
    meeting_type_data = None
    if booking.meeting_type:
        meeting_type_data = frappe.db.get_value(
            "MM Meeting Type",
            booking.meeting_type,
            ["name", "meeting_name", "duration", "department", "location_type", "custom_location"],
            as_dict=True
        )
        # Rename fields for consistency in frontend
        if meeting_type_data:
            meeting_type_data["title"] = meeting_type_data.pop("meeting_name", None)
            meeting_type_data["location"] = meeting_type_data.get("custom_location") or meeting_type_data.get("location_type")

    # Get assigned users
    assigned_users = []
    if hasattr(booking, 'assigned_users') and booking.assigned_users:
        for user in booking.assigned_users:
            user_info = frappe.db.get_value(
                "User",
                user.user,
                ["full_name", "email"],
                as_dict=True
            )
            assigned_users.append({
                "user": user.user,
                "full_name": user_info.full_name if user_info else user.user,
                "email": user_info.email if user_info else None,
                "is_primary_host": user.is_primary_host
            })

    # Get other bookings by same customer
    other_bookings = []

    # Safely get optional fields that may not exist in all versions
    # Try _at_booking fields first (production), fall back to direct fields (dev)
    customer_email = getattr(booking, 'customer_email_at_booking', None) or getattr(booking, 'customer_email', None)
    customer_phone = getattr(booking, 'customer_phone_at_booking', None) or getattr(booking, 'customer_phone', None)
    customer_name = getattr(booking, 'customer_name', None)

    # First try using the customer link field (most reliable)
    if getattr(booking, 'customer', None):
        other_bookings = frappe.db.sql("""
            SELECT
                name,
                start_datetime,
                booking_status,
                meeting_type
            FROM `tabMM Meeting Booking`
            WHERE customer = %(customer)s
            AND name != %(current)s
            ORDER BY start_datetime DESC
            LIMIT %(limit)s
        """, {"customer": booking.customer, "current": booking_id, "limit": 5}, as_dict=True)

    # Get linked ERPNext customer - use the link field first
    linked_customer = None
    if getattr(booking, 'customer', None):
        # Use the direct link
        linked_customer = frappe.db.get_value(
            "Customer",
            booking.customer,
            ["name", "customer_name"],
            as_dict=True
        )

    # Get linked contact - use the link field first
    linked_contact = None
    if getattr(booking, 'contact', None):
        linked_contact = frappe.db.get_value(
            "Contact",
            booking.contact,
            ["name", "first_name", "last_name", "email_id", "mobile_no"],
            as_dict=True
        )
        if linked_contact:
            linked_contact["full_name"] = f"{linked_contact.get('first_name', '')} {linked_contact.get('last_name', '')}".strip()
            # Use contact info if booking doesn't have direct fields
            if not customer_email:
                customer_email = linked_contact.get('email_id')
            if not customer_phone:
                customer_phone = linked_contact.get('mobile_no')

    return {
        "booking_id": booking.name,
        "customer_name": customer_name,
        "customer_email": customer_email,
        "customer_phone": customer_phone,
        "customer_notes": getattr(booking, 'customer_notes', None),
        "booking_status": getattr(booking, 'booking_status', None),
        "start_datetime": getattr(booking, 'start_datetime', None),
        "end_datetime": getattr(booking, 'end_datetime', None),
        "meeting_type": getattr(booking, 'meeting_type', None),
        "meeting_type_data": meeting_type_data,
        "assigned_users": assigned_users,
        "creation": booking.creation,
        "modified": booking.modified,
        "other_bookings": other_bookings,
        "linked_customer": linked_customer,
        "linked_contact": linked_contact,
        "customer_link": getattr(booking, 'customer', None),
        "contact_link": getattr(booking, 'contact', None),
        "total_bookings": len(other_bookings) + 1
    }


@frappe.whitelist()
def get_contact_details(contact_id):
    """
    Get full contact profile with related data
    """
    require_login()

    # Check if contact exists
    if not frappe.db.exists("Contact", contact_id):
        frappe.throw(_("Contact not found"), frappe.DoesNotExistError)

    # Check permission
    check_contact_permission(contact_id, "read")

    # Get contact data
    contact = frappe.get_doc("Contact", contact_id)

    # Get linked companies/customers via Dynamic Link
    linked_records = frappe.db.sql("""
        SELECT
            link_doctype,
            link_name
        FROM `tabDynamic Link`
        WHERE parent = %(contact)s
        AND parenttype = 'Contact'
    """, {"contact": contact_id}, as_dict=True)

    # Get meeting bookings by this contact (if Meeting Manager installed)
    bookings = []
    if _meeting_manager_installed():
        # Use the contact link field to find bookings
        bookings = frappe.db.sql("""
            SELECT
                name,
                start_datetime,
                booking_status,
                meeting_type
            FROM `tabMM Meeting Booking`
            WHERE contact = %(contact)s
            ORDER BY start_datetime DESC
            LIMIT %(limit)s
        """, {"contact": contact_id, "limit": 5}, as_dict=True)

    # Get communications for this contact
    communications = frappe.db.sql("""
        SELECT
            name,
            communication_type,
            subject,
            creation,
            sender
        FROM `tabCommunication`
        WHERE reference_doctype = 'Contact'
        AND reference_name = %(contact)s
        ORDER BY creation DESC
        LIMIT 10
    """, {"contact": contact_id}, as_dict=True)

    return {
        "contact_id": contact.name,
        "name": f"{contact.first_name or ''} {contact.last_name or ''}".strip() or contact.name,
        "first_name": contact.first_name,
        "last_name": contact.last_name,
        "email": contact.email_id,
        "phone": contact.mobile_no or contact.phone,
        "mobile_no": contact.mobile_no,
        "company_name": contact.company_name,
        "designation": contact.designation,
        "department": contact.department,
        "is_primary_contact": contact.is_primary_contact,
        "creation": contact.creation,
        "modified": contact.modified,
        "linked_records": linked_records,
        "bookings": bookings,
        "communications": communications,
        "total_bookings": len(bookings)
    }


@frappe.whitelist()
def get_user_details(user_id):
    """
    Get full system user profile with related data
    """
    require_login()

    # Check if user exists
    if not frappe.db.exists("User", user_id):
        frappe.throw(_("User not found"), frappe.DoesNotExistError)

    # Check permission
    check_user_permission(user_id, "read")

    # Get user data
    user = frappe.get_doc("User", user_id)

    # Get meeting bookings by this user's email (if Meeting Manager installed)
    bookings = []
    hosted_meetings = []

    if _meeting_manager_installed():
        if user.email:
            bookings = frappe.db.sql("""
                SELECT
                    mb.name,
                    mc.customer_name,
                    mb.start_datetime,
                    mb.booking_status,
                    mb.meeting_type
                FROM `tabMM Meeting Booking` mb
                LEFT JOIN `tabMM Customer` mc ON mb.customer = mc.name
                WHERE mb.customer_email_at_booking = %(email)s
                ORDER BY mb.start_datetime DESC
                LIMIT 5
            """, {"email": user.email}, as_dict=True)

        # Get meetings where user is assigned as host
        hosted_meetings = frappe.db.sql("""
            SELECT
                mb.name,
                mc.customer_name,
                mb.start_datetime,
                mb.booking_status,
                mb.meeting_type,
                mbu.is_primary_host
            FROM `tabMM Meeting Booking` mb
            LEFT JOIN `tabMM Customer` mc ON mb.customer = mc.name
            INNER JOIN `tabMM Meeting Booking Assigned User` mbu ON mbu.parent = mb.name
            WHERE mbu.user = %(user)s
            ORDER BY mb.start_datetime DESC
            LIMIT 10
        """, {"user": user_id}, as_dict=True)

    # Check if user is linked to a customer
    linked_customer = frappe.db.get_value(
        "Customer",
        {"email_id": user.email, "disabled": 0},
        ["name", "customer_name"],
        as_dict=True
    ) if user.email else None

    # Get user roles
    roles = [r.role for r in user.roles] if hasattr(user, 'roles') else []

    return {
        "user_id": user.name,
        "name": user.full_name or user.email,
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.mobile_no,
        "user_type": user.user_type,
        "enabled": user.enabled,
        "creation": user.creation,
        "last_login": user.last_login,
        "last_active": user.last_active,
        "roles": roles,
        "bookings": bookings,
        "hosted_meetings": hosted_meetings,
        "linked_customer": linked_customer,
        "total_bookings": len(bookings),
        "total_hosted": len(hosted_meetings)
    }


@frappe.whitelist()
def create_customer_from_booking(booking_id):
    """
    Create a new ERPNext Customer from a Meeting Booking's customer details.
    Links the booking to the newly created customer.

    Returns the new customer ID and name.
    """
    require_login()

    if not _meeting_manager_installed():
        frappe.throw(_("Meeting Manager is not installed"), frappe.DoesNotExistError)

    if not frappe.db.exists("MM Meeting Booking", booking_id):
        frappe.throw(_("Meeting booking not found"), frappe.DoesNotExistError)

    # Check permission to read the booking and create customers
    check_booking_permission(booking_id, "read")
    if not frappe.has_permission("Customer", "create"):
        frappe.throw(_("You don't have permission to create customers"), frappe.PermissionError)

    booking = frappe.get_doc("MM Meeting Booking", booking_id)

    # Check if booking already has a linked customer
    if getattr(booking, 'customer', None):
        frappe.throw(_("This booking is already linked to a customer: {0}").format(booking.customer))

    # Safely get optional fields that may not exist in all versions
    customer_name = getattr(booking, 'customer_name', None)
    customer_email = getattr(booking, 'customer_email_at_booking', None) or getattr(booking, 'customer_email', None)
    customer_phone = getattr(booking, 'customer_phone_at_booking', None) or getattr(booking, 'customer_phone', None)

    # Validate required fields
    if not customer_name:
        frappe.throw(_("Booking must have a customer name to create a customer"))

    # Check if a customer with this email already exists
    if customer_email:
        existing = frappe.db.get_value(
            "Customer",
            {"email_id": customer_email, "disabled": 0},
            "name"
        )
        if existing:
            frappe.throw(
                _("A customer with email {0} already exists: {1}. Use 'Link to Customer' instead.").format(
                    customer_email, existing
                )
            )

    # Create the new customer
    customer = frappe.get_doc({
        "doctype": "Customer",
        "customer_name": customer_name,
        "customer_type": "Individual",  # Default to Individual, can be changed later
        "email_id": customer_email,
        "mobile_no": customer_phone,
    })

    customer.insert(ignore_permissions=False)

    # Link the booking to the new customer
    booking.customer = customer.name
    booking.save(ignore_permissions=False)

    frappe.db.commit()

    return {
        "success": True,
        "customer_id": customer.name,
        "customer_name": customer.customer_name,
        "message": f"Customer '{customer.customer_name}' created and linked to booking"
    }


@frappe.whitelist()
def link_booking_to_customer(booking_id, customer_id):
    """
    Link an existing Meeting Booking to an existing ERPNext Customer.

    Args:
        booking_id: The MM Meeting Booking ID
        customer_id: The ERPNext Customer ID to link to
    """
    require_login()

    if not _meeting_manager_installed():
        frappe.throw(_("Meeting Manager is not installed"), frappe.DoesNotExistError)

    if not frappe.db.exists("MM Meeting Booking", booking_id):
        frappe.throw(_("Meeting booking not found"), frappe.DoesNotExistError)

    if not frappe.db.exists("Customer", customer_id):
        frappe.throw(_("Customer not found"), frappe.DoesNotExistError)

    # Check permissions - need write on booking and read on customer
    check_booking_permission(booking_id, "write")
    check_customer_permission(customer_id, "read")

    # Check if customer is disabled
    if frappe.db.get_value("Customer", customer_id, "disabled"):
        frappe.throw(_("Cannot link to a disabled customer"))

    booking = frappe.get_doc("MM Meeting Booking", booking_id)

    # Update the link
    old_customer = booking.customer
    booking.customer = customer_id
    booking.save(ignore_permissions=False)

    frappe.db.commit()

    customer_name = frappe.db.get_value("Customer", customer_id, "customer_name")

    return {
        "success": True,
        "booking_id": booking_id,
        "customer_id": customer_id,
        "customer_name": customer_name,
        "previous_customer": old_customer,
        "message": f"Booking linked to customer '{customer_name}'"
    }


@frappe.whitelist()
def unlink_booking_from_customer(booking_id):
    """
    Remove the customer link from a Meeting Booking.

    Args:
        booking_id: The MM Meeting Booking ID
    """
    require_login()

    if not _meeting_manager_installed():
        frappe.throw(_("Meeting Manager is not installed"), frappe.DoesNotExistError)

    if not frappe.db.exists("MM Meeting Booking", booking_id):
        frappe.throw(_("Meeting booking not found"), frappe.DoesNotExistError)

    # Check permission
    check_booking_permission(booking_id, "write")

    booking = frappe.get_doc("MM Meeting Booking", booking_id)

    if not booking.customer:
        frappe.throw(_("This booking is not linked to any customer"))

    old_customer = booking.customer
    booking.customer = None
    booking.save(ignore_permissions=False)

    frappe.db.commit()

    return {
        "success": True,
        "booking_id": booking_id,
        "previous_customer": old_customer,
        "message": "Customer link removed from booking"
    }


@frappe.whitelist()
def search_customers_for_linking(query, limit=10):
    """
    Search for customers to link to a booking.
    Returns a simplified list suitable for a dropdown/autocomplete.

    Args:
        query: Search term (name, email, or phone)
        limit: Maximum results to return
    """
    if not query or len(query) < 2:
        return []

    limit = int(limit)
    query_param = f"%{query}%"

    # For phone number search, also try without special characters
    phone_query = query.replace("-", "").replace(" ", "").replace("(", "").replace(")", "")
    phone_param = f"%{phone_query}%"

    customers = frappe.db.sql("""
        SELECT
            name,
            customer_name,
            email_id,
            mobile_no
        FROM `tabCustomer`
        WHERE
            (customer_name LIKE %(query)s
            OR email_id LIKE %(query)s
            OR mobile_no LIKE %(query)s
            OR REPLACE(REPLACE(REPLACE(REPLACE(mobile_no, '-', ''), ' ', ''), '(', ''), ')', '') LIKE %(phone_query)s
            OR name LIKE %(query)s)
            AND disabled = 0
        ORDER BY modified DESC
        LIMIT %(limit)s
    """, {"query": query_param, "phone_query": phone_param, "limit": limit}, as_dict=True)

    return [
        {
            "id": c.name,
            "name": c.customer_name,
            "email": c.email_id,
            "phone": c.mobile_no,
            "label": f"{c.customer_name} ({c.email_id or c.mobile_no or c.name})"
        }
        for c in customers
    ]


@frappe.whitelist()
def get_order_details(order_id):
    """
    Get detailed information about a Sales Order for the order detail modal.

    Args:
        order_id: The Sales Order name/ID

    Returns:
        dict with order details including items, customer info, payment info
        Structured to match the expected format in support-dashboard.js
    """
    if not order_id:
        frappe.throw("Order ID is required")

    # Get the sales order
    order = frappe.get_doc("Sales Order", order_id)

    # Get order items
    items = []
    for item in order.items:
        item_data = {
            "item_code": item.item_code,
            "item_name": item.item_name,
            "description": item.description or "",
            "qty": item.qty,
            "rate": item.rate,
            "amount": item.amount,
            "uom": item.uom,
            "image": None
        }

        # Try to get item image
        try:
            item_doc = frappe.get_doc("Item", item.item_code)
            item_data["image"] = item_doc.image
        except Exception:
            pass

        # Calculate discount if any
        if item.discount_percentage:
            item_data["discount_percentage"] = item.discount_percentage
            item_data["discount_display"] = f"-{item.discount_percentage}%"
        elif item.discount_amount:
            item_data["discount_amount"] = item.discount_amount
            item_data["discount_display"] = f"-{frappe.format_value(item.discount_amount, {'fieldtype': 'Currency'})}"
        else:
            item_data["discount_display"] = ""

        items.append(item_data)

    # Get billing address info
    billing_address_display = ""
    if order.customer_address:
        try:
            addr = frappe.get_doc("Address", order.customer_address)
            lines = [
                addr.address_line1 or "",
                addr.address_line2 or "",
                f"{addr.city or ''}, {addr.state or ''} {addr.pincode or ''}".strip(", "),
                addr.country or ""
            ]
            billing_address_display = "<br>".join([l for l in lines if l.strip()])
        except Exception:
            billing_address_display = order.customer_address

    # Get shipping address info
    shipping_address_display = ""
    if order.shipping_address_name:
        try:
            addr = frappe.get_doc("Address", order.shipping_address_name)
            lines = [
                addr.address_line1 or "",
                addr.address_line2 or "",
                f"{addr.city or ''}, {addr.state or ''} {addr.pincode or ''}".strip(", "),
                addr.country or ""
            ]
            shipping_address_display = "<br>".join([l for l in lines if l.strip()])
        except Exception:
            shipping_address_display = order.shipping_address_name

    # Build response in the expected nested structure
    return {
        "order_id": order.name,
        "customer": order.customer,
        "customer_name": order.customer_name,
        "transaction_date": str(order.transaction_date) if order.transaction_date else None,
        "delivery_date": str(order.delivery_date) if order.delivery_date else None,
        "status": order.status,
        "docstatus": order.docstatus,
        "currency": order.currency,

        # Items
        "items": items,
        "total_qty": order.total_qty,

        # Pricing (nested structure expected by JS)
        "pricing": {
            "subtotal": order.total or 0,
            "net_total": order.net_total or 0,
            "grand_total": order.grand_total or 0,
            "total_taxes": order.total_taxes_and_charges or 0,
            "discount_amount": order.discount_amount or 0,
        },

        # Billing info (nested structure expected by JS)
        "billing": {
            "address_display": billing_address_display,
            "contact_display": order.contact_display if hasattr(order, 'contact_display') else order.contact_person,
            "contact_person": order.contact_person,
            "contact_email": order.contact_email,
            "contact_phone": order.contact_phone,
            "contact_mobile": order.contact_mobile if hasattr(order, 'contact_mobile') else None,
        },

        # Shipping info (nested structure expected by JS)
        "shipping": {
            "address_display": shipping_address_display,
        },

        # Payment info (nested structure expected by JS)
        "payment": {
            "payment_terms_template": order.payment_terms_template,
            "advance_paid": order.advance_paid or 0,
        },

        # Custom fields (nested structure expected by JS)
        "custom_fields": {
            "custom_salesperson": getattr(order, "custom_salesperson", None),
            "custom_booker": getattr(order, "custom_booker", None),
            "custom_order_type": getattr(order, "custom_order_type", None),
            "custom_product": getattr(order, "custom_product", None),
            "custom_trend_micro_seats": getattr(order, "custom_trend_micro_seats", None),
            "custom_lead": getattr(order, "custom_lead", None),
            "custom_previous_order": getattr(order, "custom_previous_order", None),
            "custom_company_reg_number": getattr(order, "custom_company_reg_number", None),
            "custom_external_invoice_number": getattr(order, "custom_external_invoice_number", None),
            "custom_bank_payment_status": getattr(order, "custom_bank_payment_status", None),
            "custom_deferred_payment_date": str(getattr(order, "custom_deferred_payment_date", None)) if getattr(order, "custom_deferred_payment_date", None) else None,
            "custom_vip_customer": getattr(order, "custom_vip_customer", 0),
            "custom_complaint_case": getattr(order, "custom_complaint_case", 0),
        },
    }


@frappe.whitelist()
def get_user_options():
    """
    Get list of users for dropdowns in order detail modal (salesperson, booker).

    Returns:
        list of user options with id and label
    """
    users = frappe.get_all(
        "User",
        filters={
            "enabled": 1,
            "user_type": "System User"
        },
        fields=["name", "full_name"],
        order_by="full_name asc"
    )

    return [
        {
            "id": u.name,
            "label": u.full_name or u.name
        }
        for u in users
    ]


@frappe.whitelist()
def update_order_custom_fields(order_id, fields):
    """
    Update custom fields on a Sales Order.

    Args:
        order_id: The Sales Order name/ID
        fields: dict of field names and values to update

    Returns:
        dict with success status
    """
    import json

    if not order_id:
        frappe.throw("Order ID is required")

    if isinstance(fields, str):
        fields = json.loads(fields)

    # Get the order
    order = frappe.get_doc("Sales Order", order_id)

    # Update allowed custom fields
    allowed_fields = [
        "custom_salesperson",
        "custom_booker",
        "custom_order_type",
        "custom_product",
        "custom_trend_micro_seats",
        "custom_lead",
        "custom_previous_order",
        "custom_company_reg_number",
        "custom_external_invoice_number",
        "custom_bank_payment_status",
        "custom_deferred_payment_date",
        "custom_vip_customer",
        "custom_complaint_case"
    ]

    for field, value in fields.items():
        if field in allowed_fields:
            # Handle empty strings for date fields
            if field == "custom_deferred_payment_date" and value == "":
                value = None
            setattr(order, field, value)

    order.save(ignore_permissions=True)

    return {
        "success": True,
        "message": "Order updated successfully"
    }


@frappe.whitelist()
def get_ticket_details(ticket_id):
    """
    Get full support ticket (Issue) profile with related data.

    Args:
        ticket_id: The Issue doctype name/ID

    Returns:
        dict with ticket details, linked customer, related tickets, and comments
    """
    require_login()

    # Check if ticket exists
    if not frappe.db.exists("Issue", ticket_id):
        frappe.throw(_("Support ticket not found"), frappe.DoesNotExistError)

    # Check permission
    check_ticket_permission(ticket_id, "read")

    # Get ticket data
    ticket = frappe.get_doc("Issue", ticket_id)

    # Get linked customer if exists
    linked_customer = None
    if ticket.customer:
        linked_customer = frappe.db.get_value(
            "Customer",
            ticket.customer,
            ["name", "customer_name", "email_id", "mobile_no"],
            as_dict=True
        )

    # Get related tickets (other tickets from same customer or raised_by email)
    related_tickets = []
    if ticket.customer:
        related_tickets = frappe.db.sql("""
            SELECT name, subject, status, priority, opening_date
            FROM `tabIssue`
            WHERE customer = %(customer)s
            AND name != %(current)s
            ORDER BY opening_date DESC
            LIMIT 5
        """, {"customer": ticket.customer, "current": ticket_id}, as_dict=True)
    elif ticket.raised_by:
        related_tickets = frappe.db.sql("""
            SELECT name, subject, status, priority, opening_date
            FROM `tabIssue`
            WHERE raised_by = %(email)s
            AND name != %(current)s
            ORDER BY opening_date DESC
            LIMIT 5
        """, {"email": ticket.raised_by, "current": ticket_id}, as_dict=True)

    # Get comments/activity from Communication doctype
    comments = frappe.db.sql("""
        SELECT
            name,
            communication_type,
            subject,
            content,
            sender,
            creation,
            sent_or_received
        FROM `tabCommunication`
        WHERE reference_doctype = 'Issue'
        AND reference_name = %(ticket)s
        ORDER BY creation DESC
        LIMIT 20
    """, {"ticket": ticket_id}, as_dict=True)

    # Format comments for display
    formatted_comments = []
    for comm in comments:
        formatted_comments.append({
            "id": comm.name,
            "type": comm.communication_type,
            "subject": comm.subject,
            "content": comm.content,
            "sender": comm.sender,
            "date": comm.creation,
            "direction": comm.sent_or_received
        })

    return {
        "ticket_id": ticket.name,
        "subject": ticket.subject,
        "status": ticket.status,
        "priority": ticket.priority,
        "issue_type": ticket.issue_type,
        "description": ticket.description,
        "resolution_details": ticket.resolution_details,
        "raised_by": ticket.raised_by,
        "customer": ticket.customer,
        "customer_name": ticket.customer_name,
        "contact": ticket.contact,
        "opening_date": ticket.opening_date,
        "opening_time": ticket.opening_time,
        "resolution_time": ticket.resolution_time,
        "first_responded_on": ticket.first_responded_on,
        "creation": ticket.creation,
        "modified": ticket.modified,
        "linked_customer": linked_customer,
        "related_tickets": related_tickets,
        "comments": formatted_comments,
        "total_related": len(related_tickets)
    }


@frappe.whitelist()
def get_customer_tickets(customer_id, limit=10, offset=0):
    """
    Get support tickets for a customer.

    Args:
        customer_id: Customer ID
        limit: Maximum number of tickets to return
        offset: Number of tickets to skip (for pagination)

    Returns:
        list of tickets with basic info
    """
    require_login()

    limit = int(limit)
    offset = int(offset)

    # Check if customer exists
    if not frappe.db.exists("Customer", customer_id):
        frappe.throw(_("Customer not found"), frappe.DoesNotExistError)

    check_customer_permission(customer_id, "read")

    tickets = frappe.db.sql("""
        SELECT
            name, subject, status, priority, issue_type,
            opening_date, resolution_time, raised_by
        FROM `tabIssue`
        WHERE customer = %(customer)s
        ORDER BY opening_date DESC
        LIMIT %(limit)s OFFSET %(offset)s
    """, {"customer": customer_id, "limit": limit, "offset": offset}, as_dict=True)

    return tickets
