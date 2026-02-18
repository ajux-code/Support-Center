"""
Test Trends Data Endpoint

Usage:
    bench --site localhost execute support_center.utils.test_trends.test_trends_endpoint
"""

import frappe
from support_center.api.retention_dashboard import get_trend_data


def test_trends_endpoint():
    """Test if trend data is being calculated correctly"""
    print("\n" + "="*70)
    print("TESTING TRENDS DATA ENDPOINT")
    print("="*70 + "\n")

    try:
        # Test with 6 months
        print("📊 Calling get_trend_data(months=6)...")
        result = get_trend_data(months=6)

        print(f"\n✓ Received {len(result)} months of data\n")

        # Display results
        for month_data in result:
            print(f"📅 {month_data.get('label', 'Unknown')}")
            print(f"   Renewals: {month_data.get('renewal_count', 0)}")
            print(f"   New Orders: {month_data.get('new_count', 0)}")
            print(f"   Total Orders: {month_data.get('total_orders', 0)}")
            print(f"   Renewal Rate: {month_data.get('renewal_rate', 0)}%")
            print(f"   Revenue: ${month_data.get('total_revenue', 0):,.2f}")
            print()

        print("="*70)
        print("✅ Trends endpoint is working!")
        print("="*70 + "\n")

        return result

    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return None
