#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env, Symbol,
};


struct T {
    env:        Env,
    client:     PaymentGateClient,
    token:      Address,
    depositor:  Address,
    beneficiary: Address,
    tc:         TokenClient,
}

impl T {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let depositor    = Address::generate(&env);
        let beneficiary  = Address::generate(&env);
        let admin        = Address::generate(&env);

        let contract_id  = env.register_contract(None, PaymentGate);
        let client       = PaymentGateClient::new(&env, &contract_id);

        let token_id     = env.register_stellar_asset_contract_v2(admin.clone());
        StellarAssetClient::new(&env, &token_id.address())
            .mint(&depositor, &1_000_000_000i128);
        let tc = TokenClient::new(&env, &token_id.address());

        T { env, client, token: token_id.address(), depositor, beneficiary, tc }
    }

    fn id(&self, s: &str) -> Symbol       { Symbol::new(&self.env, s) }
    fn bal(&self, a: &Address)  -> i128   { self.tc.balance(a) }
    fn contract_bal(&self)      -> i128   { self.tc.balance(&self.client.address) }
}



#[test]
fn open_deal_locks_funds_and_initialises_state() {
    let t = T::new();

    t.client.open_deal(
        &t.id("deal1"),
        &t.depositor,
        &t.beneficiary,
        &t.token,
        &3_000_000i128,
        &3u32,
    );

   
    assert_eq!(t.bal(&t.depositor),  1_000_000_000 - 3_000_000);
    assert_eq!(t.contract_bal(),     3_000_000);

    // Deal state is correct
    let deal = t.client.get_deal(&t.id("deal1"));
    assert_eq!(deal.locked_amount, 3_000_000);
    assert_eq!(deal.disbursed,     0);
    assert_eq!(deal.checkpoints.len(), 3);
    for i in 0..deal.checkpoints.len() {
        assert!(!deal.checkpoints.get(i).unwrap());
    }
}



#[test]
fn approve_and_withdraw_releases_proportional_funds() {
    let t = T::new();

    t.client.open_deal(
        &t.id("deal2"),
        &t.depositor,
        &t.beneficiary,
        &t.token,
        &9_000_000i128,
        &3u32,
    );

  
    t.client.approve_checkpoint(&t.id("deal2"), &0u32);
    t.client.withdraw(&t.id("deal2"));
    assert_eq!(t.bal(&t.beneficiary), 3_000_000);
    assert_eq!(t.client.get_deal(&t.id("deal2")).disbursed, 3_000_000);

    t.client.approve_checkpoint(&t.id("deal2"), &1u32);
    t.client.withdraw(&t.id("deal2"));
    assert_eq!(t.bal(&t.beneficiary), 6_000_000);

  
    t.client.approve_checkpoint(&t.id("deal2"), &2u32);
    t.client.withdraw(&t.id("deal2"));
    assert_eq!(t.bal(&t.beneficiary), 9_000_000);
    assert_eq!(t.contract_bal(),      0);
}


#[test]
fn void_deal_refunds_remainder_to_depositor() {
    let t = T::new();

    t.client.open_deal(
        &t.id("deal3"),
        &t.depositor,
        &t.beneficiary,
        &t.token,
        &6_000_000i128,
        &3u32,
    );

   
    t.client.approve_checkpoint(&t.id("deal3"), &0u32);
    t.client.withdraw(&t.id("deal3"));
    assert_eq!(t.bal(&t.beneficiary), 2_000_000);

    let depositor_snapshot = t.bal(&t.depositor);

    t.client.void_deal(&t.id("deal3"));
    assert_eq!(t.bal(&t.depositor), depositor_snapshot + 4_000_000);
    assert_eq!(t.contract_bal(),    0);
}