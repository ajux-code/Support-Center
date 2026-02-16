# Retention Dashboard - Comprehensive Testing Guide

**Version:** 1.0
**Last Updated:** February 16, 2026
**Test Environment:** Frappe/ERPNext 14+
**Estimated Testing Time:** 45-60 minutes

---

## 📋 Table of Contents

1. [Test Prerequisites](#test-prerequisites)
2. [Test Data Setup](#test-data-setup)
3. [Test Cases (15 Tests)](#test-cases)
4. [Bug Reporting Template](#bug-reporting-template)
5. [Test Completion Checklist](#test-completion-checklist)

---

## Test Prerequisites

### Required Access
- [ ] Access to Frappe/ERPNext instance
- [ ] Permissions to view Retention Dashboard (`/retention-dashboard`)
- [ ] Permissions to create/edit Customers, Subscriptions, Sales Orders
- [ ] Browser DevTools access (F12)

### Browser Requirements
- Chrome 120+, Firefox 122+, or Safari 17+ (latest versions recommended)
- JavaScript enabled
- Cookies enabled
- Screen resolution: 1366x768 or higher

### Test Environment Setup
1. Open browser in **Incognito/Private mode** (fresh session)
2. Open **DevTools** (F12) → Go to **Console** tab
3. Keep Console open during all tests to catch errors
4. Have **Network** tab ready for performance checks

---

## Test Data Setup

Before starting the 15 tests, you need test data. Follow these steps to create at-risk customers.

### Setup 1: Create an Overdue Customer (Critical Priority)

**Purpose:** Creates a customer with an overdue renewal for testing high-priority features.

#### Step 1.1: Create a Test Customer

1. Navigate to: `/app/customer`
2. Click **"New Customer"** button
3. Fill in the form:
   - **Customer Name:** `Test Customer - Overdue`
   - **Customer Group:** Select `Enterprise` (for high priority score)
   - **Territory:** Select any territory
   - **Email ID:** `overdue.customer@test.com`
   - **Mobile No:** `+1234567890`
4. Click **"Save"**
5. **Note down the Customer ID** (e.g., `CUST-00001`)

#### Step 1.2: Create Sales Orders for This Customer

**Why:** Customer needs order history to calculate Lifetime Value (LTV)

1. Navigate to: `/app/sales-order`
2. Click **"New Sales Order"**
3. Fill in:
   - **Customer:** Select `Test Customer - Overdue`
   - **Transaction Date:** `2025-01-15` (past date)
   - **Delivery Date:** `2025-01-20`
   - **Custom Product:** `Managed Security Basic` (if field exists)
4. **Add Item:**
   - Click **"Add Row"** in Items table
   - **Item Code:** Select any item (or create a test item)
   - **Qty:** `1`
   - **Rate:** `5000` (this sets LTV to $5,000)
5. Click **"Save"**
6. Click **"Submit"** (sets docstatus = 1)

**Repeat 2 more times** with different dates to create total LTV of $15,000:
- Order 2: Date `2025-06-10`, Rate `5000`
- Order 3: Date `2025-11-05`, Rate `5000`

#### Step 1.3: Create an Overdue Subscription

1. Navigate to: `/app/subscription`
2. Click **"New Subscription"**
3. Fill in the form:

   **Section: Party Details**
   - **Party Type:** `Customer`
   - **Party:** Select `Test Customer - Overdue`
   - **Company:** Select your company

   **Section: Subscription Period**
   - **Subscription Start Date:** `2026-01-01` (January 1, 2026)
   - **Subscription End Date:** `2026-02-08` (**8 days ago** from today, Feb 16)
   - **Trial Period Start Date:** Leave empty
   - **Trial Period End Date:** Leave empty
   - **Days Until Due:** `0`
   - **Generate Invoice At:** `End of the current subscription period`

   **Section: Plans**
   - Click **"Add Row"**
   - **Plan:** Select any subscription plan (or create one if needed)
   - **Qty:** `1`

   **Section: Status**
   - **Status:** `Active` (NOT Cancelled or Disabled)

4. Click **"Save"**
5. Verify the form shows:
   - ✅ Start Date: `2026-01-01`
   - ✅ End Date: `2026-02-08` (in the past)
   - ✅ Status: `Active`

#### Step 1.4: Verify Data in Database (Optional)

```sql
-- Check subscription exists and is overdue
SELECT
    name, party, party_type,
    start_date, end_date, status,
    DATEDIFF(CURDATE(), end_date) as days_overdue
FROM `tabSubscription`
WHERE party = 'Test Customer - Overdue'
AND party_type = 'Customer';

-- Expected: 1 row, days_overdue = 8, status = 'Active'
```

### Setup 2: Create a "Due Soon" Customer (Medium Priority)

**Purpose:** Creates a customer with renewal in next 30 days.

#### Step 2.1: Create Customer

1. Navigate to: `/app/customer`
2. Click **"New Customer"**
3. Fill in:
   - **Customer Name:** `Test Customer - Due Soon`
   - **Customer Group:** `Commercial`
   - **Email ID:** `duesoon.customer@test.com`
4. Click **"Save"**

#### Step 2.2: Create Sales Orders

Create 2 sales orders:
- Order 1: Date `2025-03-20`, Rate `3000`
- Order 2: Date `2025-09-15`, Rate `3000`

Total LTV: $6,000

#### Step 2.3: Create "Due Soon" Subscription

1. Navigate to: `/app/subscription`
2. Click **"New Subscription"**
3. Fill in:
   - **Party Type:** `Customer`
   - **Party:** `Test Customer - Due Soon`
   - **Subscription Start Date:** `2026-01-01`
   - **Subscription End Date:** `2026-02-28` (**12 days from today**)
   - **Status:** `Active`
4. Add a plan, then **Save**

### Setup 3: Create an Active Customer (Low Priority)

**Purpose:** Creates a customer with no immediate renewal pressure.

#### Step 3.1: Create Customer

1. Navigate to: `/app/customer`
2. Fill in:
   - **Customer Name:** `Test Customer - Active`
   - **Customer Group:** `Individual`
   - **Email ID:** `active.customer@test.com`
3. Save

#### Step 3.2: Create Sales Orders

Create 1 sales order:
- Order 1: Date `2025-12-01`, Rate `2000`

#### Step 3.3: Create Active Subscription

1. Navigate to: `/app/subscription`
2. Fill in:
   - **Party:** `Test Customer - Active`
   - **Subscription Start Date:** `2026-01-01`
   - **Subscription End Date:** `2026-06-30` (**135 days from today**)
   - **Status:** `Active`
3. Save

### ✅ Test Data Setup Complete

You should now have:
- [x] 3 test customers
- [x] 6 sales orders (total)
- [x] 3 subscriptions (1 overdue, 1 due soon, 1 active)

---

## Test Cases

---

## TEST 1: Initial Dashboard Load

**Test ID:** RT-001
**Priority:** Critical
**Duration:** 2 minutes

### Objective
Verify the dashboard loads correctly with all data populated and no errors.

### Prerequisites
- Test data from "Test Data Setup" section created
- Browser DevTools Console open (F12)

### Test Steps

#### Step 1.1: Navigate to Dashboard
1. In your browser, go to: `/retention-dashboard`
2. Observe the loading spinner appear
3. **⏱️ Start timer** when you press Enter

#### Step 1.2: Wait for Page to Load
1. Watch for the loading spinner to disappear
2. **⏱️ Stop timer** when all content is visible
3. **Record load time:** _____ seconds

#### Step 1.3: Check Console for Errors
1. Open **DevTools Console** (F12)
2. Look for any **red error messages**
3. Take a screenshot if errors exist

### Expected Results

✅ **Visual Checks:**
- [ ] Dashboard loads within **5 seconds** (with indexes installed)
- [ ] Header displays: "Retention Dashboard"
- [ ] Subtitle: "Track renewals, identify at-risk clients, and discover upsell opportunities"
- [ ] **4 KPI cards** visible at top
- [ ] **3 Quick Action cards** visible (Renewal Calendar, Client List, Analytics)
- [ ] "You're all caught up" banner OR two widgets (This Week's Renewals + Priority Actions)
- [ ] Client list table visible with customer rows

✅ **Console Checks:**
- [ ] **No red errors** in console
- [ ] No 404 errors (missing files)
- [ ] No 500 errors (server errors)

✅ **Network Checks:**
1. Open **DevTools → Network tab**
2. Check API calls:
   - [ ] `get_dashboard_kpis` - Status 200
   - [ ] `get_clients_by_renewal_status` - Status 200
   - [ ] `get_renewal_calendar` - Status 200

### ⚠️ Fail Criteria
- Load time > 10 seconds
- Red errors in console
- Missing KPI cards
- Blank/empty dashboard
- API calls returning 500 errors

### 🐛 If Test Fails
1. Take screenshot of console errors
2. Check Network tab for failed requests
3. Verify database indexes are installed: `bench execute support_center.utils.index_monitor.verify_indexes`
4. Check server logs: `tail -f sites/*/logs/frappe.log`

---

## TEST 2: KPI Cards Display and Accuracy

**Test ID:** RT-002
**Priority:** High
**Duration:** 5 minutes

### Objective
Verify all four KPI summary cards display correct data with proper formatting.

### Test Steps

#### Step 2.1: Locate KPI Cards
1. Scroll to the top of the dashboard
2. Identify the 4 KPI cards in the grid:
   - Total Customers
   - Clients at Risk
   - Revenue Up for Renewal
   - Upsell Potential (or Avg. Days Since Contact)

#### Step 2.2: Test "Total Customers" KPI

1. **Find the card** labeled "Total Customers"
2. **Check the value:**
   - Should show a **number** (not `-` or `NaN`)
   - Example: `10` or `150`
3. **Check the info tooltip:**
   - Hover over the **ⓘ icon** next to "Total Customers"
   - Tooltip should appear explaining: "Total number of active (non-disabled) customers in the system"
4. **Check trend indicator (if present):**
   - Look for percentage change (e.g., `↓ 100% vs last month`)
   - Color: Red for decrease, green for increase
5. **Check subtext:**
   - Should show "Avg LTV: $X,XXX"
   - Format: Currency with commas (e.g., `$9,260`)

**Record values:**
- Total Customers: ______
- Avg LTV: ______
- Trend: ______

#### Step 2.3: Test "Clients at Risk" KPI

1. **Find the card** with **warning triangle icon** (⚠️)
2. **Expected value:** Should show `1` or higher (based on your test data)
3. **Visual checks:**
   - [ ] Card has **orange/yellow background** or warning styling
   - [ ] Warning triangle icon visible
   - [ ] Number is bold and prominent
4. **Hover over info icon:**
   - Tooltip: "Customers with no orders in the last 90 days or with overdue renewals"
5. **Cross-check with test data:**
   - You created 1 overdue customer (`Test Customer - Overdue`)
   - KPI should show at least `1`

**Record value:**
- Clients at Risk: ______ (Expected: ≥ 1)

#### Step 2.4: Test "Revenue Up for Renewal" KPI

1. **Find the card** labeled "Revenue Up for Renewal"
2. **Check the value:**
   - Format: `$0` or `$X,XXX.XX`
   - Should be currency formatted with dollar sign
3. **Check subtext:**
   - May show: "X renewals this month" or "0 renewals this month"
4. **Hover over info icon:**
   - Tooltip: "Total annual revenue from customers with subscriptions renewing in the next 90 days"

**Record values:**
- Revenue Up for Renewal: ______
- Renewals this month: ______

#### Step 2.5: Test Fourth KPI Card

1. **Identify the 4th KPI card** (varies by configuration):
   - Could be "Upsell Potential" or "Avg. Days Since Contact"
2. **Check the value:**
   - Format depends on metric (currency or number of days)
   - Should not show `NaN` or `-`
3. **Hover over info icon** to see tooltip

### Expected Results

✅ **All KPI Cards:**
- [ ] Show numeric values (not `-`, `NaN`, or `undefined`)
- [ ] Have proper formatting (currency with `$`, numbers with commas)
- [ ] Info icons (ⓘ) show tooltips on hover
- [ ] Tooltips are readable and explain the metric
- [ ] No negative numbers (unless valid)

✅ **"Clients at Risk" Card:**
- [ ] Shows `1` or higher (matching your overdue + due soon customers)
- [ ] Has warning styling (orange/yellow icon or background)

✅ **Typography:**
- [ ] Values are large and bold
- [ ] Labels are clear and readable
- [ ] Subtexts are smaller, grayed out

### ⚠️ Fail Criteria
- Any KPI shows `NaN`, `undefined`, or `-`
- "Clients at Risk" shows `0` when you have overdue customers
- Currency values missing `$` symbol
- Tooltips don't appear on hover
- Numbers have formatting issues (e.g., `10000` instead of `10,000`)

### 🐛 If Test Fails
1. **Check API response:**
   - Open DevTools → Network tab
   - Find `get_dashboard_kpis` request
   - Click it → Preview tab
   - Verify JSON response has correct data
2. **Check database:**
   ```sql
   SELECT COUNT(*) as total_customers FROM `tabCustomer` WHERE disabled = 0;
   ```
3. **Screenshot the issue and note which KPI is broken**

---

## TEST 3: At-Risk Clients Summary Cards

**Test ID:** RT-003
**Priority:** High
**Duration:** 5 minutes

### Objective
Verify the "At-Risk Clients" section displays customer cards correctly with all details.

### Test Steps

#### Step 3.1: Locate the "At-Risk Clients" Section

1. Scroll down below the KPI cards
2. Look for the section header: **"At-Risk Clients"**
3. You should see:
   - Section header with count (e.g., "At-Risk Clients (1)")
   - **"View all →"** link in the header
   - Grid of customer cards with red/orange styling

#### Step 3.2: Inspect Customer Cards

**For each customer card displayed:**

1. **Check card layout:**
   - [ ] Card has a colored border (red for overdue, orange for due soon)
   - [ ] Card has slight shadow/elevation
   - [ ] Card is clickable (cursor changes to pointer on hover)

2. **Check customer name:**
   - [ ] Customer name displayed at top (e.g., "Test Customer - Overdue")
   - [ ] Name is bold and prominent
   - [ ] Name is truncated with `...` if too long

3. **Check status badge:**
   - [ ] Badge shows "Overdue" (red) or "Due Soon" (orange)
   - [ ] Badge is positioned top-right or below name
   - [ ] Badge text is white on colored background

4. **Check priority badge:**
   - [ ] Shows "Critical", "High", "Medium", or "Low"
   - [ ] Has appropriate color:
     - Critical: Red/dark red
     - High: Orange
     - Medium: Yellow
     - Low: Blue/gray

5. **Check days until renewal:**
   - [ ] Shows "X days overdue" (red text) for overdue customers
   - [ ] Shows "X days until renewal" for due soon customers
   - [ ] Number is accurate (8 days overdue for your test customer)

6. **Check lifetime value (LTV):**
   - [ ] Shows "LTV: $X,XXX.XX"
   - [ ] Formatted with dollar sign and commas
   - [ ] Matches the total of sales orders you created ($15,000 for overdue customer)

#### Step 3.3: Test "View all →" Link

1. **Click the "View all →"** link in the section header
2. **Observe behavior:**
   - Page should smoothly scroll down to the client list table
   - Table should be filtered to show "Overdue" customers only
   - "Overdue" filter tab should become active (blue underline)

**Record results:**
- Does "View all" scroll to table? ☐ Yes ☐ No
- Is table filtered to Overdue? ☐ Yes ☐ No

#### Step 3.4: Test Card Click (Opens Modal)

1. **Scroll back up** to the At-Risk Clients section
2. **Click on any customer card** (click anywhere on the card)
3. **Observe:**
   - Modal should slide in from right or fade in
   - Modal background should dim the dashboard
   - Modal should show customer details

**Expected modal content:**
- Customer name in header
- Status and priority badges
- Renewal information
- Lifetime value
- Order history
- Contact information

4. **Close the modal** (click X or press ESC)

### Expected Results

✅ **Section Display:**
- [ ] "At-Risk Clients" header visible
- [ ] Shows at least 1 customer card (your test customer)
- [ ] Shows up to 6 customers max
- [ ] "View all →" link is clickable and blue

✅ **Customer Cards:**
- [ ] Each card shows customer name, status badge, priority badge
- [ ] Days until renewal/overdue displayed correctly
- [ ] LTV formatted as currency ($X,XXX.XX)
- [ ] Overdue customers have red styling
- [ ] Due Soon customers have orange styling
- [ ] Cards have hover effect (shadow increases or background lightens)

✅ **Interactions:**
- [ ] "View all →" scrolls to client list and filters by Overdue
- [ ] Clicking a card opens the customer detail modal
- [ ] Modal displays correctly (more details in TEST 10)

### Edge Case: No At-Risk Customers

**If you delete all overdue/due soon subscriptions:**

✅ **Expected:**
- [ ] Section shows: "No at-risk clients" or similar empty state message
- [ ] "View all →" link may be hidden or disabled
- [ ] No cards displayed

### ⚠️ Fail Criteria
- No cards displayed when overdue customers exist
- Cards show incorrect data (wrong LTV, wrong days count)
- Status badges show wrong status (e.g., "Active" instead of "Overdue")
- "View all" link doesn't work
- Cards not clickable
- Modal doesn't open on card click

### 🐛 If Test Fails
1. **Check API response:**
   - DevTools → Network → Find `get_clients_by_renewal_status`
   - Check Preview tab → Look for customers with `renewal_status: "overdue"`
2. **Verify subscription:**
   ```sql
   SELECT name, party, end_date, status, DATEDIFF(CURDATE(), end_date) as days_overdue
   FROM `tabSubscription`
   WHERE party_type = 'Customer'
   AND status IN ('Active', 'Past Due Date', 'Unpaid')
   AND end_date < CURDATE()
   LIMIT 10;
   ```
3. **Screenshot the issue**

---

## TEST 4: Quick Action Cards Navigation

**Test ID:** RT-004
**Priority:** Medium
**Duration:** 3 minutes

### Objective
Verify the three quick action navigation cards scroll to correct sections.

### Test Steps

#### Step 4.1: Locate Quick Action Cards

1. Scroll to the section with 3 large cards:
   - **Renewal Calendar** (calendar icon)
   - **Client List** (user icon)
   - **Analytics** (bar chart icon)

2. Verify visual appearance:
   - [ ] Each card has an icon on the left
   - [ ] Title in the middle
   - [ ] Arrow icon (→) on the right
   - [ ] Cards have border and hover effect

#### Step 4.2: Test "Renewal Calendar" Card

1. **Scroll to the top** of the dashboard
2. **Click the "Renewal Calendar"** card
3. **Observe:**
   - Should smoothly scroll down
   - Should land on "Full Renewal Calendar" section
   - Calendar should be visible

**Record results:**
- Scrolls smoothly? ☐ Yes ☐ No
- Lands on calendar section? ☐ Yes ☐ No
- Animation duration: _____ seconds (should be ~0.5-1 second)

#### Step 4.3: Test "Client List" Card

1. **Scroll back to the top**
2. **Click the "Client List"** card
3. **Observe:**
   - Should scroll to the "Client Breakdown by Status" section
   - Should show the filter tabs (All Clients, Overdue, Due Soon, Active)
   - Should show the client table

**Record results:**
- Scrolls to client table? ☐ Yes ☐ No
- Table visible after scroll? ☐ Yes ☐ No

#### Step 4.4: Test "Analytics" Card

1. **Scroll back to the top**
2. **Click the "Analytics"** card
3. **Observe:**
   - Should scroll to the bottom of the dashboard
   - Should show "Analytics & Trends" section
   - Should show 3 charts (Renewal Rate, Orders Comparison, Revenue Trend)

**Record results:**
- Scrolls to analytics section? ☐ Yes ☐ No
- Charts visible? ☐ Yes ☐ No
- Charts start loading/rendering? ☐ Yes ☐ No

#### Step 4.5: Test Hover Effects

1. **Hover over each quick action card**
2. **Observe visual feedback:**
   - [ ] Background color changes (slight gray or color tint)
   - [ ] Card elevates slightly (shadow increases)
   - [ ] Cursor changes to pointer
   - [ ] Arrow icon may animate or change color

### Expected Results

✅ **All Quick Action Cards:**
- [ ] Have icon, title, description, and arrow
- [ ] Clickable (entire card is a button)
- [ ] Smooth scroll animation to target section (~0.5-1 second)
- [ ] Land exactly at the target section (not above/below)
- [ ] Hover effect visible

✅ **Specific Cards:**
- [ ] "Renewal Calendar" scrolls to calendar section
- [ ] "Client List" scrolls to client table
- [ ] "Analytics" scrolls to charts at bottom

### ⚠️ Fail Criteria
- Cards not clickable
- No scroll animation (jumps instantly)
- Scrolls to wrong section
- Hover effect missing or broken
- No cursor change on hover

### 🐛 If Test Fails
1. **Check browser console** for JavaScript errors
2. **Verify target sections exist:**
   - Calendar: `#full-calendar-section`
   - Client List: `.clients-section`
   - Analytics: `#analytics-section`
3. **Test scroll manually:**
   ```javascript
   // Run in console:
   document.querySelector('#full-calendar-section').scrollIntoView({behavior: 'smooth'});
   ```

---

## TEST 5: Insights Widgets (Consolidated Success State)

**Test ID:** RT-005
**Priority:** Medium
**Duration:** 5 minutes

### Objective
Verify the insights widgets adapt correctly based on data availability (consolidated vs. two-widget layout).

### Scenario A: When NO Renewals in Next 7 Days (Consolidated State)

**Prerequisites:**
- Delete or update all subscriptions so none have `end_date` within next 7 days

#### Step 5A.1: Create the Empty State

1. **Navigate to Subscriptions:**
   ```
   /app/subscription/view/list
   ```

2. **For each active subscription:**
   - Edit the subscription
   - Change **End Date** to a date **8 or more days in the future**
   - Save

3. **Refresh the Retention Dashboard**

#### Step 5A.2: Verify Consolidated Banner

1. **Scroll to the Insights Grid section** (below Quick Actions)
2. **Look for a single banner** (not two separate widgets)
3. **Check the banner contains:**
   - [ ] Checkmark icon (✓) on the left (green circle)
   - [ ] Text: "You're all caught up"
   - [ ] Subtext: "No renewals in next 7 days"
   - [ ] Optional: "Next: [Date]" if future renewals exist
   - [ ] Two action buttons on the right:
     - "View pipeline →"
     - "Review analytics →"

#### Step 5A.3: Test "View pipeline →" Button

1. **Click the "View pipeline →"** button
2. **Observe:**
   - Should scroll down to the Full Renewal Calendar section
   - Calendar should expand/show
   - **Check console:** Should log "✓ Calendar button clicked - navigating to calendar section"

**Record results:**
- Button clickable? ☐ Yes ☐ No
- Scrolls to calendar? ☐ Yes ☐ No
- Console log appears? ☐ Yes ☐ No

#### Step 5A.4: Test "Review analytics →" Button

1. **Scroll back up** to the consolidated banner
2. **Click "Review analytics →"** button
3. **Observe:**
   - Should scroll to the Analytics section at bottom
   - Charts should start loading
   - **Check console:** Should log "✓ Analytics button clicked - navigating to analytics section"

**Record results:**
- Button clickable? ☐ Yes ☐ No
- Scrolls to analytics? ☐ Yes ☐ No
- Console log appears? ☐ Yes ☐ No

### Scenario B: When Renewals Exist in Next 7 Days (Two-Widget Layout)

**Prerequisites:**
- Create at least 1 subscription with `end_date` within next 7 days

#### Step 5B.1: Create Test Data for This Scenario

1. **Edit "Test Customer - Overdue"** subscription:
   - Change **End Date** to **tomorrow's date** (e.g., if today is Feb 16, set to Feb 17)
   - Keep **Status** as `Active`
   - Save

2. **Refresh the dashboard**

#### Step 5B.2: Verify Two-Widget Layout

1. **Scroll to Insights Grid section**
2. **You should now see TWO widgets side-by-side:**
   - **Left:** "This Week's Renewals" (calendar widget)
   - **Right:** "Priority Actions" (at-risk customers widget)

**Check "This Week's Renewals" widget:**
- [ ] Header: "This Week's Renewals"
- [ ] "View Full Calendar →" button in header
- [ ] Compact 7-day calendar showing days of the week
- [ ] Dots or colored indicators on days with renewals
- [ ] Your test customer's renewal appears on the correct day

**Check "Priority Actions" widget:**
- [ ] Header: "Priority Actions"
- [ ] Badge showing count (e.g., "5" if 5 customers)
- [ ] List of up to 5 at-risk customers
- [ ] Each customer shows: name, status badge, priority, LTV
- [ ] Your overdue test customer appears at the top

#### Step 5B.3: Test "View Full Calendar" Button

1. **Click "View Full Calendar →"** in the calendar widget header
2. **Observe:**
   - Section below expands
   - Shows full monthly calendar
   - Your test subscription appears on the calendar

**Record results:**
- Calendar expands? ☐ Yes ☐ No
- Subscription visible on calendar? ☐ Yes ☐ No

### Expected Results

✅ **Consolidated State (No renewals in 7 days):**
- [ ] Single banner spans full width
- [ ] Shows "You're all caught up" message
- [ ] Shows checkmark icon
- [ ] Two action buttons present and functional
- [ ] Buttons navigate correctly

✅ **Two-Widget State (Renewals exist):**
- [ ] Two widgets side-by-side
- [ ] Calendar widget shows 7-day view with renewal indicators
- [ ] Priority Actions widget shows at-risk customers
- [ ] "View Full Calendar" expands calendar below
- [ ] At-risk customers match those in "At-Risk Clients" section

✅ **Layout Switch:**
- [ ] Layout changes automatically when data changes
- [ ] No visual glitches during transition
- [ ] Styling consistent in both states

### ⚠️ Fail Criteria
- Both states show at the same time
- Consolidated banner doesn't appear when no renewals exist
- Action buttons don't work
- Two-widget layout broken (stacked instead of side-by-side)
- Calendar doesn't show renewals

### 🐛 If Test Fails
1. **Check console** for errors
2. **Verify CSS classes:**
   - Consolidated state: `.insights-grid.insights-consolidated`
   - Two-widget state: `.insights-grid` (without consolidated class)
3. **Check API response:**
   - Network → `get_renewal_calendar`
   - Should return array of renewals or empty array

---

## TEST 6: Client List - Status Filtering

**Test ID:** RT-006
**Priority:** High
**Duration:** 5 minutes

### Objective
Verify client list filters correctly by renewal status (All, Overdue, Due Soon, Active).

### Test Steps

#### Step 6.1: Locate Filter Tabs

1. **Scroll down** to the "Client Breakdown by Status" section
2. **Identify the 4 filter tabs** above the table:
   - All Clients
   - Overdue (red)
   - Due Soon (orange)
   - Active (green)

3. **Check tab appearance:**
   - [ ] "All Clients" tab is active by default (blue underline or background)
   - [ ] Each tab shows count in parentheses (e.g., "Overdue (1)")
   - [ ] Colors match status: Overdue=red, Due Soon=orange, Active=green

#### Step 6.2: Test "All Clients" Filter (Default)

1. **Verify "All Clients" tab is active** (blue indicator)
2. **Look at the table:**
   - Should show all 3 test customers you created
   - Row order: Overdue customers first, then Due Soon, then Active
3. **Count rows:**
   - Expected: 3 rows (or more if you have other customers)

**Record results:**
- All Clients count: ______ (Expected: 3)
- Overdue customers shown first? ☐ Yes ☐ No

#### Step 6.3: Test "Overdue" Filter

1. **Click the "Overdue" tab** (red)
2. **Observe loading spinner** (brief flash)
3. **Check the table:**
   - Should show ONLY overdue customers
   - Your "Test Customer - Overdue" should be visible
   - Status column shows red "Overdue" badge

**Record results:**
- Overdue count: ______ (Expected: 1)
- Only overdue customers shown? ☐ Yes ☐ No
- Tab shows active indicator (blue)? ☐ Yes ☐ No

**Check each row:**
- [ ] Customer name matches "Test Customer - Overdue"
- [ ] Status badge is red and says "Overdue"
- [ ] Priority badge shows "Critical" or "High"
- [ ] Renewal date column shows "X days overdue" in red
- [ ] LTV shows "$15,000.00"

#### Step 6.4: Test "Due Soon" Filter

1. **Click the "Due Soon" tab** (orange)
2. **Check the table:**
   - Should show ONLY due soon customers
   - Your "Test Customer - Due Soon" should be visible
   - Status badges are orange

**Record results:**
- Due Soon count: ______ (Expected: 1)
- Only due soon customers shown? ☐ Yes ☐ No

**Check row details:**
- [ ] Customer name: "Test Customer - Due Soon"
- [ ] Status badge: Orange "Due Soon"
- [ ] Renewal date: "12 days" or similar (not overdue)
- [ ] LTV: "$6,000.00"

#### Step 6.5: Test "Active" Filter

1. **Click the "Active" tab** (green)
2. **Check the table:**
   - Should show ONLY active customers (renewals beyond 30 days)
   - Your "Test Customer - Active" should be visible
   - Status badges are green

**Record results:**
- Active count: ______ (Expected: 1)
- Only active customers shown? ☐ Yes ☐ No

**Check row details:**
- [ ] Customer name: "Test Customer - Active"
- [ ] Status badge: Green "Active"
- [ ] Renewal date: "135 days" or similar
- [ ] LTV: "$2,000.00"

#### Step 6.6: Test Filter Tab Switching (Rapid Clicks)

1. **Rapidly click between tabs:** All → Overdue → Due Soon → Active → All
2. **Observe:**
   - Table updates each time
   - Loading spinner appears briefly
   - No errors in console
   - No duplicate rows
   - Tab active state updates correctly

**Record results:**
- Rapid switching works? ☐ Yes ☐ No
- Any visual glitches? ☐ Yes ☐ No
- Console errors? ☐ Yes ☐ No

#### Step 6.7: Verify Filter Count Badges

1. **For each tab, verify the count badge matches table rows:**

| Tab | Badge Count | Actual Rows | Match? |
|-----|-------------|-------------|--------|
| All Clients | ______ | ______ | ☐ |
| Overdue | ______ | ______ | ☐ |
| Due Soon | ______ | ______ | ☐ |
| Active | ______ | ______ | ☐ |

### Expected Results

✅ **Filter Tabs:**
- [ ] 4 tabs visible: All Clients, Overdue, Due Soon, Active
- [ ] Active tab has blue underline or background
- [ ] Each tab shows count badge with correct number
- [ ] Colors match status (red, orange, green)

✅ **Filtering Behavior:**
- [ ] "All Clients" shows all customers, sorted by priority
- [ ] "Overdue" shows ONLY customers with overdue renewals
- [ ] "Due Soon" shows ONLY customers with renewals in next 30 days
- [ ] "Active" shows ONLY customers with renewals beyond 30 days
- [ ] Table updates within 1-2 seconds after clicking tab
- [ ] Loading spinner shows during filter change

✅ **Data Accuracy:**
- [ ] Counts in badges match actual row counts in table
- [ ] Status badges in rows match the filter (e.g., all red in Overdue filter)
- [ ] Customers are sorted by priority score (highest first)

### ⚠️ Fail Criteria
- Wrong customers shown in filtered view
- Counts don't match (badge says "5" but table shows 3 rows)
- Multiple tabs active at same time
- Filter doesn't work (clicking tab does nothing)
- Table shows customers from wrong status
- Loading spinner never appears or never disappears

### 🐛 If Test Fails
1. **Check API calls:**
   - Network tab → Find `get_clients_by_renewal_status?status_filter=overdue`
   - Verify response contains correct customers
2. **Check console for errors**
3. **Verify filter parameter:**
   ```javascript
   // Check in console:
   document.querySelector('.filter-tab.active').dataset.filter
   // Should return: '', 'overdue', 'due_soon', or 'active'
   ```

---

## TEST 7: Client List - Global Search

**Test ID:** RT-007
**Priority:** High
**Duration:** 5 minutes

### Objective
Verify global search finds customers across entire database by name, ID, email, and phone.

### Test Steps

#### Step 7.1: Locate Search Box

1. **Scroll to the client list section**
2. **Find the search box** (magnifying glass icon)
   - Located in the header above the table
   - Next to filter tabs

#### Step 7.2: Test Search by Customer Name

1. **Clear any existing search** (click X button if present)
2. **Click into the search box**
3. **Type:** `Overdue`
4. **Wait ~500ms** (search executes automatically)
5. **Observe:**
   - Table shows loading spinner briefly
   - Table updates with search results
   - **X (clear)** button appears in search box

**Check results:**
- [ ] "Test Customer - Overdue" appears in results
- [ ] Other customers with "Overdue" in name (if any) appear
- [ ] Total rows: ______ (Expected: 1)
- [ ] Search executes automatically (no Enter key needed)

**Record results:**
- Search found customer? ☐ Yes ☐ No
- Search delay: ______ milliseconds (~500ms expected)

#### Step 7.3: Test Partial Name Search (Case Insensitive)

1. **Clear search** (click X button)
2. **Type:** `test` (lowercase)
3. **Wait for results**

**Expected:**
- [ ] All 3 test customers appear (case-insensitive search)
- [ ] "Test Customer - Overdue"
- [ ] "Test Customer - Due Soon"
- [ ] "Test Customer - Active"

**Record results:**
- Found all test customers? ☐ Yes ☐ No
- Case-insensitive working? ☐ Yes ☐ No

#### Step 7.4: Test Search by Customer ID

1. **Get the Customer ID** of "Test Customer - Overdue"
   - Open the customer record: `/app/customer/CUST-XXXXX`
   - Copy the Customer ID (e.g., `CUST-00001`)
2. **Return to dashboard**
3. **Search for the Customer ID:** `CUST-00001`
4. **Check results:**
   - [ ] Finds the exact customer
   - [ ] No other results

**Record results:**
- Found by ID? ☐ Yes ☐ No
- Exact match only? ☐ Yes ☐ No

#### Step 7.5: Test Search by Email

1. **Clear search**
2. **Type:** `overdue.customer@test.com`
3. **Check results:**
   - [ ] Finds "Test Customer - Overdue"
   - [ ] Shows email in results (if email column visible)

**Record results:**
- Found by email? ☐ Yes ☐ No

#### Step 7.6: Test Search by Phone (if applicable)

1. **Clear search**
2. **Type:** `+1234567890` (or whatever phone you entered)
3. **Check results:**
   - [ ] Finds customer by phone number

**Record results:**
- Found by phone? ☐ Yes ☐ No

#### Step 7.7: Test Minimum Character Validation

1. **Clear search**
2. **Type:** `T` (only 1 character)
3. **Observe:**
   - Should show error message: "Search query must be at least 2 characters"
   - OR search should not execute
4. **Add second character:** `Te`
5. **Observe:**
   - Search should now execute
   - Results should appear

**Record results:**
- 1 character blocked? ☐ Yes ☐ No
- 2 characters allowed? ☐ Yes ☐ No
- Error message shown? ☐ Yes ☐ No

#### Step 7.8: Test Search with No Results

1. **Clear search**
2. **Type:** `zzzxxxxxzzz` (gibberish)
3. **Check table:**
   - Should show "No matching customers found" message
   - OR empty table with message
   - No customers visible

**Record results:**
- Empty state shown? ☐ Yes ☐ No
- Message displayed? ☐ Yes ☐ No

#### Step 7.9: Test Clear Search Button

1. **Search for:** `Test`
2. **Verify results appear**
3. **Click the X (clear) button** in the search box
4. **Observe:**
   - Search box clears
   - Table resets to show all customers (current filter)
   - X button disappears

**Record results:**
- Clear button works? ☐ Yes ☐ No
- Table resets? ☐ Yes ☐ No

#### Step 7.10: Test Search Across All Database (Not Just Current Page)

**This tests backend search vs frontend filter**

1. **If you have > 50 customers** (more than 1 page):
   - Search for a customer on page 2 or 3
   - Verify it appears in results even though not on current page
2. **If you have < 50 customers:**
   - Note that search returns all matching customers regardless of pagination

**Record results:**
- Searches entire database? ☐ Yes ☐ No (or ☐ N/A if < 50 customers)

### Expected Results

✅ **Search Functionality:**
- [ ] Searches by: customer name, ID, email, phone
- [ ] Case-insensitive search
- [ ] Partial match search (finds "Test" in "Test Customer")
- [ ] Auto-executes after ~500ms (debounced)
- [ ] Searches entire database, not just current page

✅ **Search Box UI:**
- [ ] Magnifying glass icon visible
- [ ] Placeholder text: "Search clients..."
- [ ] X (clear) button appears when text is entered
- [ ] Clear button removes search and resets table

✅ **Validation:**
- [ ] Minimum 2 characters required
- [ ] Shows error/validation message for 1 character
- [ ] Handles special characters safely

✅ **Results Display:**
- [ ] Loading spinner during search
- [ ] Results appear within 1 second
- [ ] "No matching customers" shown if no results
- [ ] Results are sorted (at-risk customers first)

### ⚠️ Fail Criteria
- Search doesn't find customer by name
- Search requires pressing Enter (should be automatic)
- Case-sensitive (fails to find "test" when customer is "Test")
- Allows search with 0 or 1 character
- Clear button doesn't work
- Search only finds customers on current page (should search all)

### 🐛 If Test Fails
1. **Check API call:**
   - Network → Find `search_customers?query=test`
   - Check response: should return matching customers
2. **Check console for errors**
3. **Verify debounce timing:**
   ```javascript
   // Check searchTimeout in code
   console.log(dashboard.searchTimeout);
   ```
4. **Test API directly:**
   ```python
   bench execute support_center.api.retention_dashboard.search_customers --kwargs "{'query': 'test', 'limit': 50}"
   ```

---

## TEST 8: Client List - Column Sorting

**Test ID:** RT-008
**Priority:** Medium
**Duration:** 5 minutes

### Objective
Verify table columns sort correctly in ascending and descending order.

### Test Steps

#### Step 8.1: Identify Sortable Columns

1. **Look at the table header row**
2. **Identify columns with sort arrows:**
   - Customer
   - Status
   - Priority
   - Renewal Date
   - Lifetime Value
   - Upsell Potential
   - Last Contacted

3. **Check visual indicators:**
   - [ ] Sortable columns have arrow icon (↓)
   - [ ] Cursor changes to pointer on hover
   - [ ] Header cells are clickable

#### Step 8.2: Test "Customer Name" Sorting

1. **Click "Customer" column header** once
2. **Observe:**
   - Arrow icon changes direction (↑ or ↓)
   - Table rows reorder instantly (no loading spinner)
   - Customers sorted alphabetically A→Z

**Check order:**
- First row: ______ (should start with A or early alphabet)
- Last row: ______ (should end with Z or late alphabet)

3. **Click "Customer" header again** (toggle sort)
4. **Observe:**
   - Order reverses (Z→A)
   - Arrow icon direction changes

**Record results:**
- Ascending sort works? ☐ Yes ☐ No
- Descending sort works? ☐ Yes ☐ No
- Sort is instant (client-side)? ☐ Yes ☐ No

#### Step 8.3: Test "Priority" Sorting

1. **Click "Priority" column header**
2. **Observe:**
   - Table sorts by priority score (numeric)
   - Highest priority first OR lowest priority first (check arrow)

**Expected order (descending - highest first):**
- Critical (score 80-100)
- High (score 60-79)
- Medium (score 40-59)
- Low (score 0-39)

**Check order:**
- First row priority: ______ (should be Critical or High)
- Last row priority: ______ (should be Low)

3. **Click "Priority" again**
4. **Observe reverse order:**
   - Low priority customers first
   - Critical priority customers last

**Record results:**
- Priority sort works? ☐ Yes ☐ No
- Numeric sorting (not alphabetic)? ☐ Yes ☐ No

#### Step 8.4: Test "Renewal Date" Sorting

1. **Click "Renewal Date" column header**
2. **Observe:**
   - Dates sort chronologically
   - Either oldest→newest or newest→oldest

**Check order:**
- First row date: ______ (if ascending, earliest date)
- Last row date: ______ (if ascending, latest date)

3. **Click "Renewal Date" again**
4. **Verify order reverses**

**Record results:**
- Date sort works? ☐ Yes ☐ No
- Chronological order? ☐ Yes ☐ No
- Overdue dates handled correctly? ☐ Yes ☐ No

#### Step 8.5: Test "Lifetime Value" Sorting

1. **Click "Lifetime Value" column header**
2. **Observe:**
   - Sorts by dollar amount (numeric)
   - Either lowest→highest or highest→lowest

**Check order:**
- First row LTV: $______ (if ascending, lowest value)
- Last row LTV: $______ (if ascending, highest value)

**Example expected order (ascending):**
- $2,000.00
- $6,000.00
- $15,000.00

3. **Click again to reverse**

**Record results:**
- LTV sort works? ☐ Yes ☐ No
- Numeric sorting (not string)? ☐ Yes ☐ No
- Currency format preserved? ☐ Yes ☐ No

#### Step 8.6: Test "Last Contacted" Sorting

1. **Click "Last Contacted" column header**
2. **Observe:**
   - Sorts by days ago (numeric)
   - OR sorts by date

**Check order:**
- Should sort by recency (most recent first OR oldest first)

3. **Toggle sort direction**

**Record results:**
- Last Contacted sort works? ☐ Yes ☐ No
- Empty values (never contacted) at end? ☐ Yes ☐ No

#### Step 8.7: Test Sort Indicator (Active Column)

1. **Click "Customer" header**
2. **Check visual indicators:**
   - [ ] "Customer" column header has different styling (active state)
   - [ ] Arrow icon is visible/highlighted
   - [ ] Other column arrows are grayed out or hidden

3. **Click "Priority" header**
4. **Check:**
   - [ ] "Priority" header now active
   - [ ] "Customer" header no longer active

**Record results:**
- Active column highlighted? ☐ Yes ☐ No
- Only one column active at a time? ☐ Yes ☐ No

#### Step 8.8: Test Sort Persistence Across Pages

**If you have > 50 customers (multiple pages):**

1. **Sort by "Priority"** (descending)
2. **Navigate to page 2** (click Next or page 2)
3. **Check:**
   - Sort order maintained on page 2
   - Highest priority customers on page 1, lower on page 2

**Record results:**
- Sort persists across pages? ☐ Yes ☐ No (or ☐ N/A if only 1 page)

#### Step 8.9: Test Sort with Filters

1. **Click "Overdue" filter tab**
2. **Sort by "Lifetime Value"** (descending)
3. **Switch to "Active" filter tab**
4. **Check:**
   - Sort is reset OR sort persists for new filter

**Expected behavior:** Sort may reset when changing filters (acceptable) OR persist (also acceptable)

**Record results:**
- Sort behavior with filters: ______ (Reset/Persist)

### Expected Results

✅ **Sorting Functionality:**
- [ ] All sortable columns sort correctly
- [ ] Clicking header once sorts ascending
- [ ] Clicking again sorts descending
- [ ] Sorting is instant (no API call, client-side)
- [ ] Arrow icon direction indicates sort direction

✅ **Sort Types:**
- [ ] Alphabetic sort: A→Z and Z→A
- [ ] Numeric sort: Lowest→Highest and Highest→Lowest
- [ ] Date sort: Oldest→Newest and Newest→Oldest

✅ **Visual Indicators:**
- [ ] Active sort column highlighted
- [ ] Arrow icon shows direction (↑ up = ascending, ↓ down = descending)
- [ ] Only one column active at a time

✅ **Edge Cases:**
- [ ] Handles empty values (sorts to end)
- [ ] Handles negative numbers (if any)
- [ ] Maintains sort when paginating

### ⚠️ Fail Criteria
- Clicking header doesn't sort
- Sort direction wrong (A→Z when expecting Z→A)
- Sort triggers API call (should be client-side)
- String sorting used for numbers (e.g., 10 < 2)
- Sort indicator doesn't show
- Sort resets unexpectedly

### 🐛 If Test Fails
1. **Check console** for errors
2. **Verify sort attribute:**
   ```javascript
   // Run in console:
   document.querySelector('.sortable[data-sort="priority"]').dataset.sort
   ```
3. **Check if event listener attached:**
   ```javascript
   // Should see click listener:
   getEventListeners(document.querySelector('.sortable'))
   ```

---

## TEST 9: Client List - Pagination

**Test ID:** RT-009
**Priority:** Medium
**Duration:** 5 minutes

### Objective
Verify pagination works correctly for large customer lists (>50 rows).

### Prerequisites
- **Option A:** Have >50 customers in database
- **Option B:** Temporarily change page size to 3 for testing:
  ```javascript
  // Run in console:
  dashboard.pageSize = 3;
  dashboard.loadClients();
  ```

### Test Steps

#### Step 9.1: Check Pagination Controls Visibility

1. **Scroll to bottom of client table**
2. **Look for pagination controls:**
   - Page number display (e.g., "1 / 5")
   - **Previous** button (◄)
   - **Next** button (►)
   - Page number buttons (1, 2, 3, ...)

3. **If pagination NOT visible:**
   - You have ≤50 customers (1 page only)
   - Run console command to reduce page size (see Prerequisites)

**Record results:**
- Pagination visible? ☐ Yes ☐ No
- Current page: ______ / ______

#### Step 9.2: Test "Next" Button

1. **Verify you're on page 1**
2. **Click "Next" button (►)**
3. **Observe:**
   - Table shows loading spinner briefly
   - Table updates with new rows (customers 51-100 or 4-6 if testing with pageSize=3)
   - Page indicator updates: "2 / X"
   - Scroll position returns to top of table

**Check new rows:**
- [ ] New customers visible (different from page 1)
- [ ] No duplicate rows from page 1
- [ ] All rows have data (no empty rows)

**Record results:**
- Next button works? ☐ Yes ☐ No
- Page indicator updated? ☐ Yes ☐ No
- Load time: ______ seconds (should be <2 seconds)

#### Step 9.3: Test "Previous" Button

1. **From page 2, click "Previous" button (◄)**
2. **Observe:**
   - Returns to page 1
   - Shows original customers from page 1
   - Page indicator: "1 / X"

**Record results:**
- Previous button works? ☐ Yes ☐ No
- Returned to page 1? ☐ Yes ☐ No

#### Step 9.4: Test Page Number Buttons (if visible)

**If pagination shows numbered buttons (1, 2, 3, ...):**

1. **Click page number "3"**
2. **Observe:**
   - Jumps directly to page 3
   - Skips page 2
   - Page indicator: "3 / X"

**Record results:**
- Page number buttons work? ☐ Yes ☐ No (or ☐ N/A if not visible)

#### Step 9.5: Test Button State on First Page

1. **Navigate to page 1**
2. **Check "Previous" button:**
   - [ ] Button is disabled (grayed out)
   - [ ] OR button is hidden
   - [ ] Clicking it does nothing

**Record results:**
- Previous disabled on page 1? ☐ Yes ☐ No

#### Step 9.6: Test Button State on Last Page

1. **Click "Next" repeatedly** until you reach the last page
2. **Check "Next" button:**
   - [ ] Button is disabled (grayed out)
   - [ ] OR button is hidden
   - [ ] Clicking it does nothing

**Record results:**
- Next disabled on last page? ☐ Yes ☐ No

#### Step 9.7: Test Pagination with Filters

1. **Navigate to page 2** (any filter)
2. **Click "Overdue" filter tab**
3. **Observe:**
   - Pagination resets to page 1
   - Shows page "1 / Y" (Y may be different from before)

**Record results:**
- Pagination resets on filter change? ☐ Yes ☐ No

#### Step 9.8: Test Pagination with Search

1. **Navigate to page 2**
2. **Search for:** `Test`
3. **Observe:**
   - Pagination resets to page 1
   - Shows search results
   - Pagination may disappear if results fit on 1 page

**Record results:**
- Pagination resets on search? ☐ Yes ☐ No

#### Step 9.9: Test Performance (Large Dataset)

**If you have 1000+ customers:**

1. **Navigate to page 50** (or any high page number)
2. **Measure load time:** _____ seconds
3. **Expected:** <2 seconds (if indexes installed)

**Record results:**
- Load time acceptable? ☐ Yes ☐ No

#### Step 9.10: Verify Row Count Per Page

1. **On any page, count visible rows** in the table
2. **Expected:** 50 rows (or whatever pageSize is set to)
3. **Last page may have fewer rows** (remainder)

**Record results:**
- Rows per page: ______ (Expected: 50)
- Consistent across pages? ☐ Yes ☐ No

### Expected Results

✅ **Pagination Controls:**
- [ ] Visible when >50 customers
- [ ] Show current page / total pages (e.g., "1 / 5")
- [ ] Previous and Next buttons present
- [ ] Buttons have icons (◄ ►)

✅ **Navigation:**
- [ ] "Next" loads next page within 1-2 seconds
- [ ] "Previous" loads previous page within 1-2 seconds
- [ ] Page number buttons jump to specific pages (if present)
- [ ] Scroll position returns to top of table after page change

✅ **Button States:**
- [ ] "Previous" disabled on page 1
- [ ] "Next" disabled on last page
- [ ] Disabled buttons are grayed out or hidden

✅ **Data Consistency:**
- [ ] Each page shows unique customers (no duplicates)
- [ ] Page size is consistent (50 rows per page)
- [ ] Last page shows remainder (may be < 50 rows)

✅ **Integration:**
- [ ] Pagination resets when changing filters
- [ ] Pagination resets when searching
- [ ] Sort order persists across pages

### ⚠️ Fail Criteria
- Pagination doesn't appear when >50 customers exist
- Next/Previous buttons don't work
- Duplicate customers appear across pages
- Page indicator doesn't update
- Load time >5 seconds per page
- Buttons enabled when they should be disabled

### 🐛 If Test Fails
1. **Check API call:**
   - Network → `get_clients_by_renewal_status?limit=50&offset=50`
   - Verify offset calculation: offset = (page - 1) * pageSize
2. **Check pagination state:**
   ```javascript
   // Run in console:
   console.log('Page:', dashboard.currentPage);
   console.log('Page Size:', dashboard.pageSize);
   console.log('Total Clients:', dashboard.totalClients);
   ```
3. **Check total count:**
   ```sql
   SELECT COUNT(*) FROM `tabCustomer` WHERE disabled = 0;
   ```

---

## TEST 10-15: [Continued in next section]

---

## Bug Reporting Template

Use this template when reporting bugs found during testing.

```markdown
### BUG REPORT

**Test ID:** RT-XXX
**Test Name:** [Test name]
**Severity:** Critical / High / Medium / Low
**Date Found:** YYYY-MM-DD
**Found By:** [Your name]

**Bug Description:**
[Short 1-sentence summary of the bug]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Result:**
[What should happen]

**Actual Result:**
[What actually happened]

**Browser:** Chrome 120 / Firefox 122 / Safari 17
**Screen Resolution:** 1920x1080
**Test Environment:** Dev / Staging / Production

**Console Errors:**
```
[Paste console errors here]
```

**Screenshots:**
[Attach screenshots]

**Network Logs:**
- API Call: `[API endpoint]`
- Status: `[200/500/etc]`
- Response: `[Paste relevant response]`

**Additional Notes:**
[Any other relevant information]
```

---

## Test Completion Checklist

After completing all 15 tests, verify:

### Core Functionality
- [ ] Dashboard loads within 5 seconds
- [ ] All KPI cards show data
- [ ] At-risk clients section displays customers
- [ ] Client list table shows all customers
- [ ] Filtering works (All, Overdue, Due Soon, Active)
- [ ] Search finds customers by name/ID/email/phone
- [ ] Sorting works on all sortable columns
- [ ] Pagination works (if >50 customers)

### Interactions
- [ ] Quick action cards navigate correctly
- [ ] "View all" links scroll to sections
- [ ] Customer cards are clickable
- [ ] Modal opens when clicking customer
- [ ] Calendar expands when clicking "View Full Calendar"

### Data Accuracy
- [ ] Overdue customers show red badges
- [ ] Due soon customers show orange badges
- [ ] LTV values match sales order totals
- [ ] Days until renewal/overdue are accurate
- [ ] Priority scores are reasonable

### Performance
- [ ] No load time >5 seconds
- [ ] Filtering/sorting is instant (<1 second)
- [ ] Pagination loads <2 seconds per page
- [ ] No memory leaks (use DevTools Memory profiler)

### Browser Compatibility
- [ ] Tested on Chrome
- [ ] Tested on Firefox
- [ ] Tested on Safari
- [ ] All features work identically

### No Critical Bugs
- [ ] No JavaScript errors in console
- [ ] No broken images or missing styles
- [ ] No API 500 errors
- [ ] No data corruption
- [ ] No security vulnerabilities

---

## Test Sign-off

**Tester Name:** _____________________
**Date Completed:** _____________________
**Total Bugs Found:** _____________________
**Critical Bugs:** _____________________
**Test Status:** ☐ Pass ☐ Fail ☐ Pass with Minor Issues

**Notes:**
[Any additional observations or recommendations]

---

**End of Testing Guide**
