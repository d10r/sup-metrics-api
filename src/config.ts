import dotenv from 'dotenv';

dotenv.config();

const required = ['BASE_RPC_URL', 'ETHEREUM_RPC_URL', 'GRAPH_NETWORK_API_KEY', 'SF_SUBGRAPH_URL', 'SUP_SUBGRAPH_URL'];
const missing = required.filter(key => !process.env[key]);
if (missing.length) throw new Error(`Missing required config: ${missing.join(', ')}`);

// default values are for the mainnet deployment
export const config = {
  tokenAddress: process.env.TOKEN_ADDRESS || '0xa69f80524381275A7fFdb3AE01c54150644c8792',
  lockerFactoryAddress: process.env.LOCKER_FACTORY_ADDRESS || '0xA6694cAB43713287F7735dADc940b555db9d39D9',
  asupAddress: process.env.ASUP_ADDRESS || '0xf55929ef5420fd4f0ba4891062eda8ed78e2ead2',
  additionalTotalScore: process.env.ADDITIONAL_TOTAL_SCORE || '0',
  baseRpcUrl: process.env.BASE_RPC_URL!,
  ethereumRpcUrl: process.env.ETHEREUM_RPC_URL!,
  epProgramManager: process.env.EP_PROGRAM_MANAGER || '0x1e32cf099992E9D3b17eDdDFFfeb2D07AED95C6a',
  graphNetworkApiKey: process.env.GRAPH_NETWORK_API_KEY!,
  sfSubgraphUrl: process.env.SF_SUBGRAPH_URL!,
  delegationSubgraphId: process.env.DELEGATION_SUBGRAPH_ID || '9qxDXD1SNnZriMMkCRVAmSdsv4KP6Xvnr8U2CRc5HQWh',
  snapshotHubUrl: process.env.SNAPSHOT_HUB_URL || 'https://hub.snapshot.org/graphql',
  snapshotScoreUrl: process.env.SNAPSHOT_SCORE_URL || 'https://score.snapshot.org/',
  snapshotSpace: process.env.SNAPSHOT_SPACE || 'superfluid.eth',
  port: parseInt(process.env.PORT || '3000', 10),
  totalDelegatedScoreUpdateInterval: parseInt(process.env.TOTAL_DELEGATED_SCORE_UPDATE_INTERVAL || '86400', 10),
  memberScoresUpdateInterval: parseInt(process.env.MEMBER_SCORES_UPDATE_INTERVAL || '86400', 10),
  scoresUpdateInterval: parseInt(process.env.SCORES_UPDATE_INTERVAL || '86400', 10),
  vpCalcChunkSize: parseInt(process.env.VP_CALC_CHUNK_SIZE || '5000', 10),
  // Distribution metrics contract addresses
  vestingFactoryAddress: process.env.VESTING_FACTORY_ADDRESS || '0x3DF8A6558073e973f4c3979138Cca836C993E285',
  stakingRewardControllerAddress: process.env.STAKING_REWARD_CONTROLLER_ADDRESS || '0xb19Ae25A98d352B36CED60F93db926247535048b',
  daoTreasuryAddress: process.env.DAO_TREASURY_ADDRESS || '0xac808840f02c47C05507f48165d2222FF28EF4e1',
  foundationTreasuryAddress: process.env.FOUNDATION_TREASURY_ADDRESS || '0xb2a19fB5C2cF21505f5dD12335Dc8B73a17FE5Ff',
  supSubgraphUrl: process.env.SUP_SUBGRAPH_URL!,
  distributionMetricsUpdateInterval: parseInt(process.env.DISTRIBUTION_METRICS_UPDATE_INTERVAL || '86400', 10),
  ethereumTokenAddress: process.env.ETHEREUM_TOKEN_ADDRESS || '0xD05001Db979ff2f1a3B2105875d3454E90dd2961',
}; 

export const stringToBytes32 = (str: string) => {
    // Convert the string to a Buffer using UTF-8 encoding
    let buffer = Buffer.from(str, 'utf8');

    // Ensure the buffer is exactly 32 bytes:
    // - If it's longer, truncate it
    // - If it's shorter, pad it with null bytes (0x00)
    if (buffer.length > 32) {
        buffer = buffer.slice(0, 32);
    } else if (buffer.length < 32) {
        const padding = Buffer.alloc(32 - buffer.length, 0); // Create a buffer of zeros
        buffer = Buffer.concat([buffer, padding]);
    }

    // Convert the buffer to a hexadecimal string and prefix with '0x'
    return '0x' + buffer.toString('hex');
}
