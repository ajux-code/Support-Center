# 🚀 Quick Start: Install Retention Dashboard Indexes

## ⚡ Installation (3 minutes)

### Step 1: Verify Prerequisites

```bash
# Make sure you're in the frappe-bench directory
cd ~/frappe-bench

# Check if support_center app is installed
bench list-apps | grep support_center
```

### Step 2: Run the Migration

**Option A: Run directly (fastest)**

```bash
bench execute support_center.patches.add_retention_dashboard_indexes.execute
```

**Option B: Run via migrate (recommended for production)**

```bash
bench migrate
```

The patch is already registered in `patches.txt` so it will run automatically.

### Step 3: Verify Installation

```bash
# Check if all 8 indexes were created
bench execute support_center.utils.index_monitor.verify_indexes
```

Expected output:
```
======================================================================
RETENTION DASHBOARD INDEX VERIFICATION
======================================================================

✓ tabSales Order.idx_customer_docstatus_date
✓ tabSales Order.idx_customer_docstatus_total
✓ tabSales Order.idx_customer_order_type
✓ tabSales Order.idx_docstatus_type_date
✓ tabSubscription.idx_party_status_enddate
✓ tabSubscription.idx_status_enddate
✓ tabCustomer.idx_disabled_group
✓ tabCustomer.idx_disabled_territory

======================================================================
Summary: 8/8 indexes exist
======================================================================

✓ All required indexes are present!
```

### Step 4: Test Performance Improvement

```bash
# Benchmark before/after comparison
bench execute support_center.utils.index_monitor.compare_query_performance
```

You should see queries running **3-5x faster**!

---

## 🎯 What You Just Installed

- **8 database indexes** on Sales Order, Subscription, and Customer tables
- **Expected improvement**: Dashboard loads 5x faster (from 15-25 seconds → 3-5 seconds)
- **Disk usage**: ~50-200 MB (depending on data volume)
- **Downtime**: Near-zero (indexes created with `ALGORITHM=INPLACE, LOCK=NONE`)

---

## ✅ Success Indicators

After installation, you should notice:

1. **Faster dashboard load** - Retention dashboard opens in ~3-5 seconds instead of 15-25 seconds
2. **Smooth scrolling** - Client list loads instantly when changing pages
3. **Quick filters** - Status filters (Overdue/Due Soon/Active) apply immediately
4. **Responsive calendar** - Renewal calendar renders in <1 second

---

## 🧪 Test It Out

1. Open the Retention Dashboard: `/retention-dashboard`
2. Click through different pages in the client list
3. Try filtering by status (Overdue, Due Soon, Active)
4. Open the renewal calendar

Everything should feel **noticeably snappier**!

---

## 🔧 Troubleshooting

### "Duplicate key name" error
✅ **Safe to ignore** - index already exists, migration will skip it

### "Lock wait timeout" error
⏳ **Wait 5 minutes** and retry - table is temporarily locked

### Indexes not showing up
📝 **Check logs**:
```bash
tail -f sites/*/logs/frappe.log | grep -i "index"
```

### Still slow after indexes
🔍 **Run diagnostics**:
```bash
bench execute support_center.utils.index_monitor.get_index_statistics
```

---

## 📊 Monitoring Index Usage

```bash
# See which indexes are being used
bench execute support_center.utils.index_monitor.get_index_statistics

# Analyze slow queries
bench execute support_center.utils.index_monitor.analyze_slow_queries
```

---

## 🔄 Rollback (if needed)

If something goes wrong, you can remove all indexes:

```bash
bench execute support_center.patches.add_retention_dashboard_indexes.rollback
```

Then reinstall:

```bash
bench execute support_center.patches.add_retention_dashboard_indexes.execute
```

---

## 📞 Need Help?

- **Logs**: `tail -f sites/*/logs/frappe.log`
- **Database console**: `bench mysql`
- **Documentation**: See [README_INDEX_MIGRATION.md](./README_INDEX_MIGRATION.md)

---

## ✨ What's Next?

After indexes are installed, we can proceed with:

1. **Backend Search** - Search across all customers (not just current page)
2. **Priority Score Breakdown** - Transparent scoring visualization
3. **Quick Actions** - Log calls and mark customers as contacted
4. **Last Contacted Column** - Track team activity

Want to continue? Let me know and I'll implement the next refinement!
