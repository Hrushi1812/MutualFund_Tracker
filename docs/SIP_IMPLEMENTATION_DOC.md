# SIP Tracking Implementation Plan

## Goal Description
Implement SIP (Systematic Investment Plan) tracking capability. The goal is to calculate P&L using **user-provided total units** and **current NAV**, while generating installment cashflows for analytics (Total Invested Amount). Note: Exact XIRR is deferred for a future version; current implementation provides an approximation based on generated cashflows.

> [!IMPORTANT]
> **Key Assumptions & Logic**:
> 1. **Units Source of Truth**: `manual_total_units` provided by the user is the **static starting balance**. It **never** auto-changes.
>    - Future confirmed installments add to a separate `future_sip_units` bucket (initially 0).
>    - Total Units = `manual_total_units` + `future_sip_units`.
> 2. **Uninterrupted Cost**: We calculate **Total Invested Amount** by generating the schedule from `Start Date` to `Today` (assumed paid).
>    - **Invariant**: Past installments are assumed paid unless explicitly skipped from today forward.
> 3. **Today's Installment**:
>    - Status defaults to `PENDING`.
>    - **User Action**:
>       - **Yes (Invested)**: Mark `PAID`. Add estimated units to `future_sip_units`. Do NOT touch `manual_total_units`.
>       - **No (Skipped)**: Mark `SKIPPED`. Do not add units.
> 4. **Date Normalization**: `YYYY-MM-DD`.

## User Review Required
- **Validation**: We rely entirely on user accuracy for "Total Units Held".
- **Interaction**: A popup will appear on the dashboard if a SIP is due today.


## Proposed Changes

### Backend

#### [MODIFY] [db_schemas.py](file:///c:/Users/Hrushikesh/Desktop/MutualFund_Tracker/backend/models/db_schemas.py)
- Add `investment_type` (Enum: "lumpsum", "sip").
- Add SIP config fields: `sip_amount`, `sip_start_date`, `sip_frequency`, `sip_day`.
- **New**: `manual_total_units` (float).
- `SIPInstallment` sub-model: `{ date, amount, units (optional), nav (optional), status, is_estimated: bool }`.

#### [MODIFY] [holdings.py](file:///c:/Users/Hrushikesh/Desktop/MutualFund_Tracker/backend/routes/holdings.py)
- Update `/upload` validation.
- **New**: Accept `total_units` form field.
- Normalize dates.

#### [MODIFY] [holdings_service.py](file:///c:/Users/Hrushikesh/Desktop/MutualFund_Tracker/backend/services/holdings_service.py)
- Add `generate_installment_dates`.
- `sync_sip_installments`:
    - Generate dates from Start to Today.
    - Calculate `total_invested` = Count * Amount.
    - Store `total_units` from user input.
    - **No** historical NAV lookup for past dates.
    - Handle "Today" logic (Pending/Confirmed).

#### [MODIFY] [nav_service.py](file:///c:/Users/Hrushikesh/Desktop/MutualFund_Tracker/backend/services/nav_service.py)
- Update `calculate_pnl`:
    - `units` = `manual_total_units` + sum(future_sip_units).
    - `current_value` = `units` * `live_nav`.
    - `pnl` = `current_value` - `total_invested`.

### Frontend

#### [MODIFY] [UploadHoldings.jsx](file:///c:/Users/Hrushikesh/Desktop/MutualFund_Tracker/frontend/src/components/dashboard/UploadHoldings.jsx)
- Support SIP upload fields.
- **New Field**: "Total Units Held Till Date" + Helper Text ("Available in your CAS...").

#### [NEW] [SIPActionModal.jsx](file:///c:/Users/Hrushikesh/Desktop/MutualFund_Tracker/frontend/src/components/dashboard/SIPActionModal.jsx)
- Modal to ask: "SIP Installment Due for [Fund]. Did you invest [Amount]?"
- Buttons: "Yes, Invested" (Call API confirm), "No, Skipped" (Call API skip).

#### [MODIFY] [PortfolioAnalyzer.jsx](file:///c:/Users/Hrushikesh/Desktop/MutualFund_Tracker/frontend/src/components/dashboard/PortfolioAnalyzer.jsx)
- Check API response for `sip_pending_installments`.
- Trigger `SIPActionModal` if pending exists.

## Verification Plan

### Automated Tests
- Create `backend/tests/test_sip_logic.py` to test installment generation and P&L math.

### Manual Verification
- Upload a known SIP portfolio with User Input Units.
- Verify installments are generated (Past=Paid, Today=Pending).
- Verify P&L matches expected values based on **total units × current NAV**.
