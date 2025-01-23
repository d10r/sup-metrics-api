import axios from 'axios';
import { config } from './config';

let holderCount: number = 0;

export const getHolderCount = (): number => holderCount;

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
      const response = await axios.post(config.subgraphNodeUrl, { query });

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

    console.log(`Updated holder count: ${holderCount}`);
  } catch (error) {
    console.error('Error updating holder count:', error);
  }
}; 