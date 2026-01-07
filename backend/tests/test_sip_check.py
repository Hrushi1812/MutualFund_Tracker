
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

def generate_installment_dates(start_date_str, sip_day, has_manual_amount=True):
    # Mocking dependencies
    def parse_date_mock(s):
        from datetime import datetime
        return datetime.strptime(s, "%Y-%m-%d")
    
    def format_date_mock(d):
        return d.strftime("%Y-%m-%d")

    # Mocking 'today' as a fixed date for testing
    # Let's say Today is 2024-01-15
    today = date(2024, 1, 15)
    
    start_dt = parse_date_mock(start_date_str).date()
    current_month_start = today.replace(day=1)
    
    installments = []
    current_dt = start_dt
    
    # First installment
    if current_dt <= today:
        installments.append(current_dt)
    
    # Subsequent
    next_month = current_dt + relativedelta(months=1)
    try:
        current_dt = next_month.replace(day=sip_day)
    except ValueError:
        current_dt = next_month + relativedelta(day=31)

    while current_dt <= today:
        installments.append(current_dt)
        next_month = current_dt.replace(day=1) + relativedelta(months=1)
        try:
            current_dt = next_month.replace(day=sip_day)
        except ValueError:
            current_dt = next_month + relativedelta(day=31)

    results = []
    for d in installments:
        # LOGIC TO TEST
        if has_manual_amount and d < current_month_start:
            status = "ASSUMED_PAID"
        else:
            status = "PENDING"
        
        results.append({
            "date": format_date_mock(d),
            "status": status
        })
    
    return results

# Test Case 1: SIP Day 10th. Today is 15th Jan. Start Date: Nov 10th.
# Nov 10 (Paid), Dec 10 (Paid), Jan 10 (Pending?)
print("Test 1 (SIP Day 10, Today Jan 15):")
res1 = generate_installment_dates("2023-11-10", 10)
for r in res1: print(r)

# Test Case 2: SIP Day 20th. Today is 15th Jan. Start Date: Nov 20th.
# Nov 20 (Paid), Dec 20 (Paid). Jan 20 is future (not in list).
print("\nTest 2 (SIP Day 20, Today Jan 15):")
res2 = generate_installment_dates("2023-11-20", 20)
for r in res2: print(r)

# Test Case 3: Start Date in current month. Jan 5th. Today Jan 15.
# Jan 5 (Pending)
print("\nTest 3 (Start Jan 5, Today Jan 15):")
res3 = generate_installment_dates("2024-01-05", 5)
for r in res3: print(r)
