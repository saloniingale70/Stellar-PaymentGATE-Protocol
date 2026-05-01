#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation},
    token, Address, Env, IntoVal, Symbol,
};

fn setup(
    env: &Env,
) -> (
    EscrowContractClient,
    token::Client,
    token::AdminClient,
    Address, 
) {
    let contract_id = env.register_contract(None, EscrowContract);
    let client = EscrowContractClient::new(env, &contract_id);


    let token_admin = Address::generate(env);
    let token_address = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = token::Client::new(env, &token_address);
    let token_admin_client = token::AdminClient::new(env, &token_address);

    (client, token_client, token_admin_client, token_address)
}

fn make_address(env: &Env) -> Address {
    Address::generate(env)
}



#[test]
fn test_create_escrow_stores_correct_state() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, token_client, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);

    
    token_admin_client.mint(&payer, &1000);

    client.create_escrow(
        &Symbol::new(&env, "esc1"),
        &payer,
        &receiver,
        &token_address,
        &1000,
        &3,
    );

    let esc = client.get_escrow(&Symbol::new(&env, "esc1"));

    assert_eq!(esc.total_amount, 1000);
    assert_eq!(esc.released, 0);
    assert_eq!(esc.milestones.len(), 3);
    assert_eq!(esc.payer, payer);
    assert_eq!(esc.receiver, receiver);
    assert_eq!(esc.token, token_address);

    
    for i in 0..3 {
        assert_eq!(esc.milestones.get(i).unwrap(), false);
    }
}

#[test]
fn test_create_escrow_transfers_tokens_to_contract() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, token_client, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);
    let contract_id = client.address.clone();

    token_admin_client.mint(&payer, &1000);
    assert_eq!(token_client.balance(&payer), 1000);

    client.create_escrow(
        &Symbol::new(&env, "esc1"),
        &payer,
        &receiver,
        &token_address,
        &1000,
        &3,
    );

    
    assert_eq!(token_client.balance(&payer), 0);
    assert_eq!(token_client.balance(&contract_id), 1000);
}

#[test]
fn test_create_escrow_requires_payer_auth() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);

    token_admin_client.mint(&payer, &500);

    client.create_escrow(
        &Symbol::new(&env, "esc1"),
        &payer,
        &receiver,
        &token_address,
        &500,
        &2,
    );

    let auths = env.auths();
    
    assert!(auths.iter().any(|(addr, _)| addr == &payer));
}


#[test]
fn test_complete_milestone_marks_correct_index() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);

    token_admin_client.mint(&payer, &900);
    client.create_escrow(
        &Symbol::new(&env, "esc1"),
        &payer,
        &receiver,
        &token_address,
        &900,
        &3,
    );

    client.complete_milestone(&Symbol::new(&env, "esc1"), &1);

    let esc = client.get_escrow(&Symbol::new(&env, "esc1"));
    assert_eq!(esc.milestones.get(0).unwrap(), false);
    assert_eq!(esc.milestones.get(1).unwrap(), true);  // only index 1 done
    assert_eq!(esc.milestones.get(2).unwrap(), false);
}

#[test]
fn test_complete_multiple_milestones_independently() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);

    token_admin_client.mint(&payer, &1200);
    client.create_escrow(
        &Symbol::new(&env, "esc2"),
        &payer,
        &receiver,
        &token_address,
        &1200,
        &4,
    );

    client.complete_milestone(&Symbol::new(&env, "esc2"), &0);
    client.complete_milestone(&Symbol::new(&env, "esc2"), &2);

    let esc = client.get_escrow(&Symbol::new(&env, "esc2"));
    assert_eq!(esc.milestones.get(0).unwrap(), true);
    assert_eq!(esc.milestones.get(1).unwrap(), false);
    assert_eq!(esc.milestones.get(2).unwrap(), true);
    assert_eq!(esc.milestones.get(3).unwrap(), false);
}

#[test]
#[should_panic(expected = "index out of bounds")]
fn test_complete_milestone_out_of_bounds_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);

    token_admin_client.mint(&payer, &300);
    client.create_escrow(
        &Symbol::new(&env, "esc1"),
        &payer,
        &receiver,
        &token_address,
        &300,
        &2,
    );

    
    client.complete_milestone(&Symbol::new(&env, "esc1"), &5);
}



#[test]
fn test_release_proportional_to_completed_milestones() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, token_client, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);
    let contract_id = client.address.clone();

    
    token_admin_client.mint(&payer, &900);
    client.create_escrow(
        &Symbol::new(&env, "esc1"),
        &payer,
        &receiver,
        &token_address,
        &900,
        &3,
    );

    
    client.complete_milestone(&Symbol::new(&env, "esc1"), &0);
    client.release(&Symbol::new(&env, "esc1"));

    assert_eq!(token_client.balance(&receiver), 300);      // 1/3 released
    assert_eq!(token_client.balance(&contract_id), 600);   // 2/3 still locked

    let esc = client.get_escrow(&Symbol::new(&env, "esc1"));
    assert_eq!(esc.released, 300);
}

#[test]
fn test_release_all_milestones_releases_total() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, token_client, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);

    token_admin_client.mint(&payer, &600);
    client.create_escrow(
        &Symbol::new(&env, "esc1"),
        &payer,
        &receiver,
        &token_address,
        &600,
        &3,
    );

    client.complete_milestone(&Symbol::new(&env, "esc1"), &0);
    client.complete_milestone(&Symbol::new(&env, "esc1"), &1);
    client.complete_milestone(&Symbol::new(&env, "esc1"), &2);
    client.release(&Symbol::new(&env, "esc1"));

    
    assert_eq!(token_client.balance(&receiver), 600);
    assert_eq!(token_client.balance(&client.address), 0);
}

#[test]
fn test_release_is_cumulative_not_duplicated() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, token_client, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);


    token_admin_client.mint(&payer, &1000);
    client.create_escrow(
        &Symbol::new(&env, "esc1"),
        &payer,
        &receiver,
        &token_address,
        &1000,
        &2,
    );

    
    client.complete_milestone(&Symbol::new(&env, "esc1"), &0);
    client.release(&Symbol::new(&env, "esc1"));
    assert_eq!(token_client.balance(&receiver), 500);

    client.release(&Symbol::new(&env, "esc1"));
    assert_eq!(token_client.balance(&receiver), 500);

    
    client.complete_milestone(&Symbol::new(&env, "esc1"), &1);
    client.release(&Symbol::new(&env, "esc1"));
    assert_eq!(token_client.balance(&receiver), 1000);
}

#[test]
fn test_release_no_milestones_done_transfers_nothing() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, token_client, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);

    token_admin_client.mint(&payer, &800);
    client.create_escrow(
        &Symbol::new(&env, "esc1"),
        &payer,
        &receiver,
        &token_address,
        &800,
        &4,
    );

    client.release(&Symbol::new(&env, "esc1"));

    
    assert_eq!(token_client.balance(&receiver), 0);
    assert_eq!(token_client.balance(&client.address), 800);
}


#[test]
fn test_cancel_refunds_full_amount_if_nothing_released() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, token_client, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);

    token_admin_client.mint(&payer, &750);
    client.create_escrow(
        &Symbol::new(&env, "esc1"),
        &payer,
        &receiver,
        &token_address,
        &750,
        &3,
    );

    client.cancel_escrow(&Symbol::new(&env, "esc1"));

    
    assert_eq!(token_client.balance(&payer), 750);
    assert_eq!(token_client.balance(&client.address), 0);
}

#[test]
fn test_cancel_refunds_only_remaining_after_partial_release() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, token_client, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);

    token_admin_client.mint(&payer, &900);
    client.create_escrow(
        &Symbol::new(&env, "esc1"),
        &payer,
        &receiver,
        &token_address,
        &900,
        &3,
    );

    
    client.complete_milestone(&Symbol::new(&env, "esc1"), &0);
    client.release(&Symbol::new(&env, "esc1"));


    client.cancel_escrow(&Symbol::new(&env, "esc1"));
    assert_eq!(token_client.balance(&payer), 600);
    assert_eq!(token_client.balance(&receiver), 300);
    assert_eq!(token_client.balance(&client.address), 0);
}

#[test]
#[should_panic]
fn test_cancel_removes_escrow_from_storage() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);

    token_admin_client.mint(&payer, &200);
    client.create_escrow(
        &Symbol::new(&env, "esc1"),
        &payer,
        &receiver,
        &token_address,
        &200,
        &1,
    );

    client.cancel_escrow(&Symbol::new(&env, "esc1"));

    
    client.get_escrow(&Symbol::new(&env, "esc1"));
}



#[test]
fn test_single_milestone_full_lifecycle() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, token_client, token_admin_client, token_address) = setup(&env);
    let payer = make_address(&env);
    let receiver = make_address(&env);

    token_admin_client.mint(&payer, &500);
    client.create_escrow(
        &Symbol::new(&env, "single"),
        &payer,
        &receiver,
        &token_address,
        &500,
        &1,
    );

    client.complete_milestone(&Symbol::new(&env, "single"), &0);
    client.release(&Symbol::new(&env, "single"));

    assert_eq!(token_client.balance(&receiver), 500);
    assert_eq!(token_client.balance(&client.address), 0);

    let esc = client.get_escrow(&Symbol::new(&env, "single"));
    assert_eq!(esc.released, 500);
}

#[test]
fn test_multiple_escrows_are_independent() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, token_client, token_admin_client, token_address) = setup(&env);
    let payer_a = make_address(&env);
    let payer_b = make_address(&env);
    let receiver_a = make_address(&env);
    let receiver_b = make_address(&env);

    token_admin_client.mint(&payer_a, &600);
    token_admin_client.mint(&payer_b, &400);

    client.create_escrow(
        &Symbol::new(&env, "escA"),
        &payer_a,
        &receiver_a,
        &token_address,
        &600,
        &3,
    );
    client.create_escrow(
        &Symbol::new(&env, "escB"),
        &payer_b,
        &receiver_b,
        &token_address,
        &400,
        &2,
    );

    
    client.complete_milestone(&Symbol::new(&env, "escA"), &0);
    client.complete_milestone(&Symbol::new(&env, "escA"), &1);
    client.complete_milestone(&Symbol::new(&env, "escA"), &2);
    client.release(&Symbol::new(&env, "escA"));

    
    let esc_b = client.get_escrow(&Symbol::new(&env, "escB"));
    assert_eq!(esc_b.released, 0);
    assert_eq!(token_client.balance(&receiver_b), 0);

    
    assert_eq!(token_client.balance(&receiver_a), 600);
}