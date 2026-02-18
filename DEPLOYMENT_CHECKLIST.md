# Production Deployment Checklist

## 🚨 CRITICAL: Demo Data Must Never Reach Production

This checklist ensures no test/demo data is deployed to production.

---

## Pre-Deployment Steps

### 1. Run Verification Script (MANDATORY)

```bash
bench --site [your-site] execute support_center.utils.verify_no_demo_data.verify_clean_for_production
```

**Expected Output:**
```
✅ VERIFICATION PASSED - SAFE TO DEPLOY
No demo data detected. Deployment can proceed.
```

**If you see errors:**
```
🚨 CRITICAL ISSUES FOUND - DO NOT DEPLOY!
❌ Found X demo/test customers
❌ Found X demo sales orders
```

**DO NOT PROCEED** until cleaned!

---

### 2. Clean Demo Data (If Found)

```bash
# Clear all demo data
bench --site [your-site] execute support_center.utils.quick_demo_data.clear_quick_demo

# Verify it's gone
bench --site [your-site] execute support_center.utils.verify_no_demo_data.verify_clean_for_production
```

---

### 3. Verify Configuration

```bash
# Check these settings on production site:
bench --site [your-site] console
```

```python
# In console, verify:
frappe.conf.get('developer_mode')  # Should be False or None
frappe.local.site  # Should be production domain, not localhost
```

---

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  verify-no-demo-data:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v2

      - name: Verify No Demo Data
        run: |
          bench --site production.mysite.com execute support_center.utils.verify_no_demo_data.pre_deploy_check

      - name: Deploy (only if verification passed)
        run: |
          # Your deployment commands here
          git pull
          bench migrate
          bench build --app support_center
          bench restart
```

### Manual Deployment Script

Create `deploy-production.sh`:

```bash
#!/bin/bash
set -e  # Exit on any error

SITE="production.mysite.com"

echo "========================================"
echo "PRE-DEPLOYMENT VERIFICATION"
echo "========================================"

# Run verification
if ! bench --site $SITE execute support_center.utils.verify_no_demo_data.pre_deploy_check; then
    echo ""
    echo "❌ DEPLOYMENT BLOCKED: Demo data detected!"
    echo ""
    echo "Clean it with:"
    echo "  bench --site $SITE execute support_center.utils.quick_demo_data.clear_quick_demo"
    echo ""
    exit 1
fi

echo ""
echo "✅ Verification passed. Proceeding with deployment..."
echo ""

# Your deployment commands
git pull origin main
bench --site $SITE migrate
bench --site $SITE build --app support_center
bench restart

echo ""
echo "✅ Deployment complete!"
```

Make executable:
```bash
chmod +x deploy-production.sh
```

---

## Database Migration Safety

### Before Migrating Database to Production

If you're migrating/restoring a database from staging to production:

```bash
# 1. Restore database
bench --site production.mysite.com restore /path/to/backup.sql

# 2. IMMEDIATELY clean demo data
bench --site production.mysite.com execute support_center.utils.quick_demo_data.clear_quick_demo

# 3. Verify it's clean
bench --site production.mysite.com execute support_center.utils.verify_no_demo_data.verify_clean_for_production

# 4. Clear cache
bench --site production.mysite.com clear-cache
```

---

## Quick Reference Commands

### Verify Clean
```bash
bench --site [site] execute support_center.utils.verify_no_demo_data.verify_clean_for_production
```

### Get Demo Data Summary
```bash
bench --site [site] execute support_center.utils.verify_no_demo_data.get_demo_data_summary
```

### Clean Demo Data
```bash
bench --site [site] execute support_center.utils.quick_demo_data.clear_quick_demo
```

### Check Counts
```sql
-- In mariadb console
SELECT
    'Customers' as type,
    COUNT(*) as count
FROM `tabCustomer`
WHERE customer_name LIKE 'Demo Customer%'
UNION ALL
SELECT
    'Sales Orders',
    COUNT(*)
FROM `tabSales Order`
WHERE customer LIKE 'Demo Customer%';
```

---

## Protection Layers

Your system has **3 layers of protection**:

### Layer 1: Generation Protection ✅
Demo data scripts refuse to run in production:
- Checks site name
- Checks developer_mode
- Checks environment variables

### Layer 2: Verification Script ✅
Pre-deployment checks for existing demo data:
- Scans for demo customers
- Scans for demo orders
- Provides cleanup commands

### Layer 3: Manual Checklist ✅
This document provides step-by-step verification

---

## Red Flags (DO NOT DEPLOY if you see these)

- ❌ Site name contains "localhost", "dev", "test"
- ❌ Developer mode is enabled
- ❌ Customers with "Demo Customer" in name
- ❌ Sales Orders starting with "SO-DEMO-"
- ❌ Email addresses ending with "@example.com"
- ❌ Verification script returns errors

---

## Emergency: Demo Data Found in Production

If demo data is discovered in production:

```bash
# 1. Immediately run cleanup
bench --site production.mysite.com execute support_center.utils.quick_demo_data.clear_quick_demo

# 2. Verify cleanup
bench --site production.mysite.com execute support_center.utils.verify_no_demo_data.verify_clean_for_production

# 3. Clear all caches
bench --site production.mysite.com clear-cache
bench --site production.mysite.com clear-website-cache

# 4. Restart
bench restart

# 5. Document the incident
# - How did demo data reach production?
# - Update CI/CD to include verification
# - Review deployment procedures
```

---

## Deployment Approval Checklist

Before deploying to production, confirm:

- [ ] Ran `verify_clean_for_production()` - PASSED
- [ ] No demo customers exist
- [ ] No demo sales orders exist
- [ ] Developer mode is disabled
- [ ] Site name is production domain (not localhost)
- [ ] Tested on staging first
- [ ] Database backup created
- [ ] Team notified of deployment

**Approved by:** ________________
**Date:** ________________
**Deployment ID:** ________________

---

## Support

If you have questions about this checklist:
1. Review `DEMO_DATA_SAFETY.md`
2. Check verification script: `verify_no_demo_data.py`
3. Review protection logic in demo data generators

**Remember: It's better to be over-cautious than to leak test data to production!** 🛡️
