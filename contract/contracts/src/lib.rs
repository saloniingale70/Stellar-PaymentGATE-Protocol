#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token, Env, Symbol, Address, Vec,
};

#[derive(Clone)]
#[contracttype]
pub struct Deal {
    pub depositor:     Address,
    pub beneficiary:   Address,
    pub asset:         Address,
    pub locked_amount: i128,
    pub checkpoints:   Vec<bool>,
    pub disbursed:     i128,
}

#[contract]
pub struct PaymentGate;

#[contractimpl]
impl PaymentGate {

    pub fn open_deal(
        env: Env,
        deal_id: Symbol,
        depositor: Address,
        beneficiary: Address,
        asset: Address,
        locked_amount: i128,
        checkpoint_count: u32,
    ) {
        depositor.require_auth();

        let asset_client = token::Client::new(&env, &asset);
        asset_client.transfer(
            &depositor,
            &env.current_contract_address(),
            &locked_amount,
        );

        let mut checkpoints = Vec::new(&env);
        for _ in 0..checkpoint_count {
            checkpoints.push_back(false);
        }

        let deal = Deal {
            depositor,
            beneficiary,
            asset,
            locked_amount,
            checkpoints,
            disbursed: 0,
        };

        env.storage().instance().set(&deal_id, &deal);
    }

    pub fn approve_checkpoint(env: Env, deal_id: Symbol, index: u32) {
        let mut deal: Deal = env.storage().instance().get(&deal_id).unwrap();
        deal.depositor.require_auth();

        assert!(index < deal.checkpoints.len(), "index out of bounds");

        let mut updated = Vec::new(&env);
        for i in 0..deal.checkpoints.len() {
            if i == index {
                updated.push_back(true);
            } else {
                updated.push_back(deal.checkpoints.get(i).unwrap());
            }
        }

        deal.checkpoints = updated;
        env.storage().instance().set(&deal_id, &deal);
    }

    pub fn withdraw(env: Env, deal_id: Symbol) {
        let mut deal: Deal = env.storage().instance().get(&deal_id).unwrap();
        deal.beneficiary.require_auth();

        let total = deal.checkpoints.len() as i128;
        let mut approved: i128 = 0;

        for i in 0..deal.checkpoints.len() {
            if deal.checkpoints.get(i).unwrap() {
                approved += 1;
            }
        }

        let withdrawable = (deal.locked_amount * approved) / total;
        let to_send = withdrawable - deal.disbursed;

        if to_send <= 0 {
            return;
        }

        let asset_client = token::Client::new(&env, &deal.asset);
        asset_client.transfer(
            &env.current_contract_address(),
            &deal.beneficiary,
            &to_send,
        );

        deal.disbursed += to_send;
        env.storage().instance().set(&deal_id, &deal);
    }

    pub fn void_deal(env: Env, deal_id: Symbol) {
        let deal: Deal = env.storage().instance().get(&deal_id).unwrap();
        deal.depositor.require_auth();

        let remainder = deal.locked_amount - deal.disbursed;

        if remainder > 0 {
            let asset_client = token::Client::new(&env, &deal.asset);
            asset_client.transfer(
                &env.current_contract_address(),
                &deal.depositor,
                &remainder,
            );
        }

        env.storage().instance().remove(&deal_id);
    }

    pub fn get_deal(env: Env, deal_id: Symbol) -> Deal {
        env.storage().instance().get(&deal_id).unwrap()
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::Address as _,
        token::{Client as TokenClient, StellarAssetClient},
        Address, Env, Symbol,
    };

    fn setup(env: &Env) -> (PaymentGateClient<'_>, Address, Address, Address, TokenClient<'_>) {
        env.mock_all_auths();

        let depositor   = Address::generate(env);
        let beneficiary = Address::generate(env);
        let admin       = Address::generate(env);

        let contract_id = env.register(PaymentGate, ());
        let client      = PaymentGateClient::new(env, &contract_id);

        let token_id = env.register_stellar_asset_contract_v2(admin.clone());
        StellarAssetClient::new(env, &token_id.address()).mint(&depositor, &1_000_000_000i128);
        let tc = TokenClient::new(env, &token_id.address());

        (client, token_id.address(), depositor, beneficiary, tc)
    }

    // Test 1 — open_deal locks funds inside the contract
    #[test]
    fn open_deal_locks_funds() {
        let env = Env::default();
        let (client, token, depositor, beneficiary, tc) = setup(&env);
        let id = Symbol::new(&env, "deal1");

        client.open_deal(&id, &depositor, &beneficiary, &token, &3_000_000i128, &3u32);

        // Depositor debited, contract credited
        assert_eq!(tc.balance(&depositor),      1_000_000_000 - 3_000_000);
        assert_eq!(tc.balance(&client.address), 3_000_000);

        // State initialised correctly
        let deal = client.get_deal(&id);
        assert_eq!(deal.locked_amount, 3_000_000);
        assert_eq!(deal.disbursed,     0);
        for i in 0..deal.checkpoints.len() {
            assert!(!deal.checkpoints.get(i).unwrap());
        }
    }

    #[test]
    fn approve_and_withdraw_releases_proportional_funds() {
        let env = Env::default();
        let (client, token, depositor, beneficiary, tc) = setup(&env);
        let id = Symbol::new(&env, "deal2");

        client.open_deal(&id, &depositor, &beneficiary, &token, &9_000_000i128, &3u32);

      
        client.approve_checkpoint(&id, &0u32);
        client.withdraw(&id);
        assert_eq!(tc.balance(&beneficiary),    3_000_000);
        assert_eq!(client.get_deal(&id).disbursed, 3_000_000);

       
        client.approve_checkpoint(&id, &1u32);
        client.withdraw(&id);
        assert_eq!(tc.balance(&beneficiary), 6_000_000);

        client.approve_checkpoint(&id, &2u32);
        client.withdraw(&id);
        assert_eq!(tc.balance(&beneficiary),    9_000_000);
        assert_eq!(tc.balance(&client.address), 0);
    }

    #[test]
    fn void_deal_refunds_remainder_to_depositor() {
        let env = Env::default();
        let (client, token, depositor, beneficiary, tc) = setup(&env);
        let id = Symbol::new(&env, "deal3");

        client.open_deal(&id, &depositor, &beneficiary, &token, &6_000_000i128, &3u32);

        client.approve_checkpoint(&id, &0u32);
        client.withdraw(&id);
        assert_eq!(tc.balance(&beneficiary), 2_000_000);

        let depositor_snapshot = tc.balance(&depositor);

        client.void_deal(&id);
        assert_eq!(tc.balance(&depositor),      depositor_snapshot + 4_000_000);
        assert_eq!(tc.balance(&client.address), 0);
    }
}