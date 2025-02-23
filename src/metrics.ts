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

export const updateDaoMembersCount = async () => {
  try {
    const pageSize = 1000;
    let skip = 0;
    let allHolders: any[] = [];
    let hasMore = true;

    while (hasMore) {
      const query = `
        {
          accountTokenSnapshots(
            first: ${pageSize}
            skip: ${skip}
            where: {
              token: "${config.tokenAddress.toLowerCase()}",
              totalConnectedMemberships_gt: 0
            }
          ) {
            id
          }
        }
      `;
      const response = await axios.post(config.sfSubgraphUrl, { query });

      const holders = response.data.data.accountTokenSnapshots;
      allHolders = allHolders.concat(holders);

      if (holders.length < pageSize) {
        hasMore = false;
      } else {
        process.stdout.write(".");
        skip += pageSize;
      }
    }

    daoMembersCount = allHolders.length;
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
    const pageSize = 1000;
    let skip = 0;
    let allDelegations: any[] = [];
    let hasMore = true;

    while (hasMore) {
      const query = `
        {
          delegations(first: ${pageSize}, skip: ${skip}, where: {
            space: "${config.snapshotSpace}"
          }) {
            delegate
          }
        }
      `;

      const subgraphUrl = `https://gateway.thegraph.com/api/${config.graphNetworkApiKey}/subgraphs/id/${config.delegationSubgraphId}`;
      const response = await axios.post(subgraphUrl, { query });

      // Log any errors in the response
      if (response.data.errors) {
        console.error(`GraphQL error at skip=${skip}:`, response.data.errors);
      }

      const delegations = response.data?.data?.delegations || [];
      allDelegations = allDelegations.concat(delegations);

      if (delegations.length < pageSize) {
        hasMore = false;
      } else {
        process.stdout.write(".");
        skip += pageSize;
      }
    }

    const delegateAddresses = Array.from(new Set(allDelegations.map((d: any) => d.delegate)));

    console.log(`Getting voting power of ${delegateAddresses.length} unique delegates (${allDelegations.length} delegations)`);

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