import { signTransaction } from "@stellar/freighter-api";

export const sign = async (xdr: string, opts: { networkPassphrase: string }) => {
  const res = await signTransaction(xdr, { networkPassphrase: opts.networkPassphrase });
  if (res.error) throw new Error(String(res.error.message ?? res.error));
  return res.signedTxXdr;
};
