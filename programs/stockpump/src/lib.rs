use anchor_lang::prelude::*;

declare_id!("HSWCCzwdPgMX8RyqpZiUnCR3etipvTcv1dw31dfV3KaT");

#[program]
pub mod stockpump {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
