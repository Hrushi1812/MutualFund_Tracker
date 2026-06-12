"""
XIRR (Extended Internal Rate of Return) Calculator

Calculates the annualized return for a series of cash flows at irregular intervals.
Uses Newton-Raphson method to find the rate where NPV = 0.

Cash Flow Convention:
- Negative values = Investments (money out)
- Positive values = Redemptions/current value (money in)
"""

from datetime import date, datetime
from typing import List, Tuple, Optional, Union
import math


def _parse_date(d: Union[str, date, datetime]) -> date:
    """Convert various date formats to date object."""
    if isinstance(d, datetime):
        return d.date()
    if isinstance(d, date):
        return d
    if isinstance(d, str):
        # Try common formats
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
            try:
                return datetime.strptime(d, fmt).date()
            except ValueError:
                continue
        raise ValueError(f"Cannot parse date: {d}")
    raise TypeError(f"Invalid date type: {type(d)}")


def _xnpv(rate: float, cash_flows: List[Tuple[date, float]], base_date: date) -> float:
    """
    Calculate Net Present Value for a given rate.
    
    NPV = Σ (Cash Flow_i / (1 + rate)^(days_i / 365))
    """
    if rate <= -1:
        return float('inf')  # Avoid division by zero or negative base
    
    npv = 0.0
    for cf_date, amount in cash_flows:
        days = (cf_date - base_date).days
        if days < 0:
            days = 0  # Shouldn't happen, but safety
        try:
            npv += amount / ((1 + rate) ** (days / 365.0))
        except (OverflowError, ZeroDivisionError):
            return float('inf')
    return npv


def _xnpv_derivative(rate: float, cash_flows: List[Tuple[date, float]], base_date: date) -> float:
    """
    Calculate the derivative of NPV with respect to rate (for Newton-Raphson).
    
    d(NPV)/d(rate) = Σ (-days_i / 365) * Cash Flow_i / (1 + rate)^(days_i/365 + 1)
    """
    if rate <= -1:
        return float('inf')
    
    deriv = 0.0
    for cf_date, amount in cash_flows:
        days = (cf_date - base_date).days
        if days < 0:
            days = 0
        exponent = days / 365.0
        try:
            deriv -= (exponent * amount) / ((1 + rate) ** (exponent + 1))
        except (OverflowError, ZeroDivisionError):
            return float('inf')
    return deriv


def calculate_xirr(
    cash_flows: List[Tuple[Union[str, date, datetime], float]],
    guess: float = 0.1,
    max_iterations: int = 100,
    tolerance: float = 1e-7
) -> Optional[float]:
    """
    Calculate XIRR for a series of cash flows.
    
    Args:
        cash_flows: List of (date, amount) tuples. 
                    Negative amounts = investments
                    Positive amounts = returns/current value
        guess: Initial guess for the rate (default 10%)
        max_iterations: Maximum Newton-Raphson iterations
        tolerance: Convergence tolerance
        
    Returns:
        XIRR as a percentage (e.g., 12.5 for 12.5%) or None if calculation fails
        
    Example:
        >>> cash_flows = [
        ...     ("2023-01-01", -10000),  # Invested 10000
        ...     ("2023-06-01", -10000),  # Invested 10000
        ...     ("2024-01-01", 22000),   # Current value
        ... ]
        >>> xirr = calculate_xirr(cash_flows)
        >>> print(f"{xirr:.2f}%")  # ~10.00%
    """
    if not cash_flows or len(cash_flows) < 2:
        return None
    
    # Parse and sort cash flows by date
    try:
        parsed_flows = [(parse_date(d), float(a)) for d, a in cash_flows]
    except (ValueError, TypeError) as e:
        return None
    
    parsed_flows.sort(key=lambda x: x[0])
    
    # Sanity checks
    total_invested = sum(a for _, a in parsed_flows if a < 0)
    total_returned = sum(a for _, a in parsed_flows if a > 0)
    
    if total_invested == 0 or total_returned == 0:
        return None  # Need both investments and returns
    
    base_date = parsed_flows[0][0]
    
    # Check if all cash flows are on the same date
    unique_dates = set(d for d, _ in parsed_flows)
    if len(unique_dates) == 1:
        # All on same date - simple return
        if abs(total_invested) > 0:
            simple_return = (total_returned + total_invested) / abs(total_invested)
            return simple_return * 100  # As percentage
        return None
    
    # Newton-Raphson iteration
    rate = guess
    
    for i in range(max_iterations):
        npv = _xnpv(rate, parsed_flows, base_date)
        deriv = _xnpv_derivative(rate, parsed_flows, base_date)
        
        if abs(deriv) < 1e-10:
            # Derivative too small, try adjusting rate
            if rate > 0:
                rate = rate * 0.5
            else:
                rate = 0.1
            continue
            
        # Newton-Raphson step
        new_rate = rate - npv / deriv
        
        # Bound the rate to reasonable values (-99% to 1000%)
        new_rate = max(-0.99, min(10.0, new_rate))
        
        if abs(new_rate - rate) < tolerance:
            return new_rate * 100  # Return as percentage
            
        rate = new_rate
    
    # If Newton-Raphson didn't converge, try bisection as fallback
    return _bisection_xirr(parsed_flows, base_date)


def _bisection_xirr(
    cash_flows: List[Tuple[date, float]], 
    base_date: date,
    low: float = -0.99,
    high: float = 10.0,
    max_iterations: int = 100,
    tolerance: float = 1e-6
) -> Optional[float]:
    """Fallback bisection method for XIRR when Newton-Raphson fails."""
    
    npv_low = _xnpv(low, cash_flows, base_date)
    npv_high = _xnpv(high, cash_flows, base_date)

    # Check if solution exists in range
    if npv_low * npv_high > 0:
        # Same sign - no root in [-99%, 1000%]. There is no meaningful XIRR
        # to report; returning an interval endpoint would show the user a
        # fabricated -99% or +1000% annualized return.
        return None
    
    for _ in range(max_iterations):
        mid = (low + high) / 2
        npv_mid = _xnpv(mid, cash_flows, base_date)
        
        if abs(npv_mid) < tolerance or (high - low) / 2 < tolerance:
            return mid * 100
        
        if npv_mid * npv_low < 0:
            high = mid
            npv_high = npv_mid
        else:
            low = mid
            npv_low = npv_mid
    
    return ((low + high) / 2) * 100


# Alias for internal use
parse_date = _parse_date


# Convenience function for SIP calculations
def calculate_sip_xirr(
    installments: List[dict],
    current_value: float,
    current_date: Union[str, date, datetime] = None,
    manual_invested_amount: float = 0.0,
    sip_start_date: Union[str, date, datetime] = None
) -> Optional[float]:
    """
    Calculate XIRR specifically for SIP investments.
    
    Args:
        installments: List of SIP installment dicts with 'date', 'amount', 'status'
        current_value: Current portfolio value
        current_date: Date for current value (defaults to today)
        manual_invested_amount: DEPRECATED - kept for backward compatibility, ignored
        sip_start_date: DEPRECATED - kept for backward compatibility, ignored
        
    Returns:
        XIRR as percentage or None
        
    Note:
        Each installment (PAID and ASSUMED_PAID) is treated as a separate cash flow
        at its actual date. CAS amounts ARE the actual invested amounts - stamp duty
        is already included implicitly and units are already adjusted.
    """
    from datetime import date as date_type
    
    if current_date is None:
        current_date = date_type.today()
    else:
        current_date = parse_date(current_date)
    
    cash_flows = []
    
    # Add ALL installments (PAID and ASSUMED_PAID) as individual cash flows
    # CAS amounts ARE the actual cashflows - stamp duty is included implicitly
    # Units are already adjusted for stamp duty deduction
    for inst in installments:
        status = inst.get("status", "")
        if status in ("PAID", "ASSUMED_PAID"):
            try:
                inst_date = parse_date(inst["date"])
                amount = float(inst.get("amount", 0))
                if amount > 0:
                    # Use raw amount as cashflow (stamp duty already included in CAS)
                    cash_flows.append((inst_date, -amount))  # Negative = investment
            except (ValueError, KeyError):
                continue
    
    if not cash_flows:
        return None  # No investments to calculate

    # Annualizing a holding younger than ~30 days produces wild, meaningless
    # numbers (a 1% week becomes ~68% "annualized"); suppress XIRR until then.
    earliest = min(d for d, _ in cash_flows)
    if (current_date - earliest).days < 30:
        return None

    # Add current value as positive cash flow (return)
    cash_flows.append((current_date, current_value))

    return calculate_xirr(cash_flows)

