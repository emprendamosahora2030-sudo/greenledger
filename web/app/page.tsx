"use client";
import { useState } from "react";
import { requestAccess } from "@stellar/freighter-api";
import { useCarbonCredential } from "@/lib/useCarbonCredential";

export default function Home() {
  const { issueCredit, verifyCredit } = useCarbonCredential();
  const [address, setAddress] = useState("");
  const [tonnes, setTonnes] = useState(1);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const id = "CRED001";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      setOut(JSON.stringify(await fn(), null, 2));
    } catch (e) {
      setOut(`ERROR: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <h1>GreenLedger × ACTA</h1>
      <button
        disabled={busy}
        onClick={() =>
          run(async () => {
            const r = await requestAccess();
            if (r.error) throw new Error(String(r.error.message ?? r.error));
            setAddress(r.address);
            return { address: r.address };
          })
        }
      >
        1. Conectar Freighter
      </button>
      <p>Wallet: {address || "—"}</p>
      <label>
        Toneladas CO₂{" "}
        <input type="number" min={1} value={tonnes} onChange={(e) => setTonnes(Number(e.target.value))} />
      </label>
      <p>
        <button
          disabled={busy || !address}
          onClick={() =>
            run(async () => ({
              txId: await issueCredit(
                { id, tonnesCO2: tonnes, owner: address, status: "issued" },
                address,
              ),
            }))
          }
        >
          2. Issue credential ({id})
        </button>{" "}
        <button disabled={busy || !address} onClick={() => run(() => verifyCredit(address, id))}>
          3. Verificar ({id})
        </button>
      </p>
      <pre style={{ whiteSpace: "pre-wrap", background: "#f4f4f4", padding: 12 }}>{busy ? "Procesando…" : out}</pre>
    </main>
  );
}
