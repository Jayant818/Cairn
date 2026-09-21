use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    spl_token_2022::{
        extension::{
            default_account_state::DefaultAccountState,
            interest_bearing_mint::InterestBearingConfig,
            mint_close_authority::MintCloseAuthority,
            non_transferable::NonTransferable,
            pausable::PausableConfig,
            permanent_delegate::PermanentDelegate,
            scaled_ui_amount::ScaledUiAmountConfig,
            transfer_fee::TransferFeeConfig,
            transfer_hook::{get_program_id, TransferHook},
            BaseStateWithExtensions, StateWithExtensions,
        },
        state::Mint as Token2022Mint,
    },
    Mint,
};

use crate::errors::CairnError;

pub fn validate_market_mints(
    equity: &InterfaceAccount<Mint>,
    receipt: &InterfaceAccount<Mint>,
) -> Result<()> {
    require!(
        equity.decimals == receipt.decimals,
        CairnError::DecimalMismatch
    );
    require!(
        *receipt.to_account_info().owner == anchor_spl::token_2022::ID,
        CairnError::ReceiptMustUseToken2022
    );
    require!(
        equity.freeze_authority == receipt.freeze_authority,
        CairnError::MintPolicyMismatch
    );
    reject_closable(equity)?;
    reject_closable(receipt)?;

    if *equity.to_account_info().owner == anchor_spl::token_2022::ID {
        require!(
            extension_equal::<PermanentDelegate>(equity, receipt)?,
            CairnError::MintPolicyMismatch
        );
        require!(
            extension_equal::<TransferHook>(equity, receipt)?,
            CairnError::MintPolicyMismatch
        );
        require!(
            extension_equal::<PausableConfig>(equity, receipt)?,
            CairnError::MintPolicyMismatch
        );
        require!(
            extension_equal::<DefaultAccountState>(equity, receipt)?,
            CairnError::MintPolicyMismatch
        );
        require!(
            extension_presence::<NonTransferable>(equity)?
                == extension_presence::<NonTransferable>(receipt)?,
            CairnError::MintPolicyMismatch
        );
    } else {
        require!(
            !extension_presence::<PermanentDelegate>(receipt)?
                && !extension_presence::<TransferHook>(receipt)?
                && !extension_presence::<PausableConfig>(receipt)?
                && !extension_presence::<DefaultAccountState>(receipt)?
                && !extension_presence::<NonTransferable>(receipt)?,
            CairnError::MintPolicyMismatch
        );
    }
    require!(
        !extension_presence::<TransferFeeConfig>(receipt)?
            && !extension_presence::<InterestBearingConfig>(receipt)?
            && !extension_presence::<ScaledUiAmountConfig>(receipt)?,
        CairnError::MintPolicyMismatch
    );
    reject_active_transfer_hook(equity)?;
    reject_active_transfer_hook(receipt)?;
    Ok(())
}

fn reject_active_transfer_hook(mint: &InterfaceAccount<Mint>) -> Result<()> {
    if *mint.to_account_info().owner != anchor_spl::token_2022::ID {
        return Ok(());
    }
    let info = mint.to_account_info();
    let data = info.try_borrow_data()?;
    let state = StateWithExtensions::<Token2022Mint>::unpack(&data)
        .map_err(|_| error!(CairnError::MintPolicyMismatch))?;
    require!(
        get_program_id(&state).is_none(),
        CairnError::MintPolicyMismatch
    );
    Ok(())
}

fn reject_closable(mint: &InterfaceAccount<Mint>) -> Result<()> {
    if *mint.to_account_info().owner != anchor_spl::token_2022::ID {
        return Ok(());
    }
    let info = mint.to_account_info();
    let data = info.try_borrow_data()?;
    let state = StateWithExtensions::<Token2022Mint>::unpack(&data)
        .map_err(|_| error!(CairnError::MintPolicyMismatch))?;
    require!(
        state.get_extension::<MintCloseAuthority>().is_err(),
        CairnError::MintIsClosable
    );
    Ok(())
}

fn extension_presence<T: anchor_spl::token_interface::spl_token_2022::extension::Extension>(
    mint: &InterfaceAccount<Mint>,
) -> Result<bool> {
    if *mint.to_account_info().owner != anchor_spl::token_2022::ID {
        return Ok(false);
    }
    let info = mint.to_account_info();
    let data = info.try_borrow_data()?;
    let state = StateWithExtensions::<Token2022Mint>::unpack(&data)
        .map_err(|_| error!(CairnError::MintPolicyMismatch))?;
    Ok(state.get_extension_bytes::<T>().is_ok())
}

fn extension_equal<T>(left: &InterfaceAccount<Mint>, right: &InterfaceAccount<Mint>) -> Result<bool>
where
    T: anchor_spl::token_interface::spl_token_2022::extension::Extension,
{
    let left_info = left.to_account_info();
    let left_data = left_info.try_borrow_data()?;
    let left_state = StateWithExtensions::<Token2022Mint>::unpack(&left_data)
        .map_err(|_| error!(CairnError::MintPolicyMismatch))?;
    let right_info = right.to_account_info();
    let right_data = right_info.try_borrow_data()?;
    let right_state = StateWithExtensions::<Token2022Mint>::unpack(&right_data)
        .map_err(|_| error!(CairnError::MintPolicyMismatch))?;
    match (
        left_state.get_extension_bytes::<T>(),
        right_state.get_extension_bytes::<T>(),
    ) {
        (Ok(a), Ok(b)) => Ok(a == b),
        (Err(_), Err(_)) => Ok(true),
        _ => Ok(false),
    }
}
