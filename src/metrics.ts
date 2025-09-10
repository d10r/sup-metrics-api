import axios from 'axios';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';
import {
  TotalDelegatedScoreResponse,
  DaoMembersCountResponse,
  TotalScoreResponse,
  VotingPower,
  DaoMember,
  DaoMembersResponse
} from './types'; 
import snapshot from '@snapshot-labs/snapshot.js';
import snapshotStrategies from '@d10r/snapshot-strategies';
import { createPublicClient, http, Client, Chain, Transport, Address } from 'viem';
import { base } from 'viem/chains'
import * as ethersProviders from '@ethersproject/providers';

// File paths for metric data
const DATA_DIR = './data';
const FILE_SCHEMA_VERSION = 4;

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

interface MemberData {
  ownVp: number;
  delegatedVp?: number;
  nrDelegators?: number;
  delegate?: string;
  locker?: string;
}

interface TotalScoreData {
  totalScore: number;
  poolCount: number;
  additionalTotalScore: number;
}

interface UnifiedScores {
  schemaVersion: number;
  lastUpdatedAt: number;
  data: {
    members: Record<string, MemberData>;
    totalScore: TotalScoreData;
  };
}

interface VotingPower2 {
  address: string;
  own: number;
  delegated: number;  
}

interface SpaceConfig {
  network: string;
  strategies: {
    name: string;
    params: any;
  }[];
  lastUpdatedAt: number;
}

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
  private isUpdating: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

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

    // Start periodic updates if interval is positive
    if (this.intervalSec > 0) {
      this.startPeriodicUpdates();
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
        JSON.stringify(this.state.data, null, 2)
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
        this.state.data = fileData;
        this.state.lastUpdatedAt = fileData.lastUpdatedAt;
        return true;
      }
    } catch (error) {
      console.error(`### Error loading from ${this.state.filePath}:`, error);
    }
    return false;
  }

  // Update data
  async update(): Promise<void> {
    // Check if an update is already running
    if (this.isUpdating) {
      console.log(`Update already in progress for ${this.state.filePath}, skipping this update`);
      return;
    }

    try {
      this.isUpdating = true;
      console.log(`Starting update for ${this.state.filePath}`);
      
      this.state.data = await this.updateFn();
      this.state.lastUpdatedAt = Math.floor(Date.now() / 1000);
      
      this.saveToFile();
      console.log(`Completed update for ${this.state.filePath}`);
    } catch (error) {
      console.error(`Error updating data for ${this.state.filePath}:`, error);
    } finally {
      this.isUpdating = false;
    }
  }

  // Check if data needs updating based on age and interval
  private needsUpdate(): boolean {
    if (this.intervalSec <= 0) return false;
    if (this.state.lastUpdatedAt === 0) return true; // No data loaded
    
    const now = Math.floor(Date.now() / 1000);
    const dataAge = now - this.state.lastUpdatedAt;
    return dataAge >= this.intervalSec;
  }

  // Start periodic updates
  private startPeriodicUpdates(): void {
    // Always load data on start
    console.log(`Loading data for ${this.state.filePath}`);
    const loaded = this.loadFromFile();
    
    // Determine if we need to update
    if (this.needsUpdate()) {
      const reason = !loaded ? "No cached data found" : `Cached data is stale (${Math.floor(Date.now() / 1000) - this.state.lastUpdatedAt}s old)`;
      console.log(`${reason}, will update`);
      
      // Perform initial update if needed
      if (!process.env.SKIP_INITIAL_UPDATE) {
        this.update();
      }
    } else {
      const dataAge = Math.floor(Date.now() / 1000) - this.state.lastUpdatedAt;
      console.log(`Using cached data (${dataAge}s old)`);
    }
    
    // Setup interval for future updates
    console.log(`Setting up periodic updates for ${this.state.filePath} with interval ${this.intervalSec} seconds`);
    this.intervalId = setInterval(() => {
      this.update();
    }, this.intervalSec * 1000);
  }

  // Stop periodic updates
  stopPeriodicUpdates(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// Create unified score manager instance
const unifiedScoresManager = new MetricManager<UnifiedScores>(
  { schemaVersion: FILE_SCHEMA_VERSION, lastUpdatedAt: 0, data: { members: {}, totalScore: {} as TotalScoreData } },
  fetchUnifiedScores,
  'unifiedScores.json',
  config.scoresUpdateInterval
);

// Cache for space config with 24h expiration
let cachedSpaceConfig: SpaceConfig | undefined;
const spaceConfigExpiration = 24 * 60 * 60;

const getSpaceConfig = async (): Promise<SpaceConfig> => {
  const now = Math.floor(Date.now() / 1000);

  // Return cached config if it exists and is less than 24h old
  if (cachedSpaceConfig && (now - cachedSpaceConfig.lastUpdatedAt) < spaceConfigExpiration) {
    return cachedSpaceConfig;
  }

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

    cachedSpaceConfig = {
      network: space.network,
      strategies: space.strategies,
      lastUpdatedAt: now
    };

    console.log(`** Loaded space config for ${config.snapshotSpace}: ${JSON.stringify(cachedSpaceConfig, null, 2)}`);
    return cachedSpaceConfig;
  } catch (error) {
    console.error(formatAxiosError(error, 'Error loading space config'));
    
    // If we have a cached config, use it as fallback
    if (cachedSpaceConfig) {
      console.log('Using cached space config as fallback');
      return cachedSpaceConfig;
    }
    
    throw error;
  }
};

// Public API methods

export const getDaoMembersCount = (): DaoMembersCountResponse => {
  const { data: unifiedData, lastUpdatedAt } = unifiedScoresManager.getData();
  return {
    daoMembersCount: Object.keys(unifiedData.data.members).length,
    lastUpdatedAt
  };
};

export const getTotalDelegatedScore = (): TotalDelegatedScoreResponse => {
  const { data: unifiedData, lastUpdatedAt } = unifiedScoresManager.getData();
  
  // Calculate total delegated score by summing all delegatedVp
  const totalDelegatedScore = Object.values(unifiedData.data.members).reduce(
    (sum, member) => sum + (member.delegatedVp || 0),
    0
  );

  // Convert to per-delegate format
  const perDelegateScore = Object.entries(unifiedData.data.members)
    .filter(([_, member]) => member.delegatedVp && member.delegatedVp > 0)
    .map(([address, member]) => ({
      address,
      score: member.ownVp + (member.delegatedVp || 0),
      delegatedScore: member.delegatedVp!,
      nrDelegations: member.nrDelegators || 0
    }));

  return {
    totalDelegatedScore,
    perDelegateScore,
    lastUpdatedAt
  };
};

// Combine data for DAO members endpoint
export const getDaoMembers = (): DaoMember[] => {
  console.log('getDaoMembers called');
  const { data: unifiedData, lastUpdatedAt } = unifiedScoresManager.getData();
  
  // Convert to required format
  const daoMembers = Object.entries(unifiedData.data.members).map(([address, data]) => {
    const member = {
      address,
      locker: data.locker || null,
      votingPower: data.ownVp,
      hasDelegate: data.delegate || null,
      isDelegate: data.delegatedVp ? {
        delegatedVotingPower: data.delegatedVp,
        nrDelegators: data.nrDelegators || 0
      } : null
    };
    return member;
  });

  console.log('Created', daoMembers.length, 'members');
  return daoMembers;
};

export const getDaoMembersWithFilters = (
  minVotingPower: number = 0, 
  includeAllDelegates: boolean = false
): DaoMembersResponse => {
  console.log('getDaoMembersWithFilters called with:', { minVotingPower, includeAllDelegates });
  const daoMembers = getDaoMembers();
  const { lastUpdatedAt } = unifiedScoresManager.getData();
  
  
  const filteredMembers = daoMembers.filter(member => {
    // If include_all_delegates is true AND this is a delegate, bypass min_vp check
    if (includeAllDelegates && member.isDelegate) {
      return true;
    }
    
    // Otherwise apply minimum voting power filter
    const passes = member.votingPower >= minVotingPower;
    return passes;
  });
  
  return {
    totalMembersCount: daoMembers.length,
    daoMembers: filteredMembers,
    lastUpdatedAt
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

export const getVotingPowerBatch = async (addresses: string[], includeDelegations: boolean): Promise<VotingPower2[]> => {
  const spaceConfig = await getSpaceConfig();

  const strategies = includeDelegations ? 
    spaceConfig.strategies : 
    spaceConfig.strategies.filter(strategy => strategy.name !== "delegation");
  
  try {
    const chunks = [];
    for (let i = 0; i < addresses.length; i += config.vpCalcChunkSize) {
      chunks.push(addresses.slice(i, i + config.vpCalcChunkSize));
    }
    
    console.log(`Processing ${addresses.length} addresses in ${chunks.length} chunks of max ${config.vpCalcChunkSize}`);
    
    // Process each chunk and combine results
    const allScores: any[] = [{}, {}, {}]; // 0: fountainhead, 1: delegate, 2: asup
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      process.stdout.write(`Processing chunk ${i+1}/${chunks.length} (${chunk.length} addresses)...`);
      const startTime = Date.now();

      const provider = _viemClientToEthersV5Provider(viemClient);
      
      const chunkScores = await snapshotStrategies.utils.getScoresDirect(
        config.snapshotSpace, // space
        strategies, // strategies
        spaceConfig.network, // network
        provider, // provider
        chunk, // addresses (just this chunk)
        'latest' // snapshot?
      );
      
      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      console.log(` completed in ${duration.toFixed(2)}s`);
      
      // Merge scores from this chunk into the corresponding strategy arrays
      chunkScores.forEach((strategyScores, strategyIndex) => {
        Object.assign(allScores[strategyIndex], strategyScores);
      });
      
      // persist to a file with the chunk number as filename
      fs.writeFileSync(`scores_chunk_${i}.json`, JSON.stringify(chunkScores, null, 2));
    }

    // persist the final merged scores to a file
    //fs.writeFileSync('scores.json', JSON.stringify(allScores, null, 2));
    const scoresFountainhead = allScores[0];
    const scoresDelegation = includeDelegations ? allScores[1] : {};
    const scoresAsup = includeDelegations ? allScores[2] : allScores[1];

    // Process the scores according to the required format
    const result: VotingPower2[] = addresses.map(address => {
      const addressLower = address.toLowerCase();

      return {
        address: addressLower,
        own: (scoresFountainhead[addressLower] || 0) + (scoresAsup[addressLower] || 0),
        delegated: scoresDelegation[addressLower]
      };
    });

    return result;
  } catch (error) {
    console.error(formatAxiosError(error, 'Error fetching voting power for batch'));
    throw error;
  }
}

export const getVotingPower = async (address: string): Promise<VotingPower> => {
  const spaceConfig = await getSpaceConfig();

  try {
    const scoreApiPayload = {
      jsonrpc: "2.0",
      method: "get_vp",
      params: {
        address: address.toLowerCase(),
        space: config.snapshotSpace,
        strategies: spaceConfig.strategies,
        network: spaceConfig.network,
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
      //console.log(`Voting power raw for ${address}: ${JSON.stringify(response.data.result, null, 2)}`);
      console.log(`  get_vp ${address} returned: ${JSON.stringify(response.data.result, null, 2)}`);
      return {
        address: address.toLowerCase(),
        total: totalVp,
        delegated: delegatedVp
      };
    }

    return {
      address: address.toLowerCase(),
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
 * @param locker The address to get voting power for
 * @param useOwnStrategies If true, uses only the first strategy without delegation
 * @returns The voting power as a number
 */
export const getAccountVotingPower = async (locker: string, useOwnStrategies: boolean = false): Promise<number> => {
  const spaceConfig = await getSpaceConfig();
  
  try {
    // Set up snapshot options
    const options = {
      url: config.snapshotScoreUrl
    };
    
    // Define strategies - either use all strategies or just the first one without delegation
    const strategies = useOwnStrategies ? [spaceConfig.strategies[0]] : spaceConfig.strategies;
    
    // Get voting power for the account address
    const vp = await snapshot.utils.getVp(
      locker,
      spaceConfig.network,
      strategies,
      'latest', // Use latest snapshot
      config.snapshotSpace,
      false, // No delegation
      options
    );
    
    return vp.vp || 0; // Return voting power or 0 if undefined
  } catch (error) {
    console.error(`### Error fetching voting power for ${locker}:`, error);
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
 * Now uses cached data from the unified scores manager
 */
export const getTotalScore = (): TotalScoreResponse => {
  const { data: unifiedData, lastUpdatedAt } = unifiedScoresManager.getData();
  
  return {
    totalScore: unifiedData.data.totalScore.totalScore,
    lastUpdatedAt
  };
};


function _viemClientToEthersV5Provider(client: Client<Transport, Chain>): ethersProviders.Provider {
  return new ethersProviders.StaticJsonRpcProvider(
    {
      url: client.transport.url,
      timeout: 25000,
      allowGzip: true
    },
    client.chain.id
  );
}

/**
 * Calculates the total score from flow distributions for pools managed by EP Program Manager
 */
async function calculateTotalScore(): Promise<TotalScoreData> {
  try {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    console.log(`Calculating total score at timestamp: ${currentTimestamp}`);
    
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
    
    // Create a Map to store unique pools by ID
    const uniquePools = new Map();
    
    // Process events and keep only the most recent event for each pool
    for (const event of events) {
      const pool = event.pool;
      const poolId = pool.id;
      
      // If we haven't seen this pool before, or if this event is more recent than what we have, keep it
      if (!uniquePools.has(poolId) || parseInt(pool.updatedAtTimestamp) > parseInt(uniquePools.get(poolId).updatedAtTimestamp)) {
        uniquePools.set(poolId, pool);
      }
    }
    
    let totalScore = BigInt(config.additionalTotalScore) * BigInt(10 ** 18);
    
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
      poolCount: uniquePools.size,
      additionalTotalScore: Number(config.additionalTotalScore)
    };
  } catch (error) {
    console.error(formatAxiosError(error, 'Error calculating total score'));
    throw error;
  }
}

async function fetchUnifiedScores(): Promise<UnifiedScores> {
  try {
    console.log('Starting unified scores fetch...');
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // 0. Calculate total score
    console.log('Calculating total score...');
    const totalScoreData = await calculateTotalScore();
    
    // 1. Get pool members
    const query = `
      query {
        flowDistributionUpdatedEvents(
          first: 1000,
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
    
    // Create a Set to store unique pool IDs
    const uniquePools = new Set();
    for (const event of events) {
      uniquePools.add(event.pool.id);
    }
    
    console.log(`Found ${uniquePools.size} unique pools`);
    
    // Set to store unique accounts
    const uniqueAccounts = new Set<string>();

    // Add aSUP holders (these are accounts, not lockers)
    const asupHolders = (JSON.parse(fs.readFileSync('./asupHolders.json', 'utf8')) as string[])
      .map(holder => holder.toLowerCase());

    console.log(`Adding ${asupHolders.length} aSUP holders to unique accounts`);
    asupHolders.forEach(holder => uniqueAccounts.add(holder));

    // Map to store locker -> owner mapping
    const lockerToOwnerMap = new Map<string, string>();
    
    // Get all pool members (which are lockers)
    for (const poolId of uniquePools) {
      console.log(`Getting members for pool ${poolId} ...`);
      try {
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
          (item) => item.account.id,
          config.sfSubgraphUrl
        );
        console.log(`Found ${poolMembers.length} pool members for pool ${poolId}, now getting owners...`);
        
        // Get owners for each locker
        const ownerPromises = poolMembers.map(locker => 
          viemClient.readContract({
            address: locker as Address,
            abi: LOCKER_ABI,
            functionName: 'lockerOwner',
            args: []
          }).catch(error => {
            console.debug(`Error fetching lockerOwner for ${locker}: ${error.message}`);
            return null;
          })
        );
        
        const results = await Promise.allSettled(ownerPromises);
        console.log(`Found ${results.length} owners for pool ${poolId}`);
        
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          if (result.status === 'fulfilled' && result.value !== null) {
            const owner = result.value as Address;
            const lockerAddress = poolMembers[i];
            lockerToOwnerMap.set(lockerAddress.toLowerCase(), owner.toLowerCase());
            uniqueAccounts.add(owner.toLowerCase());
          }
        }
      } catch (error) {
        console.error(formatAxiosError(error, `Error fetching members for pool ${poolId}`));
      }
    }

    // 2. Get delegations
    console.log(`Fetching delegations...`);
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

    // Add delegators and delegates to unique accounts
    for (const delegation of delegations) {
      uniqueAccounts.add(delegation.delegator.toLowerCase());
      uniqueAccounts.add(delegation.delegate.toLowerCase());
    }

    // 3. Get own voting power for all accounts (without delegations)
    const uniqueAccountsArray = Array.from(uniqueAccounts);
    console.log(`Fetching own voting power for ${uniqueAccountsArray.length} accounts...`);
    const ownVotingPowers = await getVotingPowerBatch(uniqueAccountsArray, false);

    // 4. Calculate delegated voting power
    const delegatedVotingPower = new Map<string, number>();
    const delegatorCount = new Map<string, number>();

    for (const delegation of delegations) {
      const delegator = delegation.delegator.toLowerCase();
      const delegate = delegation.delegate.toLowerCase();
      
      // Find delegator's own voting power
      const delegatorVp = ownVotingPowers.find(vp => vp.address === delegator);
      if (delegatorVp) {
        // Add delegator's voting power to delegate's total
        const currentDelegatedVp = delegatedVotingPower.get(delegate) || 0;
        delegatedVotingPower.set(delegate, currentDelegatedVp + delegatorVp.own);
        
        // Increment delegator count
        const currentCount = delegatorCount.get(delegate) || 0;
        delegatorCount.set(delegate, currentCount + 1);
      }
    }

    // 5. Compile final data structure
    const data: Record<string, MemberData> = {};
    
    // Process voting powers
    for (const vp of ownVotingPowers) {
      // Find the locker for this account by searching the lockerToOwnerMap
      let locker: string | undefined;
      for (const [lockerAddress, owner] of lockerToOwnerMap.entries()) {
        if (owner === vp.address) {
          locker = lockerAddress;
          break;
        }
      }
      
      const memberData: MemberData = {
        ownVp: vp.own,
        locker
      };

      // Add delegated voting power if this account is a delegate
      const delegatedVp = delegatedVotingPower.get(vp.address);
      if (delegatedVp && delegatedVp > 0) {
        memberData.delegatedVp = delegatedVp;
        memberData.nrDelegators = delegatorCount.get(vp.address) || 0;
      }
      
      data[vp.address] = memberData;
    }

    // Process delegations to add delegate info
    for (const delegation of delegations) {
      const delegator = delegation.delegator.toLowerCase();
      const delegate = delegation.delegate.toLowerCase();
      
      // Add delegate info to delegator
      if (data[delegator]) {
        data[delegator].delegate = delegate;
      }
    }

    // Sort data by total VP (ownVp + delegatedVp) descending
    const sortedEntries = Object.entries(data).sort(([, a], [, b]) => {
      const aTotal = a.ownVp + (a.delegatedVp || 0);
      const bTotal = b.ownVp + (b.delegatedVp || 0);
      return bTotal - aTotal;
    });

    // Create new sorted object
    const sortedData: Record<string, MemberData> = {};
    for (const [address, memberData] of sortedEntries) {
      sortedData[address] = memberData;
    }

    return {
      schemaVersion: FILE_SCHEMA_VERSION,
      lastUpdatedAt: currentTimestamp,
      data: {
        members: sortedData,
        totalScore: totalScoreData
      }
    };

  } catch (error) {
    console.error(formatAxiosError(error, 'Error fetching unified scores'));
    throw error;
  }
}
