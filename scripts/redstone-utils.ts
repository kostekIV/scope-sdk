import { getProgramDerivedAddress, address } from '@solana/kit';

export const makeFeedIdBytes = (feedId: string) => {
  return Buffer.from(feedId.padEnd(32, '\0'));
};

export const makePriceSeed = () => {
  return Buffer.from('price'.padEnd(32, '\0'));
};
export async function feedPda(feed: string) {
  const [addr] = await getProgramDerivedAddress({
    seeds: [makePriceSeed(), makeFeedIdBytes(feed)],
    programAddress: address('rds8J7VKqLQgzDr7vS59dkQga3B1BotgFy8F7LSLC74'),
  });
  return addr;
}
