# Product Requirements: Retention Dashboard

## Problem Statement

Account managers currently lack visibility into customer renewal timelines, at-risk accounts, and upsell opportunities. This results in:
- Missed renewal opportunities and increased churn
- Reactive rather than proactive customer engagement
- Lost revenue from unidentified upsell opportunities
- No centralized view of customer health metrics

## Solution Overview

A comprehensive retention dashboard that provides real-time visibility into customer renewals, identifies at-risk clients before they churn, and surfaces upsell opportunities across the customer base.

## Target Users

**Primary**: Account Managers, Customer Success Managers
**Secondary**: Sales Leadership, Revenue Operations

## Key Features

### 1. Executive Dashboard (Overview Tab)
Real-time KPIs with trends:
- Total active customers
- Clients at risk (overdue + inactive 90+ days)
- Revenue up for renewal (next 90 days)
- Upsell potential value
- Renewal rate %

**Business Value**: At-a-glance health check of customer base

### 2. Renewal Calendar (Calendar Tab)
Visual calendar showing upcoming renewals by date, color-coded by value:
- High value: $5,000+ (red)
- Medium value: $1,000-$5,000 (yellow)
- Low value: <$1,000 (green)

**Business Value**: Plan customer outreach and resource allocation

### 3. Client List (Clients Tab)
Filterable, searchable table of all customers with:
- Renewal status (Overdue / Due Soon / Active)
- Priority score (Critical / High / Medium / Low)
- Lifetime value
- Upsell opportunities
- One-click access to detailed customer profiles

**Business Value**: Prioritize which customers to contact first

### 4. Analytics (Analytics Tab)
Historical trends and insights:
- Renewal rate trend over 6-12 months
- New customers vs renewals comparison
- Revenue breakdown (renewal vs new)
- Product retention analysis (which products retain best)

**Business Value**: Identify patterns, forecast revenue, optimize product mix

## How It Works

### Data Flow
1. **Automatic Data Collection**: System continuously monitors Sales Orders and Subscriptions in ERPNext
2. **Smart Categorization**: Customers automatically classified by renewal status based on:
   - Subscription end dates
   - Days since last order
   - Order history patterns
3. **Priority Scoring**: Algorithm assigns priority scores (0-100) based on:
   - Revenue at risk
   - Days until/overdue renewal
   - Customer tier
   - Purchase history
4. **Real-Time Updates**: Dashboard refreshes with latest data on demand

### Typical Workflow

**Daily (Account Manager)**:
1. Log into dashboard
2. Check "Clients at Risk" section on Overview
3. Contact top 3-5 highest priority clients
4. Log follow-up actions in ERPNext

**Weekly (Sales Leadership)**:
1. Review Analytics tab for trends
2. Identify which account managers need support
3. Analyze product performance
4. Adjust team priorities based on data

## User Stories

**As an Account Manager**, I want to see which customers are overdue for renewal so I can reach out before they churn.

**As a Sales Leader**, I want to track renewal rate trends over time so I can measure team performance and forecast revenue.

**As an Account Manager**, I want to identify upsell opportunities so I can maximize revenue from existing customers.

**As a Customer Success Manager**, I want to see all renewals for the next 30 days so I can proactively schedule check-in calls.

## Success Metrics

### Primary KPIs
- **Renewal Rate**: Target 85%+ (track monthly)
- **Churn Reduction**: 20% reduction in customer churn within 6 months
- **Upsell Revenue**: 15% increase from identified opportunities

### Usage Metrics
- Daily active users (target: 80% of account managers)
- Average time to identify at-risk customers (target: <2 minutes)
- Number of customers contacted via dashboard insights

## Technical Summary

**Stack**:
- Backend: Python (Frappe/ERPNext framework)
- Frontend: Vanilla JavaScript + Chart.js
- Database: MariaDB (ERPNext standard)

**Integration**:
- Uses existing ERPNext data (Customers, Sales Orders, Subscriptions)
- No external dependencies
- Web-based, accessible from any browser

**Performance**:
- Supports 1,000+ customers without performance issues
- API response time <2 seconds for most queries
- Calendar loads month data in <1 second

## MVP Scope (Completed)

✅ Overview tab with KPIs
✅ Renewal calendar
✅ Client list with filtering
✅ Analytics charts
✅ Priority scoring algorithm
✅ Customer detail modal
✅ Responsive design

## Future Enhancements (Phase 2)

- Email alerts for high-priority at-risk clients
- Automated renewal reminder emails
- Integration with calendar apps (Google Calendar, Outlook)
- Mobile app
- Predictive churn modeling using ML
- Team performance dashboards
- Export to PDF/Excel

## Questions & Assumptions

**Assumptions**:
- Sales Orders have `custom_order_type` field (Renewal, New Order, etc.)
- Subscriptions track customer renewal dates
- Users have ERPNext access with appropriate permissions

**Open Questions**:
- What email notification frequency is desired?
- Should we integrate with existing CRM activities?
- Are there specific customer segments to prioritize?

---

**Status**: ✅ Completed and deployed
**Last Updated**: January 2026
**Owner**: Justus Buyu
