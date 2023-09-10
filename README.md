[![CircleCI](https://circleci.com/gh/w3f/polkadot-watcher-transaction.svg?style=svg)](https://circleci.com/gh/w3f/polkadot-watcher-transaction)

# polkadot-watcher-transaction

## How to Run 

Local Deployment Guide for polkadot-watcher-transaction

### Requirements

- yarn: https://classic.yarnpkg.com/en/docs/install/

**Prerequisites for Local Deployment**

Before you begin the deployment process, ensure you have the following tools and configurations set up on your system:

**Essential Tools:**

**Kubectl**: The Kubernetes command-line tool that allows you to run commands against Kubernetes clusters.
        Installation Guide - https://kubernetes.io/docs/tasks/tools/

**Minikube**: A tool that lets you run Kubernetes locally. Minikube runs a single-node Kubernetes cluster on your personal computer.
        Installation Guide - https://minikube.sigs.k8s.io/docs/start/

**Helm**: A package manager for Kubernetes, which allows you to define, install, and upgrade even the most complex Kubernetes applications.
        Installation Guide - https://helm.sh/docs/intro/install/

**For Windows Users:**

**Docker Desktop**: A platform for developing, shipping, and running applications inside containers. The Windows version provides Kubernetes support.
        Installation Guide - https://docs.docker.com/desktop/install/windows-install/

**WSL 2 (Windows Subsystem for Linux, Version 2)**: An improved version of WSL, it provides a compatibility layer for running Linux binary executables natively on Windows.
        It's recommended for a smoother experience with Docker Desktop and Kubernetes on Windows.
        Installation Guide - https://learn.microsoft.com/en-us/windows/wsl/install

Note: Ensure all tools are correctly configured and accessible from your command line or terminal. You can typically verify installations with commands like kubectl version, minikube version, and helm version.

### Guide

```bash
git clone https://github.com/MarcoB95-lab/polkadot-watcher-transaction.git
cd polkadot-watcher-transaction

yarn
yarn build

# Start a local Kubernetes cluster with minikube
minikube start

# Deploy your application (assuming you use Helm for deployment and are in the directory "polkadot-watcher-transaction")
# helm install <release-name> <path-to-your-helm-chart>
helm install polkadot charts/polkadot-watcher-transaction

# open 4 powershell terminals and start the applications to be able to access them in the browser
kubectl port-forward svc/polkadot 3000:3000 -n default
kubectl port-forward svc/polkadot-kube-prometheus-s-prometheus 9090:9090 -n default
kubectl port-forward svc/polkadot-kube-prometheus-s-alertmanager 9093:9093 -n default
kubectl port-forward svc/polkadot-grafana 3003:80 -n default
```

Now you can access your polkadot-watcher-transaction application, prometheus, alertmanager and grafana via the browser:

http://localhost:3000/metrics

http://localhost:9090/graph

http://localhost:9093/#/alerts

http://localhost:3003/login (admin:prom-operator)

## About

The main use case of this application consits of a scanner that can be configured to start from a configured block number, and then it keeps monitoring the on-chain situation delivering alerts to a notifier. For instance, you can deliver the alerts to a matrixbot instance, which will forward the message to a Matrix/Synapse channel.

### Monitoring Features

- detection of [BalanceTransfer](https://polkadot.js.org/docs/substrate/events#transferaccountid32-accountid32-u128) events (sent to a Notifier)
- detection of account's Balance under or over a certain threshold (exposed as Prometheus metrics)

## Configuration

A sample config file is provided [here](/config/main.sample.yaml)

