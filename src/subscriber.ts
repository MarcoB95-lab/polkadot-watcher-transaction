import { ApiPromise, WsProvider } from '@polkadot/api';
import { Logger } from '@w3f/logger';
import { Text } from '@polkadot/types/primitive';

import {
    InputConfig, TransactionData, TransactionType, Notifier,
} from './types';
import { Header } from '@polkadot/types/interfaces';
import Extrinsic from '@polkadot/types/extrinsic/Extrinsic';
import { isTransferBalancesExtrinsic } from './utils';

export class Subscriber {
    private chain: Text;
    private api: ApiPromise;
    private networkId: string;
    private endpoint: string;
    private logLevel: string;

    private subscriptions: Map<string,string>
    
    constructor(
        cfg: InputConfig,
        private readonly notifier: Notifier,
        private readonly logger: Logger) {
        this.endpoint = cfg.endpoint;
        this.logLevel = cfg.logLevel;

        this._initSubscriptions(cfg)
    }

    private _initSubscriptions = (cfg): void => {
      this.subscriptions = new Map<string,string>()
      for (const subscription of cfg.subscribe.transactions) {
        this.subscriptions.set(subscription.address,subscription.name)
      }
    }

    public start = async (): Promise<void> => {
        await this._initAPI();

        if(this.logLevel === 'debug') await this._triggerDebugActions()

        await this._handleNewHeadSubscriptions();

    }

    private _initAPI = async (): Promise<void> =>{
        const provider = new WsProvider(this.endpoint);
        this.api = await ApiPromise.create({ provider });
        
        this.chain = await this.api.rpc.system.chain();
        this.networkId = this.chain.toString().toLowerCase()
        const [nodeName, nodeVersion] = await Promise.all([
            this.api.rpc.system.name(),
            this.api.rpc.system.version()
        ]);
        this.logger.info(
            `You are connected to chain ${this.chain} using ${nodeName} v${nodeVersion}`
        );
    }

    private  _triggerDebugActions = async (): Promise<void> => {
      this.logger.debug('debug mode active')
    }

    private _handleNewHeadSubscriptions = async (): Promise<void> =>{

      this.api.rpc.chain.subscribeFinalizedHeads(async (header) => {
       
        await this._blocksHandler(header)

      })
    }

    private _blocksHandler = async (header: Header): Promise<void> =>{

      const hash = header.hash.toHex()
      const block = await this.api.rpc.chain.getBlock(hash)
      this.logger.debug(`block:`)
      this.logger.debug(JSON.stringify(block))

      block.block.extrinsics.forEach( async (extrinsic) => {

        this._transferBalancesExtrinsicHandler(extrinsic, hash)
  
      })

    }

    

    private _transferBalancesExtrinsicHandler = async (extrinsic: Extrinsic, blockHash: string): Promise<void> =>{

      if(!isTransferBalancesExtrinsic(extrinsic)) return
      this.logger.debug(`received new transfer balances`)

      const { signer, method: { args } } = extrinsic;
      const sender = signer.toString()
      const receiver = args[0].toString()
      const unit = args[1].toString()
      const transactionHash = extrinsic.hash.toHex()
      this.logger.debug(`\nsender: ${sender}\nreceiver: ${receiver}\nunit: ${unit}\nblockHash: ${blockHash}\ntransactionHash: ${transactionHash}`)

      if(this.subscriptions.has(sender)){
        const data: TransactionData = {
          name: this.subscriptions.get(sender),
          address: sender,
          networkId: this.networkId,
          txType: TransactionType.Sent,
          hash: transactionHash
        };

        this.logger.info(`notification to be sent:`)
        this.logger.info(JSON.stringify(data))
        this._notifyNewTransaction(data)
      }

      if(this.subscriptions.has(receiver)){
        const data: TransactionData = {
          name: this.subscriptions.get(receiver),
          address: receiver,
          networkId: this.networkId,
          txType: TransactionType.Received,
          hash: transactionHash
        };
        
        this.logger.info(`notification to be sent:`)
        this.logger.info(JSON.stringify(data))
        this._notifyNewTransaction(data)
      }
      
    }

    private _notifyNewTransaction = async (data: TransactionData): Promise<void> => {
      try {
        await this.notifier.newTransaction(data);
      } catch (e) {
          this.logger.error(`could not notify transaction: ${e.message}`);
      }
    }
 
}
