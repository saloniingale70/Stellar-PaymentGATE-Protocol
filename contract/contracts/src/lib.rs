#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype,
    token, Env, Symbol, Address, Vec
};

#[derive(Clone)]
#[contracttype]
pub struct Deal {
    pub depositor: Address,
    pub beneficiary: Address,
    pub asset: Address,
    pub locked_amount: i128,
    pub checkpoints: Vec<bool>,
    pub disbursed: i128,
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