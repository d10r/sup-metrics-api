/**
 * Response for DAO members count endpoint
 */
export interface DaoMembersCountResponse {
  /** Number of DAO members */
  daoMembersCount: number;
  /** Unix timestamp of last update */
  lastUpdatedAt: number;
}

/**
 * Address with score
 */
export interface AddressScore {
  /** An address */
  address: string;
  /** A score */
  score: number;
  /** The user's delegated score (less than or equal to the total score) */
  delegatedScore: number;
  /** The number of delegations to this address */
  nrDelegations: number;
}

/**
 * Response for total delegated score endpoint
 */
export interface TotalDelegatedScoreResponse {
  /** Total delegated score */
  totalDelegatedScore: number;
  /** Unix timestamp of last update */
  lastUpdatedAt: number;
  /** Individual delegation scores by delegate address */
  perDelegateScore: AddressScore[];
}

/**
 * Response for user score endpoint
 */
export interface UserScoreResponse {
  /** User's total snapshot score */
  score: number;
  /** User's delegated score (less than or equal to the total score) */
  delegatedScore: number;
  /** Unix timestamp of the query */
  timestamp: number;
}

/**
 * Response for user delegate endpoint
 */
export interface UserDelegateResponse {
  /** Delegate's address or null if not delegated */
  delegate: string | null;
  /** Unix timestamp of the query */
  timestamp: number;
}

/**
 * Response for config endpoint
 */
export interface ConfigResponse {
  /** Token contract address for the ERC20 token */
  tokenAddress: string;
  /** Locker factory address */
  lockerFactoryAddress: string;
  /** Space identifier for Snapshot */
  snapshotSpace: string;
  /** URL for Snapshot Hub */
  snapshotHubUrl: string;
}

/**
 * Response for total score endpoint
 */
export interface TotalScoreResponse {
  /** Total score calculated from flow distributions */
  totalScore: number;
  /** Unix timestamp of the query */
  lastUpdatedAt: number;
  /** Top holders with their amount */
  //topHolders: Holder[];
}

export interface VotingPower {
  address: string;
  total: number;
  delegated: number;
}

export interface DaoMember {
  address: string;
  locker: string | null;
  votingPower: number;
  hasDelegate: string | null;
  isDelegate: DelegateInfo | null;
}

export interface DelegateInfo {
  delegatedVotingPower: number;
  nrDelegators: number;
}

export interface DaoMembersResponse {
  totalMembersCount: number;
  daoMembers: DaoMember[];
  lastUpdatedAt: number;
} 