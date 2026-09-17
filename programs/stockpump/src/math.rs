//! Pure deposit/redeem arithmetic. No Solana types — this file is the product claim,
//! so it must be testable without a validator.
//!
//! THE CLAIM: `held_i / supply` never falls, for every sleeve, on every operation.
//! It is not an invariant the program checks at runtime; it is a property of the
//! arithmetic. Deposit is proportional and the fee is simply never minted against;
//! redeem pays out less than pro-rata by the fee. Both strictly increase the ratio:
//!
//!   deposit gain = (1+r)/(1+r(1-f))  > 1 for every r>0, sup = 1/(1-f)
//!   redeem  gain = 1 + kf/(1-k)      > 1 for every k in (0,1), unbounded as k->1
//!
//! ⚠️ 1/(1-f) = 1.0101… at f=1% appears here as the SUPREMUM OF THE PER-OPERATION GAIN.
//! It is NOT the ceiling on the ratio that killed the earlier require!-based design —
//! there the vault walked into 1.0101 and honest deposits began reverting. Here the
//! ratio itself compounds without limit. Same constant, opposite meaning.
//!
//! ⛔ EVERY DIVISION FLOORS, deliberately and in the vault's favour: fewer shares minted
//! on deposit, less paid out on redeem. Rounding toward the depositor would let a dust
//! loop extract the rounding error.

use crate::errors::StockPumpError;

pub const BPS_DENOM: u128 = 10_000;

/// Split `amount` into `(net, fee)`. Fee rounds UP so the skim is never less than fee_bps.
pub fn apply_fee(amount: u64, fee_bps: u16) -> Result<(u64, u64), StockPumpError> {
    if fee_bps == 0 {
        return Err(StockPumpError::ZeroFee);
    }
    if fee_bps as u128 >= BPS_DENOM {
        return Err(StockPumpError::FeeTooLarge);
    }
    let a = amount as u128;
    // div_ceil: the vault keeps the rounding, never the user.
    let fee = (a * fee_bps as u128).div_ceil(BPS_DENOM);
    let net = a.checked_sub(fee).ok_or(StockPumpError::MathOverflow)?;
    Ok((
        u64::try_from(net).map_err(|_| StockPumpError::MathOverflow)?,
        u64::try_from(fee).map_err(|_| StockPumpError::MathOverflow)?,
    ))
}

/// Shares for a proportional in-kind deposit: `min_i(supply * net_in_i / held_i)`.
/// The minimum is what makes an off-ratio deposit safe — the short leg binds, and the
/// excess on every other leg stays in the vault (Uniswap V2 behaviour).
pub fn shares_for_deposit(
    supply: u64,
    held: &[u64],
    net_in: &[u64],
) -> Result<u64, StockPumpError> {
    if held.len() != net_in.len() || held.is_empty() {
        return Err(StockPumpError::SleeveMismatch);
    }
    let mut best: Option<u64> = None;
    for (h, n) in held.iter().zip(net_in.iter()) {
        if *h == 0 {
            return Err(StockPumpError::EmptySleeve);
        }
        let m = (supply as u128)
            .checked_mul(*n as u128)
            .ok_or(StockPumpError::MathOverflow)?
            / (*h as u128);
        let m = u64::try_from(m).map_err(|_| StockPumpError::MathOverflow)?;
        best = Some(match best {
            None => m,
            Some(b) => b.min(m),
        });
    }
    let m = best.ok_or(StockPumpError::SleeveMismatch)?;
    if m == 0 {
        return Err(StockPumpError::DepositTooSmall);
    }
    Ok(m)
}

/// Pro-rata payout less the fee, floored on every leg.
pub fn payout_for_redeem(
    supply: u64,
    held: &[u64],
    shares: u64,
    fee_bps: u16,
) -> Result<Vec<u64>, StockPumpError> {
    if shares == 0 || shares > supply {
        return Err(StockPumpError::BadShareAmount);
    }
    if fee_bps == 0 {
        return Err(StockPumpError::ZeroFee);
    }
    if fee_bps as u128 >= BPS_DENOM {
        return Err(StockPumpError::FeeTooLarge);
    }
    let keep = BPS_DENOM - fee_bps as u128;
    held.iter()
        .map(|h| {
            let v = (*h as u128)
                .checked_mul(shares as u128)
                .ok_or(StockPumpError::MathOverflow)?
                .checked_mul(keep)
                .ok_or(StockPumpError::MathOverflow)?
                / (supply as u128 * BPS_DENOM);
            u64::try_from(v).map_err(|_| StockPumpError::MathOverflow)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    /// held_i/supply compared without floats: a/b >= c/d  <=>  a*d >= c*b, in u128.
    fn ratio_not_lower(held_after: u64, supply_after: u64, held_before: u64, supply_before: u64) -> bool {
        (held_after as u128) * (supply_before as u128) >= (held_before as u128) * (supply_after as u128)
    }

    // ── the guard the whole claim rests on ────────────────────────────────────────
    #[test]
    fn zero_fee_is_refused_everywhere() {
        assert!(matches!(apply_fee(1_000, 0), Err(StockPumpError::ZeroFee)));
        assert!(matches!(payout_for_redeem(1_000, &[1_000], 100, 0), Err(StockPumpError::ZeroFee)));
    }

    #[test]
    fn fee_at_or_above_100_percent_is_refused() {
        assert!(matches!(apply_fee(1_000, 10_000), Err(StockPumpError::FeeTooLarge)));
        assert!(matches!(apply_fee(1_000, 20_000), Err(StockPumpError::FeeTooLarge)));
    }

    /// CONTROL FOR THE PROPERTY TESTS BELOW: if the fee were zero the ratio would be exactly
    /// FLAT, not rising. This asserts the property tests are measuring the fee and not an
    /// artifact of flooring — without it, "never falls" would pass on a design that never rises.
    #[test]
    fn control_the_gain_comes_from_the_fee_and_nothing_else() {
        // hand-computed at f=0: deposit r=1x on held=1000, supply=1000
        // m = supply * net / held = 1000 * 1000 / 1000 = 1000 (net == amount when f=0)
        // held' = 2000, supply' = 2000 -> ratio identical, NOT higher.
        let (held, supply, amount) = (1_000u64, 1_000u64, 1_000u64);
        let net_f0 = amount; // what apply_fee would return if a zero fee were permitted
        let m = (supply as u128 * net_f0 as u128 / held as u128) as u64;
        assert_eq!(m, 1_000);
        assert!(ratio_not_lower(held + amount, supply + m, held, supply));
        assert!(
            !((held + amount) as u128 * supply as u128 > held as u128 * (supply + m) as u128),
            "at fee=0 the ratio must be FLAT; if this ever reads as rising the property tests are measuring something else"
        );
    }


    // ── guards the mutation run proved untested ──────────────────────────────────
    // Each of these killed a surviving mutant. Without them the guard could be inverted,
    // deleted or widened and every property test still passed.
    #[test]
    fn deposit_rejects_a_zero_sleeve() {
        assert!(matches!(shares_for_deposit(1_000, &[0, 500], &[10, 10]), Err(StockPumpError::EmptySleeve)));
        assert!(matches!(shares_for_deposit(1_000, &[500, 0], &[10, 10]), Err(StockPumpError::EmptySleeve)));
    }

    #[test]
    fn deposit_rejects_mismatched_or_empty_sleeves() {
        assert!(matches!(shares_for_deposit(1_000, &[500, 500], &[10]), Err(StockPumpError::SleeveMismatch)));
        assert!(matches!(shares_for_deposit(1_000, &[], &[]), Err(StockPumpError::SleeveMismatch)));
    }

    #[test]
    fn deposit_too_small_is_refused_rather_than_minting_zero() {
        // 1 unit against a 1e12 sleeve rounds to zero shares; minting 0 would take the
        // tokens and give nothing back.
        assert!(matches!(
            shares_for_deposit(1_000, &[1_000_000_000_000], &[1]),
            Err(StockPumpError::DepositTooSmall)
        ));
        // and the boundary just above it mints exactly 1
        assert_eq!(shares_for_deposit(1_000, &[1_000], &[1]).unwrap(), 1);
    }

    #[test]
    fn deposit_mints_the_minimum_across_sleeves_not_the_maximum() {
        // sleeve 1 is deliberately short: 1000*100/1000 = 100 vs 1000*50/1000 = 50
        assert_eq!(shares_for_deposit(1_000, &[1_000, 1_000], &[100, 50]).unwrap(), 50);
    }

    #[test]
    fn redeem_rejects_zero_and_over_supply_at_the_boundary() {
        assert!(matches!(payout_for_redeem(1_000, &[1_000], 0, 100), Err(StockPumpError::BadShareAmount)));
        assert!(matches!(payout_for_redeem(1_000, &[1_000], 1_001, 100), Err(StockPumpError::BadShareAmount)));
        // exactly supply is ALLOWED — the bootstrap dead shares are what keep it unreachable,
        // not this guard, and confusing the two would move a safety property into the wrong file.
        assert!(payout_for_redeem(1_000, &[1_000], 1_000, 100).is_ok());
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(2000))]

        /// THE PRODUCT CLAIM, deposit side.
        #[test]
        fn deposit_never_lowers_held_per_share(
            supply in 1_000u64..1_000_000_000_000u64,
            h0 in 1_000u64..1_000_000_000_000u64,
            h1 in 1_000u64..1_000_000_000_000u64,
            amt0 in 1u64..1_000_000_000_000u64,
            skew in 50u64..150u64,           // second leg deliberately off-ratio, ±50%
            fee_bps in 1u16..2_000u16,
        ) {
            let amt1 = ((amt0 as u128 * h1 as u128 / h0 as u128) * skew as u128 / 100).min(u64::MAX as u128) as u64;
            prop_assume!(amt1 > 0);
            let (n0, _) = apply_fee(amt0, fee_bps).unwrap();
            let (n1, _) = apply_fee(amt1, fee_bps).unwrap();
            prop_assume!(n0 > 0 && n1 > 0);

            // ⛔ NOT `if let Ok(m)`. A conditional here silently SKIPS every mutant that turns a
            // correct result into an error, and mutation testing proved it: `/` -> `*` on the
            // core division survived only because it overflowed into Err and the arm never ran.
            let m = shares_for_deposit(supply, &[h0, h1], &[n0, n1])
                .expect("a proportional deposit of non-zero net must mint shares");
            // EXACTNESS, not just direction: the depositor gets the binding sleeve's ratio.
            // Without this, `shares_for_deposit -> Ok(1)` passes every ratio test, because
            // minting one share raises held-per-share magnificently and robs the depositor.
            let e0 = (supply as u128 * n0 as u128 / h0 as u128) as u64;
            let e1 = (supply as u128 * n1 as u128 / h1 as u128) as u64;
            prop_assert_eq!(m, e0.min(e1), "depositor did not receive the binding-sleeve share count");

            let (h0a, h1a) = (h0.checked_add(amt0), h1.checked_add(amt1));
            let sa = supply.checked_add(m);
            prop_assume!(h0a.is_some() && h1a.is_some() && sa.is_some());
            prop_assert!(ratio_not_lower(h0a.unwrap(), sa.unwrap(), h0, supply), "sleeve 0 fell");
            prop_assert!(ratio_not_lower(h1a.unwrap(), sa.unwrap(), h1, supply), "sleeve 1 fell");
        }

        /// THE PRODUCT CLAIM, redeem side.
        #[test]
        fn redeem_never_lowers_held_per_share(
            supply in 2u64..1_000_000_000_000u64,
            h0 in 1u64..1_000_000_000_000u64,
            h1 in 1u64..1_000_000_000_000u64,
            frac in 1u64..10_000u64,
            fee_bps in 1u16..2_000u16,
        ) {
            let shares = ((supply as u128 * frac as u128) / 10_000).max(1) as u64;
            prop_assume!(shares < supply);   // redeem-all leaves supply 0; bootstrap dead shares prevent it
            let out = payout_for_redeem(supply, &[h0, h1], shares, fee_bps).unwrap();
            let (h0a, h1a) = (h0 - out[0], h1 - out[1]);
            let sa = supply - shares;
            prop_assert!(ratio_not_lower(h0a, sa, h0, supply), "sleeve 0 fell on redeem");
            prop_assert!(ratio_not_lower(h1a, sa, h1, supply), "sleeve 1 fell on redeem");
        }

        /// A redeemer can never take more than their pro-rata share.
        #[test]
        fn redeem_never_pays_more_than_pro_rata(
            supply in 2u64..1_000_000_000_000u64,
            h0 in 1u64..1_000_000_000_000u64,
            frac in 1u64..9_999u64,
            fee_bps in 1u16..2_000u16,
        ) {
            let shares = ((supply as u128 * frac as u128) / 10_000).max(1) as u64;
            prop_assume!(shares < supply);
            let out = payout_for_redeem(supply, &[h0], shares, fee_bps).unwrap();
            let pro_rata = (h0 as u128 * shares as u128) / supply as u128;
            prop_assert!(out[0] as u128 <= pro_rata, "paid {} > pro-rata {}", out[0], pro_rata);
            // EXACT, because "<= pro-rata" is also satisfied by paying zero, and by any
            // mutation of `keep` that makes the payout smaller. Pin the value.
            let keep = BPS_DENOM - fee_bps as u128;
            let exact = (h0 as u128 * shares as u128 * keep) / (supply as u128 * BPS_DENOM);
            prop_assert_eq!(out[0] as u128, exact, "payout is not floor(pro-rata * keep)");
        }

        /// apply_fee conserves value and never under-charges.
        #[test]
        fn fee_split_is_exact_and_rounds_to_the_vault(
            amount in 0u64..u64::MAX/2,
            fee_bps in 1u16..9_999u16,
        ) {
            let (net, fee) = apply_fee(amount, fee_bps).unwrap();
            prop_assert_eq!(net as u128 + fee as u128, amount as u128, "value not conserved");
            let exact = amount as u128 * fee_bps as u128;
            prop_assert!(fee as u128 * BPS_DENOM >= exact, "fee rounded toward the user");
        }

        /// No profitable round trip: deposit then immediately redeem the shares just minted
        /// must return strictly less than was put in, on every sleeve.
        #[test]
        fn deposit_then_redeem_is_never_profitable(
            supply in 1_000u64..1_000_000_000u64,
            h0 in 1_000u64..1_000_000_000u64,
            amt0 in 1_000u64..1_000_000_000u64,
            fee_bps in 1u16..2_000u16,
        ) {
            let (n0, _) = apply_fee(amt0, fee_bps).unwrap();
            prop_assume!(n0 > 0);
            let m = shares_for_deposit(supply, &[h0], &[n0]).expect("deposit must mint");
            let h0a = h0 + amt0;
            let sa = supply + m;
            let out = payout_for_redeem(sa, &[h0a], m, fee_bps).unwrap();
            prop_assert!(out[0] < amt0, "round trip returned {} for {} in", out[0], amt0);
        }
    }
}
