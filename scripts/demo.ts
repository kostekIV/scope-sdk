import { Scope } from '../src/';
import {
  address,
  AddressesByLookupTableAddress,
  addSignersToTransactionMessage,
  appendTransactionMessageInstructions,
  compressTransactionMessageUsingAddressLookupTables,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  GetLatestBlockhashApi,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  IInstruction,
  pipe,
  Rpc,
  RpcSubscriptions,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  Signature,
  signTransactionMessageWithSigners,
  SolanaRpcApiMainnet,
  SolanaRpcSubscriptionsApi,
  testnet,
  TransactionSigner,
} from '@solana/kit';
import fs from 'fs';
import { OracleType } from '../src/@codegen/scope/types';

export const makeFeedIdBytes = (feedId: string) => {
  return Buffer.from(feedId.padEnd(32, '\0'));
};

export const makePriceSeed = () => {
  return Buffer.from('price'.padEnd(32, '\0'));
};

export async function fetchBlockhash(rpc: Rpc<GetLatestBlockhashApi>) {
  const res = await rpc.getLatestBlockhash({ commitment: 'finalized' }).send();
  return {
    blockhash: res.value.blockhash,
    lastValidBlockHeight: res.value.lastValidBlockHeight,
    slot: res.context.slot,
  };
}
export async function feedPda(feed: string) {
  const [addr] = await getProgramDerivedAddress({
    seeds: [makePriceSeed(), makeFeedIdBytes(feed)],
    programAddress: address('rds8J7VKqLQgzDr7vS59dkQga3B1BotgFy8F7LSLC74'),
  });
  return addr;
}

export type ConnectionPool = {
  rpc: Rpc<SolanaRpcApiMainnet>;
  wsRpc: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
};

export async function sendAndConfirmTx(
  { rpc, wsRpc }: ConnectionPool,
  payer: TransactionSigner,
  ixs: IInstruction[],
  signers: TransactionSigner[] = [],
  luts: AddressesByLookupTableAddress = {}
): Promise<Signature> {
  const blockhash = await fetchBlockhash(rpc);

  const tx = await pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => appendTransactionMessageInstructions(ixs, tx),
    (tx) => setTransactionMessageFeePayerSigner(payer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => compressTransactionMessageUsingAddressLookupTables(tx, luts),
    (tx) => addSignersToTransactionMessage(signers, tx),
    (tx) => signTransactionMessageWithSigners(tx)
  );

  const sig = getSignatureFromTransaction(tx);

  await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions: wsRpc })(tx, {
    commitment: 'processed',
    preflightCommitment: 'processed',
  });

  return sig;
}

const redStoneDemo = async (feed: string) => {
  const connection = createSolanaRpc(testnet('http://api.testnet.solana.com'));

  const ws = createSolanaRpcSubscriptions('ws://api.testnet.solana.com');
  const scope = new Scope('testnet', connection);
  const keypairFile = fs.readFileSync('/Users/jankoscisz/solana-keypair.json');
  const keypairBytes = new Uint8Array(JSON.parse(keypairFile.toString()));
  const keypair = await createKeyPairSignerFromBytes(keypairBytes);

  // already on the chain
  //  const [initIxs, signers] = await scope.initialise(keypair, feed);
  //  const initSig = await sendAndConfirmTx({ rpc: connection, wsRpc: ws }, keypair, initIxs, signers);
  //  console.log(`${feed} init tx: ${initSig}`);

  const updateIx = await scope.updateFeedMapping(keypair, feed, 0, OracleType.RedStone, await feedPda(feed));
  const updateSig = await sendAndConfirmTx({ rpc: connection, wsRpc: ws }, keypair, [updateIx]);
  console.log(`${feed} update tx: ${updateSig}`);

  const refreshIx = await scope.refreshPriceList({ feed }, [0]);
  const refreshSig = await sendAndConfirmTx({ rpc: connection, wsRpc: ws }, keypair, [refreshIx]);
  console.log(`${feed} refresh tx: ${refreshSig}`);

  const prices = await scope.getOraclePrices({ feed });
  for (const price of prices.prices) {
    if (Number(price.price.value) === 0) {
      continue;
    }
    console.log(`Price data for feed: ${feed}`);
    console.log(price.toJSON());
  }
};

redStoneDemo('ETH');
redStoneDemo('BTC');
