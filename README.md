[![CircleCI](https://circleci.com/gh/w3f/polkadot-watcher-transaction.svg?style=svg)](https://circleci.com/gh/w3f/polkadot-watcher-transaction)

# polkadot-watcher-transaction

## How to Run 

### Requirements
- yarn: https://classic.yarnpkg.com/en/docs/install/

```bash
git clone https://github.com/w3f/polkadot-watcher-csv-exporter.git
cd polkadot-watcher-csv-exporter
cp config/main.sample.yaml config/main.yaml 
#just the first time

yarn
yarn build
yarn start
```

## About

The main use case of this application consits of a scanner that can be configured to start from a configured block number, and then it keeps monitoring the on-chain situation delivering alerts to a notifier. For instance, you can deliver the alerts to a matrixbot instance, which will forward the message to a Matrix/Synapse channel.

### Monitoring Features

- detection of [BalanceTransfer](https://polkadot.js.org/docs/substrate/events#transferaccountid32-accountid32-u128) events (sent to a Notifier)
- detection of account's Balance under a certain threshold (exposed as Prometheus metrics)

## Configuration

A sample config file is provided [here](/config/main.sample.yaml)

```
polkadot-watcher-transaction
├─ .circleci
│  └─ config.yml
├─ .dockerignore
├─ .eslintignore
├─ .eslintrc.js
├─ .eslintrc.json
├─ .git
│  ├─ config
│  ├─ description
│  ├─ HEAD
│  ├─ hooks
│  │  ├─ applypatch-msg.sample
│  │  ├─ commit-msg.sample
│  │  ├─ fsmonitor-watchman.sample
│  │  ├─ post-update.sample
│  │  ├─ pre-applypatch.sample
│  │  ├─ pre-commit.sample
│  │  ├─ pre-merge-commit.sample
│  │  ├─ pre-push.sample
│  │  ├─ pre-rebase.sample
│  │  ├─ pre-receive.sample
│  │  ├─ prepare-commit-msg.sample
│  │  ├─ push-to-checkout.sample
│  │  └─ update.sample
│  ├─ index
│  ├─ info
│  │  └─ exclude
│  ├─ logs
│  │  ├─ HEAD
│  │  └─ refs
│  │     ├─ heads
│  │     │  └─ master
│  │     └─ remotes
│  │        └─ origin
│  │           └─ HEAD
│  ├─ objects
│  │  ├─ info
│  │  └─ pack
│  │     ├─ pack-92f182163f1ece75ecdd6792013d871bd50a25ce.idx
│  │     └─ pack-92f182163f1ece75ecdd6792013d871bd50a25ce.pack
│  ├─ packed-refs
│  └─ refs
│     ├─ heads
│     │  └─ master
│     ├─ remotes
│     │  └─ origin
│     │     └─ HEAD
│     └─ tags
├─ .github
│  ├─ dependabot.yml
│  └─ workflows
│     ├─ dependency-review.yml
│     └─ yarn_upgrade.yml
├─ .gitignore
├─ charts
│  └─ polkadot-watcher-transaction
│     ├─ Chart.yaml
│     ├─ templates
│     │  ├─ alertrules-balance-threshold.yaml
│     │  ├─ alertrules.yaml
│     │  ├─ configmap.yaml
│     │  ├─ cronjob-pod-restart.yaml
│     │  ├─ deployment.yaml
│     │  ├─ pvc.yaml
│     │  ├─ service.yaml
│     │  └─ servicemonitor.yaml
│     └─ values.yaml
├─ Dockerfile
├─ helmfile.d
│  └─ 100-polkadot-watcher-transaction.yaml
├─ LICENSE
├─ package.json
├─ README.md
├─ scripts
│  ├─ integration-tests.sh
│  ├─ start-kind-local-registry.sh
│  └─ test_prometheus_rules.sh
├─ src
│  ├─ actions
│  │  └─ start.ts
│  ├─ constants.ts
│  ├─ gitConfigLoader
│  │  ├─ disabled.ts
│  │  ├─ gitConfigLoaderFactory.ts
│  │  ├─ gitConfigLoaderInterface.ts
│  │  ├─ gitHub1kv.ts
│  │  ├─ gitLabPrivate.ts
│  │  └─ types.ts
│  ├─ index.ts
│  ├─ logger.ts
│  ├─ notifier
│  │  ├─ disabled.ts
│  │  ├─ INotifier.ts
│  │  ├─ matrixbot.ts
│  │  └─ NotifierFactory.ts
│  ├─ prometheus
│  │  └─ alertrules.yaml
│  ├─ prometheus.ts
│  ├─ subscriber.ts
│  ├─ subscriptionModules
│  │  ├─ balanceBelowThreshold.ts
│  │  ├─ eventScannerBased.ts
│  │  └─ ISubscribscriptionModule.ts
│  ├─ types.ts
│  └─ utils.ts
├─ test
│  ├─ matrixbot.ts
│  ├─ mocks.ts
│  ├─ prometheus
│  │  └─ alertrules.yaml
│  ├─ subscriber.ts
│  └─ utils.ts
├─ tsconfig.json
└─ yarn.lock

```