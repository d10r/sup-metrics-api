import express from 'express';
import { config } from './config';
import { getHolderCount, updateHolderCount } from './metrics';

const app = express();

app.get('/holders', (req, res) => {
  res.json({ holderCount: getHolderCount() });
});

const createPeriodicTask = (
  name: string,
  task: () => Promise<void>,
  intervalMs: number
) => {
  const runTask = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`Error during ${name}:`, error);
    } finally {
      setTimeout(runTask, intervalMs);
    }
  };
  return runTask;
};

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  
  // Start holder count updates
  const updateHolders = createPeriodicTask(
    'Update Holder Count',
    updateHolderCount,
    config.updateIntervalMs
  );
  updateHolders();
  
  // Additional periodic tasks can be started here as needed
}); 