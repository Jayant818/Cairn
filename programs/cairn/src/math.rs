use crate::{
    errors::CairnError,
    state::{MarketConfig, BPS_DENOM, INDEX_SCALE, MULTIPLIER_SCALE, SECONDS_PER_YEAR},
};

pub fn mul_div_floor(a: u128, b: u128, denominator: u128) -> Result<u128, CairnError> {
    if denominator == 0 {
        return Err(CairnError::MathOverflow);
    }
    a.checked_mul(b)
        .ok_or(CairnError::MathOverflow)
        .map(|n| n / denominator)
}

pub fn mul_div_ceil(a: u128, b: u128, denominator: u128) -> Result<u128, CairnError> {
    if denominator == 0 {
        return Err(CairnError::MathOverflow);
    }
    a.checked_mul(b)
        .ok_or(CairnError::MathOverflow)
        .map(|n| n.div_ceil(denominator))
}

pub fn debt_for_shares(shares: u128, index: u128) -> Result<u64, CairnError> {
    u64::try_from(mul_div_ceil(shares, index, INDEX_SCALE)?).map_err(|_| CairnError::MathOverflow)
}

pub fn shares_for_borrow(amount: u64, index: u128) -> Result<u128, CairnError> {
    mul_div_ceil(amount as u128, INDEX_SCALE, index)
}

pub fn shares_for_repayment(
    amount: u64,
    position_shares: u128,
    index: u128,
) -> Result<u128, CairnError> {
    let debt = debt_for_shares(position_shares, index)?;
    if amount >= debt {
        return Ok(position_shares);
    }
    mul_div_floor(amount as u128, INDEX_SCALE, index)
}

pub fn managed_assets(cash: u64, debt: u64, reserves: u64) -> Result<u64, CairnError> {
    cash.checked_add(debt)
        .and_then(|gross| gross.checked_sub(reserves))
        .ok_or(CairnError::MathOverflow)
}

pub fn receipt_shares_for_deposit(
    received: u64,
    supply: u64,
    assets_before: u64,
) -> Result<u64, CairnError> {
    if received == 0 {
        return Err(CairnError::ZeroAmount);
    }
    if supply == 0 {
        if assets_before != 0 {
            return Err(CairnError::MathOverflow);
        }
        return Ok(received);
    }
    let shares = mul_div_floor(received as u128, supply as u128, assets_before as u128)?;
    if shares == 0 {
        return Err(CairnError::DepositTooSmall);
    }
    u64::try_from(shares).map_err(|_| CairnError::MathOverflow)
}

pub fn assets_for_receipts(shares: u64, supply: u64, assets: u64) -> Result<u64, CairnError> {
    if shares == 0 || shares > supply {
        return Err(CairnError::InvalidReceiptAmount);
    }
    u64::try_from(mul_div_floor(
        shares as u128,
        assets as u128,
        supply as u128,
    )?)
    .map_err(|_| CairnError::MathOverflow)
}

pub fn utilization_bps(cash: u64, debt: u64) -> Result<u16, CairnError> {
    let total = cash.checked_add(debt).ok_or(CairnError::MathOverflow)?;
    if total == 0 {
        return Ok(0);
    }
    u16::try_from(mul_div_floor(debt as u128, BPS_DENOM, total as u128)?)
        .map_err(|_| CairnError::MathOverflow)
}

pub fn borrow_rate_bps(config: &MarketConfig, utilization: u16) -> Result<u64, CairnError> {
    let u = utilization as u128;
    let kink = config.kink_bps as u128;
    let rate = if u <= kink {
        config.base_rate_bps as u128 + mul_div_floor(config.slope1_bps as u128, u, kink)?
    } else {
        config.base_rate_bps as u128
            + config.slope1_bps as u128
            + mul_div_floor(config.slope2_bps as u128, u - kink, BPS_DENOM - kink)?
    };
    u64::try_from(rate).map_err(|_| CairnError::MathOverflow)
}

pub fn accrue_index(
    old_index: u128,
    old_debt: u64,
    elapsed_seconds: u64,
    annual_rate_bps: u64,
    reserve_factor_bps: u16,
) -> Result<(u128, u64), CairnError> {
    if elapsed_seconds == 0 || old_debt == 0 {
        return Ok((old_index, 0));
    }
    let factor = mul_div_floor(
        (annual_rate_bps as u128)
            .checked_mul(elapsed_seconds as u128)
            .ok_or(CairnError::MathOverflow)?,
        INDEX_SCALE,
        BPS_DENOM
            .checked_mul(SECONDS_PER_YEAR)
            .ok_or(CairnError::MathOverflow)?,
    )?;
    let new_index = mul_div_floor(
        old_index,
        INDEX_SCALE
            .checked_add(factor)
            .ok_or(CairnError::MathOverflow)?,
        INDEX_SCALE,
    )?;
    let new_debt = u64::try_from(mul_div_ceil(old_debt as u128, new_index, old_index)?)
        .map_err(|_| CairnError::MathOverflow)?;
    let interest = new_debt
        .checked_sub(old_debt)
        .ok_or(CairnError::MathOverflow)?;
    let reserve_increment = u64::try_from(mul_div_floor(
        interest as u128,
        reserve_factor_bps as u128,
        BPS_DENOM,
    )?)
    .map_err(|_| CairnError::MathOverflow)?;
    Ok((new_index, reserve_increment))
}

pub fn confidence_bps(price: i64, confidence: u64) -> Result<u16, CairnError> {
    if price <= 0 {
        return Err(CairnError::InvalidOraclePrice);
    }
    let ratio = mul_div_ceil(confidence as u128, BPS_DENOM, price as u128)?;
    u16::try_from(ratio).map_err(|_| CairnError::OracleConfidenceTooWide)
}

pub fn normalized_price(
    price: i64,
    confidence: u64,
    exponent: i32,
    upper_bound: bool,
) -> Result<u128, CairnError> {
    if price <= 0 || confidence >= price as u64 {
        return Err(CairnError::InvalidOraclePrice);
    }
    let adverse = if upper_bound {
        (price as u128)
            .checked_add(confidence as u128)
            .ok_or(CairnError::MathOverflow)?
    } else {
        (price as u128)
            .checked_sub(confidence as u128)
            .ok_or(CairnError::InvalidOraclePrice)?
    };
    let target_decimals = 12i32;
    let shift = target_decimals
        .checked_add(exponent)
        .ok_or(CairnError::UnsupportedOracleExponent)?;
    if !(-18..=18).contains(&shift) {
        return Err(CairnError::UnsupportedOracleExponent);
    }
    if shift >= 0 {
        adverse
            .checked_mul(pow10(shift as u32)?)
            .ok_or(CairnError::MathOverflow)
    } else {
        Ok(adverse / pow10((-shift) as u32)?)
    }
}

pub fn deviation_bps(spot: u128, twap: u128) -> Result<u16, CairnError> {
    if twap == 0 {
        return Err(CairnError::InvalidOraclePrice);
    }
    let difference = spot.abs_diff(twap);
    let deviation = mul_div_ceil(difference, BPS_DENOM, twap)?;
    u16::try_from(deviation).map_err(|_| CairnError::OracleDeviationTooLarge)
}

pub fn token_value(
    amount: u64,
    token_decimals: u8,
    normalized_price: u128,
) -> Result<u128, CairnError> {
    mul_div_floor(
        amount as u128,
        normalized_price,
        pow10(token_decimals as u32)?,
    )
}

pub fn position_is_healthy(
    collateral_amount: u64,
    debt_amount: u64,
    collateral_decimals: u8,
    equity_decimals: u8,
    collateral_price: u128,
    equity_price: u128,
    threshold_bps: u16,
) -> Result<bool, CairnError> {
    if debt_amount == 0 {
        return Ok(true);
    }
    let collateral_value = token_value(collateral_amount, collateral_decimals, collateral_price)?;
    let debt_value = token_value(debt_amount, equity_decimals, equity_price)?;
    Ok(collateral_value
        .checked_mul(threshold_bps as u128)
        .ok_or(CairnError::MathOverflow)?
        >= debt_value
            .checked_mul(BPS_DENOM)
            .ok_or(CairnError::MathOverflow)?)
}

pub fn collateral_for_liquidation(
    repaid_equity: u64,
    equity_decimals: u8,
    collateral_decimals: u8,
    equity_price: u128,
    collateral_price: u128,
    bonus_bps: u16,
) -> Result<u64, CairnError> {
    let repay_value = token_value(repaid_equity, equity_decimals, equity_price)?;
    let with_bonus = mul_div_floor(
        repay_value,
        BPS_DENOM
            .checked_add(bonus_bps as u128)
            .ok_or(CairnError::MathOverflow)?,
        BPS_DENOM,
    )?;
    let collateral = mul_div_floor(
        with_bonus,
        pow10(collateral_decimals as u32)?,
        collateral_price,
    )?;
    u64::try_from(collateral).map_err(|_| CairnError::MathOverflow)
}

/// The multiplier a Token-2022 ScaledUiAmount mint applies at `now`. The mint stores the
/// old value in `multiplier` and the scheduled one in `new_multiplier`. The field names
/// suggest the opposite of the truth once the timestamp has passed.
pub fn effective_multiplier(multiplier: f64, new_multiplier: f64, new_effective_at: i64, now: i64) -> f64 {
    if now >= new_effective_at {
        new_multiplier
    } else {
        multiplier
    }
}

/// f64 multiplier -> fixed point, rounded UP so debt is never undervalued.
pub fn multiplier_fixed(multiplier: f64) -> Result<u128, CairnError> {
    if !multiplier.is_finite() || multiplier <= 0.0 || multiplier > 1_000_000.0 {
        return Err(CairnError::InvalidScaledUiMultiplier);
    }
    Ok((multiplier * MULTIPLIER_SCALE as f64).ceil() as u128)
}

/// An oracle quotes one UI token (one share-equivalent). One RAW unit of a scaled mint is
/// worth `multiplier` UI units, so debt held in raw units must be priced at price x multiplier.
/// Rounded up: the adverse direction for the borrower.
pub fn scale_equity_price(price: u128, multiplier: u128) -> Result<u128, CairnError> {
    mul_div_ceil(price, multiplier, MULTIPLIER_SCALE)
}

/// Bad debt write-off: a position with no collateral left and debt outstanding. Returns
/// (new total debt shares, new reserves). Reserves are first-loss; lenders absorb the rest
/// through the exchange rate NOW, instead of the last redeemers finding an empty vault.
pub fn write_off(
    total_debt_shares: u128,
    position_shares: u128,
    collateral: u64,
    debt: u64,
    reserves: u64,
) -> Result<(u128, u64), CairnError> {
    if collateral != 0 || position_shares == 0 {
        return Err(CairnError::PositionNotBadDebt);
    }
    let total = total_debt_shares
        .checked_sub(position_shares)
        .ok_or(CairnError::MathOverflow)?;
    Ok((total, reserves.saturating_sub(debt)))
}

fn pow10(exponent: u32) -> Result<u128, CairnError> {
    10u128.checked_pow(exponent).ok_or(CairnError::MathOverflow)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::PRICE_SCALE;
    use proptest::prelude::*;

    fn config() -> MarketConfig {
        MarketConfig {
            equity_feed_id: [1; 32],
            collateral_feed_id: [2; 32],
            max_price_age_seconds: 30,
            twap_window_seconds: 3_600,
            max_confidence_bps: 100,
            max_spot_twap_deviation_bps: 500,
            max_twap_down_slots_ratio: 50_000,
            loan_to_value_bps: 5_000,
            liquidation_threshold_bps: 7_000,
            liquidation_bonus_bps: 500,
            close_factor_bps: 5_000,
            reserve_factor_bps: 1_000,
            base_rate_bps: 100,
            slope1_bps: 900,
            slope2_bps: 9_000,
            kink_bps: 8_000,
            deposit_cap: u64::MAX,
            borrow_cap: u64::MAX,
        }
    }

    #[test]
    fn kink_rate_reaches_each_segment_boundary() {
        let c = config();
        assert_eq!(borrow_rate_bps(&c, 0).unwrap(), 100);
        assert_eq!(borrow_rate_bps(&c, 8_000).unwrap(), 1_000);
        assert_eq!(borrow_rate_bps(&c, 10_000).unwrap(), 10_000);
    }

    #[test]
    fn confidence_moves_each_asset_against_the_borrower() {
        let debt = normalized_price(20_000, 100, -2, true).unwrap();
        let collateral = normalized_price(100, 1, -2, false).unwrap();
        assert_eq!(debt, 201 * PRICE_SCALE);
        assert_eq!(collateral, 99 * PRICE_SCALE / 100);
    }

    #[test]
    fn one_year_accrual_updates_index_and_reserves() {
        let (index, reserves) = accrue_index(
            INDEX_SCALE,
            1_000_000,
            SECONDS_PER_YEAR as u64,
            1_000,
            1_000,
        )
        .unwrap();
        assert_eq!(index, INDEX_SCALE * 11 / 10);
        assert_eq!(reserves, 10_000);
    }

    #[test]
    fn liquidation_converts_equity_debt_to_usdc_with_bonus() {
        let equity = 200 * PRICE_SCALE;
        let usdc = PRICE_SCALE;
        let seized = collateral_for_liquidation(100_000_000, 8, 6, equity, usdc, 500).unwrap();
        assert_eq!(seized, 210_000_000);
    }

    #[test]
    fn full_lending_cycle_delivers_net_interest_to_receipt_holder() {
        let deposit = 1_000_000u64;
        let receipts = receipt_shares_for_deposit(deposit, 0, 0).unwrap();
        let borrowed = 600_000u64;
        let debt_shares = shares_for_borrow(borrowed, INDEX_SCALE).unwrap();
        let cash_after_borrow = deposit - borrowed;

        let (index, reserves) =
            accrue_index(INDEX_SCALE, borrowed, SECONDS_PER_YEAR as u64, 1_000, 1_000).unwrap();
        let repayment = debt_for_shares(debt_shares, index).unwrap();
        let removed = shares_for_repayment(repayment, debt_shares, index).unwrap();
        assert_eq!(removed, debt_shares);

        let final_cash = cash_after_borrow + repayment;
        let assets = managed_assets(final_cash, 0, reserves).unwrap();
        let redeemed = assets_for_receipts(receipts, receipts, assets).unwrap();
        assert_eq!(redeemed, 1_054_000);
        assert!(redeemed > deposit);
    }

    #[test]
    fn scaled_ui_multiplier_is_timestamp_gated() {
        // SPYx mainnet, read 2026-09: multiplier is stale, new_multiplier is live.
        assert_eq!(effective_multiplier(1.003909240011759, 1.005714560286254, 1_781_755_200, 1_781_755_199), 1.003909240011759);
        assert_eq!(effective_multiplier(1.003909240011759, 1.005714560286254, 1_781_755_200, 1_781_755_200), 1.005714560286254);
        assert!(multiplier_fixed(0.0).is_err());
        assert!(multiplier_fixed(f64::NAN).is_err());
        assert!(multiplier_fixed(f64::INFINITY).is_err());
        assert_eq!(multiplier_fixed(1.0).unwrap(), MULTIPLIER_SCALE);
    }

    #[test]
    fn debt_is_valued_at_the_multiplier() {
        // 1 raw SPYx at multiplier 1.005714... is 1.005714... shares.
        let m = multiplier_fixed(1.005714560286254).unwrap();
        let price = 200 * PRICE_SCALE;
        let scaled = scale_equity_price(price, m).unwrap();
        assert!(scaled > price);
        assert_eq!(scaled, 201_142_912_057_400);
    }

    #[test]
    fn a_two_for_one_split_leaves_health_unchanged() {
        // A 2:1 split doubles the multiplier and halves the per-share price. Raw balances do
        // not move. Health must not move either.
        let collateral = 1_000_000_000u64; // 1,000 USDC
        let before = scale_equity_price(200 * PRICE_SCALE, multiplier_fixed(1.0).unwrap()).unwrap();
        let after = scale_equity_price(100 * PRICE_SCALE, multiplier_fixed(2.0).unwrap()).unwrap();
        assert_eq!(before, after);
        for debt in [100_000_000u64, 249_000_000, 250_000_000, 251_000_000, 400_000_000] {
            let h_before = position_is_healthy(collateral, debt, 6, 8, PRICE_SCALE, before, 5_000).unwrap();
            let h_after = position_is_healthy(collateral, debt, 6, 8, PRICE_SCALE, after, 5_000).unwrap();
            assert_eq!(h_before, h_after, "debt {debt}");
        }
        // The bug this replaces: price the raw debt at the per-share price and the split
        // doubles what can be borrowed. 4 raw SPYx is unhealthy before and healthy after.
        let unscaled_after = 100 * PRICE_SCALE;
        assert!(!position_is_healthy(collateral, 400_000_000, 6, 8, PRICE_SCALE, before, 5_000).unwrap());
        assert!(position_is_healthy(collateral, 400_000_000, 6, 8, PRICE_SCALE, unscaled_after, 5_000).unwrap());
    }

    #[test]
    fn bad_debt_is_written_off_and_reserves_take_the_first_loss() {
        assert_eq!(write_off(1_000, 300, 0, 50, 20).unwrap(), (700, 0));
        assert_eq!(write_off(1_000, 300, 0, 50, 80).unwrap(), (700, 30));
        assert!(matches!(write_off(1_000, 300, 1, 50, 80), Err(CairnError::PositionNotBadDebt)));
        assert!(matches!(write_off(1_000, 0, 0, 0, 80), Err(CairnError::PositionNotBadDebt)));
        assert!(matches!(write_off(100, 300, 0, 50, 80), Err(CairnError::MathOverflow)));
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(2_000))]

        #[test]
        fn deposit_then_redeem_cannot_claim_more_than_managed_assets(
            cash in 1u64..1_000_000_000_000,
            debt in 0u64..1_000_000_000_000,
            reserves in 0u64..1_000_000,
            supply in 1u64..1_000_000_000_000,
            received in 1u64..1_000_000_000,
        ) {
            prop_assume!(cash.saturating_add(debt) > reserves);
            let assets = managed_assets(cash, debt, reserves).unwrap();
            let minted = receipt_shares_for_deposit(received, supply, assets).unwrap();
            let after_assets = assets.checked_add(received).unwrap();
            let after_supply = supply.checked_add(minted).unwrap();
            let out = assets_for_receipts(minted, after_supply, after_assets).unwrap();
            prop_assert!(out <= received);
        }

        #[test]
        fn debt_shares_never_understate_a_new_borrow(
            amount in 1u64..1_000_000_000_000,
            index in INDEX_SCALE..(INDEX_SCALE * 10),
        ) {
            let shares = shares_for_borrow(amount, index).unwrap();
            let represented = debt_for_shares(shares, index).unwrap();
            prop_assert!(represented >= amount);
        }

        #[test]
        fn interest_index_never_falls(
            index in INDEX_SCALE..(INDEX_SCALE * 10),
            debt in 1u64..1_000_000_000_000,
            elapsed in 1u64..31_536_000,
            rate in 1u64..50_000,
            reserve in 0u16..10_000,
        ) {
            let (after, _) = accrue_index(index, debt, elapsed, rate, reserve).unwrap();
            prop_assert!(after >= index);
        }
    }
}
