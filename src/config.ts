import dotenv from 'dotenv';

dotenv.config();

export const config = {
  tokenAddress: process.env.TOKEN_ADDRESS || '0xa69f80524381275A7fFdb3AE01c54150644c8792',
  lockerFactoryAddress: process.env.LOCKER_FACTORY_ADDRESS || '',
  asupAddress: process.env.ASUP_ADDRESS || '',
  additionalTotalScore: process.env.ADDITIONAL_TOTAL_SCORE || '0',
  rpcUrl: process.env.RPC_URL || '',
  epProgramManager: process.env.EP_PROGRAM_MANAGER || '',
  graphNetworkApiKey: process.env.GRAPH_NETWORK_API_KEY || '',
  graphMarketApiToken: process.env.GRAPH_MARKET_API_TOKEN || '',
  sfSubgraphUrl: process.env.SF_SUBGRAPH_URL || '',
  delegationSubgraphId: process.env.DELEGATION_SUBGRAPH_ID || '',
  delegationContractAddress: process.env.DELEGATION_CONTRACT_ADDRESS || '',
  snapshotHubUrl: process.env.SNAPSHOT_HUB_URL || '',
  snapshotScoreUrl: process.env.SNAPSHOT_SCORE_URL || '',
  snapshotSpace: process.env.SNAPSHOT_SPACE || '',
  port: parseInt(process.env.PORT || '3000', 10),
  totalDelegatedScoreUpdateInterval: parseInt(process.env.TOTAL_DELEGATED_SCORE_UPDATE_INTERVAL || '86400', 10),
  memberScoresUpdateInterval: parseInt(process.env.MEMBER_SCORES_UPDATE_INTERVAL || '86400', 10),
  scoresUpdateInterval: parseInt(process.env.SCORES_UPDATE_INTERVAL || '86400', 10),
  vpCalcChunkSize: parseInt(process.env.VP_CALC_CHUNK_SIZE || '5000', 10),
  // Distribution metrics contract addresses
  vestingFactoryAddress: process.env.VESTING_FACTORY_ADDRESS || '0x3DF8A6558073e973f4c3979138Cca836C993E285',
  stakingRewardControllerAddress: process.env.STAKING_REWARD_CONTROLLER_ADDRESS || '0xb19Ae25A98d352B36CED60F93db926247535048b',
  daoTreasuryAddress: process.env.DAO_TREASURY_ADDRESS || '0xac808840f02c47C05507f48165d2222FF28EF4e1',
  foundationTreasuryAddress: process.env.FOUNDATION_TREASURY_ADDRESS || '', // Will be resolved from ENS
  supSubgraphUrl: process.env.SUP_SUBGRAPH_URL || '',
  distributionMetricsUpdateInterval: parseInt(process.env.DISTRIBUTION_METRICS_UPDATE_INTERVAL || '86400', 10),
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
