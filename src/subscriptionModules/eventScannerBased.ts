import { ApiPromise} from '@polkadot/api';
import { Logger, LoggerSingleton } from '../logger';
import readline from 'readline';
import {
    TransactionData, TransactionType, SubscriberConfig, Subscribable, PromClient
} from '../types';
import { Event, CodecHash } from '@polkadot/types/interfaces';
import { closeFile, delay, extractTransferInfoFromEvent, getFileNames, getSubscriptionNotificationConfig, initReadFileStream, initWriteFileStream, isBalanceTransferEvent, isDirEmpty, isDirExistent, makeDir, setIntervalFunction } from '../utils';
import { formatBalance } from '@polkadot/util/format/formatBalance'
import { ISubscriptionModule, SubscriptionModuleConstructorParams } from './ISubscribscriptionModule';
import { Notifier } from '../notifier/INotifier';
import { dataFileName, delayBeforeRetryMillis, retriesBeforeLeave, scanIntervalMillis } from '../constants';

export class EventScannerBased implements ISubscriptionModule{

    private subscriptions = new Map<string,Subscribable>()
    private readonly api: ApiPromise
    private readonly networkId: string
    private readonly notifier: Notifier
    private readonly config: SubscriberConfig
    private readonly logger: Logger = LoggerSingleton.getInstance()
    private readonly scanIntervalMillis: number
    private dataDir: string
    private dataFileName = dataFileName
    private retriesBeforeLeave: number
    private delayBeforeRetryMillis: number

    private isScanOngoing = false //lock for concurrency
    private isNewScanRequired = false
    
    constructor(params: SubscriptionModuleConstructorParams, private readonly promClient: PromClient) {
      this.api = params.api
      this.networkId = params.networkId
      this.notifier = params.notifier
      this.config = params.config
      this.dataDir = this.config.modules.transferEventScanner.dataDir
      this.scanIntervalMillis = this.config.modules.transferEventScanner.scanIntervalMillis ? this.config.modules.transferEventScanner.scanIntervalMillis : scanIntervalMillis
      this.delayBeforeRetryMillis = this.config.modules.transferEventScanner.delayBeforeRetryMillis ? this.config.modules.transferEventScanner.delayBeforeRetryMillis : delayBeforeRetryMillis
      this.retriesBeforeLeave = this.config.modules.transferEventScanner.retriesBeforeLeave ? this.config.modules.transferEventScanner.retriesBeforeLeave : retriesBeforeLeave
      
      this._initSubscriptions()
    }

    private _initSubscriptions = (): void => {
      for (const subscription of this.config.subscriptions) {
        this.subscriptions.set(subscription.address,subscription)
      }
    }

    public subscribe = async (): Promise<void> => {

      await this._initDataDir()
      this.promClient.updateScanHeight(this.networkId,await this._getLastCheckedBlock())//init prometheus metric

      await this._handleEventsSubscriptions() // scan immediately after a event detection
      this.logger.info(`Event Scanner Based Module subscribed...`)

      this._requestNewScan() //first scan after a restart

      setIntervalFunction(this.scanIntervalMillis,this._requestNewScan) //scheduled scans (i.e. every x minutes)
    }

    private _initDataDir = async (): Promise<void> =>{
      if ( ! isDirExistent(this.dataDir) ) {
        makeDir(this.dataDir)
      }

      if( isDirEmpty(this.dataDir) || !getFileNames(this.dataDir,this.logger).includes(this.dataFileName) || ! await this._getLastCheckedBlock()){
        const firstBlockToScan = this.config.modules?.transferEventScanner?.startFromBlock ? this.config.modules?.transferEventScanner?.startFromBlock : (await this.api.rpc.chain.getHeader()).number.unwrap().toNumber() // from config or current block
        const file = initWriteFileStream(this.dataDir,this.dataFileName,this.logger)
        file.write(`${firstBlockToScan}`)
        await closeFile(file)
      }
    }

    private _handleEventsSubscriptions = async (): Promise<void> => {
      this.api.query.system.events((events) => {
        events.forEach(async (record) => {
          const { event } = record;
          if(isBalanceTransferEvent(event,this.api)) await this._handleBalanceTransferEvents(event)
        })
      })
    }

    private _handleBalanceTransferEvents = async (event: Event): Promise<void> => {
      const {from,to} = extractTransferInfoFromEvent(event)
      if(this.subscriptions.has(from) || this.subscriptions.has(to)) this._requestNewScan()
    }

    private _requestNewScan = async (): Promise<void> => {
      if(this.isScanOngoing){
        /*
        A new scan can be trigger asynchronously for various reasons (see the subscribe function above). 
        To ensure an exactly once detection and delivery, only one scan is allowed at time.  
        */
        this.isNewScanRequired = true
        this.logger.info(`new scan queued...`)
      }
      else{
        try {
          do {
            this.isScanOngoing = true
            this.isNewScanRequired = false
            await this._scanForTransferEvents()
            /*
            An additional scan will be processed immediately if queued by any of the triggers.
            */
          } while (this.isNewScanRequired);
        } catch (error) {
          this.logger.error(`last SCAN had an issue !: ${error}`)
          this.logger.warn('quitting...')
          process.exit(-1);
        } finally {
          this.isScanOngoing = false
        }
      } 
    }

    // this function shouldn't be called directly, use _requestNewScan instead
    // in this way, simultaneous executions are prevented
    private _scanForTransferEvents = async (): Promise<void> => {

      const currentBlockNumber = (await this.api.rpc.chain.getHeader()).number.unwrap().toNumber()
      const lastCheckedBlock = await this._getLastCheckedBlock()
      let result = true // important to decide whether to continue the loop or not
      this.logger.info(`\n*****\nStarting a new SCAN...\nStarting Block: ${lastCheckedBlock+1}\nEnding Block: ${currentBlockNumber}\n*****`)
      for (let blockNumber = lastCheckedBlock + 1; blockNumber <= currentBlockNumber; result == true ? blockNumber++ : {} ){

        // important to decide whether to continue the loop or not
        result = true

        const blockHash = await this.api.rpc.chain.getBlockHash(blockNumber)
        const block = await this.api.rpc.chain.getBlock(blockHash)
        const allRecords = await this.api.query.system.events.at(blockHash);
        
        

        for (const [index, { hash }] of block.block.extrinsics.entries()) {
          for (const {event} of allRecords
            .filter(({ phase,event }) => 
              phase.isApplyExtrinsic &&
              phase.asApplyExtrinsic.eq(index) && 
              isBalanceTransferEvent(event,this.api)
            )) {

              let retriesBeforeLeave = this.retriesBeforeLeave
              do {
                result = await this._balanceTransferHandler(event, hash)
                if(!result){
                  retriesBeforeLeave--
                  this.logger.warn(`New retry at block ${blockNumber} !!`)
                  await delay(this.delayBeforeRetryMillis)
                }
              } while (!result && retriesBeforeLeave > 0);
          }
        }

        if(result){
          this.logger.debug(`Updated lastCheckedBlock to ${blockNumber} !!`)
          result = await this._updateLastCheckedBlock(blockNumber)
        }

        if(!result){
          // better to risk to send them all again (block) than loose one of them
          this.logger.warn(`\n*****\nSCAN had an issue at block ${blockNumber}, exiting...\n*****`)
          throw `SCAN ERROR at block ${blockNumber}`
        }
      }
      
      this.logger.info(`\n*****\nSCAN completed at block ${await this._getLastCheckedBlock()}\n*****`)
    }

    private _balanceTransferHandler = async (event: Event, extrinsicHash: CodecHash): Promise<boolean> => {
      //this.logger.debug('Balances Transfer Event Detected')
      const {from,to,amount} = extractTransferInfoFromEvent(event)

      let isNewNotificationDelivered = false
      let isNewNotificationNecessary = false

      let notificationConfigFrom: {sent: boolean; received: boolean}
      let notificationConfigTo: {sent: boolean; received: boolean} 

      if(this.subscriptions.has(from)){
        isNewNotificationNecessary = true
        const data: TransactionData = {
          name: this.subscriptions.get(from).name,
          address: from,
          networkId: this.networkId,
          txType: TransactionType.Sent,
          hash: extrinsicHash.toString(),
          amount: formatBalance(amount,{decimals:this.api.registry.chainDecimals[0]})
        };

        notificationConfigFrom = getSubscriptionNotificationConfig(this.config.modules?.transferEventScanner,this.subscriptions.get(from).transferEventScanner)
        if(notificationConfigFrom.sent){
          this.logger.info(`Balances Transfer Event from ${from} detected`)
          isNewNotificationDelivered = await this._notifyNewTransfer(data)
        }
      }

      if(this.subscriptions.has(to)){
        isNewNotificationNecessary = true
        const data: TransactionData = {
          name: this.subscriptions.get(to).name,
          address: to,
          networkId: this.networkId,
          txType: TransactionType.Received,
          hash: extrinsicHash.toString(),
          amount: formatBalance(amount,{decimals:this.api.registry.chainDecimals[0]})
        };
        
        notificationConfigTo = getSubscriptionNotificationConfig(this.config.modules?.transferEventScanner,this.subscriptions.get(to).transferEventScanner)
        if(notificationConfigTo.received){
          this.logger.info(`Balances Transfer Event to ${to} detected`)
          isNewNotificationDelivered = await this._notifyNewTransfer(data)
        }
      }

      if(isNewNotificationNecessary && !notificationConfigFrom?.sent && !notificationConfigTo?.received){
        isNewNotificationNecessary = false
        this.logger.debug(`Balances Transfer Event from ${from} to ${to} detected. Notification SUPPRESSED`)
      }
      
      return isNewNotificationDelivered || !isNewNotificationNecessary
    }
    
    private _notifyNewTransfer = async (data: TransactionData): Promise<boolean> => {
      this.logger.debug(`Delegating to the Notifier the New Transfer Event notification...`)
      this.logger.debug(JSON.stringify(data))
      return await this.notifier.newTransfer(data)
    }

    private _getLastCheckedBlock = async (): Promise<number> => {
      const file = initReadFileStream(this.dataDir,this.dataFileName,this.logger)
      const rl = readline.createInterface({
        input: file,
        crlfDelay: Infinity
      });
      
      let lastCheckedBlock: number
      for await (const line of rl) {
        // Each line in input.txt will be successively available here as `line`.
        //console.log(`Line from file: ${line}`);
        lastCheckedBlock = Number.parseInt(line)
      }
      await closeFile(file)

      return lastCheckedBlock
    }

    private _updateLastCheckedBlock = async (blockNumber: number): Promise<boolean> => {
      const file = initWriteFileStream(this.dataDir,this.dataFileName,this.logger)
      const result = file.write(blockNumber.toString())
      await closeFile(file)
      if(result) this.promClient.updateScanHeight(this.networkId,blockNumber)
      return result
    }

}
