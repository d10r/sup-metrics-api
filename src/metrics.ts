import axios from 'axios';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';
import { createPublicClient, http, getContract, Address, Abi, parseAbi } from 'viem';
import { base } from 'viem/chains'
import {
  AddressScore,
  TotalDelegatedScoreResponse,
  DaoMembersCountResponse,
  TotalScoreResponse,
  VotingPower,
  Holder,
  DaoMember,
  DelegateInfo,
  DaoMembersResponse
} from './types'; 
import snapshot from '@snapshot-labs/snapshot.js';

// File paths for metric data
const DATA_DIR = './data';
const FILE_SCHEMA_VERSION = 2;

// Setup viem client with batching support
const viemClient = createPublicClient({
  chain: base,
  transport: http(config.rpcUrl, { 
    batch: {
      wait: 100
    }
  }),
});

// ABI for the lockerOwner method
const LOCKER_ABI = [
  {
    inputs: [],
    name: 'lockerOwner',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// ABI for ERC20 balanceOf method
const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// Generic metric data structure
interface MetricState<T> {
  data: T;
  lastUpdatedAt: number;
  filePath: string;
}

// Generic metric manager
class MetricManager<T> {
  private state: MetricState<T>;
  private updateFn: () => Promise<T>;
  private intervalSec: number;

  constructor(
    initialData: T,
    updateFn: () => Promise<T>,
    filename: string,
    intervalSec: number
  ) {
    console.log(`Initializing ${filename} with interval ${intervalSec} seconds`);
    this.updateFn = updateFn;
    this.intervalSec = intervalSec;
    this.state = {
      data: initialData,
      lastUpdatedAt: 0,
      filePath: path.join(DATA_DIR, filename)
    };
    
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      console.log(`Creating data directory ${DATA_DIR}`);
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  // Get current data
  getData(): { data: T; lastUpdatedAt: number } {
    return {
      data: this.state.data,
      lastUpdatedAt: this.state.lastUpdatedAt
    };
  }

  // Save data to file
  private saveToFile(): void {
    try {
      fs.writeFileSync(
        this.state.filePath,
        JSON.stringify({
          schemaVersion: FILE_SCHEMA_VERSION,
          ...this.getData()
        }, null, 2)
      );
    } catch (error) {
      console.error(`### Error saving to ${this.state.filePath}:`, error);
    }
  }

  // Load data from file
  private loadFromFile(): boolean {
    try {
      if (fs.existsSync(this.state.filePath)) {
        const fileData = JSON.parse(fs.readFileSync(this.state.filePath, 'utf8'));
        if (fileData.schemaVersion !== FILE_SCHEMA_VERSION) {
          console.warn(`File schema version mismatch: ${fileData.schemaVersion} (expected ${FILE_SCHEMA_VERSION})`);
          return false;
        }
        this.state.data = fileData.data;
        this.state.lastUpdatedAt = fileData.lastUpdatedAt;
        return true;
      }
    } catch (error) {
      console.error(`### Error loading from ${this.state.filePath}:`, error);
    }
    return false;
  }

  // Update data
  async update(isBootstrapping: boolean = false): Promise<void> {
    // If bootstrapping, try to load from file first
    if (isBootstrapping) {
      const loaded = this.loadFromFile();
      if (loaded) {
        const now = Math.floor(Date.now() / 1000);
        const dataAge = now - this.state.lastUpdatedAt;
        if (dataAge < this.intervalSec) {
          console.log(`Using cached data (${dataAge}s old)`);
          return; // Data is fresh enough
        }
        console.log(`Cached data is stale (${dataAge}s old), updating...`);
      }
    }

    try {
      // Update the data
      this.state.data = await this.updateFn();
      this.state.lastUpdatedAt = Math.floor(Date.now() / 1000);
      
      // Save to file
      this.saveToFile();
    } catch (error) {
      console.error('Error updating data:', error);
    }
  }

  // Setup periodic updates
  setupPeriodicUpdates(): () => void {
    // First run with bootstrapping
    if (!process.env.SKIP_INITIAL_UPDATE) {
      this.update(true);
    }

    console.log(`Setting up periodic updates for ${this.state.filePath} with interval ${this.intervalSec} seconds`);
    // Setup interval for future updates
    const intervalId = setInterval(() => {
      this.update(false);
    }, this.intervalSec * 1000);

    // Return a function to stop the updates
    return () => clearInterval(intervalId);
  }
}

// Space config state
let spaceConfig: {
  network: string;
  strategies: any[];
} | null = null;

// // Create DAO members count manager
// const daoMembersManager = new MetricManager<number>(
//   0, // Initial value
//   fetchDaoMembersCount, // Update function
//   'daoMembers.json',
//   config.daoMembersCountUpdateInterval
// );

// Create delegated score manager
const delegatedScoreManager = new MetricManager<{
  totalScore: number;
  perDelegateScore: AddressScore[];
  delegatorMap: Record<string, string>;
}>(
  { totalScore: 0, perDelegateScore: [], delegatorMap: {} }, // Initial value
  fetchTotalDelegatedScore, // Update function
  'delegatedScore.json',
  config.totalDelegatedScoreUpdateInterval
);

// Create member scores manager
const memberScoresManager = new MetricManager<Holder[]>(
  [], // Initial value
  fetchDaoMemberScores,
  'memberScores.json',
  config.memberScoresUpdateInterval
);

// Fetch DAO members count
// async function fetchDaoMembersCount(): Promise<number> {
//   console.log(`fetchDaoMembersCount()`);
//   const holders = await queryAllPages(
//     (lastId) => `{
//       accountTokenSnapshots(
//         first: 1000,
//         where: {
//           token: "${config.tokenAddress.toLowerCase()}",
//           totalConnectedMemberships_gt: 0,
//           id_gt: "${lastId}"
//         },
//         orderBy: id,
//         orderDirection: asc
//       ) {
//         id
//       }
//     }`,
//     (res) => res.data.data.accountTokenSnapshots,
//     (item) => item.id,
//     config.sfSubgraphUrl
//   );

//   const count = holders.length;
//   console.log(`Updated DAO members count: ${count}`);
//   return count;
// }

// Fetch total delegated score
async function fetchTotalDelegatedScore(): Promise<{
  totalScore: number;
  perDelegateScore: AddressScore[];
  delegatorMap: Record<string, string>;
}> {
  console.log(`fetchTotalDelegatedScore()`);
  if (!spaceConfig) {
    await loadSpaceConfig();
  }

  let delegations: any[] = [];

  try {
    const delegations = await queryAllPages(
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
          delegator
          delegate
        }
      }`,
      (res) => res.data.data.delegations,
      (item) => item,
      `https://gateway.thegraph.com/api/${config.graphNetworkApiKey}/subgraphs/id/${config.delegationSubgraphId}`
    );
  } catch (error) {
    console.error(formatAxiosError(error, 'Error fetching delegations'));
    throw new Error('Error fetching delegations from subgraph');
  }

  //console.log(`subgraph url: https://gateway.thegraph.com/api/${config.graphNetworkApiKey}/subgraphs/id/${config.delegationSubgraphId}`);

  // Store delegator->delegate mapping
  const delegatorMap: Record<string, string> = {};
  // log delegations
  //console.log(`delegations: ${JSON.stringify(delegations.slice(0, 10), null, 2)}, ...`);
  for (const delegation of delegations) {
    delegatorMap[delegation.delegator.toLowerCase()] = delegation.delegate.toLowerCase();
  }

  // Count occurrences of each delegate
  const delegateCounts = delegations.reduce((counts: Record<string, number>, delegation: any) => {
    counts[delegation.delegate.toLowerCase()] = (counts[delegation.delegate.toLowerCase()] || 0) + 1;
    return counts;
  }, {});
  //console.log(`delegate counts: ${JSON.stringify(delegateCounts, null, 2)}`);

  // Get unique delegate addresses
  const delegateAddresses = Object.keys(delegateCounts);
  console.log(`Getting voting power of ${delegateAddresses.length} unique delegates (${delegations.length} delegations)`);

  let totalScore = 0;
  const perDelegateScore: AddressScore[] = [];

  for (const address of delegateAddresses) {
    const votingPower = await getVotingPower(address);
    totalScore += votingPower.total;
    perDelegateScore.push({
      address,
      score: votingPower.total,
      delegatedScore: votingPower.delegated,
      nrDelegations: delegateCounts[address]
    });
    process.stdout.write(".");
    // throttle requests to the scores API
    await new Promise(resolve => setTimeout(resolve, 5000));
    if (process.env.STOP_EARLY) {
      break;
    }
  }

  console.log(`Total delegated score: ${totalScore}`);
  return { totalScore, perDelegateScore, delegatorMap };
}

// Public API methods
export const getDaoMembersCount = (): DaoMembersCountResponse => {
  const { data, lastUpdatedAt } = memberScoresManager.getData();
  return {
    daoMembersCount: data.length,
    lastUpdatedAt
  };
};

export const getTotalDelegatedScore = (): TotalDelegatedScoreResponse => {
  const { data, lastUpdatedAt } = delegatedScoreManager.getData();
  return {
    totalDelegatedScore: data.totalScore,
    perDelegateScore: data.perDelegateScore,
    lastUpdatedAt
  };
};

// Combine data for DAO members endpoint
export const getDaoMembers = (): DaoMember[] => {
  const { data: members } = memberScoresManager.getData();
  const { data: delegateData } = delegatedScoreManager.getData();
  
  // Create lookup map for delegates
  const delegateMap = new Map(
    delegateData.perDelegateScore.map(d => [d.address.toLowerCase(), d])
  );
  
  // Create a map of all members by address for quick lookup
  const memberMap = new Map(
    members.map(m => [m.address.toLowerCase(), m])
  );
  
  // Create a set of all addresses we need to include (members + delegates)
  const allAddresses = new Set([
    ...members.map(m => m.address.toLowerCase()),
    ...delegateData.perDelegateScore.map(d => d.address.toLowerCase())
  ]);
  
  // Convert to required format
  const daoMembers = Array.from(allAddresses).map(address => {
    const member = memberMap.get(address);
    const delegateInfo = delegateMap.get(address);
    const hasDelegate = delegateData.delegatorMap[address] || null;
    
    return {
      address,
      locker: member?.locker || null,
      votingPower: member?.amount || 0, // Use 0 if no member data
      hasDelegate,
      isDelegate: delegateInfo ? {
        delegatedVotingPower: delegateInfo.delegatedScore,
        nrDelegators: delegateInfo.nrDelegations
      } : null
    };
  });

  // now order by `votingPower + isDelegate.delegatedVotingPower` descending
  daoMembers.sort((a, b) => {
    const aTotal = a.votingPower + (a.isDelegate?.delegatedVotingPower || 0);
    const bTotal = b.votingPower + (b.isDelegate?.delegatedVotingPower || 0);
    return bTotal - aTotal;
  });

  return daoMembers;
};

export const getDaoMembersWithFilters = (
  minVotingPower: number = 0, 
  includeAllDelegates: boolean = false
): DaoMembersResponse => {
  const daoMembers = getDaoMembers();
  const { lastUpdatedAt } = memberScoresManager.getData();
  
  const filteredMembers = daoMembers.filter(member => {
    // If include_all_delegates is true AND this is a delegate, bypass min_vp check
    if (includeAllDelegates && member.isDelegate) return true;
    
    // Otherwise apply minimum voting power filter
    return member.votingPower >= minVotingPower;
  });
  
  return {
    totalMembersCount: daoMembers.length,
    daoMembers: filteredMembers,
    lastUpdatedAt
  };
};

// Setup methods for startup
export const setupMetricsUpdates = (): () => void => {
  console.log("Setting up metrics updates");
  
  // test viem client connection
  viemClient.getBlockNumber().then(blockNumber => {
    console.log(`Connected to blockchain at ${config.rpcUrl}. Current block number: ${blockNumber}`);
  }).catch(error => {
    console.error('Failed to connect to blockchain:', error);
    throw error;
  });
  
  // Remove daoMembersManager since it's now redundant
  const stopDelegatedUpdates = delegatedScoreManager.setupPeriodicUpdates();
  const stopMemberScoresUpdates = memberScoresManager.setupPeriodicUpdates();
  
  return () => {
    stopDelegatedUpdates();
    stopMemberScoresUpdates();
  };
};

// Keep existing helper functions
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
    //console.log(`querying page ${lastId}`);
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
    if (process.env.STOP_EARLY) {
      break;
    }
  }

  return items;
}

// Helper function to format axios errors
function formatAxiosError(error: unknown, context: string): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const statusText = error.response?.statusText;
    const data = error.response?.data;
    const message = error.message;
    
    let errorMsg = `${context}: `;
    if (status) {
      errorMsg += `[${status}] `;
    }
    if (statusText) {
      errorMsg += `${statusText} - `;
    }
    if (data) {
      // If data is an object, stringify it
      const dataStr = typeof data === 'object' ? JSON.stringify(data) : data;
      errorMsg += `Response: ${dataStr} `;
    }
    // Add the error message if it provides additional information
    if (message && !errorMsg.includes(message)) {
      errorMsg += `(${message})`;
    }
    return errorMsg;
  }
  // For non-axios errors, return the error as a string
  return `${context}: ${error}`;
}

export const loadSpaceConfig = async () => {
  //console.log("Loading space config");
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
    //console.log(response.data.data.space);

    const space = response.data.data.space;
    if (!space) {
      throw new Error(`Space ${config.snapshotSpace} not found`);
    }

    spaceConfig = {
      network: space.network,
      strategies: space.strategies
    };

    console.log(`** Loaded space config for ${config.snapshotSpace}: ${JSON.stringify(spaceConfig, null, 2)}`);
  } catch (error) {
    console.error(formatAxiosError(error, 'Error loading space config'));
    throw error;
  }
};

export const getVotingPower = async (address: string): Promise<VotingPower> => {
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
      const totalVp = response.data.result.vp;
      // TODO: add check that item 0 is indeed the own voting power
      const ownVp = response.data.result.vp_by_strategy[0];
      const delegatedVp = response.data.result.vp_by_strategy[1];
      console.log(`Voting power for ${address}: ${totalVp} (delegated: ${delegatedVp}, own: ${ownVp})`);
      console.log(`Voting power raw for ${address}: ${JSON.stringify(response.data.result, null, 2)}`);
      return {
        total: totalVp,
        delegated: delegatedVp
      };
    }
    return {
      total: 0,
      delegated: 0
    };
  } catch (error) {
    console.error(formatAxiosError(error, `Error fetching voting power for ${address}`));
    throw error;
  }
};

/**
 * Gets the voting power for a specific account using snapshot.js
 * @param accountAddress The address to get voting power for
 * @param useOwnStrategies If true, uses only the first strategy without delegation
 * @returns The voting power as a number
 */
export const getAccountVotingPower = async (accountAddress: string, useOwnStrategies: boolean = false): Promise<number> => {
  if (!spaceConfig) {
    await loadSpaceConfig();
  }
  
  try {
    // Set up snapshot options
    const options = {
      url: config.snapshotScoreUrl
    };
    
    // Define strategies - either use all strategies or just the first one without delegation
    const strategies = useOwnStrategies ? [spaceConfig!.strategies[0]] : spaceConfig!.strategies;
    
    // Get voting power for the account address
    const vp = await snapshot.utils.getVp(
      accountAddress,
      spaceConfig!.network,
      strategies,
      'latest', // Use latest snapshot
      config.snapshotSpace,
      false, // No delegation
      options
    );
    
    return vp.vp || 0; // Return voting power or 0 if undefined
  } catch (error) {
    console.error(`### Error fetching voting power for ${accountAddress}:`, error);
    return 0; // Return 0 on error
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
    console.error(formatAxiosError(error, `Error fetching delegate for ${address}`));
    throw error;
  }
};

/**
 * Gets the total score calculated from flow distributions for pools managed by EP Program Manager
 */
export const getTotalScore = async (): Promise<TotalScoreResponse> => {
  try {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    console.log(`Current timestamp: ${currentTimestamp}`);
    
    const query = `
      query {
        flowDistributionUpdatedEvents(
          where: {poolDistributor_: {account: "${config.epProgramManager.toLowerCase()}"}}
        ) {
          pool {
            id
            flowRate
            totalAmountDistributedUntilUpdatedAt
            updatedAtTimestamp
          }
        }
      }
    `;

    const response = await axios.post(config.sfSubgraphUrl, { query });
    const events = response.data.data.flowDistributionUpdatedEvents;
    
    console.log(`Found ${events.length} flow distribution events`);
    // log full detail
//    console.log(JSON.stringify(response.data.data, null, 2));
    
    // Create a Map to store unique pools by ID
    const uniquePools = new Map();
    
    // Process events and keep only the most recent event for each pool
    for (const event of events) {
      const pool = event.pool;
      const poolId = pool.id;
      
      // If we haven't seen this pool before, or if this event is more recent than what we have, keep it
      // (it shouldn't matter which one we pick, semantics should be that of a pointer)
      if (!uniquePools.has(poolId) || parseInt(pool.updatedAtTimestamp) > parseInt(uniquePools.get(poolId).updatedAtTimestamp)) {
        uniquePools.set(poolId, pool);
      }
    }
    
    let totalScore = BigInt(0);
    
    // Process only unique pools
    for (const pool of uniquePools.values()) {
      const poolId = pool.id;
      const flowRate = BigInt(pool.flowRate);
      const totalAmountDistributedUntilUpdatedAt = BigInt(pool.totalAmountDistributedUntilUpdatedAt);
      const updatedAtTimestamp = parseInt(pool.updatedAtTimestamp);
      
      const timeElapsed = currentTimestamp - updatedAtTimestamp;
      const additionalAmount = flowRate * BigInt(timeElapsed);
      const totalAmountDistributed = totalAmountDistributedUntilUpdatedAt + additionalAmount;
      
      totalScore += totalAmountDistributed;
    }
    
    console.log(`Total Score: ${totalScore.toString()}`);
    
    // Convert BigInt to Number for JSON serialization
    // Dividing by 10^18 to get a more manageable number (assuming 18 decimals)
    const totalScoreNormalized = Number(totalScore / BigInt(10 ** 18));
    
    return {
      totalScore: totalScoreNormalized,
      lastUpdatedAt: currentTimestamp
    };
  } catch (error) {
    console.error(formatAxiosError(error, 'Error fetching total score'));
    throw error;
  }
};

async function fetchDaoMemberScores(): Promise<Holder[]> {
  if (!spaceConfig) {
    await loadSpaceConfig();
  }

  try {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    console.log(`Current timestamp: ${currentTimestamp}`);
    
    const query = `
      query {
        flowDistributionUpdatedEvents(
          where: {poolDistributor_: {account: "${config.epProgramManager.toLowerCase()}"}}
        ) {
          pool {
            id
          }
        }
      }
    `;

    const response = await axios.post(config.sfSubgraphUrl, { query });
    const events = response.data.data.flowDistributionUpdatedEvents;
    
    console.log(`Found ${events.length} flow distribution events`);
    //console.log(JSON.stringify(response.data.data, null, 2));
    
    // Create a Map to store unique pools by ID
    const uniquePools = new Set();
    
    // Process events and store unique pool IDs
    for (const event of events) {
      uniquePools.add(event.pool.id);
    }
    
    console.log(`Found ${uniquePools.size} unique pools: ${JSON.stringify(Array.from(uniquePools), null, 2)}`);
    
    // Create a Set to store unique account addresses
    const uniquePoolMembers = new Set<string>();
    
    let poolMemberCnt = 0;
    // Query members for each unique pool with pagination
    console.log("Fetching pool members for each unique pool...");
    for (const poolId of uniquePools) {
      if (process.env.STOP_EARLY && poolMemberCnt > 500) {
        break;
      }
      try {
        console.log(`Fetching members for pool ${poolId}`);
        
        // Now use queryAllPages with the correct return value handling
        const poolMembers = await queryAllPages(
          (lastId) => `{
            poolMembers(
              first: 1000,
              where: {
                pool: "${poolId}",
                id_gt: "${lastId}"
              },
              orderBy: id,
              orderDirection: asc
            ) {
              id
              account {
                id
              }
            }
          }`,
          (res) => res.data.data.poolMembers,
          (item) => {
            // Return account ID directly instead of the item ID
            return item.account.id;
          },
          config.sfSubgraphUrl
        );
        
        console.log(`Found ${poolMembers.length} members in pool ${poolId}`);
        poolMemberCnt += poolMembers.length;
        
        // Add each account ID directly to the set since poolMembers is now an array of account IDs
        for (const accountId of poolMembers) {
          if (accountId) {
            uniquePoolMembers.add(accountId);
          } else {
            console.warn('Invalid account ID:', accountId);
          }
        }
      } catch (error) {
        console.error(formatAxiosError(error, `Error fetching members for pool ${poolId}`));
        // Continue with the next pool even if there's an error
      }
    }

    console.log(`Found ${poolMemberCnt} pool memberships in all pools`);
    console.log(`Found ${uniquePoolMembers.size} unique accounts across all pools`);
  
    // Convert Set to array for logging
    const uniqueAccountsArray = Array.from(uniquePoolMembers);
    console.log(JSON.stringify(uniqueAccountsArray.slice(0, 5), null, 2) + 
                (uniqueAccountsArray.length > 5 ? "... (truncated)" : ""));

    // Now we get the lockerOwner for each unique account
    console.log('Fetching locker owners for each unique account...');
    
    const uniqueLockerOwners = new Set<string>();
    let successCount = 0;
    let failedCount = 0;

    const accountToLockerMap: Map<string, string> = new Map();
    
    try {
      // Create an array of promises for each account's lockerOwner call
      const ownerPromises = uniqueAccountsArray.map(accountAddress => 
        viemClient.readContract({
          address: accountAddress as Address,
          abi: LOCKER_ABI,
          functionName: 'lockerOwner',
          args: []
        }).catch(error => {
          // Return null for individual failed calls instead of rejecting the whole batch
          console.debug(`### Error fetching lockerOwner for ${accountAddress}: ${error.message}`);
          return null;
        })
      );
      
      console.log(`Making ${ownerPromises.length} contract calls...`);
      
      // Use Promise.allSettled instead of Promise.all to handle individual failures
      const results = await Promise.allSettled(ownerPromises);
      
      // Process the results
      for (let i = 0; i < results.length; i++) {
        if ((i + 1) % 1000 === 0) {
          process.stdout.write('.');
        }
        
        const result = results[i];
        if (result.status === 'fulfilled' && result.value !== null) {
          const owner = result.value as Address;
          if (owner && owner !== '0x0000000000000000000000000000000000000000') {
            uniqueLockerOwners.add(owner.toLowerCase());
            
            // Store the mapping from account (owner) to locker
            const lockerAddress = uniqueAccountsArray[i];
            accountToLockerMap.set(owner.toLowerCase(), lockerAddress);
            
            successCount++;
          }
        } else {
          failedCount++;
        }
      }
      
    } catch (error) {
      console.error(`### Error fetching locker owners:`, error);
      failedCount = uniqueAccountsArray.length - successCount;
    }
    
    console.log(`\nProcessed ${uniqueAccountsArray.length} accounts: ${successCount} successful, ${failedCount} failed`);
    console.log(`Found ${uniqueLockerOwners.size} unique locker owners`);
    
    // Convert uniqueLockerOwners to array for logging
    const uniqueLockerOwnersArray = Array.from(uniqueLockerOwners);
    console.log(JSON.stringify(uniqueLockerOwnersArray.slice(0, 5), null, 2) + 
                (uniqueLockerOwnersArray.length > 5 ? "... (truncated)" : ""));
    
    // Now get voting power for each unique locker owner
    console.log('\nFetching voting power for each unique locker owner...');
    
    // Create arrays to hold account addresses and their corresponding requests
    const ownerAddresses: string[] = [];
    const balancePromises: Promise<bigint>[] = [];
    
    // Prepare promises for all owner-locker pairs
    for (const [ownerAddress, lockerAddress] of accountToLockerMap.entries()) {
      ownerAddresses.push(ownerAddress);
      balancePromises.push(getVotingPowerPromiseViaRpc(ownerAddress, lockerAddress));
    }
    
    console.log(`Preparing ${balancePromises.length} balance requests in a single batch...`);
    
    // Execute all promises in a single batch
    let balances: bigint[];
    try {
      balances = await Promise.all(balancePromises);
      console.log('Successfully retrieved all balances in batch');
    } catch (error) {
      console.error('Error fetching balances in batch:', error);
      balances = new Array(ownerAddresses.length).fill(BigInt(0)); // Fill with zeros on error
    }
    
    // Create holders array with the results
    const holdersWithVP: Holder[] = [];
    
    for (let i = 0; i < ownerAddresses.length; i++) {
      const ownerAddress = ownerAddresses[i];
      const balance = balances[i];
      
      // Convert the bigint balance to a number with 18 decimals
      const balanceNumber = Number(balance) / 10**18;
      
      // Add to holders array
      holdersWithVP.push({
        address: ownerAddress,
        amount: balanceNumber,
        locker: accountToLockerMap.get(ownerAddress) // Just use the result from Map.get() which will be string or undefined
      });
      
      // Log every 50th balance for monitoring
      if (i % 50 === 0 || i === ownerAddresses.length - 1) {
        console.log(`Balance for ${ownerAddress}: ${balanceNumber}`);
      }
    }
    
    console.log(`\nProcessed ${ownerAddresses.length} owners with balances`);
    
    // Sort holders by amount (voting power) in descending order
    holdersWithVP.sort((a, b) => b.amount - a.amount);

    console.log(`Found ${holdersWithVP.length} DAO members (${holdersWithVP.filter(holder => holder.amount > 10000).length} with more than 10k voting power)`);
    
    return holdersWithVP;

  } catch (error) {
    console.error(formatAxiosError(error, 'Error fetching member scores'));
    throw error;
  }
}

/**
 * Gets the voting power for an account by querying the token contract's balanceOf function
 * for the account's corresponding locker address
 * 
 * @param accountAddress The account address to get voting power for
 * @returns The voting power as a number (normalized to decimals)
 */
export const getVotingPowerViaRpc = async (accountAddress: string, lockerAddress: string): Promise<number> => {
  try {
    // Query the token contract's balanceOf function for the locker address
    const balance = await viemClient.readContract({
      address: config.tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [lockerAddress as Address]
    });
    
    // Convert the bigint balance to a number with 18 decimals
    const balanceNumber = Number(balance) / 10**18;
    
    return balanceNumber;
  } catch (error) {
    console.error(`### Error getting voting power via RPC for ${accountAddress}:`, error);
    return 0;
  }
};


export const getVotingPowerPromiseViaRpc = (accountAddress: string, lockerAddress: string): Promise<bigint> => {
  // Query the token contract's balanceOf function for the locker address
  const balancePromise = viemClient.readContract({
    address: config.tokenAddress as Address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [lockerAddress as Address]
  });
  
  return balancePromise;
};
