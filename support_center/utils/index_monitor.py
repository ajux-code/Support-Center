"""
Index Monitor - Verify and monitor database indexes for retention dashboard

Usage:
    # Check if all indexes exist
    bench execute support_center.utils.index_monitor.verify_indexes

    # Get index statistics and usage
    bench execute support_center.utils.index_monitor.get_index_statistics

    # Analyze slow queries
    bench execute support_center.utils.index_monitor.analyze_slow_queries
"""

import frappe
from frappe import _


def verify_indexes():
    """
    Verify that all required retention dashboard indexes exist
    Returns a report of missing indexes
    """
    required_indexes = [
        {
            "table": "tabSales Order",
            "index": "idx_customer_docstatus_date",
            "columns": ["customer", "docstatus", "transaction_date"]
        },
        {
            "table": "tabSales Order",
            "index": "idx_customer_docstatus_total",
            "columns": ["customer", "docstatus", "grand_total"]
        },
        {
            "table": "tabSales Order",
            "index": "idx_customer_order_type",
            "columns": ["customer", "custom_order_type"]
        },
        {
            "table": "tabSales Order",
            "index": "idx_docstatus_type_date",
            "columns": ["docstatus", "custom_order_type", "transaction_date"]
        },
        {
            "table": "tabSubscription",
            "index": "idx_party_status_enddate",
            "columns": ["party_type", "party", "status", "end_date"]
        },
        {
            "table": "tabSubscription",
            "index": "idx_status_enddate",
            "columns": ["status", "end_date"]
        },
        {
            "table": "tabCustomer",
            "index": "idx_disabled_group",
            "columns": ["disabled", "customer_group"]
        },
        {
            "table": "tabCustomer",
            "index": "idx_disabled_territory",
            "columns": ["disabled", "territory"]
        },
    ]

    print("\n" + "="*70)
    print("RETENTION DASHBOARD INDEX VERIFICATION")
    print("="*70 + "\n")

    missing_indexes = []
    existing_indexes = []

    for index_info in required_indexes:
        table = index_info['table']
        index = index_info['index']
        columns = index_info['columns']

        exists = check_index_exists(table, index)

        if exists:
            existing_indexes.append(index_info)
            print(f"✓ {table}.{index}")
            print(f"  Columns: {', '.join(columns)}")
        else:
            missing_indexes.append(index_info)
            print(f"✗ {table}.{index} - MISSING")
            print(f"  Columns: {', '.join(columns)}")
        print()

    # Summary
    print("="*70)
    print(f"Summary: {len(existing_indexes)}/{len(required_indexes)} indexes exist")
    print("="*70 + "\n")

    if missing_indexes:
        print("⚠️  MISSING INDEXES DETECTED")
        print("\nTo create missing indexes, run:")
        print("bench execute support_center.patches.add_retention_dashboard_indexes.execute\n")
        return False
    else:
        print("✓ All required indexes are present!")
        return True


def check_index_exists(table_name, index_name):
    """Check if an index exists"""
    try:
        result = frappe.db.sql(f"""
            SELECT COUNT(*) as count
            FROM information_schema.statistics
            WHERE table_schema = DATABASE()
            AND table_name = '{table_name}'
            AND index_name = '{index_name}'
        """, as_dict=True)

        return result[0].count > 0 if result else False
    except Exception as e:
        frappe.logger().error(f"Error checking index: {str(e)}")
        return False


def get_index_statistics():
    """
    Get statistics about index usage
    Requires MySQL performance schema to be enabled
    """
    print("\n" + "="*70)
    print("INDEX USAGE STATISTICS")
    print("="*70 + "\n")

    try:
        # Check if performance schema is enabled
        perf_schema_check = frappe.db.sql("""
            SELECT @@global.performance_schema as enabled
        """, as_dict=True)

        if not perf_schema_check[0].enabled:
            print("⚠️  Performance Schema is not enabled.")
            print("To enable it, add this to your MySQL config (my.cnf):")
            print("  [mysqld]")
            print("  performance_schema = ON\n")
            return

        # Get index usage stats for retention dashboard tables
        tables = ['tabSales Order', 'tabSubscription', 'tabCustomer']

        for table in tables:
            print(f"\n📊 {table}")
            print("-" * 70)

            stats = frappe.db.sql(f"""
                SELECT
                    index_name,
                    COUNT_STAR as uses,
                    COUNT_READ as reads,
                    COUNT_FETCH as fetches,
                    ROUND(SUM_TIMER_WAIT/1000000000000, 2) as total_time_sec
                FROM performance_schema.table_io_waits_summary_by_index_usage
                WHERE object_schema = DATABASE()
                AND object_name = '{table}'
                AND index_name IS NOT NULL
                ORDER BY COUNT_STAR DESC
                LIMIT 10
            """, as_dict=True)

            if stats:
                for stat in stats:
                    print(f"  {stat.index_name}")
                    print(f"    Uses: {stat.uses:,} | Reads: {stat.reads:,} | Time: {stat.total_time_sec}s")
            else:
                print("  No usage data available (tables may not have been queried yet)")
            print()

    except Exception as e:
        print(f"✗ Error getting index statistics: {str(e)}")
        print("\nNote: This feature requires MySQL 5.6+ with Performance Schema enabled.")


def analyze_slow_queries():
    """
    Analyze slow queries related to retention dashboard
    """
    print("\n" + "="*70)
    print("SLOW QUERY ANALYSIS")
    print("="*70 + "\n")

    try:
        # Check if slow query log is enabled
        slow_log_check = frappe.db.sql("""
            SHOW VARIABLES LIKE 'slow_query_log'
        """, as_dict=True)

        if not slow_log_check or slow_log_check[0].Value != 'ON':
            print("⚠️  Slow query log is not enabled.")
            print("\nTo enable it, run:")
            print("  SET GLOBAL slow_query_log = 'ON';")
            print("  SET GLOBAL long_query_time = 2;  # Log queries taking >2 seconds\n")
            return

        print("✓ Slow query log is enabled")

        # Show current long query time threshold
        threshold = frappe.db.sql("""
            SHOW VARIABLES LIKE 'long_query_time'
        """, as_dict=True)

        if threshold:
            print(f"  Threshold: {threshold[0].Value} seconds\n")

        # Get queries that are currently running slowly
        print("Currently running queries:")
        print("-" * 70)

        processes = frappe.db.sql("""
            SELECT
                ID,
                USER,
                TIME as duration_sec,
                STATE,
                LEFT(INFO, 100) as query_preview
            FROM information_schema.PROCESSLIST
            WHERE COMMAND != 'Sleep'
            AND TIME > 1
            AND DB = DATABASE()
            ORDER BY TIME DESC
            LIMIT 5
        """, as_dict=True)

        if processes:
            for proc in processes:
                print(f"\n  Process ID: {proc.ID}")
                print(f"  Duration: {proc.duration_sec}s")
                print(f"  State: {proc.STATE}")
                print(f"  Query: {proc.query_preview}...")
        else:
            print("  No slow queries currently running ✓")

        print("\n")

    except Exception as e:
        print(f"✗ Error analyzing slow queries: {str(e)}")


def benchmark_query(query, iterations=5):
    """
    Benchmark a query execution time

    Args:
        query: SQL query to benchmark
        iterations: Number of times to run the query

    Returns:
        dict with min, max, avg execution time in seconds
    """
    import time

    times = []

    for i in range(iterations):
        start = time.time()
        frappe.db.sql(query)
        end = time.time()
        times.append(end - start)

    return {
        "min": min(times),
        "max": max(times),
        "avg": sum(times) / len(times),
        "iterations": iterations
    }


def compare_query_performance():
    """
    Compare query performance before/after indexes
    This helps quantify the performance improvement
    """
    print("\n" + "="*70)
    print("QUERY PERFORMANCE BENCHMARK")
    print("="*70 + "\n")

    # Test query 1: Get customer with order aggregates
    query1 = """
        SELECT
            c.name,
            (SELECT MAX(transaction_date) FROM `tabSales Order` WHERE customer = c.name AND docstatus = 1) as last_order,
            (SELECT SUM(grand_total) FROM `tabSales Order` WHERE customer = c.name AND docstatus = 1) as ltv
        FROM `tabCustomer` c
        WHERE c.disabled = 0
        LIMIT 50
    """

    print("Test 1: Customer list with order aggregates (LIMIT 50)")
    print("-" * 70)
    result1 = benchmark_query(query1, iterations=3)
    print(f"  Min: {result1['min']:.3f}s")
    print(f"  Max: {result1['max']:.3f}s")
    print(f"  Avg: {result1['avg']:.3f}s")
    print()

    # Test query 2: Renewal calendar
    query2 = """
        SELECT
            sub.party,
            sub.end_date,
            (SELECT SUM(grand_total) FROM `tabSales Order` WHERE customer = sub.party AND docstatus = 1) as value
        FROM `tabSubscription` sub
        WHERE sub.party_type = 'Customer'
        AND sub.status IN ('Active', 'Past Due Date')
        AND sub.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 90 DAY)
        LIMIT 100
    """

    print("Test 2: Renewal calendar (90 days)")
    print("-" * 70)
    result2 = benchmark_query(query2, iterations=3)
    print(f"  Min: {result2['min']:.3f}s")
    print(f"  Max: {result2['max']:.3f}s")
    print(f"  Avg: {result2['avg']:.3f}s")
    print()

    print("="*70)
    print("Note: Run this before and after adding indexes to compare performance")
    print("="*70 + "\n")
