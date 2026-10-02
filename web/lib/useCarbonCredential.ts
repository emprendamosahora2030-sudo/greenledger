"use client";
import {
  useActaClient,
  useCredential,
  useVault,
  useVaultRead,
} from "@acta-team/credentials";
import { sign } from "./freighter";

// Contrato Soroban v2 de GreenLedger (fuente de verdad on-chain).
export const GREENLEDGER_CONTRACT_ID =
  "CDQMOI5XRRMYABQZ6KWXAFMF27C4UBUW4P2I2VA4GCCWSY6A5RYWYU6Y";

export type CarbonCredit = {
  id: string; // ej. "CRED001"
  tonnesCO2: number;
  owner: string; // G... del propietario
  status: "issued" | "transferred" | "retired";
};

export function useCarbonCredential() {
  const client = useActaClient();
  const { createVault } = useVault();
  const { issue } = useCredential();
  const { verifyVc, getVc } = useVaultRead();

  /** a) DID emisor, b) vault del owner, c) issue(). Devuelve el txId de issue. */
  async function issueCredit(credit: CarbonCredit, issuer: string) {
    const identity = await client.getOrCreateIssuerIdentity({
      controller: issuer,
      signTransaction: sign,
    });

    try {
      await createVault({ owner: credit.owner, ownerDid: identity.did, signTransaction: sign });
    } catch (e) {
      if (!/already/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }

    return issue({
      owner: credit.owner,
      vcId: credit.id,
      issuer,
      issuerDid: identity.did,
      signTransaction: sign,
      vcData: {
        "@context": ["https://www.w3.org/ns/credentials/v2"],
        type: ["VerifiableCredential", "CarbonCreditCredential"],
        issuer: identity.did,
        credentialSubject: {
          id: `did:pkh:stellar:testnet:${credit.owner}`,
          creditId: credit.id,
          tonnesCO2: credit.tonnesCO2,
          ownerAddress: credit.owner,
          greenLedgerContractId: GREENLEDGER_CONTRACT_ID,
          status: credit.status,
        },
      },
    });
  }

  /** Verificación pública (no requiere wallet). */
  async function verifyCredit(owner: string, vcId: string) {
    const [status, vc] = await Promise.all([verifyVc({ owner, vcId }), getVc({ owner, vcId })]);
    return { status, vc };
  }

  return { issueCredit, verifyCredit };
}
