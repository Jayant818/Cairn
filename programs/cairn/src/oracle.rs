use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, TwapUpdate};

use crate::{
    errors::CairnError,
    math::{confidence_bps, deviation_bps, normalized_price, scale_equity_price},
    state::MarketConfig,
};

pub struct ValidatedPrices {
    pub equity_debt_price: u128,
    pub collateral_price: u128,
}

pub fn validate_prices(
    clock: &Clock,
    config: &MarketConfig,
    equity_spot: &Account<PriceUpdateV2>,
    equity_twap: &Account<TwapUpdate>,
    collateral_spot: &Account<PriceUpdateV2>,
    collateral_twap: &Account<TwapUpdate>,
    equity_multiplier: u128,
) -> Result<ValidatedPrices> {
    let equity = equity_spot
        .get_price_no_older_than(clock, config.max_price_age_seconds, &config.equity_feed_id)
        .map_err(|_| error!(CairnError::InvalidOraclePrice))?;
    let collateral = collateral_spot
        .get_price_no_older_than(
            clock,
            config.max_price_age_seconds,
            &config.collateral_feed_id,
        )
        .map_err(|_| error!(CairnError::InvalidOraclePrice))?;
    let equity_average = equity_twap
        .get_twap_no_older_than(
            clock,
            config.max_price_age_seconds,
            config.twap_window_seconds,
            &config.equity_feed_id,
        )
        .map_err(|_| error!(CairnError::InvalidOraclePrice))?;
    let collateral_average = collateral_twap
        .get_twap_no_older_than(
            clock,
            config.max_price_age_seconds,
            config.twap_window_seconds,
            &config.collateral_feed_id,
        )
        .map_err(|_| error!(CairnError::InvalidOraclePrice))?;

    require!(
        confidence_bps(equity.price, equity.conf)? <= config.max_confidence_bps,
        CairnError::OracleConfidenceTooWide
    );
    require!(
        confidence_bps(collateral.price, collateral.conf)? <= config.max_confidence_bps,
        CairnError::OracleConfidenceTooWide
    );
    require!(
        equity_average.down_slots_ratio <= config.max_twap_down_slots_ratio
            && collateral_average.down_slots_ratio <= config.max_twap_down_slots_ratio,
        CairnError::TwapQualityTooLow
    );

    let equity_mid = normalized_price(equity.price, 0, equity.exponent, false)?;
    let equity_twap_mid =
        normalized_price(equity_average.price, 0, equity_average.exponent, false)?;
    let collateral_mid = normalized_price(collateral.price, 0, collateral.exponent, false)?;
    let collateral_twap_mid = normalized_price(
        collateral_average.price,
        0,
        collateral_average.exponent,
        false,
    )?;
    require!(
        deviation_bps(equity_mid, equity_twap_mid)? <= config.max_spot_twap_deviation_bps,
        CairnError::OracleDeviationTooLarge
    );
    require!(
        deviation_bps(collateral_mid, collateral_twap_mid)? <= config.max_spot_twap_deviation_bps,
        CairnError::OracleDeviationTooLarge
    );

    Ok(ValidatedPrices {
        // Priced per RAW equity unit: the feed quotes a UI token, and one raw unit of a
        // ScaledUiAmount mint is `multiplier` UI tokens.
        equity_debt_price: scale_equity_price(
            normalized_price(equity.price, equity.conf, equity.exponent, true)?,
            equity_multiplier,
        )?,
        collateral_price: normalized_price(
            collateral.price,
            collateral.conf,
            collateral.exponent,
            false,
        )?,
    })
}
