# Spadeworks: The Operating System for Enterprise Web Work

**Document Version:** 3.0  
**Date:** January 27, 2026  
**Status:** Investor & Customer Ready  
**Audience:** Investors, Enterprise Buyers, Strategic Partners  
**Target:** $3M ARR in 18 months (Realistic); Path to $10M ARR in 36 months

---

## Executive Summary

**Spadeworks** is an Enterprise Browser Orchestrator that eliminates the "Human Middleware" tax—the hidden cost of paying knowledge workers to copy-paste between browser tabs instead of doing the work they were hired to do.

### The Core Insight

Companies hire humans to *think*, but pay them to *click*.

- An average **SDR costs $60,000/year** but spends only **28-30% of their time actually selling**. The remaining $42,000 is wasted on CRM data entry, lead research, and "swivel-chair" integration between browser tabs. *(Source: Salesforce State of Sales 2024)*

- **Recruiters spend 13 hours/week** just sourcing on LinkedIn and **8 hours/week** on ATS administration—over 50% of their time on non-human tasks. *(Source: SHRM / LinkedIn Talent Solutions)*

- Employees switch applications **1,200 times per day**, costing **4 hours per week** in re-focusing time alone. *(Source: Harvard Business Review / Pega Systems)*

**Spadeworks reclaims this lost margin.** Unlike chatbots that merely *advise*, Spadeworks *acts*—clicking buttons, filling forms, and executing multi-step workflows autonomously. Unlike traditional RPA that breaks when UIs change, Spadeworks adapts intelligently.

### Why This Company, Why Now

The market for browser automation is splitting into two camps:

| Approach | Examples | Economics | Reliability |
|----------|----------|-----------|-------------|
| **Vision Agents** | MultiOn, Rabbit, Anthropic Computer Use | ~1,000+ tokens per screenshot (expensive) | Low (hallucinations, latency) |
| **DOM Agents** | **Spadeworks** | ~100-200 tokens per action (10x cheaper) | High (deterministic verification) |

**Spadeworks is 10x cheaper and 3x faster than vision-based competitors** because we connect directly to the browser's DOM rather than taking expensive screenshots. This economic advantage enables real-time workflows that vision models cannot support profitably.

---

## The Problem: The "Human Middleware" Tax

### Quantified Pain by Role

| Role | Annual Cost | Time on "Real Work" | Time Wasted | $ Wasted/Year |
|------|-------------|---------------------|-------------|---------------|
| **SDR** | $60,000 | 28-30% (selling) | 70% (admin, data entry) | **$42,000** |
| **Recruiter** | $75,000 | 45% (interviewing, deciding) | 55% (sourcing, ATS) | **$41,250** |
| **Customer Support** | $50,000 | 40% (helping customers) | 60% (toggling tabs, logging) | **$30,000** |
| **Operations Analyst** | $80,000 | 35% (analysis, decisions) | 65% (pulling data, reports) | **$52,000** |

**For a 100-person team of knowledge workers, this represents $3-4M annually in productivity friction.**

### The "Switching Tax"

Beyond role-specific waste, there's a universal cognitive cost:

- **1,200 app switches per day** per employee *(HBR/Pega Systems)*
- **4 hours/week** lost to re-focusing after each switch
- **23 minutes** average time to regain deep focus after an interruption *(UC Irvine)*

This is not a "nice to have" optimization. This is **margin leakage** that compounds across every knowledge worker in the organization.

### Why Existing Solutions Fail

**Traditional RPA (UiPath, Automation Anywhere, Blue Prism):**
- 6-12 months of developer time to build automations
- Breaks when target application updates UI (every 2-3 months on average)
- Cannot handle exceptions—fails silently or catastrophically
- **50%+ of RPA projects abandoned before value realization** *(Deloitte)*

**AI Chatbots (ChatGPT, Microsoft Copilot):**
- Provide instructions but cannot execute actions
- No awareness of what's on the user's screen
- Cannot access private organizational knowledge
- Create a "last mile" problem—employee still does the clicking

**Vision-Based Agents (MultiOn, Rabbit, Anthropic Computer Use):**
- Process screenshots through expensive vision models (~$0.01-0.03 per action)
- High latency (2-5 seconds per step)
- **Privacy nightmare**: screenshots capture everything on screen (passwords, PII, confidential data)
- Prone to hallucination on complex UIs

---

## The Solution: Orchestration, Not Automation

### What Spadeworks Does

Spadeworks is an **Enterprise Browser Orchestrator** that:

1. **Connects** — Bridges disconnected web apps (LinkedIn → Salesforce → Email → Calendar)
2. **Executes** — Autonomously completes multi-step workflows via natural language
3. **Verifies** — Deterministic state checking ensures actions succeeded before proceeding

### The "Verify-Act" Architecture (The Trust Factor)

Enterprises are terrified of "acting" AI that might hallucinate a deletion or submit incorrect data. Spadeworks addresses this with a **Deterministic DOM Verification Loop**:

```
PLAN → ACT → VERIFY STATE CHANGE → (CORRECT if needed) → PROCEED
```

Unlike black-box agents that "hope" the click worked:
- After every action, Spadeworks examines the resulting DOM to confirm the expected change occurred
- If a button click didn't register (network latency, JavaScript delay), the system detects this and retries
- If the expected outcome doesn't appear, Spadeworks tries alternative approaches (keyboard shortcut, different selector)
- **Result: 94% task completion rate vs. 60-70% industry average for traditional RPA**

This is **"Safe AI" for the enterprise**—auditable, verifiable, deterministic.

### The Semantic DOM Advantage

| Capability | Vision Agents | Traditional RPA | Spadeworks (DOM) |
|------------|---------------|-----------------|------------------|
| **Cost per Action** | $0.01-0.03 (1,000+ tokens) | N/A (licensed) | **$0.001-0.003** (100-200 tokens) |
| **Latency** | 2-5 seconds | <1 second | **<1 second** |
| **UI Change Resilience** | Low (hallucinations) | Very Low (brittle selectors) | **High** (semantic/accessibility-first) |
| **Data Privacy** | Low (screenshots capture all) | Medium (on-prem option) | **High** (sanitized DOM, no visual capture) |
| **Setup Time** | Minutes | Months (consultants) | **Minutes** |

**Why Semantic DOM?** Traditional automation identifies elements by CSS selectors or XPath—addresses that change whenever a developer updates the UI. Spadeworks uses the browser's accessibility tree, identifying elements by their *semantic meaning* (e.g., "Submit button" not "div.btn-primary-v2"). When Salesforce pushes a UI update, Spadeworks keeps working.

### Human-Like Reasoning with Knowledge Injection

The AI doesn't execute rote scripts. Before acting, it:
- **Checks completeness:** "Add patient" → but what's their date of birth? (Asks, doesn't fail)
- **Retrieves context:** Pulls relevant organizational policies (expense limits, approval workflows, compliance rules)
- **Adapts to state:** If "Submit" is grayed out, checks for required fields

Private knowledge (SOPs, policy documents, training materials) is chunked, embedded, and stored in a **tenant-isolated vector database**. The AI retrieves *only* relevant organizational knowledge—your procedures, not generic internet advice.

---

## Target Market: Who Buys First

### Ideal Customer Profile (ICP) — Initial Wedge

| Attribute | Specification |
|-----------|---------------|
| **Company Size** | 100-2,000 employees (mid-market first, enterprise follow) |
| **Role Density** | High concentration of SDRs, Recruiters, Customer Support, or Ops |
| **System Landscape** | 5+ web applications used daily; no API integrations between them |
| **Budget Authority** | Department-level (VP/Director) can approve $20-50k without CFO sign-off |
| **Pain Intensity** | Visible productivity complaints; turnover in admin-heavy roles |

### Priority Verticals (Ranked by Speed to Close)

| Vertical | Key Use Cases | Why They Buy Fast | Pilot ACV |
|----------|---------------|-------------------|-----------|
| **Staffing & Recruiting** | LinkedIn sourcing → ATS, candidate outreach, interview scheduling | Recruiters are expensive; billable hour model makes ROI obvious | $20-40k |
| **Sales Enablement** | Lead research, CRM hygiene, outbound sequencing | SDR time is directly tied to pipeline; fast ROI calculation | $25-50k |
| **Customer Support** | Ticket triage, cross-app data pull, knowledge lookup | AHT reduction is a tracked KPI; easy to measure | $20-35k |
| **Professional Services** | Time tracking, billing, client onboarding | Billable hour leakage is a P&L hit; partners care | $30-60k |

### The Buyer Journey

**Economic Buyer:** VP/Director of Operations, Sales, HR, or CX
- *Motivation:* Headcount efficiency, productivity metrics, "AI initiative" success

**Technical Buyer:** IT Security, Enterprise Architecture
- *Concerns:* Data privacy (no screenshots), SSO integration, audit logging
- *Our answer:* Sanitized DOM (no visual capture), SAML/OIDC, complete audit trail

**End User Champion:** Team Lead, Operations Manager
- *Motivation:* Reduce team frustration, look innovative, get promoted
- *Our answer:* Immediate value demo (5-minute "wow" moment), no training required

**Sales Cycle:**
- **Mid-market (pilot):** 30-60 days
- **Enterprise (full deployment):** 90-180 days (hence land-and-expand strategy)

---

## Use Cases: The "Bleeding Neck" Workflows

These use cases share critical characteristics that make them ideal for Spadeworks:
- **Multiple Portals:** User visits Site A → Site B → Site C
- **Read-Write Pattern:** Extract data from one source, input into another
- **No APIs:** Target sites are hostile to integrations (government, insurance, legacy systems)
- **High Frequency:** Daily or weekly repetition

### Use Case Ranking Matrix

| Rank | Use Case | Segment | Importance | Ease | Time Saved | Strategic Value |
|------|----------|---------|------------|------|------------|-----------------|
| **1** | Recruiting: Sourcing Bridge | Enterprise | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 5 min/candidate | Beachhead market |
| **2** | SDR: Lead Enrichment Loop | Enterprise | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 8 min/lead | High volume, clear ROI |
| **3** | Insurance: Universal Quoter | SMB | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 42 min/quote | Zero competition |
| **4** | AP: Invoice Harvester | Enterprise | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 20-30 hr/month | High stickiness |
| **5** | Logistics: Container Tracker | SMB | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 2-3 hr/day | Critical operations |
| **6** | Healthcare: Claims Status Bot | SMB | ⭐⭐⭐⭐ | ⭐⭐⭐ | 15 min/claim | AR acceleration |
| **7** | Compliance: KYB/KYC Bot | Enterprise | ⭐⭐⭐⭐ | ⭐⭐⭐ | 19.5 min/check | Risk mitigation |
| **8** | Job Seeker: Application Blaster | B2C | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 4 hr/session | Viral potential |
| **9** | Real Estate: Listing Sync | Prosumer | ⭐⭐⭐ | ⭐⭐⭐⭐ | 30 min/update | Recurring usage |
| **10** | Reseller: Cross-Lister | B2C | ⭐⭐⭐ | ⭐⭐⭐ | 20 min/listing | Revenue impact |

---

### Tier 1: "Bleeding Neck" Markets (Immediate ROI)

#### **Use Case #1: The "Sourcing Bridge" (Recruiting)**

**Target:** High-Volume Staffing Agencies, Enterprise Talent Teams  
**Priority:** ⭐⭐⭐⭐⭐ HIGHEST — This is our beachhead market  
**The Pain:** Recruiters spend **13 hours/week** sourcing and **8 hours/week** on data entry. The "LinkedIn to ATS" gap is the #1 complaint in the industry.

**The Manual Workflow (Today):**
```
1. Find candidate on LinkedIn/GitHub
2. Copy Name, Headline, Company, URL
3. Switch tab to Greenhouse/Lever (ATS)
4. Paste fields one by one to create candidate
5. Switch tab to Gmail
6. Draft outreach email using same data
7. Switch back to LinkedIn, repeat
```
**Time:** ~5 minutes per candidate

**The Spadeworks Workflow:**
```
1. Recruiter clicks "Qualify" on LinkedIn profile
2. Spadeworks extracts profile data (DOM)
3. Opens background tab to Greenhouse
4. Inputs data, saves profile
5. Opens Gmail, drafts personalized email
6. Returns control to recruiter
```
**Time:** ~30 seconds per candidate

**ROI Calculation:**
- Team of 10 recruiters sourcing 20 candidates/day each
- Time saved: 4.5 min × 20 candidates × 10 recruiters = **15 hours/day**
- At $37.50/hr (recruiter loaded cost): **$562/day = $146,000/year**
- Spadeworks cost: ~$30,000/year
- **Net ROI: $116,000/year (387%)**

**Why We Win:** The LinkedIn → ATS workflow is the most standardized, high-volume, and "broken" workflow on the web. Perfect proving ground for our architecture.

---

#### **Use Case #2: The "Lead Enrichment Loop" (SDR)**

**Target:** B2B SaaS Companies, Lead Gen Agencies  
**Priority:** ⭐⭐⭐⭐⭐ HIGH — Clear ROI, large market  
**The Pain:** SDRs spend **70% of their time** on non-selling activities (research and CRM entry).

**The Manual Workflow (Today):**
```
1. Visit target company website
2. Look for "About Us" to find Decision Maker
3. Switch to Salesforce/HubSpot to check if lead exists
4. If not, create the Lead record
5. Search Google News for a "hook" (recent funding, new product)
6. Write personalized email
7. Log activity in CRM
```
**Time:** ~8 minutes per lead

**The Spadeworks Workflow:**
```
1. SDR lands on company homepage
2. Spadeworks scans page for key roles (CEO, VP)
3. Checks Salesforce in background (prevents duplicates)
4. Highlights "New Lead" or "Existing Customer" on page
5. One click: adds to CRM + drafts intro email using News page
```
**Time:** ~1 minute per lead

**ROI Calculation:**
- SDR working 50 leads/day
- Time saved: 7 min × 50 leads = **5.8 hours/day per SDR**
- Value of SDR time redirected to selling: **$20,000-$30,000/year per SDR**
- 10-person SDR team: **$200,000-$300,000/year reclaimed**

**Why We Win:** We prevent CRM duplicates automatically. This alone is worth the subscription for sales ops teams.

---

#### **Use Case #3: The "Universal Quoter" (Insurance)**

**Target:** Independent Insurance Agencies (Auto, Home, Commercial)  
**Priority:** ⭐⭐⭐⭐⭐ HIGH — Massive ROI, zero modern tech in this market  
**The Pain:** An independent broker represents 5+ carriers (Progressive, Travelers, Geico). To quote a client, they must **manually type the same data into 5 different portals**.

**The Manual Workflow (Today):**
```
1. Open Client Intake Form (PDF/Email)
2. Open Carrier A Portal → Paste Data → Click "Quote" → Copy Price
3. Open Carrier B Portal → Paste Data → Click "Quote" → Copy Price
4. Repeat for Carrier C, D, E
5. Create comparison PDF for client
```
**Time:** ~45 minutes per quote

**The Spadeworks Workflow:**
```
1. Trigger: "Get Auto quotes for this client"
2. Spadeworks reads client data from intake form
3. Opens 5 background tabs (one per carrier)
4. Fills quote forms simultaneously (handles dropdowns like "Vehicle Trim")
5. Retrieves final dollar amounts
6. Populates comparison spreadsheet
```
**Time:** ~3 minutes per quote

**ROI Calculation:**
- Broker processes 10 quotes/day
- Time saved: 42 min × 10 = **7 hours/day**
- At $50/hr: **$87,500/year**
- Spadeworks cost: ~$15,000/year
- **Net ROI: $72,500/year (483%)**

**Why We Win:** Carrier APIs are restricted to huge enterprises. Small agencies have **zero automation today**. We're the first solution they can actually use.

---

#### **Use Case #4: The "Invoice Harvester" (Accounts Payable)**

**Target:** Mid-market Finance Teams, Outsourced Accounting Firms  
**Priority:** ⭐⭐⭐⭐ HIGH — Deep stickiness, monthly recurring usage  
**The Pain:** 60% of invoices don't arrive via email (Amazon Business, Google Ads, utilities, SaaS tools). AP clerks spend the **first 3 days of every month** logging into 40+ portals to download PDFs.

**The Manual Workflow (Today):**
```
1. Log in to Amazon Business
2. Filter orders by "Last Month"
3. Click "Invoice" → "Download PDF" for every transaction
4. Rename file to "Amazon_Date_Amount"
5. Upload to NetSuite/QuickBooks
6. Repeat for 40 vendors
```
**Time:** 20-30 hours per month

**The Spadeworks Workflow:**
```
1. Trigger: "Fetch last month's invoices for these 20 vendors"
2. Spadeworks iterates through URL list (Amazon, Uber, Comcast)
3. Logs in, navigates to "Billing History"
4. Filters by date, downloads PDFs
5. Renames files based on DOM text (Date/Amount)
6. Uploads to Google Drive folder
```
**Time:** 2-3 hours per month

**ROI Calculation:**
- 25 hours saved × $40/hr (AP clerk) = **$1,000/month = $12,000/year**
- Spadeworks cost: ~$6,000/year
- **Net ROI: $6,000/year (100%)**
- **Strategic value:** Reduces "month-end close" stress; CFO loves this

**Why We Win:** This is pure drudgery. No one wants this job. Automating it improves retention and morale beyond the direct time savings.

---

### Tier 2: "Operational Backbone" (High Stickiness)

#### **Use Case #5: The "Container Tracker" (Logistics)**

**Target:** Freight Forwarders, Import/Export Managers  
**Priority:** ⭐⭐⭐⭐ MEDIUM-HIGH — Critical operations, daily usage  
**The Pain:** Tracking shipment status involves visiting 10+ carrier websites (Maersk, MSC, CMA CGM) daily, solving CAPTCHAs, and pasting dates into Excel.

**The Manual Workflow (Today):**
```
1. Copy Container ID from Excel
2. Go to Carrier Website (e.g., Maersk)
3. Paste ID, solve CAPTCHA, click "Track"
4. Copy "Estimated Arrival Date"
5. Paste back into Excel/ERP
6. Repeat for 50 containers
```
**Time:** 2-3 hours/day

**The Spadeworks Workflow:**
```
1. User highlights column of Container IDs in Google Sheets
2. Spadeworks iterates through list
3. Opens carrier site, handles search
4. Extracts arrival date, updates sheet
5. Flags any "delayed" shipments
```
**Time:** 15-20 minutes/day

**ROI Calculation:**
- 2.5 hours saved/day × $30/hr = **$18,750/year**
- Plus: Early delay detection prevents downstream chaos

**Why We Win:** Carrier websites are notoriously hostile to automation. Our DOM approach handles their quirks.

---

#### **Use Case #6: The "Claims Status Robot" (Healthcare Admin)**

**Target:** Private Clinics, Medical Billing Companies  
**Priority:** ⭐⭐⭐⭐ MEDIUM-HIGH — 25% of healthcare spending is admin  
**The Pain:** Checking claim status requires logging into disparate payer portals (UHC, Aetna, Cigna) repeatedly.

**The Manual Workflow (Today):**
```
1. Log in to Payer Portal
2. Search for Patient by Name/DOB
3. Check if Claim is "Paid", "Denied", or "Pending"
4. Download Explanation of Benefits (PDF)
5. Upload PDF to EHR (Electronic Health Record)
6. Repeat for 20+ claims
```
**Time:** 15-20 minutes per claim

**The Spadeworks Workflow:**
```
1. Spadeworks runs morning loop: "Check status for these 20 pending claims"
2. Logs in to each payer portal
3. Checks status, downloads PDFs
4. Attaches to patient record in DrChrono/Epic
5. Flags denials for follow-up
```
**Time:** 30 seconds per claim (automated)

**ROI Calculation:**
- 20 claims × 15 min = 5 hours/day saved
- **Accelerated cash flow:** AR days reduced by 5-10 days
- **Staff burnout reduction:** This is the #1 hated task in medical billing

**Why We Win:** Payer portals have no APIs for small practices. We're the only automation option.

---

#### **Use Case #7: The "Due Diligence Bot" (KYB/KYC Compliance)**

**Target:** Fintechs, Law Firms, Commercial Real Estate  
**Priority:** ⭐⭐⭐⭐ MEDIUM-HIGH — Risk mitigation, audit trail  
**The Pain:** Before onboarding a business client, analysts must verify they exist and aren't sanctioned. This requires checking 4-5 government databases with **no APIs**.

**The Manual Workflow (Today):**
```
1. Copy Company Name
2. Search Secretary of State website (verify active status) → Screenshot
3. Search OFAC Sanctions List → Screenshot
4. Search Google News for "Company Name + Fraud" → Screenshot
5. Compile screenshots into PDF report
```
**Time:** 20 minutes per check

**The Spadeworks Workflow:**
```
1. Trigger: "Run KYB check on 'Acme Corp' in Delaware"
2. Spadeworks visits Delaware entity search
3. Verifies status, captures evidence
4. Checks OFAC sanctions list
5. Scrapes recent news headers
6. Compiles "Pass/Fail" summary with evidence screenshots
```
**Time:** 30 seconds per check

**ROI Calculation:**
- 50 checks/week × 19.5 min saved = **16 hours/week**
- At $75/hr (compliance analyst): **$62,400/year**
- Plus: Reduced compliance risk, audit-ready documentation

**Why We Win:** Government databases are the ultimate "no API" environment. Our DOM approach is the only solution.

---

### Tier 3: "General Consumer" (B2C & Prosumer)

#### **Use Case #8: The "Application Blaster" (Job Seekers)**

**Target:** Job hunters, University Graduates  
**Priority:** ⭐⭐⭐ MEDIUM — High viral potential, lower revenue per user  
**The Pain:** Applying to jobs on Workday/Taleo requires creating a new account and re-typing resume data for **every single application**.

**The Manual Workflow (Today):**
```
1. Find job posting
2. Create Workday account (new password)
3. Manually type Name, Address, Education, Experience
4. Upload resume (which they ignore and ask you to re-type)
5. Answer screening questions
6. Submit
7. Repeat 50 times
```
**Time:** 6-10 minutes per application × 50 = **5-8 hours**

**The Spadeworks Workflow:**
```
1. User clicks "Apply to this job"
2. Spadeworks detects Workday structure
3. Creates account (saves temp password)
4. Parses user's PDF resume
5. Fills education/experience fields
6. Stops only for "Submit" click (human verification)
```
**Time:** 1-2 minutes per application × 50 = **1-1.5 hours**

**Value Proposition:** "Apply to 50 jobs in 1 hour instead of 5 hours."

**Strategic Value:**
- **Viral hook:** Job seekers share tools that help them
- **Trojan horse:** Recruiters see this, want it for their team
- **B2C → B2B conversion:** Individual user becomes enterprise champion

---

#### **Use Case #9: The "Listing Synchronizer" (Real Estate)**

**Target:** Property Managers, Airbnb Hosts  
**Priority:** ⭐⭐⭐ MEDIUM — Recurring usage, prevents costly errors  
**The Pain:** Listing a property requires manually updating availability and pricing across Zillow, Airbnb, VRBO, and Apartments.com.

**The Manual Workflow (Today):**
```
1. Update calendar on Airbnb
2. Log in to VRBO → Update same dates
3. Log in to Zillow → Update same dates
4. Log in to Apartments.com → Update same dates
```
**Time:** 30 minutes per update

**The Spadeworks Workflow:**
```
1. Trigger: "Block these dates on all platforms"
2. Spadeworks logs into each site
3. Updates calendar availability on all platforms
4. Confirms sync complete
```
**Time:** 2-3 minutes per update

**Value Proposition:**
- Prevents double-bookings (which cost $500+ in refunds/penalties)
- Saves 30 minutes per update × 10 updates/month = **5 hours/month**

---

#### **Use Case #10: The "Cross-Lister" (E-commerce Resellers)**

**Target:** eBay, Poshmark, Mercari, Depop sellers  
**Priority:** ⭐⭐⭐ MEDIUM — Direct revenue impact for users  
**The Pain:** To maximize sales, resellers list the same item on 4 platforms. Existing software (Vendoo) costs $30-50/month and is often buggy.

**The Manual Workflow (Today):**
```
1. Create listing on eBay (upload photos, write description, set price)
2. Open Poshmark → Upload same photos → Copy title/desc → Paste
3. Open Mercari → Repeat
4. Open Depop → Repeat
```
**Time:** 20-30 minutes per listing

**The Spadeworks Workflow:**
```
1. Trigger: "Copy this active eBay listing to Poshmark and Mercari"
2. Spadeworks grabs images and text from eBay
3. Opens Poshmark/Mercari
4. Fills forms, maps categories (e.g., "Men's Shoes" → "Men's Footwear")
5. Saves as Draft or Publishes
```
**Time:** 2-3 minutes per listing

**Value Proposition:**
- More exposure = more sales (immediate revenue impact)
- Undercuts Vendoo pricing while offering more flexibility

**Why We Win:** We don't need official API access to marketplaces (which is hard to get). We just automate the browser.

---

### Strategic Targeting Summary

| Segment | Target User | The "Verified" Hook | Success Metric |
|---------|-------------|---------------------|----------------|
| **Enterprise (Primary)** | **Recruiters** | "Stop copy-pasting from LinkedIn." | Candidates Sourced/Hour |
| **Enterprise** | **SDRs** | "Research leads while you sleep." | Dials/Day |
| **SMB** | **Insurance Brokers** | "Quote 5 carriers in 3 minutes." | Quotes/Day |
| **SMB** | **AP Clerks** | "Auto-download all invoices." | Hours Saved/Month |
| **SMB** | **Logistics Mgr** | "Check 100 containers in 1 click." | Hours Saved/Day |
| **SMB** | **Medical Billers** | "Auto-download claim PDFs." | Claims Processed/Hour |
| **Enterprise** | **Compliance Analysts** | "KYB checks in 30 seconds." | Checks/Day |
| **Consumer** | **Job Seekers** | "Auto-fill Workday applications." | Applications/Day |
| **Prosumer** | **Property Managers** | "Sync listings across platforms." | Double-Bookings Prevented |
| **Consumer** | **Resellers** | "List once, sell everywhere." | Listings/Hour |

### Go-to-Market Phasing

**Phase 1 (Months 1-6): Beachhead**
- Focus exclusively on **Recruiting (#1)** and **SDR (#2)**
- The "LinkedIn ↔ Other Tab" workflow is the most standardized, high-volume, and broken workflow on the web
- Build case studies, refine product, establish credibility

**Phase 2 (Months 7-12): Expand to Adjacent Markets**
- Add **Insurance (#3)** and **AP/Finance (#4)**
- These share similar "multi-portal" patterns but different buyers
- Proves horizontal applicability

**Phase 3 (Months 13-18): Full Portfolio**
- Enable all 10 use cases
- B2C use cases (#8, #9, #10) drive viral adoption
- B2C users convert to B2B champions

---

## Competitive Positioning

### The "Why Us" Grid

| Feature | **Spadeworks (DOM)** | **UiPath (RPA)** | **MultiOn / Rabbit (Vision)** | **ChatGPT / Copilot** |
|---------|---------------------|------------------|------------------------------|----------------------|
| **Setup Time** | Minutes (Extension) | Months (Consultants) | Minutes | Minutes |
| **Executes Actions** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No (advises only) |
| **UI Change Resilience** | ✅ High (Semantic) | ❌ Low (Brittle) | ⚠️ Medium (Hallucinations) | N/A |
| **Cost per Action** | $ (Text Tokens) | $$ (Server Licensing) | $$$ (Image Tokens) | N/A |
| **Data Privacy** | ✅ High (Sanitized DOM) | ⚠️ Medium (On-Prem) | ❌ Low (Screenshots) | ⚠️ Medium |
| **Private Knowledge** | ✅ Yes (RAG) | ❌ No | ❌ No | ⚠️ Limited |
| **Verification Loop** | ✅ Deterministic | ❌ No | ❌ No | N/A |

### Competitive Moats

**1. Accumulated Organizational Knowledge**
Once a customer uploads SOPs and the AI learns their processes, switching means rebuilding. The more they use us, the smarter we get about *their* specific workflows.

**2. Economic Advantage**
10x cheaper than vision agents means we can profitably serve use cases they cannot. This isn't a feature—it's structural.

**3. Trust Through Verification**
Enterprises won't deploy "acting" AI without auditability. Our Verify-Act loop creates the confidence other agents lack.

**4. Distribution via Individuals**
Unlike enterprise-only tools, our browser extension can spread virally through individual adoption (see B2C strategy below).

---

## Strategic Differentiation: Where We Fit

### Spadeworks vs. Perplexity: Different Problems, Different Solutions

A common question: "How is this different from Perplexity or ChatGPT?" The answer: **We're not competing. We're complementary.**

| Dimension | **Perplexity (Research Agent)** | **Spadeworks (Operations Agent)** |
|-----------|--------------------------------|----------------------------------|
| **Primary Goal** | Information Retrieval | Task Execution |
| **Mode** | **Read-Only** | **Read-Write** |
| **Context** | Public Web | Private, Authenticated Web |
| **Example Query** | "Find me the cheapest flight to Tokyo" | "Log into *my* expensing portal, upload this PDF, and click submit" |
| **Limitation** | Cannot log into Salesforce, navigate internal portals, or upload files to private systems | Requires user's authenticated browser session |
| **Output** | An answer | A completed task |

**The Key Insight:**
> *Perplexity helps you decide **what** to do. Spadeworks **does** it for you.*

**Why This Matters:**
- Perplexity is legally and technically **barred** from touching auth-walled workflows
- Spadeworks lives *inside* your browser session—it can navigate your private admin portals, internal tools, and authenticated apps
- This is not a feature gap—it's a **fundamental architectural difference**

### The "Missing Middle" in the Automation Landscape

Spadeworks fills a critical gap between rigid bots and chatty LLMs:

| Solution | Strength | Weakness | **Spadeworks Position** |
|----------|----------|----------|------------------------|
| **Traditional RPA** (UiPath, Blue Prism) | Robust, Enterprise-ready | Expensive ($10k+), breaks on UI changes, requires engineers | **We are Agile RPA.** No setup, self-heals when UI changes. |
| **AI Chatbots** (ChatGPT, Claude, Perplexity) | Smart, easy to converse | Can't "click" buttons. "I can't browse that for you." | **We are the Hands.** We give the AI brain the ability to act. |
| **Vision Agents** (MultiOn, Rabbit) | Can browse anything | Slow, expensive ($$$), hallucinates coordinates | **We are the Efficient Alternative.** DOM-based = 10x faster/cheaper. |
| **Workflow Tools** (Zapier, Make) | Easy integrations | Only works with apps that have APIs | **We are the Universal Adapter.** Works with any web UI. |

**Our Landscape Position:**
> **Spadeworks is "Democratized RPA"—automation for the rest of us.**

We allow any user to spin up a mini-RPA bot for a 5-minute task without asking IT for permission, waiting for developers, or paying enterprise licensing fees.

### The Deep Necessity: Why This Product *Must* Exist

**The "API Gap" Problem:**
> **APIs are missing for 80% of the web.**

- *Ideally*, your CRM would talk to your Email automatically. But it doesn't.
- *Ideally*, your Supplier Portal would sync with your ERP. But it doesn't.
- *Ideally*, your Insurance Carrier would have an API. But it doesn't.

**Spadeworks is the Universal Adapter** for systems that were never designed to talk to each other.

**The Triggers That Drive Adoption:**

| Trigger Type | User Moment | Willingness to Pay |
|--------------|-------------|-------------------|
| **The "Drudgery" Trigger** | "I have to copy-paste these 50 rows into this web form." | "I will pay $20 right now to not do this." |
| **The "Context" Trigger** | "I'm looking at a candidate on LinkedIn. Why do I have to open another tab to check if they're in our database?" | "Show me the answer *here*, on this page." |
| **The "Error" Trigger** | "I just spent 30 minutes filling this form and it timed out." | "Never make me do this manually again." |
| **The "Repetition" Trigger** | "I do this exact same 15-click workflow 20 times a day." | "There has to be a better way." |

### Platform Strategy: The Chrome + AI Ecosystem

Spadeworks is positioned as the **"Action Layer"** for the browser + AI ecosystem:

**Chrome as the Operating System:**
- We transform Chrome from a "passive viewer" into an "active worker"
- Aligns with the industry vision of the browser as the center of productivity
- No installation beyond a lightweight extension

**AI as the Brain (Model-Agnostic):**
- We prove that frontier AI models aren't just chatbots—they're orchestration engines
- Spadeworks provides the "Body" for the AI's "Brain"
- Works with GPT-4, Claude, Gemini, and emerging models

**Workspace Continuity (Example):**
```
Scenario: You receive an invoice in Gmail

Manual Process:
1. Open email → 2. Download PDF → 3. Open Sheets → 4. Type amount → 
5. Open Drive → 6. Upload PDF → 7. Return to email → 8. Mark as processed

Spadeworks Process:
1. "Process this invoice"
2. Done. (AI reads email, logs to Sheets, uploads to Drive, marks complete)
```

**Why This Works:**
- Makes any productivity suite "Agentic" without requiring native integrations
- Works with Google Workspace, Microsoft 365, or any combination
- No vendor lock-in—we're the neutral orchestration layer

### The Positioning Summary

| Audience | The Message |
|----------|-------------|
| **Investors** | "We're building the operating system for enterprise web work—the infrastructure layer between AI brains and browser actions." |
| **Enterprise Buyers** | "Reclaim 30-50% of your team's wasted time without RPA consultants, API integrations, or IT projects." |
| **End Users** | "Stop being the middleware. Describe what you want done, and we'll do the clicking." |
| **Hackathon Judges** | "We're the Action Layer for Chrome and AI—turning the browser into an autonomous worker." |

**The One-Line Differentiator:**
> **Perplexity is for Knowing. Spadeworks is for Doing.**

---

## Business Model: Realistic Unit Economics

### The Critical Correction

Previous projections of $10M ARR in Year 1 with 70-100 enterprise deals were **not credible**. Enterprise sales cycles are 6-9 months; a seed-stage startup closing 70+ $100k+ deals in Year 1 is statistically improbable.

**Revised approach: Land & Expand with dual B2B/B2C motion.**

### Pricing Architecture

#### B2B: Enterprise & Mid-Market

| Component | Description | Price |
|-----------|-------------|-------|
| **Platform Fee** | Tenant setup, SSO, security, maintenance | $1,000/month |
| **Seat License** | Per user with dashboard access | $50-100/user/month |
| **Task Credits** | Pay-per-successful-action for heavy automation | $0.10-0.25 per complex task |

**Typical Deal Structures:**

| Segment | Users | Monthly | Annual (ACV) |
|---------|-------|---------|--------------|
| **Pilot (Department)** | 10-25 | $1,500-3,500 | **$18k-42k** |
| **Mid-Market** | 50-200 | $6,000-22,000 | **$72k-264k** |
| **Enterprise** | 500+ | $50,000+ | **$600k+** |

**Why Hybrid Pricing Works:**
- Platform fee covers your fixed costs (infrastructure, support)
- Seat licenses provide predictable ARR
- Task credits align incentives—if the agent fails, they don't pay; this builds trust

#### B2C: The "Trojan Horse" Strategy

| Tier | Price | Credits/Month | Key Features |
|------|-------|---------------|--------------|
| **Free** | $0 | 50 credits | Step-by-step mode (human clicks "next"); virality/awareness |
| **Personal** | $20/month | 2,000 credits | Autonomous execution, cross-tab memory, standard models |
| **Power** | $50/month | 10,000 credits | Scheduler ("run at 9am daily"), reasoning engine, priority support |

**Credit Economy (How to Hide Tokens):**

| Action Type | Credits | Examples |
|-------------|---------|----------|
| **Simple** | 1 credit | Click, type, scroll, read element |
| **Complex** | 10 credits | "Analyze this page and find the Apply button" |
| **Premium** | 50 credits | External search, CAPTCHA solving, multi-page reasoning |

**Why B2C Matters for B2B:**
1. **Adoption:** A recruiter installs "Spadeworks Personal" for their own job search
2. **Infiltration:** They bring it to work because it makes them 2x faster at sourcing
3. **Discovery:** Their boss asks, "How are you so productive?"
4. **Conversion:** You sell Enterprise Edition (SSO, audit logs, private knowledge) to the company

This "bottom-up" motion reduces CAC and creates organic demand.

---

## Financial Projections: Grounded in Reality

### Revised Unit Economics

| Metric | Previous (Unrealistic) | Revised (Credible) | Benchmark |
|--------|------------------------|--------------------| ----------|
| **LTV:CAC** | 18:1 | **5:1** | Top SaaS: 3:1 to 5:1 |
| **ACV (Average)** | $120k | **$40k** (blended pilots + expansion) | Appropriate for mid-market entry |
| **CAC** | $30k | **$15k** (blended with PLG) | PLG reduces enterprise CAC |
| **Sales Cycle** | 60-90 days | **90-120 days** (enterprise); 14-30 days (mid-market) | Realistic for new vendor |
| **Gross Margin** | 80% | **75%** (accounts for LLM costs) | In-line with AI-native SaaS |

### 18-Month Revenue Plan

**Phase 1: Foundation (Months 1-6)**
- Close 10-15 design partners/pilots at $20-40k ACV
- Launch B2C tiers (Free + $20/month)
- **Target: $400k ARR exiting Month 6**
- Focus: Prove value, gather case studies, refine ICP

**Phase 2: Acceleration (Months 7-12)**
- Expand pilots to full deployments (land → expand)
- Acquire 20-30 new mid-market customers
- B2C reaches 5,000+ free users, 500+ paid
- **Target: $1.5M ARR exiting Month 12**
- Focus: Repeatable sales motion, customer success playbook

**Phase 3: Scaling (Months 13-18)**
- 50+ total customers (mix of mid-market and expanding enterprise)
- B2C flywheel generating 20% of new enterprise leads
- First channel partners (staffing industry consultants)
- **Target: $3M ARR exiting Month 18**
- Focus: Category positioning, Series A preparation

### Customer Acquisition Mix

| Channel | % of Revenue (Month 18) | CAC | Notes |
|---------|------------------------|-----|-------|
| **Direct Sales (Outbound)** | 45% | $20k | AEs targeting ICP; longer cycle, higher ACV |
| **Product-Led (B2C → B2B)** | 25% | $5k | Free users convert to paid; some become enterprise leads |
| **Inbound (Content + SEO)** | 20% | $10k | ROI calculators, case studies, webinars |
| **Channel Partners** | 10% | $12k | Staffing/recruiting consultants with existing relationships |

---

## ROI Calculation: The Customer Business Case

### Example: 10-Person SDR Team

**Current State:**
- 10 SDRs × $60,000/year = $600,000 total cost
- SDRs spend 28% of time selling (industry benchmark)
- Effective "selling labor" = $168,000
- Wasted on admin/data entry = **$432,000**

**With Spadeworks:**
- Automate 50% of admin tasks (conservative)
- Reclaim $216,000 in productive capacity
- SDRs now spend 50%+ time selling (vs. 28%)
- **Equivalent to adding 3-4 SDRs without hiring**

**Spadeworks Cost:**
- 10 users × $100/month × 12 = $12,000/year
- Platform fee: $12,000/year
- **Total: $24,000/year**

**ROI:**
- Value delivered: $216,000
- Cost: $24,000
- **Net benefit: $192,000/year**
- **ROI: 800%**
- **Payback period: < 2 months**

### Example: 5-Person Recruiting Team

**Current State:**
- 5 Recruiters × $75,000/year = $375,000 total cost
- Recruiters spend 13hr/week sourcing + 8hr/week ATS admin = 21hr/week on "robot work"
- That's 52% of their time → $195,000 wasted annually

**With Spadeworks:**
- Automate LinkedIn sourcing sequences, ATS data entry, interview scheduling
- Reclaim 60% of wasted time = $117,000 in productive capacity

**Spadeworks Cost:** ~$15,000/year

**Net benefit: $102,000/year | ROI: 680% | Payback: < 2 months**

---

## Risk Analysis

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LLM accuracy degrades | Medium | High | Multi-model support; regression testing; model pinning |
| Target app changes break automation | Low | Medium | Semantic selectors; verification loop catches failures |
| Security vulnerability | Low | Critical | SOC 2 path; penetration testing; bug bounty |

### Market Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Sales cycles longer than projected | Medium | High | Land-and-expand; B2C pipeline as hedge |
| Major vendor (Microsoft, Google) enters | Medium | Medium | First-mover advantage; private knowledge moat; enterprise depth |
| Vision agents improve economics | Low | Medium | Our DOM approach remains structurally cheaper; pivot capability |

### Financial Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LLM API costs increase | Medium | Medium | Multi-provider strategy; model optimization; hybrid pricing passes costs to heavy users |
| Customer churn higher than expected | Low | High | Customer success investment; usage-based pricing aligns incentives |
| Slower B2C adoption | Medium | Low | B2C is gravy; B2B direct sales is primary motion |

---

## The Ask

### For Investors (Seed Round)

**Raising:** $2-4M Seed
**Use of Funds:**
- 40% Sales & Marketing (hire 3-5 AEs, demand gen)
- 35% Engineering (platform robustness, integrations)
- 15% Customer Success (ensure retention, drive expansion)
- 10% G&A

**Milestones to Series A:**
- $3M ARR
- 50+ paying customers
- Net Revenue Retention >110%
- Clear path to $10M ARR

### For Design Partners

We're seeking **5-10 design partners** who:
- Have 10-50 knowledge workers in SDR, Recruiting, Support, or Ops roles
- Are willing to deploy Spadeworks for a meaningful pilot (30-90 days)
- Will provide feedback and serve as reference customers
- **Receive:** 50% discount on first year, dedicated support, influence on roadmap

---

## Positioning Summary

### For Enterprise Buyers (B2B)

> **"Your high-value employees are drowning in low-value clicks. Spadeworks is the operating system for enterprise web work—connecting your disconnected apps, executing multi-step workflows, and verifying every action. Unlike RPA that breaks or chatbots that only advise, Spadeworks acts reliably. Reclaim 30-50% of your team's wasted time in under 60 days."**

### For Individual Users (B2C)

> **"Stop being the middleware of your own life. Spadeworks is your personal internet butler—it clicks so you don't have to. Apply to 50 jobs while you sleep. Monitor flight prices and book automatically. Fill out government forms without the headache. Start free, upgrade when you need more."**

### The One-Liner

**Spadeworks: We turn browser tabs into employees.**

---

## Conclusion

**The problem is quantified:** Knowledge workers waste 50-70% of their time on "human middleware" tasks—a multi-trillion dollar global productivity drain.

**The solution is built:** Spadeworks is a working platform with a defensible architecture (DOM-based, 10x cheaper than vision agents, deterministic verification).

**The unit economics work:** 5:1 LTV:CAC, 75% gross margins, and <2 month customer payback support sustainable growth.

**The timing is right:** Vision agents are getting attention, but their economics don't work. DOM agents are the winner, and we're positioned to capture the category.

**$3M ARR in 18 months is achievable** with 50+ customers through a land-and-expand motion, supplemented by bottom-up B2C adoption.

**This is not a feature. This is the operating system for how enterprise web work gets done.**

---

**Document Status:** Investor & Customer Ready  
**Last Updated:** January 27, 2026  
**Version:** 3.0

---

## Appendix

### Supporting Technical Documentation
- **Architecture:** `docs/SERVER_SIDE_AGENT_ARCH.md` (server-side), `docs/CLIENT_ARCHITECTURE.md` (client-side)
- **Implementation:** `docs/THIN_SERVER_ROADMAP.md`, `docs/THIN_CLIENT_ROADMAP.md` (Part 2: Future Enhancements)
- **AI Reasoning:** `docs/REASONING_LAYER_IMPROVEMENTS.md`
- **Enterprise Spec:** `docs/ENTERPRISE_PLATFORM_SPECIFICATION.md`

### Data Sources
- Salesforce State of Sales 2024
- Harvard Business Review / Pega Systems (App Switching Study)
- SHRM / LinkedIn Talent Solutions (Recruiter Time Allocation)
- Deloitte RPA Implementation Studies
- Gartner Enterprise AI Adoption Reports
- UC Irvine (Attention/Focus Research)
