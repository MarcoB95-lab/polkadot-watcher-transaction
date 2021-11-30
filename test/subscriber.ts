import { Client, Keyring } from '@w3f/polkadot-api-client';
import { TestPolkadotRPC } from '@w3f/test-utils';
import { createLogger } from '@w3f/logger';
import { should } from 'chai';
import { Subscriber } from '../src/subscriber';
import {
  ExtrinsicMock,
    NotifierMock,
    NotifierMockBroken,
} from './mocks';
import { TransactionType } from '../src/types';
import { initClient, sendFromAToB  } from './utils';
import { isDirExistent, rmDir } from '../src/utils';
import { CodecHash } from '@polkadot/types/interfaces';

should();

let keyring: Keyring;

const dataDir = "./test/data"

const cfg = {
    logLevel: 'debug',
    port: 3000,
    endpoint: 'some_endpoint',
    matrixbot: {
        endpoint: 'some_endpoint'
    },
    subscriber: {
      modules: {
        transferEventScanner: {
          enabled: true,
          sent: true,
          received: true,
          dataDir: dataDir
        }
      },
      subscriptions: [{
            name: 'Alice',
            address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'
        },
        {
            name: 'Bob',
            address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty'
        }]
    }
};

const cfg2 = {
  ...cfg,
  subscriber: {
    ...cfg.subscriber,
    subscriptions: [{
          name: 'Alice',
          address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
          transferEventScanner: {
            sent: false,
          }
      },
      {
          name: 'Bob',
          address: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
          transferEventScanner: {
            received: false,
          }
      }]
  }
};

const logger = createLogger();

const testRPC = new TestPolkadotRPC();

const extrinsicMock = new ExtrinsicMock(logger,testRPC)

const sendFromAliceToBob = async (client?: Client): Promise<void> =>{

    if(!client){
      client = initClient(testRPC.endpoint())
    }

    await sendFromAToB('//Alice','//Bob',keyring,client)
}

const sendFromBobToAlice = async (client?: Client): Promise<void> =>{

  if(!client){
    client = initClient(testRPC.endpoint())
  }

  await sendFromAToB('//Bob','//Alice',keyring,client)
}

const checkNotifiedTransactionEvent = (expectedName: string, expectedTxType: TransactionType, nt: NotifierMock, expectedOutcome = true): void =>{
  let found = false;

  for (const data of nt.receivedTransactionEvents) {
      if (data.name === expectedName &&
          data.txType === expectedTxType) {
          found = true;
          break;
      }
  }
  if(expectedOutcome)
    found.should.be.true; 
  else
  found.should.be.false; 
}

const createCodecHash = async (client?: Client): Promise<CodecHash> =>{

  if(!client){
    client = initClient(testRPC.endpoint())
  }

  return (await client.api()).registry.createType('CodecHash')
}

describe('Subscriber, with a started new chain...', () => {
  before(async () => {
      // we are starting a chain from scratch
      if ( isDirExistent(dataDir) ) {
        rmDir(dataDir)
      }
      await testRPC.start();
      keyring = new Keyring({ type: 'sr25519' });
  });

  after(async () => {
      await testRPC.stop();
  });

  describe('with a started instance, cfg1', () => {
      let nt: NotifierMock
      let subject: Subscriber
      
      before(async () => {
          nt = new NotifierMock();
          cfg.endpoint = testRPC.endpoint();
          subject = new Subscriber(cfg, nt, logger);
          await subject.start();
      });

      describe('transactions', async () => {
          it('should notify transfer events', async () => {
              nt.resetReceivedData();

              await sendFromAliceToBob();

              checkNotifiedTransactionEvent('Alice', TransactionType.Sent, nt)
              checkNotifiedTransactionEvent('Bob', TransactionType.Received, nt)
          });
      });

      describe('transferBalancesEventHandler', async () => {
        it('is transferBalances event, our addresses are not involved so a notification is not necessary', async () => {
            const event = await extrinsicMock.generateTransferEvent('//Charlie','//Dave')

            const result = await subject["eventScannerBased"]["_balanceTransferHandler"](event,await createCodecHash())

            result.should.be.true
        });

        it('is transferBalances event 1', async () => {
            const event = await extrinsicMock.generateTransferEvent('//Alice','//Bob')

            const result = await subject["eventScannerBased"]["_balanceTransferHandler"](event,await createCodecHash())

            result.should.be.true
        });

        it('is transferBalances event 2', async () => {
          const event = await extrinsicMock.generateTransferEvent('//Bob','//Alice')

          

          const result = await subject["eventScannerBased"]["_balanceTransferHandler"](event,await createCodecHash())

          result.should.be.true
        });
      });
  });

  describe('with a started instance, cfg1, notifier Broken...', () => {
    let nt: NotifierMockBroken
    let subject: Subscriber
    
    before(async () => {
        nt = new NotifierMockBroken();
        cfg.endpoint = testRPC.endpoint();
        subject = new Subscriber(cfg, nt, logger);
        await subject.start();
    });

    describe('transferBalancesEventHandler', async () => {
      it('is transferBalances event, but the notifier is broken', async () => {
          const event = await extrinsicMock.generateTransferEvent('//Alice','//Bob')

          const result = await subject["eventScannerBased"]["_balanceTransferHandler"](event,await createCodecHash())

          result.should.be.false
      });
    });
  });

  describe('with an started instance, cfg2', () => {
    let nt: NotifierMock
    
    before(async () => {
        nt = new NotifierMock();
        const cfg = cfg2
        cfg.endpoint = testRPC.endpoint();
        const subject = new Subscriber(cfg, nt, logger);
        await subject.start();
    });

    describe('transactions', async () => {
        it('should NOT notify...', async () => {
            nt.resetReceivedData();

            await sendFromAliceToBob();
            checkNotifiedTransactionEvent('Alice', TransactionType.Sent, nt, false)
            checkNotifiedTransactionEvent('Bob', TransactionType.Received, nt, false)

            await sendFromBobToAlice();
            checkNotifiedTransactionEvent('Bob', TransactionType.Sent, nt, true)
            checkNotifiedTransactionEvent('Alice', TransactionType.Received, nt, true)
        });

    });
  });

});
