import axios from 'axios';
import { config, stringToBytes32 } from './config';
import { createPublicClient, http } from 'viem';
import delegationAbi from './abis/DelegationContract.json';
import { parseEther } from 'viem';

let holderCount: number = 0;
let delegatedAmount: number = 0;
let spaceConfig: {
  network: string;
  strategies: any[];
} | null = null;

let lastHolderUpdateAt: number = 0;
let lastDelegatedUpdateAt: number = 0;

export const getHolderCount = (): { holderCount: number; lastUpdatedAt: number } => ({
  holderCount,
  lastUpdatedAt: lastHolderUpdateAt
});

export const updateHolderCount = async () => {
  try {
    const pageSize = 1000;
    let skip = 0;
    let allTransfers: any[] = [];
    let hasMore = true;

    while (hasMore) {
      const query = `
        {
          transferEvents(first: ${pageSize}, skip: ${skip}, where: {
            token: "${config.tokenAddress}",
            value_gt: 0
          }) {
            from {
              id
            }
            to {
              id
            }
            value
          }
        }
      `;
      const response = await axios.post(config.sfSubgraphUrl, { query });

      const transfers = response.data.data.transferEvents;
      allTransfers = allTransfers.concat(transfers);

      if (transfers.length < pageSize) {
        hasMore = false;
      } else {
        process.stdout.write(".");
        skip += pageSize;
      }
    }

    const balances: { [address: string]: number } = {};

    allTransfers.forEach((transfer: any) => {
      const { from, to, value } = transfer;
      // Assuming transfer value is a decimal string
      balances[from.id] = (balances[from.id] || 0) - parseFloat(value);
      balances[to.id] = (balances[to.id] || 0) + parseFloat(value);
    });

    holderCount = Object.values(balances).filter((balance) => balance > 0).length;
    lastHolderUpdateAt = Math.floor(Date.now() / 1000);

    console.log(`Updated holder count: ${holderCount}`);
  } catch (error) {
    console.error('Error updating holder count:', error);
  }
}; 

export const getDelegatedAmount = (): { delegatedAmount: number; lastUpdatedAt: number } => ({
  delegatedAmount,
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

    const space = response.data.data.space;
    if (!space) {
      throw new Error(`Space ${config.snapshotSpace} not found`);
    }

    spaceConfig = {
      network: space.network,
      strategies: space.strategies
    };

    console.log(`Loaded space config for ${config.snapshotSpace}: ${JSON.stringify(spaceConfig, null, 2)}`);
  } catch (error) {
    console.error('Error loading space config:', error);
    throw error;
  }
};

export const updateDelegatedAmount = async () => {
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

      const delegations = response.data.data.delegations;
      allDelegations = allDelegations.concat(delegations);

      if (delegations.length < pageSize) {
        hasMore = false;
      } else {
        process.stdout.write(".");
        skip += pageSize;
      }
    }

    // Extract unique delegate addresses
    const delegateAddresses = Array.from(new Set(allDelegations.map((d: any) => d.delegate)));

    console.log(`Getting voting power of ${delegateAddresses.length} unique delegates (${allDelegations.length} delegations)`);

    // Get voting power for each delegate
    let totalDelegatedAmount = 0;
    for (const address of delegateAddresses) {
      const scoreApiPayload = {
        jsonrpc: "2.0",
        method: "get_vp",
        params: {
          address: address,
          space: config.snapshotSpace,
          strategies: spaceConfig!.strategies,
          network: spaceConfig!.network,
          snapshot: "latest"
        }
      };

      try {
        const response = await axios.post(config.snapshotScoreUrl, scoreApiPayload);
        if (response.data?.result?.vp) {
          totalDelegatedAmount += response.data.result.vp;
        }
      } catch (error) {
        console.error(`Error fetching voting power for ${address}:`, error);
      }
      process.stdout.write(".");
    }

    delegatedAmount = totalDelegatedAmount;
    lastDelegatedUpdateAt = Math.floor(Date.now() / 1000);

    console.log(`Total delegated amount: ${delegatedAmount}`);
  } catch (error) {
    console.error('Error updating delegated amount:', error);
  }
};