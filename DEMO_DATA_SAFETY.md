# Demo Data Generator - Production Safety

## 🔒 Protection Features

All demo data generators now include **production environment detection** to prevent accidental execution on live systems.

### What's Protected

The following scripts **REFUSE to run** in production:
- `generate_demo_data.py`
- `generate_demo_trends_data.py`
- `quick_demo_data.py`

Both generation AND clearing functions are protected.

---

## How It Works

### Environment Detection Logic

The scripts check multiple indicators to determine if running in production:

1. **Site Name Check**
   - ✅ ALLOWED: `localhost`, `127.0.0.1`, `dev.localhost`, `staging.localhost`
   - ❌ BLOCKED: Sites containing `production`, `prod`, `live`, `.com`, `.co`, `.org`

2. **Developer Mode Check**
   - ✅ ALLOWED: `developer_mode = true` in `site_config.json`
   - ❌ BLOCKED: `developer_mode = false` or not set

3. **Environment Variable Check**
   - ✅ ALLOWED: `FRAPPE_ENV=development` or `FRAPPE_ENV=staging`
   - ❌ BLOCKED: `FRAPPE_ENV=production`

---

## Examples

### ✅ Will Work (Development)

```bash
# Local development
bench --site localhost execute support_center.utils.quick_demo_data.generate_quick_demo

# Development site with developer mode enabled
bench --site dev.localhost execute support_center.utils.quick_demo_data.generate_quick_demo
```

**Output:**
```
======================================================================
QUICK DEMO DATA GENERATOR
======================================================================

✓ Environment check passed: localhost
✓ Developer mode: True

📊 Creating customers...
...
```

---

### ❌ Will Be Blocked (Production)

```bash
# Production site
bench --site mycompany.com execute support_center.utils.quick_demo_data.generate_quick_demo

# Site without developer mode
bench --site live.mycompany.com execute support_center.utils.quick_demo_data.generate_quick_demo
```

**Output:**
```
======================================================================
QUICK DEMO DATA GENERATOR
======================================================================

🚨 ERROR: PRODUCTION ENVIRONMENT DETECTED
======================================================================
Demo data generation is DISABLED in production for safety.
Current site: mycompany.com
Developer mode: False

This script only runs on:
  - localhost
  - dev.localhost
  - staging.localhost
  - Sites with developer_mode enabled
======================================================================

Error: Demo data generation blocked in production environment
```

---

## Enabling on Staging (If Needed)

If you need to generate demo data on a staging server:

### Option 1: Enable Developer Mode
```bash
bench --site staging.mysite.com set-config developer_mode 1
```

### Option 2: Use Allowed Site Name
Rename your site to include "dev" or "staging":
- `dev.mysite.com` ✅
- `staging.mysite.com` ✅
- `mysite.staging` ✅

---

## Override (Emergency Use Only)

If you absolutely must run on production (NOT RECOMMENDED), you can temporarily modify the `is_production_environment()` function:

```python
def is_production_environment():
    # TEMPORARY OVERRIDE - REMOVE AFTER USE
    return False
```

**⚠️ WARNING:** Remember to remove this override immediately after use!

---

## Testing the Safety Feature

To verify the protection is working:

1. **Check your site name:**
   ```bash
   bench --site [your-site] console
   >>> frappe.local.site
   'localhost'  # Safe to run demo data
   ```

2. **Check developer mode:**
   ```bash
   bench --site [your-site] console
   >>> frappe.conf.get('developer_mode')
   True  # Safe to run demo data
   ```

3. **Try running the script:**
   ```bash
   bench --site localhost execute support_center.utils.quick_demo_data.generate_quick_demo
   ```

   If you see "Environment check passed", the protection is working correctly.

---

## Best Practices

1. **Always use localhost for development**
   - Easiest and safest option

2. **Never disable developer mode in production**
   - Provides additional protection layer

3. **Use descriptive site names**
   - `dev.`, `staging.`, `test.` prefixes make intent clear

4. **Test safety features**
   - Verify protection works before deploying to production

5. **Review generated data before production use**
   - Demo data is for testing only

---

## Summary

| Environment | Site Name | Developer Mode | Demo Data Allowed? |
|-------------|-----------|----------------|-------------------|
| Local Dev | `localhost` | ✅ True | ✅ YES |
| Staging | `staging.site.com` | ✅ True | ✅ YES |
| Staging | `test.site.com` | ✅ True | ✅ YES |
| Production | `mycompany.com` | ❌ False | ❌ NO |
| Production | `live.site.com` | ❌ False | ❌ NO |
| Production | `site.com` | ❌ False | ❌ NO |

**Key Rule:** Demo data scripts require BOTH an allowed site name AND developer mode enabled (or explicit localhost).
