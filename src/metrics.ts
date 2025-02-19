import axios from 'axios';
import { config } from './config';

let daoMembersCount: number = 0;
let totalDelegatedScore: number = 0;
let spaceConfig: {
  network: string;
  strategies: any[];
} | null = null;

let lastHolderUpdateAt: number = 0;
let lastDelegatedUpdateAt: number = 0;

export const getDaoMembersCount = (): { daoMembersCount: number; lastUpdatedAt: number } => ({
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

export const getTotalDelegatedScore = (): { totalDelegatedScore: number; lastUpdatedAt: number } => ({
  totalDelegatedScore,
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

    let tmpDelegates = [
      "0x4a6894Dd556fab996f8D50b521f900CAEedC168e",
      "0xeD9d0A8e0f2e588160fd219B70b846d0f32c7513",
      "0x476e2651bf97de8a26e4a05a9c8e00a6efa1390c",
      "0x3e0cf03f718520F30300266dcF4DB50bA12d3331",
      "0x95E9A0c113AA9931a4230f91AdE08A491D3f8d54",
      "0x884Ff907D5fB8BAe239B64AA8aD18bA3f8196038",
      "0x09A900eB2ff6e9AcA12d4d1a396DdC9bE0307661",
      "0xd714Dd60e22BbB1cbAFD0e40dE5Cfa7bBDD3F3C8",
      "0x869eC00FA1DC112917c781942Cc01c68521c415e",
      "0x66582D24FEaD72555adaC681Cc621caCbB208324",
      "0x02e919D2C55faeDAb3Ef919A5d62d9bCC8FE8E69",
      "0x2a81C13F9366395c8FD1EA24912294230d062Db3",
      "0x764E427020Ad72624075c61260192C6E486D15a5",
      "0x433485B5951f250cEFDCbf197Cb0F60fdBE55513",
      "0xbaD8bcc9Eb5749829cF12189fDD5c1230D6C85e8",
      "0x7a738EfFD10bF108b7617Ec8E96a0722fa54C547",
      "0x29131346d2f60595b27a3dad68a0ae8f82b99aa4",
      "0x508dd44Ff3404e618D430D4562C3773B073a5Ccc",
      "0xbdCA59f1346f6ccF05Ee0C28CE4491CdF119fb4C",
      "0x5a858FDFeb85d800753cB35b7ed254eFa7d1F8f2",
      "0xDa469A6C78D12996895721fceBA62E510b38FAf3"
    ];

    // Use hardcoded strategy with provided delegates
    spaceConfig = {
      network: space.network,
      strategies: [
        {
          name: "fountainhead",
          params: {
            tokenAddress: config.tokenAddress.toLowerCase(),
            lockerFactoryAddress: "0xA6694cAB43713287F7735dADc940b555db9d39D9".toLowerCase()
          }
        }
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

      const delegations = response.data.data.delegations;

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
    for (const address of delegateAddresses) {
      const votingPower = await getVotingPower(address);
      newTotalDelegatedScore += votingPower;
      process.stdout.write(".");
    }

    lastDelegatedUpdateAt = Math.floor(Date.now() / 1000);

    console.log(`Total delegated score: ${totalDelegatedScore}`);
    totalDelegatedScore = newTotalDelegatedScore;
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