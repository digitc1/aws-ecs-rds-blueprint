#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ENV, ACCOUNTS } from '../env';
import { ApplicationStack } from '../lib/application-stack';

const app = new cdk.App();

const envName = app.node.tryGetContext('envName')??"dev"
//@ts-ignore
const accountConfig = ENV[envName]

const certificateStack = new ApplicationStack(app, 'ECS-RDS-BluePrint', {
    envName: envName,
    domainName: accountConfig.domainName,
    repositoryName: accountConfig.repositoryName,
    isProduction: accountConfig.isProduction,
    databaseName: accountConfig.databaseName,
    databaseUser: accountConfig.databaseUser,
    containerPort: accountConfig.containerPort,
    bastionStop: accountConfig.bastionStop,
    bastionStart: accountConfig.bastionStart,
    env: {
        account: accountConfig.account,
        region: accountConfig.region
    }
})