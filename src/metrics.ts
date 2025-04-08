import axios from 'axios';
import { config } from './config';
import * as fs from 'fs';
import * as path from 'path';
import {
  AddressScore,
  TotalDelegatedScoreResponse,
  DaoMembersCountResponse
} from './types';

// File paths for metric data
const DATA_DIR = './data';

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
        JSON.stringify(this.getData(), null, 2)
      );
    } catch (error) {
      console.error(`Error saving to ${this.state.filePath}:`, error);
    }
  }

  // Load data from file
  private loadFromFile(): boolean {
    try {
      if (fs.existsSync(this.state.filePath)) {
        const fileData = JSON.parse(fs.readFileSync(this.state.filePath, 'utf8'));
        this.state.data = fileData.data;
        this.state.lastUpdatedAt = fileData.lastUpdatedAt;
        return true;
      }
    } catch (error) {
      console.error(`Error loading from ${this.state.filePath}:`, error);
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
    this.update(true);

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

// Create DAO members count manager
const daoMembersManager = new MetricManager<number>(
  0, // Initial value
  fetchDaoMembersCount, // Update function
  'daoMembers.json',
  config.daoMembersCountUpdateInterval
);

// Create delegated score manager
const delegatedScoreManager = new MetricManager<{
  totalScore: number;
  perDelegateScore: AddressScore[];
}>(
  { totalScore: 0, perDelegateScore: [] }, // Initial value
  fetchTotalDelegatedScore, // Update function
  'delegatedScore.json',
  config.totalDelegatedScoreUpdateInterval
);

// Fetch DAO members count
async function fetchDaoMembersCount(): Promise<number> {
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

  const count = holders.length;
  console.log(`Updated DAO members count: ${count}`);
  return count;
}

// Fetch total delegated score
async function fetchTotalDelegatedScore(): Promise<{
  totalScore: number;
  perDelegateScore: AddressScore[];
}> {
  if (!spaceConfig) {
    await loadSpaceConfig();
  }

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

  let totalScore = 0;
  const perDelegateScore: AddressScore[] = [];

  for (const address of delegateAddresses) {
    const votingPower = await getVotingPower(address);
    totalScore += votingPower;
    perDelegateScore.push({
      address,
      score: votingPower
    });
    process.stdout.write(".");
  }

  console.log(`Total delegated score: ${totalScore}`);
  return { totalScore, perDelegateScore };
}

// Public API methods
export const getDaoMembersCount = (): DaoMembersCountResponse => {
  const { data, lastUpdatedAt } = daoMembersManager.getData();
  return {
    daoMembersCount: data,
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

// Setup methods for startup
export const setupMetricsUpdates = (): () => void => {
  console.log("Setting up metrics updates");
  const stopDaoUpdates = daoMembersManager.setupPeriodicUpdates();
  const stopDelegatedUpdates = delegatedScoreManager.setupPeriodicUpdates();
  
  return () => {
    stopDaoUpdates();
    stopDelegatedUpdates();
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

    console.log(`** Loaded space config for ${config.snapshotSpace}: ${JSON.stringify(spaceConfig, null, 2)}`);
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