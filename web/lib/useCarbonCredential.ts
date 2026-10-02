"use client";
import {
  ActaApiError,
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

const errMsg = (e: unknown) => {
  if (e instanceof ActaApiError) {
    return `${e.message} | status=${e.status} code=${e.code} requestId=${e.requestId ?? "-"} body=${JSON.stringify(e.details)}`;
  }
  return e instanceof Error ? e.message : JSON.stringify(e);
};

/** Borra solo el registro del emisor en el IndexedDB del SDK (no toca la llave AES). */
function forgetIssuerIdentity(controller: string) {
  return new Promise<void>((resolve) => {
    const open = indexedDB.open("acta-issuer-identity", 2);
    open.onerror = () => resolve();
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("identities", "readwrite");
      tx.objectStore("identities").delete(`testnet:${controller}`);
      tx.oncomplete = () => (db.close(), resolve());
      tx.onerror = () => (db.close(), resolve());
    };
  });
}

export function useCarbonCredential() {
  const client = useActaClient();
  const { createVault } = useVault();
  const { issue } = useCredential();
  const { verifyVc, getVc } = useVaultRead();

  /** Un intento: a) DID emisor, b) vault del owner, c) issue(). Etiqueta el paso que falla. */
  async function attempt(credit: CarbonCredit, issuer: string) {
    const step = async <T,>(name: string, fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch (e) {
        throw new Error(`[${name}] ${errMsg(e)}`);
      }
    };

    const identity = await step("DID emisor", () =>
      client.getOrCreateIssuerIdentity({ controller: issuer, signTransaction: sign }),
    );

    await step("createVault", async () => {
      try {
        console.info("[acta] createVault", { owner: credit.owner, ownerDid: identity.did });
        // Un DID recién registrado puede tardar unos segundos en ser visible para la API de ACTA.
        for (let i = 0; ; i++) {
          try {
            await createVault({ owner: credit.owner, ownerDid: identity.did, signTransaction: sign });
            break;
          } catch (e) {
            const retryable = e instanceof ActaApiError && e.status === 400 && i < 3;
            if (!retryable) throw e;
            console.info(`[acta] createVault 400, reintento ${i + 1}/3 en 6s`);
            await new Promise((r) => setTimeout(r, 6000));
          }
        }
      } catch (e) {
        if (!/already/i.test(errMsg(e))) throw e;
      }
    });

    return step("issue", () =>
      issue({
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
      }),
    );
  }

  /**
   * Si el DID guardado en IndexedDB no resuelve on-chain (identidad huérfana de un
   * intento previo), se descarta y se registra uno nuevo (pide firma de Freighter).
   */
  async function issueCredit(credit: CarbonCredit, issuer: string) {
    try {
      return await attempt(credit, issuer);
    } catch (e) {
      if (!/could not be resolved|did.*resolv/i.test(errMsg(e))) throw e;
      await forgetIssuerIdentity(issuer);
      return attempt(credit, issuer);
    }
  }

  /** Verificación pública (no requiere wallet). */
  async function verifyCredit(owner: string, vcId: string) {
    const [status, vc] = await Promise.all([verifyVc({ owner, vcId }), getVc({ owner, vcId })]);
    return { status, vc };
  }

  return { issueCredit, verifyCredit };
}
