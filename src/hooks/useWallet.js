import { useState, useCallback } from 'react'
async function connect() {
  setConnecting(true);
  try {
    if (!window.freighter) throw new Error("Freighter not installed");
    const pk = await window.freighter.getPublicKey();  // triggers popup
    setAddress(pk);
    return pk;
  } catch(e) {
    throw e;
  } finally {
    setConnecting(false);
  }
}

export function useWallet() {
  const [address, setAddress] = useState(null)
  const [connecting, setConnecting] = useState(false)

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const connected = await isConnected()
      if (!connected) throw new Error('Freighter not installed')
      const pk = await getPublicKey()
      setAddress(pk)
      return pk
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => setAddress(null), [])

  const sign = useCallback((xdr) =>
    signTransaction(xdr, {
      networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE
    }), [])

  return { address, connecting, connect, disconnect, sign }
}