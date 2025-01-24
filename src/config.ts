import dotenv from 'dotenv';

dotenv.config();

export const config = {
  tokenAddress: process.env.TOKEN_ADDRESS || '',
  rpcNodeUrl: process.env.RPC_NODE_URL || '',
  graphNetworkApiKey: process.env.GRAPH_NETWORK_API_KEY || '',
  sfSubgraphUrl: process.env.SF_SUBGRAPH_URL || '',
  delegationSubgraphId: process.env.DELEGATION_SUBGRAPH_ID || '',
  delegationContractAddress: process.env.DELEGATION_CONTRACT_ADDRESS || '',
  snapshotHubUrl: process.env.SNAPSHOT_HUB_URL || '',
  snapshotScoreUrl: process.env.SNAPSHOT_SCORE_URL || '',
  snapshotSpace: process.env.SNAPSHOT_SPACE || '',
  port: parseInt(process.env.PORT || '3000', 10),
  daoMembersCountUpdateInterval: parseInt(process.env.DAO_MEMBERS_COUNT_UPDATE_INTERVAL || '60', 10),
  totalDelegatedScoreUpdateInterval: parseInt(process.env.TOTAL_DELEGATED_SCORE_UPDATE_INTERVAL || '60', 10),
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
