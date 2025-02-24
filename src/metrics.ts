import axios from 'axios';
import { config } from './config';
import {
  AddressScore,
  TotalDelegatedScoreResponse,
  DaoMembersCountResponse
} from './types';

let daoMembersCount: number = 0;
let totalDelegatedScore: number = 0;
let spaceConfig: {
  network: string;
  strategies: any[];
} | null = null;

let lastHolderUpdateAt: number = 0;
let lastDelegatedUpdateAt: number = 0;

let delegationScores: AddressScore[] = [];

export const getDaoMembersCount = (): DaoMembersCountResponse => ({
  daoMembersCount,
  lastUpdatedAt: lastHolderUpdateAt
});

async function queryAllPages<T>(
  queryFn: (lastId: string) => string,
  toItems: (response: any) => any[],
  itemFn: (item: any) => T,
  graphqlEndpoint: string
): Promise<T[]> {
  let lastId = "";
  const items: T[] = [];
  const pageSize = 1000;

  while (true) {
    const response = await axios.post(graphqlEndpoint, {
      query: queryFn(lastId)
    });

    if (response.data.errors) {
      console.error('GraphQL errors:', response.data.errors);
      break;
    }

    const newItems = toItems(response);
    items.push(...newItems.map(itemFn));

    if (newItems.length < pageSize) {
      break;
    } else {
      lastId = newItems[newItems.length - 1].id;
    }
    process.stdout.write(".");
  }

  return items;
}

export const updateDaoMembersCount = async () => {
  try {
    const holders = await queryAllPages(
      (lastId) => `{
        accountTokenSnapshots(
          first: 1000,
          where: {
            token: "${config.tokenAddress.toLowerCase()}",
            totalConnectedMemberships_gt: 0,
            id_gt: "${lastId}"
          },
          orderBy: id,
          orderDirection: asc
        ) {
          id
        }
      }`,
      (res) => res.data.data.accountTokenSnapshots,
      (item) => item.id,
      config.sfSubgraphUrl
    );

    daoMembersCount = holders.length;
    lastHolderUpdateAt = Math.floor(Date.now() / 1000);

    console.log(`Updated DAO members count: ${daoMembersCount}`);
  } catch (error) {
    console.error('Error updating DAO members count:', error);
  }
};

export const getTotalDelegatedScore = (): TotalDelegatedScoreResponse => ({
  totalDelegatedScore,
  perDelegateScore: delegationScores,
  lastUpdatedAt: lastDelegatedUpdateAt
});

export const loadSpaceConfig = async () => {
  try {
    // Fetch space configuration
    const query = `
      query GetSpaceConfig($id: String!) {
        space(id: $id) {
          id
          name
          network
          strategies {
            name
            params
          }
        }
      }
    `;

    const response = await axios.post(
      config.snapshotHubUrl,
      {
        query,
        variables: {
          id: config.snapshotSpace
        }
      }
    );
    console.log(response.data.data.space);

    const space = response.data.data.space;
    if (!space) {
      throw new Error(`Space ${config.snapshotSpace} not found`);
    }

    // Use hardcoded strategy with provided delegates
    const fountainHeadStrategy = {
      name: "fountainhead",
      params: {
        tokenAddress: config.tokenAddress.toLowerCase(),
        lockerFactoryAddress: config.lockerFactoryAddress.toLowerCase()
      }
    };

    spaceConfig = {
      network: space.network,
      strategies: [
        {
          name: 'delegation',
          params: {
            symbol: 'SUP (delegated)',
            strategies: [
              fountainHeadStrategy
            ]
          }
        },
        fountainHeadStrategy
      ]
    };

    console.log(`Loaded space config for ${config.snapshotSpace}: ${JSON.stringify(spaceConfig, null, 2)}`);
  } catch (error) {
    console.error('Error loading space config:', error);
    throw error;
  }
};

export const getVotingPower = async (address: string): Promise<number> => {
  if (!spaceConfig) {
    await loadSpaceConfig();
  }

  try {
    const scoreApiPayload = {
      jsonrpc: "2.0",
      method: "get_vp",
      params: {
        address: address.toLowerCase(),
        space: config.snapshotSpace,
        strategies: spaceConfig!.strategies,
        network: spaceConfig!.network,
        snapshot: "latest"
      }
    };

    const response = await axios.post(config.snapshotScoreUrl, scoreApiPayload);
    if (response.data?.result?.vp) {
      return response.data.result.vp;
    }
    return 0;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`Error fetching voting power for ${address}: ${error.response?.status} ${error.response?.statusText}`);
    } else {
      console.error(`Error fetching voting power for ${address}: ${error}`);
    }
    throw error;
  }
};

export const updateTotalDelegatedScore = async () => {
  if (!spaceConfig) {
    await loadSpaceConfig();
  }

  try {
    const delegates = await queryAllPages(
      (lastId) => `{
        delegations(
          first: 1000,
          where: {
            space: "${config.snapshotSpace}",
            id_gt: "${lastId}"
          },
          orderBy: id,
          orderDirection: asc
        ) {
          id
          delegate
        }
      }`,
      (res) => res.data.data.delegations,
      (item) => item.delegate,
      `https://gateway.thegraph.com/api/${config.graphNetworkApiKey}/subgraphs/id/${config.delegationSubgraphId}`
    );

    const delegateAddresses = Array.from(new Set(delegates));
    console.log(`Getting voting power of ${delegateAddresses.length} unique delegates (${delegates.length} delegations)`);

    let newTotalDelegatedScore = 0;
    let newDelegationScores: AddressScore[] = [];

    for (const address of delegateAddresses) {
      const votingPower = await getVotingPower(address);
      newTotalDelegatedScore += votingPower;
      newDelegationScores.push({
        address,
        score: votingPower
      });
      process.stdout.write(".");
    }

    lastDelegatedUpdateAt = Math.floor(Date.now() / 1000);
    totalDelegatedScore = newTotalDelegatedScore;
    delegationScores = newDelegationScores;

    console.log(`Total delegated score: ${totalDelegatedScore}`);
  } catch (error) {
    console.error('Error updating delegated score:', error);
  }
};

export const getDelegateForUser = async (address: string): Promise<string | null> => {
  const query = `
    {
      delegations(first: 1, where: {
        space: "${config.snapshotSpace}",
        delegator: "${address.toLowerCase()}"
      }, orderBy: timestamp, orderDirection: desc) {
        delegate
      }
    }
    `;

  try {
    const subgraphUrl = `https://gateway.thegraph.com/api/${config.graphNetworkApiKey}/subgraphs/id/${config.delegationSubgraphId}`;
    const response = await axios.post(subgraphUrl, { query });

    const delegations = response.data.data.delegations;
    return delegations.length > 0 ? delegations[0].delegate : null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`Error fetching delegate for ${address}: ${error.response?.status} ${error.response?.statusText}`);
    } else {
      console.error(`Error fetching delegate for ${address}: ${error}`);
    }
    throw error;
  }
};