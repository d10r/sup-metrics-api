import { Controller, Get, Query, Route, Tags } from 'tsoa';
import { isAddress } from 'viem';
import {
  getDaoMembersCount,
  getTotalDelegatedScore,
  getVotingPower,
  getDelegateForUser
} from '../metrics';
import {
  DaoMembersCountResponse,
  TotalDelegatedScoreResponse,
  UserScoreResponse,
  UserDelegateResponse,
  ConfigResponse
} from '../types';
import { config } from '../config';

@Route('v1')
@Tags('Token Metrics')
export class MetricsController extends Controller {
  /**
   * Get the number of DAO members.<br><br>
   * 
   * This is currently calculated by counting the accounts connected to a pool.<br>
   * That's quite accurate because SUP distribution is currently taking place through distributions to lockers.<br>
   * This is close enough to reality as long as the token isn't transferrable.<br><br>
   * 
   * This metrics is periodically updated in the background. The last update timestamp is returned.
   */
  @Get('/dao_members_count')
  public getDaoMembersCount(): DaoMembersCountResponse {
    return getDaoMembersCount();
  }

  /**
   * Get the cumulated score of all delegations.<br><br>
   * 
   * This is the sum of the snapshot scores (based on the current space configuration / strategies) of all delegates.<br>
   * It is derived by first getting a list of space delegates from the delegation contract subgraph,
   * and then querying the current score for each of them from the snapshot scores API, summing them up.<br>
   * It is returned as floating point number.<br><br>
   * 
   * This metrics is periodically updated in the background. The last update timestamp is returned.
   */
  @Get('/total_delegated_score')
  public getTotalDelegatedScore(): TotalDelegatedScoreResponse {
    return getTotalDelegatedScore();
  }

  /**
   * Get the snapshot score for a specific account.<br><br>
   * 
   * This is essentially the cumulated amount a user owns (locked, unlocked or staked).<br>
   * It is derived by querying the current score for the user from the snapshot scores API.<br>
   * It is returned as floating point number.
   */
  @Get('/user_score')
  public async getUserScore(
    @Query() address: string
  ): Promise<UserScoreResponse> {
    if (!isAddress(address)) {
      throw new Error('Invalid Ethereum address');
    }
    const score = await getVotingPower(address.toLowerCase());
    return {
      score,
      timestamp: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * Get the delegate for a specific user address.<br><br>
   * 
   * This is the address of the user's delegate.<br>
   * If no delegate is set, null is returned.
   */
  @Get('/user_delegate')
  public async getUserDelegate(
    @Query() address: string
  ): Promise<UserDelegateResponse> {
    if (!isAddress(address)) {
      throw new Error('Invalid Ethereum address');
    }
    const delegate = await getDelegateForUser(address.toLowerCase());
    return {
      delegate,
      timestamp: Math.floor(Date.now() / 1000)
    };
  }

  /**
   * Get API configuration.<br><br>
   * Returns tokenAddress, snapshotSpace and snapshotHubUrl.
   */
  @Get('/config')
  public getConfig(): ConfigResponse {
    return {
      tokenAddress: config.tokenAddress,
      lockerFactoryAddress: config.lockerFactoryAddress,
      snapshotSpace: config.snapshotSpace,
      snapshotHubUrl: config.snapshotHubUrl,
    };
  }
} 