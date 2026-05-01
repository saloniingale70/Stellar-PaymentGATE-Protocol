import * as StellarSdk from '@stellar/stellar-sdk'

const CONTRACT_ID        = import.meta.env.VITE_CONTRACT_ID
const RPC_URL            = import.meta.env.VITE_RPC_URL
const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE

export const XLM_TOKEN        = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'  // fixed: was HHGCN3
const SIMULATION_FALLBACK     = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'

const server   = new StellarSdk.rpc.Server(RPC_URL)
const contract = new StellarSdk.Contract(CONTRACT_ID)

// ─── ScVal helpers ─────────────────────────────────────────────────────────
const sym  = (s) => StellarSdk.nativeToScVal(String(s), { type: 'symbol'  })
const addr = (a) => {
  if (a.startsWith('C')) {
    const bytes = StellarSdk.StrKey.decodeContract(a)
    return StellarSdk.xdr.ScVal.scvAddress(
      StellarSdk.xdr.ScAddress.scAddressTypeContract(
        StellarSdk.xdr.Hash.fromXDR(bytes)
      )
    )
  }
  return StellarSdk.xdr.ScVal.scvAddress(
    StellarSdk.xdr.ScAddress.scAddressTypeAccount(
      StellarSdk.xdr.AccountID.publicKeyTypeEd25519(
        StellarSdk.StrKey.decodeEd25519PublicKey(a)
      )
    )
  )
}
const u32  = (n) => StellarSdk.nativeToScVal(Number(n), { type: 'u32'  })
const i128 = (n) => StellarSdk.nativeToScVal(BigInt(n), { type: 'i128' })

// ─── Build → sign → submit ─────────────────────────────────────────────────
async function buildAndSend(account, operation, signTransaction) {
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build()

  const prepared  = await server.prepareTransaction(tx)
  const signedXdr = await signTransaction(prepared.toXDR())
  const signedTx  = StellarSdk.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)
  const response  = await server.sendTransaction(signedTx)
  return waitForConfirmation(response.hash)
}

// ─── Poll until confirmed ──────────────────────────────────────────────────
async function waitForConfirmation(hash) {
  for (let i = 0; i < 20; i++) {
    const status = await server.getTransaction(hash)
    if (status.status === 'SUCCESS') return { ...status, hash }
    if (status.status === 'FAILED')  throw new Error(`Transaction failed: ${hash}`)
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error('Transaction confirmation timeout')
}

// ─── Open deal ─────────────────────────────────────────────────────────────
export async function createEscrow({
  id,
  payer,
  receiver,
  token = XLM_TOKEN,
  total_amount,
  milestone_count,
  signTransaction,
}) {
  if (!id?.trim())             throw new Error('Deal ID must be a non-empty string')
  if (!payer || !receiver)     throw new Error('Depositor and beneficiary addresses are required')
  if (!(total_amount > 0))     throw new Error('Total amount must be greater than 0')
  if (!(milestone_count > 0))  throw new Error('Checkpoint count must be greater than 0')

  const account = await server.getAccount(payer)
  return buildAndSend(
    account,
    contract.call(
      'open_deal',           // deployed function name
      sym(id.trim()),
      addr(payer),
      addr(receiver),
      addr(token),
      i128(total_amount),
      u32(milestone_count),
    ),
    signTransaction,
  )
}

// ─── Approve checkpoint ────────────────────────────────────────────────────
export async function completeMilestone({ id, index, payerAddress, signTransaction }) {
  if (!id?.trim())                      throw new Error('Deal ID must be a non-empty string')
  if (index === undefined || index < 0) throw new Error('Valid checkpoint index is required')

  const account = await server.getAccount(payerAddress)
  return buildAndSend(
    account,
    contract.call('approve_checkpoint', sym(id), u32(index)),  // deployed function name
    signTransaction,
  )
}

// ─── Withdraw funds ────────────────────────────────────────────────────────
export async function releaseEscrow({ id, receiverAddress, signTransaction }) {
  if (!id?.trim()) throw new Error('Deal ID must be a non-empty string')

  const account = await server.getAccount(receiverAddress)
  return buildAndSend(
    account,
    contract.call('withdraw', sym(id)),  // deployed function name
    signTransaction,
  )
}

// ─── Void deal ─────────────────────────────────────────────────────────────
export async function cancelEscrow({ id, payerAddress, signTransaction }) {
  if (!id?.trim()) throw new Error('Deal ID must be a non-empty string')

  const account = await server.getAccount(payerAddress)
  return buildAndSend(
    account,
    contract.call('void_deal', sym(id)),  // deployed function name
    signTransaction,
  )
}

// ─── Read deal (simulation — no wallet needed) ─────────────────────────────
export async function getEscrow(id, userAddress) {
  if (!id?.trim()) throw new Error('Deal ID must be a non-empty string')

  try {
    const source  = userAddress ?? SIMULATION_FALLBACK
    const account = await server.getAccount(source)

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call('get_deal', sym(id)))  // deployed function name
      .setTimeout(30)
      .build()

    const result = await server.simulateTransaction(tx)
    if (result.error)   throw new Error(result.error)
    if (!result.result) throw new Error('Deal not found')

    const n = StellarSdk.scValToNative(result.result.retval)

    // Deal struct fields: depositor, beneficiary, asset, locked_amount, checkpoints, disbursed
    const checkpoints = Array.from(n.checkpoints).map((c) =>
      typeof c === 'boolean' ? c : Boolean(c),
    )

    return {
      payer:           n.depositor?.toString()    ?? String(n.depositor),
      receiver:        n.beneficiary?.toString()  ?? String(n.beneficiary),
      token:           n.asset?.toString()        ?? String(n.asset),
      total_amount:    Number(n.locked_amount),
      released:        Number(n.disbursed),
      milestones:      checkpoints,
      completed_count: checkpoints.filter(Boolean).length,
      total_count:     checkpoints.length,
      is_complete:     checkpoints.every(Boolean),
      remaining:       Number(n.locked_amount) - Number(n.disbursed),
    }
  } catch (e) {
    console.error('getEscrow error:', e)
    throw new Error(e.message || 'Deal not found')
  }
}